# RCBooking API

## Connection

- HTTP: `http://localhost:3001/api/v1`
- WebSocket: `ws://localhost:3001/ws`
- Framework: Hono on Node.js with `@hono/node-server`
- WebSocket library: `ws`
- Dates: ISO 8601 strings in UTC

Except for health and login, HTTP requests require:

```http
Authorization: Bearer <token>
```

IDs are opaque strings. The frontend must use IDs returned by the API instead of hard-coding them.

## Temporary login

Passwords are not implemented yet. Send one of the three development roles:

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "role": "student" }
```

Valid roles are `student`, `teacher`, and `admin`.

```json
{
  "token": "temporary-session-token",
  "expiresAt": "2026-08-08T08:00:00.000Z",
  "user": {
    "id": "user-student-1",
    "name": "Student",
    "email": "student@school",
    "role": "student",
    "teacherId": "user-teacher-1"
  }
}
```

This role-only login is for development and must be replaced before deployment.

## Workflow

```text
Admin creates congress and sessions
             |
Student creates draft -> submits to teacher
             |
Teacher approves / rejects / requests changes
             |
Student receives the updated status
```

Booking states:

```text
draft -> submitted -> approved
                   -> rejected
                   -> changes_requested -> submitted

draft/submitted/changes_requested/approved -> cancelled
```

Only approved bookings consume capacity. Capacity is checked again when the teacher approves a request.

## Endpoints

### General

| Method | Route | Role | Result |
|---|---|---|---|
| `GET` | `/health` | Public | Health and framework information |
| `POST` | `/auth/login` | Public | Create a temporary role session |
| `POST` | `/auth/logout` | Any | End the current login session |
| `GET` | `/me` | Any | Current user and assigned teacher |
| `GET` | `/teachers` | Any | Teacher list |

### Congresses and sessions

| Method | Route | Role | Result |
|---|---|---|---|
| `GET` | `/congresses` | Any | Congresses, sessions, and availability |
| `GET` | `/congresses/:congressId` | Any | One congress |
| `POST` | `/congresses` | Admin | Create a congress |
| `PATCH` | `/congresses/:congressId` | Admin | Update a congress |
| `POST` | `/congresses/:congressId/sessions` | Admin | Create a session |

Create a congress:

```json
{
  "title": "Student Research Congress 2026",
  "description": "A school research congress",
  "venue": "School Auditorium",
  "startsAt": "2026-09-06T01:00:00.000Z",
  "endsAt": "2026-09-06T08:00:00.000Z",
  "registrationOpen": true
}
```

Create a session:

```json
{
  "title": "Robotics Research",
  "description": "Student robotics presentations",
  "startsAt": "2026-09-06T02:00:00.000Z",
  "endsAt": "2026-09-06T03:00:00.000Z",
  "capacity": 30
}
```

Session responses include calculated fields:

```json
{
  "id": "session-id",
  "capacity": 30,
  "approvedBookings": 0,
  "availablePlaces": 30
}
```

### Bookings

| Method | Route | Role | Result |
|---|---|---|---|
| `GET` | `/bookings` | Any | Role-filtered bookings; supports `?status=submitted` |
| `GET` | `/bookings/:bookingId` | Authorized viewer | One booking |
| `POST` | `/bookings` | Student | Create a draft |
| `PATCH` | `/bookings/:bookingId` | Owning student | Edit a draft or requested changes |
| `POST` | `/bookings/:bookingId/submit` | Owning student | Submit to the assigned teacher |
| `POST` | `/bookings/:bookingId/review` | Assigned teacher/admin | Review a submitted booking |
| `POST` | `/bookings/:bookingId/cancel` | Owning student/admin | Cancel a booking |

Create a draft:

```json
{
  "congressId": "congress-id-from-api",
  "sessionIds": ["session-id-from-api"],
  "studentMessage": "I would like to attend this session."
}
```

Approve a submitted booking:

```json
{
  "action": "approve",
  "teacherComment": "Approved."
}
```

`action` may be `approve`, `reject`, or `request_changes`. A comment is required for `reject` and `request_changes`.

Students can have one active booking per congress. Select multiple sessions by putting all their IDs in the same `sessionIds` array.

## WebSocket

Connect to `ws://localhost:3001/ws` and authenticate within five seconds:

```json
{ "event": "auth", "data": { "token": "temporary-session-token" } }
```

Server message envelope:

```json
{
  "id": "message-id",
  "event": "booking.status.updated",
  "timestamp": "2026-08-07T08:00:00.000Z",
  "data": {}
}
```

| Event | Recipient | Purpose |
|---|---|---|
| `connection.ready` | Connected user | Authentication succeeded |
| `booking.submitted` | Assigned teacher/admin | Add request to review queue |
| `booking.status.updated` | Student, teacher/admin | Update the booking status |
| `booking.cancelled` | Student, teacher/admin | Update/remove cancelled booking |
| `session.capacity.updated` | All connected users | Refresh availability |
| `notification.created` | Relevant user/admin | Display a notification |
| `pong` | Requesting user | Response to `ping` |
| `socket.error` | Requesting user | Invalid authentication or event |

After reconnecting, reload the relevant HTTP data before processing new WebSocket events.

## Errors

```json
{
  "error": {
    "code": "SESSION_FULL",
    "message": "Robotics Research has reached its capacity.",
    "fields": {}
  }
}
```

The frontend should branch on `error.code` and display `error.message` where appropriate.

## Console action logs

The server logs successful user actions without logging tokens, comments, or student messages:

```text
[RCBooking] 2026-08-07T09:30:00.000Z student:user-student-1 booking.submitted bookingId=abc123 teacherId=user-teacher-1
```

Logged actions: login, logout, congress create/update, session create, booking create/update/submit/review/cancel.
