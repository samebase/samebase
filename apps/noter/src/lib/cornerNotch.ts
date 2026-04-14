export const CORNER_NOTCH_TYPES = [0, 1, 2] as const;
export const CORNER_NOTCH_FAMILIES = ["clip", "pixel"] as const;

export type CornerNotchType = (typeof CORNER_NOTCH_TYPES)[number];
export type CornerNotchFamily = (typeof CORNER_NOTCH_FAMILIES)[number];
export type CornerNotchClassName =
  | "corner-notch-0"
  | "corner-notch-1"
  | "corner-notch-2"
  | "corner-notch-pixel-0"
  | "corner-notch-pixel-1"
  | "corner-notch-pixel-2";

export const DEFAULT_CORNER_NOTCH_TYPE: CornerNotchType = 1;
export const DEFAULT_CORNER_NOTCH_FAMILY: CornerNotchFamily = "clip";

export const CORNER_NOTCH_CLASS_BY_TYPE = {
  0: "corner-notch-0",
  1: "corner-notch-1",
  2: "corner-notch-2",
} as const satisfies Record<CornerNotchType, CornerNotchClassName>;

export const PIXEL_CORNER_NOTCH_CLASS_BY_TYPE = {
  0: "corner-notch-pixel-0",
  1: "corner-notch-pixel-1",
  2: "corner-notch-pixel-2",
} as const satisfies Record<CornerNotchType, CornerNotchClassName>;

export const CORNER_NOTCH_CLASS =
  CORNER_NOTCH_CLASS_BY_TYPE[DEFAULT_CORNER_NOTCH_TYPE];

export function getCornerNotchClass(
  type: CornerNotchType = DEFAULT_CORNER_NOTCH_TYPE,
  family: CornerNotchFamily = DEFAULT_CORNER_NOTCH_FAMILY,
) {
  return family === "pixel"
    ? PIXEL_CORNER_NOTCH_CLASS_BY_TYPE[type]
    : CORNER_NOTCH_CLASS_BY_TYPE[type];
}

export function getOptionalCornerNotchClass(
  type?: CornerNotchType | null,
  family: CornerNotchFamily = DEFAULT_CORNER_NOTCH_FAMILY,
) {
  if (type == null) {
    return undefined;
  }

  return getCornerNotchClass(type, family);
}

export const EMPHASIZED_BORDER_CLASS = "border";
