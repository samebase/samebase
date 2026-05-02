import {
  DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
import {
  getFaceColorsFromAppThemeColors,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import {
  createFilledVoxelSet,
  parseVoxelState,
} from "@/components/logoVoxelState";
import { Button } from "@/components/ui/button";
import { useDocumentThemeMode } from "@/hooks/useDocumentThemeMode";
import { readAppThemeColors } from "@/lib/appThemeColorSearch";
import { type LogoRouteSearch } from "@/lib/logoRouteSearch";
import { Link } from "@tanstack/react-router";

export function LogoStaticSvgPage({
  routeSearch,
}: {
  routeSearch: LogoRouteSearch;
}) {
  const documentThemeMode = useDocumentThemeMode();
  const isDarkTheme = documentThemeMode === "dark";
  const themeColors = readAppThemeColors(routeSearch);
  const faceColors = getFaceColorsFromAppThemeColors(themeColors);
  const backgroundColor = getTailwindColorHex(themeColors.base);
  const filledVoxels =
    parseVoxelState(routeSearch.vox ?? null) ??
    createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const themeFragment = isDarkTheme ? "dark" : "light";
  const staticSvgSrc = `${createStaticLogoSvgDataUrl({
    faceColors,
    filledVoxels,
  })}#${themeFragment}-${documentThemeMode}`;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-6 sm:p-10"
      style={{ backgroundColor }}
    >
      <div className="absolute left-3 top-3 flex items-center gap-2 border border-black/10 bg-white/84 p-2 backdrop-blur-sm sm:left-4 sm:top-4">
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link search={routeSearch} to="/logo">
            3D
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link search={routeSearch} to="/logo/iso">
            Iso
          </Link>
        </Button>
        <Button size="sm" className="rounded-none">
          SVG
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link search={routeSearch} to="/logo/single-cube">
            Study
          </Link>
        </Button>
      </div>

      <div className="grid max-w-4xl gap-5 border border-black/10 bg-white/84 p-6 text-black/75 backdrop-blur-sm sm:p-8">
        <div className="grid gap-2">
          <h1 className="text-lg font-medium text-black/85">
            Static SVG Preview
          </h1>
          <p className="max-w-2xl text-sm leading-6">
            This route renders the default Three camera view as true SVG face
            polygons instead of the interactive WebGL scene.
          </p>
        </div>

        <div className="flex items-center justify-center border border-black/10 bg-white p-6 sm:p-10">
          <img
            data-testid="logo-static-svg-image"
            src={staticSvgSrc}
            alt="Noter logo"
            width={DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE.width}
            height={DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE.height}
            className="block h-auto w-full max-w-[24rem]"
          />
        </div>
      </div>
    </div>
  );
}
