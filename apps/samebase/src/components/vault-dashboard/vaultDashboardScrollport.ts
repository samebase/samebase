const SCROLLABLE_OVERFLOW_VALUES = new Set(["auto", "scroll", "overlay"]);

/**
 * Finds the scrollport that owns dashboard scrolling so spacer and virtualizer
 * math use the same scroll bounds as route chrome.
 */
export function findVaultDashboardVerticalScrollport(element: HTMLElement): HTMLElement | null {
  let currentElement = element.parentElement;
  while (currentElement) {
    if (SCROLLABLE_OVERFLOW_VALUES.has(window.getComputedStyle(currentElement).overflowY)) {
      return currentElement;
    }
    currentElement = currentElement.parentElement;
  }
  return null;
}
