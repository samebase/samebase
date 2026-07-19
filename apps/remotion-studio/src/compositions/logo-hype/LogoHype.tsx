import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import {
  DEFAULT_LOGO_FACE_HEX_COLORS,
  STATIC_LOGO_GRID_SIZE,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@samebase/logo-model/identity";
import { getCameraLocalVector } from "@samebase/logo-model/rotation";
import { buildLogoSurfaceQuads } from "@samebase/logo-model/surface";
import { createFilledVoxelSet } from "@samebase/logo-model/voxel";
import {
  AbsoluteFill,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const logoHypeFps = 30;
export const logoHypeDurationInFrames = 270;

const logoSurfaceFaces = buildLogoSurfaceQuads(
  createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
  STATIC_LOGO_GRID_SIZE,
).map((quad) => ({
  color: DEFAULT_LOGO_FACE_HEX_COLORS[quad.colorKey],
  key: quad.key,
  positions: new Float32Array([
    ...quad.vertices[0],
    ...quad.vertices[1],
    ...quad.vertices[2],
    ...quad.vertices[0],
    ...quad.vertices[2],
    ...quad.vertices[3],
  ]),
}));

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function LogoVoxel({
  colorProgress,
  coordinate,
  frame,
  index,
}: {
  colorProgress: number;
  coordinate: (typeof STATIC_LOGO_VOXEL_COORDINATES)[number];
  frame: number;
  index: number;
}) {
  const exitProgress = interpolate(frame, [72 + index * 1.7, 126 + index], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const returnProgress = spring({
    config: { damping: 17, mass: 0.72, stiffness: 105 },
    durationInFrames: 66,
    fps: logoHypeFps,
    frame: frame - 157 - (STATIC_LOGO_VOXEL_COORDINATES.length - index) * 1.25,
  });
  const shapeProgress = exitProgress * (1 - returnProgress);
  const angle = (index / STATIC_LOGO_VOXEL_COORDINATES.length) * Math.PI * 2 - Math.PI / 2;
  const canonicalPosition: [number, number, number] = [
    coordinate[0] - 1,
    coordinate[1] - 1,
    coordinate[2] - 1,
  ];
  const helixPosition: [number, number, number] = [
    Math.cos(angle) * 3.45,
    (index - (STATIC_LOGO_VOXEL_COORDINATES.length - 1) / 2) * 0.42,
    Math.sin(angle) * 2.15,
  ];
  const position: [number, number, number] = [
    mix(canonicalPosition[0], helixPosition[0], shapeProgress),
    mix(canonicalPosition[1], helixPosition[1], shapeProgress),
    mix(canonicalPosition[2], helixPosition[2], shapeProgress),
  ];
  const scale = mix(1, 0.58, shapeProgress);
  const leftColor = interpolateColors(
    colorProgress,
    [0, 0.52, 1],
    [DEFAULT_LOGO_FACE_HEX_COLORS.left, "#ff3aa7", DEFAULT_LOGO_FACE_HEX_COLORS.left],
  );
  const rightColor = interpolateColors(
    colorProgress,
    [0, 0.52, 1],
    [DEFAULT_LOGO_FACE_HEX_COLORS.right, "#5545ff", DEFAULT_LOGO_FACE_HEX_COLORS.right],
  );
  const topColor = interpolateColors(
    colorProgress,
    [0, 0.52, 1],
    [DEFAULT_LOGO_FACE_HEX_COLORS.top, "#ddff45", DEFAULT_LOGO_FACE_HEX_COLORS.top],
  );

  return (
    <mesh
      position={position}
      rotation={[
        shapeProgress * (index * 0.31 + 0.9),
        shapeProgress * (index * -0.24 - 0.6),
        shapeProgress * (index % 2 === 0 ? 0.8 : -0.8),
      ]}
      scale={scale}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial attach="material-0" color={rightColor} />
      <meshBasicMaterial attach="material-1" color={rightColor} />
      <meshBasicMaterial attach="material-2" color={topColor} />
      <meshBasicMaterial attach="material-3" color={topColor} />
      <meshBasicMaterial attach="material-4" color={leftColor} />
      <meshBasicMaterial attach="material-5" color={leftColor} />
    </mesh>
  );
}

function SettledLogoSurface() {
  return (
    <group>
      {logoSurfaceFaces.map((face) => (
        <mesh key={face.key}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[face.positions, 3]} />
          </bufferGeometry>
          <meshBasicMaterial color={face.color} />
        </mesh>
      ))}
    </group>
  );
}

function LogoScene({ frame }: { frame: number }) {
  const introScale = spring({
    config: { damping: 14, mass: 0.8, stiffness: 115 },
    durationInFrames: 46,
    fps: logoHypeFps,
    frame: frame - 5,
  });
  const orbitAmount = interpolate(frame, [72, 108, 184, 224], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const orbitPhase = interpolate(frame, [72, 224], [0, Math.PI * 2.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lockupProgress = spring({
    config: { damping: 18, mass: 0.82, stiffness: 110 },
    durationInFrames: 42,
    fps: logoHypeFps,
    frame: frame - 220,
  });
  const colorProgress = interpolate(frame, [74, 130, 176, 224], [0, 0.52, 0.72, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const showSettledSurface = frame < 72 || frame >= 224;

  return (
    <group
      position={[mix(0, -2.6, lockupProgress), 0, 0]}
      rotation={[
        Math.sin(orbitPhase * 1.3) * orbitAmount * 0.24,
        orbitPhase * orbitAmount,
        Math.sin(orbitPhase * 0.7) * orbitAmount * 0.1,
      ]}
      scale={mix(0.01, 1.08, introScale)}
    >
      {showSettledSurface ? <SettledLogoSurface /> : null}
      {showSettledSurface
        ? null
        : STATIC_LOGO_VOXEL_COORDINATES.map((coordinate, index) => (
            <LogoVoxel
              colorProgress={colorProgress}
              coordinate={coordinate}
              frame={frame}
              index={index}
              key={coordinate.join("")}
            />
          ))}
    </group>
  );
}

function LogoCamera({ frame }: { frame: number }) {
  const camera = useThree((state) => state.camera);
  const revealProgress = interpolate(frame, [26, 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cameraVector = getCameraLocalVector({
    elevationDegrees: mix(0, STATIC_LOGO_ELEVATION_DEGREES, revealProgress),
    rotationAxisMode: "cube-y",
    rotationDegrees: mix(0, 45, revealProgress),
  });
  const cameraDistance = 13;
  camera.position.set(
    cameraVector[0] * cameraDistance,
    cameraVector[1] * cameraDistance,
    cameraVector[2] * cameraDistance,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  return null;
}

export function LogoHype() {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const lockupProgress = spring({
    config: { damping: 18, mass: 0.82, stiffness: 110 },
    durationInFrames: 42,
    fps: logoHypeFps,
    frame: frame - 220,
  });
  const flashOpacity = interpolate(frame, [70, 78, 92, 162, 170, 186], [0, 0.42, 0, 0, 0.32, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 47%, rgba(0, 184, 219, 0.13), transparent 34%), #050808",
        color: "white",
        overflow: "hidden",
      }}
    >
      <ThreeCanvas
        camera={{ fov: 35, position: [0, 0, 13] }}
        height={height}
        orthographic={false}
        style={{ backgroundColor: "transparent" }}
        width={width}
      >
        <LogoCamera frame={frame} />
        <LogoScene frame={frame} />
      </ThreeCanvas>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.28), transparent 38%)",
          opacity: flashOpacity,
        }}
      />
      <div
        style={{
          alignItems: "center",
          display: "flex",
          height: "100%",
          left: "52%",
          opacity: lockupProgress,
          position: "absolute",
          transform: `translate3d(${mix(42, 0, lockupProgress)}px, 0, 0)`,
        }}
      >
        <div
          style={{
            fontFamily:
              '"Liberation Sans", ui-sans-serif, system-ui, -apple-system, "BlinkMacSystemFont", "Segoe UI", sans-serif',
            fontSize: 132,
            fontWeight: 650,
            letterSpacing: "-0.065em",
            lineHeight: 1,
          }}
        >
          samebase
        </div>
      </div>
      <div
        style={{
          background: `linear-gradient(90deg, transparent, ${DEFAULT_LOGO_FACE_HEX_COLORS.left}, transparent)`,
          bottom: 0,
          height: 2,
          left: 0,
          opacity: interpolate(frame, [232, 262], [0, 0.72], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          transform: `scaleX(${lockupProgress})`,
          transformOrigin: "50% 50%",
          width: "100%",
        }}
      />
    </AbsoluteFill>
  );
}
