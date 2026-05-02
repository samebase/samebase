// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const DEFAULT_VIEW = {
  elevationDegrees: 35,
  rotationDegrees: 45,
};

function installLocalStorageStub() {
  const entries = new Map<string, string>();
  const localStorageStub: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageStub,
  });
}

async function importRotatedLogoViewState() {
  vi.resetModules();
  return await import("@/lib/rotatedLogoViewState");
}

describe("rotatedLogoViewState", () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("uses memory state for same-session logo remounts", async () => {
    const {
      DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY,
      cacheRotatedLogoViewState,
      readRotatedLogoViewState,
    } = await importRotatedLogoViewState();

    cacheRotatedLogoViewState(DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY, {
      elevationDegrees: 720,
      rotationDegrees: -90,
    });

    expect(
      readRotatedLogoViewState({
        defaultView: DEFAULT_VIEW,
        key: DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY,
        persistence: "visit",
      }),
    ).toEqual({
      elevationDegrees: 0,
      rotationDegrees: 270,
    });
  });

  it("hydrates persisted logo view state after the memory cache resets", async () => {
    const initialModule = await importRotatedLogoViewState();
    const { DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY, persistRotatedLogoViewState } =
      initialModule;

    persistRotatedLogoViewState({
      key: DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY,
      persistence: "device",
      view: {
        elevationDegrees: 0,
        rotationDegrees: 180,
      },
    });
    const { readRotatedLogoViewState } = await importRotatedLogoViewState();

    expect(
      readRotatedLogoViewState({
        defaultView: DEFAULT_VIEW,
        key: DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY,
        persistence: "device",
      }),
    ).toEqual({
      elevationDegrees: 0,
      rotationDegrees: 180,
    });
  });

  it("keeps visit-persisted logo view state out of localStorage", async () => {
    const initialModule = await importRotatedLogoViewState();
    const { PUBLIC_LANDING_LOGO_VIEW_STATE_KEY, persistRotatedLogoViewState } =
      initialModule;

    persistRotatedLogoViewState({
      key: PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
      persistence: "visit",
      view: {
        elevationDegrees: 0,
        rotationDegrees: 180,
      },
    });
    const { readRotatedLogoViewState } = await importRotatedLogoViewState();

    expect(
      readRotatedLogoViewState({
        defaultView: DEFAULT_VIEW,
        key: PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
        persistence: "visit",
      }),
    ).toEqual(DEFAULT_VIEW);
  });
});
