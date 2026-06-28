import { useLayoutEffect, useRef, useState } from "react";
import { createSamebaseSocialCardSvgMarkup } from "@/components/socialLogoAssets";

const SOCIAL_CARD_WIDTH = 1200;
const SOCIAL_CARD_HEIGHT = 630;

type SocialCardTextMetric = {
  label: string;
  left: number;
  right: number;
  rightMargin: number;
  width: number;
};

function formatPixels(value: number) {
  return `${value}px`;
}

function readMetricLabel(metricKey: string) {
  if (metricKey === "site-name") {
    return "samebase.com";
  }
  if (metricKey === "tagline-line-one") {
    return "tagline 1";
  }
  if (metricKey === "tagline-line-two") {
    return "tagline 2";
  }

  return metricKey;
}

function readSocialCardTextMetrics(root: HTMLDivElement): SocialCardTextMetric[] {
  const metrics: SocialCardTextMetric[] = [];

  for (const element of root.querySelectorAll("[data-social-card-metric]")) {
    if (!(element instanceof SVGGraphicsElement)) {
      continue;
    }

    const metricKey = element.getAttribute("data-social-card-metric");
    if (!metricKey) {
      continue;
    }

    const box = element.getBBox();
    const left = Math.round(box.x);
    const width = Math.round(box.width);
    const right = left + width;
    metrics.push({
      label: readMetricLabel(metricKey),
      left,
      right,
      rightMargin: SOCIAL_CARD_WIDTH - right,
      width,
    });
  }

  return metrics;
}

export function SocialCardVisualFixture() {
  const renderedSvgRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<SocialCardTextMetric[]>([]);
  const markup = createSamebaseSocialCardSvgMarkup();

  // The fixture reads the rendered SVG bounds so design tweaks use browser text metrics.
  useLayoutEffect(() => {
    const renderedSvg = renderedSvgRef.current;
    if (!renderedSvg) {
      return;
    }

    setMetrics(readSocialCardTextMetrics(renderedSvg));
  }, [markup]);

  return (
    <div
      data-testid="social-card-visual-fixture"
      className="grid min-h-screen place-items-center bg-stone-100 p-8 text-stone-950"
    >
      <div className="grid gap-5">
        <div
          ref={renderedSvgRef}
          data-testid="social-card-rendered-svg"
          className="bg-white"
          style={{ height: SOCIAL_CARD_HEIGHT, width: SOCIAL_CARD_WIDTH }}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
        <div className="grid grid-cols-[auto_repeat(4,auto)] gap-x-5 gap-y-2 text-sm text-stone-700">
          <div className="font-medium text-stone-950">text</div>
          <div className="font-medium text-stone-950">left</div>
          <div className="font-medium text-stone-950">width</div>
          <div className="font-medium text-stone-950">right</div>
          <div className="font-medium text-stone-950">right margin</div>
          {metrics.map((metric) => (
            <div key={metric.label} className="contents">
              <div>{metric.label}</div>
              <div>{formatPixels(metric.left)}</div>
              <div>{formatPixels(metric.width)}</div>
              <div>{formatPixels(metric.right)}</div>
              <div>{formatPixels(metric.rightMargin)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
