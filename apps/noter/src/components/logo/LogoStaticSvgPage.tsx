import { DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE } from "@/components/logo/logoStaticSvgContract";
import { clampLogoFractalDepthForRenderer } from "@/components/logo/logoDepthLimits";
import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import { readLogoLeftFaceStyle } from "@/components/logo/logoLeftFaceStyle";
import {
  DEFAULT_LOGO_FRACTAL_DEPTH,
  createDefaultFilledVoxelSet,
  normalizeLogoGridSize,
  parseVoxelState,
} from "@/components/logo/logoVoxelState";
import { Button } from "@/components/ui/button";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import { Link } from "@tanstack/react-router";

export function LogoStaticSvgPage({ routeSearch }: { routeSearch: LogoRouteSearch }) {
  const logoTheme = useResolvedAppThemeColorState(routeSearch);
  const gridSize = normalizeLogoGridSize(routeSearch.gridSize);
  const parsedVoxelState = parseVoxelState(routeSearch.vox ?? null);
  const baseFilledVoxels =
    parsedVoxelState && parsedVoxelState.gridSize === gridSize
      ? parsedVoxelState.filledVoxels
      : createDefaultFilledVoxelSet(gridSize);
  const fractalDepth = clampLogoFractalDepthForRenderer(
    routeSearch.depth ?? DEFAULT_LOGO_FRACTAL_DEPTH,
    "svg",
  );
  const staticSvgSrc = `${createStaticLogoSvgDataUrl({
    depth: fractalDepth,
    faceColors: logoTheme.faceColors,
    filledVoxels: baseFilledVoxels,
    gridSize,
    leftFaceStyle: readLogoLeftFaceStyle(routeSearch),
  })}#${logoTheme.cacheKey}:${fractalDepth}`;

  return (
    <div
      className="relative flex min-h-full items-center justify-center overflow-hidden p-6 sm:p-10"
      style={{ backgroundColor: logoTheme.backgroundColor }}
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
          <h1 className="text-lg font-medium text-black/85">Static SVG Preview</h1>
          <p className="max-w-2xl text-sm leading-6">
            This route renders the default Three camera view as true SVG face polygons instead of
            the interactive WebGL scene.
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
