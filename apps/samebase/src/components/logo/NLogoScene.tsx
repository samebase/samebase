import { getTailwindColorHex, type FaceColors } from "@/components/logo/logoTailwindColors";
import {
  getLogoRotationAxis,
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  toRenderedRotationDegrees,
  type LogoRotationAxisMode,
} from "@samebase/logo-model/rotation";
import { type LogoShuffleParallelMoves } from "@/components/logo/logoShuffleAnimation";
import {
  easeLogoShuffleProgress,
  getShuffleOriginCandidates,
  LOGO_SHUFFLE_MOVE_DURATION_MS,
  LOGO_SHUFFLE_MOVE_STAGGER_MS,
} from "@samebase/logo-model/shuffle";
import {
  LOGO_DISTANCE_SCALE,
  normalizeLogoDistanceScale,
} from "@/components/logo/logoDistanceScale";
import {
  DEFAULT_LOGO_LEFT_FACE_STYLE,
  getLogoLeftFaceStripeBasisScale,
  normalizeLogoLeftFaceStyle,
  type LogoLeftFaceStyle,
} from "@samebase/logo-model/left-face-style";
import { clampLogoFractalDepthForRenderer } from "@/components/logo/logoDepthLimits";
import {
  buildLogoSurfaceQuads,
  getLogoSurfaceFitRadius,
  type LogoSurfaceQuad,
} from "@samebase/logo-model/surface";
import { resolveLogoSceneCameraDepthBounds } from "@/components/logo/logoSceneCameraDepth";
import {
  getLogoPresentationTiltTransitionAlpha,
  LOGO_PRESENTATION_TILT_SETTLED_DEGREES,
  resolveLogoPresentationTiltTarget,
  type LogoPresentationTiltTarget,
} from "@/components/logo/logoPresentationTilt";
import {
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_LOGO_GRID_SIZE,
  createDefaultFilledVoxelSet,
  createLogoFractalVoxelGrid,
  getLogoFractalGridSize,
  isWithinVoxelGrid,
  type LogoGridSize,
  type LogoVoxelGrid,
  parseVoxelKey,
  parseVoxelState,
  type VoxelCoordinate,
  type VoxelEdit,
  voxelKey,
} from "@samebase/logo-model/voxel";
import { type LogoViewDragConfig, type LogoViewState } from "@/components/logo/logoViewDrag";
import { useLogoViewDrag } from "@/components/logo/useLogoViewDrag";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

const RAYCAST_OFFSET = 0.001;
const CAMERA_FRUSTUM_PADDING = 1.12;
const FACE_COLOR_ANIMATION_DEGREES_PER_SECOND = 15;
const FACE_COLOR_ANIMATION_MIN_LIGHTNESS = 0.38;
const FACE_COLOR_ANIMATION_MAX_LIGHTNESS = 0.76;
const FACE_COLOR_ANIMATION_MIN_SATURATION = 0.5;
const LEFT_FACE_STRIPE_ANIMATION_DURATION_MS = 4000;
const THREE_RENDER_PIXEL_RATIO_MAX = 4;
const SURFACE_MATERIAL_INDICES = [0, 1, 2, 3, 4, 5] as const;
const THREE_RECURSIVE_TILE_DEPTH = 3;
const LEFT_FACE_STRIPE_MASK_GLSL = `
float readLeftFaceStripeMask(float stripeCoordinate, float stripeWidth, float stripeGap) {
  if (stripeWidth <= 0.0) {
    return 0.0;
  }
  if (stripeGap <= 0.0) {
    return 1.0;
  }

  float period = max(stripeWidth + stripeGap, 0.0001);
  float stripePhase = mod(stripeCoordinate, period);
  // When stripe edges project onto the same screen line across separate faces,
  // hard thresholds can read as cracks; one-pixel derivative AA keeps them crisp.
  float edgeFeather = min(fwidth(stripeCoordinate) * 0.75, period * 0.5);
  float edgeOverdraw = min(edgeFeather, stripeGap * 0.45);
  float widthEdgeMask = 1.0 - smoothstep(
    stripeWidth + edgeOverdraw - edgeFeather,
    stripeWidth + edgeOverdraw + edgeFeather,
    stripePhase
  );
  float wrapEdgeMask = 1.0 - smoothstep(
    edgeOverdraw,
    edgeOverdraw + edgeFeather,
    period - stripePhase
  );
  return max(widthEdgeMask, wrapEdgeMask);
}
`;
const LEFT_FACE_PATTERN_FRAGMENT_SHADER = `
uniform vec3 backgroundColor;
uniform float opacity;
uniform vec3 primaryColor;
uniform vec3 secondaryColor;
uniform float stripeAngleRadians;
uniform float stripeGap;
uniform float stripeOffset;
uniform float stripeWidth;
uniform float stripedEnabled;
varying vec2 vUv;

${LEFT_FACE_STRIPE_MASK_GLSL}

void main() {
  vec3 faceColor = secondaryColor;

  if (stripedEnabled > 0.5) {
    vec2 stripeNormal = vec2(
      cos(stripeAngleRadians + 1.57079632679),
      sin(stripeAngleRadians + 1.57079632679)
    );
    float stripeCoordinate = dot(vUv, stripeNormal) + stripeOffset * (stripeWidth + stripeGap);
    float stripeMask = readLeftFaceStripeMask(stripeCoordinate, stripeWidth, stripeGap);
    faceColor = mix(backgroundColor, primaryColor, stripeMask);
  }

  gl_FragColor = vec4(faceColor, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const LEFT_FACE_PATTERN_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 transformedPosition = vec4(position, 1.0);

  #ifdef USE_INSTANCING
    transformedPosition = instanceMatrix * transformedPosition;
  #endif

  gl_Position = projectionMatrix * modelViewMatrix * transformedPosition;
}
`;
// Recursive opacity has to blend face colors in depth order. A single shader
// keeps right/top/left faces in one transparent draw path instead of batching
// whole color families ahead of nearer faces.
const RECURSIVE_SURFACE_FRAGMENT_SHADER = `
uniform vec3 backgroundColor;
uniform vec3 leftColor;
uniform float opacity;
uniform vec3 rightColor;
uniform vec3 topColor;
uniform float stripeAngleRadians;
uniform float stripeGap;
uniform float stripeOffset;
uniform float stripeWidth;
uniform float stripedEnabled;
varying float vLogoFaceKind;
varying vec2 vUv;

${LEFT_FACE_STRIPE_MASK_GLSL}

void main() {
  vec3 faceColor = rightColor;

  if (vLogoFaceKind > 1.5) {
    faceColor = leftColor;

    if (stripedEnabled > 0.5) {
      vec2 stripeNormal = vec2(
        cos(stripeAngleRadians + 1.57079632679),
        sin(stripeAngleRadians + 1.57079632679)
      );
      float stripeCoordinate = dot(vUv, stripeNormal) + stripeOffset * (stripeWidth + stripeGap);
      float stripeMask = readLeftFaceStripeMask(stripeCoordinate, stripeWidth, stripeGap);
      faceColor = mix(backgroundColor, rightColor, stripeMask);
    }
  } else if (vLogoFaceKind > 0.5) {
    faceColor = topColor;
  }

  gl_FragColor = vec4(faceColor, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const RECURSIVE_SURFACE_VERTEX_SHADER = `
attribute float logoFaceKind;
varying float vLogoFaceKind;
varying vec2 vUv;

void main() {
  vLogoFaceKind = logoFaceKind;
  vUv = uv;
  vec4 transformedPosition = vec4(position, 1.0);

  #ifdef USE_INSTANCING
    transformedPosition = instanceMatrix * transformedPosition;
  #endif

  gl_Position = projectionMatrix * modelViewMatrix * transformedPosition;
}
`;

export type LogoShuffleAnimationConfig = {
  enabled: boolean;
  parallelMoves: LogoShuffleParallelMoves;
};

type LogoSurfacePart = {
  geometry: THREE.BufferGeometry;
  materialIndex: number;
};

type LogoSceneMaterial = THREE.MeshBasicMaterial | THREE.ShaderMaterial;
type LogoSceneMaterials = [
  THREE.MeshBasicMaterial,
  THREE.MeshBasicMaterial,
  THREE.MeshBasicMaterial,
  THREE.MeshBasicMaterial,
  THREE.ShaderMaterial,
  THREE.ShaderMaterial,
];
type LogoSceneMesh =
  | THREE.Mesh<THREE.BufferGeometry, LogoSceneMaterial>
  | THREE.InstancedMesh<THREE.BufferGeometry, LogoSceneMaterial>;

type ResolvedSceneVoxelGrid = {
  baseGridSize: LogoGridSize;
  baseFilledVoxels: Set<string>;
  filledVoxels: Set<string>;
  gridSize: number;
  recursiveRenderDepth: number | null;
};

type LogoGeometryRenderState = {
  cameraFitRadius: number;
  meshes: LogoSceneMesh[];
  recursiveTileState: RecursiveTileSceneState | null;
};

type ActiveCubeMove = {
  durationMs: number;
  from: VoxelCoordinate;
  fromKey: string;
  hasDeparted: boolean;
  mesh: THREE.Mesh<THREE.BoxGeometry, LogoSceneMaterials>;
  startTimeMs: number;
  to: VoxelCoordinate;
  toKey: string;
};

type ActiveTileMove = {
  durationMs: number;
  from: VoxelCoordinate;
  fromKey: string;
  group: THREE.Group;
  hasDeparted: boolean;
  startTimeMs: number;
  to: VoxelCoordinate;
  toKey: string;
};

type RecursiveTileSceneState = {
  currentFilledTiles: Set<string>;
  distanceScale: number;
  fullGridSize: number;
  homeFilledTiles: Set<string>;
  innerMoveMeshes: THREE.Mesh[];
  instanceCapacity: number;
  keyToIndex: Map<string, number>;
  materialState: RecursiveSurfaceMaterialState;
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  meshes: THREE.InstancedMesh<THREE.BufferGeometry, LogoSceneMaterial>[];
  repeatGridSize: number;
  surfaceGeometry: RecursiveSurfaceGeometryState;
  tileGridSize: number;
};

type SceneState = {
  camera: THREE.OrthographicCamera;
  cameraFitRadius: number;
  cubeGeometry: THREE.BoxGeometry;
  cubeMaterials: LogoSceneMaterials;
  distanceScale: number;
  gridSize: number;
  currentFilledVoxels: Set<string>;
  activeCubeMoves: ActiveCubeMove[];
  activeTileMoves: ActiveTileMove[];
  baseGridSize: LogoGridSize;
  baseFilledVoxels: Set<string>;
  homeFilledVoxels: Set<string>;
  leftFaceMaterialState: LeftFaceMaterialState;
  leftFaceStyle: LogoLeftFaceStyle;
  logoGroup: THREE.Group;
  logoMeshes: LogoSceneMesh[];
  opacity: number;
  presentationTiltGroup: THREE.Group;
  raycaster: THREE.Raycaster;
  recursiveRenderDepth: number | null;
  recursiveTileState: RecursiveTileSceneState | null;
  renderer: THREE.WebGLRenderer;
  resizeScene: () => void;
  scene: THREE.Scene;
};

type ResolvedFaceColors = {
  left: THREE.Color;
  right: THREE.Color;
  top: THREE.Color;
};

type LeftFaceUniforms = {
  backgroundColor: THREE.IUniform<THREE.Color>;
  opacity: THREE.IUniform<number>;
  primaryColor: THREE.IUniform<THREE.Color>;
  secondaryColor: THREE.IUniform<THREE.Color>;
  stripeAngleRadians: THREE.IUniform<number>;
  stripeGap: THREE.IUniform<number>;
  stripeOffset: THREE.IUniform<number>;
  stripeWidth: THREE.IUniform<number>;
  stripedEnabled: THREE.IUniform<number>;
};

type LeftFaceMaterialState = {
  materials: [THREE.ShaderMaterial, THREE.ShaderMaterial];
  uniforms: [LeftFaceUniforms, LeftFaceUniforms];
};

type RecursiveSurfaceUniforms = {
  backgroundColor: THREE.IUniform<THREE.Color>;
  leftColor: THREE.IUniform<THREE.Color>;
  opacity: THREE.IUniform<number>;
  rightColor: THREE.IUniform<THREE.Color>;
  topColor: THREE.IUniform<THREE.Color>;
  stripeAngleRadians: THREE.IUniform<number>;
  stripeGap: THREE.IUniform<number>;
  stripeOffset: THREE.IUniform<number>;
  stripeWidth: THREE.IUniform<number>;
  stripedEnabled: THREE.IUniform<number>;
};

type RecursiveSurfaceMaterialState = {
  material: THREE.ShaderMaterial;
  uniforms: RecursiveSurfaceUniforms;
};

type RecursiveSurfaceDrawFace = {
  center: THREE.Vector3;
  key: string;
  vertexOffset: number;
};

type RecursiveSurfaceGeometryState = {
  drawFaces: RecursiveSurfaceDrawFace[];
  geometry: THREE.BufferGeometry;
  indices: Uint32Array;
};

type NLogoSceneProps = {
  baseGridSize?: LogoGridSize;
  backgroundColor: string;
  className?: string;
  distanceScale?: number;
  editMode: VoxelEdit["kind"];
  elevationDegrees: number;
  faceColors: FaceColors;
  leftFaceStyle?: LogoLeftFaceStyle;
  opacity: number;
  onInteractionStart?: () => void;
  onInteractionEnd?: (finalView: LogoViewState) => void;
  onRenderReady?: () => void;
  onRenderUnavailable?: () => void;
  onViewChange: (nextView: { elevationDegrees: number; rotationDegrees: number }) => void;
  onVoxelEdit: (edit: VoxelEdit) => void;
  /** Zero captures the rendered tilt; one renders exact neutral. */
  presentationTiltNeutralProgress?: number;
  presentationTiltTarget?: LogoPresentationTiltTarget;
  rotationAxisMode?: LogoRotationAxisMode;
  rotationDegrees: number;
  shuffleAnimation: LogoShuffleAnimationConfig;
  animateFaceColors: boolean;
  animateLeftFaceStripes: boolean;
  fractalDepth?: number;
  voxelGrid?: LogoVoxelGrid;
  voxelEditingEnabled?: boolean;
  viewDragConfig?: LogoViewDragConfig;
  voxelState: string;
};

function getVoxelWorldCenter(
  coordinate: VoxelCoordinate,
  gridSize: number,
  distanceScale = LOGO_DISTANCE_SCALE.defaultValue,
): readonly [number, number, number] {
  const worldCenterOffset = (gridSize - 1) / 2;
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  return [
    (coordinate[0] - worldCenterOffset) * normalizedDistanceScale,
    (coordinate[1] - worldCenterOffset) * normalizedDistanceScale,
    (coordinate[2] - worldCenterOffset) * normalizedDistanceScale,
  ];
}

function setCubeMeshPosition(
  mesh: THREE.Mesh<THREE.BoxGeometry, LogoSceneMaterials>,
  coordinate: VoxelCoordinate,
  gridSize: number,
  distanceScale: number,
) {
  const [x, y, z] = getVoxelWorldCenter(coordinate, gridSize, distanceScale);
  mesh.position.set(x, y, z);
}

function getThreeRenderPixelRatio(leftFaceStyle: LogoLeftFaceStyle): number {
  const normalizedStyle = normalizeLogoLeftFaceStyle(leftFaceStyle);
  const pixelRatioScale = normalizedStyle.kind === "striped" ? 2 : 1;
  return Math.min(window.devicePixelRatio * pixelRatioScale, THREE_RENDER_PIXEL_RATIO_MAX);
}

// One normalized progress loop advances the shader by one full stripe period.
function getLoopedLeftFaceStripeOffset(stripeOffset: number, animationProgress: number): number {
  const normalizedProgress = animationProgress % 1;
  const loopedProgress = normalizedProgress < 0 ? normalizedProgress + 1 : normalizedProgress;
  return (stripeOffset + loopedProgress) % 1;
}

function getCubeMovePosition(
  move: ActiveCubeMove,
  progress: number,
  gridSize: number,
  distanceScale: number,
): readonly [number, number, number] {
  const [startX, startY, startZ] = getVoxelWorldCenter(move.from, gridSize, distanceScale);
  const [endX, endY, endZ] = getVoxelWorldCenter(move.to, gridSize, distanceScale);
  const travelProgress = easeLogoShuffleProgress(progress);
  return [
    startX + (endX - startX) * travelProgress,
    startY + (endY - startY) * travelProgress,
    startZ + (endZ - startZ) * travelProgress,
  ];
}

function getSurfaceVertexUv(
  surfaceQuad: LogoSurfaceQuad,
  vertex: readonly [number, number, number],
): readonly [number, number] {
  switch (surfaceQuad.colorKey) {
    case "left":
      return [vertex[0], vertex[1]];
    case "right":
      return [vertex[2], vertex[1]];
    case "top":
      return [vertex[0], vertex[2]];
    default: {
      const unreachable = surfaceQuad.colorKey satisfies never;
      return unreachable;
    }
  }
}

function randomValueFrom<T>(values: readonly T[]): T | null {
  if (values.length === 0) {
    return null;
  }

  return values[Math.floor(Math.random() * values.length)] ?? null;
}

function resolveSceneVoxelGrid({
  baseGridSize = DEFAULT_LOGO_GRID_SIZE,
  fractalDepth,
  voxelGrid,
  voxelState,
}: {
  baseGridSize?: LogoGridSize;
  fractalDepth: number | undefined;
  voxelGrid: LogoVoxelGrid | undefined;
  voxelState: string;
}): ResolvedSceneVoxelGrid {
  const parsedVoxelState = parseVoxelState(voxelState);
  const baseFilledVoxels =
    parsedVoxelState && parsedVoxelState.gridSize === baseGridSize
      ? parsedVoxelState.filledVoxels
      : createDefaultFilledVoxelSet(baseGridSize);
  const normalizedFractalDepth = clampLogoFractalDepthForRenderer(
    fractalDepth ?? DEFAULT_LOGO_FRACTAL_DEPTH,
    "three",
  );

  if (voxelGrid) {
    return {
      baseGridSize,
      baseFilledVoxels,
      filledVoxels: new Set(voxelGrid.filledVoxels),
      gridSize: voxelGrid.gridSize,
      recursiveRenderDepth: null,
    };
  }

  if (normalizedFractalDepth > DEFAULT_LOGO_FRACTAL_DEPTH) {
    return {
      baseGridSize,
      baseFilledVoxels,
      filledVoxels: new Set(baseFilledVoxels),
      gridSize: getLogoFractalGridSize(baseGridSize, normalizedFractalDepth),
      recursiveRenderDepth: normalizedFractalDepth,
    };
  }

  return {
    baseGridSize,
    baseFilledVoxels,
    filledVoxels: new Set(baseFilledVoxels),
    gridSize: baseGridSize,
    recursiveRenderDepth: null,
  };
}

function buildQuadGeometry(surfaceQuad: LogoSurfaceQuad): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = surfaceQuad.vertices.flatMap(([x, y, z]) => [x, y, z]);
  const normals = surfaceQuad.vertices.flatMap(() => [
    surfaceQuad.normal[0],
    surfaceQuad.normal[1],
    surfaceQuad.normal[2],
  ]);
  const uvs = surfaceQuad.vertices.flatMap((vertex) => getSurfaceVertexUv(surfaceQuad, vertex));

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeBoundingSphere();

  return geometry;
}

function buildMergedQuadGeometry(surfaceQuads: readonly LogoSurfaceQuad[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertexCount = surfaceQuads.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(surfaceQuads.length * 6);
  let indexOffset = 0;
  let uvOffset = 0;
  let vertexOffset = 0;
  let vectorOffset = 0;

  for (const surfaceQuad of surfaceQuads) {
    for (const vertex of surfaceQuad.vertices) {
      const [x, y, z] = vertex;
      const [u, v] = getSurfaceVertexUv(surfaceQuad, vertex);
      positions[vectorOffset] = x;
      positions[vectorOffset + 1] = y;
      positions[vectorOffset + 2] = z;
      normals[vectorOffset] = surfaceQuad.normal[0];
      normals[vectorOffset + 1] = surfaceQuad.normal[1];
      normals[vectorOffset + 2] = surfaceQuad.normal[2];
      uvs[uvOffset] = u;
      uvs[uvOffset + 1] = v;
      uvOffset += 2;
      vectorOffset += 3;
    }
    indices[indexOffset] = vertexOffset;
    indices[indexOffset + 1] = vertexOffset + 1;
    indices[indexOffset + 2] = vertexOffset + 2;
    indices[indexOffset + 3] = vertexOffset;
    indices[indexOffset + 4] = vertexOffset + 2;
    indices[indexOffset + 5] = vertexOffset + 3;
    indexOffset += 6;
    vertexOffset += 4;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  return geometry;
}

function getRecursiveSurfaceFaceKind(colorKey: LogoSurfaceQuad["colorKey"]): number {
  switch (colorKey) {
    case "right":
      return 0;
    case "top":
      return 1;
    case "left":
      return 2;
    default: {
      const unreachable = colorKey satisfies never;
      return unreachable;
    }
  }
}

function getSurfaceQuadCenter(surfaceQuad: LogoSurfaceQuad): THREE.Vector3 {
  const center = new THREE.Vector3();
  for (const [x, y, z] of surfaceQuad.vertices) {
    center.x += x;
    center.y += y;
    center.z += z;
  }
  center.multiplyScalar(1 / surfaceQuad.vertices.length);
  return center;
}

function writeQuadIndices(indices: Uint32Array, indexOffset: number, vertexOffset: number) {
  indices[indexOffset] = vertexOffset;
  indices[indexOffset + 1] = vertexOffset + 1;
  indices[indexOffset + 2] = vertexOffset + 2;
  indices[indexOffset + 3] = vertexOffset;
  indices[indexOffset + 4] = vertexOffset + 2;
  indices[indexOffset + 5] = vertexOffset + 3;
}

function buildRecursiveSurfaceGeometry(
  surfaceQuads: readonly LogoSurfaceQuad[],
): RecursiveSurfaceGeometryState {
  const geometry = new THREE.BufferGeometry();
  const vertexCount = surfaceQuads.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const faceKinds = new Float32Array(vertexCount);
  const indices = new Uint32Array(surfaceQuads.length * 6);
  const drawFaces: RecursiveSurfaceDrawFace[] = [];
  let indexOffset = 0;
  let uvOffset = 0;
  let vertexOffset = 0;
  let vectorOffset = 0;

  for (const surfaceQuad of surfaceQuads) {
    const faceKind = getRecursiveSurfaceFaceKind(surfaceQuad.colorKey);
    drawFaces.push({
      center: getSurfaceQuadCenter(surfaceQuad),
      key: surfaceQuad.key,
      vertexOffset,
    });

    for (const vertex of surfaceQuad.vertices) {
      const [x, y, z] = vertex;
      const [u, v] = getSurfaceVertexUv(surfaceQuad, vertex);
      positions[vectorOffset] = x;
      positions[vectorOffset + 1] = y;
      positions[vectorOffset + 2] = z;
      uvs[uvOffset] = u;
      uvs[uvOffset + 1] = v;
      faceKinds[vertexOffset] = faceKind;
      uvOffset += 2;
      vectorOffset += 3;
      vertexOffset += 1;
    }

    writeQuadIndices(indices, indexOffset, vertexOffset - 4);
    indexOffset += 6;
  }

  const indexAttribute = new THREE.BufferAttribute(indices, 1);
  indexAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("logoFaceKind", new THREE.BufferAttribute(faceKinds, 1));
  geometry.setIndex(indexAttribute);
  geometry.computeBoundingSphere();

  return { drawFaces, geometry, indices };
}

function buildLogoSurfacePart(surfaceQuad: LogoSurfaceQuad): LogoSurfacePart {
  return {
    geometry: buildQuadGeometry(surfaceQuad),
    materialIndex: surfaceQuad.materialIndex,
  };
}

type SpacedLogoCubeFaceSpec = {
  colorKey: LogoSurfaceQuad["colorKey"];
  key: string;
  materialIndex: number;
  normal: LogoSurfaceQuad["normal"];
  vertices: LogoSurfaceQuad["vertices"];
};

const SPACED_LOGO_CUBE_FACE_SPECS = [
  {
    colorKey: "right",
    key: "positive-x",
    materialIndex: 0,
    normal: [1, 0, 0],
    vertices: [
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5],
    ],
  },
  {
    colorKey: "right",
    key: "negative-x",
    materialIndex: 1,
    normal: [-1, 0, 0],
    vertices: [
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5],
    ],
  },
  {
    colorKey: "top",
    key: "positive-y",
    materialIndex: 2,
    normal: [0, 1, 0],
    vertices: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
  },
  {
    colorKey: "top",
    key: "negative-y",
    materialIndex: 3,
    normal: [0, -1, 0],
    vertices: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
  },
  {
    colorKey: "left",
    key: "positive-z",
    materialIndex: 4,
    normal: [0, 0, 1],
    vertices: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
  },
  {
    colorKey: "left",
    key: "negative-z",
    materialIndex: 5,
    normal: [0, 0, -1],
    vertices: [
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
    ],
  },
] satisfies readonly SpacedLogoCubeFaceSpec[];

function translateLogoSurfaceVertices(
  vertices: LogoSurfaceQuad["vertices"],
  center: readonly [number, number, number],
): LogoSurfaceQuad["vertices"] {
  return [
    [vertices[0][0] + center[0], vertices[0][1] + center[1], vertices[0][2] + center[2]],
    [vertices[1][0] + center[0], vertices[1][1] + center[1], vertices[1][2] + center[2]],
    [vertices[2][0] + center[0], vertices[2][1] + center[1], vertices[2][2] + center[2]],
    [vertices[3][0] + center[0], vertices[3][1] + center[1], vertices[3][2] + center[2]],
  ];
}

function buildDistanceScaledLogoSurfaceQuads(
  filledVoxels: ReadonlySet<string>,
  gridSize: number,
  distanceScale: number,
): LogoSurfaceQuad[] {
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  if (normalizedDistanceScale === LOGO_DISTANCE_SCALE.defaultValue) {
    return buildLogoSurfaceQuads(filledVoxels, gridSize);
  }

  const quads: LogoSurfaceQuad[] = [];
  for (const key of [...filledVoxels].sort()) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate || !isWithinVoxelGrid(gridSize, ...coordinate)) {
      continue;
    }

    const center = getVoxelWorldCenter(coordinate, gridSize, normalizedDistanceScale);
    for (const face of SPACED_LOGO_CUBE_FACE_SPECS) {
      quads.push({
        colorKey: face.colorKey,
        key: `distance:${key}:${face.key}`,
        materialIndex: face.materialIndex,
        normal: face.normal,
        vertices: translateLogoSurfaceVertices(face.vertices, center),
      });
    }
  }

  return quads;
}

function getDistanceScaledGridFitRadius(gridSize: number, distanceScale: number): number {
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  return (((gridSize - 1) / 2) * normalizedDistanceScale + 0.5) * Math.sqrt(3);
}

function buildLogoSurfaceParts(
  surfaceQuads: readonly LogoSurfaceQuad[],
  mergeByMaterial: boolean,
): LogoSurfacePart[] {
  if (!mergeByMaterial) {
    return surfaceQuads.map(buildLogoSurfacePart);
  }

  return SURFACE_MATERIAL_INDICES.flatMap((materialIndex) => {
    const materialQuads = surfaceQuads.filter(
      (surfaceQuad) => surfaceQuad.materialIndex === materialIndex,
    );
    if (materialQuads.length === 0) {
      return [];
    }

    return [
      {
        geometry: buildMergedQuadGeometry(materialQuads),
        materialIndex,
      },
    ];
  });
}

function createLogoMeshesFromParts(
  logoParts: readonly LogoSurfacePart[],
  materials: LogoSceneMaterials,
): LogoSceneMesh[] {
  return logoParts.map(
    ({ geometry, materialIndex }) => new THREE.Mesh(geometry, materials[materialIndex]),
  );
}

function getRecursiveTileDepth(recursiveRenderDepth: number): number {
  return Math.min(THREE_RECURSIVE_TILE_DEPTH, recursiveRenderDepth - 1);
}

function getRecursiveCameraFitRadius({
  baseFilledVoxels,
  baseGridSize,
  distanceScale,
  fullGridSize,
}: {
  baseFilledVoxels: ReadonlySet<string>;
  baseGridSize: LogoGridSize;
  distanceScale: number;
  fullGridSize: number;
}) {
  const baseSurfaceQuads = buildDistanceScaledLogoSurfaceQuads(
    baseFilledVoxels,
    baseGridSize,
    distanceScale,
  );
  const baseFitRadius =
    baseSurfaceQuads.length > 0
      ? getLogoSurfaceFitRadius(baseSurfaceQuads, baseGridSize)
      : getDistanceScaledGridFitRadius(baseGridSize, distanceScale);

  return baseFitRadius * (fullGridSize / baseGridSize);
}

function getTileWorldCenter({
  coordinate,
  distanceScale,
  fullGridSize,
  tileGridSize,
}: {
  coordinate: VoxelCoordinate;
  distanceScale: number;
  fullGridSize: number;
  tileGridSize: number;
}): readonly [number, number, number] {
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  return [
    (coordinate[0] * tileGridSize + tileGridSize / 2 - fullGridSize / 2) * normalizedDistanceScale,
    (coordinate[1] * tileGridSize + tileGridSize / 2 - fullGridSize / 2) * normalizedDistanceScale,
    (coordinate[2] * tileGridSize + tileGridSize / 2 - fullGridSize / 2) * normalizedDistanceScale,
  ];
}

function getTileMoveCoordinate(move: ActiveTileMove, progress: number): VoxelCoordinate {
  const travelProgress = easeLogoShuffleProgress(progress);
  return [
    move.from[0] + (move.to[0] - move.from[0]) * travelProgress,
    move.from[1] + (move.to[1] - move.from[1]) * travelProgress,
    move.from[2] + (move.to[2] - move.from[2]) * travelProgress,
  ];
}

function getTileMovePosition(
  move: ActiveTileMove,
  progress: number,
  tileState: RecursiveTileSceneState,
): readonly [number, number, number] {
  return getTileWorldCenter({
    coordinate: getTileMoveCoordinate(move, progress),
    distanceScale: tileState.distanceScale,
    fullGridSize: tileState.fullGridSize,
    tileGridSize: tileState.tileGridSize,
  });
}

function createRecursiveInstanceMatrices({
  baseGridSize,
  baseFilledVoxels,
  distanceScale,
  fullGridSize,
  recursiveRenderDepth,
  tileGridSize,
}: {
  baseGridSize: LogoGridSize;
  baseFilledVoxels: ReadonlySet<string>;
  distanceScale: number;
  fullGridSize: number;
  recursiveRenderDepth: number;
  tileGridSize: number;
}): {
  filledTiles: Set<string>;
  keyToIndex: Map<string, number>;
  matrices: THREE.Matrix4[];
  repeatGridSize: number;
} {
  const tileDepth = getRecursiveTileDepth(recursiveRenderDepth);
  const repeatDepth = recursiveRenderDepth - tileDepth;
  const repeatVoxelGrid = createLogoFractalVoxelGrid({
    depth: repeatDepth,
    filledVoxels: baseFilledVoxels,
    gridSize: baseGridSize,
  });
  const filledTiles = new Set<string>();
  const keyToIndex = new Map<string, number>();
  const matrices: THREE.Matrix4[] = [];

  for (const key of repeatVoxelGrid.filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate) {
      continue;
    }

    const [x, y, z] = coordinate;
    const matrix = new THREE.Matrix4();
    const [centerX, centerY, centerZ] = getTileWorldCenter({
      coordinate: [x, y, z],
      distanceScale,
      fullGridSize,
      tileGridSize,
    });
    matrix.makeTranslation(centerX, centerY, centerZ);
    keyToIndex.set(key, matrices.length);
    filledTiles.add(key);
    matrices.push(matrix);
  }

  return {
    filledTiles,
    keyToIndex,
    matrices,
    repeatGridSize: repeatVoxelGrid.gridSize,
  };
}

function createRecursiveLogoMeshes({
  baseGridSize,
  baseFilledVoxels,
  distanceScale,
  fullGridSize,
  recursiveRenderDepth,
}: {
  baseGridSize: LogoGridSize;
  baseFilledVoxels: ReadonlySet<string>;
  distanceScale: number;
  fullGridSize: number;
  recursiveRenderDepth: number;
}): LogoGeometryRenderState {
  const tileDepth = getRecursiveTileDepth(recursiveRenderDepth);
  const tileVoxelGrid = createLogoFractalVoxelGrid({
    depth: tileDepth,
    filledVoxels: baseFilledVoxels,
    gridSize: baseGridSize,
  });
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  const tileSurfaceQuads = buildDistanceScaledLogoSurfaceQuads(
    tileVoxelGrid.filledVoxels,
    tileVoxelGrid.gridSize,
    normalizedDistanceScale,
  );
  const surfaceGeometry = buildRecursiveSurfaceGeometry(tileSurfaceQuads);
  const materialState = createRecursiveSurfaceMaterialState();
  const instanceState = createRecursiveInstanceMatrices({
    baseGridSize,
    baseFilledVoxels,
    distanceScale: normalizedDistanceScale,
    fullGridSize,
    recursiveRenderDepth,
    tileGridSize: tileVoxelGrid.gridSize,
  });
  const mesh = new THREE.InstancedMesh(
    surfaceGeometry.geometry,
    materialState.material,
    instanceState.matrices.length,
  );

  instanceState.matrices.forEach((matrix, index) => {
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  const meshes = [mesh];

  return {
    cameraFitRadius: getRecursiveCameraFitRadius({
      baseFilledVoxels,
      baseGridSize,
      distanceScale: normalizedDistanceScale,
      fullGridSize,
    }),
    meshes,
    recursiveTileState: {
      currentFilledTiles: new Set(instanceState.filledTiles),
      distanceScale: normalizedDistanceScale,
      fullGridSize,
      homeFilledTiles: new Set(instanceState.filledTiles),
      innerMoveMeshes: [],
      instanceCapacity: instanceState.matrices.length,
      keyToIndex: new Map(instanceState.keyToIndex),
      materialState,
      mesh,
      meshes,
      repeatGridSize: instanceState.repeatGridSize,
      surfaceGeometry,
      tileGridSize: tileVoxelGrid.gridSize,
    },
  };
}

function createLogoGeometryRenderState({
  baseGridSize,
  baseFilledVoxels,
  distanceScale,
  filledVoxels,
  gridSize,
  materials,
  recursiveRenderDepth,
}: {
  baseGridSize: LogoGridSize;
  baseFilledVoxels: ReadonlySet<string>;
  distanceScale: number;
  filledVoxels: ReadonlySet<string>;
  gridSize: number;
  materials: LogoSceneMaterials;
  recursiveRenderDepth: number | null;
}): LogoGeometryRenderState {
  if (recursiveRenderDepth) {
    return createRecursiveLogoMeshes({
      baseGridSize,
      baseFilledVoxels,
      distanceScale,
      fullGridSize: gridSize,
      recursiveRenderDepth,
    });
  }

  const surfaceQuads = buildDistanceScaledLogoSurfaceQuads(filledVoxels, gridSize, distanceScale);
  const cameraFitRadius =
    surfaceQuads.length > 0
      ? getLogoSurfaceFitRadius(surfaceQuads, gridSize)
      : getDistanceScaledGridFitRadius(gridSize, distanceScale);
  return {
    cameraFitRadius,
    meshes: createLogoMeshesFromParts(
      buildLogoSurfaceParts(surfaceQuads, gridSize > baseGridSize),
      materials,
    ),
    recursiveTileState: null,
  };
}

function pointToVoxelCoordinate(
  point: THREE.Vector3,
  gridSize: number,
  distanceScale: number,
): VoxelCoordinate | null {
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  const readAxis = (value: number): number | null => {
    if (normalizedDistanceScale === LOGO_DISTANCE_SCALE.defaultValue) {
      return Math.floor(value + gridSize / 2);
    }

    for (let index = 0; index < gridSize; index += 1) {
      const center = (index - (gridSize - 1) / 2) * normalizedDistanceScale;
      if (value >= center - 0.5 && value <= center + 0.5) {
        return index;
      }
    }

    return null;
  };
  const x = readAxis(point.x);
  const y = readAxis(point.y);
  const z = readAxis(point.z);
  if (x === null || y === null || z === null) {
    return null;
  }

  if (!isWithinVoxelGrid(gridSize, x, y, z)) {
    return null;
  }

  return [x, y, z];
}

function createLeftFaceUniforms(): LeftFaceUniforms {
  return {
    backgroundColor: { value: new THREE.Color() },
    opacity: { value: 1 },
    primaryColor: { value: new THREE.Color() },
    secondaryColor: { value: new THREE.Color() },
    stripeAngleRadians: { value: 0 },
    stripeGap: { value: 0 },
    stripeOffset: { value: 0 },
    stripeWidth: { value: 0 },
    stripedEnabled: { value: 0 },
  };
}

function createLeftFaceMaterialState(): LeftFaceMaterialState {
  const leftPositiveUniforms = createLeftFaceUniforms();
  const leftNegativeUniforms = createLeftFaceUniforms();
  const createMaterial = (uniforms: LeftFaceUniforms) => {
    const material = new THREE.ShaderMaterial({
      fragmentShader: LEFT_FACE_PATTERN_FRAGMENT_SHADER,
      uniforms,
      vertexShader: LEFT_FACE_PATTERN_VERTEX_SHADER,
    });
    material.forceSinglePass = false;
    return material;
  };

  return {
    materials: [createMaterial(leftPositiveUniforms), createMaterial(leftNegativeUniforms)],
    uniforms: [leftPositiveUniforms, leftNegativeUniforms],
  };
}

function createRecursiveSurfaceUniforms(): RecursiveSurfaceUniforms {
  return {
    backgroundColor: { value: new THREE.Color() },
    leftColor: { value: new THREE.Color() },
    opacity: { value: 1 },
    rightColor: { value: new THREE.Color() },
    topColor: { value: new THREE.Color() },
    stripeAngleRadians: { value: 0 },
    stripeGap: { value: 0 },
    stripeOffset: { value: 0 },
    stripeWidth: { value: 0 },
    stripedEnabled: { value: 0 },
  };
}

function createRecursiveSurfaceMaterialState(): RecursiveSurfaceMaterialState {
  const uniforms = createRecursiveSurfaceUniforms();
  const material = new THREE.ShaderMaterial({
    fragmentShader: RECURSIVE_SURFACE_FRAGMENT_SHADER,
    uniforms,
    vertexShader: RECURSIVE_SURFACE_VERTEX_SHADER,
  });
  material.forceSinglePass = false;

  return { material, uniforms };
}

function createLogoSceneMaterials(): {
  leftFaceMaterialState: LeftFaceMaterialState;
  materials: LogoSceneMaterials;
} {
  const leftFaceMaterialState = createLeftFaceMaterialState();
  return {
    leftFaceMaterialState,
    materials: [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      leftFaceMaterialState.materials[0],
      leftFaceMaterialState.materials[1],
    ],
  };
}

function applyFaceColors({
  backgroundColor,
  faceColors,
  leftFaceMaterialState,
  leftFaceStyle,
  materials,
  opacity,
}: {
  backgroundColor: string;
  faceColors: FaceColors;
  leftFaceMaterialState: LeftFaceMaterialState;
  leftFaceStyle: LogoLeftFaceStyle;
  materials: LogoSceneMaterials;
  opacity: number;
}) {
  applyResolvedFaceColors({
    backgroundColor,
    faceColors: resolveFaceColors(faceColors),
    leftFaceMaterialState,
    leftFaceStyle,
    materials,
    opacity,
  });
}

function resolveFaceColors(faceColors: FaceColors): ResolvedFaceColors {
  return {
    left: new THREE.Color(getTailwindColorHex(faceColors.left)),
    right: new THREE.Color(getTailwindColorHex(faceColors.right)),
    top: new THREE.Color(getTailwindColorHex(faceColors.top)),
  };
}

function applyResolvedFaceColors({
  backgroundColor,
  faceColors,
  leftFaceMaterialState,
  leftFaceStyle,
  materials,
  opacity,
}: {
  backgroundColor: string;
  faceColors: ResolvedFaceColors;
  leftFaceMaterialState: LeftFaceMaterialState;
  leftFaceStyle: LogoLeftFaceStyle;
  materials: LogoSceneMaterials;
  opacity: number;
}) {
  materials[0].color.copy(faceColors.right);
  materials[1].color.copy(faceColors.right);
  materials[2].color.copy(faceColors.top);
  materials[3].color.copy(faceColors.top);
  applyLeftFaceMaterialState({
    backgroundColor,
    faceColors,
    leftFaceMaterialState,
    leftFaceStyle,
    opacity,
  });
}

function applyLeftFaceMaterialState({
  backgroundColor,
  faceColors,
  leftFaceMaterialState,
  leftFaceStyle,
  opacity,
}: {
  backgroundColor: string;
  faceColors: ResolvedFaceColors;
  leftFaceMaterialState: LeftFaceMaterialState;
  leftFaceStyle: LogoLeftFaceStyle;
  opacity: number;
}) {
  const normalizedStyle = normalizeLogoLeftFaceStyle(leftFaceStyle);
  const background = new THREE.Color(backgroundColor);
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);

  for (const uniforms of leftFaceMaterialState.uniforms) {
    uniforms.backgroundColor.value.copy(background);
    uniforms.opacity.value = normalizedOpacity;
    uniforms.primaryColor.value.copy(faceColors.right);
    uniforms.secondaryColor.value.copy(faceColors.left);
    uniforms.stripedEnabled.value = normalizedStyle.kind === "striped" ? 1 : 0;

    if (normalizedStyle.kind === "striped") {
      const stripeBasisScale = getLogoLeftFaceStripeBasisScale(normalizedStyle);

      uniforms.stripeAngleRadians.value = THREE.MathUtils.degToRad(
        normalizedStyle.stripeAngleDegrees,
      );
      uniforms.stripeGap.value = normalizedStyle.stripeGap * stripeBasisScale;
      uniforms.stripeOffset.value = normalizedStyle.stripeOffset;
      uniforms.stripeWidth.value = normalizedStyle.stripeWidth * stripeBasisScale;
      continue;
    }

    uniforms.stripeAngleRadians.value = 0;
    uniforms.stripeGap.value = 0;
    uniforms.stripeOffset.value = 0;
    uniforms.stripeWidth.value = 0;
  }
}

function applyRecursiveSurfaceMaterialState({
  backgroundColor,
  faceColors,
  leftFaceStyle,
  materialState,
  opacity,
}: {
  backgroundColor: string;
  faceColors: ResolvedFaceColors;
  leftFaceStyle: LogoLeftFaceStyle;
  materialState: RecursiveSurfaceMaterialState;
  opacity: number;
}) {
  const normalizedStyle = normalizeLogoLeftFaceStyle(leftFaceStyle);
  const background = new THREE.Color(backgroundColor);
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const { uniforms } = materialState;

  uniforms.backgroundColor.value.copy(background);
  uniforms.leftColor.value.copy(faceColors.left);
  uniforms.opacity.value = normalizedOpacity;
  uniforms.rightColor.value.copy(faceColors.right);
  uniforms.topColor.value.copy(faceColors.top);
  uniforms.stripedEnabled.value = normalizedStyle.kind === "striped" ? 1 : 0;

  if (normalizedStyle.kind === "striped") {
    const stripeBasisScale = getLogoLeftFaceStripeBasisScale(normalizedStyle);

    uniforms.stripeAngleRadians.value = THREE.MathUtils.degToRad(
      normalizedStyle.stripeAngleDegrees,
    );
    uniforms.stripeGap.value = normalizedStyle.stripeGap * stripeBasisScale;
    uniforms.stripeOffset.value = normalizedStyle.stripeOffset;
    uniforms.stripeWidth.value = normalizedStyle.stripeWidth * stripeBasisScale;
    return;
  }

  uniforms.stripeAngleRadians.value = 0;
  uniforms.stripeGap.value = 0;
  uniforms.stripeOffset.value = 0;
  uniforms.stripeWidth.value = 0;
}

function applySceneResolvedFaceColors({
  backgroundColor,
  faceColors,
  sceneState,
}: {
  backgroundColor: string;
  faceColors: ResolvedFaceColors;
  sceneState: SceneState;
}) {
  applyResolvedFaceColors({
    backgroundColor,
    faceColors,
    leftFaceMaterialState: sceneState.leftFaceMaterialState,
    leftFaceStyle: sceneState.leftFaceStyle,
    materials: sceneState.cubeMaterials,
    opacity: sceneState.opacity,
  });

  if (sceneState.recursiveTileState) {
    applyRecursiveSurfaceMaterialState({
      backgroundColor,
      faceColors,
      leftFaceStyle: sceneState.leftFaceStyle,
      materialState: sceneState.recursiveTileState.materialState,
      opacity: sceneState.opacity,
    });
  }
}

function applySceneLeftFaceStripeAnimationProgress(
  sceneState: SceneState,
  animationProgress: number,
) {
  const normalizedStyle = normalizeLogoLeftFaceStyle(sceneState.leftFaceStyle);
  if (normalizedStyle.kind !== "striped") {
    return;
  }

  const stripeOffset = getLoopedLeftFaceStripeOffset(
    normalizedStyle.stripeOffset,
    animationProgress,
  );
  for (const uniforms of sceneState.leftFaceMaterialState.uniforms) {
    uniforms.stripeOffset.value = stripeOffset;
  }

  const recursiveTileState = sceneState.recursiveTileState;
  if (recursiveTileState) {
    recursiveTileState.materialState.uniforms.stripeOffset.value = stripeOffset;
  }
}

function getAnimatedColor(color: THREE.Color, elapsedSeconds: number): THREE.Color {
  const hsl = { h: 0, l: 0, s: 0 };
  color.getHSL(hsl);

  return new THREE.Color().setHSL(
    (hsl.h + (elapsedSeconds * FACE_COLOR_ANIMATION_DEGREES_PER_SECOND) / 360) % 1,
    Math.max(hsl.s, FACE_COLOR_ANIMATION_MIN_SATURATION),
    THREE.MathUtils.clamp(
      hsl.l,
      FACE_COLOR_ANIMATION_MIN_LIGHTNESS,
      FACE_COLOR_ANIMATION_MAX_LIGHTNESS,
    ),
  );
}

function getAnimatedFaceColors(faceColors: FaceColors, elapsedSeconds: number): ResolvedFaceColors {
  const resolvedFaceColors = resolveFaceColors(faceColors);
  return {
    left: getAnimatedColor(resolvedFaceColors.left, elapsedSeconds),
    right: getAnimatedColor(resolvedFaceColors.right, elapsedSeconds),
    top: getAnimatedColor(resolvedFaceColors.top, elapsedSeconds),
  };
}

function applyMaterialOpacity(materials: LogoSceneMaterials, opacity: number): number {
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const isTransparent = normalizedOpacity < 1;
  const nextSide = isTransparent ? THREE.DoubleSide : THREE.FrontSide;

  for (const material of materials) {
    material.opacity = normalizedOpacity;
    // Avoid transparent draws writing depth while alpha blending the logo study.
    material.depthWrite = !isTransparent;
    let needsUpdate = false;
    if (material.side !== nextSide) {
      material.side = nextSide;
      needsUpdate = true;
    }
    if (material.transparent !== isTransparent) {
      material.transparent = isTransparent;
      needsUpdate = true;
    }
    if (needsUpdate) {
      material.needsUpdate = true;
    }
  }

  return normalizedOpacity;
}

function applyRecursiveSurfaceOpacity(
  materialState: RecursiveSurfaceMaterialState,
  opacity: number,
): number {
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const isTransparent = normalizedOpacity < 1;
  const nextSide = isTransparent ? THREE.DoubleSide : THREE.FrontSide;
  const { material, uniforms } = materialState;

  uniforms.opacity.value = normalizedOpacity;
  material.opacity = normalizedOpacity;
  material.depthWrite = !isTransparent;
  let needsUpdate = false;
  if (material.side !== nextSide) {
    material.side = nextSide;
    needsUpdate = true;
  }
  if (material.transparent !== isTransparent) {
    material.transparent = isTransparent;
    needsUpdate = true;
  }
  if (needsUpdate) {
    material.needsUpdate = true;
  }

  return normalizedOpacity;
}

function applySceneOpacity(sceneState: SceneState, opacity: number): number {
  const normalizedOpacity = applyMaterialOpacity(sceneState.cubeMaterials, opacity);
  sceneState.opacity = normalizedOpacity;
  sceneState.renderer.domElement.style.opacity = "1";
  if (sceneState.recursiveTileState) {
    applyRecursiveSurfaceOpacity(sceneState.recursiveTileState.materialState, normalizedOpacity);
  }
  return normalizedOpacity;
}

function replaceLogoGeometry(
  sceneState: SceneState,
  nextFilledVoxels: Set<string>,
  nextGridSize: number,
  syncCameraFitRadius: boolean,
) {
  const nextGeometry = createLogoGeometryRenderState({
    baseGridSize: sceneState.baseGridSize,
    baseFilledVoxels: sceneState.baseFilledVoxels,
    distanceScale: sceneState.distanceScale,
    filledVoxels: nextFilledVoxels,
    gridSize: nextGridSize,
    materials: sceneState.cubeMaterials,
    recursiveRenderDepth: sceneState.recursiveRenderDepth,
  });
  const previousLogoMeshes = sceneState.logoMeshes;
  const previousRecursiveMaterial = sceneState.recursiveTileState?.materialState.material ?? null;
  for (const logoMesh of previousLogoMeshes) {
    sceneState.logoGroup.remove(logoMesh);
    logoMesh.geometry.dispose();
  }
  previousRecursiveMaterial?.dispose();
  sceneState.logoMeshes = nextGeometry.meshes;
  for (const logoMesh of sceneState.logoMeshes) {
    sceneState.logoGroup.add(logoMesh);
  }
  sceneState.recursiveTileState = nextGeometry.recursiveTileState;
  sceneState.currentFilledVoxels = new Set(nextFilledVoxels);
  sceneState.gridSize = nextGridSize;
  applySceneOpacity(sceneState, sceneState.opacity);
  if (syncCameraFitRadius) {
    sceneState.cameraFitRadius = nextGeometry.cameraFitRadius;
  }
  sceneState.resizeScene();
}

function getCameraSpaceDepth(
  point: THREE.Vector3,
  matrixWorld: THREE.Matrix4,
  camera: THREE.Camera,
): number {
  return point.applyMatrix4(matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
}

function syncRecursiveSurfaceDrawOrder(sceneState: SceneState) {
  const tileState = sceneState.recursiveTileState;
  if (!tileState || sceneState.opacity >= 1) {
    return;
  }

  // Transparent recursive tiles share one geometry, so the index buffer carries
  // the per-face painter order for the current view.
  const depthVector = new THREE.Vector3();
  const sortedFaces = tileState.surfaceGeometry.drawFaces.map((face) => {
    depthVector.copy(face.center);
    return {
      depth: getCameraSpaceDepth(depthVector, tileState.mesh.matrixWorld, sceneState.camera),
      face,
    };
  });

  sortedFaces.sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }

    return left.face.key.localeCompare(right.face.key);
  });

  let indexOffset = 0;
  for (const { face } of sortedFaces) {
    writeQuadIndices(tileState.surfaceGeometry.indices, indexOffset, face.vertexOffset);
    indexOffset += 6;
  }

  const indexAttribute = tileState.surfaceGeometry.geometry.getIndex();
  if (indexAttribute) {
    indexAttribute.needsUpdate = true;
  }
}

function getTileCameraDepth(
  key: string,
  sceneState: SceneState,
  tileState: RecursiveTileSceneState,
): number {
  const coordinate = parseVoxelKey(key);
  if (!coordinate) {
    return Number.POSITIVE_INFINITY;
  }

  const [x, y, z] = getTileWorldCenter({
    coordinate,
    distanceScale: tileState.distanceScale,
    fullGridSize: tileState.fullGridSize,
    tileGridSize: tileState.tileGridSize,
  });
  return getCameraSpaceDepth(
    new THREE.Vector3(x, y, z),
    sceneState.logoGroup.matrixWorld,
    sceneState.camera,
  );
}

function syncRecursiveTileInstanceOrder(sceneState: SceneState) {
  const tileState = sceneState.recursiveTileState;
  if (!tileState) {
    return;
  }

  // Shuffle mutates the settled tile set, and transparency needs those settled
  // instances packed from back to front before the draw call.
  const visibleTileKeys = [...tileState.currentFilledTiles].sort((left, right) => {
    const depthDifference =
      getTileCameraDepth(left, sceneState, tileState) -
      getTileCameraDepth(right, sceneState, tileState);
    if (depthDifference !== 0) {
      return depthDifference;
    }

    return left.localeCompare(right);
  });
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const tileMatrix = new THREE.Matrix4();

  tileState.keyToIndex.clear();
  visibleTileKeys.forEach((key, index) => {
    const coordinate = parseVoxelKey(key);
    if (!coordinate) {
      return;
    }

    const [x, y, z] = getTileWorldCenter({
      coordinate,
      distanceScale: tileState.distanceScale,
      fullGridSize: tileState.fullGridSize,
      tileGridSize: tileState.tileGridSize,
    });
    tileMatrix.makeTranslation(x, y, z);
    tileState.mesh.setMatrixAt(index, tileMatrix);
    tileState.keyToIndex.set(key, index);
  });

  for (let index = visibleTileKeys.length; index < tileState.instanceCapacity; index += 1) {
    tileState.mesh.setMatrixAt(index, hiddenMatrix);
  }
  tileState.mesh.instanceMatrix.needsUpdate = true;
}

function syncTransparentFaceRenderOrder(sceneState: SceneState) {
  sceneState.camera.updateMatrixWorld();
  sceneState.presentationTiltGroup.updateMatrixWorld(true);
  syncRecursiveSurfaceDrawOrder(sceneState);
  syncRecursiveTileInstanceOrder(sceneState);

  const meshes = [
    ...sceneState.logoMeshes,
    ...sceneState.activeCubeMoves.filter((move) => move.mesh.visible).map((move) => move.mesh),
    ...sceneState.activeTileMoves.flatMap((move) =>
      move.group.visible ? move.group.children.filter((child) => child instanceof THREE.Mesh) : [],
    ),
    ...(sceneState.recursiveTileState?.innerMoveMeshes.filter((mesh) => mesh.visible) ?? []),
  ];
  const meshDepths = meshes.map((mesh) => {
    const cameraSpaceCenter = (
      mesh.geometry.boundingSphere?.center.clone() ?? new THREE.Vector3()
    ).applyMatrix4(mesh.matrixWorld);
    cameraSpaceCenter.applyMatrix4(sceneState.camera.matrixWorldInverse);
    return { depth: cameraSpaceCenter.z, mesh };
  });

  meshDepths
    .sort((left, right) => left.depth - right.depth)
    .forEach(({ mesh }, index) => {
      mesh.renderOrder = index;
    });
}

function clearActiveCubeMoves(sceneState: SceneState) {
  for (const move of sceneState.activeCubeMoves) {
    sceneState.logoGroup.remove(move.mesh);
  }
  sceneState.activeCubeMoves = [];
}

function clearActiveTileMoves(sceneState: SceneState) {
  for (const move of sceneState.activeTileMoves) {
    sceneState.logoGroup.remove(move.group);
  }
  sceneState.activeTileMoves = [];

  const tileState = sceneState.recursiveTileState;
  if (tileState) {
    for (const mesh of tileState.innerMoveMeshes) {
      sceneState.logoGroup.remove(mesh);
    }
    tileState.innerMoveMeshes = [];
  }
}

function createTileMoveGroup(tileState: RecursiveTileSceneState): THREE.Group {
  const group = new THREE.Group();

  for (const mesh of tileState.meshes) {
    const tilePart = new THREE.Mesh(mesh.geometry, mesh.material);
    group.add(tilePart);
  }

  return group;
}

function syncDepthTwoRecursiveTileGeometry(sceneState: SceneState) {
  const tileState = sceneState.recursiveTileState;
  if (!tileState || sceneState.recursiveRenderDepth !== 2) {
    return;
  }

  const nextSurfaceGeometry = buildRecursiveSurfaceGeometry(
    buildDistanceScaledLogoSurfaceQuads(
      tileState.currentFilledTiles,
      tileState.repeatGridSize,
      tileState.distanceScale,
    ),
  );
  const previousGeometry = tileState.surfaceGeometry.geometry;

  tileState.mesh.geometry = nextSurfaceGeometry.geometry;
  tileState.mesh.computeBoundingSphere();
  tileState.surfaceGeometry = nextSurfaceGeometry;

  for (const move of sceneState.activeTileMoves) {
    for (const child of move.group.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry = nextSurfaceGeometry.geometry;
      }
    }
  }

  previousGeometry.dispose();
}

function syncDepthTwoRecursiveMoveMeshes(sceneState: SceneState, timestampMs: number) {
  const tileState = sceneState.recursiveTileState;
  if (!tileState || sceneState.recursiveRenderDepth !== 2) {
    return;
  }

  const activeMoveCoordinates = sceneState.activeTileMoves.flatMap((move) => {
    if (!move.hasDeparted) {
      return [];
    }

    const progress = Math.min(Math.max((timestampMs - move.startTimeMs) / move.durationMs, 0), 1);
    return [getTileMoveCoordinate(move, progress)];
  });
  const outerCoordinates = [
    ...[...tileState.currentFilledTiles].flatMap((key) => {
      const coordinate = parseVoxelKey(key);
      return coordinate ? [coordinate] : [];
    }),
    ...activeMoveCoordinates,
  ];
  const requiredMeshCount = outerCoordinates.length * activeMoveCoordinates.length;
  while (tileState.innerMoveMeshes.length < requiredMeshCount) {
    const mesh = new THREE.Mesh(sceneState.cubeGeometry, sceneState.cubeMaterials);
    tileState.innerMoveMeshes.push(mesh);
    sceneState.logoGroup.add(mesh);
  }
  let meshIndex = 0;

  for (const outerCoordinate of outerCoordinates) {
    for (const innerCoordinate of activeMoveCoordinates) {
      const mesh = tileState.innerMoveMeshes[meshIndex];
      const coordinate: VoxelCoordinate = [
        outerCoordinate[0] * tileState.tileGridSize + innerCoordinate[0],
        outerCoordinate[1] * tileState.tileGridSize + innerCoordinate[1],
        outerCoordinate[2] * tileState.tileGridSize + innerCoordinate[2],
      ];
      const [x, y, z] = getVoxelWorldCenter(
        coordinate,
        tileState.fullGridSize,
        tileState.distanceScale,
      );
      mesh.position.set(x, y, z);
      mesh.visible = true;
      meshIndex += 1;
    }
  }

  for (; meshIndex < tileState.innerMoveMeshes.length; meshIndex += 1) {
    tileState.innerMoveMeshes[meshIndex].visible = false;
  }
}

function resetShuffleAnimation(
  sceneState: SceneState,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  syncCameraFitRadius: boolean,
) {
  clearActiveCubeMoves(sceneState);
  clearActiveTileMoves(sceneState);
  replaceLogoGeometry(
    sceneState,
    new Set(sceneState.homeFilledVoxels),
    sceneState.gridSize,
    syncCameraFitRadius,
  );
  lastMovedCubeKeyRef.current = null;
}

function scheduleNextCubeMove(
  sceneState: SceneState,
  elevationDegrees: number,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  rotationAxisMode: LogoRotationAxisMode,
  rotationDegrees: number,
  startTimeMs: number,
): boolean {
  const blockedKeys = new Set<string>();
  for (const move of sceneState.activeCubeMoves) {
    blockedKeys.add(move.fromKey);
    blockedKeys.add(move.toKey);
  }

  const originCandidates = getShuffleOriginCandidates({
    blockedKeys,
    elevationDegrees,
    filledVoxels: sceneState.currentFilledVoxels,
    gridSize: sceneState.gridSize,
    lastMovedCubeKey: lastMovedCubeKeyRef.current,
    rotationAxisMode,
    rotationDegrees,
  });

  const nextMove = randomValueFrom(originCandidates);
  if (!nextMove) {
    return false;
  }

  const toCoordinate = randomValueFrom(nextMove.destinations);
  if (!toCoordinate) {
    return false;
  }

  const toKey = voxelKey(toCoordinate[0], toCoordinate[1], toCoordinate[2]);
  const moveMesh = new THREE.Mesh(sceneState.cubeGeometry, sceneState.cubeMaterials);
  moveMesh.visible = false;
  setCubeMeshPosition(moveMesh, nextMove.from, sceneState.gridSize, sceneState.distanceScale);
  sceneState.logoGroup.add(moveMesh);
  sceneState.activeCubeMoves.push({
    durationMs: LOGO_SHUFFLE_MOVE_DURATION_MS,
    from: nextMove.from,
    fromKey: nextMove.fromKey,
    hasDeparted: false,
    mesh: moveMesh,
    startTimeMs,
    to: toCoordinate,
    toKey,
  });
  return true;
}

function scheduleNextTileMove(
  sceneState: SceneState,
  elevationDegrees: number,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  rotationAxisMode: LogoRotationAxisMode,
  rotationDegrees: number,
  startTimeMs: number,
): boolean {
  const tileState = sceneState.recursiveTileState;
  if (!tileState) {
    return false;
  }

  const blockedKeys = new Set<string>();
  for (const move of sceneState.activeTileMoves) {
    blockedKeys.add(move.fromKey);
    blockedKeys.add(move.toKey);
  }

  const originCandidates = getShuffleOriginCandidates({
    blockedKeys,
    elevationDegrees,
    filledVoxels: tileState.currentFilledTiles,
    gridSize: tileState.repeatGridSize,
    lastMovedCubeKey: lastMovedCubeKeyRef.current,
    rotationAxisMode,
    rotationDegrees,
  });

  const nextMove = randomValueFrom(originCandidates);
  if (!nextMove) {
    return false;
  }

  const toCoordinate = randomValueFrom(nextMove.destinations);
  if (!toCoordinate) {
    return false;
  }

  if (!tileState.currentFilledTiles.has(nextMove.fromKey)) {
    return false;
  }

  const toKey = voxelKey(toCoordinate[0], toCoordinate[1], toCoordinate[2]);
  const group = createTileMoveGroup(tileState);
  group.visible = false;
  const [x, y, z] = getTileWorldCenter({
    coordinate: nextMove.from,
    distanceScale: tileState.distanceScale,
    fullGridSize: tileState.fullGridSize,
    tileGridSize: tileState.tileGridSize,
  });
  group.position.set(x, y, z);
  sceneState.logoGroup.add(group);
  sceneState.activeTileMoves.push({
    durationMs: LOGO_SHUFFLE_MOVE_DURATION_MS,
    from: nextMove.from,
    fromKey: nextMove.fromKey,
    group,
    hasDeparted: false,
    startTimeMs,
    to: toCoordinate,
    toKey,
  });
  return true;
}

function syncTileShuffleAnimation(
  sceneState: SceneState,
  elevationDegrees: number,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  parallelMoves: LogoShuffleParallelMoves,
  rotationAxisMode: LogoRotationAxisMode,
  rotationDegrees: number,
  timestampMs: number,
) {
  const tileState = sceneState.recursiveTileState;
  if (!tileState) {
    return;
  }

  const completedMoves: ActiveTileMove[] = [];
  let didChangeOccupancy = false;

  for (const move of sceneState.activeTileMoves) {
    if (!move.hasDeparted && timestampMs >= move.startTimeMs) {
      move.hasDeparted = true;
      move.group.visible = true;
      tileState.currentFilledTiles.delete(move.fromKey);
      tileState.keyToIndex.delete(move.fromKey);
      didChangeOccupancy = true;
    }

    if (!move.hasDeparted) {
      continue;
    }

    const progress = Math.min(Math.max((timestampMs - move.startTimeMs) / move.durationMs, 0), 1);
    const [x, y, z] = getTileMovePosition(move, progress, tileState);
    move.group.position.set(x, y, z);

    if (progress >= 1) {
      completedMoves.push(move);
    }
  }

  if (completedMoves.length > 0) {
    const completedMoveSet = new Set(completedMoves);
    sceneState.activeTileMoves = sceneState.activeTileMoves.filter(
      (move) => !completedMoveSet.has(move),
    );

    for (const move of completedMoves) {
      tileState.currentFilledTiles.add(move.toKey);
      sceneState.logoGroup.remove(move.group);
      lastMovedCubeKeyRef.current = move.toKey;
      didChangeOccupancy = true;
    }
  }

  if (didChangeOccupancy) {
    syncDepthTwoRecursiveTileGeometry(sceneState);
  }

  while (sceneState.activeTileMoves.length < parallelMoves) {
    const didScheduleMove = scheduleNextTileMove(
      sceneState,
      elevationDegrees,
      lastMovedCubeKeyRef,
      rotationAxisMode,
      rotationDegrees,
      timestampMs + sceneState.activeTileMoves.length * LOGO_SHUFFLE_MOVE_STAGGER_MS,
    );
    if (!didScheduleMove) {
      break;
    }
  }

  syncDepthTwoRecursiveMoveMeshes(sceneState, timestampMs);
}

function syncCubeShuffleAnimation(
  sceneState: SceneState,
  elevationDegrees: number,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  parallelMoves: LogoShuffleParallelMoves,
  rotationAxisMode: LogoRotationAxisMode,
  rotationDegrees: number,
  timestampMs: number,
) {
  if (sceneState.recursiveTileState) {
    syncTileShuffleAnimation(
      sceneState,
      elevationDegrees,
      lastMovedCubeKeyRef,
      parallelMoves,
      rotationAxisMode,
      rotationDegrees,
      timestampMs,
    );
    return;
  }

  const completedMoves: ActiveCubeMove[] = [];
  let didChangeOccupancy = false;

  for (const move of sceneState.activeCubeMoves) {
    if (!move.hasDeparted && timestampMs >= move.startTimeMs) {
      move.hasDeparted = true;
      move.mesh.visible = true;
      sceneState.currentFilledVoxels.delete(move.fromKey);
      didChangeOccupancy = true;
    }

    if (!move.hasDeparted) {
      continue;
    }

    const progress = Math.min(Math.max((timestampMs - move.startTimeMs) / move.durationMs, 0), 1);
    const [x, y, z] = getCubeMovePosition(
      move,
      progress,
      sceneState.gridSize,
      sceneState.distanceScale,
    );
    move.mesh.position.set(x, y, z);

    if (progress >= 1) {
      completedMoves.push(move);
    }
  }

  if (completedMoves.length > 0) {
    const completedMoveSet = new Set(completedMoves);
    sceneState.activeCubeMoves = sceneState.activeCubeMoves.filter(
      (move) => !completedMoveSet.has(move),
    );
    for (const move of completedMoves) {
      sceneState.currentFilledVoxels.add(move.toKey);
      sceneState.logoGroup.remove(move.mesh);
      lastMovedCubeKeyRef.current = move.toKey;
      didChangeOccupancy = true;
    }
  }

  if (didChangeOccupancy) {
    replaceLogoGeometry(sceneState, sceneState.currentFilledVoxels, sceneState.gridSize, false);
  }

  while (sceneState.activeCubeMoves.length < parallelMoves) {
    const didScheduleMove = scheduleNextCubeMove(
      sceneState,
      elevationDegrees,
      lastMovedCubeKeyRef,
      rotationAxisMode,
      rotationDegrees,
      timestampMs + sceneState.activeCubeMoves.length * LOGO_SHUFFLE_MOVE_STAGGER_MS,
    );
    if (!didScheduleMove) {
      break;
    }
  }
}

export function NLogoScene({
  baseGridSize = DEFAULT_LOGO_GRID_SIZE,
  backgroundColor,
  className,
  distanceScale = LOGO_DISTANCE_SCALE.defaultValue,
  editMode,
  elevationDegrees,
  faceColors,
  fractalDepth,
  leftFaceStyle = DEFAULT_LOGO_LEFT_FACE_STYLE,
  opacity,
  onInteractionStart,
  onInteractionEnd,
  onRenderReady,
  onRenderUnavailable,
  onViewChange,
  onVoxelEdit,
  presentationTiltNeutralProgress,
  presentationTiltTarget,
  rotationAxisMode = "cube-y",
  rotationDegrees,
  shuffleAnimation,
  animateFaceColors,
  animateLeftFaceStripes,
  voxelEditingEnabled = true,
  voxelGrid,
  viewDragConfig,
  voxelState,
}: NLogoSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef<SceneState | null>(null);
  const baseGridSizeRef = useRef(baseGridSize);
  const backgroundColorRef = useRef(backgroundColor);
  const editModeRef = useRef(editMode);
  const renderViewRef = useRef<LogoViewState>({ elevationDegrees, rotationDegrees });
  const rotationAxisModeRef = useRef(rotationAxisMode);
  const voxelGridRef = useRef(voxelGrid);
  const voxelEditingEnabledRef = useRef(voxelEditingEnabled);
  const voxelStateRef = useRef(voxelState);
  const fractalDepthRef = useRef(fractalDepth);
  const faceColorsRef = useRef(faceColors);
  const leftFaceStyleRef = useRef(normalizeLogoLeftFaceStyle(leftFaceStyle));
  const opacityRef = useRef(opacity);
  const presentationTiltTargetRef = useRef(
    resolveLogoPresentationTiltTarget(presentationTiltTarget),
  );
  const presentationTiltNeutralProgressRef = useRef(presentationTiltNeutralProgress);
  const distanceScaleRef = useRef(normalizeLogoDistanceScale(distanceScale));
  const animateFaceColorsRef = useRef(animateFaceColors);
  const faceColorAnimationStartedAtRef = useRef<number | null>(null);
  const animateLeftFaceStripesRef = useRef(animateLeftFaceStripes);
  const leftFaceStripeAnimationStartedAtRef = useRef<number | null>(null);
  const shuffleAnimationRef = useRef(shuffleAnimation);
  const onRenderReadyRef = useRef(onRenderReady);
  const onRenderUnavailableRef = useRef(onRenderUnavailable);
  const renderSceneRef = useRef<(timestampMs: number) => void>(() => {});
  const syncAnimationLoopRef = useRef<() => void>(() => {});
  const lastMovedCubeKeyRef = useRef<string | null>(null);
  const {
    handleContextMenu,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    interactionRef,
  } = useLogoViewDrag<HTMLDivElement>({
    elevationDegrees,
    onInteractionEnd,
    onInteractionStart,
    onPointerCaptureEnd: () => {
      renderSceneRef.current(performance.now());
      syncAnimationLoopRef.current();
    },
    onPointerCaptureStart: () => {
      renderSceneRef.current(performance.now());
      syncAnimationLoopRef.current();
    },
    onPress: (event) => {
      const edit = pickVoxelEdit(event.clientX, event.clientY, editModeRef.current);
      if (edit) {
        onVoxelEdit(edit);
      }
    },
    onViewChange,
    rotationDegrees,
    viewDragConfig,
  });

  useEffect(() => {
    backgroundColorRef.current = backgroundColor;
    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    sceneState.scene.background = new THREE.Color(backgroundColor);
    applySceneResolvedFaceColors({
      backgroundColor,
      faceColors: resolveFaceColors(faceColorsRef.current),
      sceneState,
    });
    renderSceneRef.current(performance.now());
  }, [backgroundColor]);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  useEffect(() => {
    voxelEditingEnabledRef.current = voxelEditingEnabled;
  }, [voxelEditingEnabled]);

  useEffect(() => {
    // The persistent Three.js scene mirrors the controlled view as one pose,
    // never as independently updated elevation and rotation values.
    renderViewRef.current = { elevationDegrees, rotationDegrees };
    renderSceneRef.current(performance.now());
  }, [elevationDegrees, rotationDegrees]);

  useEffect(() => {
    presentationTiltTargetRef.current = resolveLogoPresentationTiltTarget(presentationTiltTarget);
    presentationTiltNeutralProgressRef.current = presentationTiltNeutralProgress;
    renderSceneRef.current(performance.now());
    syncAnimationLoopRef.current();
  }, [presentationTiltNeutralProgress, presentationTiltTarget]);

  useEffect(() => {
    rotationAxisModeRef.current = rotationAxisMode;
    renderSceneRef.current(performance.now());
  }, [rotationAxisMode]);

  useEffect(() => {
    const nextDistanceScale = normalizeLogoDistanceScale(distanceScale);
    distanceScaleRef.current = nextDistanceScale;
    const sceneState = sceneStateRef.current;
    if (!sceneState || sceneState.distanceScale === nextDistanceScale) {
      return;
    }

    sceneState.distanceScale = nextDistanceScale;
    resetShuffleAnimation(sceneState, lastMovedCubeKeyRef, true);
    applySceneResolvedFaceColors({
      backgroundColor: backgroundColorRef.current,
      faceColors: resolveFaceColors(faceColorsRef.current),
      sceneState,
    });
    renderSceneRef.current(performance.now());
  }, [distanceScale]);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    onRenderReadyRef.current = onRenderReady;
  }, [onRenderReady]);

  useEffect(() => {
    onRenderUnavailableRef.current = onRenderUnavailable;
  }, [onRenderUnavailable]);

  useEffect(() => {
    const wasEnabled = shuffleAnimationRef.current.enabled;
    shuffleAnimationRef.current = shuffleAnimation;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    if (shuffleAnimation.enabled !== wasEnabled) {
      resetShuffleAnimation(sceneState, lastMovedCubeKeyRef, false);
      applySceneResolvedFaceColors({
        backgroundColor: backgroundColorRef.current,
        faceColors: resolveFaceColors(faceColorsRef.current),
        sceneState,
      });
    }

    syncAnimationLoopRef.current();
    renderSceneRef.current(performance.now());
  }, [shuffleAnimation]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColorRef.current);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (error) {
      console.error("Failed to initialize logo scene renderer", error);
      onRenderUnavailableRef.current?.();
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(getThreeRenderPixelRatio(leftFaceStyleRef.current));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.width = "100%";
    container.replaceChildren(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const { leftFaceMaterialState, materials } = createLogoSceneMaterials();
    const initialVoxelGrid = resolveSceneVoxelGrid({
      baseGridSize: baseGridSizeRef.current,
      fractalDepth: fractalDepthRef.current,
      voxelGrid: voxelGridRef.current,
      voxelState: voxelStateRef.current,
    });
    const initialGeometry = createLogoGeometryRenderState({
      baseGridSize: initialVoxelGrid.baseGridSize,
      baseFilledVoxels: initialVoxelGrid.baseFilledVoxels,
      distanceScale: distanceScaleRef.current,
      filledVoxels: initialVoxelGrid.filledVoxels,
      gridSize: initialVoxelGrid.gridSize,
      materials,
      recursiveRenderDepth: initialVoxelGrid.recursiveRenderDepth,
    });
    const initialOpacity = applyMaterialOpacity(materials, opacityRef.current);
    const initialFaceColors = resolveFaceColors(faceColorsRef.current);
    renderer.domElement.style.opacity = "1";
    applyFaceColors({
      backgroundColor: backgroundColorRef.current,
      faceColors: faceColorsRef.current,
      leftFaceMaterialState,
      leftFaceStyle: leftFaceStyleRef.current,
      materials,
      opacity: initialOpacity,
    });
    if (initialGeometry.recursiveTileState) {
      applyRecursiveSurfaceOpacity(
        initialGeometry.recursiveTileState.materialState,
        initialOpacity,
      );
      applyRecursiveSurfaceMaterialState({
        backgroundColor: backgroundColorRef.current,
        faceColors: initialFaceColors,
        leftFaceStyle: leftFaceStyleRef.current,
        materialState: initialGeometry.recursiveTileState.materialState,
        opacity: initialOpacity,
      });
    }
    const logoMeshes = initialGeometry.meshes;
    const logoGroup = new THREE.Group();
    for (const logoMesh of logoMeshes) {
      logoGroup.add(logoMesh);
    }
    // Transient input wraps the persisted view so it never changes the pose
    // that dragging reads or stores.
    const presentationTiltGroup = new THREE.Group();
    presentationTiltGroup.add(logoGroup);
    scene.add(presentationTiltGroup);
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const initialCameraFitRadius = initialGeometry.cameraFitRadius;
    const rotationAxisVector = new THREE.Vector3();
    const presentationTiltAxisVector = new THREE.Vector3();
    const presentationTiltScreenRightVector = new THREE.Vector3();
    const presentationTiltResizeStartQuaternion = new THREE.Quaternion();
    const presentationTiltTargetQuaternion = new THREE.Quaternion();
    const neutralPresentationTiltQuaternion = new THREE.Quaternion();
    let isTrackingPresentationTiltToNeutral = false;
    let lastPresentationTiltFrameTimeMs: number | null = null;

    const getCameraFitRadius = () =>
      sceneStateRef.current?.cameraFitRadius ?? initialCameraFitRadius;

    const getFrustumHalfSpan = () => getCameraFitRadius() * CAMERA_FRUSTUM_PADDING;

    const getCameraDistance = () =>
      resolveLogoSceneCameraDepthBounds(getCameraFitRadius()).distance;

    const updateCameraPosition = () => {
      const [cameraX, cameraY, cameraZ] = getWorldCameraVector(
        renderViewRef.current.elevationDegrees,
      );
      camera.position.set(cameraX, cameraY, cameraZ).setLength(getCameraDistance());
      const [upX, upY, upZ] = getWorldScreenVerticalAxis(renderViewRef.current.elevationDegrees);
      camera.up.set(upX, upY, upZ);
      camera.lookAt(0, 0, 0);
    };

    const applyLogoRotation = () => {
      const [axisX, axisY, axisZ] = getLogoRotationAxis({
        elevationDegrees: renderViewRef.current.elevationDegrees,
        mode: rotationAxisModeRef.current,
      });
      rotationAxisVector.set(axisX, axisY, axisZ);
      logoGroup.quaternion.setFromAxisAngle(
        rotationAxisVector,
        THREE.MathUtils.degToRad(toRenderedRotationDegrees(renderViewRef.current.rotationDegrees)),
      );
    };

    const updatePresentationTiltTargetQuaternion = () => {
      if (interactionRef.current.status !== "idle") {
        // Direct manipulation owns the rendered pose until drop. Holding the
        // current presentation quaternion prevents an unrelated pitch change
        // during a horizontal drag.
        presentationTiltTargetQuaternion.copy(presentationTiltGroup.quaternion);
        return;
      }

      const target = presentationTiltTargetRef.current;
      const magnitude = Math.hypot(target.horizontal, target.vertical);
      if (magnitude === 0) {
        presentationTiltTargetQuaternion.identity();
        return;
      }

      presentationTiltScreenRightVector.crossVectors(camera.up, camera.position).normalize();
      presentationTiltAxisVector
        .copy(presentationTiltScreenRightVector)
        .multiplyScalar(-target.vertical)
        .addScaledVector(camera.up, target.horizontal)
        .normalize();
      presentationTiltTargetQuaternion.setFromAxisAngle(
        presentationTiltAxisVector,
        THREE.MathUtils.degToRad(magnitude),
      );
    };

    const applyPresentationTilt = (timestampMs: number) => {
      const neutralProgress = presentationTiltNeutralProgressRef.current;
      if (neutralProgress !== undefined) {
        if (!isTrackingPresentationTiltToNeutral) {
          // The actual quaternion can still be settling toward its target when
          // resize begins, so capture it instead of deriving another pose.
          presentationTiltResizeStartQuaternion.copy(presentationTiltGroup.quaternion);
          isTrackingPresentationTiltToNeutral = true;
        }
        presentationTiltGroup.quaternion.slerpQuaternions(
          presentationTiltResizeStartQuaternion,
          neutralPresentationTiltQuaternion,
          THREE.MathUtils.clamp(neutralProgress, 0, 1),
        );
        presentationTiltTargetQuaternion.copy(presentationTiltGroup.quaternion);
        lastPresentationTiltFrameTimeMs = timestampMs;
        return;
      }

      isTrackingPresentationTiltToNeutral = false;
      updatePresentationTiltTargetQuaternion();
      const remainingAngle = presentationTiltGroup.quaternion.angleTo(
        presentationTiltTargetQuaternion,
      );
      if (remainingAngle <= THREE.MathUtils.degToRad(LOGO_PRESENTATION_TILT_SETTLED_DEGREES)) {
        presentationTiltGroup.quaternion.copy(presentationTiltTargetQuaternion);
        lastPresentationTiltFrameTimeMs = timestampMs;
        return;
      }

      const previousFrameTimeMs = lastPresentationTiltFrameTimeMs;
      lastPresentationTiltFrameTimeMs = timestampMs;
      if (previousFrameTimeMs === null) {
        // Arm timing on the first frame instead of snapping after idle or drop.
        return;
      }

      presentationTiltGroup.quaternion.slerp(
        presentationTiltTargetQuaternion,
        getLogoPresentationTiltTransitionAlpha({
          deltaSeconds: (timestampMs - previousFrameTimeMs) / 1000,
          remainingDegrees: THREE.MathUtils.radToDeg(remainingAngle),
        }),
      );
    };

    const resizeScene = () => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 768;
      const aspect = width / height;
      const cameraFitRadius = getCameraFitRadius();
      const cameraDepthBounds = resolveLogoSceneCameraDepthBounds(cameraFitRadius);
      const frustumHalfSpan = getFrustumHalfSpan();
      const frustumHalfHeight = Math.max(
        frustumHalfSpan,
        frustumHalfSpan / Math.max(aspect, 0.0001),
      );
      renderer.setPixelRatio(getThreeRenderPixelRatio(leftFaceStyleRef.current));
      renderer.setSize(width, height, false);
      camera.left = -frustumHalfHeight * aspect;
      camera.right = frustumHalfHeight * aspect;
      camera.top = frustumHalfHeight;
      camera.bottom = -frustumHalfHeight;
      // Recursive depth can be wider than the old fixed camera distance; keep
      // the orthographic depth range outside the fitted mesh so rotations do
      // not clip front-facing corners.
      camera.far = cameraDepthBounds.far;
      updateCameraPosition();
      applyLogoRotation();
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    sceneStateRef.current = {
      camera,
      cameraFitRadius: initialCameraFitRadius,
      cubeGeometry,
      cubeMaterials: materials,
      distanceScale: distanceScaleRef.current,
      gridSize: initialVoxelGrid.gridSize,
      currentFilledVoxels: new Set(initialVoxelGrid.filledVoxels),
      activeCubeMoves: [],
      activeTileMoves: [],
      baseGridSize: initialVoxelGrid.baseGridSize,
      baseFilledVoxels: new Set(initialVoxelGrid.baseFilledVoxels),
      homeFilledVoxels: new Set(initialVoxelGrid.filledVoxels),
      leftFaceMaterialState,
      leftFaceStyle: leftFaceStyleRef.current,
      logoGroup,
      logoMeshes,
      opacity: initialOpacity,
      presentationTiltGroup,
      raycaster: new THREE.Raycaster(),
      recursiveRenderDepth: initialVoxelGrid.recursiveRenderDepth,
      recursiveTileState: initialGeometry.recursiveTileState,
      renderer,
      resizeScene,
      scene,
    };

    resizeScene();

    const resizeObserver = new ResizeObserver(() => {
      resizeScene();
    });
    resizeObserver.observe(container);

    const timer = new THREE.Timer();
    timer.connect(document);
    let animationFrameId: number | null = null;
    let readyFrameId = 0;
    let readyFrameId2 = 0;

    const stopAnimation = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      lastPresentationTiltFrameTimeMs = null;
    };

    const hasActiveLeftFaceStripeAnimation = () =>
      animateLeftFaceStripesRef.current && leftFaceStyleRef.current.kind === "striped";

    const hasActivePresentationTilt = () =>
      presentationTiltGroup.quaternion.angleTo(presentationTiltTargetQuaternion) >
      THREE.MathUtils.degToRad(LOGO_PRESENTATION_TILT_SETTLED_DEGREES);

    const hasActiveAnimation = () =>
      shuffleAnimationRef.current.enabled ||
      animateFaceColorsRef.current ||
      hasActiveLeftFaceStripeAnimation() ||
      hasActivePresentationTilt();

    const renderScene = (timestampMs: number) => {
      timer.update(timestampMs);
      const sceneState = sceneStateRef.current;
      if (sceneState && shuffleAnimationRef.current.enabled) {
        syncCubeShuffleAnimation(
          sceneState,
          renderViewRef.current.elevationDegrees,
          lastMovedCubeKeyRef,
          shuffleAnimationRef.current.parallelMoves,
          rotationAxisModeRef.current,
          renderViewRef.current.rotationDegrees,
          timestampMs,
        );
      }
      if (sceneState && animateFaceColorsRef.current) {
        const animationStartedAt = faceColorAnimationStartedAtRef.current ?? timestampMs;
        faceColorAnimationStartedAtRef.current = animationStartedAt;
        applySceneResolvedFaceColors({
          backgroundColor: backgroundColorRef.current,
          faceColors: getAnimatedFaceColors(
            faceColorsRef.current,
            (timestampMs - animationStartedAt) / 1000,
          ),
          sceneState,
        });
      }
      if (sceneState && hasActiveLeftFaceStripeAnimation()) {
        const animationStartedAt = leftFaceStripeAnimationStartedAtRef.current ?? timestampMs;
        leftFaceStripeAnimationStartedAtRef.current = animationStartedAt;
        applySceneLeftFaceStripeAnimationProgress(
          sceneState,
          ((timestampMs - animationStartedAt) % LEFT_FACE_STRIPE_ANIMATION_DURATION_MS) /
            LEFT_FACE_STRIPE_ANIMATION_DURATION_MS,
        );
      }
      updateCameraPosition();
      applyLogoRotation();
      applyPresentationTilt(timestampMs);
      if (sceneState) {
        syncTransparentFaceRenderOrder(sceneState);
      }
      renderer.render(scene, camera);
    };

    const animate = (timestamp?: number) => {
      renderScene(timestamp ?? performance.now());
      if (hasActiveAnimation()) {
        animationFrameId = window.requestAnimationFrame(animate);
        return;
      }

      animationFrameId = null;
      lastPresentationTiltFrameTimeMs = null;
    };

    renderSceneRef.current = renderScene;
    syncAnimationLoopRef.current = () => {
      if (hasActiveAnimation()) {
        if (animationFrameId === null) {
          animationFrameId = window.requestAnimationFrame(animate);
        }
        return;
      }

      stopAnimation();
    };

    renderScene(performance.now());
    readyFrameId = window.requestAnimationFrame(() => {
      readyFrameId2 = window.requestAnimationFrame(() => {
        onRenderReadyRef.current?.();
        syncAnimationLoopRef.current();
      });
    });

    return () => {
      stopAnimation();
      window.cancelAnimationFrame(readyFrameId);
      window.cancelAnimationFrame(readyFrameId2);
      resizeObserver.disconnect();
      timer.dispose();
      const activeSceneState = sceneStateRef.current;
      if (activeSceneState) {
        clearActiveCubeMoves(activeSceneState);
        clearActiveTileMoves(activeSceneState);
        for (const logoMesh of activeSceneState.logoMeshes) {
          logoMesh.geometry.dispose();
        }
        activeSceneState.recursiveTileState?.materialState.material.dispose();
      } else {
        for (const logoMesh of logoMeshes) {
          logoMesh.geometry.dispose();
        }
        initialGeometry.recursiveTileState?.materialState.material.dispose();
      }
      cubeGeometry.dispose();
      for (const material of materials) {
        material.dispose();
      }
      scene.clear();
      sceneStateRef.current = null;
      renderSceneRef.current = () => {};
      syncAnimationLoopRef.current = () => {};
      faceColorAnimationStartedAtRef.current = null;
      leftFaceStripeAnimationStartedAtRef.current = null;
      renderer.dispose();
      container.replaceChildren();
    };
  }, [interactionRef]);

  useEffect(() => {
    baseGridSizeRef.current = baseGridSize;
    fractalDepthRef.current = fractalDepth;
    voxelGridRef.current = voxelGrid;
    voxelStateRef.current = voxelState;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    const nextVoxelGrid = resolveSceneVoxelGrid({
      baseGridSize,
      fractalDepth,
      voxelGrid,
      voxelState,
    });
    sceneState.baseGridSize = nextVoxelGrid.baseGridSize;
    sceneState.baseFilledVoxels = new Set(nextVoxelGrid.baseFilledVoxels);
    sceneState.homeFilledVoxels = new Set(nextVoxelGrid.filledVoxels);
    sceneState.gridSize = nextVoxelGrid.gridSize;
    sceneState.recursiveRenderDepth = nextVoxelGrid.recursiveRenderDepth;
    resetShuffleAnimation(sceneState, lastMovedCubeKeyRef, true);
    applySceneResolvedFaceColors({
      backgroundColor: backgroundColorRef.current,
      faceColors: resolveFaceColors(faceColorsRef.current),
      sceneState,
    });
    renderSceneRef.current(performance.now());
  }, [baseGridSize, fractalDepth, voxelGrid, voxelState]);

  useEffect(() => {
    animateFaceColorsRef.current = animateFaceColors;
    faceColorsRef.current = faceColors;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    if (animateFaceColors) {
      faceColorAnimationStartedAtRef.current = performance.now();
      syncAnimationLoopRef.current();
      renderSceneRef.current(performance.now());
      return;
    }

    applySceneResolvedFaceColors({
      backgroundColor: backgroundColorRef.current,
      faceColors: resolveFaceColors(faceColors),
      sceneState,
    });
    syncAnimationLoopRef.current();
    renderSceneRef.current(performance.now());
  }, [animateFaceColors, faceColors]);

  useEffect(() => {
    animateLeftFaceStripesRef.current = animateLeftFaceStripes;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    if (animateLeftFaceStripes) {
      leftFaceStripeAnimationStartedAtRef.current = performance.now();
      syncAnimationLoopRef.current();
      renderSceneRef.current(performance.now());
      return;
    }

    leftFaceStripeAnimationStartedAtRef.current = null;
    // Reapply uniforms so the static stripe offset replaces the animated one.
    applySceneResolvedFaceColors({
      backgroundColor: backgroundColorRef.current,
      faceColors: resolveFaceColors(faceColorsRef.current),
      sceneState,
    });
    syncAnimationLoopRef.current();
    renderSceneRef.current(performance.now());
  }, [animateLeftFaceStripes]);

  useEffect(() => {
    const normalizedStyle = normalizeLogoLeftFaceStyle(leftFaceStyle);
    leftFaceStyleRef.current = normalizedStyle;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    sceneState.leftFaceStyle = normalizedStyle;
    sceneState.resizeScene();
    applySceneResolvedFaceColors({
      backgroundColor: backgroundColorRef.current,
      faceColors: resolveFaceColors(faceColorsRef.current),
      sceneState,
    });
    syncAnimationLoopRef.current();
    renderSceneRef.current(performance.now());
  }, [leftFaceStyle]);

  useEffect(() => {
    opacityRef.current = opacity;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    applySceneOpacity(sceneState, opacity);
    applySceneResolvedFaceColors({
      backgroundColor: backgroundColorRef.current,
      faceColors: resolveFaceColors(faceColorsRef.current),
      sceneState,
    });
    renderSceneRef.current(performance.now());
  }, [opacity]);
  const pickVoxelEdit = (
    clientX: number,
    clientY: number,
    kind: VoxelEdit["kind"],
  ): VoxelEdit | null => {
    const sceneState = sceneStateRef.current;
    if (!sceneState || !voxelEditingEnabledRef.current || shuffleAnimationRef.current.enabled) {
      return null;
    }

    const canvasRect = sceneState.renderer.domElement.getBoundingClientRect();
    if (
      clientX < canvasRect.left ||
      clientX > canvasRect.right ||
      clientY < canvasRect.top ||
      clientY > canvasRect.bottom
    ) {
      return null;
    }

    const x = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    const y = -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
    sceneState.raycaster.setFromCamera(new THREE.Vector2(x, y), sceneState.camera);
    const intersections = sceneState.raycaster.intersectObjects(sceneState.logoMeshes, false);
    if (intersections.length === 0) {
      return null;
    }
    const intersection = intersections[0];

    const localPoint = sceneState.logoGroup.worldToLocal(intersection.point.clone());
    const intersectionNormal = intersection.normal ?? intersection.face?.normal;
    if (!intersectionNormal) {
      return null;
    }
    const localNormal = intersectionNormal.clone();
    localPoint.addScaledVector(localNormal, kind === "add" ? RAYCAST_OFFSET : -RAYCAST_OFFSET);

    const coordinate = pointToVoxelCoordinate(
      localPoint,
      sceneState.gridSize,
      sceneState.distanceScale,
    );
    if (!coordinate) {
      return null;
    }

    const key = voxelKey(coordinate[0], coordinate[1], coordinate[2]);
    if (kind === "add" && sceneState.currentFilledVoxels.has(key)) {
      return null;
    }
    if (kind === "remove" && !sceneState.currentFilledVoxels.has(key)) {
      return null;
    }

    return { coordinate, kind };
  };

  return (
    <div
      ref={mountRef}
      className={className}
      data-logo-elevation-degrees={elevationDegrees}
      data-logo-rotation-degrees={rotationDegrees}
      onContextMenu={handleContextMenu}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
