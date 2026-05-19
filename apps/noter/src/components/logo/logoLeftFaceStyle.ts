export const LOGO_LEFT_FACE_STYLE_KINDS = ["secondary", "striped"] as const;

export type LogoLeftFaceStyleKind = (typeof LOGO_LEFT_FACE_STYLE_KINDS)[number];

export type LogoSecondaryLeftFaceStyle = {
  kind: "secondary";
};

export type LogoStripedLeftFaceStyle = {
  kind: "striped";
  stripeAngleDegrees: number;
  stripeGap: number;
  stripeGapLinked: boolean;
  stripeOffset: number;
  stripeWidth: number;
};

export type LogoLeftFaceStyle =
  | LogoSecondaryLeftFaceStyle
  | LogoStripedLeftFaceStyle;

export const DEFAULT_LOGO_LEFT_FACE_STYLE: LogoSecondaryLeftFaceStyle = {
  kind: "secondary",
};

export const DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES = 45;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP = 0.2;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP_LINKED = false;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET = 0;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH = 0.16;
export const LOGO_LEFT_FACE_STRIPE_ANGLE_STEP = 1;
export const LOGO_LEFT_FACE_STRIPE_GAP_STEP = 0.01;
export const LOGO_LEFT_FACE_STRIPE_OFFSET_STEP = 0.01;
export const LOGO_LEFT_FACE_STRIPE_WIDTH_STEP = 0.01;
export const MAX_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES = 90;
export const MAX_LOGO_LEFT_FACE_STRIPE_GAP = 1;
export const MAX_LOGO_LEFT_FACE_STRIPE_OFFSET = 1;
export const MAX_LOGO_LEFT_FACE_STRIPE_WIDTH = 1;
export const MIN_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES = -90;
export const MIN_LOGO_LEFT_FACE_STRIPE_GAP = 0;
export const MIN_LOGO_LEFT_FACE_STRIPE_OFFSET = 0;
export const MIN_LOGO_LEFT_FACE_STRIPE_WIDTH = 0;

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

export function isLogoLeftFaceStyleKind(
  value: string | undefined,
): value is LogoLeftFaceStyleKind {
  return value === "secondary" || value === "striped";
}

export function normalizeLogoLeftFaceStripeAngleDegrees(value: number): number {
  return clampFiniteNumber({
    fallback: DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
    max: MAX_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
    min: MIN_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
    value,
  });
}

export function normalizeLogoLeftFaceStripeGap(value: number): number {
  return clampFiniteNumber({
    fallback: DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP,
    max: MAX_LOGO_LEFT_FACE_STRIPE_GAP,
    min: MIN_LOGO_LEFT_FACE_STRIPE_GAP,
    value,
  });
}

export function normalizeLogoLeftFaceStripeOffset(value: number): number {
  return clampFiniteNumber({
    fallback: DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET,
    max: MAX_LOGO_LEFT_FACE_STRIPE_OFFSET,
    min: MIN_LOGO_LEFT_FACE_STRIPE_OFFSET,
    value,
  });
}

export function normalizeLogoLeftFaceStripeWidth(value: number): number {
  return clampFiniteNumber({
    fallback: DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH,
    max: MAX_LOGO_LEFT_FACE_STRIPE_WIDTH,
    min: MIN_LOGO_LEFT_FACE_STRIPE_WIDTH,
    value,
  });
}

export function normalizeLogoLeftFaceStyle(
  style: LogoLeftFaceStyle,
): LogoLeftFaceStyle {
  if (style.kind === "secondary") {
    return DEFAULT_LOGO_LEFT_FACE_STYLE;
  }

  const stripeWidth = normalizeLogoLeftFaceStripeWidth(style.stripeWidth);

  return {
    kind: "striped",
    stripeAngleDegrees: normalizeLogoLeftFaceStripeAngleDegrees(
      style.stripeAngleDegrees,
    ),
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
  stripeG?: number;
  stripeLink?: true;
  stripeO?: number;
  stripeW?: number;
}): LogoLeftFaceStyle {
  if (search.leftFace !== "striped") {
    return DEFAULT_LOGO_LEFT_FACE_STYLE;
  }

  const stripeGapLinked = search.stripeLink === true;
  const stripeWidth =
    search.stripeW ??
    (stripeGapLinked ? search.stripeG : undefined) ??
    DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH;

  return normalizeLogoLeftFaceStyle({
    kind: "striped",
    stripeAngleDegrees:
      search.stripeA ?? DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
    stripeGap: search.stripeG ?? DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP,
    stripeGapLinked,
    stripeOffset: search.stripeO ?? DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET,
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
      left.stripeGap === right.stripeGap &&
      left.stripeGapLinked === right.stripeGapLinked &&
      left.stripeOffset === right.stripeOffset &&
      left.stripeWidth === right.stripeWidth
    );
  }

  return false;
}
