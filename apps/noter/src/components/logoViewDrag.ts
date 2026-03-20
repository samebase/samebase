import { normalizeRotationDegrees } from "@/components/logoVoxelState";

export type LogoViewDragSnapAngles = {
  elevationDegrees: readonly number[];
  rotationDegrees: readonly number[];
  thresholdDegrees: number;
};

export type LogoViewDragConfig = {
  elevationStepDegrees?: number;
  rotationStepDegrees?: number;
  snapAngles?: LogoViewDragSnapAngles;
};

export type LogoViewState = {
  elevationDegrees: number;
  rotationDegrees: number;
};

type ResolveDraggedAngleDegreesOptions = {
  disableSnap?: boolean;
  snapDegrees?: readonly number[];
  snapThresholdDegrees?: number;
  stepDegrees?: number;
  value: number;
};

function getCircularAngleDistanceDegrees(left: number, right: number): number {
  const delta = normalizeRotationDegrees(left - right);
  return delta > 180 ? 360 - delta : delta;
}

function quantizeAngleDegrees(value: number, stepDegrees?: number): number {
  if (stepDegrees === undefined || stepDegrees <= 0) {
    return normalizeRotationDegrees(value);
  }

  return normalizeRotationDegrees(
    Math.round(value / stepDegrees) * stepDegrees,
  );
}

export function resolveDraggedAngleDegrees({
  disableSnap = false,
  snapDegrees,
  snapThresholdDegrees,
  stepDegrees,
  value,
}: ResolveDraggedAngleDegreesOptions): number {
  const quantizedValue = quantizeAngleDegrees(value, stepDegrees);
  if (
    disableSnap ||
    snapDegrees === undefined ||
    snapDegrees.length === 0 ||
    snapThresholdDegrees === undefined ||
    snapThresholdDegrees < 0
  ) {
    return quantizedValue;
  }

  let closestSnapDegrees = quantizedValue;
  let closestDistanceDegrees = snapThresholdDegrees + 1;

  for (const snapTargetDegrees of snapDegrees) {
    const normalizedSnapTargetDegrees =
      normalizeRotationDegrees(snapTargetDegrees);
    const distanceDegrees = getCircularAngleDistanceDegrees(
      quantizedValue,
      normalizedSnapTargetDegrees,
    );
    if (distanceDegrees > snapThresholdDegrees) {
      continue;
    }
    if (distanceDegrees >= closestDistanceDegrees) {
      continue;
    }

    closestDistanceDegrees = distanceDegrees;
    closestSnapDegrees = normalizedSnapTargetDegrees;
  }

  return closestSnapDegrees;
}

export function resolveLogoViewState(args: {
  config?: LogoViewDragConfig;
  disableSnap?: boolean;
  view: LogoViewState;
}): LogoViewState {
  return {
    elevationDegrees: resolveDraggedAngleDegrees({
      disableSnap: args.disableSnap,
      snapDegrees: args.config?.snapAngles?.elevationDegrees,
      snapThresholdDegrees: args.config?.snapAngles?.thresholdDegrees,
      stepDegrees: args.config?.elevationStepDegrees,
      value: args.view.elevationDegrees,
    }),
    rotationDegrees: resolveDraggedAngleDegrees({
      disableSnap: args.disableSnap,
      snapDegrees: args.config?.snapAngles?.rotationDegrees,
      snapThresholdDegrees: args.config?.snapAngles?.thresholdDegrees,
      stepDegrees: args.config?.rotationStepDegrees,
      value: args.view.rotationDegrees,
    }),
  };
}
