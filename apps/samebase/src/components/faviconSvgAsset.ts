export const FAVICON_BACKGROUND_COLOR = "#ffffff";
export const FAVICON_FOREGROUND_COLOR = "#394447";

/**
 * The browser mark is a depth-2 Sierpiński carpet on a one-unit safe inset.
 * Its 9x9 geometry keeps every recursive opening visible at 16px.
 */
export function createFaviconSvgMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="99" height="99" viewBox="0 0 11 11" shape-rendering="crispEdges">
  <rect width="11" height="11" fill="${FAVICON_BACKGROUND_COLOR}" />
  <path fill="${FAVICON_FOREGROUND_COLOR}" fill-rule="evenodd" d="M1 1h9v9H1z M2 2h1v1H2z M5 2h1v1H5z M8 2h1v1H8z M2 5h1v1H2z M4 4h3v3H4z M8 5h1v1H8z M2 8h1v1H2z M5 8h1v1H5z M8 8h1v1H8z" />
</svg>`;
}
