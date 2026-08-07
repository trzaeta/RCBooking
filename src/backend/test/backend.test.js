import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { createBackend } from "../main.js";

async function request(baseUrl, route, options = {}) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers };
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

async function login(baseUrl, role) {
  const result = await request(baseUrl, "/auth/login", { method: "POST", body: { role } });
  assert.equal(result.status, 200);
  return result.body.token;
}

async function firstCongressAndSession(baseUrl, adminToken) {
  const headers = { Authorization: `Bearer ${adminToken}` };
  const congresses = await request(baseUrl, "/congresses", { headers });
  assert.equal(congresses.status, 200);
  let congress = congresses.body.congresses[0];

  if (!congress) {
    const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000);
    const createdCongress = await request(baseUrl, "/congresses", {
      method: "POST",
      headers,
      body: {
        title: "Test Research Congress",
        description: "Congress created by the test suite.",
        venue: "Test Auditorium",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        registrationOpen: true,
      },
    });
    assert.equal(createdCongress.status, 201);
    congress = createdCongress.body.congress;
  }

  const startsAt = new Date(new Date(congress.startsAt).getTime() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
  const created = await request(baseUrl, `/congresses/${congress.id}/sessions`, {
    method: "POST",
    headers,
    body: {
      title: "Test Research Session",
      description: "Session created by the test suite.",
      startsAt,
      endsAt,
      capacity: 30,
    },
  });
  assert.equal(created.status, 201);
  return { congress, session: created.body.session };
}

test("empty database file is replaced with the current template", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rcbooking-"));
  const dataFile = path.join(tempDirectory, "database.json");
  fs.writeFileSync(dataFile, "  \n", "utf8");

  const backend = createBackend({ dataFile, actionLogger: () => {} });
  const savedData = JSON.parse(fs.readFileSync(dataFile, "utf8"));

  assert.equal(backend.store.data.users.length, 3);
  assert.deepEqual(savedData, backend.store.data);
  assert.deepEqual(savedData.congresses, []);
  assert.deepEqual(savedData.bookings, []);
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test("login accepts only the three temporary roles", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rcbooking-"));
  const backend = createBackend({
    dataFile: path.join(tempDirectory, "database.json"),
    actionLogger: () => {},
  });
  await backend.start(0, "127.0.0.1");
  t.after(async () => {
    await backend.stop();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${backend.server.address().port}/api/v1`;
  const health = await request(baseUrl, "/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.framework, "hono");

  const result = await request(baseUrl, "/auth/login", {
    method: "POST",
    body: { role: "principal" },
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "INVALID_ROLE");
});

function waitForEvent(socket, expectedEvent) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedEvent}`)), 2000);
    const onMessage = (buffer) => {
      const message = JSON.parse(buffer.toString());
      if (message.event !== expectedEvent) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

test("student submission reaches teacher and can be approved", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rcbooking-"));
  const actionLogs = [];
  const backend = createBackend({
    dataFile: path.join(tempDirectory, "database.json"),
    allowedOrigins: "http://localhost:5173",
    actionLogger: (message) => actionLogs.push(message),
  });
  await backend.start(0, "127.0.0.1");
  t.after(async () => {
    await backend.stop();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  const port = backend.server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const studentToken = await login(baseUrl, "student");
  const teacherToken = await login(baseUrl, "teacher");
  const adminToken = await login(baseUrl, "admin");

  const teacherSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { Origin: "http://localhost:5173" },
  });
  await new Promise((resolve, reject) => {
    teacherSocket.once("open", resolve);
    teacherSocket.once("error", reject);
  });
  teacherSocket.send(JSON.stringify({ event: "auth", data: { token: teacherToken } }));
  await waitForEvent(teacherSocket, "connection.ready");

  const { congress, session } = await firstCongressAndSession(baseUrl, adminToken);

  const created = await request(baseUrl, "/bookings", {
    method: "POST",
    headers: { Authorization: `Bearer ${studentToken}` },
    body: {
      congressId: congress.id,
      sessionIds: [session.id],
      studentMessage: "Please approve my congress booking.",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.status, "draft");

  const teacherDrafts = await request(baseUrl, "/bookings", {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  assert.deepEqual(teacherDrafts.body.bookings, []);

  const teacherCannotCancelDraft = await request(baseUrl, `/bookings/${created.body.booking.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  assert.equal(teacherCannotCancelDraft.status, 404);

  const submittedEvent = waitForEvent(teacherSocket, "booking.submitted");
  const submitted = await request(baseUrl, `/bookings/${created.body.booking.id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.booking.status, "submitted");
  assert.equal((await submittedEvent).data.booking.id, created.body.booking.id);

  const forbiddenReview = await request(baseUrl, `/bookings/${created.body.booking.id}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${studentToken}` },
    body: { action: "approve" },
  });
  assert.equal(forbiddenReview.status, 403);

  const approved = await request(baseUrl, `/bookings/${created.body.booking.id}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${teacherToken}` },
    body: { action: "approve", teacherComment: "Approved." },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.booking.status, "approved");

  const studentBookings = await request(baseUrl, "/bookings", {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(studentBookings.status, 200);
  assert.equal(studentBookings.body.bookings[0].status, "approved");

  const refreshedCongresses = await request(baseUrl, "/congresses", {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const refreshedSession = refreshedCongresses.body.congresses[0].sessions.find((item) => item.id === session.id);
  assert.equal(refreshedSession.approvedBookings, 1);
  assert.ok(actionLogs.some((line) => line.includes("auth.login")));
  assert.ok(actionLogs.some((line) => line.includes("session.created")));
  assert.ok(actionLogs.some((line) => line.includes("booking.created")));
  assert.ok(actionLogs.some((line) => line.includes("booking.submitted")));
  assert.ok(actionLogs.some((line) => line.includes("booking.reviewed") && line.includes("result=approved")));
  teacherSocket.close();
});

test("teacher must comment when requesting changes", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rcbooking-"));
  const backend = createBackend({
    dataFile: path.join(tempDirectory, "database.json"),
    actionLogger: () => {},
  });
  await backend.start(0, "127.0.0.1");
  t.after(async () => {
    await backend.stop();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${backend.server.address().port}/api/v1`;
  const studentToken = await login(baseUrl, "student");
  const teacherToken = await login(baseUrl, "teacher");
  const adminToken = await login(baseUrl, "admin");
  const { congress, session } = await firstCongressAndSession(baseUrl, adminToken);
  const created = await request(baseUrl, "/bookings", {
    method: "POST",
    headers: { Authorization: `Bearer ${studentToken}` },
    body: { congressId: congress.id, sessionIds: [session.id] },
  });
  await request(baseUrl, `/bookings/${created.body.booking.id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${studentToken}` },
  });

  const review = await request(baseUrl, `/bookings/${created.body.booking.id}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${teacherToken}` },
    body: { action: "request_changes" },
  });
  assert.equal(review.status, 400);
  assert.equal(review.body.error.code, "COMMENT_REQUIRED");
});

test("admin receives a clear validation error for invalid dates", async (t) => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rcbooking-"));
  const backend = createBackend({
    dataFile: path.join(tempDirectory, "database.json"),
    actionLogger: () => {},
  });
  await backend.start(0, "127.0.0.1");
  t.after(async () => {
    await backend.stop();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${backend.server.address().port}/api/v1`;
  const adminToken = await login(baseUrl, "admin");
  const created = await request(baseUrl, "/congresses", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { title: "Invalid congress", startsAt: "not-a-date", endsAt: "also-not-a-date" },
  });
  assert.equal(created.status, 400);
  assert.equal(created.body.error.code, "INVALID_DATE");
});
