import { useEffect, useEffectEvent, useRef } from "react";

export function useAnimationFrameLoop({
  isRunning,
  onFrame,
}: {
  isRunning: boolean;
  onFrame: (deltaSeconds: number) => void;
}) {
  const lastTimestampMsRef = useRef<number | null>(null);
  const onAnimationFrame = useEffectEvent((timestampMs: number) => {
    const lastTimestampMs = lastTimestampMsRef.current;
    if (lastTimestampMs !== null) {
      onFrame((timestampMs - lastTimestampMs) / 1000);
    }

    lastTimestampMsRef.current = timestampMs;
  });

  /**
   * Owns the browser animation-frame subscription while a live animation is
   * active. The Effect Event keeps each frame on the latest callback without
   * restarting the browser loop on every render.
   */
  useEffect(() => {
    if (!isRunning) {
      lastTimestampMsRef.current = null;
      return;
    }

    const step = (timestampMs: number) => {
      onAnimationFrame(timestampMs);
      animationFrameId = window.requestAnimationFrame(step);
    };

    let animationFrameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      lastTimestampMsRef.current = null;
    };
  }, [isRunning]);
}
