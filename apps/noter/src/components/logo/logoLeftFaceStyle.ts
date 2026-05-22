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

export const DEFAULT_LOGO_LEFT_FACE_STYLE: LogoSecondaryLeftFaceStyle = {
  kind: "secondary",
};

export const DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES =
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeAngleDegrees;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS: LogoLeftFaceStripeBasis =
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeBasis;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP =
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeGap;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP_LINKED =
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeGapLinked;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET =
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeOffset;
export const DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH =
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeWidth;
export const LOGO_LEFT_FACE_STRIPE_ANGLE_STEP = 0.001;
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

export function isLogoLeftFaceStyleKind(value: string | undefined): value is LogoLeftFaceStyleKind {
  return value === "secondary" || value === "striped";
}

export function isLogoLeftFaceStripeBasis(
  value: string | undefined,
): value is LogoLeftFaceStripeBasis {
  return value === "auto" || value === "horizontal" || value === "vertical" || value === "raw";
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
    return DEFAULT_LOGO_LEFT_FACE_STYLE;
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
  if (search.leftFace !== "striped") {
    return DEFAULT_LOGO_LEFT_FACE_STYLE;
  }

  const stripeGapLinked = search.stripeLink === true;
  // Prefer search.stripeW; when stripeGapLinked and search.stripeW is absent,
  // reuse search.stripeG before DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH.
  const stripeWidth =
    search.stripeW ??
    (stripeGapLinked ? search.stripeG : undefined) ??
    DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH;

  return normalizeLogoLeftFaceStyle({
    kind: "striped",
    stripeAngleDegrees: search.stripeA ?? DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
    stripeBasis: search.stripeBasis ?? DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS,
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
      left.stripeBasis === right.stripeBasis &&
      left.stripeGap === right.stripeGap &&
      left.stripeGapLinked === right.stripeGapLinked &&
      left.stripeOffset === right.stripeOffset &&
      left.stripeWidth === right.stripeWidth
    );
  }

  return false;
}
