import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(sourceDirectory);

export const API_PREFIX = "/api/v1";
export const validbooks = new Set(["draft", "submitted", "changes_requested", "approved", "rejected", "cancelled"]);

export function readBackendConfig(options = {}) {
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(backendDirectory, "data", "database.json");
  const sessionHours = Number(options.sessionHours || process.env.SESSION_HOURS || 8);
  const allowedOrigins = new Set(
    (options.allowedOrigins || process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  return { dataFile, sessionHours, allowedOrigins };
}
