import { guard, isRecord } from "@samebase/dependent";
import { SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX } from "@samebase/sidebars/SidebarLayoutGeometry";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
  SidebarLayoutStateUpdate,
} from "@samebase/sidebars/SidebarLayoutState";
import * as React from "react";
import { VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE_KEY } from "@/lib/appWorkspaceSidebarPreferences";

const isFiniteNumber = guard<unknown, number>((value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null,
);

function parseMobilePane(value: unknown): SidebarLayoutState["mobilePane"] | null {
  if (value === "left" || value === "main" || value === "right") {
    return value;
  }

  return null;
}

function parseMobileSurface(value: unknown): SidebarLayoutState["mobileSurface"] | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value["kind"] === "unmerged") {
    return { kind: "unmerged" };
  }

  if (
    value["kind"] === "merged" &&
    (value["side"] === "left" || value["side"] === "right") &&
    isFiniteNumber(value["mainWidthPx"]) &&
    value["mainWidthPx"] >= SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX
  ) {
    return {
      kind: "merged",
      mainWidthPx: value["mainWidthPx"],
      side: value["side"],
    };
  }

  return null;
}

function parseWorkspaceSidebarState(value: unknown): SidebarLayoutState | null {
  if (!isRecord(value)) {
    return null;
  }

  const mobilePane = parseMobilePane(value["mobilePane"]);
  const mobileSurface = parseMobileSurface(value["mobileSurface"]);
  if (
    typeof value["leftDesktopOpen"] !== "boolean" ||
    !isFiniteNumber(value["leftDesktopWidthPx"]) ||
    !isFiniteNumber(value["leftMobileWidthPx"]) ||
    mobilePane === null ||
    mobileSurface === null ||
    typeof value["rightDesktopOpen"] !== "boolean" ||
    !isFiniteNumber(value["rightDesktopWidthPx"]) ||
    !isFiniteNumber(value["rightMobileWidthPx"])
  ) {
    return null;
  }

  return {
    leftDesktopOpen: value["leftDesktopOpen"],
    leftDesktopWidthPx: value["leftDesktopWidthPx"],
    leftMobileWidthPx: value["leftMobileWidthPx"],
    mobilePane,
    mobileSurface,
    rightDesktopOpen: value["rightDesktopOpen"],
    rightDesktopWidthPx: value["rightDesktopWidthPx"],
    rightMobileWidthPx: value["rightMobileWidthPx"],
  };
}

let seededState: { serialized: string | null; state: SidebarLayoutState | null } = {
  serialized: null,
  state: null,
};

/** The seeded state, the same object until the stored text changes. */
function readSeededState(): SidebarLayoutState | null {
  try {
    const serialized = window.localStorage.getItem(VISUAL_FIXTURE_WORKSPACE_SIDEBAR_STATE_KEY);
    if (serialized !== seededState.serialized) {
      seededState = {
        serialized,
        state: serialized === null ? null : parseWorkspaceSidebarState(JSON.parse(serialized)),
      };
    }
    return seededState.state;
  } catch {
    return null;
  }
}

function subscribeToSeededState() {
  return () => {};
}

function readServerSeededState() {
  return null;
}

/**
The sidebar state of the `/visual-fixture` route: in memory only, so a fixture never reads or
writes the signed-in user's saved state. It starts from the seeded state of a visual test, which the
server cannot read, so the hydration renders `defaults` and React renders the seed right after.
*/
export function useVisualFixtureWorkspaceSidebarState(
  defaults: SidebarLayoutState,
): SidebarLayoutStateController {
  const seeded = React.useSyncExternalStore(
    subscribeToSeededState,
    readSeededState,
    readServerSeededState,
  );
  const [changedState, setChangedState] = React.useState<SidebarLayoutState | null>(null);
  const setState = React.useCallback(
    (updateState: SidebarLayoutStateUpdate) => {
      setChangedState((currentState) => updateState(currentState ?? readSeededState() ?? defaults));
    },
    [defaults],
  );

  return React.useMemo(
    () => ({ isHydrated: true, state: changedState ?? seeded ?? defaults, setState }),
    [changedState, defaults, seeded, setState],
  );
}
