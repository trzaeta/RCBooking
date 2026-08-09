options = {
  rb: {},
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

//TODO: create a load from backend function for socr textContent and pa rows.

function createTable(id, mainWindow) {
  if (!("tableContent" in options[id])) {
    return;
  }
  mainWindow.innerHTML = "";
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
  element = document.getElementById("mainWindow");
  element.innerHTML = "";
  element.style.fontSize = options[id].fontSize;
  console.log(element.fontSize);
  element.textContent = options[id].textContent;
  createTable(id, element);
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
