import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("docker compose startup ordering", () => {
  it("runs migrations in a one-shot service before web and worker start", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");

    assert.match(compose, /\n  migrate:\n[\s\S]*?command: \["\.\/docker\/entrypoint\.sh", "migrate"\]/);
    assert.match(compose, /\n  web:\n[\s\S]*?migrate:\n\s+condition: service_completed_successfully/);
    assert.match(compose, /\n  worker:\n[\s\S]*?migrate:\n\s+condition: service_completed_successfully/);
  });
});
