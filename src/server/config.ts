import "server-only";
export function config() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("REPLACE")) throw new Error("AUTH_SECRET must contain at least 32 random characters.");
  const origin = new URL(process.env.APP_ORIGIN || "http://127.0.0.1:3000").origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) throw new Error("Production requires an HTTPS APP_ORIGIN.");
  return { secret, origin, secure: process.env.NODE_ENV === "production" };
}
