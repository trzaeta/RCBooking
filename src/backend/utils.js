export function now() { return new Date().toISOString(); }

export function publicUser(user) {
  if (!user) return null;
  const { id, name, email, role, teacherId } = user;
  return { id, name, email, role, teacherId };
}

export function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
