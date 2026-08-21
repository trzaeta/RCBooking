let microsoftEnabled = false;
let loginBusy = false;

function dashboardUrl() { return new URL("index.html", window.location.href).toString(); }

function messageForReason(reason) {
  if (reason === "session_required") return "Please sign in to access the booking system.";
  if (reason === "session_expired") return "Your session expired. Please sign in again.";
  if (reason === "logged_out") return "You have been logged out.";
  return "";
}

function setLoginBusy(busy, message = "") {
  loginBusy = busy;
  document.getElementById("roleSelect").disabled = busy;
  document.getElementById("roleLogin").disabled = busy;
  document.getElementById("microsoftLogin").disabled = busy || !microsoftEnabled;
  if (message) document.getElementById("loginMessage").textContent = message;
}

async function finishLogin(loginPromise, message) {
  setLoginBusy(true, message);
  try {
    await loginPromise;
    window.location.replace(dashboardUrl());
  } catch (error) {
    document.getElementById("loginMessage").textContent = error.message;
    setLoginBusy(false);
  }
}

window.addEventListener("load", async () => {
  const microsoftLogin = document.getElementById("microsoftLogin");
  const roleSelect = document.getElementById("roleSelect");
  const roleLogin = document.getElementById("roleLogin");
  const loginMessage = document.getElementById("loginMessage");
  const parameters = new URLSearchParams(window.location.search);
  const microsoftResult = parameters.get("microsoft");
  const exchangeCode = parameters.get("exchangeCode");

  roleLogin.addEventListener("click", () => finishLogin(login(roleSelect.value), `Signing in as ${roleSelect.value}...`));
  microsoftLogin.addEventListener("click", async () => {
    setLoginBusy(true, "Opening Microsoft sign-in...");
    try {
      const result = await startMicrosoftSignIn();
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      loginMessage.textContent = error.message;
      setLoginBusy(false);
    }
  });

  const methodsPromise = getAuthMethods()
    .then((result) => {
      microsoftEnabled = Boolean(result.methods?.microsoft?.enabled);
      microsoftLogin.disabled = loginBusy || !microsoftEnabled;
      microsoftLogin.title = microsoftEnabled ? "" : "Microsoft sign-in is not configured on the backend.";
    })
    .catch((error) => {
      microsoftLogin.disabled = true;
      microsoftLogin.title = error.message;
    });

  if (microsoftResult === "success" && exchangeCode) {
    document.body.hidden = false;
    await finishLogin(exchangeMicrosoftSession(exchangeCode), "Completing Microsoft sign-in...");
    return;
  }

  if (microsoftResult === "error") {
    loginMessage.textContent = `Microsoft sign-in failed: ${parameters.get("error") || "UNKNOWN_ERROR"}`;
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    try {
      await getMe();
      window.location.replace(dashboardUrl());
      return;
    } catch (error) {
      if (error.status !== 401) loginMessage.textContent = error.message;
      else loginMessage.textContent = messageForReason(parameters.get("reason"));
    }
  }

  document.body.hidden = false;
  await methodsPromise;
});
