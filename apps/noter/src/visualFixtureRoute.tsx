import { useEffect, useRef } from "react";
import { mountVisualFixture } from "./visualFixture";

export default function Component() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Keep the legacy standalone fixture surface reachable in framework builds.
    return mountVisualFixture(containerRef.current);
  }, []);

  return <div ref={containerRef} />;
}
