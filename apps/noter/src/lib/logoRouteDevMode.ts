import { redirect } from "@tanstack/react-router";
import {
  isLandingDevModeEnabled,
  LANDING_DEV_MODE_QUERY_PARAM,
} from "@/lib/landingDevMode";

type LogoDevRoutePathname =
  | "/logo"
  | "/logo/iso"
  | "/logo/single-cube"
  | "/logo/svg";

type LogoRouteSearchWithRootFlags = Readonly<Record<string, unknown>>;

/**
 * Logo preview routes rely on landing dev mode to expose mobile sidebar resize
 * grips, so normalize direct loads before the workspace shell renders.
 */
export function ensureLogoRouteDevModeSearch({
  hash,
  pathname,
  search,
}: {
  hash: string;
  pathname: LogoDevRoutePathname;
  search: LogoRouteSearchWithRootFlags;
}): void {
  if (isLandingDevModeEnabled(search)) {
    return;
  }

  throw redirect({
    hash,
    replace: true,
    search: {
      ...search,
      [LANDING_DEV_MODE_QUERY_PARAM]: true,
    },
    to: pathname,
  });
}
