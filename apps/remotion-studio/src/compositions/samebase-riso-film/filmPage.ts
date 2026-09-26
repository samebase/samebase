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
  progress,
  pulse,
  ring,
} from "./filmMotion";
import { type FilmFrame, type Inks, loopSticker, readProbeLabel, times } from "./filmTimeline";
import type { FilmLayout } from "./filmLayout";

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

/** One change on every beat from the first one: ink, proportion, opening, and turns. */
function readMouldedMark(time: number): MarkState {
  const back = (value: number) => easeOutBack(value, 2.2);
  const snap = 0.2;
  const at = (beatTime: number, value: Partial<MarkState>) => ({
    duration: snap,
    ease: back,
    time: beatTime,
    value: { ...restMark, ...value },
  });
  const mark = keyed(
    time,
    [
      { duration: 0, ease: back, time: 0, value: { ...restMark, size: 190 } },
      at(0.5, { inks: pink, size: 170 }),
      at(1, { inks: blue, stretch: [1.7, 0.72] }),
      at(1.5, { stretch: [0.68, 1.5] }),
      at(2, { inks: [1, 1, 0], opening: 0.72, size: 200 }),
      at(2.5, { inks: pink, opening: 0.1 }),
      at(3, { rotation: Math.PI / 4, size: 170 }),
      at(3.5, { inks: blue, rotation: Math.PI / 2, size: 200 }),
      at(4, { inks: pink, stretch: [1.45, 0.8] }),
      at(4.5, { stretch: [0.8, 1.3] }),
      at(5, { inks: blue, opening: 0.55 }),
      at(5.5, {}),
    ],
    mixMark,
  );
  let squash = 0.1 * ring(time, 0, 2.6, 6);
  for (let hit = 0.5; hit <= 5.5; hit += 0.5) {
    squash += 0.08 * ring(time, hit, 2.6, 8);
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

function cropMarks(context: Context, { height, width }: FilmLayout): void {
  const inset = 52;
  const length = 30;
  context.strokeStyle = ink(allPlates);
  context.lineWidth = 1.4;
  context.beginPath();
  for (const [x, y, sx, sy] of [
    [inset, inset, -1, -1],
    [width - inset, inset, 1, -1],
    [inset, height - inset, -1, 1],
    [width - inset, height - inset, 1, 1],
  ] as const) {
    context.moveTo(x + sx * 6, y);
    context.lineTo(x + sx * (6 + length), y);
    context.moveTo(x, y + sy * 6);
    context.lineTo(x, y + sy * (6 + length));
  }
  context.stroke();
}

function colorBar(context: Context, { height, width }: FilmLayout): void {
  const x0 = width - 222;
  const y0 = height - 46;
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

function ephemera(
  context: Context,
  layout: FilmLayout,
  figure: string,
  pages: readonly [string, string],
): void {
  const { height, margin, width } = layout;
  for (const [x, y, radius] of [
    [30, height / 2, 16],
    [width - 30, height / 2, 16],
    [width / 2, 26, 11],
  ] as const) {
    registrationMark(context, x, y, radius);
  }
  cropMarks(context, layout);
  colorBar(context, layout);
  text(context, "SAMEBASE ZINE", margin.left, margin.top, monoFont(18, 700), slate, {
    baseline: "top",
    tracking: 3,
  });
  text(context, `NO.01   ${figure}`, margin.left + 260, margin.top, monoFont(18), slate, {
    baseline: "top",
    tracking: 3,
  });
  text(context, "samebase.com", margin.right, margin.top, monoFont(18, 700), slate, {
    align: "right",
    baseline: "top",
    tracking: 3,
  });
  text(context, pages[0], margin.left, margin.bottom, monoFont(16, 700), slate, { tracking: 2 });
  text(context, pages[1], margin.right - 150, margin.bottom, monoFont(16, 700), slate, {
    align: "right",
    tracking: 2,
  });
}

// ---------- big type ----------

/** A right-aligned line ends at `x` and arrives from the right. */
type Line = { align?: "right"; at: number; inks: Inks; text: string; x: number; y: number };

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
  const exit = easeInCubic(progress(time, leave, leave + 0.25));
  for (const line of lines) {
    if (time < line.at) {
      continue;
    }
    const arrive = easeOutBack(progress(time, line.at, line.at + 0.3), 1.8);
    const side = line.align === "right" ? 1 : -1;
    const x = line.x + side * 700 * (1 - arrive) - 2400 * exit;
    text(context, line.text, x, line.y, displayFont(context, cap), line.inks, {
      align: line.align ?? "left",
    });
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
function drawNetGuides(context: Context, time: number, layout: FilmLayout): void {
  const { faceSize, netOrigin } = layout;
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
  const { layout, time } = frame;
  const { margin } = layout;
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
  ephemera(context, layout, figure, pages);

  // Break 1: the flat mark, moulded on the beat.
  if (time < times.netDraw) {
    const mark = readMouldedMark(time);
    const [x, y] = layout.netOrigin;
    drawMark(context, x, y, { ...mark, size: (mark.size * layout.faceSize) / restMark.size });
  }
  drawNetGuides(context, time, layout);
  if (time < 12) {
    // The opening spread: SAME and BASE are on the page from frame 0. They re-slam and trade inks
    // on every bar downbeat.
    const bar = Math.min(Math.floor(time / 2), 3);
    const swapped = bar % 2 === 1;
    const slam = pulse(time, 2 * bar, 7);
    slamLines(
      context,
      time,
      [
        {
          align: "right",
          at: -0.25,
          inks: swapped ? blue : pink,
          text: "SAME",
          x: layout.opening.same[0],
          y: layout.opening.same[1],
        },
        {
          at: -0.15,
          inks: swapped ? pink : blue,
          text: "BASE",
          x: layout.opening.base[0],
          y: layout.opening.base[1],
        },
      ],
      layout.opening.cap * (1 + 0.08 * slam),
      11.2,
    );
  }

  // Break 2: the three accounts, one word per beat.
  if (time >= 12 && time < times.drop) {
    slamLines(
      context,
      time,
      [
        { at: 12, inks: slate, text: "GitHub.", x: margin.left, y: layout.accounts.ys[0] },
        { at: 13, inks: pink, text: "Convex.", x: margin.left, y: layout.accounts.ys[1] },
        { at: 14, inks: blue, text: "Cloudflare.", x: margin.left, y: layout.accounts.ys[2] },
      ],
      layout.accounts.cap,
      // The words leave one beat early, so the lit cube holds alone before the drop.
      times.drop - 0.55,
    );
  }

  // Break 3: the flat reshape.
  if (time >= times.drop && time < times.close + 0.6) {
    const first = time < 20;
    const { reshape } = layout;
    slamLines(
      context,
      time,
      first
        ? [
            { at: 16.5, inks: blue, text: "Delete your", x: margin.left, y: reshape.ys[0] },
            { at: 17, inks: blue, text: "Samebase", x: margin.left, y: reshape.ys[1] },
            { at: 17.5, inks: blue, text: "account.", x: margin.left, y: reshape.ys[2] },
          ]
        : [
            { at: 20, inks: pink, text: "Your app", x: margin.left, y: reshape.ys[0] },
            { at: 20.5, inks: pink, text: "doesn't", x: margin.left, y: reshape.ys[1] },
            { at: 21, inks: pink, text: "notice.", x: margin.left, y: reshape.ys[2] },
          ],
      reshape.cap,
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
      layout.sidesLabel[0],
      layout.sidesLabel[1],
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
  const { layout, time } = frame;
  const { giant, margin } = layout;
  const scaleText =
    time < times.hit
      ? `SCALE 1:${Math.round(27 ** easeInOutCubic(progress(time, 28.9, times.hit)))}`
      : "SCALE 1:243";
  text(context, scaleText, layout.scaleLabel[0], layout.scaleLabel[1], monoFont(16, 700), slate, {
    align: "right",
    tracking: 3,
  });
  slamLines(
    context,
    time,
    [
      { at: 32.5, inks: pink, text: "Every app", x: margin.left, y: giant.ys[0] },
      { at: 33, inks: pink, text: "on the same", x: margin.left, y: giant.ys[1] },
      { at: 33.5, inks: pink, text: "base.", x: margin.left, y: giant.ys[2] },
    ],
    giant.cap,
    40,
  );
  // The small mark rides the probe over the giant: Samebase is on the same base too.
  const label = readProbeLabel(time, frame.scene.camera, layout);
  if (!label) {
    return;
  }
  const { align, box, elbow, lineStart, probe, reach, size } = label;
  drawMark(context, probe[0], probe[1] - 34, { ...restMark, inks: slate, size });
  context.strokeStyle = ink(slate);
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(...lineStart);
  context.lineTo(mix(lineStart[0], elbow[0], reach), mix(lineStart[1], elbow[1], reach));
  context.stroke();
  if (box) {
    // The label is a paper sticker: the knockout hides the scene inside this border.
    const [left, top, right, bottom] = box;
    context.strokeRect(left + 4, top + 4, right - left - 8, bottom - top - 8);
    text(context, "Samebase too.", label.text[0], label.text[1], monoFont(40, 700), slate, {
      align,
    });
  }
}

// ---------- the end page ----------

function drawEnd(context: Context, time: number, layout: FilmLayout): void {
  const { end, margin } = layout;
  ephemera(context, layout, "FIG. 5", ["10", "11"]);
  const land = easeOutBack(progress(time, times.turnEnd - 0.1, times.turnEnd + 0.3), 1.6);
  const squash = 0.08 * ring(time, times.lastPrint, 2.4, 6);
  drawMark(context, end.mark[0], end.mark[1], {
    ...restMark,
    size: end.markSize * mix(0.8, 1, land),
    stretch: [1 + squash, 1 - squash],
  });
  const lines: readonly Line[] = [
    { at: 38.5, inks: pink, text: "Same base.", x: margin.left, y: end.ys[0] },
    { at: 39, inks: blue, text: "Your accounts.", x: margin.left, y: end.ys[1] },
    { at: 39.5, inks: pink, text: "No magic.", x: margin.left, y: end.ys[2] },
  ];
  slamLines(context, time, lines, end.cap, 1_000);
  if (time >= 40) {
    const arrive = easeOutBack(progress(time, 40, 40.3), 1.8);
    text(
      context,
      "samebase.com",
      margin.left + 6 + 400 * (1 - arrive),
      end.url,
      monoFont(54, 700),
      slate,
      { tracking: 2 },
    );
  }
}

/** The loop page: the words sit on a paper sticker over the endless pull back. */
function drawLoop(context: Context, layout: FilmLayout): void {
  ephemera(context, layout, "FIG. 4", ["08", "09"]);
  const [left, top, right, bottom] = loopSticker;
  context.strokeStyle = ink(slate);
  context.lineWidth = 2;
  context.strokeRect(left + 8, top + 8, right - left - 16, bottom - top - 16);
  const cap = 132;
  const font = displayFont(context, cap);
  text(context, "Every app", left + 40, top + 200, font, pink);
  text(context, "on the same", left + 40, top + 380, font, pink);
  text(context, "base.", left + 40, top + 560, font, pink);
  text(context, "Samebase too.", left + 44, bottom - 44, monoFont(34, 700), slate);
}

/** Draws the ink plates of the front spread, or of the end page after the page turn. */
export function drawFilmPage(context: Context, frame: FilmFrame, page: "current" | "next"): void {
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#000";
  context.fillRect(0, 0, frame.layout.width, frame.layout.height);
  context.globalCompositeOperation = "lighten";
  if (frame.kind === "loop") {
    drawLoop(context, frame.layout);
  } else if (page === "next" || frame.time >= times.turnEnd) {
    drawEnd(context, frame.time, frame.layout);
  } else {
    drawFront(context, frame);
  }
}
