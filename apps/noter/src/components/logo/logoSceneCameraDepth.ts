const MIN_ISOMETRIC_CAMERA_DISTANCE = 11;
const CAMERA_DEPTH_PADDING = 2.5;
const MIN_CAMERA_FAR_PLANE = 100;

export function resolveLogoSceneCameraDepthBounds(cameraFitRadius: number): {
  distance: number;
  far: number;
} {
  const distance = Math.max(
    MIN_ISOMETRIC_CAMERA_DISTANCE,
    cameraFitRadius * CAMERA_DEPTH_PADDING,
  );

  return {
    distance,
    far: Math.max(
      MIN_CAMERA_FAR_PLANE,
      distance + cameraFitRadius * CAMERA_DEPTH_PADDING,
    ),
  };
}
