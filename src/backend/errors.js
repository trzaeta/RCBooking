export class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function readJson(c) {
  try {
    const body = await c.req.json();
    if (!body || Array.isArray(body) || typeof body !== "object") {
      throw new ApiError(400, "INVALID_JSON", "The request body must be a JSON object.");
    }
    return body;
  }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

export function sendError(c, status, code, message, fields = {}) {
  return c.json({ error: { code, message, fields } }, status);
}
