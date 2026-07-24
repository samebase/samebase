import { includes } from "@samebase/dependent";

export const LOGO_LEFT_FACE_STYLE_KINDS = ["secondary", "striped"] as const;
export const LOGO_LEFT_FACE_STRIPE_BASIS_VALUES = [
  "auto",
  "horizontal",
  "vertical",
  "raw",
] as const;

export type LogoLeftFaceStyleKind = (typeof LOGO_LEFT_FACE_STYLE_KINDS)[number];
export type LogoLeftFaceStripeBasis = (typeof LOGO_LEFT_FACE_STRIPE_BASIS_VALUES)[number];

export type LogoSecondaryLeftFaceStyle = {
  kind: "secondary";
};

export type LogoStripedLeftFaceStyle = {
  kind: "striped";
  stripeAngleDegrees: number;
  stripeBasis: LogoLeftFaceStripeBasis;
  stripeGap: number;
  stripeGapLinked: boolean;
  stripeOffset: number;
  stripeWidth: number;
};

export type LogoLeftFaceStyle = LogoSecondaryLeftFaceStyle | LogoStripedLeftFaceStyle;

export const LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE = {
  kind: "striped",
  stripeAngleDegrees: -45,
  stripeBasis: "vertical",
  stripeGap: 0.25,
  stripeGapLinked: false,
  stripeOffset: 0,
  stripeWidth: 0.25,
} satisfies LogoStripedLeftFaceStyle;

export const LOGO_SECONDARY_LEFT_FACE_STYLE: LogoSecondaryLeftFaceStyle = {
  kind: "secondary",
};

export const DEFAULT_LOGO_LEFT_FACE_STYLE = LOGO_SECONDARY_LEFT_FACE_STYLE;

export const LOGO_LEFT_FACE_STRIPE = {
  angleDegrees: {
    defaultValue: LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeAngleDegrees,
    max: 90,
    min: -90,
    step: 0.001,
  },
  basis: {
    defaultValue: LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeBasis,
  },
  gap: {
    defaultValue: LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeGap,
    max: 1,
    min: 0,
    step: 0.01,
  },
  gapLinked: {
    defaultValue: LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeGapLinked,
  },
  offset: {
    defaultValue: LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeOffset,
    max: 1,
    min: 0,
    step: 0.01,
  },
  width: {
    defaultValue: LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeWidth,
    max: 1,
    min: 0,
    step: 0.01,
  },
} as const;

const LOGO_LEFT_FACE_STRIPE_AXIS_EPSILON = 1e-12;

function clampFiniteNumber({
  fallback,
  max,
  min,
  value,
}: {
  fallback: number;
  max: number;
  min: number;
  value: number;
}): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

export function isLogoLeftFaceStyleKind(value: string | undefined) {
  return includes(LOGO_LEFT_FACE_STYLE_KINDS, value);
}

export function isLogoLeftFaceStripeBasis(value: string | undefined) {
  return includes(LOGO_LEFT_FACE_STRIPE_BASIS_VALUES, value);
}

export function normalizeLogoLeftFaceStripeAngleDegrees(value: number): number {
  return clampFiniteNumber({
    fallback: LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue,
    max: LOGO_LEFT_FACE_STRIPE.angleDegrees.max,
    min: LOGO_LEFT_FACE_STRIPE.angleDegrees.min,
    value,
  });
}

export function normalizeLogoLeftFaceStripeGap(value: number): number {
  return clampFiniteNumber({
    fallback: LOGO_LEFT_FACE_STRIPE.gap.defaultValue,
    max: LOGO_LEFT_FACE_STRIPE.gap.max,
    min: LOGO_LEFT_FACE_STRIPE.gap.min,
    value,
  });
}

export function normalizeLogoLeftFaceStripeOffset(value: number): number {
  return clampFiniteNumber({
    fallback: LOGO_LEFT_FACE_STRIPE.offset.defaultValue,
    max: LOGO_LEFT_FACE_STRIPE.offset.max,
    min: LOGO_LEFT_FACE_STRIPE.offset.min,
    value,
  });
}

export function normalizeLogoLeftFaceStripeWidth(value: number): number {
  return clampFiniteNumber({
    fallback: LOGO_LEFT_FACE_STRIPE.width.defaultValue,
    max: LOGO_LEFT_FACE_STRIPE.width.max,
    min: LOGO_LEFT_FACE_STRIPE.width.min,
    value,
  });
}

function readLogoLeftFaceStripeAxisProjection(value: number): number {
  const projection = Math.abs(value);
  return projection < LOGO_LEFT_FACE_STRIPE_AXIS_EPSILON ? 0 : projection;
}

/**
 * User controls can describe stripe width/gap on a screen-like cross-section;
 * the shader needs the perpendicular distance between stripe boundaries.
 */
export function getLogoLeftFaceStripeBasisScale(
  style: Pick<LogoStripedLeftFaceStyle, "stripeAngleDegrees" | "stripeBasis">,
): number {
  const stripeAngleRadians = (style.stripeAngleDegrees * Math.PI) / 180;
  const horizontalProjection = readLogoLeftFaceStripeAxisProjection(Math.sin(stripeAngleRadians));
  const verticalProjection = readLogoLeftFaceStripeAxisProjection(Math.cos(stripeAngleRadians));

  switch (style.stripeBasis) {
    case "auto":
      return Math.max(horizontalProjection, verticalProjection);
    case "horizontal":
      return horizontalProjection;
    case "vertical":
      return verticalProjection;
    case "raw":
      return 1;
    default: {
      const unreachable = style.stripeBasis satisfies never;
      return unreachable;
    }
  }
}

export function normalizeLogoLeftFaceStyle(style: LogoLeftFaceStyle): LogoLeftFaceStyle {
  if (style.kind === "secondary") {
    return LOGO_SECONDARY_LEFT_FACE_STYLE;
  }

  const stripeWidth = normalizeLogoLeftFaceStripeWidth(style.stripeWidth);

  return {
    kind: "striped",
    stripeAngleDegrees: normalizeLogoLeftFaceStripeAngleDegrees(style.stripeAngleDegrees),
    stripeBasis: style.stripeBasis,
    // When stripeGapLinked is true, stripeGap must track stripeWidth; otherwise
    // normalizeLogoLeftFaceStripeGap handles the independent gap value.
    stripeGap: style.stripeGapLinked
      ? stripeWidth
      : normalizeLogoLeftFaceStripeGap(style.stripeGap),
    stripeGapLinked: style.stripeGapLinked,
    stripeOffset: normalizeLogoLeftFaceStripeOffset(style.stripeOffset),
    stripeWidth,
  };
}

export function readLogoLeftFaceStyle(search: {
  leftFace?: LogoLeftFaceStyleKind;
  stripeA?: number;
  stripeBasis?: LogoLeftFaceStripeBasis;
  stripeG?: number;
  stripeLink?: true;
  stripeO?: number;
  stripeW?: number;
}): LogoLeftFaceStyle {
  if (search.leftFace === "secondary") {
    return LOGO_SECONDARY_LEFT_FACE_STYLE;
  }

  if (search.leftFace !== "striped") {
    return DEFAULT_LOGO_LEFT_FACE_STYLE;
  }

  const stripeGapLinked = search.stripeLink === true;
  // Prefer search.stripeW; when stripeGapLinked and search.stripeW is absent,
  // reuse search.stripeG before LOGO_LEFT_FACE_STRIPE.width.defaultValue.
  const stripeWidth =
    search.stripeW ??
    (stripeGapLinked ? search.stripeG : undefined) ??
    LOGO_LEFT_FACE_STRIPE.width.defaultValue;

  return normalizeLogoLeftFaceStyle({
    kind: "striped",
    stripeAngleDegrees: search.stripeA ?? LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue,
    stripeBasis: search.stripeBasis ?? LOGO_LEFT_FACE_STRIPE.basis.defaultValue,
    stripeGap: search.stripeG ?? LOGO_LEFT_FACE_STRIPE.gap.defaultValue,
    stripeGapLinked,
    stripeOffset: search.stripeO ?? LOGO_LEFT_FACE_STRIPE.offset.defaultValue,
    stripeWidth,
  });
}

export function areLogoLeftFaceStylesEqual(
  left: LogoLeftFaceStyle,
  right: LogoLeftFaceStyle,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "secondary" && right.kind === "secondary") {
    return true;
  }

  if (left.kind === "striped" && right.kind === "striped") {
    return (
      left.stripeAngleDegrees === right.stripeAngleDegrees &&
      left.stripeBasis === right.stripeBasis &&
      left.stripeGap === right.stripeGap &&
      left.stripeGapLinked === right.stripeGapLinked &&
      left.stripeOffset === right.stripeOffset &&
      left.stripeWidth === right.stripeWidth
    );
  }

  return false;
}
