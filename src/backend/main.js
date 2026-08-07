import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAdaptorServer, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocket, WebSocketServer } from "ws";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const API_PREFIX = "/api/v1";
const validbooks = new Set(["draft", "submitted", "changes_requested", "approved", "rejected", "cancelled"]);

function now() { return new Date().toISOString(); }

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function atSingaporeTime(date, hour, minute = 0) {
  const result = new Date(date);
  result.setUTCHours(hour - 8, minute, 0, 0);
  return result.toISOString();
}

function publicUser(user) { if (!user) return null; const { id, name, email, role, teacherId } = user; return { id, name, email, role, teacherId }; }

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function makeSeedData() {
  const createdAt = now();
  const congressDate = addDays(new Date(), 30);
  const teacherId = "user-teacher-1";

  return {
    users: [
      { id: "user-student-1", name: "Student", email: "student@school", role: "student", teacherId },
      { id: teacherId, name: "Teacher", email: "teacher@school", role: "teacher" },
      { id: "user-admin-1", name: "Admin", email: "admin@school", role: "admin" },
    ],
    congresses: [],
    bookings: [],
  };
}

class JsonStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    const contents = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath, "utf8").trim() : "";
    if (contents) this.data = JSON.parse(contents);
    else {
      this.data = makeSeedData();
      this.save();
    }
  }
  save() {
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
  }
}

class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function readJson(c) {
  try {
    const body = await c.req.json();
    if (!body || Array.isArray(body) || typeof body !== "object") {
      throw new ApiError(400, "INVALID_JSON", "The request body must be a JSON object.");
    }
    return body;
  }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

function createBackend(options = {}) {
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(currentDirectory, "data", "database.json");
  const sessionHours = Number(options.sessionHours || process.env.SESSION_HOURS || 8);
  const allowedOrigins = new Set(
    (options.allowedOrigins || process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const store = new JsonStore(dataFile);
  const sessions = new Map();
  const app = new Hono();
  const wss = new WebSocketServer({ noServer: true });
  const actionLogger = options.actionLogger || ((message) => console.log(message));
  let serverInstance;
  let heartbeatTimer;

  function logAction(action, user, details = {}) {
    const detailText = Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    const actor = user ? `${user.role}:${user.id}` : "system";
    actionLogger(`[RCBooking] ${now()} ${actor} ${action}${detailText ? ` ${detailText}` : ""}`);
  }

  function isOriginAllowed(origin) {
    return !origin || allowedOrigins.has("*") || allowedOrigins.has(origin);
  }

  function sendError(c, status, code, message, fields = {}) {
    return c.json({ error: { code, message, fields } }, status);
  }

  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (!isOriginAllowed(origin)) {
      return sendError(c, 403, "ORIGIN_NOT_ALLOWED", "This frontend origin is not allowed.");
    }
    if (origin) c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  function createSession(userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000).toISOString();
    sessions.set(token, { userId, expiresAt });
    return { token, expiresAt };
  }

  function userForToken(token) {
    const session = sessions.get(token);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return store.data.users.find((user) => user.id === session.userId) || null;
  }

  async function auth(c, next) {
    const header = c.req.header("Authorization") || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return sendError(c, 401, "AUTH_REQUIRED", "A Bearer token is required.");
    }
    const user = userForToken(token);
    if (!user) return sendError(c, 401, "INVALID_TOKEN", "The session is invalid or expired.");
    c.set("user", user);
    c.set("token", token);
    await next();
  }

  function requireRole(...roles) {
    return async (c, next) => {
      if (!roles.includes(c.get("user").role)) {
        return sendError(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
      }
      await next();
    };
  }

  function approvedCount(sessionId, ignoredBookingId) {
    return store.data.bookings.filter(
      (booking) =>
        booking.id !== ignoredBookingId &&
        booking.status === "approved" &&
        booking.sessionIds.includes(sessionId),
    ).length;
  }

  function congressView(congress) {
    return {
      ...congress,
      sessions: congress.sessions.map((session) => {
        const approvedBookings = approvedCount(session.id);
        return { ...session, approvedBookings, availablePlaces: Math.max(0, session.capacity - approvedBookings) };
      }),
    };
  }

  function bookingView(booking) {
    const student = store.data.users.find((user) => user.id === booking.studentId);
    const teacher = store.data.users.find((user) => user.id === booking.teacherId);
    const congress = store.data.congresses.find((item) => item.id === booking.congressId);
    if (!student || !teacher || !congress) throw new Error(`Booking ${booking.id} contains invalid references.`);
    const bookedSessions = congress.sessions.filter((session) => booking.sessionIds.includes(session.id)).map(({ id, title, startsAt, endsAt }) => ({ id, title, startsAt, endsAt }));
    return { ...booking, student: publicUser(student), teacher: publicUser(teacher), congressTitle: congress.title, sessions: bookedSessions };
  }

  function canSeeBooking(user, booking) {
    return (
      user.role === "admin" ||
      (user.role === "student" && booking.studentId === user.id) ||
      (user.role === "teacher" && booking.teacherId === user.id && booking.status !== "draft")
    );
  }

  function validateBookingSelection(congressId, sessionIds, ignoredBookingId) {
    const congress = store.data.congresses.find((item) => item.id === congressId);
    if (!congress) return { code: "CONGRESS_NOT_FOUND", message: "The selected congress does not exist." };
    if (!congress.registrationOpen) {
      return { code: "REGISTRATION_CLOSED", message: "Registration for this congress is closed." };
    }
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return { code: "SESSIONS_REQUIRED", message: "Select at least one session." };
    }
    if (new Set(sessionIds).size !== sessionIds.length) {
      return { code: "DUPLICATE_SESSION", message: "A session can only be selected once." };
    }
    const validSessionIds = new Set(congress.sessions.map((session) => session.id));
    const invalidSessionId = sessionIds.find((sessionId) => !validSessionIds.has(sessionId));
    if (invalidSessionId) {
      return { code: "INVALID_SESSION", message: `Session ${invalidSessionId} is not part of this congress.` };
    }
    const fullSession = congress.sessions.find(
      (session) => sessionIds.includes(session.id) && approvedCount(session.id, ignoredBookingId) >= session.capacity,
    );
    if (fullSession) {
      return { code: "SESSION_FULL", message: `${fullSession.title} has reached its capacity.` };
    }
    return null;
  }

  function envelope(event, data) {
    return JSON.stringify({ id: crypto.randomUUID(), event, timestamp: now(), data });
  }

  function sendSocket(ws, event, data) {
    if (ws.readyState === WebSocket.OPEN) ws.send(envelope(event, data));
  }

  function broadcastWhere(predicate, event, data) {
    for (const client of wss.clients) {
      if (client.user && client.readyState === WebSocket.OPEN && predicate(client.user)) {
        sendSocket(client, event, data);
      }
    }
  }

  function broadcastToUsers(userIds, event, data) {
    const recipients = new Set(userIds.filter(Boolean));
    broadcastWhere((user) => recipients.has(user.id) || user.role === "admin", event, data);
  }

  function broadcastCapacity(congressId, sessionIds) {
    const congress = store.data.congresses.find((item) => item.id === congressId);
    if (!congress) return;
    for (const sessionId of sessionIds) {
      const session = congress.sessions.find((item) => item.id === sessionId);
      if (!session) continue;
      const count = approvedCount(sessionId);
      broadcastWhere(() => true,"session.capacity.updated",{congressId,sessionId,approvedBookings: count,availablePlaces: Math.max(0, session.capacity - count),},);
    }
  }

  app.get(`${API_PREFIX}/health`, (c) => {
    return c.json({ status: "alive", service: "rcbooking-backend", framework: "hono", timestamp: now() });
  });

  app.post(`${API_PREFIX}/auth/login`, async (c) => {
    const body = await readJson(c);
    const role = String(body.role || "").trim().toLowerCase();
    if (!["student", "teacher", "admin"].includes(role)) {
      return sendError(c, 400, "INVALID_ROLE", "Role must be student, teacher or admin.", {
        role: "Choose student, teacher or admin.",
      });
    }
    const user = store.data.users.find((item) => item.role === role);
    if (!user) return sendError(c, 404, "ROLE_NOT_CONFIGURED", `No ${role} demo user is configured.`);
    const session = createSession(user.id);
    logAction("auth.login", user);
    return c.json({ ...session, user: publicUser(user) });
  });

  app.post(`${API_PREFIX}/auth/logout`, auth, (c) => {
    logAction("auth.logout", c.get("user"));
    sessions.delete(c.get("token"));
    return c.body(null, 204);
  });

  app.get(`${API_PREFIX}/me`, auth, (c) => {
    const user = c.get("user");
    const teacher = user.teacherId
      ? publicUser(store.data.users.find((item) => item.id === user.teacherId))
      : undefined;
    return c.json({ user: publicUser(user), teacher });
  });

  app.get(`${API_PREFIX}/teachers`, auth, (c) => {
    return c.json({ teachers: store.data.users.filter((user) => user.role === "teacher").map(publicUser) });
  });

  app.get(`${API_PREFIX}/congresses`, auth, (c) => {
    return c.json({ congresses: store.data.congresses.map(congressView) });
  });

  app.get(`${API_PREFIX}/congresses/:congressId`, auth, (c) => {
    const congress = store.data.congresses.find((item) => item.id === c.req.param("congressId"));
    if (!congress) return sendError(c, 404, "CONGRESS_NOT_FOUND", "Congress not found.");
    return c.json({ congress: congressView(congress) });
  });

  app.post(`${API_PREFIX}/congresses`, auth, requireRole("admin"), async (c) => {
    const body = await readJson(c);
    const { title, description = "", venue = "", startsAt, endsAt, registrationOpen = true } = body;
    if (!title || !startsAt || !endsAt) {
      return sendError(c, 400, "VALIDATION_ERROR", "Title, start time and end time are required.");
    }
    const parsedStart = parseDate(startsAt);
    const parsedEnd = parseDate(endsAt);
    if (!parsedStart || !parsedEnd) {
      return sendError(c, 400, "INVALID_DATE", "Start and end times must be valid ISO 8601 dates.");
    }
    if (parsedStart.getTime() >= parsedEnd.getTime()) {
      return sendError(c, 400, "INVALID_TIME_RANGE", "The congress end time must be after its start time.");
    }
    const timestamp = now();
    const congress = { id: crypto.randomUUID(), title: String(title).trim(), description: String(description).trim(), venue: String(venue).trim(), startsAt: parsedStart.toISOString(), endsAt: parsedEnd.toISOString(), registrationOpen: Boolean(registrationOpen), sessions: [], createdAt: timestamp, updatedAt: timestamp };
    store.data.congresses.push(congress);
    store.save();
    logAction("congress.created", c.get("user"), { congressId: congress.id });
    return c.json({ congress: congressView(congress) }, 201);
  });

  app.patch(`${API_PREFIX}/congresses/:congressId`, auth, requireRole("admin"), async (c) => {
    const congress = store.data.congresses.find((item) => item.id === c.req.param("congressId"));
    if (!congress) return sendError(c, 404, "CONGRESS_NOT_FOUND", "Congress not found.");
    const body = await readJson(c);
    const allowed = ["title", "description", "venue", "startsAt", "endsAt", "registrationOpen"];
    const proposed = { ...congress };
    for (const key of allowed) {
      if (body[key] !== undefined) proposed[key] = body[key];
    }
    const parsedStart = parseDate(proposed.startsAt);
    const parsedEnd = parseDate(proposed.endsAt);
    if (!parsedStart || !parsedEnd) {
      return sendError(c, 400, "INVALID_DATE", "Start and end times must be valid ISO 8601 dates.");
    }
    if (parsedStart.getTime() >= parsedEnd.getTime()) {
      return sendError(c, 400, "INVALID_TIME_RANGE", "The congress end time must be after its start time.");
    }
    Object.assign(congress, proposed, { startsAt: parsedStart.toISOString(), endsAt: parsedEnd.toISOString() });
    congress.updatedAt = now();
    store.save();
    logAction("congress.updated", c.get("user"), { congressId: congress.id });
    return c.json({ congress: congressView(congress) });
  });

  app.post(`${API_PREFIX}/congresses/:congressId/sessions`, auth, requireRole("admin"), async (c) => {
    const congress = store.data.congresses.find((item) => item.id === c.req.param("congressId"));
    if (!congress) return sendError(c, 404, "CONGRESS_NOT_FOUND", "Congress not found.");
    const body = await readJson(c);
    const { title, description = "", startsAt, endsAt, capacity } = body;
    const numericCapacity = Number(capacity);
    if (!title || !startsAt || !endsAt || !Number.isInteger(numericCapacity) || numericCapacity < 1) {
      return sendError(c, 400, "VALIDATION_ERROR", "Title, valid times and a positive whole-number capacity are required.");
    }
    const parsedStart = parseDate(startsAt);
    const parsedEnd = parseDate(endsAt);
    if (!parsedStart || !parsedEnd) {
      return sendError(c, 400, "INVALID_DATE", "Start and end times must be valid ISO 8601 dates.");
    }
    if (parsedStart.getTime() >= parsedEnd.getTime()) {
      return sendError(c, 400, "INVALID_TIME_RANGE", "The session end time must be after its start time.");
    }
    const session = { id: crypto.randomUUID(), title: String(title).trim(), description: String(description).trim(), startsAt: parsedStart.toISOString(), endsAt: parsedEnd.toISOString(), capacity: numericCapacity };
    congress.sessions.push(session);
    congress.updatedAt = now();
    store.save();
    logAction("session.created", c.get("user"), { congressId: congress.id, sessionId: session.id, capacity: session.capacity });
    return c.json({ session: { ...session, approvedBookings: 0, availablePlaces: numericCapacity } }, 201);
  });

  app.get(`${API_PREFIX}/bookings`, auth, (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    if (status && !validbooks.has(status)) {
      return sendError(c, 400, "INVALID_STATUS", "The requested booking status is invalid.");
    }
    const bookings = store.data.bookings
      .filter((booking) => canSeeBooking(user, booking))
      .filter((booking) => !status || booking.status === status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(bookingView);
    return c.json({ bookings });
  });

  app.get(`${API_PREFIX}/bookings/:bookingId`, auth, (c) => {
    const user = c.get("user");
    const booking = store.data.bookings.find((item) => item.id === c.req.param("bookingId"));
    if (!booking || !canSeeBooking(user, booking)) {
      return sendError(c, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    }
    return c.json({ booking: bookingView(booking) });
  });

  app.post(`${API_PREFIX}/bookings`, auth, requireRole("student"), async (c) => {
    const user = c.get("user");
    const body = await readJson(c);
    const congressId = String(body.congressId || "");
    const sessionIds = Array.isArray(body.sessionIds) ? body.sessionIds.map(String) : [];
    const selectionError = validateBookingSelection(congressId, sessionIds);
    if (selectionError) return sendError(c, 400, selectionError.code, selectionError.message);
    if (!user.teacherId) {
      return sendError(c, 409, "TEACHER_NOT_ASSIGNED", "Ask an administrator to assign you to a teacher.");
    }
    const existing = store.data.bookings.find(
      (booking) =>
        booking.studentId === user.id &&
        booking.congressId === congressId &&
        !["rejected", "cancelled"].includes(booking.status),
    );
    if (existing) {
      return sendError(c, 409, "BOOKING_ALREADY_EXISTS", "You already have an active booking for this congress.");
    }
    const timestamp = now();
    const booking = { id: crypto.randomUUID(), studentId: user.id, teacherId: user.teacherId, congressId, sessionIds, status: "draft", studentMessage: String(body.studentMessage || "").trim(), teacherComment: "", createdAt: timestamp, updatedAt: timestamp };
    store.data.bookings.push(booking);
    store.save();
    logAction("booking.created", user, { bookingId: booking.id, congressId: booking.congressId, sessionCount: booking.sessionIds.length });
    return c.json({ booking: bookingView(booking) }, 201);
  });

  app.patch(`${API_PREFIX}/bookings/:bookingId`, auth, requireRole("student"), async (c) => {
    const user = c.get("user");
    const booking = store.data.bookings.find(
      (item) => item.id === c.req.param("bookingId") && item.studentId === user.id,
    );
    if (!booking) return sendError(c, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    if (!["draft", "changes_requested"].includes(booking.status)) {
      return sendError(c, 409, "BOOKING_NOT_EDITABLE", "Only draft bookings or requested changes can be edited.");
    }
    const body = await readJson(c);
    const sessionIds = body.sessionIds === undefined
      ? booking.sessionIds
      : Array.isArray(body.sessionIds)
        ? body.sessionIds.map(String)
        : [];
    const selectionError = validateBookingSelection(booking.congressId, sessionIds, booking.id);
    if (selectionError) return sendError(c, 400, selectionError.code, selectionError.message);
    booking.sessionIds = sessionIds;
    if (body.studentMessage !== undefined) booking.studentMessage = String(body.studentMessage).trim();
    booking.updatedAt = now();
    store.save();
    logAction("booking.updated", user, { bookingId: booking.id, sessionCount: booking.sessionIds.length });
    return c.json({ booking: bookingView(booking) });
  });

  app.post(`${API_PREFIX}/bookings/:bookingId/submit`, auth, requireRole("student"), (c) => {
    const user = c.get("user");
    const booking = store.data.bookings.find(
      (item) => item.id === c.req.param("bookingId") && item.studentId === user.id,
    );
    if (!booking) return sendError(c, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    if (!["draft", "changes_requested"].includes(booking.status)) {
      return sendError(c, 409, "BOOKING_NOT_SUBMITTABLE", "This booking cannot be submitted in its current state.");
    }
    const selectionError = validateBookingSelection(booking.congressId, booking.sessionIds, booking.id);
    if (selectionError) return sendError(c, 409, selectionError.code, selectionError.message);
    booking.status = "submitted";
    booking.submittedAt = now();
    booking.updatedAt = booking.submittedAt;
    store.save();
    logAction("booking.submitted", user, { bookingId: booking.id, teacherId: booking.teacherId });
    const view = bookingView(booking);
    broadcastToUsers([booking.teacherId], "booking.submitted", { booking: view });
    broadcastToUsers(
      [booking.teacherId],
      "notification.created",
      { id: crypto.randomUUID(), message: `${view.student.name} submitted a booking request.`, bookingId: booking.id },
    );
    return c.json({ booking: view });
  });

  app.post(`${API_PREFIX}/bookings/:bookingId/review`, auth, requireRole("teacher", "admin"), async (c) => {
    const user = c.get("user");
    const booking = store.data.bookings.find((item) => item.id === c.req.param("bookingId"));
    if (!booking || (user.role === "teacher" && booking.teacherId !== user.id)) {
      return sendError(c, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    }
    if (booking.status !== "submitted") {
      return sendError(c, 409, "BOOKING_NOT_REVIEWABLE", "Only submitted bookings can be reviewed.");
    }
    const body = await readJson(c);
    const action = String(body.action || "");
    const statuses = { approve: "approved", reject: "rejected", request_changes: "changes_requested" };
    const newStatus = statuses[action];
    if (!newStatus) {
      return sendError(c, 400, "INVALID_REVIEW_ACTION", "Use approve, reject or request_changes.");
    }
    const teacherComment = String(body.teacherComment || "").trim();
    if (["reject", "request_changes"].includes(action) && !teacherComment) {
      return sendError(c, 400, "COMMENT_REQUIRED", "Add a comment explaining the decision.");
    }
    if (newStatus === "approved") {
      const selectionError = validateBookingSelection(booking.congressId, booking.sessionIds, booking.id);
      if (selectionError) return sendError(c, 409, selectionError.code, selectionError.message);
    }
    booking.status = newStatus;
    booking.teacherComment = teacherComment;
    booking.reviewedAt = now();
    booking.updatedAt = booking.reviewedAt;
    store.save();
    logAction("booking.reviewed", user, { bookingId: booking.id, studentId: booking.studentId, result: newStatus });
    const view = bookingView(booking);
    broadcastToUsers([booking.studentId, booking.teacherId], "booking.status.updated", { booking: view });
    broadcastToUsers(
      [booking.studentId],
      "notification.created",
      { id: crypto.randomUUID(), message: `Your booking was ${newStatus.replace("_", " ")}.`, bookingId: booking.id },
    );
    if (newStatus === "approved") broadcastCapacity(booking.congressId, booking.sessionIds);
    return c.json({ booking: view });
  });

  app.post(`${API_PREFIX}/bookings/:bookingId/cancel`, auth, (c) => {
    const user = c.get("user");
    const booking = store.data.bookings.find((item) => item.id === c.req.param("bookingId"));
    const mayCancel = booking && (user.role === "admin" || (user.role === "student" && booking.studentId === user.id));
    if (!mayCancel) return sendError(c, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    if (["cancelled", "rejected"].includes(booking.status)) {
      return sendError(c, 409, "BOOKING_NOT_CANCELLABLE", "This booking cannot be cancelled.");
    }
    const previousStatus = booking.status;
    const wasApproved = previousStatus === "approved";
    booking.status = "cancelled";
    booking.updatedAt = now();
    store.save();
    logAction("booking.cancelled", user, { bookingId: booking.id, previousStatus });
    const view = bookingView(booking);
    broadcastToUsers([booking.studentId, booking.teacherId], "booking.cancelled", { booking: view });
    if (wasApproved) broadcastCapacity(booking.congressId, booking.sessionIds);
    return c.json({ booking: view });
  });

  app.get(
    "/ws",
    upgradeWebSocket(() => {
      let authTimer;
      return {
        onOpen(_event, socket) {
          const ws = socket.raw;ws.isAlive = true;ws.on("pong", () => {ws.isAlive = true;});
          authTimer = setTimeout(() => {if (!ws.user) ws.close(4401, "Authentication required");}, 5000);
        },

        onMessage(event, socket) {
          const ws = socket.raw;
          let message;
          try {
            const value = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
            message = JSON.parse(value);
          }
          catch {
            sendSocket(ws, "socket.error", { code: "INVALID_JSON", message: "Message must contain valid JSON." });
            return;
          }

          if (!ws.user) {
            if (message.event !== "auth" || !message.data?.token) {
              sendSocket(ws, "socket.error", { code: "AUTH_REQUIRED", message: "Send the auth event first." });
              return;
            }
            const user = userForToken(message.data.token);
            if (!user) {
              sendSocket(ws, "socket.error", { code: "INVALID_TOKEN", message: "The session is invalid or expired." });
              ws.close(4401, "Invalid token");
              return;
            }
            ws.user = user;
            ws.token = message.data.token;
            clearTimeout(authTimer);
            sendSocket(ws, "connection.ready", { user: publicUser(user) });
            return;
          }

          if (message.event === "ping") {
            sendSocket(ws, "pong", { timestamp: now() });
          }
          else {
            sendSocket(ws, "socket.error", { code: "UNKNOWN_EVENT", message: `Unknown event: ${message.event}` });
          }
        },
        onClose() {
          clearTimeout(authTimer);
        },
        onError(error) {
          console.error("WebSocket error:", error);
        },
      };
    }),
  );

  app.notFound((c) => sendError(c, 404, "NOT_FOUND", `No route exists for ${c.req.method} ${c.req.path}.`));
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return sendError(c, error.status, error.code, error.message, error.fields);
    }
    console.error(error);
    return sendError(c, 500, "INTERNAL_ERROR", "wtf an unexpected server error occurred.");
  });
  function start(port = Number(process.env.PORT || 3001), host = "0.0.0.0") {
    return new Promise((resolve, reject) => {
      serverInstance = createAdaptorServer({ fetch: app.fetch, websocket: { server: wss } });
      const onError = (error) => reject(error);
      serverInstance.once("error", onError);
      serverInstance.listen(port, host, () => {
        serverInstance.off("error", onError);
        heartbeatTimer = setInterval(() => {
          for (const client of wss.clients) {
            if (client.user && !userForToken(client.token)) {
              client.close(4401, "Session expired");
              continue;
            }
            if (!client.isAlive) {
              client.terminate();
              continue;
            }
            client.isAlive = false;
            client.ping();
          }
        }, 30000);
        resolve(serverInstance.address());
      });
    });
  }
  function stop() {
    clearInterval(heartbeatTimer);
    for (const client of wss.clients) client.terminate();
    if (!serverInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
      serverInstance.close((error) => (error ? reject(error) : resolve()));
    });
  }
  return {app,wss,store,start,stop,
    get server() {
      return serverInstance;
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const backend = createBackend();
  backend.start()
    .then((address) => {
      const port = typeof address === "object" ? address.port : process.env.PORT || 3001;
      console.log(`RCBooking Hono backend: http://localhost:${port}${API_PREFIX}`);
      console.log(`WebSocket: ws://localhost:${port}/ws`);
    }).catch((error) => {
      console.error("Unable to start backend aaa:", error);
      process.exitCode = 1;
    });
}
export { API_PREFIX, createBackend };
