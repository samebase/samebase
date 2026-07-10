// Keep temporary product-level kill switches in one obvious place.
/**
 * GitHub Codespaces remains a possible hosted runtime, but it is not part of
 * the default product surface while local and machine-backed workflows carry
 * the day-to-day path.
 */
export const CODESPACES_ENABLED: boolean = false;

export function assertCodespacesEnabled(): void {
  if (!CODESPACES_ENABLED) {
    throw new Error("Codespaces are disabled.");
  }
}
