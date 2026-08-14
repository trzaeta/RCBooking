let currentUser = null;
let authToken = null;
let congresses = [];
let loginRequestId = 0;
let microsoftEnabled = false;

console.log("INDEX.JS IS RUNNING");

async function completeLogin(loginPromise, statusText) {
  const requestId = ++loginRequestId;
  const roleSelect = document.getElementById("roleSelect");
  const microsoftLogin = document.getElementById("microsoftLogin");
  const currentUserName = document.getElementById("currentUserName");

  roleSelect.disabled = true;
  microsoftLogin.disabled = true;
  currentUserName.textContent = statusText;
  authToken = null;
  currentUser = null;
  congresses = [];
  updateNavigationForRole();

  try {
    const loginResult = await loginPromise;
    const congressResult = await getCongresses(loginResult.token);

    if (requestId !== loginRequestId) return;

    authToken = loginResult.token;
    currentUser = loginResult.user;
    congresses = congressResult.congresses;
    if (["student", "teacher"].includes(currentUser.role)) roleSelect.value = currentUser.role;
    currentUserName.textContent = `${currentUser.name} (${currentUser.role})`;
    updateNavigationForRole();

    console.log("Congresses:", congresses);
    console.log("Sessions:", congresses[0]?.sessions);
    console.log("Logged in:", currentUser);

    if (["student", "teacher"].includes(currentUser.role)) select(document.getElementById("rb"));
    else showAccountMessage(currentUser.role === "pending"
      ? "Your Microsoft account is registered, but an administrator must approve it before you can use RCBooking."
      : "You are signed in. The admin dashboard is not implemented on this page yet.");
  } catch (error) {
    console.error("BACKEND ERROR:", error);
    currentUserName.textContent = "Login failed";
  } finally {
    if (requestId === loginRequestId) roleSelect.disabled = false;
    microsoftLogin.disabled = !microsoftEnabled;
  }
}

function initialiseBackend(role = "student") {
  return completeLogin(login(role), `Signing in as ${role}...`);
}

function initialiseMicrosoft(exchangeCode) {
  return completeLogin(exchangeMicrosoftSession(exchangeCode), "Completing Microsoft sign-in...");
}



options = {
  rb: {
  fontSize: "20px",
  textContent: "Please select your teacher and presentation time\n",
  fields: {
    date: {
      width: "150px",
      height: "45px",
      margin: "10px 10px auto auto",
    },
  },
  buttons: {
    Confirm: {
      width: "100px",
      height: "45px",
      margin: "10px 10px auto auto",
    },
  },
  },
  socr: {
    fontSize: "20px",
    textContent: "Status of current request",
  },
  pa: {
    fontSize: "20px",
    textContent: "Past applications",
  },
};

window.addEventListener("load", async function () {
  const roleSelect = document.getElementById("roleSelect");
  const microsoftLogin = document.getElementById("microsoftLogin");
  const currentUserName = document.getElementById("currentUserName");
  roleSelect.addEventListener("change", () => initialiseBackend(roleSelect.value));
  microsoftLogin.addEventListener("click", async () => {
    microsoftLogin.disabled = true;
    currentUserName.textContent = "Opening Microsoft sign-in...";
    try {
      const result = await startMicrosoftSignIn();
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      currentUserName.textContent = error.message;
      microsoftLogin.disabled = !microsoftEnabled;
    }
  });

  const methodsPromise = getAuthMethods()
    .then((result) => {
      microsoftEnabled = Boolean(result.methods?.microsoft?.enabled);
      microsoftLogin.disabled = !microsoftEnabled;
      microsoftLogin.title = microsoftEnabled ? "" : "Microsoft sign-in is not configured on the backend.";
    })
    .catch((error) => {
      microsoftLogin.disabled = true;
      microsoftLogin.title = error.message;
    });

  const parameters = new URLSearchParams(window.location.search);
  const microsoftResult = parameters.get("microsoft");
  const exchangeCode = parameters.get("exchangeCode");
  if (microsoftResult) window.history.replaceState({}, document.title, window.location.pathname);

  if (microsoftResult === "success" && exchangeCode) await initialiseMicrosoft(exchangeCode);
  else if (microsoftResult === "error") {
    currentUserName.textContent = `Microsoft sign-in failed: ${parameters.get("error") || "UNKNOWN_ERROR"}`;
    showAccountMessage("Microsoft sign-in was not completed. You can try again or use a demo login.");
    roleSelect.disabled = false;
  } else await initialiseBackend(roleSelect.value);

  await methodsPromise;
});

function updateNavigationForRole() {
  const studentMode = currentUser?.role === "student";
  const teacherMode = currentUser?.role === "teacher";
  document.getElementById("rb").hidden = !studentMode && !teacherMode;
  document.getElementById("rb").textContent = teacherMode ? "Booking requests" : "Request Booking";
  document.getElementById("socr").hidden = !studentMode;
  document.getElementById("pa").hidden = !studentMode;
}

function showAccountMessage(message) {
  updateNavigationForRole();
  const mainWindow = document.getElementById("mainWindow");
  mainWindow.className = "mainWindow accountMessage";
  mainWindow.textContent = message;
}

function createInput(id, mainWindow) {
  if (!("fields" in options[id])) {
    return;
  }
  for (const [k, v] of Object.entries(options[id].fields)) {
    const tF = document.createElement("input");
    tF.type = k;
    tF.placeholder = v.text || "";
    tF.style.margin = v.margin;
    tF.style.width = v.width;
    tF.style.height = v.height;
    mainWindow.appendChild(tF);
  }
}

function createButton(id, mainWindow) {
  if (!("buttons" in options[id])) {
    return;
  }
  for (const [k, v] of Object.entries(options[id].buttons)) {
    const button = document.createElement("button");
    button.textContent = k;
    button.className = k;
    button.style.margin = v.margin;
    button.style.width = v.width;
    button.style.height = v.height;
    button.onmouseenter = (event) => {
      hover(button);
    };
    button.onmouseleave = (event) => {
      button.style.backgroundColor = "#d9f2d0";
      unhover(button);
    };
    button.onmousedown = (event) => {
      button.style.backgroundColor = "#b4e5a2";
    };
    button.onmouseup = (event) => {
      button.style.backgroundColor = "#d9f2d0";
    };

    if (id === "rb" && k === "Confirm") {
  button.onclick = async () => {
    console.log("CONFIRM BUTTON CLICKED");

    const teacherSelect = mainWindow.querySelector("#teacherSelect");
    const dateInput = mainWindow.querySelector('input[type="date"]');
    const sessionSelect = mainWindow.querySelector("#sessionSelect");

    if (!teacherSelect || !teacherSelect.value) {
      alert("Please select a teacher.");
      return;
    }

    if (!dateInput || !dateInput.value) {
      alert("Please select a date.");
      return;
    }

    if (!sessionSelect || !sessionSelect.value) {
      alert("Please select a timeslot.");
      return;
    }

    console.log("Selected teacher:", teacherSelect.value);
    console.log("Selected date:", dateInput.value);
    console.log("Selected session:", sessionSelect.value);

    try {
      const congress = congresses[0];

      if (!congress) {
        throw new Error("No congress is available.");
      }

      const result = await createBooking(
  authToken,
  teacherSelect.value,
  congress.id,
  [sessionSelect.value],
  ""
);

console.log("Booking created:", result);

const bookingId = result.booking.id;

const submitted = await submitBooking(
  authToken,
  bookingId
);

console.log("Booking submitted:", submitted);

alert("Booking submitted successfully.");
    } catch (error) {
      console.error("Failed to create booking:", error);
      alert(error.message);
    }
  };
}

    mainWindow.appendChild(button);
  }
}

function createTable(id, mainWindow) {
  if (!("tableContent" in options[id])) {
    return;
  }
  const table = document.createElement("table");
  table.style.borderCollapse = "collapse";
  const trHead = document.createElement("tr");
  options[id].tableContent.heads.forEach((head) => {
    const th = document.createElement("th");
    th.textContent = head;
    trHead.appendChild(th);
  });
  table.appendChild(trHead);

  for (let i = 0; i < options[id].tableContent.rowCount; ++i) {
    const tr = document.createElement("tr");
    if (i < options[id].tableContent.rows.length) {
      options[id].tableContent.rows[i].forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
    } else {
      for (let j = 0; j < options[id].tableContent.heads.length; ++j) {
        const td = document.createElement("td");
        td.textContent = "-";
        tr.appendChild(td);
      }
    }
    table.appendChild(tr);
  }
  mainWindow.appendChild(table);
  table.style.margin = options[id].tableContent.margin;
}

function setMainScreen(id) {
  const element = document.getElementById("mainWindow");
  element.innerHTML = "";
  element.style.fontSize = options[id].fontSize;
  element.classList.toggle("teacherReview", id === "rb" && currentUser?.role === "teacher");
  element.classList.toggle("studentBookings", currentUser?.role === "student" && ["socr", "pa"].includes(id));

  const headerText = document.createElement("div");
  headerText.textContent = options[id].textContent;
  headerText.style.marginBottom = "15px";
  element.appendChild(headerText);

  if (id === "rb" && currentUser?.role === "teacher") {
    headerText.textContent = "Student booking requests";
    renderTeacherBookings(element);
    return;
  }

  if (id === "socr" && currentUser?.role === "student") {
    renderStudentBookings(element, true);
    return;
  }

  if (id === "pa" && currentUser?.role === "student") {
    renderStudentBookings(element, false);
    return;
  }

  createTable(id, element);

  createInput(id, element);

  if (id === "rb") {
    createTeacherSelect(element);
  }

  createButton(id, element);
}

function select(element) {
  for (const op of document.getElementsByClassName("option")) {
    op.style.backgroundColor = "#d9f2d0";
  }
  element.style.backgroundColor = "#8ed973";
  setMainScreen(element.id);
}

function hover(element) {
  element.style.outline = "2px solid black";
}

function unhover(element) {
  element.style.outline = "none";
}

function formatBookingTime(session) {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  const date = start.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  const startTime = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${session.title} - ${date}, ${startTime} - ${endTime}`;
}

function formatBookingDate(value) {
  if (!value) return "Not submitted";
  return new Date(value).toLocaleString([], {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function createStudentBookingCard(booking) {
  const card = document.createElement("article");
  card.className = "bookingCard";

  const title = document.createElement("h3");
  title.textContent = booking.congressTitle;

  const status = document.createElement("p");
  status.className = "bookingStatus";
  status.textContent = `Status: ${booking.status.replaceAll("_", " ")}`;

  const submitted = document.createElement("p");
  submitted.textContent = booking.submittedAt
    ? `Submitted: ${formatBookingDate(booking.submittedAt)}`
    : `Created: ${formatBookingDate(booking.createdAt)} (not submitted)`;

  const teacher = document.createElement("p");
  teacher.textContent = `Teacher: ${booking.teacher.name}`;

  const sessions = document.createElement("p");
  sessions.textContent = booking.sessions.map(formatBookingTime).join("\n");
  sessions.style.whiteSpace = "pre-line";

  card.append(title, status, submitted, teacher, sessions);

  if (booking.teacherComment) {
    const comment = document.createElement("p");
    comment.textContent = `Teacher comment: ${booking.teacherComment}`;
    card.appendChild(comment);
  }

  return card;
}

async function renderStudentBookings(mainWindow, currentOnly) {
  const loading = document.createElement("p");
  loading.textContent = "Loading bookings...";
  mainWindow.appendChild(loading);
  const token = authToken;

  try {
    const result = await getBookings(token);
    if (token !== authToken || currentUser?.role !== "student") return;

    loading.remove();
    const activeStatuses = new Set(["draft", "submitted", "changes_requested", "approved"]);
    const bookings = currentOnly
      ? result.bookings.filter((booking) => activeStatuses.has(booking.status)).slice(0, 1)
      : result.bookings;

    if (!bookings.length) {
      const empty = document.createElement("p");
      empty.textContent = currentOnly
        ? "You do not have a current booking request."
        : "You have not made any booking applications yet.";
      mainWindow.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "bookingList";
    bookings.forEach((booking) => list.appendChild(createStudentBookingCard(booking)));
    mainWindow.appendChild(list);
  } catch (error) {
    loading.textContent = error.message;
    console.error("Failed to load student bookings:", error);
  }
}

async function renderTeacherBookings(mainWindow) {
  const loading = document.createElement("p");
  loading.textContent = "Loading bookings...";
  mainWindow.appendChild(loading);
  const token = authToken;

  try {
    const result = await getBookings(token);
    if (token !== authToken || currentUser?.role !== "teacher") return;

    loading.remove();
    if (!result.bookings.length) {
      const empty = document.createElement("p");
      empty.textContent = "There are no bookings assigned to you yet.";
      mainWindow.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "bookingList";

    result.bookings.forEach((booking) => {
      const card = document.createElement("article");
      card.className = "bookingCard";

      const title = document.createElement("h3");
      title.textContent = `${booking.student.name} - ${booking.congressTitle}`;

      const sessions = document.createElement("p");
      sessions.textContent = booking.sessions.map(formatBookingTime).join("\n");
      sessions.style.whiteSpace = "pre-line";

      const status = document.createElement("p");
      status.className = "bookingStatus";
      status.textContent = `Status: ${booking.status.replace("_", " ")}`;

      card.append(title, sessions, status);

      if (booking.studentMessage) {
        const message = document.createElement("p");
        message.textContent = `Student message: ${booking.studentMessage}`;
        card.appendChild(message);
      }

      if (booking.status === "submitted") {
        const approveButton = document.createElement("button");
        approveButton.className = "approveBooking";
        approveButton.textContent = "Yes, approve";
        approveButton.onclick = async () => {
          approveButton.disabled = true;
          approveButton.textContent = "Approving...";
          try {
            const reviewed = await reviewBooking(authToken, booking.id, "approve");
            status.textContent = `Status: ${reviewed.booking.status}`;
            approveButton.textContent = "Approved";
            console.log("Booking approved:", reviewed.booking);
          } catch (error) {
            approveButton.disabled = false;
            approveButton.textContent = "Yes, approve";
            alert(error.message);
          }
        };
        card.appendChild(approveButton);
      }

      list.appendChild(card);
    });

    mainWindow.appendChild(list);
  } catch (error) {
    loading.textContent = error.message;
    console.error("Failed to load teacher bookings:", error);
  }
}

async function createTeacherSelect(mainWindow) {
  const container = document.createElement("div");
  container.style.margin = "10px 0";

  const label = document.createElement("label");
  label.textContent = "Teacher: ";
  label.style.marginRight = "10px";

  const teacherSelect =
  document.createElement("select");

  teacherSelect.id = "teacherSelect";
  teacherSelect.style.position = "relative";
  teacherSelect.style.zIndex = "9999";
  teacherSelect.style.pointerEvents = "auto";

  const loadingOption = document.createElement("option");
  loadingOption.textContent = "Loading teachers...";
  loadingOption.value = "";
  loadingOption.disabled = true;
  loadingOption.selected = true;

  teacherSelect.appendChild(loadingOption);

  container.appendChild(label);
  container.appendChild(teacherSelect);
  mainWindow.appendChild(container);

  const sessionContainer = document.createElement("div");
sessionContainer.style.margin = "10px 0";

const sessionLabel = document.createElement("label");
sessionLabel.textContent = "Timeslot: ";
sessionLabel.style.marginRight = "10px";

const sessionSelect = document.createElement("select");
sessionSelect.id = "sessionSelect";
sessionSelect.style.position = "relative";
sessionSelect.style.zIndex = "9999";
sessionSelect.style.pointerEvents = "auto";
sessionSelect.style.width = "250px";
sessionSelect.style.height = "45px";
sessionSelect.style.fontSize = "15px";

const defaultSession = document.createElement("option");
defaultSession.textContent = "Select a timeslot";
defaultSession.value = "";
defaultSession.disabled = true;
defaultSession.selected = true;

sessionSelect.appendChild(defaultSession);

sessionContainer.appendChild(sessionLabel);
sessionContainer.appendChild(sessionSelect);
mainWindow.appendChild(sessionContainer);

const congress = congresses[0];
const dateInput = mainWindow.querySelector('input[type="date"]');

function sessionDateValue(session) {
  const date = new Date(session.startsAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const availableDates = [...new Set((congress?.sessions || []).map(sessionDateValue))].sort();
if (dateInput && availableDates.length) {
  dateInput.min = availableDates[0];
  dateInput.max = availableDates[availableDates.length - 1];
  dateInput.value = availableDates[0];
}

function updateSessions() {
  sessionSelect.innerHTML = "";

  const defaultSession = document.createElement("option");
  defaultSession.textContent = "Select a timeslot";
  defaultSession.value = "";
  defaultSession.disabled = true;
  defaultSession.selected = true;
  sessionSelect.appendChild(defaultSession);

  if (!dateInput?.value || !congress?.sessions?.length) {
    defaultSession.textContent = "No sessions available";
    return;
  }

  let matchingSessions = 0;
  congress.sessions.forEach((session) => {
    const start = new Date(session.startsAt);
    const sessionDate = sessionDateValue(session);

    if (sessionDate !== dateInput.value) {
      return;
    }

    matchingSessions += 1;

    const option = document.createElement("option");

    option.value = session.id;

    const end = new Date(session.endsAt);

    option.textContent =
      `${session.title} (${start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })} - ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })})`;

    if (session.availablePlaces <= 0) {
      option.disabled = true;
      option.textContent += " (Full)";
    }

    sessionSelect.appendChild(option);
  });

  if (!matchingSessions) {
    defaultSession.textContent = "No sessions available on this date";
  }
}

dateInput.addEventListener("change", updateSessions);
updateSessions();
  console.log("Teacher dropdown created");

  try {
    const result = await getTeachers(authToken);

    console.log("Teachers received:", result);

    teacherSelect.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.textContent = "Select a teacher";
    defaultOption.value = "";
    defaultOption.disabled = true;
    defaultOption.selected = true;

    teacherSelect.appendChild(defaultOption);

    result.teachers.forEach((teacher) => {
      const option = document.createElement("option");

      option.value = teacher.id;
      option.textContent = teacher.name;

      teacherSelect.appendChild(option);
    });

    console.log(
      "Teacher options created:",
      teacherSelect.options.length
    );

  } catch (error) {
    console.error("Failed to load teachers:", error);

    teacherSelect.innerHTML = "";

    const errorOption = document.createElement("option");
    errorOption.textContent = "Failed to load teachers";
    errorOption.disabled = true;

    teacherSelect.appendChild(errorOption);
  }
}

