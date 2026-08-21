import crypto from "node:crypto";
import { ApiError } from "../errors.js";
import { now, publicUser } from "../utils.js";

export function registerAuthRoutes(app, dependencies) {
  const {
    prefix, store, auth, microsoftAuth, adminContactEmail, bootstrapAdminEmail,
    schoolEmailDomain, readJson, sendError, logAction,
  } = dependencies;

  function isSchoolEmail(email) { return String(email || "").toLowerCase().endsWith(`@${schoolEmailDomain}`); }

  function findMicrosoftUser(identity) {
    return store.data.users.find((user) => user.microsoft?.homeAccountId === identity.homeAccountId)
      || store.data.users.find((user) => !user.microsoft && user.email?.toLowerCase() === identity.email);
  }

  function upsertMicrosoftUser(identity) {
    const timestamp = now();
    let user = findMicrosoftUser(identity);
    if (user) {
      user.name = identity.name;
      user.email = identity.email;
      user.microsoft = { ...identity, linkedAt: user.microsoft?.linkedAt || timestamp };
      user.updatedAt = timestamp;
      store.save();
      return { user, created: false };
    }

    const schoolAccount = isSchoolEmail(identity.email);
    const bootstrapAdmin = bootstrapAdminEmail && identity.email === bootstrapAdminEmail;
    user = {
      id: crypto.randomUUID(),
      name: identity.name,
      email: identity.email,
      schoolEmail: schoolAccount ? identity.email : "",
      requestedRole: "student",
      role: bootstrapAdmin ? "admin" : schoolAccount ? "student" : "pending",
      microsoft: { ...identity, linkedAt: timestamp },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.data.users.push(user);
    store.save();
    return { user, created: true };
  }

  app.get(`${prefix}/auth/methods`, (c) => c.json({
    methods: { microsoft: { enabled: microsoftAuth.configured } },
    accountApproval: { requiredForPersonalAccounts: true, schoolEmailDomain },
    administrator: { email: adminContactEmail, label: "Admin" },
  }));

  app.post(`${prefix}/auth/login`, async (c) => {
    const body = await readJson(c);
    const role = String(body.role || "").trim().toLowerCase();
    if (!["student", "teacher", "admin"].includes(role)) return sendError(c, 400, "INVALID_ROLE", "Role must be student, teacher or admin.", { role: "Choose student, teacher or admin." });
    const user = store.data.users.find((item) => item.role === role);
    if (!user) return sendError(c, 404, "ROLE_NOT_CONFIGURED", `No ${role} demo user is configured.`);
    const session = auth.startSession(c, user.id);
    logAction("auth.login", user, { provider: "demo" });
    return c.json({ ...session, user: publicUser(user) });
  });

  app.post(`${prefix}/auth/microsoft/start`, async (c) => c.json(await microsoftAuth.authorizationUrl()));

  app.get(`${prefix}/auth/microsoft/callback`, async (c) => {
    try {
      if (c.req.query("error")) throw new ApiError(401, "MICROSOFT_ACCESS_DENIED", "Microsoft sign-in was cancelled or denied.");
      const identity = await microsoftAuth.completeAuthorization(c.req.query("state"), c.req.query("code"));
      const { user, created } = upsertMicrosoftUser(identity);
      const exchangeCode = microsoftAuth.createSessionExchange(user.id);
      logAction(created ? "auth.microsoft.registered" : "auth.microsoft.authenticated", user);
      return c.redirect(microsoftAuth.frontendUrl({ microsoft: "success", exchangeCode }), 302);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "MICROSOFT_CALLBACK_FAILED";
      if (!(error instanceof ApiError)) console.error("Microsoft callback failed:", error);
      return c.redirect(microsoftAuth.frontendUrl({ microsoft: "error", error: code }), 302);
    }
  });

  app.post(`${prefix}/auth/microsoft/session`, async (c) => {
    const body = await readJson(c);
    const exchangeCode = typeof body.exchangeCode === "string" ? body.exchangeCode.trim() : "";
    if (!exchangeCode) return sendError(c, 400, "VALIDATION_ERROR", "The Microsoft exchange code is required.", { exchangeCode: "Provide the one-time exchange code from the callback." });
    const userId = microsoftAuth.consumeSessionExchange(exchangeCode);
    const user = store.data.users.find((item) => item.id === userId);
    if (!user) return sendError(c, 401, "ACCOUNT_NOT_FOUND", "The Microsoft account is no longer registered.");
    const session = auth.startSession(c, user.id);
    logAction("auth.login", user, { provider: "microsoft" });
    return c.json({ ...session, user: publicUser(user) });
  });

  app.post(`${prefix}/auth/logout`, (c) => {
    const authenticated = auth.authenticateCookieHeader(c.req.header("Cookie"));
    if (authenticated) logAction("auth.logout", authenticated.user);
    auth.endSession(c);
    return c.body(null, 204);
  });

  app.get(`${prefix}/me`, auth.middleware, (c) => {
    const user = c.get("user");
    const teacher = user.teacherId
      ? publicUser(store.data.users.find((item) => item.id === user.teacherId))
      : undefined;
    return c.json({ user: publicUser(user), teacher });
  });

  app.patch(`${prefix}/me/school-profile`, auth.middleware, async (c) => {
    const user = c.get("user");
    const body = await readJson(c);
    const schoolEmail = typeof body.schoolEmail === "string" ? body.schoolEmail.trim().toLowerCase() : "";
    const requestedRole = String(body.requestedRole || "student").trim().toLowerCase();
    const fields = {};
    if (!isSchoolEmail(schoolEmail)) fields.schoolEmail = `Use an email ending in @${schoolEmailDomain}.`;
    if (!["student", "teacher"].includes(requestedRole)) fields.requestedRole = "Choose student or teacher.";
    if (Object.keys(fields).length) return sendError(c, 400, "VALIDATION_ERROR", "The school profile is invalid.", fields);
    user.schoolEmail = schoolEmail;
    user.requestedRole = requestedRole;
    user.updatedAt = now();
    store.save();
    logAction("account.school_profile.updated", user, { requestedRole });
    return c.json({ user: publicUser(user) });
  });

  app.get(`${prefix}/teachers`, auth.middleware, auth.requireApproved, (c) => c.json({ teachers: store.data.users.filter((user) => user.role === "teacher").map(publicUser) }));

  app.get(`${prefix}/admin/users`, auth.middleware, auth.requireRole("admin"), (c) => {
    const role = c.req.query("role");
    if (role && !["pending", "student", "teacher", "admin"].includes(role)) return sendError(c, 400, "INVALID_ROLE", "Role must be pending, student, teacher or admin.");
    return c.json({ users: store.data.users.filter((user) => !role || user.role === role).map(publicUser) });
  });

  app.patch(`${prefix}/admin/users/:userId/role`, auth.middleware, auth.requireRole("admin"), async (c) => {
    const actor = c.get("user");
    const target = store.data.users.find((user) => user.id === c.req.param("userId"));
    if (!target) return sendError(c, 404, "USER_NOT_FOUND", "User not found.");
    const body = await readJson(c);
    const role = String(body.role || "").trim().toLowerCase();
    if (!["pending", "student", "teacher", "admin"].includes(role)) return sendError(c, 400, "INVALID_ROLE", "Role must be pending, student, teacher or admin.");
    if (target.id === actor.id && role !== "admin") return sendError(c, 409, "CANNOT_DEMOTE_SELF", "An administrator cannot remove their own admin role.");
    let teacherId;
    if (role === "student" && body.teacherId) {
      const teacher = store.data.users.find((user) => user.id === String(body.teacherId) && user.role === "teacher");
      if (!teacher) return sendError(c, 400, "INVALID_TEACHER", "The assigned teacher does not exist or is not a teacher.");
      teacherId = teacher.id;
    }
    target.role = role;
    if (role === "student") target.teacherId = teacherId || target.teacherId;
    else delete target.teacherId;
    target.updatedAt = now();
    store.save();
    if (role === "pending") auth.revokeSessionsForUser(target.id);
    logAction("account.role.updated", actor, { userId: target.id, role, teacherId: target.teacherId });
    return c.json({ user: publicUser(target) });
  });
}
