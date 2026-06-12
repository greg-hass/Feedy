export function formatSourceType(value: string) {
  return value.replaceAll("_RSS", "").replaceAll("_", " ");
}
