import {
  DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
import { getTailwindColorHex } from "@/components/logoTailwindColors";
import {
  createFilledVoxelSet,
  parseVoxelState,
} from "@/components/logoVoxelState";
import { Button } from "@/components/button";
import { useDocumentThemeMode } from "@/hooks/useDocumentThemeMode";
import { Link, useSearchParams } from "react-router-dom";

export function LogoStaticSvgPage() {
  const documentThemeMode = useDocumentThemeMode();
  const [searchParams] = useSearchParams();
  const isDarkTheme = documentThemeMode === "dark";
  const backgroundColor = getTailwindColorHex("background-base");
  const currentSearch = searchParams.toString();
  const filledVoxels =
    parseVoxelState(searchParams.get("vox")) ??
    createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const themeFragment = isDarkTheme ? "dark" : "light";
  const staticSvgSrc = `${createStaticLogoSvgDataUrl({ filledVoxels })}#${themeFragment}-${documentThemeMode}`;
  const modeHref = (pathname: "/logo" | "/logo-iso" | "/logo-iso-study") =>
    currentSearch ? `${pathname}?${currentSearch}` : pathname;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-6 sm:p-10"
      style={{ backgroundColor }}
    >
      <div className="absolute left-3 top-3 flex items-center gap-2 border border-black/10 bg-white/84 p-2 backdrop-blur-sm sm:left-4 sm:top-4">
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to={modeHref("/logo")}>3D</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to={modeHref("/logo-iso")}>Iso</Link>
        </Button>
        <Button size="sm" className="rounded-none">
          SVG
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to={modeHref("/logo-iso-study")}>Study</Link>
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
