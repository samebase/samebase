export function formatRelativeTimeAgo(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatRelativeTimeAgoWithSeconds(
  timestamp: number,
  now: number = Date.now(),
): string {
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  return formatRelativeTimeAgo(timestamp, now);
}

export function formatRelativeTimeUntil(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, timestamp - now);
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) {
    return "in <1m";
  }
  if (minutes < 60) {
    return `in ${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `in ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}
