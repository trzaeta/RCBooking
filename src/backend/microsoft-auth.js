import crypto from "node:crypto";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { ApiError } from "./errors.js";

const AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TTL_MS = 2 * 60 * 1000;
const SCOPES = ["openid", "profile", "email"];
const STATE_VERSION = "v1";

export function createMicrosoftAuth({ config, client: injectedClient }) {
  const sessionExchanges = new Map();
  const client = injectedClient || (config.configured
    ? new ConfidentialClientApplication({ auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.authority}`, clientSecret: config.clientSecret } })
    : null);

  function requireConfiguration() { if (!config.configured || !client) throw new ApiError(503, "MICROSOFT_NOT_CONFIGURED", "Microsoft sign-in is not configured."); }

  function stateKey() { return crypto.createHash("sha256").update(`${config.clientId}\0${config.clientSecret}`).digest(); }

  function sealState(request) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", stateKey(), iv);
    cipher.setAAD(Buffer.from(`${STATE_VERSION}\0${config.redirectUri}`));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(request), "utf8"), cipher.final()]);
    return [STATE_VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
  }

  function openState(state) {
    try {
      if (typeof state !== "string") throw new Error("Missing state.");
      const [version, ivText, tagText, encryptedText, extra] = state.split(".");
      if (version !== STATE_VERSION || !ivText || !tagText || !encryptedText || extra) throw new Error("Invalid state format.");
      const decipher = crypto.createDecipheriv("aes-256-gcm", stateKey(), Buffer.from(ivText, "base64url"));
      decipher.setAAD(Buffer.from(`${STATE_VERSION}\0${config.redirectUri}`));
      decipher.setAuthTag(Buffer.from(tagText, "base64url"));
      const request = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8"));
      if (!request.nonce || !request.codeVerifier || !Number.isFinite(request.expiresAt) || request.expiresAt <= Date.now()) throw new Error("Expired or incomplete state.");
      return request;
    } catch {
      throw new ApiError(400, "INVALID_OAUTH_STATE", "The Microsoft sign-in request is invalid or expired.");
    }
  }

  function cleanExpired() {
    const timestamp = Date.now();
    for (const [code, exchange] of sessionExchanges) {
      if (exchange.expiresAt <= timestamp) sessionExchanges.delete(code);
    }
  }

  async function authorizationUrl() {
    requireConfiguration();
    cleanExpired();
    const nonce = crypto.randomBytes(32).toString("base64url");
    const codeVerifier = crypto.randomBytes(64).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const state = sealState({ nonce, codeVerifier, expiresAt: Date.now() + AUTHORIZATION_TTL_MS });
    let url;
    try {
      url = await client.getAuthCodeUrl({ scopes: SCOPES, redirectUri: config.redirectUri, responseMode: "query", prompt: "select_account", state, nonce, codeChallenge, codeChallengeMethod: "S256" });
    } catch {
      throw new ApiError(502, "MICROSOFT_UNAVAILABLE", "Microsoft sign-in is temporarily unavailable.");
    }
    return { authorizationUrl: url };
  }

  async function completeAuthorization(state, code) {
    requireConfiguration();
    cleanExpired();
    if (!code) throw new ApiError(400, "INVALID_OAUTH_STATE", "The Microsoft sign-in request is invalid or expired.");
    const request = openState(state);
    let response;
    try {
      response = await client.acquireTokenByCode({ code, scopes: SCOPES, redirectUri: config.redirectUri, codeVerifier: request.codeVerifier });
    } catch {
      throw new ApiError(401, "MICROSOFT_SIGN_IN_FAILED", "Microsoft could not complete the sign-in.");
    }
    const claims = response?.idTokenClaims || {};
    if (!claims.nonce || claims.nonce !== request.nonce) throw new ApiError(401, "INVALID_MICROSOFT_NONCE", "The Microsoft identity response could not be verified.");
    const homeAccountId = String(response.account?.homeAccountId || "").trim();
    const subject = String(claims.oid || claims.sub || "").trim();
    const tenantId = String(claims.tid || response.account?.tenantId || "consumers").trim();
    const email = String(claims.preferred_username || claims.email || response.account?.username || "")
      .trim().toLowerCase();
    if (!homeAccountId || !subject || !email) throw new ApiError(401, "MICROSOFT_IDENTITY_INCOMPLETE", "Microsoft did not return the required account identity.");
    return { provider: "microsoft", homeAccountId, subject, tenantId, email, name: String(claims.name || response.account?.name || email).trim() };
  }

  function createSessionExchange(userId) {
    cleanExpired();
    const code = crypto.randomBytes(32).toString("base64url");
    sessionExchanges.set(code, { userId, expiresAt: Date.now() + EXCHANGE_TTL_MS });
    return code;
  }

  function consumeSessionExchange(code) {
    cleanExpired();
    const exchange = sessionExchanges.get(code);
    if (!exchange) throw new ApiError(400, "INVALID_EXCHANGE_CODE", "The sign-in exchange code is invalid or expired.");
    sessionExchanges.delete(code);
    return exchange.userId;
  }

  function frontendUrl(parameters) {
    const url = new URL(config.frontendRedirect);
    for (const [name, value] of Object.entries(parameters)) if (value) url.searchParams.set(name, value);
    return url.toString();
  }

  return { configured: config.configured, authorizationUrl, completeAuthorization, createSessionExchange, consumeSessionExchange, frontendUrl };
}
