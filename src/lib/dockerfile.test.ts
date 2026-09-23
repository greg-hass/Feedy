import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Dockerfile runtime hardening", () => {
  it("runs the application as a non-root user", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(dockerfile, /^USER\s+feedy$/m);
  });

  it("keeps the isolated Prisma migration CLI writable for the non-root user", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(dockerfile, /npm install --no-save --ignore-scripts prisma@6\.7\.0/);
    assert.match(dockerfile, /chown -R feedy:feedy \/opt\/prisma/);
  });

  it("uses Next standalone output with its generated Prisma client", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(
      dockerfile,
      /COPY --from=builder --chown=feedy:feedy \/app\/\.next\/standalone \.\//,
    );
  });

  it("bundles worker entrypoints instead of installing tsx in the runtime image", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(dockerfile, /npx esbuild src\/worker\.ts src\/healthcheck\.ts prisma\/seed\.ts/);
    assert.doesNotMatch(dockerfile, /npm install .*tsx/);
  });
});
