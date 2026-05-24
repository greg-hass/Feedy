export async function runBackgroundTask(
  label: string,
  task: () => Promise<unknown>,
  onError: (...args: unknown[]) => void = console.error,
) {
  try {
    await task();
  } catch (error) {
    onError(`[worker] ${label} failed`, error);
  }
}
