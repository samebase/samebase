import { useEffect, useState } from "react";

export function useNow({
  enabled = true,
  intervalMs = 1_000,
}: {
  enabled?: boolean;
  intervalMs?: number;
} = {}) {
  const [now, setNow] = useState(Date.now());
  const normalizedIntervalMs =
    Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 1_000;

  useEffect(() => {
    if (!enabled) {
      setNow(Date.now());
      return;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, normalizedIntervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, normalizedIntervalMs]);

  return now;
}
