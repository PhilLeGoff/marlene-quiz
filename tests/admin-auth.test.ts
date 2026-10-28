import { beforeEach, describe, expect, it } from "vitest";
import { env } from "./cloudflare-env";
import { actor, hash, requireAdminPassword } from "../lib/game/auth";
import { createParty } from "../lib/game/seed";
beforeEach(() => {
  env.ADMIN_PASSWORD = "unit-admin-secret";
});
describe("admin password gate", () => {
  it("refuses missing and incorrect passwords", async () => {
    await expect(requireAdminPassword(undefined)).rejects.toThrow("incorrect");
    await expect(requireAdminPassword("incorrect")).rejects.toThrow(
      "incorrect",
    );
    expect(await requireAdminPassword("unit-admin-secret")).toBe(
      await hash("unit-admin-secret"),
    );
  });
  it("requires the password again for old name-only admin sessions while preserving identity", async () => {
    const p = createParty("123456", { admin: "", marlene: "" });
    p.players.push({
      id: "host",
      nickname: "Hôte",
      avatar: 0,
      active: true,
      joinedAt: 1,
      role: "admin",
    });
    const key = await hash("session-token");
    p.sessions[key] = {
      role: "admin",
      playerId: "host",
      expires: Date.now() + 60000,
    };
    const req = new Request("https://party.test/api/game?as=admin", {
      headers: { cookie: "marlene_admin=session-token" },
    });
    expect(await actor(req, p, "admin")).toBeNull();
    expect(await actor(req, p, "admin", true)).toEqual({
      role: "admin",
      playerId: "host",
    });
    p.sessions[key].adminProof =
      await requireAdminPassword("unit-admin-secret");
    expect(await actor(req, p, "admin")).toEqual({
      role: "admin",
      playerId: "host",
    });
    env.ADMIN_PASSWORD = "changed-secret";
    expect(await actor(req, p, "admin")).toBeNull();
  });
  it("leaves guest and Marlene sessions password-free", async () => {
    const p = createParty("123456", { admin: "", marlene: "" });
    delete env.ADMIN_PASSWORD;
    for (const role of ["guest", "marlene"] as const) {
      p.players.push({
        id: role,
        nickname: role,
        avatar: 0,
        active: true,
        joinedAt: 1,
        role,
      });
      p.sessions[await hash(role)] = {
        role,
        playerId: role,
        expires: Date.now() + 60000,
      };
      const req = new Request("https://party.test", {
        headers: { cookie: `marlene_${role}=${role}` },
      });
      expect(await actor(req, p, role)).toEqual({ role, playerId: role });
    }
  });
});
