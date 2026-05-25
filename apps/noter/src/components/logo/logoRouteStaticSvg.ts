import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import { createLogoFractalVoxelGrid, parseVoxelState } from "@/components/logo/logoVoxelState";
import { type FaceColors } from "@/components/logo/logoTailwindColors";
import { type LogoRouteState } from "@/components/logo/logoRouteState";

export function createLogoRouteStaticSvgSrc({
  cacheKey,
  cacheFractalDepth,
  faceColors,
  fractalDepth,
  state,
  view,
}: {
  cacheKey: string;
  cacheFractalDepth?: number;
  faceColors: FaceColors;
  fractalDepth?: number;
  state: LogoRouteState;
  view: {
    elevationDegrees: number;
    rotationDegrees: number;
  };
}) {
  const renderedFractalDepth = fractalDepth ?? state.fractalDepth;
  const cacheDepth = cacheFractalDepth ?? state.fractalDepth;
  const parsedVoxelState = parseVoxelState(state.voxelState);
  const filledVoxels =
    parsedVoxelState && parsedVoxelState.gridSize === state.gridSize
      ? parsedVoxelState.filledVoxels
      : undefined;
  const voxelGrid = createLogoFractalVoxelGrid({
    depth: renderedFractalDepth,
    filledVoxels,
    gridSize: state.gridSize,
  });

  return `${createStaticLogoSvgDataUrl({
    faceColors,
    filledVoxels: voxelGrid.filledVoxels,
    gridSize: voxelGrid.gridSize,
    leftFaceStyle: state.leftFaceStyle,
    view,
  })}#${cacheKey}:${state.gridSize}:${cacheDepth}:${state.distanceScale}`;
}
