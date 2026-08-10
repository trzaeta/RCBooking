export type Role = "student" | "teacher" | "admin";

export type BookingStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "cancelled";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginRequest {
  role: Role;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
}

export interface CongressSession {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  approvedBookings: number;
  availablePlaces: number;
}

export interface Congress {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  registrationOpen: boolean;
  sessions: CongressSession[];
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  studentId: string;
  teacherId: string;
  congressId: string;
  sessionIds: string[];
  status: BookingStatus;
  studentMessage?: string;
  teacherComment?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
}

export interface BookingView extends Booking {
  student: User;
  teacher: User;
  congressTitle: string;
  sessions: Array<Pick<CongressSession, "id" | "title" | "startsAt" | "endsAt">>;
}

export type ClientSocketMessage =
  | { event: "auth"; data: { token: string } }
  | { event: "ping"; data?: Record<string, never> };

export interface ServerEventMap {
  "connection.ready": { user: User };
  "booking.submitted": { booking: BookingView };
  "booking.status.updated": { booking: BookingView };
  "booking.cancelled": { booking: BookingView };
  "session.capacity.updated": {
    congressId: string;
    sessionId: string;
    approvedBookings: number;
    availablePlaces: number;
  };
  "notification.created": {
    id: string;
    message: string;
    bookingId?: string;
  };
  pong: { timestamp: string };
  "socket.error": { code: string; message: string };
}

export type ServerSocketMessage<E extends keyof ServerEventMap = keyof ServerEventMap> = {
  [K in E]: {
    id: string;
    event: K;
    timestamp: string;
    data: ServerEventMap[K];
  };
}[E];

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fields: Record<string, string>;
  };
}
