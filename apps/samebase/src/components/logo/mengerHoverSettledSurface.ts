import { type MengerDepthTransitionModel } from "@samebase/logo-model/menger-depth-transition";
import { buildLogoSurfaceQuads, type LogoSurfaceQuad } from "@samebase/logo-model/surface";
import { LOGO_GRID_SIZE_3, voxelKey } from "@samebase/logo-model/voxel";
import * as THREE from "three";

const BOX_FACE_MATERIAL_COUNT = 6;
const QUAD_INDEX_COUNT = 6;
const QUAD_VERTEX_COUNT = 4;

function createSurfaceGeometry(surfaceQuads: readonly LogoSurfaceQuad[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertexCount = surfaceQuads.length * QUAD_VERTEX_COUNT;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(surfaceQuads.length * QUAD_INDEX_COUNT);
  const quadsByMaterial = Array.from(
    { length: BOX_FACE_MATERIAL_COUNT },
    (): LogoSurfaceQuad[] => [],
  );
  for (const surfaceQuad of surfaceQuads) {
    quadsByMaterial[surfaceQuad.materialIndex].push(surfaceQuad);
  }

  let indexOffset = 0;
  let vertexOffset = 0;
  let vectorOffset = 0;
  for (const [materialIndex, materialQuads] of quadsByMaterial.entries()) {
    const groupStart = indexOffset;
    for (const surfaceQuad of materialQuads) {
      for (const vertex of surfaceQuad.vertices) {
        positions[vectorOffset] = vertex[0];
        positions[vectorOffset + 1] = vertex[1];
        positions[vectorOffset + 2] = vertex[2];
        normals[vectorOffset] = surfaceQuad.normal[0];
        normals[vectorOffset + 1] = surfaceQuad.normal[1];
        normals[vectorOffset + 2] = surfaceQuad.normal[2];
        vectorOffset += 3;
      }
      indices[indexOffset] = vertexOffset;
      indices[indexOffset + 1] = vertexOffset + 1;
      indices[indexOffset + 2] = vertexOffset + 2;
      indices[indexOffset + 3] = vertexOffset;
      indices[indexOffset + 4] = vertexOffset + 2;
      indices[indexOffset + 5] = vertexOffset + 3;
      indexOffset += QUAD_INDEX_COUNT;
      vertexOffset += QUAD_VERTEX_COUNT;
    }
    if (indexOffset > groupStart) {
      geometry.addGroup(groupStart, indexOffset - groupStart, materialIndex);
    }
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  return geometry;
}

export type MengerHoverSettledSurface = {
  geometry: THREE.BufferGeometry;
  instanceCount: number;
  mesh: THREE.InstancedMesh;
  quadCount: number;
};

export function createMengerHoverDepthOneSurface({
  materials,
  model,
  worldSize,
}: {
  materials: THREE.Material[];
  model: MengerDepthTransitionModel;
  worldSize: number;
}): MengerHoverSettledSurface {
  const filledVoxels = new Set(model.depthOneVoxels.map(([x, y, z]) => voxelKey(x, y, z)));
  const surfaceQuads = buildLogoSurfaceQuads(filledVoxels, LOGO_GRID_SIZE_3);
  const geometry = createSurfaceGeometry(surfaceQuads);
  const mesh = new THREE.InstancedMesh(geometry, materials, 1);
  const matrix = new THREE.Matrix4().makeScale(
    worldSize / LOGO_GRID_SIZE_3,
    worldSize / LOGO_GRID_SIZE_3,
    worldSize / LOGO_GRID_SIZE_3,
  );
  mesh.setMatrixAt(0, matrix);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    geometry,
    instanceCount: 1,
    mesh,
    quadCount: surfaceQuads.length,
  };
}

export function createMengerHoverSettledSurface({
  materials,
  model,
  worldSize,
}: {
  materials: THREE.Material[];
  model: MengerDepthTransitionModel;
  worldSize: number;
}): MengerHoverSettledSurface {
  const finalStage = model.stages.at(-1);
  const tileStage = model.stages.at(-2);
  if (!finalStage || !tileStage) {
    throw new Error("The Menger hover surface needs at least three sponge depths.");
  }
  if (tileStage.settledVoxels === null) {
    throw new Error("The Menger hover surface tile must retain its settled voxel coordinates.");
  }

  const tileFilledVoxels = new Set(tileStage.settledVoxels.map(([x, y, z]) => voxelKey(x, y, z)));
  const surfaceQuads = buildLogoSurfaceQuads(tileFilledVoxels, tileStage.gridSize);
  const geometry = createSurfaceGeometry(surfaceQuads);
  const mesh = new THREE.InstancedMesh(geometry, materials, model.depthOneVoxels.length);
  const matrix = new THREE.Matrix4();
  const tileScale = worldSize / finalStage.gridSize;
  const repeatSize = worldSize / 3;
  for (const [instanceIndex, coordinate] of model.depthOneVoxels.entries()) {
    matrix.makeScale(tileScale, tileScale, tileScale);
    matrix.setPosition(
      (coordinate[0] - 1) * repeatSize,
      (coordinate[1] - 1) * repeatSize,
      (coordinate[2] - 1) * repeatSize,
    );
    mesh.setMatrixAt(instanceIndex, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    geometry,
    instanceCount: model.depthOneVoxels.length,
    mesh,
    quadCount: surfaceQuads.length,
  };
}
