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
    const renderedFacesGroup =
      svgMarkup.match(/<g id="transform-lab-faces">([\s\S]*?)<\/g>/)?.[1] ?? "";
    const definitionsGroup =
      svgMarkup.match(
        /<g id="transform-lab-face-definitions">([\s\S]*?)<\/g>/,
      )?.[1] ?? "";

    expect(svgMarkup).toContain("<svg ");
    expect(svgMarkup).toContain('id="transform-lab-faces"');
    expect(svgMarkup).toContain('id="posZ-front"');
    expect(svgMarkup).toContain('id="negZ-back"');
    expect(svgMarkup).toContain('id="posX-right"');
    expect(svgMarkup).toContain('id="negX-left"');
    expect(svgMarkup).toContain('id="posY-down"');
    expect(svgMarkup).toContain('id="negY-top"');
    expect(svgMarkup).toContain(">0,0,0<");
    expect(svgMarkup).toContain(
      'marker-end="url(#transform-lab-axis-arrow-x)"',
    );
    expect(svgMarkup).toContain(">X<");
    expect(svgMarkup).toContain(">Y<");
    expect(svgMarkup).toContain(">Z<");
    expect(definitionsGroup.indexOf('id="posZ-front"')).toBeLessThan(
      definitionsGroup.indexOf('id="negX-left"'),
    );
    expect(definitionsGroup.indexOf('id="negX-left"')).toBeLessThan(
      definitionsGroup.indexOf('id="negY-top"'),
    );
    const renderedFaceIds = Array.from(
      definitionsGroup.matchAll(/id="([^"]+)"/g),
      (match) => match[1],
    ).filter(
      (faceId) =>
        faceId === "posZ-front" ||
        faceId === "negX-left" ||
        faceId === "negY-top" ||
        faceId === "posY-down" ||
        faceId === "negZ-back" ||
        faceId === "posX-right",
    );
    expect(renderedFaceIds.slice(0, 3)).toEqual([
      "posZ-front",
      "negX-left",
      "negY-top",
    ]);
    expect(renderedFacesGroup).toContain("<use href");
  });
});
