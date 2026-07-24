// Keep temporary product-level kill switches in one obvious place.
/**
 * The old global/floating chat affordance is deprecated and should stay out of
 * default route chrome. Flip this only for an intentional chat-surface revival.
 */
export const CHAT_ENABLED: boolean = false;

/**
 * GitHub Codespaces remains a possible hosted runtime, but it is not part of
 * the current product surface.
 */
export const CODESPACES_ENABLED: boolean = false;

export function assertCodespacesEnabled(): void {
  if (!CODESPACES_ENABLED) {
    throw new Error("Codespaces are disabled.");
  }
}
