export function vibrateIfSupported(
  navigatorLike: { vibrate?: (pattern: number | number[]) => boolean } | undefined,
  durationMs: number,
) {
  if (!navigatorLike?.vibrate) {
    return false;
  }

  return navigatorLike.vibrate(durationMs);
}
