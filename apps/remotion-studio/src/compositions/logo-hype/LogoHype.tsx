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
import {
  createFilledVoxelSet,
  createLogoFractalVoxelGrid,
  MENGER_SPONGE_VOXEL_STATE,
  parseVoxelState,
  voxelKey,
  type VoxelCoordinate,
} from "@samebase/logo-model/voxel";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { MathUtils, Quaternion, Vector3 as ThreeVector3 } from "three";

export const logoHypeFps = 30;
export const logoHypeDurationInFrames = 360;

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

type LogoSceneKind = "canonical" | "canonical-depth-two" | "menger-depth-two" | "shuffling";

const canonicalFilledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
const canonicalDepthTwoGrid = createLogoFractalVoxelGrid({
  depth: 2,
  filledVoxels: canonicalFilledVoxels,
  gridSize: STATIC_LOGO_GRID_SIZE,
});
const parsedMengerState = parseVoxelState(MENGER_SPONGE_VOXEL_STATE);
if (!parsedMengerState) {
  throw new Error("The shared Menger motif must remain a valid voxel state");
}
const mengerDepthTwoGrid = createLogoFractalVoxelGrid({
  depth: 2,
  filledVoxels: parsedMengerState.filledVoxels,
  gridSize: parsedMengerState.gridSize,
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
const canonicalDepthTwoSurface = buildSurfaceMeshes(
  canonicalDepthTwoGrid.filledVoxels,
  canonicalDepthTwoGrid.gridSize,
);
const mengerDepthTwoSurface = buildSurfaceMeshes(
  mengerDepthTwoGrid.filledVoxels,
  mengerDepthTwoGrid.gridSize,
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
    case "canonical-depth-two":
      logo = (
        <group scale={1 / 3}>
          <Surface meshes={canonicalDepthTwoSurface} />
        </group>
      );
      break;
    case "menger-depth-two":
      logo = (
        <group scale={1 / 3}>
          <Surface meshes={mengerDepthTwoSurface} />
        </group>
      );
      break;
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
  const canonicalDepthOpacity =
    transitionProgress(frame, 238, 250) * (1 - transitionProgress(frame, 280, 294));
  const mengerOpacity =
    transitionProgress(frame, 280, 294) * (1 - transitionProgress(frame, 326, 340));
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
        kind="canonical-depth-two"
        opacity={canonicalDepthOpacity}
        rotationDegrees={rotationDegrees}
        width={width}
      />
      <LogoLayer
        elevationDegrees={elevationDegrees}
        frame={frame}
        height={height}
        kind="menger-depth-two"
        opacity={mengerOpacity}
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
