import { useLayoutEffect, useRef, useState } from "react";
import { SamebaseAttribution } from "../../../../templates/base/src/components/SamebaseAttribution";

const guideScale = 10;

export function SamebaseAttributionVisualFixture() {
  const comparison = useRef<HTMLDivElement>(null);
  const baseline = useRef<HTMLSpanElement>(null);
  const [guides, setGuides] = useState<
    { label: string; top: number; left: number; width: number }[]
  >([]);

  useLayoutEffect(() => {
    const container = comparison.current;
    const marker = baseline.current;
    const brand = container?.querySelector("b");
    const context = document.createElement("canvas").getContext("2d");
    if (!container || !marker || !brand || !context) return;

    const measure = () => {
      const font = getComputedStyle(brand);
      context.font = `${font.fontStyle} ${font.fontWeight} ${parseFloat(font.fontSize) * guideScale}px ${font.fontFamily}`;
      const bounds = container.getBoundingClientRect();
      const text = brand.getBoundingClientRect();
      const baselineY = marker.getBoundingClientRect().top - bounds.top;
      setGuides(
        [
          { label: "Capital top (S)", offset: -context.measureText("S").actualBoundingBoxAscent },
          { label: "Lowercase top (x)", offset: -context.measureText("x").actualBoundingBoxAscent },
          { label: "Baseline", offset: 0 },
          { label: "Descender (g)", offset: context.measureText("g").actualBoundingBoxDescent },
        ].map(({ label, offset }) => ({
          label,
          top: baselineY + offset,
          left: text.left - bounds.left,
          width: text.width,
        })),
      );
    };

    // Re-measure when source edits or loaded fonts change the live comparison.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    let disposed = false;
    void document.fonts.ready.then(() => {
      if (!disposed) measure();
    });
    measure();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div data-testid="samebase-attribution-visual-fixture" className="w-80">
        <div className="bg-white p-4 text-[#394447]">
          <SamebaseAttribution />
        </div>
        <div className="bg-black p-4 text-white">
          <SamebaseAttribution />
        </div>
        <div className="bg-[#e3e7e3] p-4 text-[#6b766f]">
          <SamebaseAttribution />
        </div>
      </div>
      <div className="overflow-x-auto bg-white p-4 text-[#394447]">
        <p className="text-sm">Alignment guides · {guideScale}×</p>
        <div
          ref={comparison}
          data-testid="samebase-attribution-guides"
          className="relative w-max pr-40"
        >
          <span className="inline-block whitespace-nowrap" style={{ zoom: guideScale }}>
            <SamebaseAttribution />
            <span ref={baseline} className="inline-block h-0 w-0 align-baseline" />
          </span>
          {guides.map(({ label, top, left, width }) => (
            <div
              key={label}
              className="pointer-events-none absolute border-t border-dashed border-cyan-600"
              style={{ top, left, width }}
            >
              <span className="absolute left-full -translate-y-1/2 pl-3 text-xs whitespace-nowrap text-cyan-700">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
