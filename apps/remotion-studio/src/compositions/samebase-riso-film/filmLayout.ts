type Point = readonly [number, number];

/**
Page layout of one film format, in page pixels. The scene projection keeps 540 page pixels per
camera half height in both formats, so world scale does not depend on the format.
*/
export type FilmLayout = {
  accounts: { cap: number; ys: readonly [number, number, number] };
  end: {
    cap: number;
    mark: Point;
    markSize: number;
    url: number;
    ys: readonly [number, number, number];
  };
  /** Half size of the net faces and of the resting mark. */
  faceSize: number;
  giant: { center: Point; cap: number; ys: readonly [number, number, number] };
  height: number;
  iso: { center: Point; halfHeight: number };
  /** Camera center while the net lifts and folds. */
  liftCenter: Point;
  margin: { bottom: number; left: number; right: number; top: number };
  netOrigin: Point;
  opening: { base: Point; cap: number; same: Point };
  /** The probe label, relative to the probe on the page. The box and the text are relative to the elbow. */
  probeLabel: {
    align: "center" | "right";
    box: readonly [number, number, number, number];
    elbow: Point;
    lineStart: Point;
    text: Point;
  };
  pullBackCenter: Point;
  reshape: { cap: number; ys: readonly [number, number, number] };
  scaleLabel: Point;
  sidesLabel: Point;
  /** The page turns over this line: the center fold of a spread, or the binding of one page. */
  spineX: number;
  width: number;
};

export const landscapeLayout: FilmLayout = {
  accounts: { cap: 170, ys: [330, 560, 790] },
  end: { cap: 160, mark: [1560, 470], markSize: 205, url: 912, ys: [330, 540, 750] },
  faceSize: 150,
  giant: { cap: 142, center: [1060, 400], ys: [296, 486, 676] },
  height: 1080,
  iso: { center: [1130, 540], halfHeight: 2.9 },
  liftCenter: [1060, 560],
  margin: { bottom: 1026, left: 104, right: 1816, top: 66 },
  netOrigin: [810, 540],
  opening: { base: [96, 1010], cap: 340, same: [1822, 390] },
  probeLabel: {
    align: "right",
    box: [-350, -74, 0, 0],
    elbow: [-90, -150],
    lineStart: [-24, -70],
    text: [-16, -22],
  },
  pullBackCenter: [960, 540],
  reshape: { cap: 160, ys: [300, 510, 720] },
  scaleLabel: [1816, 990],
  sidesLabel: [1500, 930],
  spineX: 960,
  width: 1920,
};

/** The 4:5 feed cut: one portrait page bound on its left edge, with type above the object. */
export const portraitLayout: FilmLayout = {
  accounts: { cap: 130, ys: [250, 420, 590] },
  end: { cap: 110, mark: [540, 400], markSize: 170, url: 1150, ys: [760, 900, 1040] },
  faceSize: 110,
  giant: { cap: 120, center: [330, 760], ys: [210, 360, 510] },
  height: 1350,
  iso: { center: [540, 900], halfHeight: 3.4 },
  liftCenter: [560, 800],
  margin: { bottom: 1296, left: 70, right: 1010, top: 66 },
  netOrigin: [430, 760],
  opening: { base: [62, 1270], cap: 330, same: [1016, 400] },
  probeLabel: {
    align: "center",
    box: [-175, -74, 175, 0],
    elbow: [0, -160],
    lineStart: [0, -72],
    text: [0, -22],
  },
  pullBackCenter: [540, 760],
  reshape: { cap: 120, ys: [250, 410, 570] },
  scaleLabel: [1010, 1250],
  sidesLabel: [760, 1230],
  spineX: 0,
  width: 1080,
};
