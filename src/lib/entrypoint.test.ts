import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

function runEntrypoint(mode: string) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "feedy-entrypoint-"));
  const binDir = path.join(tempDir, "bin");
  const logPath = path.join(tempDir, "commands.log");
  const dataDir = path.join(tempDir, "data");

  spawnSync("mkdir", ["-p", binDir, dataDir], { encoding: "utf8" });

  const nodeStub = path.join(binDir, "node");
  const prismaStub = path.join(binDir, "prisma");
  writeFileSync(
    nodeStub,
    `#!/bin/sh\nprintf 'node %s\\n' "$*" >> "${logPath}"\nexit 0\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    prismaStub,
    `#!/bin/sh\nprintf 'prisma %s\\n' "$*" >> "${logPath}"\nexit 0\n`,
    { mode: 0o755 },
  );

  const result = spawnSync("sh", ["docker/entrypoint.sh", mode], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      NODE_BIN: nodeStub,
      PRISMA_BIN: prismaStub,
    },
    encoding: "utf8",
  });

  return {
    result,
    commands: readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean),
  };
}

describe("docker entrypoint", () => {
  it("runs migrations and seed only in migrate mode", () => {
    assert.deepEqual(runEntrypoint("migrate").commands, [
      "prisma migrate deploy --schema /app/prisma/schema.prisma",
      "node /app/dist/prisma/seed.js",
    ]);

    assert.deepEqual(runEntrypoint("web").commands, ["node /app/server.js"]);
    assert.deepEqual(runEntrypoint("worker").commands, ["node /app/dist/src/worker.js"]);
  });
});
