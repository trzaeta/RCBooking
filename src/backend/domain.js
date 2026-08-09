import { publicUser } from "./utils.js";

export function createDomain(store) {
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
    const bookedSessions = congress.sessions
      .filter((session) => booking.sessionIds.includes(session.id))
      .map(({ id, title, startsAt, endsAt }) => ({ id, title, startsAt, endsAt }));
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
    if (fullSession) return { code: "SESSION_FULL", message: `${fullSession.title} has reached its capacity.` };
    return null;
  }

  return { approvedCount, congressView, bookingView, canSeeBooking, validateBookingSelection };
}
