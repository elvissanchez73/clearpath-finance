import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db, ensureRuntimeRole } from "./db";
import { config } from "./config";
import { ApiError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { registration, login, changePassword } from "@/lib/validation";

export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const cookieName = () => config().secure ? "__Host-clearpath-session" : "clearpath-session";
export const tokenHash = (token: string) => createHmac("sha256", config().secret).update(token).digest("hex");
export const publicUser = { id: true, name: true, email: true, createdAt: true } as const;

async function issueSession(tx: Prisma.TransactionClient, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await tx.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
  return token;
}

export async function limitAuth(action: string, identifier: string, limit = 10) {
  const key = tokenHash(`${action}:${identifier}`);
  const rows = await db.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "AuthRateLimit" ("key", "attempts", "windowStart") VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AuthRateLimit"."windowStart" < NOW() - INTERVAL '15 minutes' THEN 1 ELSE "AuthRateLimit"."attempts" + 1 END,
      "windowStart" = CASE WHEN "AuthRateLimit"."windowStart" < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE "AuthRateLimit"."windowStart" END
    RETURNING "attempts"`;
  if (rows[0].attempts > limit) throw new ApiError(429, "Too many attempts. Please try again in 15 minutes.");
}

export async function register(input: unknown) {
  await ensureRuntimeRole();
  const data = registration.parse(input);
  await limitAuth("register-global", "all", 100);
  await limitAuth("register", data.email, 5);
  const passwordHash = await hashPassword(data.password);
  try {
    return await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: data.name, email: data.email, passwordHash }, select: publicUser });
      await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`;
      await tx.userSettings.create({ data: { userId: user.id } });
      const token = await issueSession(tx, user.id);
      return { user, token };
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new ApiError(400, "Unable to create this account. Try signing in or use a different email.");
    throw error;
  }
}

export async function signIn(input: unknown) {
  await ensureRuntimeRole();
  const data = login.parse(input);
  await limitAuth("login-global", "all", 500);
  await limitAuth("login", data.email);
  // Lock serializes sign-in with password changes and reset; stale passwords cannot create later sessions.
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE email = ${data.email} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { email: data.email } });
    const valid = await verifyPassword(data.password, user?.passwordHash ?? "invalid");
    if (!user || !valid) throw new ApiError(401, "Email or password is incorrect.");
    const token = await issueSession(tx, user.id);
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  }, { timeout: 15000 });
}

export async function authenticate(token: string | undefined) {
  await ensureRuntimeRole();
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, "Please sign in to continue.");
  const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: publicUser } } });
  if (!session || session.expiresAt <= new Date()) throw new ApiError(401, "Please sign in to continue.");
  return session.user;
}

export async function signOut(token: string | undefined) {
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

export async function updatePassword(userId: string, input: unknown) {
  const data = changePassword.parse(input);
  await limitAuth("password-change", userId, 5);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!await verifyPassword(data.currentPassword, user.passwordHash)) throw new ApiError(400, "Current password is incorrect.");
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(data.password) } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    return issueSession(tx, userId);
  }, { timeout: 15000 });
}

/** Wire to a trusted email provider before exposing a reset-request endpoint. Never return the token to the browser. */
export async function requestPasswordReset(email: string, deliver: (email: string, url: string) => Promise<void>) {
  await limitAuth("reset", email, 3);
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return;
  const token = randomBytes(32).toString("base64url");
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
  });
  await deliver(email, `${config().origin}/reset-password?token=${encodeURIComponent(token)}`);
}

export async function resetPassword(token: string, newPassword: string) {
  const { password } = changePassword.parse({ currentPassword: "reset", password: newPassword, confirmPassword: newPassword });
  const hash = tokenHash(token);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hash } });
  if (!record) throw new ApiError(400, "This reset link is invalid or expired.");
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${record.userId} FOR UPDATE`;
    const fresh = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!fresh || fresh.expiresAt <= new Date()) throw new ApiError(400, "This reset link is invalid or expired.");
    await tx.user.update({ where: { id: fresh.userId }, data: { passwordHash: await hashPassword(password) } });
    await tx.passwordResetToken.deleteMany({ where: { userId: fresh.userId } });
    await tx.session.deleteMany({ where: { userId: fresh.userId } });
  }, { timeout: 15000 });
}
