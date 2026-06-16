export const LOGO_SHUFFLE_PARALLEL_OPTIONS = [1, 2, 3] as const;
export type LogoShuffleParallelMoves = (typeof LOGO_SHUFFLE_PARALLEL_OPTIONS)[number];

export const DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES = 3 satisfies LogoShuffleParallelMoves;

export function readLogoShuffleParallelMoves(value: number): LogoShuffleParallelMoves | null {
  switch (value) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    default:
      return null;
  }
}

export function normalizeLogoShuffleParallelMoves(value: number): LogoShuffleParallelMoves {
  return readLogoShuffleParallelMoves(value) ?? DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES;
}
