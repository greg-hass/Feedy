export function hasIntegrationTestEnv() {
  return Boolean(process.env.FEEDY_INTEGRATION_TESTS === "true" && process.env.TEST_DATABASE_URL && process.env.TEST_REDIS_URL);
}
