import { DEFAULT_STATIC_LOGO_SVG_DATA_URL } from "@/components/logoStaticSvgAsset";
import { getTailwindColorHex } from "@/components/logoTailwindColors";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function LogoStaticSvgPage() {
  const backgroundColor = getTailwindColorHex("background-base");

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-6 sm:p-10"
      style={{ backgroundColor }}
    >
      <div className="absolute left-3 top-3 flex items-center gap-2 border border-black/10 bg-white/84 p-2 backdrop-blur-sm sm:left-4 sm:top-4">
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo">3D</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo-iso">Iso</Link>
        </Button>
        <Button size="sm" className="rounded-none">
          SVG
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo-iso-study">Study</Link>
        </Button>
      </div>

      <div className="grid max-w-4xl gap-5 border border-black/10 bg-white/84 p-6 text-black/75 backdrop-blur-sm sm:p-8">
        <div className="grid gap-2">
          <h1 className="text-lg font-medium text-black/85">
            Static SVG Preview
          </h1>
          <p className="max-w-2xl text-sm leading-6">
            This route renders the isometric logo as a static image sourced from
            shared row-span math instead of the interactive canvas or WebGL
            scenes.
          </p>
        </div>

        <div className="flex items-center justify-center border border-black/10 bg-white p-6 sm:p-10">
          <img
            data-testid="logo-static-svg-image"
            src={DEFAULT_STATIC_LOGO_SVG_DATA_URL}
            alt="Noter logo"
            className="block h-auto w-full max-w-[24rem]"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      </div>
    </div>
  );
}
