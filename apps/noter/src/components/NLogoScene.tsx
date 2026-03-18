import {
  getTailwindColorHex,
  type FaceColors,
} from "@/components/logoTailwindColors";
import { getShuffleOriginCandidates } from "@/components/logoShuffleRules";
import {
  HALF_GRID,
  GRID_SIZE,
  createDefaultFilledVoxelSet,
  isWithinGrid,
  normalizeElevationDegrees,
  normalizeRotationDegrees,
  parseVoxelState,
  type VoxelCoordinate,
  type VoxelEdit,
  voxelKey,
} from "@/components/logoVoxelState";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import * as THREE from "three";

const ISOMETRIC_CAMERA_DISTANCE = 11;
const DRAG_ROTATION_DEGREES_PER_PIXEL = 0.35;
const DRAG_ELEVATION_DEGREES_PER_PIXEL = 0.18;
const DRAG_THRESHOLD_PX = 4;
const RAYCAST_OFFSET = 0.001;
const ORBIT_RIGHT_AXIS = new THREE.Vector3(1, 0, -1).normalize();
const CAMERA_FRUSTUM_PADDING = 1.12;
const SHUFFLE_MOVE_DURATION_MS = 1800;
const SHUFFLE_MOVE_STAGGER_MS = 520;
const WORLD_CENTER_OFFSET = (GRID_SIZE - 1) / 2;

export const LOGO_SHUFFLE_PARALLEL_OPTIONS = [1, 2, 3] as const;
export type LogoShuffleParallelMoves =
  (typeof LOGO_SHUFFLE_PARALLEL_OPTIONS)[number];
export type LogoShuffleAnimationConfig = {
  enabled: boolean;
  parallelMoves: LogoShuffleParallelMoves;
};

type Rectangle = {
  row: number;
  column: number;
  height: number;
  width: number;
};

type LogoSurfacePart = {
  geometry: THREE.BufferGeometry;
  materialIndex: number;
};

type SceneInteraction = {
  button: 0 | null;
  pointerId: number | null;
  startElevationDegrees: number;
  startRotationDegrees: number;
  startX: number;
  startY: number;
  status: "idle" | "pending" | "dragging";
};

type ActiveCubeMove = {
  durationMs: number;
  from: VoxelCoordinate;
  fromKey: string;
  hasDeparted: boolean;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial[]>;
  startTimeMs: number;
  to: VoxelCoordinate;
  toKey: string;
};

type SceneState = {
  camera: THREE.OrthographicCamera;
  cameraFitRadius: number;
  cubeGeometry: THREE.BoxGeometry;
  cubeMaterials: THREE.MeshBasicMaterial[];
  currentFilledVoxels: Set<string>;
  activeCubeMoves: ActiveCubeMove[];
  homeFilledVoxels: Set<string>;
  logoGroup: THREE.Group;
  logoMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  raycaster: THREE.Raycaster;
  renderer: THREE.WebGLRenderer;
  resizeScene: () => void;
  scene: THREE.Scene;
};

type NLogoSceneProps = {
  backgroundColor: string;
  className?: string;
  editMode: VoxelEdit["kind"];
  elevationDegrees: number;
  faceColors: FaceColors;
  opacity: number;
  onInteractionStart?: () => void;
  onRenderReady?: () => void;
  onViewChange: (nextView: {
    elevationDegrees: number;
    rotationDegrees: number;
  }) => void;
  onVoxelEdit: (edit: VoxelEdit) => void;
  rotationDegrees: number;
  shuffleAnimation: LogoShuffleAnimationConfig;
  voxelState: string;
};

function getVoxelWorldCenter(
  coordinate: VoxelCoordinate,
): readonly [number, number, number] {
  return [
    coordinate[0] - WORLD_CENTER_OFFSET,
    coordinate[1] - WORLD_CENTER_OFFSET,
    coordinate[2] - WORLD_CENTER_OFFSET,
  ];
}

function setCubeMeshPosition(
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial[]>,
  coordinate: VoxelCoordinate,
) {
  const [x, y, z] = getVoxelWorldCenter(coordinate);
  mesh.position.set(x, y, z);
}

function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getCubeMovePosition(
  move: ActiveCubeMove,
  progress: number,
): readonly [number, number, number] {
  const [startX, startY, startZ] = getVoxelWorldCenter(move.from);
  const [endX, endY, endZ] = getVoxelWorldCenter(move.to);
  const travelProgress = easeInOutCubic(progress);
  return [
    startX + (endX - startX) * travelProgress,
    startY + (endY - startY) * travelProgress,
    startZ + (endZ - startZ) * travelProgress,
  ];
}

function randomValueFrom<T>(values: readonly T[]): T | null {
  if (values.length === 0) {
    return null;
  }

  return values[Math.floor(Math.random() * values.length)] ?? null;
}

function isVoxelFilled(
  filledVoxels: Set<string>,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!isWithinGrid(x, y, z)) {
    return false;
  }

  return filledVoxels.has(voxelKey(x, y, z));
}

function collectRectangles(mask: boolean[][]): Rectangle[] {
  const visited = mask.map((row) => row.map(() => false));
  const rectangles: Rectangle[] = [];

  for (let row = 0; row < mask.length; row += 1) {
    for (let column = 0; column < mask[row].length; column += 1) {
      if (!mask[row][column] || visited[row][column]) {
        continue;
      }

      let width = 1;
      while (
        column + width < mask[row].length &&
        mask[row][column + width] &&
        !visited[row][column + width]
      ) {
        width += 1;
      }

      let height = 1;
      let canGrow = true;
      while (row + height < mask.length && canGrow) {
        for (
          let nextColumn = column;
          nextColumn < column + width;
          nextColumn += 1
        ) {
          if (
            !mask[row + height][nextColumn] ||
            visited[row + height][nextColumn]
          ) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) {
          height += 1;
        }
      }

      for (let nextRow = row; nextRow < row + height; nextRow += 1) {
        for (
          let nextColumn = column;
          nextColumn < column + width;
          nextColumn += 1
        ) {
          visited[nextRow][nextColumn] = true;
        }
      }

      rectangles.push({ row, column, height, width });
    }
  }

  return rectangles;
}

function buildQuadGeometry(
  vertices: ReadonlyArray<readonly [number, number, number]>,
  normal: readonly [number, number, number],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = vertices.flatMap(([x, y, z]) => [x, y, z]);
  const normals = vertices.flatMap(() => [normal[0], normal[1], normal[2]]);

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeBoundingSphere();

  return geometry;
}

function toWorld(boundaryIndex: number): number {
  return boundaryIndex - HALF_GRID;
}

function getGeometryFitRadius(
  geometries: readonly THREE.BufferGeometry[],
): number {
  let fitRadius = 0;

  for (const geometry of geometries) {
    const boundingSphere = geometry.boundingSphere;
    if (!boundingSphere) {
      continue;
    }

    fitRadius = Math.max(
      fitRadius,
      boundingSphere.center.length() + boundingSphere.radius,
    );
  }

  return fitRadius || HALF_GRID * Math.sqrt(3);
}

function buildVoxelSurfaceGeometries(
  filledVoxels: Set<string>,
): LogoSurfacePart[] {
  const parts: LogoSurfacePart[] = [];

  for (let x = 0; x < GRID_SIZE; x += 1) {
    const positiveXMask = Array.from({ length: GRID_SIZE }, (_, y) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x + 1, y, z),
      ),
    );
    for (const rectangle of collectRectangles(positiveXMask)) {
      const plane = toWorld(x + 1);
      const y0 = toWorld(rectangle.row);
      const y1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      parts.push({
        geometry: buildQuadGeometry(
          [
            [plane, y0, z0],
            [plane, y1, z0],
            [plane, y1, z1],
            [plane, y0, z1],
          ],
          [1, 0, 0],
        ),
        materialIndex: 0,
      });
    }

    const negativeXMask = Array.from({ length: GRID_SIZE }, (_, y) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x - 1, y, z),
      ),
    );
    for (const rectangle of collectRectangles(negativeXMask)) {
      const plane = toWorld(x);
      const y0 = toWorld(rectangle.row);
      const y1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      parts.push({
        geometry: buildQuadGeometry(
          [
            [plane, y0, z1],
            [plane, y1, z1],
            [plane, y1, z0],
            [plane, y0, z0],
          ],
          [-1, 0, 0],
        ),
        materialIndex: 1,
      });
    }
  }

  for (let y = 0; y < GRID_SIZE; y += 1) {
    const positiveYMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y + 1, z),
      ),
    );
    for (const rectangle of collectRectangles(positiveYMask)) {
      const plane = toWorld(y + 1);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      parts.push({
        geometry: buildQuadGeometry(
          [
            [x0, plane, z1],
            [x1, plane, z1],
            [x1, plane, z0],
            [x0, plane, z0],
          ],
          [0, 1, 0],
        ),
        materialIndex: 2,
      });
    }

    const negativeYMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y - 1, z),
      ),
    );
    for (const rectangle of collectRectangles(negativeYMask)) {
      const plane = toWorld(y);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      parts.push({
        geometry: buildQuadGeometry(
          [
            [x0, plane, z0],
            [x1, plane, z0],
            [x1, plane, z1],
            [x0, plane, z1],
          ],
          [0, -1, 0],
        ),
        materialIndex: 3,
      });
    }
  }

  for (let z = 0; z < GRID_SIZE; z += 1) {
    const positiveZMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, y) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y, z + 1),
      ),
    );
    for (const rectangle of collectRectangles(positiveZMask)) {
      const plane = toWorld(z + 1);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const y0 = toWorld(rectangle.column);
      const y1 = toWorld(rectangle.column + rectangle.width);
      parts.push({
        geometry: buildQuadGeometry(
          [
            [x0, y0, plane],
            [x1, y0, plane],
            [x1, y1, plane],
            [x0, y1, plane],
          ],
          [0, 0, 1],
        ),
        materialIndex: 4,
      });
    }

    const negativeZMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, y) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y, z - 1),
      ),
    );
    for (const rectangle of collectRectangles(negativeZMask)) {
      const plane = toWorld(z);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const y0 = toWorld(rectangle.column);
      const y1 = toWorld(rectangle.column + rectangle.width);
      parts.push({
        geometry: buildQuadGeometry(
          [
            [x0, y1, plane],
            [x1, y1, plane],
            [x1, y0, plane],
            [x0, y0, plane],
          ],
          [0, 0, -1],
        ),
        materialIndex: 5,
      });
    }
  }

  return parts;
}

function pointToVoxelCoordinate(point: THREE.Vector3): VoxelCoordinate | null {
  const x = Math.floor(point.x + HALF_GRID);
  const y = Math.floor(point.y + HALF_GRID);
  const z = Math.floor(point.z + HALF_GRID);

  if (!isWithinGrid(x, y, z)) {
    return null;
  }

  return [x, y, z];
}

function applyFaceColors(
  materials: THREE.MeshBasicMaterial[],
  faceColors: FaceColors,
) {
  const rightHex = getTailwindColorHex(faceColors.right);
  const topHex = getTailwindColorHex(faceColors.top);
  const leftHex = getTailwindColorHex(faceColors.left);

  materials[0].color.set(rightHex);
  materials[1].color.set(rightHex);
  materials[2].color.set(topHex);
  materials[3].color.set(topHex);
  materials[4].color.set(leftHex);
  materials[5].color.set(leftHex);
}

function applyMaterialOpacity(
  materials: THREE.MeshBasicMaterial[],
  opacity: number,
) {
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
}

function replaceLogoGeometry(
  sceneState: SceneState,
  nextFilledVoxels: Set<string>,
  syncCameraFitRadius: boolean,
) {
  const nextParts = buildVoxelSurfaceGeometries(nextFilledVoxels);
  const previousLogoMeshes = sceneState.logoMeshes;
  for (const logoMesh of previousLogoMeshes) {
    sceneState.logoGroup.remove(logoMesh);
    logoMesh.geometry.dispose();
  }
  sceneState.logoMeshes = nextParts.map(({ geometry, materialIndex }) => {
    const logoMesh = new THREE.Mesh(
      geometry,
      sceneState.cubeMaterials[materialIndex],
    );
    sceneState.logoGroup.add(logoMesh);
    return logoMesh;
  });
  sceneState.currentFilledVoxels = new Set(nextFilledVoxels);
  if (syncCameraFitRadius) {
    sceneState.cameraFitRadius = getGeometryFitRadius(
      nextParts.map(({ geometry }) => geometry),
    );
  }
  sceneState.resizeScene();
}

function syncTransparentFaceRenderOrder(sceneState: SceneState) {
  sceneState.camera.updateMatrixWorld();
  sceneState.logoGroup.updateMatrixWorld(true);

  const meshes = [
    ...sceneState.logoMeshes,
    ...sceneState.activeCubeMoves
      .filter((move) => move.mesh.visible)
      .map((move) => move.mesh),
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

function resetShuffleAnimation(
  sceneState: SceneState,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  syncCameraFitRadius: boolean,
) {
  clearActiveCubeMoves(sceneState);
  replaceLogoGeometry(
    sceneState,
    new Set(sceneState.homeFilledVoxels),
    syncCameraFitRadius,
  );
  lastMovedCubeKeyRef.current = null;
}

function scheduleNextCubeMove(
  sceneState: SceneState,
  elevationDegrees: number,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
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
    lastMovedCubeKey: lastMovedCubeKeyRef.current,
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
  const moveMesh = new THREE.Mesh(
    sceneState.cubeGeometry,
    sceneState.cubeMaterials,
  );
  moveMesh.visible = false;
  setCubeMeshPosition(moveMesh, nextMove.from);
  sceneState.logoGroup.add(moveMesh);
  sceneState.activeCubeMoves.push({
    durationMs: SHUFFLE_MOVE_DURATION_MS,
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

function syncCubeShuffleAnimation(
  sceneState: SceneState,
  elevationDegrees: number,
  lastMovedCubeKeyRef: MutableRefObject<string | null>,
  parallelMoves: LogoShuffleParallelMoves,
  rotationDegrees: number,
  timestampMs: number,
) {
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

    const progress = Math.min(
      Math.max((timestampMs - move.startTimeMs) / move.durationMs, 0),
      1,
    );
    const [x, y, z] = getCubeMovePosition(move, progress);
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
    replaceLogoGeometry(sceneState, sceneState.currentFilledVoxels, false);
  }

  while (sceneState.activeCubeMoves.length < parallelMoves) {
    const didScheduleMove = scheduleNextCubeMove(
      sceneState,
      elevationDegrees,
      lastMovedCubeKeyRef,
      rotationDegrees,
      timestampMs + sceneState.activeCubeMoves.length * SHUFFLE_MOVE_STAGGER_MS,
    );
    if (!didScheduleMove) {
      break;
    }
  }
}

export function NLogoScene({
  backgroundColor,
  className,
  editMode,
  elevationDegrees,
  faceColors,
  opacity,
  onInteractionStart,
  onRenderReady,
  onViewChange,
  onVoxelEdit,
  rotationDegrees,
  shuffleAnimation,
  voxelState,
}: NLogoSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef<SceneState | null>(null);
  const backgroundColorRef = useRef(backgroundColor);
  const editModeRef = useRef(editMode);
  const rotationDegreesRef = useRef(rotationDegrees);
  const elevationDegreesRef = useRef(elevationDegrees);
  const voxelStateRef = useRef(voxelState);
  const faceColorsRef = useRef(faceColors);
  const opacityRef = useRef(opacity);
  const shuffleAnimationRef = useRef(shuffleAnimation);
  const onInteractionStartRef = useRef(onInteractionStart);
  const onRenderReadyRef = useRef(onRenderReady);
  const onViewChangeRef = useRef(onViewChange);
  const onVoxelEditRef = useRef(onVoxelEdit);
  const lastMovedCubeKeyRef = useRef<string | null>(null);
  const interactionRef = useRef<SceneInteraction>({
    button: null,
    pointerId: null,
    startElevationDegrees: elevationDegrees,
    startRotationDegrees: rotationDegrees,
    startX: 0,
    startY: 0,
    status: "idle",
  });

  useEffect(() => {
    backgroundColorRef.current = backgroundColor;
  }, [backgroundColor]);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  useEffect(() => {
    rotationDegreesRef.current = rotationDegrees;
  }, [rotationDegrees]);

  useEffect(() => {
    elevationDegreesRef.current = elevationDegrees;
  }, [elevationDegrees]);

  useEffect(() => {
    onInteractionStartRef.current = onInteractionStart;
  }, [onInteractionStart]);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    onRenderReadyRef.current = onRenderReady;
  }, [onRenderReady]);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    onVoxelEditRef.current = onVoxelEdit;
  }, [onVoxelEdit]);

  useEffect(() => {
    const wasEnabled = shuffleAnimationRef.current.enabled;
    shuffleAnimationRef.current = shuffleAnimation;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    if (shuffleAnimation.enabled !== wasEnabled) {
      resetShuffleAnimation(sceneState, lastMovedCubeKeyRef, false);
    }
  }, [shuffleAnimation]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColorRef.current);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.width = "100%";
    container.replaceChildren(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const materials = [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ];
    applyFaceColors(materials, faceColorsRef.current);
    applyMaterialOpacity(materials, opacityRef.current);
    const initialFilledVoxels =
      parseVoxelState(voxelStateRef.current) ?? createDefaultFilledVoxelSet();
    const logoParts = buildVoxelSurfaceGeometries(initialFilledVoxels);
    const logoMeshes = logoParts.map(
      ({ geometry, materialIndex }) =>
        new THREE.Mesh(geometry, materials[materialIndex]),
    );
    const logoGroup = new THREE.Group();
    for (const logoMesh of logoMeshes) {
      logoGroup.add(logoMesh);
    }
    scene.add(logoGroup);
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const initialCameraFitRadius = getGeometryFitRadius(
      logoParts.map(({ geometry }) => geometry),
    );

    const getFrustumHalfSpan = () => {
      const radius =
        sceneStateRef.current?.cameraFitRadius ?? initialCameraFitRadius;
      return radius * CAMERA_FRUSTUM_PADDING;
    };

    const updateCameraPosition = () => {
      const elevationRadians = THREE.MathUtils.degToRad(
        elevationDegreesRef.current,
      );
      const horizontalComponent = Math.cos(elevationRadians);
      const verticalComponent = Math.sin(elevationRadians);
      const diagonalComponent = horizontalComponent / Math.sqrt(2);

      camera.position
        .set(diagonalComponent, verticalComponent, diagonalComponent)
        .setLength(ISOMETRIC_CAMERA_DISTANCE);
      const forward = camera.position.clone().normalize().multiplyScalar(-1);
      camera.up.copy(
        new THREE.Vector3().crossVectors(ORBIT_RIGHT_AXIS, forward).normalize(),
      );
      camera.lookAt(0, 0, 0);
    };

    const resizeScene = () => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 768;
      const aspect = width / height;
      const frustumHalfSpan = getFrustumHalfSpan();
      const frustumHalfHeight = Math.max(
        frustumHalfSpan,
        frustumHalfSpan / Math.max(aspect, 0.0001),
      );
      renderer.setSize(width, height, false);
      camera.left = -frustumHalfHeight * aspect;
      camera.right = frustumHalfHeight * aspect;
      camera.top = frustumHalfHeight;
      camera.bottom = -frustumHalfHeight;
      updateCameraPosition();
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    sceneStateRef.current = {
      camera,
      cameraFitRadius: initialCameraFitRadius,
      cubeGeometry,
      cubeMaterials: materials,
      currentFilledVoxels: new Set(initialFilledVoxels),
      activeCubeMoves: [],
      homeFilledVoxels: new Set(initialFilledVoxels),
      logoGroup,
      logoMeshes,
      raycaster: new THREE.Raycaster(),
      renderer,
      resizeScene,
      scene,
    };

    resizeScene();

    let readyFrameId = 0;
    let readyFrameId2 = 0;
    readyFrameId = window.requestAnimationFrame(() => {
      readyFrameId2 = window.requestAnimationFrame(() => {
        onRenderReadyRef.current?.();
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      resizeScene();
    });
    resizeObserver.observe(container);

    const timer = new THREE.Timer();
    timer.connect(document);
    let animationFrameId = 0;

    const animate = (timestamp?: number) => {
      timer.update(timestamp);
      const timestampMs = timestamp ?? performance.now();
      const sceneState = sceneStateRef.current;
      if (sceneState && shuffleAnimationRef.current.enabled) {
        syncCubeShuffleAnimation(
          sceneState,
          elevationDegreesRef.current,
          lastMovedCubeKeyRef,
          shuffleAnimationRef.current.parallelMoves,
          rotationDegreesRef.current,
          timestampMs,
        );
      }
      logoGroup.rotation.y = THREE.MathUtils.degToRad(
        rotationDegreesRef.current,
      );
      updateCameraPosition();
      if (sceneState) {
        syncTransparentFaceRenderOrder(sceneState);
      }
      renderer.render(scene, camera);
      animationFrameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(readyFrameId);
      window.cancelAnimationFrame(readyFrameId2);
      resizeObserver.disconnect();
      timer.dispose();
      const activeSceneState = sceneStateRef.current;
      if (activeSceneState) {
        clearActiveCubeMoves(activeSceneState);
        for (const logoMesh of activeSceneState.logoMeshes) {
          logoMesh.geometry.dispose();
        }
      } else {
        for (const logoMesh of logoMeshes) {
          logoMesh.geometry.dispose();
        }
      }
      cubeGeometry.dispose();
      for (const material of materials) {
        material.dispose();
      }
      scene.clear();
      sceneStateRef.current = null;
      renderer.dispose();
      container.replaceChildren();
    };
  }, []);

  useEffect(() => {
    voxelStateRef.current = voxelState;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    const nextFilledVoxels =
      parseVoxelState(voxelState) ?? createDefaultFilledVoxelSet();
    sceneState.homeFilledVoxels = new Set(nextFilledVoxels);
    resetShuffleAnimation(sceneState, lastMovedCubeKeyRef, true);
  }, [voxelState]);

  useEffect(() => {
    faceColorsRef.current = faceColors;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    applyFaceColors(sceneState.cubeMaterials, faceColors);
  }, [faceColors]);

  useEffect(() => {
    opacityRef.current = opacity;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    applyMaterialOpacity(sceneState.cubeMaterials, opacity);
  }, [opacity]);

  useEffect(() => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    sceneState.scene.background = new THREE.Color(backgroundColor);
    sceneState.renderer.render(sceneState.scene, sceneState.camera);
  }, [backgroundColor]);

  const pickVoxelEdit = (
    clientX: number,
    clientY: number,
    kind: VoxelEdit["kind"],
  ): VoxelEdit | null => {
    const sceneState = sceneStateRef.current;
    if (!sceneState || shuffleAnimationRef.current.enabled) {
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
    sceneState.raycaster.setFromCamera(
      new THREE.Vector2(x, y),
      sceneState.camera,
    );
    const intersections = sceneState.raycaster.intersectObjects(
      sceneState.logoMeshes,
      false,
    );
    if (intersections.length === 0) {
      return null;
    }
    const intersection = intersections[0];

    const localPoint = sceneState.logoGroup.worldToLocal(
      intersection.point.clone(),
    );
    const intersectionNormal = intersection.normal ?? intersection.face?.normal;
    if (!intersectionNormal) {
      return null;
    }
    const localNormal = intersectionNormal.clone();
    localPoint.addScaledVector(
      localNormal,
      kind === "add" ? RAYCAST_OFFSET : -RAYCAST_OFFSET,
    );

    const coordinate = pointToVoxelCoordinate(localPoint);
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

  const resetInteraction = (target: HTMLDivElement, pointerId: number) => {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    interactionRef.current = {
      button: null,
      pointerId: null,
      startElevationDegrees: elevationDegreesRef.current,
      startRotationDegrees: rotationDegreesRef.current,
      startX: 0,
      startY: 0,
      status: "idle",
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    onInteractionStartRef.current?.();
    interactionRef.current = {
      button: event.button,
      pointerId: event.pointerId,
      startElevationDegrees: elevationDegreesRef.current,
      startRotationDegrees: rotationDegreesRef.current,
      startX: event.clientX,
      startY: event.clientY,
      status: "pending",
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button !== 0) {
      return;
    }

    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;

    if (
      interaction.status === "pending" &&
      Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX
    ) {
      interactionRef.current.status = "dragging";
    }

    if (interactionRef.current.status !== "dragging") {
      return;
    }

    onViewChangeRef.current({
      elevationDegrees: normalizeElevationDegrees(
        interaction.startElevationDegrees +
          deltaY * DRAG_ELEVATION_DEGREES_PER_PIXEL,
      ),
      rotationDegrees: normalizeRotationDegrees(
        interaction.startRotationDegrees +
          deltaX * DRAG_ROTATION_DEGREES_PER_PIXEL,
      ),
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (
      interaction.pointerId !== event.pointerId ||
      interaction.button === null
    ) {
      return;
    }

    if (interaction.status !== "dragging") {
      const edit = pickVoxelEdit(
        event.clientX,
        event.clientY,
        editModeRef.current,
      );
      if (edit) {
        onVoxelEditRef.current(edit);
      }
    }

    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current.pointerId !== event.pointerId) {
      return;
    }

    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div
      ref={mountRef}
      className={className}
      onContextMenu={handleContextMenu}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
