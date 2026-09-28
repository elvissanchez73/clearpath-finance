import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "./http";
import { ApiError } from "./errors";
export async function pageUser() {
  try { return await currentUser(); } catch (error) { if (error instanceof ApiError && error.status === 401) redirect("/login"); throw error; }
}
