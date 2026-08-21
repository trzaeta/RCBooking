import crypto from "node:crypto";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export function createAuth({ store, sessionHours, cookieName, secureCookie, sendError }) {
  const sessionLifetimeMs = sessionHours * 60 * 60 * 1000;

  function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }

  function tokenFromCookie(cookieHeader = "") {
    for (const part of cookieHeader.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue;
      try { return decodeURIComponent(part.slice(separator + 1).trim()); }
      catch { return ""; }
    }
    return "";
  }

  function sessionCookie(token, expiresAt) {
    const attributes = [
      `${cookieName}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(sessionLifetimeMs / 1000)}`,
      `Expires=${new Date(expiresAt).toUTCString()}`,
    ];
    if (secureCookie) attributes.push("Secure");
    return attributes.join("; ");
  }

  function expiredCookie() {
    const attributes = [`${cookieName}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"];
    if (secureCookie) attributes.push("Secure");
    return attributes.join("; ");
  }

  function cleanExpiredSessions() {
    const timestamp = Date.now();
    const sessions = store.data.sessions;
    const activeSessions = sessions.filter((session) => new Date(session.expiresAt).getTime() > timestamp);
    if (activeSessions.length === sessions.length) return 0;
    store.data.sessions = activeSessions;
    store.save();
    return sessions.length - activeSessions.length;
  }

  function revokeTokenHash(tokenHash) {
    if (!tokenHash) return false;
    const originalLength = store.data.sessions.length;
    store.data.sessions = store.data.sessions.filter((session) => session.tokenHash !== tokenHash);
    if (store.data.sessions.length === originalLength) return false;
    store.save();
    return true;
  }

  function revokeToken(token) { return token ? revokeTokenHash(hashToken(token)) : false; }

  function startSession(c, userId) {
    cleanExpiredSessions();
    revokeToken(tokenFromCookie(c.req.header("Cookie")));
    const token = crypto.randomBytes(32).toString("base64url");
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();
    store.data.sessions.push({ tokenHash: hashToken(token), userId, createdAt: timestamp, expiresAt, lastUsedAt: timestamp });
    store.save();
    c.header("Set-Cookie", sessionCookie(token, expiresAt));
    return { expiresAt };
  }

  function endSession(c) {
    revokeToken(tokenFromCookie(c.req.header("Cookie")));
    c.header("Set-Cookie", expiredCookie());
  }

  function userForTokenHash(tokenHash, touch = true) {
    cleanExpiredSessions();
    const session = store.data.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session) return null;
    const user = store.data.users.find((item) => item.id === session.userId);
    if (!user) {
      revokeTokenHash(tokenHash);
      return null;
    }
    if (touch) {
      session.lastUsedAt = new Date().toISOString();
      store.save();
    }
    return user;
  }

  function authenticateCookieHeader(cookieHeader, touch = true) {
    const token = tokenFromCookie(cookieHeader);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const user = userForTokenHash(tokenHash, touch);
    return user ? { user, tokenHash } : null;
  }

  function revokeSessionsForUser(userId) {
    const originalLength = store.data.sessions.length;
    store.data.sessions = store.data.sessions.filter((session) => session.userId !== userId);
    if (store.data.sessions.length !== originalLength) store.save();
  }

  async function middleware(c, next) {
    const authenticated = authenticateCookieHeader(c.req.header("Cookie"));
    if (!authenticated) return sendError(c, 401, "AUTH_REQUIRED", "A valid session cookie is required.");
    c.set("user", authenticated.user);
    c.set("sessionTokenHash", authenticated.tokenHash);
    await next();
  }

  function requireApproved(c, next) {
    if (c.get("user").role === "pending") return sendError(c, 403, "ACCOUNT_PENDING", "An administrator must approve your account before you can use RCBooking.");
    return next();
  }

  function requireRole(...roles) {
    return async (c, next) => {
      if (!roles.includes(c.get("user").role)) return sendError(c, 403, "FORBIDDEN", "You do not have permission to perform this action. Required role(s): " + roles.join(", "));
      await next();
    };
  }

  cleanExpiredSessions();
  const cleanupTimer = setInterval(cleanExpiredSessions, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  return {
    startSession, endSession, authenticateCookieHeader, userForTokenHash, revokeSessionsForUser,
    cleanExpiredSessions, middleware, requireApproved, requireRole,
    stop() { clearInterval(cleanupTimer); },
  };
}
