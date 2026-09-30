import { loadFont } from "@remotion/google-fonts/InterTight";

import type { FilmV3Cursor, FilmV3Frame, FilmV3Text, Rgb } from "./filmV3Timeline";

const display = loadFont("normal", { subsets: ["latin"], weights: ["800"] }).fontFamily;

export async function waitForFilmV3Fonts(): Promise<void> {
  await document.fonts.load(`800 100px ${display}`);
}

type Context = CanvasRenderingContext2D;

export function css([red, green, blue]: Rgb, alpha = 1): string {
  const channel = (value: number) => Math.round(value * 255);
  return `rgba(${channel(red)}, ${channel(green)}, ${channel(blue)}, ${alpha})`;
}

let capRatio = 0;

/** Inter Tight 800 at the size whose cap height is `cap` pixels. */
export function fontFor(context: Context, cap: number): string {
  if (capRatio === 0) {
    context.font = `800 100px ${display}`;
    capRatio = context.measureText("H").actualBoundingBoxAscent / 100;
  }
  return `800 ${cap / capRatio}px ${display}`;
}

/**
Each word rises from below the baseline into place, clipped to the line box. A line wider than
`fit` shrinks until it fits.
*/
export function drawText(context: Context, line: FilmV3Text): void {
  if (line.words.every(({ rise }) => rise <= 0)) {
    return;
  }
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = css(line.color);
  const measure = (cap: number) => {
    context.font = fontFor(context, cap);
    context.letterSpacing = `${-0.03 * (cap / capRatio)}px`;
    const space = context.measureText(" ").width * 1.6;
    const widths = line.words.map(({ text }) => context.measureText(text).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + space * (widths.length - 1);
    return { space, total, widths };
  };
  const natural = measure(line.cap);
  const cap = natural.total > line.fit ? (line.cap * line.fit) / natural.total : line.cap;
  const { space, total, widths } = cap === line.cap ? natural : measure(cap);
  const lineHeight = cap * 1.45;
  context.beginPath();
  context.rect(0, line.y - cap * 1.2, context.canvas.width, lineHeight);
  context.clip();
  let x =
    line.align === "left" ? line.x : line.align === "center" ? line.x - total / 2 : line.x - total;
  line.words.forEach(({ rise, text }, index) => {
    if (rise > 0) {
      context.fillText(text, x, line.y + (1 - rise) * lineHeight);
    }
    x += (widths[index] ?? 0) + space;
  });
  context.restore();
}

/** A pointer like the one on the landing page, with a press ring. */
function drawCursor(context: Context, cursor: FilmV3Cursor, unit: number): void {
  if (cursor.visible <= 0) {
    return;
  }
  const size = unit * (1 - 0.12 * cursor.pressed);
  context.save();
  context.globalAlpha = cursor.visible;
  if (cursor.pressed > 0) {
    context.beginPath();
    context.arc(cursor.x, cursor.y, unit * (10 + 8 * cursor.pressed), 0, Math.PI * 2);
    context.fillStyle = `rgba(255, 255, 255, ${0.35 * cursor.pressed})`;
    context.fill();
  }
  context.translate(cursor.x, cursor.y);
  context.scale(size, size);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 17);
  context.lineTo(4.2, 13.2);
  context.lineTo(7, 19.6);
  context.lineTo(9.6, 18.5);
  context.lineTo(6.9, 12.2);
  context.lineTo(12.3, 12.2);
  context.closePath();
  context.lineJoin = "round";
  context.lineWidth = 1.6;
  context.strokeStyle = "rgb(20, 22, 24)";
  context.stroke();
  context.fillStyle = "rgb(255, 255, 255)";
  context.fill();
  context.restore();
}

/**
The sky and the type behind the object. The object shadow falls on this layer, and the haze shows
this layer through the far cells.
*/
export function drawBackdrop(context: Context, frame: FilmV3Frame): void {
  const { height, width } = context.canvas;
  const [top, bottom] = frame.sky;
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, css(top));
  sky.addColorStop(1, css(bottom));
  context.clearRect(0, 0, width, height);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  for (const line of frame.backdropTexts) {
    drawText(context, line);
  }
}

/** The type and the cursor in front of the object. */
export function drawOverlay(context: Context, frame: FilmV3Frame): void {
  const { height, width } = context.canvas;
  context.clearRect(0, 0, width, height);
  for (const line of frame.overlayTexts) {
    drawText(context, line);
  }
  drawCursor(context, frame.cursor, (2.6 * height) / 1080);
}
