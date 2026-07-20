/** Normalized screen-space input shared by pointer and future motion sources. */
export type LogoPresentationTiltTarget = Readonly<{
  /** Positive values point toward the right side of the screen. */
  horizontal: number;
  /** Positive values point toward the top of the screen. */
  vertical: number;
}>;

export const NEUTRAL_LOGO_PRESENTATION_TILT_TARGET: LogoPresentationTiltTarget = {
  horizontal: 0,
  vertical: 0,
};

const POINTER_TILT_FULL_STRENGTH_DISTANCE_SCALE = 1.25;
const LOGO_PRESENTATION_TILT_DAMPING_PER_SECOND = 18;
const LOGO_PRESENTATION_TILT_MAX_FRAME_SECONDS = 0.064;

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

export function getLogoPresentationTiltDampingAlpha(deltaSeconds: number) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return 0;
  }

  return (
    1 -
    Math.exp(
      -LOGO_PRESENTATION_TILT_DAMPING_PER_SECOND *
        Math.min(deltaSeconds, LOGO_PRESENTATION_TILT_MAX_FRAME_SECONDS),
    )
  );
}

export function normalizeLogoPresentationTiltTarget(
  target: LogoPresentationTiltTarget | undefined,
): LogoPresentationTiltTarget {
  if (!target) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }

  const magnitude = Math.hypot(target.horizontal, target.vertical);
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }
  if (magnitude <= 1) {
    return target;
  }

  return {
    horizontal: target.horizontal / magnitude,
    vertical: target.vertical / magnitude,
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
  const distance = Math.hypot(outsideX, outsideY);
  const shortestSide = Math.min(bounds.width, bounds.height);
  if (distance === 0 || shortestSide <= 0) {
    return NEUTRAL_LOGO_PRESENTATION_TILT_TARGET;
  }

  const strength = smoothstep(
    Math.min(distance / (shortestSide * POINTER_TILT_FULL_STRENGTH_DISTANCE_SCALE), 1),
  );

  return {
    horizontal: (outsideX / distance) * strength,
    vertical: outsideY === 0 ? 0 : (-outsideY / distance) * strength,
  };
}
