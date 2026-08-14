import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";
import { createAuth } from "./auth.js";
import { API_PREFIX, readBackendConfig } from "./config.js";
import { createDomain } from "./domain.js";
import { ApiError, readJson, sendError } from "./errors.js";
import { createActionLog } from "./logger.js";
import { createMicrosoftAuth } from "./microsoft-auth.js";
import { createRealtime } from "./realtime.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBookingRoutes } from "./routes/bookings.js";
import { registerCongressRoutes } from "./routes/congresses.js";
import { JsonStore } from "./store.js";
import { now } from "./utils.js";

export function createBackend(options = {}) {
  const config = readBackendConfig(options);
  const { dataFile, sessionHours, allowedOrigins, microsoft, adminContactEmail, bootstrapAdminEmail, schoolEmailDomain } = config;
  const store = new JsonStore(dataFile);
  const app = new Hono();
  const logAction = createActionLog(options.actionLogger || ((message) => console.log(message)));
  const auth = createAuth({ store, sessionHours, sendError });
  const microsoftAuth = createMicrosoftAuth({ config: microsoft, client: options.microsoftClient });
  const domain = createDomain(store);
  const realtime = createRealtime({ store, userForToken: auth.userForToken, approvedCount: domain.approvedCount });
  let serverInstance;

  function isOriginAllowed(origin) { return !origin || allowedOrigins.has("*") || allowedOrigins.has(origin); }

  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (!isOriginAllowed(origin)) return sendError(c, 403, "ORIGIN_NOT_ALLOWED", "This frontend origin is not allowed.");
    if (origin) c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  app.get(`${API_PREFIX}/health`, (c) => c.json({ status: "alive", service: "rcbooking-backend", framework: "hono", timestamp: now() }));

  const routeDependencies = { prefix: API_PREFIX, store, auth, domain, realtime, microsoftAuth, adminContactEmail, bootstrapAdminEmail, schoolEmailDomain, readJson, sendError, logAction };
  registerAuthRoutes(app, routeDependencies);
  registerCongressRoutes(app, routeDependencies);
  registerBookingRoutes(app, routeDependencies);
  app.get("/ws", realtime.upgradeMiddleware);

  app.notFound((c) => sendError(c, 404, "NOT_FOUND", `No route exists for ${c.req.method} ${c.req.path}.`));
  app.onError((error, c) => {
    if (error instanceof ApiError) return sendError(c, error.status, error.code, error.message, error.fields);
    console.error(error);
    return sendError(c, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
  });

  function start(port = Number(process.env.PORT || 3001), host = "0.0.0.0") {
    return new Promise((resolve, reject) => {
      serverInstance = createAdaptorServer({ fetch: app.fetch, websocket: { server: realtime.wss } });
      const onError = (error) => reject(error);
      serverInstance.once("error", onError);
      serverInstance.listen(port, host, () => {
        serverInstance.off("error", onError);
        realtime.startHeartbeat();
        resolve(serverInstance.address());
      });
    });
  }

  function stop() {
    realtime.stop();
    if (!serverInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
      serverInstance.close((error) => (error ? reject(error) : resolve()));
    });
  }

  return {
    app, wss: realtime.wss, store, auth, microsoftAuth, config, start, stop,
    get server() {
      return serverInstance;
    },
  };
}

export { API_PREFIX };
