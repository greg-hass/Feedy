import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Dockerfile runtime hardening", () => {
  it("runs the application as a non-root user", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(dockerfile, /^USER\s+feedy$/m);
  });

  it("keeps Prisma migrate engine directories writable for the non-root user", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(
      dockerfile,
      /chown -R feedy:feedy .*\/app\/node_modules\/@prisma .*\/app\/node_modules\/prisma/,
    );
  });

  it("copies the generated Prisma client after npm installs runtime dependencies", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.ok(
      dockerfile.indexOf("RUN npm ci --omit=dev --ignore-scripts") <
        dockerfile.indexOf("COPY --from=builder /app/node_modules/.prisma node_modules/.prisma"),
    );
  });

  it("copies tsconfig into the runtime image for tsx path aliases", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    assert.match(dockerfile, /COPY package\.json package-lock\.json tsconfig\.json \.\//);
  });
});
