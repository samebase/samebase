export const CORNER_NOTCH_TYPES = [0, 1, 2] as const;

export type CornerNotchType = (typeof CORNER_NOTCH_TYPES)[number];
export type CornerNotchClassName =
  | "corner-notch-0"
  | "corner-notch-1"
  | "corner-notch-2";

export const DEFAULT_CORNER_NOTCH_TYPE: CornerNotchType = 1;

export const CORNER_NOTCH_CLASS_BY_TYPE = {
  0: "corner-notch-0",
  1: "corner-notch-1",
  2: "corner-notch-2",
} as const satisfies Record<CornerNotchType, CornerNotchClassName>;

export const CORNER_NOTCH_CLASS =
  CORNER_NOTCH_CLASS_BY_TYPE[DEFAULT_CORNER_NOTCH_TYPE];

export function getCornerNotchClass(
  type: CornerNotchType = DEFAULT_CORNER_NOTCH_TYPE,
) {
  return CORNER_NOTCH_CLASS_BY_TYPE[type];
}

export function getOptionalCornerNotchClass(type?: CornerNotchType | null) {
  if (type == null) {
    return undefined;
  }

  return getCornerNotchClass(type);
}
