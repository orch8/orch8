// drizzle-orm ≥0.45 wraps driver errors in DrizzleQueryError whose message is the
// failed SQL; the original postgres error lives on .cause (with .code and .message).
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  if (!e) return false;
  const code = e.code ?? e.cause?.code;
  const message = `${e.message ?? ""}\n${e.cause?.message ?? ""}`;
  const isUnique = code === "23505" || /duplicate key|unique constraint/i.test(message);
  if (!isUnique) return false;
  if (constraint) return message.includes(constraint);
  return true;
}
