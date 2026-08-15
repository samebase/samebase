/** Screen-space tilt angles shared by pointer and future motion sources. */
export type LogoPresentationTiltTarget = Readonly<{
  /** Positive degrees tilt toward the right side of the screen. */
  horizontal: number;
  /** Positive degrees tilt toward the top of the screen. */
  vertical: number;
}>;

export const NEUTRAL_LOGO_PRESENTATION_TILT_TARGET: LogoPresentationTiltTarget = {
  horizontal: 0,
  vertical: 0,
};

/** Keep page-wide logo tilt at its current rendered pose inside marked interaction surfaces. */
export const LOGO_PRESENTATION_TILT_SUSPEND_ATTRIBUTE = "data-logo-presentation-tilt-suspend";
export const LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE = 1;
export const LOGO_PRESENTATION_TILT_RADIUS_SCALE_SLIDER_MAX = 2;
export const LOGO_PRESENTATION_TILT_RADIUS_SCALE_SLIDER_MIN = 0;
export const LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE = 1.67;
export const LOGO_PRESENTATION_TILT_STRENGTH_SCALE_SLIDER_MAX = 2;
export const LOGO_PRESENTATION_TILT_STRENGTH_SCALE_SLIDER_MIN = 0;
export const LOGO_PRESENTATION_TILT_SETTLED_DEGREES = 0.01;

const LOGO_PRESENTATION_TILT_DAMPING_PER_SECOND = 18;
const LOGO_PRESENTATION_TILT_MAX_FRAME_SECONDS = 0.064;
// The target stays unbounded; only its visible angular rate is bounded so a
// distant source or resumed frame cannot turn into a one-frame jump.
const LOGO_PRESENTATION_TILT_MAX_DEGREES_PER_SECOND = 120;
const POINTER_TILT_REFERENCE_DEGREES = 12;
const POINTER_TILT_REFERENCE_DISTANCE_MULTIPLIER = 1.25;

export function normalizeLogoPresentationTiltRadiusScale(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE;
}

export function normalizeLogoPresentationTiltStrengthScale(value: number): number {
  return Number.isFinite(value)
    ? Math.max(value, 0)
    : LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE;
}

export function getLogoPresentationTiltTransitionAlpha({
  deltaSeconds,
  remainingDegrees,
}: {
  deltaSeconds: number;
  remainingDegrees: number;
}) {
  if (
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0 ||
    !Number.isFinite(remainingDegrees) ||
    remainingDegrees <= 0
  ) {
    return 0;
  }

  const frameSeconds = Math.min(deltaSeconds, LOGO_PRESENTATION_TILT_MAX_FRAME_SECONDS);
  const dampingAlpha = 1 - Math.exp(-LOGO_PRESENTATION_TILT_DAMPING_PER_SECOND * frameSeconds);
  const velocityAlpha =
    (LOGO_PRESENTATION_TILT_MAX_DEGREES_PER_SECOND * frameSeconds) / remainingDegrees;

  return Math.min(dampingAlpha, velocityAlpha);
}

export function resolveLogoPresentationTiltTarget(
  target: LogoPresentationTiltTarget | undefined,
): LogoPresentationTiltTarget {
  if (!target) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }

  const magnitude = Math.hypot(target.horizontal, target.vertical);
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }

  return target;
}

function getPointerLogoPresentationTiltTargetFromOffset({
  outsideX,
  outsideY,
  referenceSize,
}: {
  outsideX: number;
  outsideY: number;
  referenceSize: number;
}): LogoPresentationTiltTarget {
  const distance = Math.hypot(outsideX, outsideY);
  if (distance === 0 || referenceSize <= 0) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }

  const tiltDegrees =
    (distance / (referenceSize * POINTER_TILT_REFERENCE_DISTANCE_MULTIPLIER)) *
    POINTER_TILT_REFERENCE_DEGREES;

  return {
    horizontal: (outsideX / distance) * tiltDegrees,
    vertical: outsideY === 0 ? 0 : (-outsideY / distance) * tiltDegrees,
  };
}

export function getPointerLogoPresentationTiltTarget({
  bounds,
  clientX,
  clientY,
}: {
  bounds: Pick<DOMRectReadOnly, "bottom" | "height" | "left" | "right" | "top" | "width">;
  clientX: number;
  clientY: number;
}): LogoPresentationTiltTarget {
  const outsideX =
    clientX < bounds.left
      ? clientX - bounds.left
      : clientX > bounds.right
        ? clientX - bounds.right
        : 0;
  const outsideY =
    clientY < bounds.top
      ? clientY - bounds.top
      : clientY > bounds.bottom
        ? clientY - bounds.bottom
        : 0;
  const shortestSide = Math.min(bounds.width, bounds.height);
  return getPointerLogoPresentationTiltTargetFromOffset({
    outsideX,
    outsideY,
    referenceSize: shortestSide,
  });
}

export function getRadialPointerLogoPresentationTiltTarget({
  baseRadius,
  centerX,
  centerY,
  clientX,
  clientY,
  radiusScale,
  strengthScale,
}: {
  baseRadius: number;
  centerX: number;
  centerY: number;
  clientX: number;
  clientY: number;
  radiusScale: number;
  strengthScale: number;
}): LogoPresentationTiltTarget {
  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;
  const distanceFromCenter = Math.hypot(deltaX, deltaY);
  const outsideDistance =
    distanceFromCenter - baseRadius * normalizeLogoPresentationTiltRadiusScale(radiusScale);
  if (outsideDistance <= 0 || distanceFromCenter === 0) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }

  const target = getPointerLogoPresentationTiltTargetFromOffset({
    outsideX: (deltaX / distanceFromCenter) * outsideDistance,
    outsideY: (deltaY / distanceFromCenter) * outsideDistance,
    referenceSize: baseRadius * 2,
  });
  const normalizedStrengthScale = normalizeLogoPresentationTiltStrengthScale(strengthScale);
  if (normalizedStrengthScale === 0) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }

  return {
    horizontal: target.horizontal * normalizedStrengthScale,
    vertical: target.vertical * normalizedStrengthScale,
  };
}
