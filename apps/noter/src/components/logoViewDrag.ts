import { normalizeRotationDegrees } from "@/components/logoVoxelState";

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
