import { publicUser } from "../utils.js";

export function registerAuthRoutes(app, { prefix, store, auth, readJson, sendError, logAction }) {
  app.post(`${prefix}/auth/login`, async (c) => {
    const body = await readJson(c);
    const role = String(body.role || "").trim().toLowerCase();
    if (!["student", "teacher", "admin"].includes(role)) {
      return sendError(c, 400, "INVALID_ROLE", "Role must be student, teacher or admin.", {
        role: "Choose student, teacher or admin.",
      });
    }
    const user = store.data.users.find((item) => item.role === role);
    if (!user) return sendError(c, 404, "ROLE_NOT_CONFIGURED", `No ${role} demo user is configured.`);
    const session = auth.createSession(user.id);
    logAction("auth.login", user);
    return c.json({ ...session, user: publicUser(user) });
  });

  app.post(`${prefix}/auth/logout`, auth.middleware, (c) => {
    logAction("auth.logout", c.get("user"));
    auth.sessions.delete(c.get("token"));
    return c.body(null, 204);
  });

  app.get(`${prefix}/me`, auth.middleware, (c) => {
    const user = c.get("user");
    const teacher = user.teacherId
      ? publicUser(store.data.users.find((item) => item.id === user.teacherId))
      : undefined;
    return c.json({ user: publicUser(user), teacher });
  });

  app.get(`${prefix}/teachers`, auth.middleware, (c) => {
    return c.json({ teachers: store.data.users.filter((user) => user.role === "teacher").map(publicUser) });
  });
}
