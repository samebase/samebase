import { type FaceColorKey } from "./logoTailwindColors";
import { GRID_SIZE, isWithinGrid, voxelKey } from "./logoVoxelState";

type Rectangle = {
  column: number;
  height: number;
  row: number;
  width: number;
};

export type LogoSurfaceVertex = readonly [number, number, number];

export type LogoSurfaceQuad = {
  colorKey: FaceColorKey;
  key: string;
  materialIndex: number;
  normal: LogoSurfaceVertex;
  vertices: readonly [
    LogoSurfaceVertex,
    LogoSurfaceVertex,
    LogoSurfaceVertex,
    LogoSurfaceVertex,
  ];
};

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

      rectangles.push({ column, height, row, width });
    }
  }

  return rectangles;
}

function isVoxelFilled(
  filledVoxels: ReadonlySet<string>,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!isWithinGrid(x, y, z)) {
    return false;
  }

  return filledVoxels.has(voxelKey(x, y, z));
}

function toWorld(boundaryIndex: number): number {
  return boundaryIndex - GRID_SIZE / 2;
}

/**
 * Converts settled voxels into merged exposed faces. Renderers should treat
 * this as derived geometry; moving cubes stay as transient motion state above
 * the settled voxel shape.
 */
export function buildLogoSurfaceQuads(
  filledVoxels: ReadonlySet<string>,
): LogoSurfaceQuad[] {
  const quads: LogoSurfaceQuad[] = [];

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
      quads.push({
        colorKey: "right",
        key: `positive-x:${x}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 0,
        normal: [1, 0, 0],
        vertices: [
          [plane, y0, z0],
          [plane, y1, z0],
          [plane, y1, z1],
          [plane, y0, z1],
        ],
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
      quads.push({
        colorKey: "right",
        key: `negative-x:${x}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 1,
        normal: [-1, 0, 0],
        vertices: [
          [plane, y0, z1],
          [plane, y1, z1],
          [plane, y1, z0],
          [plane, y0, z0],
        ],
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
      quads.push({
        colorKey: "top",
        key: `positive-y:${y}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 2,
        normal: [0, 1, 0],
        vertices: [
          [x0, plane, z1],
          [x1, plane, z1],
          [x1, plane, z0],
          [x0, plane, z0],
        ],
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
      quads.push({
        colorKey: "top",
        key: `negative-y:${y}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 3,
        normal: [0, -1, 0],
        vertices: [
          [x0, plane, z0],
          [x1, plane, z0],
          [x1, plane, z1],
          [x0, plane, z1],
        ],
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
      quads.push({
        colorKey: "left",
        key: `positive-z:${z}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 4,
        normal: [0, 0, 1],
        vertices: [
          [x0, y0, plane],
          [x1, y0, plane],
          [x1, y1, plane],
          [x0, y1, plane],
        ],
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
      quads.push({
        colorKey: "left",
        key: `negative-z:${z}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 5,
        normal: [0, 0, -1],
        vertices: [
          [x0, y1, plane],
          [x1, y1, plane],
          [x1, y0, plane],
          [x0, y0, plane],
        ],
      });
    }
  }

  return quads;
}

export function getLogoSurfaceFitRadius(
  surfaceQuads: readonly LogoSurfaceQuad[],
): number {
  let fitRadius = 0;

  for (const surfaceQuad of surfaceQuads) {
    for (const [x, y, z] of surfaceQuad.vertices) {
      fitRadius = Math.max(fitRadius, Math.hypot(x, y, z));
    }
  }

  return fitRadius || (GRID_SIZE / 2) * Math.sqrt(3);
}
