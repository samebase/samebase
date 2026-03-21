export type Point = {
  x: number;
  y: number;
};

export type DragSession = {
  frame: "start" | "end";
  initialOffset: Point;
  pointerId: number;
  pointerStart: Point;
};

export function addOffset(point: Point, offset: Point): Point {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

export function formatOffset(point: Point): string {
  return `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
}

export function mixOffset(start: Point, end: Point, progress: number): Point {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

export function getFaceCenter(points: readonly Point[], offset: Point): Point {
  if (points.length === 0) {
    return offset;
  }

  const totals = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: totals.x / points.length + offset.x,
    y: totals.y / points.length + offset.y,
  };
}
