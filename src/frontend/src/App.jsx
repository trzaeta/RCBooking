import { useState } from "react";

const OPTIONS = {
  rb: {
    label: "Request Booking",
    fontSize: "20px",
    textContent: "Please enter the Teacher's name and Date",
  },
  socr: {
    label: "Status of current request",
    fontSize: "clamp(22px, 2.6vw, 42px)",
    //TODO: load this from the backend
    textContent:
      "Title: Example\nDate submitted: 8 Aug '26, 16:55\nCurrent status: Pending",
  },
  pa: {
    label: "Past applications",
    fontSize: "20px",
    tableContent: {
      rowCount: 5,
      heads: ["Request title", "Date", "Status"],
      //TODO: same as line 13
      rows: [
        ["Example", "8 Aug '26, 16:55", "Pending"],
        ["Example 2", "5 May '25, 23:59", "Approved"],
        ["Example 3", "6 Jul '24, 06:07", "Rejected"],
      ],
    },
  },
};

const SIDEBAR_ORDER = ["rb", "socr", "pa"];

function RequestBookingForm() {
  return (
    <>
      <p className="mainWindowText">{OPTIONS.rb.textContent}</p>
      <div className="fieldsRow">
        <input
          type="text"
          className="rcInput"
          placeholder="Teacher's name"
        />
        <input type="date" className="rcInput rcInputDate" />
        <button className="Confirm">Confirm</button>
      </div>
    </>
  );
}

function StatusOfRequest() {
  return (
    <p className="mainWindowText" style={{ fontSize: OPTIONS.socr.fontSize }}>
      {OPTIONS.socr.textContent}
    </p>
  );
}

function PastApplications() {
  const { heads, rows, rowCount } = OPTIONS.pa.tableContent;
  const paddedRows = [...rows];
  while (paddedRows.length < rowCount) {
    paddedRows.push(heads.map(() => "-"));
  }

  return (
    <table className="rcTable">
      <thead>
        <tr>
          {heads.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {paddedRows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MainWindowContent({ selected }) {
  switch (selected) {
    case "rb":
      return <RequestBookingForm />;
    case "socr":
      return <StatusOfRequest />;
    case "pa":
      return <PastApplications />;
    default:
      return null;
  }
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selected, setSelected] = useState("rb");

  return (
    <div className="app">
      <header className="header">
        <p className="pageTitle">
          <strong>Research Congress Booking</strong>
        </p>
        <div className="headerRight">
          <p className="version">Version 0.3</p>
          {isLoggedIn && (
            <button
              className="option logoutBtn"
              onClick={() => setIsLoggedIn(false)}
            >
              Log out
            </button>
          )}
        </div>
      </header>

      <div className="body">
        <div className="panel">
          <nav className="sidebar" aria-disabled={!isLoggedIn}>
            {SIDEBAR_ORDER.map((id) => (
              <button
                key={id}
                className={
                  "option" + (selected === id && isLoggedIn ? " selected" : "")
                }
                disabled={!isLoggedIn}
                onClick={() => setSelected(id)}
              >
                {OPTIONS[id].label}
              </button>
            ))}
          </nav>

          <div className="mainWindow">
            {isLoggedIn ? (
              <MainWindowContent selected={selected} />
            ) : (
              <button
                className="option loginBtn"
                onClick={() => setIsLoggedIn(true)}
              >
                Log in with Microsoft
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
