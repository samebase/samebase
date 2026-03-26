export function formatStopwatchDuration(elapsedMs: number): string {
  const totalTenths = Math.max(0, Math.floor(elapsedMs / 100));
  const hours = Math.floor(totalTenths / 36000);
  const minutes = Math.floor((totalTenths % 36000) / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  const minuteSection = String(minutes).padStart(2, "0");
  const secondSection = String(seconds).padStart(2, "0");
  const shortLabel = `${minuteSection}:${secondSection}.${tenths}`;

  if (hours === 0) {
    return shortLabel;
  }

  return `${hours}:${shortLabel}`;
}
