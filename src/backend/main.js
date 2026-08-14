import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_PREFIX, createBackend } from "./app.js";

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const backend = createBackend();
  backend.start()
    .then((address) => {
      const port = typeof address === "object" ? address.port : process.env.PORT || 3001;
      console.log(`RCBooking Hono backend: http://localhost:${port}${API_PREFIX}`);
      console.log(`WebSocket: ws://localhost:${port}/ws`);
      console.log(`Microsoft sign-in: ${backend.microsoftAuth.configured ? "configured" : "not configured"}`);
    }).catch((error) => {
      console.error("Unable to start backend:", error);
      process.exitCode = 1;
    });
}

export { API_PREFIX, createBackend };
