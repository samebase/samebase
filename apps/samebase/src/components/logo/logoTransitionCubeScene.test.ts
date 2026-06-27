import { describe, expect, it } from "vite-plus/test";

import {
  STANDARD_TWO_BY_TWO_TRANSITION_CUBE_SCENE,
  TRANSITION_CUBE_DEFAULT_SELECTED_KEY,
  createStandardTwoByTwoTransitionCubeScene,
} from "@/components/logo/logoTransitionCubeScene";

describe("logoTransitionCubeScene", () => {
  it("builds the transition lab from a full 2x2x2 cube block", () => {
    const scene = createStandardTwoByTwoTransitionCubeScene();

    expect(scene.cubes).toHaveLength(8);
    expect(new Set(scene.cubes.map((cube) => cube.key)).size).toBe(8);
    expect(scene.faces).toHaveLength(12);
    expect(scene.faces.every((face) => face.points.length === 4)).toBe(true);
  });

  it("keeps the default selected cube visible as three independent faces", () => {
    const selectedFaces = STANDARD_TWO_BY_TWO_TRANSITION_CUBE_SCENE.faces.filter(
      (face) => face.cubeKey === TRANSITION_CUBE_DEFAULT_SELECTED_KEY,
    );

    expect(selectedFaces).toHaveLength(3);
    expect(selectedFaces.map((face) => face.colorKey).sort()).toEqual(["left", "right", "top"]);
  });
});
