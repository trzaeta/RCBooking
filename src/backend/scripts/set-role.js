import { readBackendConfig } from "../config.js";
import { JsonStore } from "../store.js";
import { now } from "../utils.js";

const [emailArgument, roleArgument, teacherEmailArgument] = process.argv.slice(2);
const email = String(emailArgument || "").trim().toLowerCase();
const role = String(roleArgument || "").trim().toLowerCase();

if (!email || !["pending", "student", "teacher", "admin"].includes(role)) {
  console.error("Usage: npm run user:role -- <microsoft-email> <pending|student|teacher|admin> [teacher-email]");
  process.exitCode = 1;
}
else {
  const { dataFile } = readBackendConfig();
  const store = new JsonStore(dataFile);
  const user = store.data.users.find((item) => item.email.toLowerCase() === email || item.schoolEmail?.toLowerCase() === email);
  if (!user) {
    console.error("No account matches that email. The user must complete Microsoft sign-in once first.");
    process.exitCode = 1;
  }
  else {
    let teacherId;
    if (role === "student" && teacherEmailArgument) {
      const teacherEmail = teacherEmailArgument.trim().toLowerCase();
      const teacher = store.data.users.find(
        (item) => item.role === "teacher" && (item.email.toLowerCase() === teacherEmail || item.schoolEmail?.toLowerCase() === teacherEmail),
      );
      if (!teacher) {
        console.error("The teacher email does not match an approved teacher account.");
        process.exitCode = 1;
      }
      else teacherId = teacher.id;
    }
    if (!process.exitCode) {
      user.role = role;
      if (role === "student") user.teacherId = teacherId || user.teacherId;
      else delete user.teacherId;
      user.updatedAt = now();
      store.save();
      console.log(`Updated ${user.email} to role ${role}.`);
    }
  }
}
