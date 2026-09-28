import { expect, it } from "vitest";
import { registration, preferences } from "@/lib/validation";
const valid = { name: "Alex", email: "Alex@Example.com", password: "a long secure passphrase", confirmPassword: "a long secure passphrase" };
it("normalizes emails", () => expect(registration.parse(valid).email).toBe("alex@example.com"));
it("rejects browser-supplied ownership", () => expect(registration.safeParse({ ...valid, userId: "someone-else" }).success).toBe(false));
it("rejects mismatched passwords", () => expect(registration.safeParse({ ...valid, confirmPassword: "different" }).success).toBe(false));
it("validates time zones on the server", () => expect(preferences.safeParse({ theme: "dark", timezone: "not-a-zone" }).success).toBe(false));
