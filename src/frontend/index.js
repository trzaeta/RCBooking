let currentUser = null;
let authToken = null;
let congresses = [];

console.log("INDEX.JS IS RUNNING");

async function initialiseBackend() {
  try {
    const loginResult = await login("student");

    authToken = loginResult.token;
    currentUser = loginResult.user;

    console.log("Logged in:", currentUser);

    const congressResult = await getCongresses(authToken);

    congresses = congressResult.congresses;

    console.log("Congresses:", congresses);
    console.log("Sessions:", congresses[0]?.sessions);
  } catch (error) {
    console.error("BACKEND ERROR:", error);
  }
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
    fontSize: "42px",
    //TODO: ensure that textContent will be taken from backend, this is just placeholder
    textContent:
      "Title: Example\nDate submitted: 8 Aug '26, 16:55\nCurrent status: Pending",
  },
  pa: {
    fontSize: "20px",
    textContent: "",
    tableContent: {
      margin: "-45px auto  auto auto",
      rowCount: 5,
      heads: ["Request title", "Date", "Status"],
      //TODO: ensure that rows have proper content loaded from backend
      rows: [
        ["Example", "8 Aug '26, 16:55", "Pending"],
        ["Example 2", "5 May '25, 23:59", "Approved"],
        ["Example 3", "6 Jul '24, 06:07", "Rejected"],
      ],
    },
  },
};

window.addEventListener("load", async function () {
  await initialiseBackend();
  select(document.getElementById("rb"));
});

//TODO: create a load from backend function for socr textContent and pa rows.

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

  const headerText = document.createElement("div");
  headerText.textContent = options[id].textContent;
  headerText.style.marginBottom = "15px";
  element.appendChild(headerText);

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

function updateSessions() {
  sessionSelect.innerHTML = "";

  const defaultSession = document.createElement("option");
  defaultSession.textContent = "Select a timeslot";
  defaultSession.value = "";
  defaultSession.disabled = true;
  defaultSession.selected = true;
  sessionSelect.appendChild(defaultSession);

  if (!dateInput.value || !congress || !congress.sessions) {
    return;
  }

  congress.sessions.forEach((session) => {
    const start = new Date(session.startsAt);

    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, "0");
    const day = String(start.getDate()).padStart(2, "0");

    const sessionDate = `${year}-${month}-${day}`;

    if (sessionDate !== dateInput.value) {
      return;
    }

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
}

dateInput.addEventListener("change", updateSessions);
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

