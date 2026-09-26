import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadSpaceMono } from "@remotion/google-fonts/SpaceMono";

import {
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  keyed,
  mix,
  pageHeight,
  pageWidth,
  progress,
  ring,
} from "./filmMotion";
import { type FilmFrame, type Inks, projectToPage, readProbe, times } from "./filmTimeline";

const display = loadAnton("normal", { subsets: ["latin"], weights: ["400"] }).fontFamily;
const mono = loadSpaceMono("normal", { subsets: ["latin"], weights: ["400", "700"] }).fontFamily;

export async function waitForFilmFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load(`400 100px ${display}`),
    document.fonts.load(`400 100px ${mono}`),
    document.fonts.load(`700 100px ${mono}`),
  ]);
}

type Context = CanvasRenderingContext2D;

/** Type stays inside these margins, clear of the page camera crop. */
const marginLeft = 104;
const marginRight = 1816;

const pink: Inks = [1, 0, 0];
const blue: Inks = [0, 1, 0];
const slate: Inks = [0, 0, 1];
const allPlates: Inks = [1, 1, 1];

/** Each plate is one color channel. `lighten` keeps the largest coverage of each plate. */
function ink([pinkCoverage, blueCoverage, slateCoverage]: Inks, amount = 1): string {
  const channel = (value: number) => Math.round(clamp01(value * amount) * 255);
  return `rgb(${channel(pinkCoverage)}, ${channel(blueCoverage)}, ${channel(slateCoverage)})`;
}

function monoFont(size: number, weight: 400 | 700 = 400): string {
  return `${weight} ${size}px ${mono}`;
}

const capCache = new Map<string, number>();

/** Anton at the size whose cap height is `cap` pixels. */
function displayFont(context: Context, cap: number): string {
  const key = `${display}`;
  let ratio = capCache.get(key);
  if (ratio === undefined) {
    context.font = `400 100px ${display}`;
    ratio = context.measureText("H").actualBoundingBoxAscent / 100;
    capCache.set(key, ratio);
  }
  return `400 ${cap / ratio}px ${display}`;
}

function text(
  context: Context,
  value: string,
  x: number,
  y: number,
  font: string,
  inks: Inks,
  options: { align?: CanvasTextAlign; baseline?: CanvasTextBaseline; tracking?: number } = {},
): void {
  context.font = font;
  context.fillStyle = ink(inks);
  context.textAlign = options.align ?? "left";
  context.textBaseline = options.baseline ?? "alphabetic";
  context.letterSpacing = `${options.tracking ?? 0}px`;
  context.fillText(value, x, y);
}

// ---------- the mark ----------

type MarkState = {
  inks: Inks;
  /** Inner half size over outer half size. The brand mark is 1/3. */
  opening: number;
  rotation: number;
  size: number;
  stretch: readonly [number, number];
};

function drawMark(context: Context, x: number, y: number, mark: MarkState, amount = 1): void {
  const [stretchX, stretchY] = mark.stretch;
  const halfWidth = mark.size * stretchX;
  const halfHeight = mark.size * stretchY;
  const opening = mark.opening;
  context.save();
  context.translate(x, y);
  context.rotate(mark.rotation);
  context.beginPath();
  context.rect(-halfWidth, -halfHeight, 2 * halfWidth, 2 * halfHeight);
  context.rect(
    -halfWidth * opening,
    -halfHeight * opening,
    2 * halfWidth * opening,
    2 * halfHeight * opening,
  );
  context.fillStyle = ink(mark.inks, amount);
  context.fill("evenodd");
  context.restore();
}

const restMark: MarkState = {
  inks: slate,
  opening: 1 / 3,
  rotation: 0,
  size: 150,
  stretch: [1, 1],
};

function mixMark(from: MarkState, to: MarkState, amount: number): MarkState {
  const channel = (index: 0 | 1 | 2) => mix(from.inks[index], to.inks[index], clamp01(amount));
  return {
    inks: [channel(0), channel(1), channel(2)],
    opening: Math.max(0.04, mix(from.opening, to.opening, amount)),
    rotation: mix(from.rotation, to.rotation, amount),
    size: mix(from.size, to.size, amount),
    stretch: [
      mix(from.stretch[0], to.stretch[0], amount),
      mix(from.stretch[1], to.stretch[1], amount),
    ],
  };
}

/** One change on every beat: ink, proportion, opening, and a quarter turn. */
function readMouldedMark(time: number): MarkState {
  const back = (value: number) => easeOutBack(value, 2.2);
  const snap = 0.22;
  const mark = keyed(
    time,
    [
      { duration: 0, ease: back, time: 0, value: restMark },
      { duration: snap, ease: back, time: 1, value: { ...restMark, inks: pink } },
      { duration: snap, ease: back, time: 1.5, value: { ...restMark, inks: blue } },
      {
        duration: snap,
        ease: back,
        time: 2,
        value: { ...restMark, inks: [1, 1, 0], stretch: [1.75, 0.72] },
      },
      { duration: snap, ease: back, time: 2.5, value: { ...restMark, stretch: [0.7, 1.5] } },
      { duration: snap, ease: back, time: 3, value: { ...restMark, inks: pink, opening: 0.74 } },
      { duration: snap, ease: back, time: 3.5, value: { ...restMark, inks: blue, opening: 0.1 } },
      { duration: snap, ease: back, time: 4, value: { ...restMark, size: 170 } },
      {
        duration: 0.4,
        ease: back,
        time: 5,
        value: { ...restMark, rotation: Math.PI / 2, size: 170 },
      },
      {
        duration: 0.4,
        ease: easeInOutCubic,
        time: 5.5,
        value: { ...restMark, rotation: Math.PI / 2 },
      },
    ],
    mixMark,
  );
  let squash = 0;
  for (let hit = 1; hit <= 5.5; hit += 0.5) {
    squash += 0.07 * ring(time, hit, 2.6, 8);
  }
  return { ...mark, stretch: [mark.stretch[0] * (1 + squash), mark.stretch[1] * (1 - squash)] };
}

// ---------- ephemera ----------

function registrationMark(context: Context, x: number, y: number, radius: number): void {
  context.strokeStyle = ink(allPlates);
  context.lineWidth = 1.6;
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.moveTo(x + radius * 0.45, y);
  context.arc(x, y, radius * 0.45, 0, 2 * Math.PI);
  context.moveTo(x - radius * 1.8, y);
  context.lineTo(x + radius * 1.8, y);
  context.moveTo(x, y - radius * 1.8);
  context.lineTo(x, y + radius * 1.8);
  context.stroke();
}

function cropMarks(context: Context): void {
  const inset = 52;
  const length = 30;
  context.strokeStyle = ink(allPlates);
  context.lineWidth = 1.4;
  context.beginPath();
  for (const [x, y, sx, sy] of [
    [inset, inset, -1, -1],
    [pageWidth - inset, inset, 1, -1],
    [inset, pageHeight - inset, -1, 1],
    [pageWidth - inset, pageHeight - inset, 1, 1],
  ] as const) {
    context.moveTo(x + sx * 6, y);
    context.lineTo(x + sx * (6 + length), y);
    context.moveTo(x, y + sy * 6);
    context.lineTo(x, y + sy * (6 + length));
  }
  context.stroke();
}

function colorBar(context: Context): void {
  const x0 = 1698;
  const y0 = 1034;
  const size = 16;
  const cells: readonly Inks[] = [
    pink,
    [0.5, 0, 0],
    blue,
    [0, 0.5, 0],
    slate,
    [0, 0, 0.5],
    [1, 1, 0],
    allPlates,
  ];
  cells.forEach((cell, index) => {
    context.fillStyle = ink(cell);
    context.fillRect(x0 + index * size, y0, size, size);
  });
}

function ephemera(context: Context, figure: string, pages: readonly [string, string]): void {
  for (const [x, y, radius] of [
    [30, 540, 16],
    [pageWidth - 30, 540, 16],
    [960, 26, 11],
  ] as const) {
    registrationMark(context, x, y, radius);
  }
  cropMarks(context);
  colorBar(context);
  text(context, "SAMEBASE ZINE", marginLeft, 66, monoFont(18, 700), slate, {
    baseline: "top",
    tracking: 3,
  });
  text(context, `NO.01   ${figure}`, marginLeft + 260, 66, monoFont(18), slate, {
    baseline: "top",
    tracking: 3,
  });
  text(context, "samebase.com", marginRight, 66, monoFont(18, 700), slate, {
    align: "right",
    baseline: "top",
    tracking: 3,
  });
  text(context, pages[0], marginLeft, 1026, monoFont(16, 700), slate, { tracking: 2 });
  text(context, pages[1], marginRight - 150, 1026, monoFont(16, 700), slate, {
    align: "right",
    tracking: 2,
  });
}

// ---------- big type ----------

type Line = { at: number; inks: Inks; text: string; x: number; y: number };

/**
Big words slam in on their beat: they arrive from the left with an overshoot. `leave` sends the
whole block off to the left.
*/
function slamLines(
  context: Context,
  time: number,
  lines: readonly Line[],
  cap: number,
  leave: number,
): void {
  const exit = easeInCubic(progress(time, leave, leave + 0.35));
  for (const line of lines) {
    if (time < line.at) {
      continue;
    }
    const arrive = easeOutBack(progress(time, line.at, line.at + 0.3), 1.8);
    const x = line.x - 700 * (1 - arrive) - 2400 * exit;
    text(context, line.text, x, line.y, displayFont(context, cap), line.inks);
  }
}

// ---------- the front spread ----------

/** Face layout of the flat 1-4-1 net, in face units: left, front, right, back, top, bottom. */
const netCells = [
  [-2, 0, "FOLD"],
  [0, 0, ""],
  [2, 0, "FOLD"],
  [4, 0, "FOLD"],
  [-2, 2, "FOLD"],
  [4, -2, "FOLD"],
] as const;
const netOrigin = [810, 540] as const;
const faceSize = 150;

function drawNetGuides(context: Context, time: number): void {
  const draw =
    easeOutCubic(progress(time, times.netDraw, times.netDraw + 0.6)) *
    (1 - easeInCubic(progress(time, 11, 11.5)));
  if (draw <= 0) {
    return;
  }
  context.save();
  context.strokeStyle = ink(slate);
  context.lineWidth = 2;
  context.setLineDash([10, 8]);
  context.lineDashOffset = -time * 40;
  for (const [index, [cellX, cellY, label]] of netCells.entries()) {
    const reveal = clamp01(draw * 6 - index);
    if (reveal <= 0) {
      continue;
    }
    const x = netOrigin[0] + cellX * faceSize;
    const y = netOrigin[1] - cellY * faceSize;
    const half = faceSize * reveal;
    context.strokeRect(x - half, y - half, 2 * half, 2 * half);
    if (label && reveal >= 1) {
      text(context, label, x - faceSize + 12, y - faceSize + 26, monoFont(14, 700), slate, {
        tracking: 3,
      });
    }
  }
  context.restore();
  if (draw >= 1) {
    text(
      context,
      "CUT ALONG THE DASHED LINE",
      netOrigin[0] - 3 * faceSize,
      netOrigin[1] + faceSize + 40,
      monoFont(15),
      slate,
      { tracking: 2 },
    );
  }
}

function sideCount(time: number): number {
  if (time < times.fourSides || time >= times.close + 0.5) {
    return 3;
  }
  if (time < times.fiveSides) {
    return 4;
  }
  return time >= 24 && time < 25 ? 4 : 5;
}

function drawFront(context: Context, frame: FilmFrame): void {
  const { time } = frame;
  const figure =
    time < times.lift
      ? "FIG. 1"
      : time < times.drop
        ? "FIG. 2"
        : time < times.silence
          ? "FIG. 3"
          : "FIG. 4";
  const pages: readonly [string, string] =
    time < times.lift
      ? ["02", "03"]
      : time < times.drop
        ? ["04", "05"]
        : time < times.silence
          ? ["06", "07"]
          : ["08", "09"];
  ephemera(context, figure, pages);

  // Break 1: the flat mark, moulded on the beat.
  if (time < times.netDraw) {
    drawMark(context, netOrigin[0], netOrigin[1], readMouldedMark(time));
  }
  drawNetGuides(context, time);
  if (time >= 4 && time < 12) {
    slamLines(
      context,
      time,
      [
        { at: 4, inks: pink, text: "SAME", x: marginLeft - 8, y: 440 },
        { at: 5, inks: pink, text: "BASE", x: 1040, y: 1000 },
      ],
      340,
      11.2,
    );
  }

  // Break 2: the three accounts, one word per beat.
  if (time >= 12 && time < times.drop + 0.4) {
    slamLines(
      context,
      time,
      [
        { at: 12, inks: slate, text: "GitHub.", x: marginLeft, y: 330 },
        { at: 13, inks: pink, text: "Convex.", x: marginLeft, y: 560 },
        { at: 14, inks: blue, text: "Cloudflare.", x: marginLeft, y: 790 },
      ],
      170,
      times.drop - 0.05,
    );
  }

  // Break 3: the flat reshape.
  if (time >= times.drop && time < times.close + 0.6) {
    const first = time < 20;
    slamLines(
      context,
      time,
      first
        ? [
            { at: 16.05, inks: blue, text: "Delete your", x: marginLeft, y: 300 },
            { at: 16.5, inks: blue, text: "Samebase", x: marginLeft, y: 510 },
            { at: 17, inks: blue, text: "account.", x: marginLeft, y: 720 },
          ]
        : [
            { at: 20, inks: pink, text: "Your app", x: marginLeft, y: 300 },
            { at: 20.5, inks: pink, text: "doesn't", x: marginLeft, y: 510 },
            { at: 21, inks: pink, text: "notice.", x: marginLeft, y: 720 },
          ],
      160,
      first ? 19.75 : times.close,
    );
    const count = sideCount(time);
    const pop = easeOutBack(
      progress(
        time,
        count === 3 ? times.close + 0.5 : count === 4 ? times.fourSides : times.fiveSides,
        (count === 4 ? times.fourSides : times.fiveSides) + 0.25,
      ),
      2,
    );
    text(
      context,
      `SIDES: ${count}`,
      1500,
      930,
      monoFont(Math.round(24 * mix(1.4, 1, pop)), 700),
      slate,
      { tracking: 3 },
    );
  }
  if (time >= times.silence) {
    drawGiantWords(context, frame);
  }
}

function drawGiantWords(context: Context, frame: FilmFrame): void {
  const { time } = frame;
  const scaleText =
    time < times.hit
      ? `SCALE 1:${Math.round(27 ** easeInOutCubic(progress(time, 28.9, times.hit)))}`
      : "SCALE 1:243";
  text(context, scaleText, marginRight, 990, monoFont(16, 700), slate, {
    align: "right",
    tracking: 3,
  });
  slamLines(
    context,
    time,
    [
      { at: 32.5, inks: pink, text: "Every app", x: marginLeft, y: 296 },
      { at: 33, inks: pink, text: "on the same", x: marginLeft, y: 486 },
      { at: 33.5, inks: pink, text: "base.", x: marginLeft, y: 676 },
    ],
    142,
    40,
  );
  // The small mark rides the probe over the giant: Samebase is on the same base too.
  const [probeX, probeY] = projectToPage(frame.scene.camera, readProbe(time));
  const markArrive = easeOutBack(progress(time, 34.5, 34.8), 2);
  if (time >= 34.5) {
    drawMark(context, probeX, probeY - 34, { ...restMark, inks: slate, size: 30 * markArrive });
    const lineStart = [probeX + 24, probeY - 70] as const;
    const elbow = [probeX + 90, probeY - 150] as const;
    const reach = easeOutCubic(progress(time, 35, 35.4));
    context.strokeStyle = ink(slate);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(...lineStart);
    context.lineTo(mix(lineStart[0], elbow[0], reach), mix(lineStart[1], elbow[1], reach));
    context.lineTo(elbow[0] + 330 * reach, elbow[1]);
    context.stroke();
    if (reach >= 1) {
      text(context, "Samebase too.", elbow[0] + 4, elbow[1] - 16, monoFont(40, 700), slate);
    }
  }
}

// ---------- the end page ----------

function drawEnd(context: Context, time: number): void {
  ephemera(context, "FIG. 5", ["10", "11"]);
  const land = easeOutBack(progress(time, times.turnEnd - 0.1, times.turnEnd + 0.3), 1.6);
  const squash = 0.08 * ring(time, times.lastPrint, 2.4, 6);
  drawMark(context, 1440, 470, {
    ...restMark,
    size: 230 * mix(0.8, 1, land),
    stretch: [1 + squash, 1 - squash],
  });
  const lines: readonly Line[] = [
    { at: 38.5, inks: pink, text: "Same base.", x: marginLeft, y: 330 },
    { at: 39, inks: blue, text: "Your accounts.", x: marginLeft, y: 540 },
    { at: 39.5, inks: pink, text: "No magic.", x: marginLeft, y: 750 },
  ];
  slamLines(context, time, lines, 160, 1_000);
  if (time >= 40) {
    const arrive = easeOutBack(progress(time, 40, 40.3), 1.8);
    text(
      context,
      "samebase.com",
      marginLeft + 6 + 400 * (1 - arrive),
      912,
      monoFont(54, 700),
      slate,
      { tracking: 2 },
    );
  }
}

/** Draws the ink plates of the front spread, or of the end page after the page turn. */
export function drawFilmPage(context: Context, frame: FilmFrame, page: "current" | "next"): void {
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#000";
  context.fillRect(0, 0, pageWidth, pageHeight);
  context.globalCompositeOperation = "lighten";
  if (page === "next" || frame.time >= times.turnEnd) {
    drawEnd(context, frame.time);
  } else {
    drawFront(context, frame);
  }
}
