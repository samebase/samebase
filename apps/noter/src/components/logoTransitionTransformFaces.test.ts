import { describe, expect, it } from "vitest";

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
  it("builds exposed voxel faces for the simplified 2x2 study scene", () => {
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
    expect(scene.faces).toHaveLength(18);
    expect(
      scene.faces.every((face) => face.transform.startsWith("matrix(")),
    ).toBe(true);
    expect(
      scene.faces.every((face) =>
        /^(posZ-front|negZ-back|posX-right|negX-left|posY-down|negY-top)-\d-\d-\d$/.test(
          face.rectId,
        ),
      ),
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
    const renderedFacesGroup =
      svgMarkup.match(/<g id="transform-lab-faces">([\s\S]*?)<\/g>/)?.[1] ?? "";
    const definitionsGroup =
      svgMarkup.match(
        /<g id="transform-lab-face-definitions">([\s\S]*?)<\/g>/,
      )?.[1] ?? "";

    expect(svgMarkup).toContain("<svg ");
    expect(svgMarkup).toContain('id="transform-lab-faces"');
    expect(svgMarkup).toContain('id="unit"');
    expect(svgMarkup).toContain('id="posZ-front-1-0-0"');
    expect(svgMarkup).toContain('id="negZ-back-1-0-0"');
    expect(svgMarkup).toContain('id="posX-right-1-0-0"');
    expect(svgMarkup).toContain('id="negX-left-1-0-0"');
    expect(svgMarkup).toContain('id="posY-down-1-0-0"');
    expect(svgMarkup).toContain('id="negY-top-1-0-0"');
    expect(svgMarkup).toContain(">0,0,0<");
    expect(svgMarkup).toContain(
      'marker-end="url(#transform-lab-axis-arrow-x)"',
    );
    expect(svgMarkup).toContain(">X<");
    expect(svgMarkup).toContain(">Y<");
    expect(svgMarkup).toContain(">Z<");
    expect(definitionsGroup).toContain('href="#unit"');
    expect(definitionsGroup).toContain('fill="#ef4444"');
    expect(renderedFacesGroup).toContain('<use href="#posZ-front-1-0-0" />');
    expect(renderedFacesGroup.match(/<use href="#/g)).toHaveLength(18);
    expect(renderedFacesGroup).toContain("<use href");
  });
});
