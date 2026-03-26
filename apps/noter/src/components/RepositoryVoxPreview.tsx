import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  VOXChunk,
  VOXResult,
} from "three/examples/jsm/loaders/VOXLoader.js";

type PreviewStatus = "idle" | "loading" | "ready" | "error";
const PREVIEW_LOADING_DELAY_MS = 500;

type RenderableObject = {
  bounds: THREE.Box3;
  object: THREE.Object3D;
};

class VoxParseError extends Error {
  constructor() {
    super("Preview unavailable for this .vox file.");
  }
}

/**
 * Older VOX files often contain raw chunk data without the newer scene graph.
 * Build palette-grouped instanced meshes so those files still render.
 */
function buildChunkVoxelMeshes(chunks: readonly VOXChunk[]): RenderableObject {
  const root = new THREE.Group();
  const bounds = new THREE.Box3();
  let hasBounds = false;

  for (const chunk of chunks) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const paletteCounts = new Map<number, number>();

    for (let index = 0; index < chunk.data.length; index += 4) {
      const paletteIndex = chunk.data[index + 3];
      paletteCounts.set(
        paletteIndex,
        (paletteCounts.get(paletteIndex) ?? 0) + 1,
      );
    }

    if (paletteCounts.size === 0) {
      geometry.dispose();
      continue;
    }

    const paletteMeshes = new Map<
      number,
      {
        mesh: THREE.InstancedMesh;
        nextIndex: number;
      }
    >();

    for (const [paletteIndex, count] of paletteCounts) {
      const color = decodePaletteColor(chunk.palette[paletteIndex] ?? 0);
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ color }),
        count,
      );
      mesh.frustumCulled = false;
      paletteMeshes.set(paletteIndex, {
        mesh,
        nextIndex: 0,
      });
      root.add(mesh);
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const offsetX = (chunk.size.x - 1) / 2;
    const offsetY = (chunk.size.z - 1) / 2;
    const offsetZ = (chunk.size.y - 1) / 2;

    for (let index = 0; index < chunk.data.length; index += 4) {
      const paletteIndex = chunk.data[index + 3];
      const paletteEntry = paletteMeshes.get(paletteIndex);
      if (!paletteEntry) {
        continue;
      }

      position.set(
        chunk.data[index] - offsetX,
        chunk.data[index + 2] - offsetY,
        -(chunk.data[index + 1] - offsetZ),
      );
      matrix.setPosition(position);
      paletteEntry.mesh.setMatrixAt(paletteEntry.nextIndex, matrix);
      paletteEntry.nextIndex += 1;

      if (!hasBounds) {
        bounds.min.copy(position);
        bounds.max.copy(position);
        hasBounds = true;
      } else {
        bounds.expandByPoint(position);
      }
    }

    for (const { mesh } of paletteMeshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }

  if (!hasBounds) {
    throw new VoxParseError();
  }

  bounds.min.addScalar(-0.5);
  bounds.max.addScalar(0.5);

  return {
    bounds,
    object: root,
  };
}

function decodePaletteColor(packedColor: number): THREE.Color {
  const color = new THREE.Color();
  color.setRGB(
    (packedColor & 0xff) / 0xff,
    ((packedColor >> 8) & 0xff) / 0xff,
    ((packedColor >> 16) & 0xff) / 0xff,
    THREE.SRGBColorSpace,
  );
  return color;
}

function createRenderableObject(result: VOXResult): RenderableObject {
  if (result.scene) {
    result.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(result.scene);
    if (!bounds.isEmpty()) {
      return {
        bounds,
        object: result.scene,
      };
    }
  }

  if (result.chunks.length === 0) {
    throw new VoxParseError();
  }

  return buildChunkVoxelMeshes(result.chunks);
}

/**
 * Dispose the transient Three.js resources created for the preview so file
 * switches do not leave old GPU allocations behind.
 */
function disposeObjectResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((node) => {
    if ("geometry" in node && node.geometry instanceof THREE.BufferGeometry) {
      geometries.add(node.geometry);
    }

    if (!("material" in node)) {
      return;
    }

    const nodeMaterials = Array.isArray(node.material)
      ? node.material
      : [node.material];

    for (const material of nodeMaterials) {
      if (!(material instanceof THREE.Material)) {
        continue;
      }

      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          textures.add(value);
        }
      }
    }
  });

  for (const texture of textures) {
    texture.dispose();
  }

  for (const material of materials) {
    material.dispose();
  }

  for (const geometry of geometries) {
    geometry.dispose();
  }
}

function fitCameraToBounds(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: THREE.Box3,
) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1);
  const distance =
    (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.15;
  const direction = new THREE.Vector3(1, 0.9, 1.15).normalize();

  controls.target.copy(center);
  controls.minDistance = Math.max(radius * 0.75, 4);
  controls.maxDistance = Math.max(radius * 8, 40);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 100, 0.1);
  camera.far = Math.max(distance * 10, radius * 20);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.update();
}

export function RepositoryVoxPreview({
  testId = "repository-media-viewer",
  url,
}: {
  testId?: string;
  url: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const abortController = new AbortController();
    let isDisposed = false;
    let loadedObject: THREE.Object3D | null = null;
    let loadingDelayId: number | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1000);
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    const fillLight = new THREE.DirectionalLight(0xc9defc, 0.45);
    keyLight.position.set(10, 18, 14);
    fillLight.position.set(-8, 10, -12);

    scene.add(ambientLight);
    scene.add(keyLight);
    scene.add(fillLight);

    const renderScene = () => {
      if (!isDisposed && renderer) {
        renderer.render(scene, camera);
      }
    };

    const shouldIgnoreResult = () =>
      abortController.signal.aborted || isDisposed;

    const clearLoadingDelay = () => {
      if (loadingDelayId !== null) {
        window.clearTimeout(loadingDelayId);
        loadingDelayId = null;
      }
    };

    const handleControlChange = () => {
      renderScene();
    };
    setStatus("idle");
    setErrorMessage(null);
    loadingDelayId = window.setTimeout(() => {
      if (shouldIgnoreResult()) {
        return;
      }
      setStatus("loading");
      loadingDelayId = null;
    }, PREVIEW_LOADING_DELAY_MS);

    void (async () => {
      try {
        /**
         * WebGL setup can fail synchronously on unsupported browsers or devices,
         * so keep it inside the preview error boundary instead of crashing the
         * entire media panel.
         */
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(1);
        renderer.domElement.className = "h-full w-full";
        renderer.domElement.setAttribute("data-testid", `${testId}-vox-canvas`);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.addEventListener("change", handleControlChange);

        const currentRenderer = renderer;
        const currentControls = controls;

        container.replaceChildren(renderer.domElement);

        resizeObserver = new ResizeObserver((entries) => {
          const targetEntry = entries[0];
          const nextWidth = Math.max(targetEntry.contentRect.width, 1);
          const nextHeight = Math.max(targetEntry.contentRect.height, 1);
          currentRenderer.setSize(nextWidth, nextHeight, false);
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderScene();
        });

        resizeObserver.observe(container);

        const [{ VOXLoader }, response] = await Promise.all([
          import("three/examples/jsm/loaders/VOXLoader.js"),
          fetch(url, { signal: abortController.signal }),
        ]);

        if (!response.ok) {
          throw new Error(`Failed to load .vox preview (${response.status}).`);
        }

        const buffer = await response.arrayBuffer();
        if (shouldIgnoreResult()) {
          return;
        }

        const result = new VOXLoader().parse(buffer);
        if (!result) {
          throw new VoxParseError();
        }

        const renderableObject = createRenderableObject(result);
        loadedObject = renderableObject.object;
        scene.add(loadedObject);
        fitCameraToBounds(camera, currentControls, renderableObject.bounds);
        renderScene();

        if (shouldIgnoreResult()) {
          return;
        }

        clearLoadingDelay();
        setStatus("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        const message =
          error instanceof VoxParseError
            ? error.message
            : "Failed to load .vox preview.";
        if (shouldIgnoreResult()) {
          return;
        }

        clearLoadingDelay();
        setErrorMessage(message);
        setStatus("error");
      }
    })();

    return () => {
      isDisposed = true;
      abortController.abort();
      clearLoadingDelay();
      resizeObserver?.disconnect();
      controls?.removeEventListener("change", handleControlChange);
      controls?.dispose();

      if (loadedObject) {
        scene.remove(loadedObject);
        disposeObjectResources(loadedObject);
      }

      renderer?.dispose();
      container.replaceChildren();
    };
  }, [testId, url]);

  return (
    <div className="min-h-0 flex-1 p-6">
      <div className="relative h-full min-h-[400px]">
        <div
          ref={containerRef}
          data-testid={`${testId}-vox-viewer`}
          data-state={status}
          className="h-full min-h-[400px] overflow-hidden border bg-background"
        />
        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {status === "error" && errorMessage ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="corner-notch-1 border bg-background px-4 py-3 text-sm text-muted-foreground">
              {errorMessage}
            </div>
          </div>
        ) : null}
        {status === "loading" ? (
          <div className="sr-only" aria-live="polite">
            Loading .vox preview.
          </div>
        ) : null}
        {status === "error" && errorMessage ? (
          <div className="sr-only" aria-live="polite">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
