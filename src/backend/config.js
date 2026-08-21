import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(sourceDirectory);

try {
  loadEnvFile(path.join(backendDirectory, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

export const API_PREFIX = "/api/v1";
export const validbooks = new Set(["draft", "submitted", "changes_requested", "approved", "rejected", "cancelled"]);

function positiveNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }

function normalizedEmail(value) { return String(value || "").trim().toLowerCase(); }

export function readBackendConfig(options = {}) {
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(backendDirectory, "data", "database.json");
  const sessionHours = positiveNumber(options.sessionHours || process.env.SESSION_HOURS, 24);
  const sessionCookieName = String(options.sessionCookieName || process.env.SESSION_COOKIE_NAME || "rcbooking_session").trim();
  const sessionCookieSecure = options.sessionCookieSecure ?? process.env.NODE_ENV === "production";
  if (!/^[A-Za-z0-9_-]+$/.test(sessionCookieName)) throw new Error("SESSION_COOKIE_NAME may contain only letters, numbers, underscores and hyphens.");
  const allowedOrigins = new Set(
    (options.allowedOrigins || process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5500,http://localhost:5500")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const microsoft = {
    clientId: options.microsoftClientId ?? process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: options.microsoftClientSecret ?? process.env.MICROSOFT_CLIENT_SECRET ?? "",
    authority: options.microsoftAuthority ?? process.env.MICROSOFT_AUTHORITY ?? "common",
    redirectUri: options.microsoftRedirectUri ?? process.env.MICROSOFT_REDIRECT_URI ?? "http://localhost:3001/api/v1/auth/microsoft/callback",
    frontendRedirect: options.frontendAuthRedirect ?? process.env.FRONTEND_AUTH_REDIRECT ?? "http://localhost:5173/index.html",
  };
  microsoft.configured = Boolean(microsoft.clientId && microsoft.clientSecret && microsoft.redirectUri && microsoft.frontendRedirect);
  if (!/^(common|organizations|consumers|[0-9a-f-]{36})$/i.test(microsoft.authority)) throw new Error("MICROSOFT_AUTHORITY must be common, organizations, consumers or a tenant GUID.");
  for (const [name, value] of [["MICROSOFT_REDIRECT_URI", microsoft.redirectUri], ["FRONTEND_AUTH_REDIRECT", microsoft.frontendRedirect]]) {
    let url;
    try { url = new URL(value); }
    catch { throw new Error(`${name} must be an absolute URL.`); }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return {
    dataFile,
    sessionHours,
    sessionCookieName,
    sessionCookieSecure,
    allowedOrigins,
    microsoft,
    adminContactEmail: normalizedEmail(options.adminContactEmail || process.env.ADMIN_CONTACT_EMAIL || "admin@admin.com"),
    bootstrapAdminEmail: normalizedEmail(options.bootstrapAdminEmail || process.env.BOOTSTRAP_ADMIN_EMAIL),
    schoolEmailDomain: String(options.schoolEmailDomain || process.env.SCHOOL_EMAIL_DOMAIN || "nushigh.edu.sg").trim().toLowerCase().replace(/^@/, ""),
  };
}
