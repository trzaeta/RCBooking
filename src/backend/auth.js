import crypto from "node:crypto";

export function createAuth({ store, sessionHours, sendError }) {
  const sessions = new Map();

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

  async function middleware(c, next) {
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
        return sendError(c, 403, "FORBIDDEN", "You do not have permission to perform this action. Required role(s): " + roles.join(", "));
      }
      await next();
    };
  }

  return { sessions, createSession, userForToken, middleware, requireRole };
}
