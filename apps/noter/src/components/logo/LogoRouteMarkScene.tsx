import { NLogoScene, type LogoShuffleAnimationConfig } from "@/components/logo/NLogoScene";
import { DEFAULT_LOGO_FRACTAL_DEPTH, type VoxelEdit } from "@/components/logo/logoVoxelState";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import { cn } from "@/lib/utils";
import { type FaceColors } from "@/components/logo/logoTailwindColors";
import { type LogoRouteState } from "@/components/logo/logoRouteState";

const DISABLED_SHUFFLE_ANIMATION = {
  enabled: false,
  parallelMoves: 1,
} as const satisfies LogoShuffleAnimationConfig;

function noop() {}

export function LogoRouteMarkScene({
  animateFaceColors = false,
  animateLeftFaceStripes = false,
  backgroundColor,
  className,
  editMode = "add",
  faceColors,
  isSceneInteracting = false,
  logoOpacity = 1,
  onInteractionEnd = noop,
  onInteractionStart = noop,
  onRenderReady,
  onRenderUnavailable,
  onViewChange = noop,
  onVoxelEdit = noop,
  sceneClassName,
  shuffleAnimation = DISABLED_SHUFFLE_ANIMATION,
  state,
  voxelEditingEnabled = false,
}: {
  animateFaceColors?: boolean;
  animateLeftFaceStripes?: boolean;
  backgroundColor: string;
  className?: string;
  editMode?: VoxelEdit["kind"];
  faceColors: FaceColors;
  isSceneInteracting?: boolean;
  logoOpacity?: number;
  onInteractionEnd?: () => void;
  onInteractionStart?: () => void;
  onRenderReady?: () => void;
  onRenderUnavailable?: () => void;
  onViewChange?: (nextView: LogoViewState) => void;
  onVoxelEdit?: (edit: VoxelEdit) => void;
  sceneClassName?: string;
  shuffleAnimation?: LogoShuffleAnimationConfig;
  state: LogoRouteState;
  voxelEditingEnabled?: boolean;
}) {
  const isRecursiveDepth = state.fractalDepth > DEFAULT_LOGO_FRACTAL_DEPTH;

  return (
    <NLogoScene
      baseGridSize={state.gridSize}
      backgroundColor={backgroundColor}
      className={cn(
        className,
        sceneClassName,
        isSceneInteracting ? "cursor-grabbing" : "cursor-grab",
      )}
      distanceScale={state.distanceScale}
      editMode={editMode}
      elevationDegrees={state.elevationDegrees}
      faceColors={faceColors}
      leftFaceStyle={state.leftFaceStyle}
      opacity={logoOpacity}
      onInteractionStart={onInteractionStart}
      onInteractionEnd={onInteractionEnd}
      onRenderReady={onRenderReady}
      onRenderUnavailable={onRenderUnavailable}
      onViewChange={onViewChange}
      onVoxelEdit={onVoxelEdit}
      rotationAxisMode={state.rotationAxisMode}
      rotationDegrees={state.rotationDegrees}
      shuffleAnimation={shuffleAnimation}
      animateFaceColors={animateFaceColors}
      animateLeftFaceStripes={animateLeftFaceStripes}
      fractalDepth={state.fractalDepth}
      voxelEditingEnabled={voxelEditingEnabled && !isRecursiveDepth}
      viewDragConfig={state.isViewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined}
      voxelState={state.voxelState}
    />
  );
}
