import WebSocket from "ws";

const API_URL = "http://localhost:3001/api/v1";
const WS_URL = "ws://localhost:3001/ws";


// ============================================================
// LOGIN
// ============================================================

async function login(role) {
  console.log(`\nLogging in as ${role}...`);

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: role,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  console.log(`Logged in as: ${data.user.name}`);
  console.log(`User ID: ${data.user.id}`);

  return data;
}


// ============================================================
// CREATE TEST CONGRESS
// ============================================================

async function createTestCongress(token) {
  console.log("\nCreating test congress...");

  const response = await fetch(`${API_URL}/congresses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: "Test Research Congress",
      description: "Congress created for communication testing",
      venue: "Test Venue",
      startsAt: "2026-09-06T01:00:00.000Z",
      endsAt: "2026-09-06T08:00:00.000Z",
      registrationOpen: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to create congress: ${JSON.stringify(data)}`
    );
  }

  console.log("Congress created!");
  console.log("Congress:", data.congress.title);
  console.log("Congress ID:", data.congress.id);

  return data.congress;
}


// ============================================================
// CREATE TEST SESSION
// ============================================================

async function createTestSession(token, congressId) {
  console.log("\nCreating test session...");

  const response = await fetch(
    `${API_URL}/congresses/${congressId}/sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Test Presentation Session",
        description: "Session for communication testing",
        startsAt: "2026-09-06T02:00:00.000Z",
        endsAt: "2026-09-06T03:00:00.000Z",
        capacity: 30,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to create session: ${JSON.stringify(data)}`
    );
  }

  console.log("Session created!");
  console.log("Session:", data.session.title);
  console.log("Session ID:", data.session.id);
  console.log("Available places:", data.session.availablePlaces);

  return data.session;
}


// ============================================================
// GET CONGRESSES
// ============================================================

async function getCongresses(token) {
  console.log("\nGetting congresses...");

  const response = await fetch(`${API_URL}/congresses`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to get congresses: ${JSON.stringify(data)}`
    );
  }

  console.log("Number of congresses:", data.congresses.length);

  return data.congresses;
}


// ============================================================
// CREATE BOOKING
// ============================================================

async function createBooking(token, congressId, sessionId) {
  console.log("\nCreating booking...");

  const response = await fetch(`${API_URL}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      congressId: congressId,
      sessionIds: [sessionId],
      studentMessage: "My research project presentation.",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to create booking: ${JSON.stringify(data)}`
    );
  }

  console.log("Booking created!");
  console.log("Booking ID:", data.booking.id);
  console.log("Status:", data.booking.status);

  return data.booking;
}


// ============================================================
// SUBMIT BOOKING
// ============================================================

async function submitBooking(token, bookingId) {
  console.log("\nSubmitting booking...");

  const response = await fetch(
    `${API_URL}/bookings/${bookingId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to submit booking: ${JSON.stringify(data)}`
    );
  }

  console.log("Booking submitted!");
  console.log("Status:", data.booking.status);

  return data.booking;
}


// ============================================================
// TEACHER APPROVES BOOKING
// ============================================================

async function approveBooking(token, bookingId) {
  console.log("\nTeacher approving booking...");

  const response = await fetch(
    `${API_URL}/bookings/${bookingId}/review`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "approve",
        teacherComment: "Approved.",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to approve booking: ${JSON.stringify(data)}`
    );
  }

  console.log("Booking approved!");
  console.log("Status:", data.booking.status);

  return data.booking;
}


// ============================================================
// STUDENT WEBSOCKET
// ============================================================

function connectStudentWebSocket(token) {
  return new Promise((resolve, reject) => {
    console.log("\nConnecting student's WebSocket...");

    const socket = new WebSocket(WS_URL);

    socket.on("open", () => {
      console.log("WebSocket connected!");

      console.log("Sending authentication...");

      socket.send(
        JSON.stringify({
          event: "auth",
          data: {
            token: token,
          },
        })
      );
    });


    socket.on("message", (message) => {
      const data = JSON.parse(message.toString());

      console.log("\nWebSocket message received:");
      console.log(JSON.stringify(data, null, 2));


      // Authentication successful
      if (data.event === "connection.ready") {
        console.log("\nWebSocket authentication successful!");

        console.log("Sending ping...");

        socket.send(
          JSON.stringify({
            event: "ping",
            data: {},
          })
        );

        resolve(socket);
      }


      // Server responded to ping
      if (data.event === "pong") {
        console.log("Pong received!");
      }


      // Booking status changed
      if (data.event === "booking.status.updated") {
        console.log("\n================================");
        console.log("BOOKING STATUS UPDATED!");
        console.log("================================");

        console.log(
          "New status:",
          data.data.booking.status
        );

        console.log(
          "Booking ID:",
          data.data.booking.id
        );

        console.log(
          "Congress:",
          data.data.booking.congressTitle
        );

        console.log("================================");
      }


      // Notification received
      if (data.event === "notification.created") {
        console.log("\nNOTIFICATION RECEIVED!");

        console.log(
          "Message:",
          data.data.message
        );
      }


      // Capacity changed
      if (data.event === "session.capacity.updated") {
        console.log("\nSESSION CAPACITY UPDATED!");

        console.log(
          "Available places:",
          data.data.availablePlaces
        );
      }


      // WebSocket error
      if (data.event === "socket.error") {
        console.log("\nWEBSOCKET ERROR:");
        console.log(data.data);
      }
    });


    socket.on("close", (code, reason) => {
      console.log(
        "\nWebSocket closed."
      );

      console.log(
        "Code:",
        code
      );

      console.log(
        "Reason:",
        reason.toString()
      );
    });


    socket.on("error", (error) => {
      console.error("\nWebSocket error:");
      console.error(error);

      reject(error);
    });
  });
}


// ============================================================
// MAIN TEST
// ============================================================

async function main() {
  console.log("======================================");
  console.log("   RCBOOKING COMMUNICATION TEST");
  console.log("======================================");


  // ----------------------------------------------------------
  // 1. Login as student
  // ----------------------------------------------------------

  const student = await login("student");


  // ----------------------------------------------------------
  // 2. Login as teacher
  // ----------------------------------------------------------

  const teacher = await login("teacher");


  // ----------------------------------------------------------
  // 3. Login as admin
  // ----------------------------------------------------------

  const admin = await login("admin");


  // ----------------------------------------------------------
  // 4. Create test congress
  // ----------------------------------------------------------

  const congress = await createTestCongress(
    admin.token
  );


  // ----------------------------------------------------------
  // 5. Create test session
  // ----------------------------------------------------------

  const session = await createTestSession(
    admin.token,
    congress.id
  );


  // ----------------------------------------------------------
  // 6. Verify congress can be retrieved by student
  // ----------------------------------------------------------

  const congresses = await getCongresses(
    student.token
  );

  const retrievedCongress = congresses.find(
    (item) => item.id === congress.id
  );

  if (!retrievedCongress) {
    throw new Error(
      "Could not find the newly created congress."
    );
  }

  console.log(
    "\nStudent successfully retrieved the congress."
  );

  console.log(
    "Congress:",
    retrievedCongress.title
  );


  // ----------------------------------------------------------
  // 7. Connect student's WebSocket
  // ----------------------------------------------------------

  const studentSocket =
    await connectStudentWebSocket(
      student.token
    );


  // ----------------------------------------------------------
  // 8. Create booking
  // ----------------------------------------------------------

  const booking = await createBooking(
    student.token,
    congress.id,
    session.id
  );


  // ----------------------------------------------------------
  // 9. Submit booking
  // ----------------------------------------------------------

  await submitBooking(
    student.token,
    booking.id
  );


  // ----------------------------------------------------------
  // 10. Teacher approves booking
  // ----------------------------------------------------------

  await approveBooking(
    teacher.token,
    booking.id
  );


  // ----------------------------------------------------------
  // 11. Wait for WebSocket event
  // ----------------------------------------------------------

  console.log(
    "\nWaiting for booking.status.updated..."
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });


  // ----------------------------------------------------------
  // 12. Finish
  // ----------------------------------------------------------

  console.log("\n======================================");
  console.log("          TEST COMPLETE");
  console.log("======================================");

  studentSocket.close();
}


// ============================================================
// ERROR HANDLING
// ============================================================

main().catch((error) => {
  console.error("\n======================================");
  console.error("             TEST FAILED");
  console.error("======================================");


  console.error(error);
});