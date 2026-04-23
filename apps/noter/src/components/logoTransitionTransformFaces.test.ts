import { describe, expect, it } from "vite-plus/test";

import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "@/components/logoStaticSvgContract";
import {
  TRANSFORM_LAB_VIEW_BOX,
  createTransformLabScene,
  createTransformLabSvgMarkup,
} from "@/components/logoTransitionTransformFaces";

describe("logoTransitionTransformFaces", () => {
  it("builds a six-face single cube scene from transform matrices", () => {
    const scene = createTransformLabScene({
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    });

    expect(TRANSFORM_LAB_VIEW_BOX).toEqual({
      minX: 0,
      minY: 0,
      width: 360,
      height: 360,
    });
    expect(scene.faces).toHaveLength(6);
    expect(
      scene.faces.every((face) => face.transform.startsWith("matrix(")),
    ).toBe(true);
    expect(scene.axisGuideLines.map((line) => line.key)).toEqual([
      "x",
      "y",
      "z",
    ]);
  });

  it("serializes the live preview as svg markup", () => {
    const svgMarkup = createTransformLabSvgMarkup({
      rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    });

    expect(svgMarkup).toContain("<svg ");
    expect(svgMarkup).toContain('id="transform-lab-face"');
    expect(svgMarkup).toContain(">0,0,0<");
    expect(svgMarkup).toContain(
      'marker-end="url(#transform-lab-axis-arrow-x)"',
    );
    expect(svgMarkup).toContain(">X<");
    expect(svgMarkup).toContain(">Y<");
    expect(svgMarkup).toContain(">Z<");
    expect(svgMarkup.match(/href="#transform-lab-face"/g)).toHaveLength(6);
  });
});
