import { guard, isRecord } from "@samebase/dependent";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Durable pane-trail state. Widths and collapses are keyed by pane id so the
 * same store serves any trail the route derives; panes that are not in the
 * current trail simply keep their entries until they reappear.
 */
export type WorkspacePaneTrailState = {
  widths: Record<string, number>;
  collapsedPaneIds: readonly string[];
};

export type WorkspacePaneTrailActions = {
  setPaneWidthPx: (paneId: string, widthPx: number) => void;
  collapsePane: (paneId: string) => void;
  expandPane: (paneId: string) => void;
  setAllContextCollapsed: (paneIds: readonly string[], collapsed: boolean) => void;
};

const WORKSPACE_PANE_TRAIL_STORAGE_VERSION = 1;
const WIDTH_PERSIST_DELAY_MS = 160;

const EMPTY_TRAIL_STATE: WorkspacePaneTrailState = {
  widths: {},
  collapsedPaneIds: [],
};

const isFiniteNumber = guard<unknown, number>((value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null,
);

function parseWorkspacePaneTrailState(value: unknown): WorkspacePaneTrailState | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.version !== WORKSPACE_PANE_TRAIL_STORAGE_VERSION) {
    return null;
  }
  if (!isRecord(value.widths) || !Array.isArray(value.collapsedPaneIds)) {
    return null;
  }

  const widths: Record<string, number> = {};
  for (const [paneId, widthPx] of Object.entries(value.widths)) {
    if (!isFiniteNumber(widthPx)) {
      return null;
    }
    widths[paneId] = widthPx;
  }

  const collapsedPaneIds: string[] = [];
  for (const paneId of value.collapsedPaneIds) {
    if (typeof paneId !== "string") {
      return null;
    }
    collapsedPaneIds.push(paneId);
  }

  return { widths, collapsedPaneIds };
}

function readStoredTrailState(storageKey: string): WorkspacePaneTrailState | null {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue === null) {
      return null;
    }
    return parseWorkspacePaneTrailState(JSON.parse(storedValue));
  } catch (error: unknown) {
    console.warn("Failed to read workspace pane trail state:", error);
    return null;
  }
}

function writeStoredTrailState(storageKey: string, state: WorkspacePaneTrailState) {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ ...state, version: WORKSPACE_PANE_TRAIL_STORAGE_VERSION }),
    );
  } catch (error: unknown) {
    console.warn("Failed to write workspace pane trail state:", error);
  }
}

type WorkspacePaneTrailRuntime = {
  state: WorkspacePaneTrailState;
  /** Set by expandPane; the solver never auto-collapses this pane. */
  lastExpandedId: string | null;
  actions: WorkspacePaneTrailActions;
};

const WorkspacePaneTrailContext = createContext<WorkspacePaneTrailRuntime | null>(null);

/**
 * Lab persistence is localStorage-only for now; the storage key scopes one
 * durable trail per route family. Convex-backed persistence can replace this
 * behind the same actions once the layout survives its trial.
 */
export function WorkspacePaneTrailProvider({
  children,
  storageKey,
}: {
  children: ReactNode;
  storageKey: string;
}) {
  const [state, setState] = useState<WorkspacePaneTrailState>(EMPTY_TRAIL_STATE);
  const [lastExpandedId, setLastExpandedId] = useState<string | null>(null);
  const latestStateRef = useRef(state);
  const widthPersistTimeoutRef = useRef<number | null>(null);

  // Routes render on the server where localStorage does not exist; the first
  // client paint uses defaults and this layout effect swaps in the stored
  // trail before the browser paints.
  useLayoutEffect(() => {
    const storedState = readStoredTrailState(storageKey);
    if (storedState !== null) {
      latestStateRef.current = storedState;
      setState(storedState);
    }
  }, [storageKey]);

  const applyState = useCallback(
    (
      updateState: (currentState: WorkspacePaneTrailState) => WorkspacePaneTrailState,
      persistence: "immediate" | "width_deferred",
    ) => {
      const nextState = updateState(latestStateRef.current);
      latestStateRef.current = nextState;
      setState(nextState);

      if (widthPersistTimeoutRef.current !== null) {
        window.clearTimeout(widthPersistTimeoutRef.current);
        widthPersistTimeoutRef.current = null;
      }
      if (persistence === "immediate") {
        writeStoredTrailState(storageKey, nextState);
        return;
      }
      widthPersistTimeoutRef.current = window.setTimeout(() => {
        widthPersistTimeoutRef.current = null;
        writeStoredTrailState(storageKey, nextState);
      }, WIDTH_PERSIST_DELAY_MS);
    },
    [storageKey],
  );

  const actions = useMemo<WorkspacePaneTrailActions>(
    () => ({
      setPaneWidthPx: (paneId, widthPx) => {
        applyState(
          (currentState) => ({
            ...currentState,
            widths: { ...currentState.widths, [paneId]: Math.round(widthPx) },
          }),
          "width_deferred",
        );
      },
      collapsePane: (paneId) => {
        setLastExpandedId((current) => (current === paneId ? null : current));
        applyState(
          (currentState) => ({
            ...currentState,
            collapsedPaneIds: currentState.collapsedPaneIds.includes(paneId)
              ? currentState.collapsedPaneIds
              : [...currentState.collapsedPaneIds, paneId],
          }),
          "immediate",
        );
      },
      expandPane: (paneId) => {
        setLastExpandedId(paneId);
        applyState(
          (currentState) => ({
            ...currentState,
            collapsedPaneIds: currentState.collapsedPaneIds.filter((id) => id !== paneId),
          }),
          "immediate",
        );
      },
      setAllContextCollapsed: (paneIds, collapsed) => {
        setLastExpandedId(null);
        applyState(
          (currentState) => ({
            ...currentState,
            collapsedPaneIds: collapsed
              ? [...new Set([...currentState.collapsedPaneIds, ...paneIds])]
              : currentState.collapsedPaneIds.filter((id) => !paneIds.includes(id)),
          }),
          "immediate",
        );
      },
    }),
    [applyState],
  );

  const runtime = useMemo<WorkspacePaneTrailRuntime>(
    () => ({ state, lastExpandedId, actions }),
    [state, lastExpandedId, actions],
  );

  return (
    <WorkspacePaneTrailContext.Provider value={runtime}>
      {children}
    </WorkspacePaneTrailContext.Provider>
  );
}

export function useWorkspacePaneTrail(): WorkspacePaneTrailRuntime {
  const runtime = useContext(WorkspacePaneTrailContext);
  if (runtime === null) {
    throw new Error("useWorkspacePaneTrail requires a WorkspacePaneTrailProvider ancestor.");
  }
  return runtime;
}
