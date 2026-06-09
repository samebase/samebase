import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

export const routeUrlEditorOriginMeasureClassName =
  "pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden whitespace-pre font-mono text-base leading-7";

type RouteUrlEditorOriginMeasurement = {
  origin: string;
  widthPx: number;
};

/**
The input value stays a full URL, but the visible text starts at the route slash.
Measure `origin` in the rendered input font so production Chrome does not depend on `ch` matching
the actual origin text width.
*/
export function useRouteUrlEditorPathTextIndent(prefix: string): {
  inputStyle: CSSProperties;
  origin: string;
  originMeasureRef: RefObject<HTMLSpanElement | null>;
} {
  const origin = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const originMeasureRef = useRef<HTMLSpanElement>(null);
  const [measurement, setMeasurement] = useState<RouteUrlEditorOriginMeasurement | null>(null);
  const measuredWidthPx = measurement?.origin === origin ? measurement.widthPx : null;

  useLayoutEffect(() => {
    const element = originMeasureRef.current;

    if (!element) {
      return;
    }

    const widthPx = element.getBoundingClientRect().width;
    setMeasurement((current) =>
      current?.origin === origin && current.widthPx === widthPx ? current : { origin, widthPx },
    );
  }, [origin]);

  const inputStyle = useMemo(
    () => ({
      textIndent: measuredWidthPx === null ? `-${origin.length}ch` : `-${measuredWidthPx}px`,
    }),
    [measuredWidthPx, origin.length],
  );

  return { inputStyle, origin, originMeasureRef };
}
