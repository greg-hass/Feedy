import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getProductionEnvProblems } from "@/lib/env";

const strongConfig = {
  AUTH_SECRET: "a-unique-random-production-secret-value",
  APP_PASSWORD: "a-unique-production-password",
} as const;

describe("production environment validation", () => {
  it("permits explicitly configured private LAN HTTP hosting", () => {
    const problems = getProductionEnvProblems({
      ...strongConfig,
      APP_URL: "http://192.168.1.186:4000",
      COOKIE_SECURE: "false",
    });

    assert.deepEqual(problems, []);
  });

  it("rejects placeholder credentials even on private deployments", () => {
    const problems = getProductionEnvProblems({
      APP_URL: "http://192.168.1.186:4000",
      AUTH_SECRET: "development-build-secret-0001",
      APP_PASSWORD: "change-me",
      COOKIE_SECURE: "false",
    });

    assert.equal(problems.length, 2);
  });

  it("requires HTTPS and secure cookies for public production URLs", () => {
    assert.ok(
      getProductionEnvProblems({
        ...strongConfig,
        APP_URL: "http://feeds.example.com",
        COOKIE_SECURE: "false",
      }).length > 0,
    );

    assert.deepEqual(
      getProductionEnvProblems({
        ...strongConfig,
        APP_URL: "https://feeds.example.com",
        COOKIE_SECURE: "true",
      }),
      [],
    );
  });
});
