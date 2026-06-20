export function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
}
