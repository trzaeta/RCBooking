const API = "http://localhost:3001/api/v1";

async function responseError(response, fallback) {
  let message = fallback;
  try {
    const body = await response.json();
    message = body.error?.message || fallback;
  } catch {}
  const error = new Error(message);
  error.status = response.status;
  return error;
}

async function apiRequest(path, options = {}, fallback = "Request failed") {
  const response = await fetch(`${API}${path}`, { ...options, credentials: "include" });
  if (!response.ok) throw await responseError(response, fallback);
  return response.status === 204 ? null : await response.json();
}

function jsonOptions(method, body) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function getAuthMethods() { return apiRequest("/auth/methods", {}, "Failed to load sign-in methods"); }

function startMicrosoftSignIn() { return apiRequest("/auth/microsoft/start", { method: "POST" }, "Microsoft sign-in could not start"); }

function exchangeMicrosoftSession(exchangeCode) {
  return apiRequest("/auth/microsoft/session", jsonOptions("POST", { exchangeCode }), "Microsoft sign-in could not be completed");
}

function login(role) { return apiRequest("/auth/login", jsonOptions("POST", { role }), "Login failed"); }

function logout() { return apiRequest("/auth/logout", { method: "POST" }, "Logout failed"); }

function getCongresses() { return apiRequest("/congresses", {}, "Failed to load congresses"); }

function getMe() { return apiRequest("/me", {}, "Failed to get current user"); }

function getTeachers() { return apiRequest("/teachers", {}, "Failed to load teachers"); }

function getBookings() { return apiRequest("/bookings", {}, "Failed to load bookings"); }

function createBooking(teacherId, congressId, sessionIds, studentMessage) {
  return apiRequest("/bookings", jsonOptions("POST", { teacherId, congressId, sessionIds, studentMessage }), "Failed to create booking");
}

function submitBooking(bookingId) {
  return apiRequest(`/bookings/${bookingId}/submit`, { method: "POST" }, "Failed to submit booking");
}

function cancelBooking(bookingId) {
  return apiRequest(`/bookings/${bookingId}/cancel`, { method: "POST" }, "Failed to cancel booking");
}

function reviewBooking(bookingId, action, teacherComment = "") {
  return apiRequest(`/bookings/${bookingId}/review`, jsonOptions("POST", { action, teacherComment }), "Failed to review booking");
}
