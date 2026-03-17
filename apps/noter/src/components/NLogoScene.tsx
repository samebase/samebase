import {
  getTailwindColorHex,
  type FaceColors,
} from "@/components/logoTailwindColors";
import {
  HALF_GRID,
  GRID_SIZE,
  clampElevationDegrees,
  createDefaultFilledVoxelSet,
  isWithinGrid,
  normalizeRotationDegrees,
  parseVoxelState,
  type VoxelCoordinate,
  type VoxelEdit,
  voxelKey,
} from "@/components/logoVoxelState";
import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import * as THREE from "three";

const ISOMETRIC_CAMERA_DISTANCE = 11;
const DRAG_ROTATION_DEGREES_PER_PIXEL = 0.35;
const DRAG_ELEVATION_DEGREES_PER_PIXEL = 0.18;
const DRAG_THRESHOLD_PX = 4;
const RAYCAST_OFFSET = 0.001;

type Rectangle = {
  row: number;
  column: number;
  height: number;
  width: number;
};

type FaceBuckets = {
  positions: number[];
  normals: number[];
  indices: number[];
};

type SceneInteraction = {
  button: 0 | 2 | null;
  pointerId: number | null;
  startElevationDegrees: number;
  startRotationDegrees: number;
  startX: number;
  startY: number;
  status: "idle" | "pending" | "dragging";
};

type SceneState = {
  camera: THREE.OrthographicCamera;
  filledVoxels: Set<string>;
  logoMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial[]>;
  raycaster: THREE.Raycaster;
  renderer: THREE.WebGLRenderer;
};

type NLogoSceneProps = {
  className?: string;
  elevationDegrees: number;
  faceColors: FaceColors;
  onInteractionStart?: () => void;
  onViewChange: (nextView: {
    elevationDegrees: number;
    rotationDegrees: number;
  }) => void;
  onVoxelEdit: (edit: VoxelEdit) => void;
  rotationDegrees: number;
  voxelState: string;
};

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

function appendQuad(
  bucket: FaceBuckets,
  vertices: ReadonlyArray<readonly [number, number, number]>,
  normal: readonly [number, number, number],
) {
  const vertexOffset = bucket.positions.length / 3;

  for (const [x, y, z] of vertices) {
    bucket.positions.push(x, y, z);
    bucket.normals.push(normal[0], normal[1], normal[2]);
  }

  bucket.indices.push(
    vertexOffset,
    vertexOffset + 1,
    vertexOffset + 2,
    vertexOffset,
    vertexOffset + 2,
    vertexOffset + 3,
  );
}

function toWorld(boundaryIndex: number): number {
  return boundaryIndex - HALF_GRID;
}

function buildVoxelSurfaceGeometry(
  filledVoxels: Set<string>,
): THREE.BufferGeometry {
  const buckets: FaceBuckets[] = Array.from({ length: 6 }, () => ({
    positions: [],
    normals: [],
    indices: [],
  }));

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
      appendQuad(
        buckets[0],
        [
          [plane, y0, z0],
          [plane, y1, z0],
          [plane, y1, z1],
          [plane, y0, z1],
        ],
        [1, 0, 0],
      );
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
      appendQuad(
        buckets[1],
        [
          [plane, y0, z1],
          [plane, y1, z1],
          [plane, y1, z0],
          [plane, y0, z0],
        ],
        [-1, 0, 0],
      );
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
      appendQuad(
        buckets[2],
        [
          [x0, plane, z1],
          [x1, plane, z1],
          [x1, plane, z0],
          [x0, plane, z0],
        ],
        [0, 1, 0],
      );
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
      appendQuad(
        buckets[3],
        [
          [x0, plane, z0],
          [x1, plane, z0],
          [x1, plane, z1],
          [x0, plane, z1],
        ],
        [0, -1, 0],
      );
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
      appendQuad(
        buckets[4],
        [
          [x0, y0, plane],
          [x1, y0, plane],
          [x1, y1, plane],
          [x0, y1, plane],
        ],
        [0, 0, 1],
      );
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
      appendQuad(
        buckets[5],
        [
          [x0, y1, plane],
          [x1, y1, plane],
          [x1, y0, plane],
          [x0, y0, plane],
        ],
        [0, 0, -1],
      );
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const geometry = new THREE.BufferGeometry();
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const [materialIndex, bucket] of buckets.entries()) {
    positions.push(...bucket.positions);
    normals.push(...bucket.normals);
    indices.push(...bucket.indices.map((index) => index + vertexOffset));
    geometry.addGroup(indexOffset, bucket.indices.length, materialIndex);
    vertexOffset += bucket.positions.length / 3;
    indexOffset += bucket.indices.length;
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  if (positions.length > 0) {
    geometry.computeBoundingSphere();
  }

  return geometry;
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

export function NLogoScene({
  className,
  elevationDegrees,
  faceColors,
  onInteractionStart,
  onViewChange,
  onVoxelEdit,
  rotationDegrees,
  voxelState,
}: NLogoSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef<SceneState | null>(null);
  const rotationDegreesRef = useRef(rotationDegrees);
  const elevationDegreesRef = useRef(elevationDegrees);
  const voxelStateRef = useRef(voxelState);
  const faceColorsRef = useRef(faceColors);
  const onInteractionStartRef = useRef(onInteractionStart);
  const onViewChangeRef = useRef(onViewChange);
  const onVoxelEditRef = useRef(onVoxelEdit);
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
    rotationDegreesRef.current = rotationDegrees;
  }, [rotationDegrees]);

  useEffect(() => {
    elevationDegreesRef.current = elevationDegrees;
  }, [elevationDegrees]);

  useEffect(() => {
    onInteractionStartRef.current = onInteractionStart;
  }, [onInteractionStart]);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    onVoxelEditRef.current = onVoxelEdit;
  }, [onVoxelEdit]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f0);

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
    const initialFilledVoxels =
      parseVoxelState(voxelStateRef.current) ?? createDefaultFilledVoxelSet();
    const logoMesh = new THREE.Mesh(
      buildVoxelSurfaceGeometry(initialFilledVoxels),
      materials,
    );
    scene.add(logoMesh);

    sceneStateRef.current = {
      camera,
      filledVoxels: initialFilledVoxels,
      logoMesh,
      raycaster: new THREE.Raycaster(),
      renderer,
    };

    const frustumHeight = 3.7;
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
      camera.lookAt(0, 0, 0);
    };

    const resize = () => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 768;
      const aspect = width / height;
      renderer.setSize(width, height, false);
      camera.left = -frustumHeight * aspect;
      camera.right = frustumHeight * aspect;
      camera.top = frustumHeight;
      camera.bottom = -frustumHeight;
      updateCameraPosition();
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    resize();

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(container);

    const timer = new THREE.Timer();
    timer.connect(document);
    let animationFrameId = 0;

    const animate = (timestamp?: number) => {
      timer.update(timestamp);
      logoMesh.rotation.y = THREE.MathUtils.degToRad(
        rotationDegreesRef.current,
      );
      updateCameraPosition();
      renderer.render(scene, camera);
      animationFrameId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      timer.dispose();
      logoMesh.geometry.dispose();
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
    const previousGeometry = sceneState.logoMesh.geometry;
    sceneState.logoMesh.geometry = buildVoxelSurfaceGeometry(nextFilledVoxels);
    sceneState.filledVoxels = nextFilledVoxels;
    previousGeometry.dispose();
  }, [voxelState]);

  useEffect(() => {
    faceColorsRef.current = faceColors;

    const sceneState = sceneStateRef.current;
    if (!sceneState) {
      return;
    }

    applyFaceColors(sceneState.logoMesh.material, faceColors);
  }, [faceColors]);

  const pickVoxelEdit = (
    clientX: number,
    clientY: number,
    kind: VoxelEdit["kind"],
  ): VoxelEdit | null => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) {
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
    const intersections = sceneState.raycaster.intersectObject(
      sceneState.logoMesh,
      false,
    );
    if (intersections.length === 0) {
      return null;
    }
    const intersection = intersections[0];

    const localPoint = sceneState.logoMesh.worldToLocal(
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
    if (kind === "add" && sceneState.filledVoxels.has(key)) {
      return null;
    }
    if (kind === "remove" && !sceneState.filledVoxels.has(key)) {
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
    if (event.button !== 0 && event.button !== 2) {
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
      elevationDegrees: clampElevationDegrees(
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

    if (interaction.button === 0 && interaction.status !== "dragging") {
      const edit = pickVoxelEdit(event.clientX, event.clientY, "add");
      if (edit) {
        onVoxelEditRef.current(edit);
      }
    }

    if (interaction.button === 2) {
      const edit = pickVoxelEdit(event.clientX, event.clientY, "remove");
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
