export const PUBLIC_LANDING_SURFACE_BASE_CLASS_NAME = "public-landing-surface";
export const PUBLIC_LANDING_SURFACE_CLASS_NAME = `${PUBLIC_LANDING_SURFACE_BASE_CLASS_NAME} relative flex min-h-0 flex-1 flex-col overflow-hidden`;
export const PUBLIC_LANDING_BACKGROUND_CLASS_NAME =
  "public-landing-hex-dot-field absolute inset-0";

type LandingHoverSurface = {
  getBoundingClientRect: () => DOMRect;
  style: Pick<CSSStyleDeclaration, "getPropertyValue" | "setProperty">;
};

function writeHoverCoordinate(
  element: LandingHoverSurface,
  name: "--public-landing-hover-x" | "--public-landing-hover-y",
  value: number,
) {
  element.style.setProperty(name, `${Math.round(value)}px`);
}

export function updatePublicLandingHoverPosition(
  element: LandingHoverSurface,
  clientX: number,
  clientY: number,
) {
  const bounds = element.getBoundingClientRect();
  writeHoverCoordinate(
    element,
    "--public-landing-hover-x",
    clientX - bounds.left,
  );
  writeHoverCoordinate(
    element,
    "--public-landing-hover-y",
    clientY - bounds.top,
  );
  element.style.setProperty("--public-landing-hover-opacity", "1");
}

export function clearPublicLandingHoverPosition(element: LandingHoverSurface) {
  element.style.setProperty("--public-landing-hover-opacity", "0");
}
