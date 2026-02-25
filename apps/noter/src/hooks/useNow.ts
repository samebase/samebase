import { useEffect, useState } from "react";

export function useNow({
  enabled = true,
  intervalMs = 1_000,
}: {
  enabled?: boolean;
  intervalMs?: number;
} = {}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!enabled) {
      setNow(Date.now());
      return;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, intervalMs]);

  return now;
}
