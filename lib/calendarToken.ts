import { createHmac } from "crypto";

function secret() {
  return process.env.NEXTAUTH_SECRET ?? "pitstop-dev-secret";
}

export function generateCalendarToken(userId: string): string {
  const payload = Buffer.from(userId).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyCalendarToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (expected !== sig) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
