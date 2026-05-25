import { type LogoRouteRenderState } from "@/components/logo/logoRouteRenderState";
import { type LogoShuffleAnimationConfig } from "@/components/logo/NLogoScene";
import { type FaceColors } from "@/components/logo/logoTailwindColors";
import { type LogoViewDragConfig, type LogoViewState } from "@/components/logo/logoViewDrag";
import { type LogoVoxelGrid, type VoxelEdit } from "@/components/logo/logoVoxelState";

const DEFAULT_LOGO_ROUTE_SCENE_SHUFFLE_ANIMATION: LogoShuffleAnimationConfig = {
  enabled: false,
  parallelMoves: 1,
};
type LogoThreeSceneComponent = typeof import("@/components/logo/NLogoScene").NLogoScene;

function ignoreLogoVoxelEdit() {}

export function LogoThreeRouteScene({
  LogoScene,
  animateFaceColors = false,
  animateLeftFaceStripes = false,
  backgroundColor,
  className,
  editMode = "add",
  faceColors,
  onInteractionEnd,
  onInteractionStart,
  onRenderReady,
  onRenderUnavailable,
  onViewChange,
  onVoxelEdit = ignoreLogoVoxelEdit,
  opacity = 1,
  routeState,
  shuffleAnimation = DEFAULT_LOGO_ROUTE_SCENE_SHUFFLE_ANIMATION,
  view,
  viewDragConfig,
  voxelEditingEnabled = false,
  voxelGrid,
}: {
  LogoScene: LogoThreeSceneComponent;
  animateFaceColors?: boolean;
  animateLeftFaceStripes?: boolean;
  backgroundColor: string;
  className?: string;
  editMode?: VoxelEdit["kind"];
  faceColors: FaceColors;
  onInteractionEnd?: () => void;
  onInteractionStart?: () => void;
  onRenderReady?: () => void;
  onRenderUnavailable?: () => void;
  onViewChange: (nextView: LogoViewState) => void;
  onVoxelEdit?: (edit: VoxelEdit) => void;
  opacity?: number;
  routeState: Pick<
    LogoRouteRenderState,
    | "distanceScale"
    | "fractalDepth"
    | "gridSize"
    | "leftFaceStyle"
    | "rotationAxisMode"
    | "voxelState"
  >;
  shuffleAnimation?: LogoShuffleAnimationConfig;
  view: LogoViewState;
  viewDragConfig?: LogoViewDragConfig;
  voxelEditingEnabled?: boolean;
  voxelGrid?: LogoVoxelGrid;
}) {
  return (
    <LogoScene
      baseGridSize={routeState.gridSize}
      backgroundColor={backgroundColor}
      className={className}
      distanceScale={routeState.distanceScale}
      editMode={editMode}
      elevationDegrees={view.elevationDegrees}
      faceColors={faceColors}
      leftFaceStyle={routeState.leftFaceStyle}
      opacity={opacity}
      onInteractionStart={onInteractionStart}
      onInteractionEnd={onInteractionEnd}
      onRenderReady={onRenderReady}
      onRenderUnavailable={onRenderUnavailable}
      onViewChange={onViewChange}
      onVoxelEdit={onVoxelEdit}
      rotationAxisMode={routeState.rotationAxisMode}
      rotationDegrees={view.rotationDegrees}
      shuffleAnimation={shuffleAnimation}
      animateFaceColors={animateFaceColors}
      animateLeftFaceStripes={animateLeftFaceStripes}
      fractalDepth={routeState.fractalDepth}
      voxelEditingEnabled={voxelEditingEnabled}
      voxelGrid={voxelGrid}
      viewDragConfig={viewDragConfig}
      voxelState={routeState.voxelState}
    />
  );
}
