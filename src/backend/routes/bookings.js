import crypto from "node:crypto";
import { validbooks } from "../config.js";
import { now } from "../utils.js";

export function registerBookingRoutes(app, dependencies) {
  const { prefix, store, auth, domain, realtime, readJson, sendError, logAction } = dependencies;

  app.get(`${prefix}/bookings`, auth.middleware, (c) => {
    const user = c.get("user");
    const status = c.req.query("status");
    if (status && !validbooks.has(status)) {
      return sendError(c, 400, "INVALID_STATUS", "The requested booking status is invalid.");
    }
    const bookings = store.data.bookings
      .filter((booking) => domain.canSeeBooking(user, booking))
      .filter((booking) => !status || booking.status === status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(domain.bookingView);
    return c.json({ bookings });
  });

  app.get(`${prefix}/bookings/:bookingId`, auth.middleware, (c) => {
    const user = c.get("user");
    const booking = store.data.bookings.find((item) => item.id === c.req.param("bookingId"));
    if (!booking || !domain.canSeeBooking(user, booking)) {
      return sendError(c, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    }
    return c.json({ booking: domain.bookingView(booking) });
  });

  app.post(`${prefix}/bookings`, auth.middleware, auth.requireRole("student"), async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const teacherId = String(body.teacherId || "");
  const congressId = String(body.congressId || "");
  const sessionIds = Array.isArray(body.sessionIds)
    ? body.sessionIds.map(String)
    : [];

  const selectionError = domain.validateBookingSelection(congressId, sessionIds);
  if (selectionError) {
    return sendError(c, 400, selectionError.code, selectionError.message);
  }

  const teacher = store.data.users.find(
    (item) => item.id === teacherId && item.role === "teacher"
  );

  if (!teacher) {
    return sendError(
      c,
      400,
      "INVALID_TEACHER",
      "The selected teacher does not exist."
    );
  }

  const existing = store.data.bookings.find(
    (booking) =>
      booking.studentId === user.id &&
      booking.congressId === congressId &&
      !["rejected", "cancelled"].includes(booking.status),
  );

  if (existing) {
    return sendError(
      c,
      409,
      "BOOKING_ALREADY_EXISTS",
      "You already have an active booking for this congress."
    );
  }

  const timestamp = now();

  const booking = {
    id: crypto.randomUUID(),
    studentId: user.id,
    teacherId,
    congressId,
    sessionIds,
    status: "draft",
    studentMessage: String(body.studentMessage || "").trim(),
    teacherComment: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.data.bookings.push(booking);
  store.save();

  logAction("booking.created", user, {
    bookingId: booking.id,
    congressId: booking.congressId,
    sessionCount: booking.sessionIds.length,
  });

  return c.json({ booking: domain.bookingView(booking) }, 201);
});

  app.patch(`${prefix}/bookings/:bookingId`, auth.middleware, auth.requireRole("student"), async (c) => {
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
    const selectionError = domain.validateBookingSelection(booking.congressId, sessionIds, booking.id);
    if (selectionError) return sendError(c, 400, selectionError.code, selectionError.message);
    booking.sessionIds = sessionIds;
    if (body.studentMessage !== undefined) booking.studentMessage = String(body.studentMessage).trim();
    booking.updatedAt = now();
    store.save();
    logAction("booking.updated", user, { bookingId: booking.id, sessionCount: booking.sessionIds.length });
    return c.json({ booking: domain.bookingView(booking) });
  });

  app.post(`${prefix}/bookings/:bookingId/submit`, auth.middleware, auth.requireRole("student"), (c) => {
    const user = c.get("user");
    const booking = store.data.bookings.find(
      (item) => item.id === c.req.param("bookingId") && item.studentId === user.id,
    );
    if (!booking) return sendError(c, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    if (!["draft", "changes_requested"].includes(booking.status)) {
      return sendError(c, 409, "BOOKING_NOT_SUBMITTABLE", "This booking cannot be submitted in its current state.");
    }
    const selectionError = domain.validateBookingSelection(booking.congressId, booking.sessionIds, booking.id);
    if (selectionError) return sendError(c, 409, selectionError.code, selectionError.message);
    booking.status = "submitted";
    booking.submittedAt = now();
    booking.updatedAt = booking.submittedAt;
    store.save();
    logAction("booking.submitted", user, { bookingId: booking.id, teacherId: booking.teacherId });
    const view = domain.bookingView(booking);
    realtime.broadcastToUsers([booking.teacherId], "booking.submitted", { booking: view });
    realtime.broadcastToUsers(
      [booking.teacherId],
      "notification.created",
      { id: crypto.randomUUID(), message: `${view.student.name} submitted a booking request.`, bookingId: booking.id },
    );
    return c.json({ booking: view });
  });

  app.post(`${prefix}/bookings/:bookingId/review`, auth.middleware, auth.requireRole("teacher", "admin"), async (c) => {
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
      const selectionError = domain.validateBookingSelection(booking.congressId, booking.sessionIds, booking.id);
      if (selectionError) return sendError(c, 409, selectionError.code, selectionError.message);
    }
    booking.status = newStatus;
    booking.teacherComment = teacherComment;
    booking.reviewedAt = now();
    booking.updatedAt = booking.reviewedAt;
    store.save();
    logAction("booking.reviewed", user, { bookingId: booking.id, studentId: booking.studentId, result: newStatus });
    const view = domain.bookingView(booking);
    realtime.broadcastToUsers([booking.studentId, booking.teacherId], "booking.status.updated", { booking: view });
    realtime.broadcastToUsers(
      [booking.studentId],
      "notification.created",
      { id: crypto.randomUUID(), message: `Your booking was ${newStatus.replace("_", " ")}.`, bookingId: booking.id },
    );
    if (newStatus === "approved") realtime.broadcastCapacity(booking.congressId, booking.sessionIds);
    return c.json({ booking: view });
  });

  app.post(`${prefix}/bookings/:bookingId/cancel`, auth.middleware, (c) => {
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
    const view = domain.bookingView(booking);
    realtime.broadcastToUsers([booking.studentId, booking.teacherId], "booking.cancelled", { booking: view });
    if (wasApproved) realtime.broadcastCapacity(booking.congressId, booking.sessionIds);
    return c.json({ booking: view });
  });
}
