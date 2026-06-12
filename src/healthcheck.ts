import { checkReadiness, readinessExitCode } from "@/lib/health";

const result = await checkReadiness();
process.exit(readinessExitCode(result));
