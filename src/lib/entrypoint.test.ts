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

  writeFileSync(
    path.join(binDir, "npm"),
    `#!/bin/sh\nprintf 'npm %s\\n' "$*" >> "${logPath}"\nexit 0\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(binDir, "npx"),
    `#!/bin/sh\nprintf 'npx %s\\n' "$*" >> "${logPath}"\nexit 0\n`,
    { mode: 0o755 },
  );

  const result = spawnSync("sh", ["docker/entrypoint.sh", mode], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
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
      "npx prisma migrate deploy",
      "npm run seed",
    ]);

    assert.deepEqual(runEntrypoint("web").commands, ["npm run start"]);
    assert.deepEqual(runEntrypoint("worker").commands, ["npm run worker"]);
  });
});
