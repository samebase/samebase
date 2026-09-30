import type { Rgb } from "../samebase-film-v3/filmV3Timeline";

/**
Blends of sRGB colors in OKLCH, the perceptual lightness, chroma, and hue space: a blend between
two vivid inks stays vivid and turns along the shorter way around the hue circle, where a blend in
RGB passes through gray.
*/

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const fromLinear = (channel: number) => {
  const encoded =
    channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.max(channel, 0) ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, encoded));
};

function toOklch([red, green, blue]: Rgb): [number, number, number] {
  const [r, g, b] = [toLinear(red), toLinear(green), toLinear(blue)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [lightness, Math.hypot(a, bAxis), Math.atan2(bAxis, a)];
}

function fromOklch([lightness, chroma, hue]: [number, number, number]): Rgb {
  const a = chroma * Math.cos(hue);
  const bAxis = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * bAxis) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * bAxis) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * bAxis) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** `from` at 0 and `to` at 1. */
export function mixOklch(from: Rgb, to: Rgb, amount: number): Rgb {
  const [fromLightness, fromChroma, fromHue] = toOklch(from);
  const [toLightness, toChroma, toHue] = toOklch(to);
  let turn = toHue - fromHue;
  turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
  return fromOklch([
    fromLightness + (toLightness - fromLightness) * amount,
    fromChroma + (toChroma - fromChroma) * amount,
    fromHue + turn * amount,
  ]);
}

/** The WCAG contrast ratio, from 1 for the same color to 21 for black on white. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const luminance = ([red, green, blue]: Rgb) =>
    0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
  const [one, other] = [luminance(first), luminance(second)];
  return (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);
}
