import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { advanceLogoAutoRotation } from "@samebase/logo-model/auto-rotation";
import {
  DEFAULT_LOGO_FACE_HEX_COLORS,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_GRID_SIZE,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@samebase/logo-model/identity";
import {
  MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  createMengerDepthTransitionModel,
  readMengerDepthTransitionMoveProgress,
  readMengerDepthTransitionStage,
  type MengerDepthTransitionMove,
  type MengerDepthTransitionStage,
} from "@samebase/logo-model/menger-depth-transition";
import {
  getLogoRotationAxis,
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  toRenderedRotationDegrees,
} from "@samebase/logo-model/rotation";
import {
  easeLogoShuffleProgress,
  getShuffleOriginCandidates,
  LOGO_SHUFFLE_MOVE_DURATION_MS,
  LOGO_SHUFFLE_MOVE_STAGGER_MS,
} from "@samebase/logo-model/shuffle";
import { buildLogoSurfaceQuads, type FaceColorKey } from "@samebase/logo-model/surface";
import { createFilledVoxelSet, voxelKey, type VoxelCoordinate } from "@samebase/logo-model/voxel";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Quaternion,
  Vector3 as ThreeVector3,
} from "three";

export const logoHypeFps = 30;
export const logoHypeDurationInFrames = 360;
const MENGER_TRANSITION_START_FRAME = 238;
const MENGER_TRANSITION_END_FRAME = 326;

type SurfaceMesh = {
  color: string;
  colorKey: FaceColorKey;
  positions: Float32Array;
};

type PlannedShuffleMove = {
  endFrame: number;
  from: VoxelCoordinate;
  fromKey: string;
  startFrame: number;
  to: VoxelCoordinate;
  toKey: string;
};

type LogoSceneKind = "canonical" | "menger-transition" | "shuffling";

const canonicalFilledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
const mengerDepthTransitionModel = createMengerDepthTransitionModel({
  staggerGroupCount: MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
});

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function transitionProgress(frame: number, startFrame: number, endFrame: number): number {
  return interpolate(frame, [startFrame, endFrame], [0, 1], {
    easing: easeLogoShuffleProgress,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function buildSurfaceMeshes(filledVoxels: ReadonlySet<string>, gridSize: number): SurfaceMesh[] {
  const positionsByColor: Record<FaceColorKey, number[]> = {
    left: [],
    right: [],
    top: [],
  };

  for (const quad of buildLogoSurfaceQuads(filledVoxels, gridSize)) {
    positionsByColor[quad.colorKey].push(
      ...quad.vertices[0],
      ...quad.vertices[1],
      ...quad.vertices[2],
      ...quad.vertices[0],
      ...quad.vertices[2],
      ...quad.vertices[3],
    );
  }

  return (["left", "right", "top"] as const).map((colorKey) => ({
    color: DEFAULT_LOGO_FACE_HEX_COLORS[colorKey],
    colorKey,
    positions: new Float32Array(positionsByColor[colorKey]),
  }));
}

const canonicalSurface = buildSurfaceMeshes(canonicalFilledVoxels, STATIC_LOGO_GRID_SIZE);
const mengerDepthOneSurface = buildSurfaceMeshes(
  createFilledVoxelSet(mengerDepthTransitionModel.depthOneVoxels),
  STATIC_LOGO_GRID_SIZE,
);
const mengerDepthSurfaces = new Map(
  mengerDepthTransitionModel.stages.map((stage) => [
    stage.depth,
    buildSurfaceMeshes(createFilledVoxelSet(stage.settledVoxels), stage.gridSize),
  ]),
);

function planShuffleMoves(): PlannedShuffleMove[] {
  const blockedKeys = new Set<string>();
  const durationInFrames = Math.round((LOGO_SHUFFLE_MOVE_DURATION_MS / 1000) * logoHypeFps);
  const staggerInFrames = Math.round((LOGO_SHUFFLE_MOVE_STAGGER_MS / 1000) * logoHypeFps);
  const moves: PlannedShuffleMove[] = [];

  for (let index = 0; index < 3; index += 1) {
    const candidates = getShuffleOriginCandidates({
      blockedKeys,
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      filledVoxels: canonicalFilledVoxels,
      gridSize: STATIC_LOGO_GRID_SIZE,
      lastMovedCubeKey: null,
      rotationAxisMode: "cube-y",
      rotationDegrees: 45,
    });
    const candidate = candidates[(index * 5 + 2) % candidates.length];
    if (!candidate) {
      break;
    }

    const destination = candidate.destinations[index % candidate.destinations.length];
    if (!destination) {
      break;
    }

    const startFrame = 140 + index * staggerInFrames;
    const toKey = voxelKey(destination[0], destination[1], destination[2]);
    blockedKeys.add(candidate.fromKey);
    blockedKeys.add(toKey);
    moves.push({
      endFrame: startFrame + durationInFrames,
      from: candidate.from,
      fromKey: candidate.fromKey,
      startFrame,
      to: destination,
      toKey,
    });
  }

  return moves;
}

const shuffleMoves = planShuffleMoves();

function Surface({ meshes }: { meshes: readonly SurfaceMesh[] }) {
  return (
    <group>
      {meshes.map((mesh) => (
        <mesh key={mesh.colorKey}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[mesh.positions, 3]} />
          </bufferGeometry>
          <meshBasicMaterial color={mesh.color} />
        </mesh>
      ))}
    </group>
  );
}

function MengerMovingFaceGroup({
  moves,
  opacity,
  stage,
}: {
  moves: readonly MengerDepthTransitionMove[];
  opacity: number;
  stage: MengerDepthTransitionStage;
}) {
  const movingMeshRef = useRef<InstancedMesh | null>(null);

  useLayoutEffect(() => {
    const movingMesh = movingMeshRef.current;
    if (!movingMesh) {
      return;
    }

    const matrix = new Matrix4();
    const normal = new ThreeVector3();
    const position = new ThreeVector3();
    const quaternion = new Quaternion();
    const scale = new ThreeVector3(1, 1, 1);
    const planeNormal = new ThreeVector3(0, 0, 1);
    const faceColors = {
      left: new Color(DEFAULT_LOGO_FACE_HEX_COLORS.left),
      right: new Color(DEFAULT_LOGO_FACE_HEX_COLORS.right),
      top: new Color(DEFAULT_LOGO_FACE_HEX_COLORS.top),
    };
    moves.forEach((move, index) => {
      const localX = move.from[0] % 3;
      const localY = move.from[1] % 3;
      if (localX !== 1) {
        normal.set(localX === 0 ? -1 : 1, 0, 0);
        movingMesh.setColorAt(index, faceColors.right);
      } else if (localY !== 1) {
        normal.set(0, localY === 0 ? -1 : 1, 0);
        movingMesh.setColorAt(index, faceColors.top);
      } else {
        normal.set(0, 0, move.from[2] % 3 === 0 ? -1 : 1);
        movingMesh.setColorAt(index, faceColors.left);
      }

      position.set(
        move.from[0] - stage.gridSize / 2 + 0.5,
        move.from[1] - stage.gridSize / 2 + 0.5,
        move.from[2] - stage.gridSize / 2 + 0.5,
      );
      position.addScaledVector(normal, 0.5);
      quaternion.setFromUnitVectors(planeNormal, normal);
      matrix.compose(position, quaternion, scale);
      movingMesh.setMatrixAt(index, matrix);
    });

    movingMesh.count = moves.length;
    movingMesh.instanceMatrix.needsUpdate = true;
    if (movingMesh.instanceColor) {
      movingMesh.instanceColor.needsUpdate = true;
    }
  }, [moves, stage.gridSize]);

  return (
    <instancedMesh
      ref={movingMeshRef}
      args={[undefined, undefined, moves.length]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial depthWrite={false} opacity={opacity} transparent />
    </instancedMesh>
  );
}

function MengerMovingFaces({
  elapsedMs,
  stage,
}: {
  elapsedMs: number;
  stage: MengerDepthTransitionStage;
}) {
  const moveGroups = useMemo(() => {
    const movesByStartTime = new Map<number, MengerDepthTransitionMove[]>();
    for (const move of stage.moves) {
      const moves = movesByStartTime.get(move.startTimeMs);
      if (moves) {
        moves.push(move);
      } else {
        movesByStartTime.set(move.startTimeMs, [move]);
      }
    }

    return [...movesByStartTime.entries()].sort(([left], [right]) => left - right);
  }, [stage]);

  return moveGroups.map(([startTimeMs, moves]) => {
    const firstMove = moves[0];
    if (!firstMove) {
      return null;
    }

    const progress = readMengerDepthTransitionMoveProgress(firstMove, elapsedMs);
    const opacity = progress === null ? 0 : 1 - progress;
    if (opacity <= 0) {
      return null;
    }

    return (
      <MengerMovingFaceGroup key={startTimeMs} moves={moves} opacity={opacity} stage={stage} />
    );
  });
}

function MengerDepthTransition({ elapsedMs }: { elapsedMs: number }) {
  const stage = readMengerDepthTransitionStage(mengerDepthTransitionModel, elapsedMs);
  if (!stage) {
    return <Surface meshes={mengerDepthOneSurface} />;
  }

  const surface = mengerDepthSurfaces.get(stage.depth);
  if (!surface) {
    throw new Error("Every Menger transition stage must have a surface.");
  }
  return (
    <group scale={STATIC_LOGO_GRID_SIZE / stage.gridSize}>
      <Surface meshes={surface} />
      <MengerMovingFaces elapsedMs={elapsedMs} stage={stage} />
    </group>
  );
}

function MovingCube({ move, frame }: { move: PlannedShuffleMove; frame: number }) {
  if (frame < move.startFrame || frame >= move.endFrame) {
    return null;
  }

  const progress = interpolate(frame, [move.startFrame, move.endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const travelProgress = easeLogoShuffleProgress(progress);
  const position: [number, number, number] = [
    mix(move.from[0], move.to[0], travelProgress) - STATIC_LOGO_GRID_SIZE / 2 + 0.5,
    mix(move.from[1], move.to[1], travelProgress) - STATIC_LOGO_GRID_SIZE / 2 + 0.5,
    mix(move.from[2], move.to[2], travelProgress) - STATIC_LOGO_GRID_SIZE / 2 + 0.5,
  ];

  return (
    <mesh position={position}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial attach="material-0" color={DEFAULT_LOGO_FACE_HEX_COLORS.right} />
      <meshBasicMaterial attach="material-1" color={DEFAULT_LOGO_FACE_HEX_COLORS.right} />
      <meshBasicMaterial attach="material-2" color={DEFAULT_LOGO_FACE_HEX_COLORS.top} />
      <meshBasicMaterial attach="material-3" color={DEFAULT_LOGO_FACE_HEX_COLORS.top} />
      <meshBasicMaterial attach="material-4" color={DEFAULT_LOGO_FACE_HEX_COLORS.left} />
      <meshBasicMaterial attach="material-5" color={DEFAULT_LOGO_FACE_HEX_COLORS.left} />
    </mesh>
  );
}

function ShufflingCanonicalLogo({ frame }: { frame: number }) {
  const settledVoxels = new Set(canonicalFilledVoxels);

  for (const move of shuffleMoves) {
    if (frame >= move.startFrame) {
      settledVoxels.delete(move.fromKey);
    }
    if (frame >= move.endFrame) {
      settledVoxels.add(move.toKey);
    }
  }

  return (
    <group>
      <Surface meshes={buildSurfaceMeshes(settledVoxels, STATIC_LOGO_GRID_SIZE)} />
      {shuffleMoves.map((move) => (
        <MovingCube frame={frame} key={`${move.fromKey}:${move.toKey}`} move={move} />
      ))}
    </group>
  );
}

function LogoCamera({ elevationDegrees }: { elevationDegrees: number }) {
  const camera = useThree((state) => state.camera);
  const cameraVector = getWorldCameraVector(elevationDegrees);
  const screenVertical = getWorldScreenVerticalAxis(elevationDegrees);
  const cameraDistance = 13;

  camera.position.set(
    cameraVector[0] * cameraDistance,
    cameraVector[1] * cameraDistance,
    cameraVector[2] * cameraDistance,
  );
  camera.up.set(screenVertical[0], screenVertical[1], screenVertical[2]);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  return null;
}

function LogoScene({
  elevationDegrees,
  frame,
  kind,
  rotationDegrees,
}: {
  elevationDegrees: number;
  frame: number;
  kind: LogoSceneKind;
  rotationDegrees: number;
}) {
  const rotationAxis = getLogoRotationAxis({
    elevationDegrees,
    mode: "cube-y",
  });
  const quaternion = new Quaternion().setFromAxisAngle(
    new ThreeVector3(rotationAxis[0], rotationAxis[1], rotationAxis[2]),
    MathUtils.degToRad(toRenderedRotationDegrees(rotationDegrees)),
  );

  let logo;
  switch (kind) {
    case "canonical":
      logo = <Surface meshes={canonicalSurface} />;
      break;
    case "menger-transition": {
      const elapsedMs = interpolate(
        frame,
        [MENGER_TRANSITION_START_FRAME, MENGER_TRANSITION_END_FRAME],
        [0, mengerDepthTransitionModel.totalDurationMs],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      );
      logo = <MengerDepthTransition elapsedMs={elapsedMs} />;
      break;
    }
    case "shuffling":
      logo = <ShufflingCanonicalLogo frame={frame} />;
      break;
    default: {
      const unreachable = kind satisfies never;
      return unreachable;
    }
  }

  return (
    <>
      <LogoCamera elevationDegrees={elevationDegrees} />
      <group quaternion={quaternion} scale={1.1}>
        {logo}
      </group>
    </>
  );
}

function LogoLayer({
  elevationDegrees,
  frame,
  height,
  kind,
  opacity,
  rotationDegrees,
  width,
}: {
  elevationDegrees: number;
  frame: number;
  height: number;
  kind: LogoSceneKind;
  opacity: number;
  rotationDegrees: number;
  width: number;
}) {
  if (opacity <= 0) {
    return null;
  }

  // Separate depth buffers keep crossfading appearances opaque and prevent
  // coplanar surface faces from z-fighting during the recursive transitions.
  return (
    <ThreeCanvas
      camera={{ position: [0, 0, 13], zoom: 150 }}
      height={height}
      orthographic
      style={{
        backgroundColor: "transparent",
        inset: 0,
        opacity,
        position: "absolute",
      }}
      width={width}
    >
      <LogoScene
        elevationDegrees={elevationDegrees}
        frame={frame}
        kind={kind}
        rotationDegrees={rotationDegrees}
      />
    </ThreeCanvas>
  );
}

function BeatCopy({
  children,
  endFrame,
  frame,
  startFrame,
}: {
  children: string;
  endFrame: number;
  frame: number;
  startFrame: number;
}) {
  const opacity =
    transitionProgress(frame, startFrame, startFrame + 12) *
    (1 - transitionProgress(frame, endFrame - 12, endFrame));
  const translateY = mix(18, 0, transitionProgress(frame, startFrame, startFrame + 16));

  return (
    <div
      style={{
        bottom: 92,
        fontFamily:
          '"Liberation Sans", ui-sans-serif, system-ui, -apple-system, "BlinkMacSystemFont", "Segoe UI", sans-serif',
        fontSize: 56,
        fontWeight: 520,
        left: 0,
        letterSpacing: "-0.035em",
        lineHeight: 1.08,
        opacity,
        position: "absolute",
        textAlign: "center",
        transform: `translateY(${translateY}px)`,
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

export function LogoHype() {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const rotationReveal = transitionProgress(frame, 48, 84);
  const elevationReveal = transitionProgress(frame, 84, 122);
  const recursiveRotation = advanceLogoAutoRotation(45, Math.max(frame - 280, 0) / logoHypeFps);
  const finalReturn = transitionProgress(frame, 326, 342);
  const rotationDegrees = mix(
    mix(0, 45, rotationReveal),
    mix(recursiveRotation, 45, finalReturn),
    transitionProgress(frame, 122, 140),
  );
  const elevationDegrees = mix(0, STATIC_LOGO_ELEVATION_DEGREES, elevationReveal);
  const introOpacity = transitionProgress(frame, 4, 20);
  const shuffleOpacity = introOpacity * (1 - transitionProgress(frame, 216, 228));
  const resetOpacity =
    transitionProgress(frame, 216, 228) * (1 - transitionProgress(frame, 238, 250));
  const mengerTransitionOpacity =
    transitionProgress(frame, 238, 250) * (1 - transitionProgress(frame, 326, 340));
  const canonicalOpacity = resetOpacity + transitionProgress(frame, 326, 340);
  const finalOpacity = transitionProgress(frame, 332, 346);

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 46%, rgba(0, 184, 219, 0.12), transparent 32%), #050808",
        color: "white",
        overflow: "hidden",
      }}
    >
      <LogoLayer
        elevationDegrees={elevationDegrees}
        frame={frame}
        height={height}
        kind="shuffling"
        opacity={shuffleOpacity}
        rotationDegrees={rotationDegrees}
        width={width}
      />
      <LogoLayer
        elevationDegrees={elevationDegrees}
        frame={frame}
        height={height}
        kind="canonical"
        opacity={canonicalOpacity}
        rotationDegrees={rotationDegrees}
        width={width}
      />
      <LogoLayer
        elevationDegrees={elevationDegrees}
        frame={frame}
        height={height}
        kind="menger-transition"
        opacity={mengerTransitionOpacity}
        rotationDegrees={rotationDegrees}
        width={width}
      />
      <BeatCopy endFrame={72} frame={frame} startFrame={10}>
        start from the same base
      </BeatCopy>
      <BeatCopy endFrame={154} frame={frame} startFrame={62}>
        explore different directions
      </BeatCopy>
      <BeatCopy endFrame={282} frame={frame} startFrame={224}>
        go deeper
      </BeatCopy>
      <BeatCopy endFrame={332} frame={frame} startFrame={284}>
        wildly different results
      </BeatCopy>
      <div
        style={{
          bottom: 72,
          fontFamily:
            '"Liberation Sans", ui-sans-serif, system-ui, -apple-system, "BlinkMacSystemFont", "Segoe UI", sans-serif',
          fontSize: 72,
          fontWeight: 650,
          left: 0,
          letterSpacing: "-0.055em",
          lineHeight: 1,
          opacity: finalOpacity,
          position: "absolute",
          textAlign: "center",
          transform: `translateY(${mix(16, 0, finalOpacity)}px)`,
          width: "100%",
        }}
      >
        samebase
      </div>
      <div
        style={{
          background: `linear-gradient(90deg, transparent, ${DEFAULT_LOGO_FACE_HEX_COLORS.left}, transparent)`,
          bottom: 0,
          height: 2,
          left: 0,
          opacity: finalOpacity * 0.7,
          position: "absolute",
          transform: `scaleX(${finalOpacity})`,
          transformOrigin: "50% 50%",
          width: "100%",
        }}
      />
    </AbsoluteFill>
  );
}
