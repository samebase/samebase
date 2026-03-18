import {
  DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE,
  DEFAULT_STATIC_LOGO_SVG_URL,
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_FACE_COLORS,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_STATE,
} from "@/components/logoStaticSvgAsset";
import { createLogoThreeSvgMarkup } from "@/components/logoThreeSvgRenderer";
import { getTailwindColorHex } from "@/components/logoTailwindColors";
import { parseVoxelState } from "@/components/logoVoxelState";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

export function LogoStaticSvgPage() {
  const [searchParams] = useSearchParams();
  const backgroundColor = getTailwindColorHex("background-base");
  const currentSearch = searchParams.toString();
  const staticSvgSrc = useMemo(() => {
    const voxelState = searchParams.get("vox");
    if (!voxelState || voxelState === STATIC_LOGO_VOXEL_STATE) {
      return DEFAULT_STATIC_LOGO_SVG_URL;
    }

    const filledVoxels = parseVoxelState(voxelState);
    if (!filledVoxels) {
      return DEFAULT_STATIC_LOGO_SVG_URL;
    }

    const markup = createLogoThreeSvgMarkup({
      backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      faceColors: STATIC_LOGO_FACE_COLORS,
      filledVoxels,
      rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    });

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }, [searchParams]);
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
