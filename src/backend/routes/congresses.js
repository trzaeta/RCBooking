import crypto from "node:crypto";
import { now, parseDate } from "../utils.js";

export function registerCongressRoutes(app, { prefix, store, auth, domain, readJson, sendError, logAction }) {
  app.get(`${prefix}/congresses`, auth.middleware, (c) => {
    return c.json({ congresses: store.data.congresses.map(domain.congressView) });
  });

  app.get(`${prefix}/congresses/:congressId`, auth.middleware, (c) => {
    const congress = store.data.congresses.find((item) => item.id === c.req.param("congressId"));
    if (!congress) return sendError(c, 404, "CONGRESS_NOT_FOUND", "Congress not found.");
    return c.json({ congress: domain.congressView(congress) });
  });

  app.post(`${prefix}/congresses`, auth.middleware, auth.requireRole("admin"), async (c) => {
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
    const congress = {
      id: crypto.randomUUID(), title: String(title).trim(), description: String(description).trim(),
      venue: String(venue).trim(), startsAt: parsedStart.toISOString(), endsAt: parsedEnd.toISOString(),
      registrationOpen: Boolean(registrationOpen), sessions: [], createdAt: timestamp, updatedAt: timestamp,
    };
    store.data.congresses.push(congress);
    store.save();
    logAction("congress.created", c.get("user"), { congressId: congress.id });
    return c.json({ congress: domain.congressView(congress) }, 201);
  });

  app.patch(`${prefix}/congresses/:congressId`, auth.middleware, auth.requireRole("admin"), async (c) => {
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
    return c.json({ congress: domain.congressView(congress) });
  });

  app.post(`${prefix}/congresses/:congressId/sessions`, auth.middleware, auth.requireRole("admin"), async (c) => {
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
    const session = {
      id: crypto.randomUUID(), title: String(title).trim(), description: String(description).trim(),
      startsAt: parsedStart.toISOString(), endsAt: parsedEnd.toISOString(), capacity: numericCapacity,
    };
    congress.sessions.push(session);
    congress.updatedAt = now();
    store.save();
    logAction("session.created", c.get("user"), {
      congressId: congress.id, sessionId: session.id, capacity: session.capacity,
    });
    return c.json({ session: { ...session, approvedBookings: 0, availablePlaces: numericCapacity } }, 201);
  });
}
