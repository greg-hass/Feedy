import { checkReadiness, readinessExitCode } from "@/lib/health";

async function main() {
  const result = await checkReadiness();
  process.exit(readinessExitCode(result));
}

void main();
