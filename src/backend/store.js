import fs from "node:fs";
import path from "node:path";

export function makeSeedData() {
  const teacherId = "user-teacher-1";
  return {
    users: [
      { id: "user-student-1", name: "Student", email: "student@school", role: "student"},
      { id: teacherId, name: "Teacher", email: "teacher@school", role: "teacher" },
      { id: "user-admin-1", name: "Admin", email: "admin@school", role: "admin" },
    ],
    congresses: [],
    bookings: [],
    sessions: [],
  };
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const contents = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath, "utf8").trim() : "";
    if (contents) this.data = JSON.parse(contents);
    else {
      this.data = makeSeedData();
      this.save();
    }
    if (!Array.isArray(this.data.sessions)) this.data.sessions = [];
  }

  save() {
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
  }
}
