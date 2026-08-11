const API = "http://localhost:3001/api/v1";

async function login(role) {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ role })
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return await response.json();
}

async function getCongresses(token) {
  const response = await fetch(`${API}/congresses`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to load congresses");
  }

  return await response.json();
}

async function getMe(token) {
  const response = await fetch(`${API}/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to get current user");
  }

  return await response.json();
}

async function getTeachers(token) {
  const response = await fetch(`${API}/teachers`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();

    throw new Error(
      error.error?.message || "Failed to load teachers"
    );
  }

  return await response.json();
}

async function getBookings(token) {
  const response = await fetch(`${API}/bookings`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to load bookings");
  }

  return await response.json();
}

async function createBooking(
  token,
  teacherId,
  congressId,
  sessionIds,
  studentMessage
) {
  const response = await fetch(`${API}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      teacherId,
      congressId,
      sessionIds,
      studentMessage
    })
  });

  if (!response.ok) {
    const error = await response.json();

    throw new Error(
      error.error?.message || "Failed to create booking"
    );
  }

  return await response.json();
}

async function submitBooking(token, bookingId) {
  const response = await fetch(
    `${API}/bookings/${bookingId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    const error = await response.json();

    throw new Error(
      error.error?.message || "Failed to submit booking"
    );
  }

  return await response.json();
}

async function cancelBooking(token, bookingId) {
  const response = await fetch(
    `${API}/bookings/${bookingId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    const error = await response.json();

    throw new Error(
      error.error?.message || "Failed to cancel booking"
    );
  }

  return await response.json();
}

async function reviewBooking(token, bookingId, action, teacherComment = "") {
  const response = await fetch(`${API}/bookings/${bookingId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action, teacherComment })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to review booking");
  }

  return await response.json();
}
