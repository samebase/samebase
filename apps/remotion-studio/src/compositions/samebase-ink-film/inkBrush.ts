/** Canvas 2D ink, pencil, wash, and lettering tools, after the approved ink style frames. */
import { clamp, fbm1, length, rng, smoothstep, sub, vnoise, wobble, type Point } from "./inkMath";

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const LETTERING_FONT = "Caveat Brush";

export const PALETTE = {
  clay: "#DB7350",
  clayDeep: "#C85A3C",
  graphite: "#5B5754",
  ink: "#232931",
  inkSoft: "#3A4148",
  ochre: "#E6AA42",
  rose: "#DE8598",
  sap: "#80A35F",
  slate: "#394447",
  slateMid: "#5F7176",
  teal: "#3E948D",
  violet: "#7D69A7",
} as const;

export type Canvas2D = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };

export function createCanvas(width = WIDTH, height = HEIGHT): Canvas2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) {
    throw new Error("The ink film needs a 2D canvas context.");
  }
  return { canvas, context };
}

/** Starts a path with a polygon and adds each hole as another subpath, for "evenodd" fills. */
export function polygonPath(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  holes: readonly (readonly Point[])[] = [],
): void {
  context.beginPath();
  for (const ring of [points, ...holes]) {
    ring.forEach((point, index) =>
      index === 0 ? context.moveTo(point[0], point[1]) : context.lineTo(point[0], point[1]),
    );
    context.closePath();
  }
}

type StrokeOptions = {
  alpha?: number;
  closed?: boolean;
  color?: string;
  seed?: number;
  taper?: number;
  width?: number;
  widthVariation?: number;
};

/** A filled ribbon with a pressure taper and noise in its width. `points` must be dense. */
export function inkStroke(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  {
    alpha = 0.95,
    closed = false,
    color = PALETTE.ink,
    seed = 1,
    taper = 0.14,
    width = 3,
    widthVariation = 0.28,
  }: StrokeOptions = {},
): void {
  const path = closed ? points.concat(points.slice(1, Math.min(5, points.length))) : points;
  if (path.length < 2) {
    return;
  }
  const distances = [0];
  path.forEach((point, index) => {
    const previous = path[index - 1];
    if (previous) {
      distances.push((distances[index - 1] ?? 0) + length(sub(point, previous)));
    }
  });
  const total = distances[distances.length - 1] || 1;
  const left: Point[] = [];
  const right: Point[] = [];
  path.forEach((point, index) => {
    const tangent = sub(path[index + 1] ?? point, path[index - 1] ?? point);
    const size = length(tangent) || 1;
    const along = (distances[index] ?? 0) / total;
    const pressure =
      taper > 0
        ? Math.min(
            1,
            smoothstep(0, taper, along) * 0.75 + 0.25,
            smoothstep(1, 1 - taper, along) * 0.8 + 0.2,
          )
        : 1;
    const half =
      (width / 2) * pressure * (1 + widthVariation * fbm1((distances[index] ?? 0) / 38, seed + 11));
    const normal: Point = [-tangent[1] / size, tangent[0] / size];
    left.push([point[0] + normal[0] * half, point[1] + normal[1] * half]);
    right.push([point[0] - normal[0] * half, point[1] - normal[1] * half]);
  });
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  polygonPath(context, left.concat(right.reverse()));
  context.fill();
  context.restore();
}

type LineOptions = StrokeOptions & { amplitude?: number; wavelength?: number };

export function inkLine(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  options: LineOptions = {},
): void {
  const { amplitude = 1.4, seed = 1, wavelength = 120 } = options;
  inkStroke(context, wobble(points, false, { amplitude, seed, wavelength }), options);
}

export function inkPolygon(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  options: LineOptions = {},
): void {
  const { amplitude = 1.5, seed = 1, wavelength = 120 } = options;
  inkStroke(context, wobble(points, true, { amplitude, seed, wavelength }), {
    ...options,
    closed: true,
    taper: 0,
  });
}

/** A partial stroke along a polyline: `progress` 0 draws nothing, 1 draws the whole line. */
export function partialPath(points: readonly Point[], progress: number): Point[] {
  const dense = points.length > 1 ? points : [];
  const distances = [0];
  dense.forEach((point, index) => {
    const previous = dense[index - 1];
    if (previous) {
      distances.push((distances[index - 1] ?? 0) + length(sub(point, previous)));
    }
  });
  const goal = (distances[distances.length - 1] ?? 0) * clamp(progress);
  const out: Point[] = [];
  for (let index = 0; index < dense.length; index += 1) {
    const point = dense[index];
    const distance = distances[index] ?? 0;
    if (!point) {
      break;
    }
    if (distance <= goal) {
      out.push(point);
      continue;
    }
    const previous = dense[index - 1];
    const previousDistance = distances[index - 1] ?? 0;
    if (previous && distance > previousDistance) {
      const t = (goal - previousDistance) / (distance - previousDistance);
      out.push([
        previous[0] + (point[0] - previous[0]) * t,
        previous[1] + (point[1] - previous[1]) * t,
      ]);
    }
    break;
  }
  return out;
}

export function pencil(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  { alpha = 0.3, color = PALETTE.graphite, seed = 3, width = 1.2 } = {},
): void {
  const random = rng(seed);
  context.save();
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineWidth = width;
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!previous) {
      return;
    }
    context.globalAlpha = alpha * (0.45 + 0.9 * random());
    context.beginPath();
    context.moveTo(previous[0], previous[1]);
    context.lineTo(point[0], point[1]);
    context.stroke();
  });
  context.restore();
}

/** Hand hatching clipped to a polygon. `reveal` in [0, 1] draws the first part of the lines. */
export function hatchPolygon(
  context: CanvasRenderingContext2D,
  polygon: readonly Point[],
  {
    alpha = 0.55,
    angle = 40,
    color = PALETTE.ink,
    gap = 11,
    holes = [],
    jitter = 0.35,
    reveal = 1,
    seed = 5,
    width = 1.6,
  }: {
    alpha?: number;
    angle?: number;
    color?: string;
    gap?: number;
    holes?: readonly (readonly Point[])[];
    jitter?: number;
    reveal?: number;
    seed?: number;
    width?: number;
  } = {},
): void {
  const random = rng(seed);
  context.save();
  polygonPath(context, polygon, holes);
  context.clip("evenodd");
  const xs = polygon.map((point) => point[0]);
  const ys = polygon.map((point) => point[1]);
  const center: Point = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
  const radius =
    Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 10;
  const direction: Point = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
  const normal: Point = [-direction[1], direction[0]];
  let lineIndex = 0;
  for (let offset = -radius; offset <= radius; offset += gap * (1 + jitter * (random() - 0.5))) {
    lineIndex += 1;
    const origin: Point = [center[0] + normal[0] * offset, center[1] + normal[1] * offset];
    const start = -radius * (0.9 + 0.2 * random());
    const end = radius * (0.9 + 0.2 * random());
    const lineWidth = width * (0.8 + 0.4 * random());
    const lineAlpha = alpha * (0.7 + 0.5 * random());
    const shown = clamp(reveal * 1.6 - ((lineIndex * gap) / (2 * radius)) * 0.6);
    if (shown <= 0) {
      continue;
    }
    const a: Point = [origin[0] + direction[0] * start, origin[1] + direction[1] * start];
    const b: Point = [
      origin[0] + direction[0] * (start + (end - start) * shown),
      origin[1] + direction[1] * (start + (end - start) * shown),
    ];
    inkStroke(
      context,
      wobble([a, b], false, { amplitude: 0.9, seed: seed + offset, wavelength: 60 }),
      {
        alpha: lineAlpha,
        color,
        seed: seed + offset,
        taper: 0.25,
        width: lineWidth,
      },
    );
  }
  context.restore();
}

const MOTTLE_SIZE = 512;
const mottleCache = new Map<string, CanvasPattern>();
let mottleAlpha: HTMLCanvasElement | null = null;

/** Periodic value noise on a `period` lattice, so the mottle tile repeats without seams. */
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi));
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
  const h = (a: number, b: number) => {
    const s =
      Math.sin(
        (((a % period) + period) % period) * 15.71 +
          (((b % period) + period) % period) * 91.37 +
          seed * 7.13,
      ) * 43758.5453;
    return s - Math.floor(s);
  };
  const top = h(xi, yi) * (1 - u) + h(xi + 1, yi) * u;
  const bottom = h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u;
  return (top * (1 - v) + bottom * v) * 2 - 1;
}

/** One alpha tile of pigment blotches with darker dried rims, shared by every wash color. */
function readMottleAlpha(): HTMLCanvasElement {
  if (mottleAlpha) {
    return mottleAlpha;
  }
  const { canvas, context } = createCanvas(MOTTLE_SIZE, MOTTLE_SIZE);
  const image = context.createImageData(MOTTLE_SIZE, MOTTLE_SIZE);
  for (let y = 0; y < MOTTLE_SIZE; y += 1) {
    for (let x = 0; x < MOTTLE_SIZE; x += 1) {
      const fx = x / MOTTLE_SIZE;
      const fy = y / MOTTLE_SIZE;
      const warp = 0.6 * tileNoise(fx * 4, fy * 4, 4, 9);
      const low =
        tileNoise(fx * 4 + warp, fy * 4 - warp, 4, 1) * 0.6 +
        tileNoise(fx * 8, fy * 8, 8, 2) * 0.3 +
        tileNoise(fx * 16, fy * 16, 16, 3) * 0.1;
      const bloom = tileNoise(fx * 6 + warp * 1.4, fy * 6, 6, 5);
      const blot = smoothstep(0.05, 0.28, bloom);
      const rim = Math.exp(-(((bloom - 0.08) / 0.035) ** 2));
      const alpha = clamp(
        0.1 + 0.34 * (low * 0.5 + 0.5) + 0.22 * blot + 0.3 * rim * (0.6 + 0.4 * low),
      );
      const index = (y * MOTTLE_SIZE + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = alpha * 255;
    }
  }
  context.putImageData(image, 0, 0);
  mottleAlpha = canvas;
  return canvas;
}

function readMottlePattern(context: CanvasRenderingContext2D, color: string): CanvasPattern {
  const cached = mottleCache.get(color);
  if (cached) {
    return cached;
  }
  const tinted = createCanvas(MOTTLE_SIZE, MOTTLE_SIZE);
  tinted.context.drawImage(readMottleAlpha(), 0, 0);
  tinted.context.globalCompositeOperation = "source-in";
  tinted.context.fillStyle = color;
  tinted.context.fillRect(0, 0, MOTTLE_SIZE, MOTTLE_SIZE);
  const pattern = context.createPattern(tinted.canvas, "repeat");
  if (!pattern) {
    throw new Error("The ink film could not create a wash pattern.");
  }
  mottleCache.set(color, pattern);
  return pattern;
}

export type WashOptions = {
  /** Body opacity of the first glaze. */
  body?: number;
  /** Openings that stay unpainted. */
  holes?: readonly (readonly Point[])[];
  /** Strength of the mottled second glaze. */
  mottle?: number;
  /** Where the mottle tile sits, so the texture moves with its object. */
  origin?: Point;
  seed?: number;
  /** Edge wobble in px. */
  wobbleAmplitude?: number;
  /** Mottle tile scale. */
  textureScale?: number;
};

/**
A watercolor glaze on a white-ground canvas: a wobbly body, two thin stains that make layered
edges, and a mottled second glaze of the same pigment. It multiplies, like transparent paint.
*/
export function wash(
  context: CanvasRenderingContext2D,
  polygon: readonly Point[],
  color: string,
  {
    body = 0.78,
    holes = [],
    mottle = 0.55,
    origin = [0, 0],
    seed = 1,
    textureScale = 1,
    wobbleAmplitude = 2.2,
  }: WashOptions = {},
): void {
  if (polygon.length < 3) {
    return;
  }
  const shape = wobble(polygon, true, {
    amplitude: wobbleAmplitude,
    seed,
    step: 6,
    wavelength: 90,
  });
  const openings = holes
    .filter((hole) => hole.length >= 3)
    .map((hole, index) =>
      wobble(hole, true, {
        amplitude: wobbleAmplitude * 0.6,
        seed: seed + 31 * (index + 1),
        step: 5,
        wavelength: 60,
      }),
    );
  context.save();
  context.globalCompositeOperation = "multiply";
  context.fillStyle = color;
  context.globalAlpha = body;
  polygonPath(context, shape, openings);
  context.fill("evenodd");
  for (let stain = 0; stain < 2; stain += 1) {
    context.globalAlpha = 0.12;
    polygonPath(
      context,
      wobble(polygon, true, {
        amplitude: wobbleAmplitude * 1.8,
        seed: seed + 13 * (stain + 1),
        step: 8,
        wavelength: 70,
      }),
      openings,
    );
    context.fill("evenodd");
  }
  if (mottle > 0) {
    const pattern = readMottlePattern(context, color);
    pattern.setTransform(
      new DOMMatrix().translateSelf(origin[0], origin[1]).scaleSelf(textureScale, textureScale),
    );
    polygonPath(context, shape, openings);
    context.clip("evenodd");
    context.globalAlpha = mottle;
    context.fillStyle = pattern;
    const xs = shape.map((point) => point[0]);
    const ys = shape.map((point) => point[1]);
    context.fillRect(
      Math.min(...xs) - 2,
      Math.min(...ys) - 2,
      Math.max(...xs) - Math.min(...xs) + 4,
      Math.max(...ys) - Math.min(...ys) + 4,
    );
  }
  context.restore();
}

/** A circle as a polygon, with an optional noisy radius for blooms and puffs. */
export function circlePoints(
  center: Point,
  radius: number,
  count = 48,
  roughness = 0,
  seed = 1,
): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const r = radius * (1 + roughness * vnoise(angle * 2.2, seed));
    return [center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r];
  });
}

type LetterOptions = {
  align?: "center" | "left";
  alpha?: number;
  color?: string;
  /** 0 hides the line, 1 shows it all: glyphs appear left to right with a small pop. */
  progress?: number;
  rotation?: number;
  seed?: number;
  size?: number;
};

/** Hand lettering: per-glyph rotation, size, and baseline drift. Returns the line width. */
export function handLetter(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  {
    align = "left",
    alpha = 0.95,
    color = PALETTE.ink,
    progress = 1,
    rotation = 0.05,
    seed = 1,
    size = 80,
  }: LetterOptions = {},
): number {
  const random = rng(seed);
  const glyphs = [...text];
  context.save();
  context.font = `${size}px "${LETTERING_FONT}"`;
  context.textBaseline = "alphabetic";
  context.textAlign = "center";
  context.fillStyle = color;
  const widths = glyphs.map((glyph) => context.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let cursor = align === "center" ? x - total / 2 : x;
  const visible = progress * glyphs.length;
  glyphs.forEach((glyph, index) => {
    const glyphSize = size * (1 + 0.05 * (random() - 0.5) * 2);
    const lift = size * 0.05 * (random() - 0.5) * 2;
    const turn = rotation * (random() - 0.5) * 2;
    const width = widths[index] ?? 0;
    const shown = clamp(visible - index);
    if (shown > 0) {
      const pop = 1 + 0.35 * Math.sin(Math.PI * shown) * (1 - shown);
      context.save();
      context.globalAlpha = alpha * clamp(shown * 3);
      context.translate(cursor + width / 2, y + lift);
      context.rotate(turn);
      context.scale(pop, pop);
      context.font = `${glyphSize}px "${LETTERING_FONT}"`;
      context.fillText(glyph, 0, 0);
      context.restore();
    }
    cursor += width;
  });
  context.restore();
  return total;
}

/** The warm paper sheet with fibres and soft stains. */
export function drawPaper(seed = 7): HTMLCanvasElement {
  const { canvas, context } = createCanvas();
  const random = rng(seed);
  context.fillStyle = "#F4ECDC";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  for (let index = 0; index < 140; index += 1) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const radius = 60 + random() * 420;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const warm = random() < 0.55;
    gradient.addColorStop(
      0,
      warm
        ? `rgba(190,150,100,${0.004 + random() * 0.008})`
        : `rgba(255,252,242,${0.02 + random() * 0.04})`,
    );
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.lineCap = "round";
  for (let index = 0; index < 1600; index += 1) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const size = 6 + random() * 26;
    const angle = random() * Math.PI * 2;
    const bend = (random() - 0.5) * 0.8;
    context.strokeStyle =
      random() < 0.6
        ? `rgba(120,95,60,${0.035 + random() * 0.05})`
        : `rgba(255,255,248,${0.1 + random() * 0.12})`;
    context.lineWidth = 0.6 + random() * 0.7;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(
      x + Math.cos(angle + bend) * size * 0.5,
      y + Math.sin(angle + bend) * size * 0.5,
      x + Math.cos(angle) * size,
      y + Math.sin(angle) * size,
    );
    context.stroke();
  }
  return canvas;
}

/** Cold-press tooth in the red channel: three octaves of smoothed random bumps. */
export function drawTooth(seed = 9): HTMLCanvasElement {
  const random = rng(seed);
  const layer = (divisor: number) => {
    const width = Math.ceil(WIDTH / divisor);
    const height = Math.ceil(HEIGHT / divisor);
    const small = createCanvas(width, height);
    const image = small.context.createImageData(width, height);
    for (let index = 0; index < width * height; index += 1) {
      const value = random() * 255;
      image.data[index * 4] = value;
      image.data[index * 4 + 1] = value;
      image.data[index * 4 + 2] = value;
      image.data[index * 4 + 3] = 255;
    }
    small.context.putImageData(image, 0, 0);
    return small.canvas;
  };
  const { canvas, context } = createCanvas();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(layer(9), 0, 0, WIDTH, HEIGHT);
  context.globalAlpha = 0.55;
  context.drawImage(layer(3.5), 0, 0, WIDTH, HEIGHT);
  context.globalAlpha = 0.3;
  context.drawImage(layer(1.6), 0, 0, WIDTH, HEIGHT);
  return canvas;
}

export const tremble = (seed: number, boil: number, amount: number) =>
  amount * vnoise(boil * 1.37, seed);
