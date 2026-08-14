export function now() { return new Date().toISOString(); }

export function publicUser(user) { if (!user) return null; const { id, name, email, schoolEmail, requestedRole, role, teacherId, createdAt, updatedAt } = user; return { id, name, email, schoolEmail, requestedRole, role, teacherId, createdAt, updatedAt }; }

export function parseDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
