import type {
  ChangeEvent,
  ClipboardEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  SyntheticEvent,
} from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { includes } from "@noter-md/dependent";
import { readIsomorphicOrigin } from "@/lib/isomorphic";
import {
  readMatchingRouteAcceptedSearchKeys,
  readRouteAddressReadiness,
  type RouteAddressReadiness,
} from "@/routing/address";
import type { NoterRouteAccessViewer } from "@/routing/permissions";
import { openRouteAddressQuerySlot } from "@/routing/addressParts";
import {
  RETAINED_ROOT_SEARCH_KEYS,
  readCanonicalRouteAddressForRootSearch,
  validateRootRouteSearch,
} from "@/routeSearch/root";
import { isBrowserProductionPublicOrigin } from "@/lib/prodUiMode";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { api } from "../../../convex/_generated/api";
import {
  readCurrentRouteUrlEditorSuggestionIndex,
  readSuggestions,
  type Suggestion,
} from "./RouteUrlEditorSuggestions";
import {
  readActiveRouteEditorSuggestion,
  readNextRouteEditorSuggestionIndex,
  readRouteEditorSuggestionId,
  type RouteEditorSuggestionArrowKey,
} from "./RouteUrlEditorSuggestionNavigation";
import { readRouteEditorNavigationApi } from "./useNavigationControls";
import { keepState, runTransitionActions } from "./typedTransitionTable";
import { useTypedTransitionMachine } from "./useTypedTransitionMachine";
import type {
  TypedTransitionActionHandlerTable,
  TypedTransitionResult,
  TypedTransitionTable,
} from "./typedTransitionTable";

type RouteAddressSelection = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};

type RouteEditorSuggestionPreview = {
  source: "keyboard" | "pointer" | "touch";
  suggestionIndex: number;
  routeAddress: string;
  expectedRouteAddress: string;
};

/**
RouteEditorState stores route addresses, not full visible input values.

routeAddress while focused =
  focusMode === "suggestion" ? previewRoute.routeAddress : draftRouteAddress

focusMode = what currently owns the visible focused input.

`"editing"` means text editing owns it: typing, Backspace, selection, paste, and cut update
`draftRouteAddress` directly, and there is no active suggestion row.

`"suggestion"` means one suggestion row owns it: `previewRoute` changes the visible route address.
Input click, pointer mouseleave, Escape, and blur restore `draftRouteAddress` / `expectedRouteAddress`.
Enter or row click/tap commits the row's `selectedRouteAddress` into `draftRouteAddress`. This can differ
from `previewRoute.routeAddress`, such as when final value selection appends a trailing `&`.

draftRouteAddress = the editable route address while `kind` is `"focused"`. Starts with `/`, never includes
`prefix`.

previewRoute = currently previewed suggestion row. It changes the visible route address without
changing `draftRouteAddress`, so suggestions stay anchored to the text the user was editing.
`previewRoute.suggestionIndex` is the single current suggestion row. `previewRoute.source` says whether
pointer hover, keyboard navigation, or mobile touch scroll created it.

Mobile touch scroll also uses `previewRoute`, not `draftRouteAddress`. Example: `draftRouteAddress` is `/logo?`, the
user scrolls the fixed slate over `?top=sky-500`, and `previewRoute.routeAddress` becomes
`/logo?top=sky-500`. The visible input shows `/logo?top=sky-500`, but suggestions still come from
`/logo?` until the row is tapped. Tapping that row keeps `/logo?top=sky-500` and places the cursor
after `top=`. Tapping outside cancels the scroll preview and restores `/logo`.

expectedRouteAddress = the route address this focused state expects TanStack to report, and the
restore target when `previewRoute` is canceled. Blurred display reads
`committedRouteAddress` from TanStack, not this field.

Blurred state does not store `committedRouteAddress`. It renders `committedRouteAddress` from
TanStack.

Example focused state:

{
  kind: "focused",
  focusMode: "editing",
  prefix: "https://noter.md/",
  draftRouteAddress: "/logo?top=red-",
  expectedRouteAddress: "/logo",
  selection: { start: 22, end: 22, direction: "none" },
}

A partial query value can keep `draftRouteAddress` at `/logo?top=red-` while `expectedRouteAddress` stays
`/logo`.

Example keyboard preview:

{
  kind: "focused",
  focusMode: "suggestion",
  prefix: "https://noter.md/",
  draftRouteAddress: "/terms?top=red-",
  expectedRouteAddress: "/terms",
  previewRoute: {
    source: "keyboard",
    suggestionIndex: 2,
    routeAddress: "/privacy?top=red-",
    expectedRouteAddress: "/privacy",
  },
  selection: { start: 19, end: 19, direction: "none" },
}

Example blurred state:

{
  kind: "blurred",
  prefix: "https://noter.md/",
}
*/
export type RouteEditorState =
  | {
      kind: "blurred";
      prefix: string;
    }
  | {
      kind: "focused";
      focusMode: "editing";
      draftRouteAddress: string;
      expectedRouteAddress: string;
      prefix: string;
      selection: RouteAddressSelection;
    }
  | {
      kind: "focused";
      focusMode: "suggestion";
      draftRouteAddress: string;
      expectedRouteAddress: string;
      previewRoute: RouteEditorSuggestionPreview;
      prefix: string;
      selection: RouteAddressSelection;
    };

export type RouteEditorVmProps = {
  onDebugStateChange?: (state: RouteEditorState) => void;
  pageHashKeys: readonly string[];
};

type RouteEditorPreventNativeEditContext = {
  preventDefault: () => void;
};

type RouteEditorRouteActionContext = {
  replaceRoute: (routeAddress: string) => void;
};

type RouteEditorPushRouteContext = {
  pushRoute: (args: { baseRouteAddress: string; routeAddress: string }) => void;
};

type RouteEditorReplaceRouteContext = RouteEditorRouteActionContext & {
  readRouteAddressReadiness: (args: {
    currentRouteAddress: string;
    draftRouteAddress: string;
  }) => RouteAddressReadiness;
};

type RouteEditorInputChangeContext = RouteEditorReplaceRouteContext & RouteEditorPushRouteContext;

type RouteEditorSelectSuggestionContext = RouteEditorReplaceRouteContext &
  RouteEditorPushRouteContext;

type RouteEditorEvent =
  // React input `onChange` sends the visible input value after native editing
  // already ran. `nextInputValue` includes `prefix`; `nextSelection` is the
  // browser selection after that edit.
  | {
      type: "changedInput";
      nextInputValue: string;
      nextSelection: RouteAddressSelection;
      context: RouteEditorInputChangeContext;
    }
  // React input `onSelect` sends `selection` for the current `inputValue`.
  //
  // Example: `draftRouteAddress` is `/terms?top=red-`, then `previewRoute.routeAddress`
  // becomes `/privacy?top=red-`. The input visibly shows `previewRoute.routeAddress`,
  // but `draftRouteAddress` is still `/terms?top=red-` until `selectedSuggestion`.
  // Cursor indexes from `previewRoute.routeAddress` cannot be stored into
  // `selection` for `draftRouteAddress`.
  | {
      type: "changedSelection";
      selection: RouteAddressSelection;
    }
  // Input click while `focusMode` is already `"editing"`.
  //
  // Example: focusing `/terms?dev` creates `draftRouteAddress` `/terms?dev&` and places
  // `selection` after `&`. A later click inside `terms` must move `selection`
  // into the path so path suggestions show.
  | {
      type: "clickedFocusedInput";
      selection: RouteAddressSelection;
    }
  // Root `onBlur` when focus leaves the editor subtree.
  | {
      type: "lostEditorFocus";
      context: RouteEditorRouteActionContext;
    }
  // Input focus/click that starts editing from `"blurred"`. `committedRouteAddress`
  // is the TanStack route when the input becomes editable.
  | {
      type: "clickedInput";
      committedRouteAddress: string;
      selection: RouteAddressSelection;
    }
  // The physical input takes ownership back while already focused, such as an
  // input click or Left/Right/Home/End caret movement.
  //
  // Example: `draftRouteAddress` is `/terms?top=red-`, a mouse preview shows
  // `/privacy?top=red-`, and the user clicks back into the input. The preview is
  // canceled and editing resumes from `draftRouteAddress`.
  | {
      type: "resumedInputEditing";
      context: RouteEditorRouteActionContext;
      selection: RouteAddressSelection;
    }
  // Escape key while the input has focus. This asks the editor to close from the keyboard.
  | {
      type: "pressedEscape";
      context: RouteEditorRouteActionContext;
    }
  // Locked-prefix editing.
  // Plain Backspace would touch the locked prefix and may need synchronous preventDefault before
  // native editing runs.
  | {
      type: "requestedLockedPrefixBackspace";
      selection: RouteAddressSelection;
      context: RouteEditorPreventNativeEditContext;
    }
  // A native edit would change part of `prefix`. The FSM can change `selection`
  // first, then let the browser perform Delete, Cut, Paste, printable
  // replacement, or Mod+Backspace.
  | {
      type: "requestedEditableSelection";
      selection: RouteAddressSelection;
    }
  // User accepts a suggestion row by row mousedown/tap or Enter while the editor stays focused.
  //
  // Example: `draftRouteAddress` is `/terms?top=red-` and the user clicks the
  // `/privacy` path row or presses Enter on it. `draftRouteAddress` becomes
  // `/privacy?top=red-`, `focusMode` becomes `"editing"`, and `selection` moves
  // to `nextSelectionRouteIndex`.
  | {
      type: "selectedSuggestion";
      context: RouteEditorSelectSuggestionContext;
      nextSelectionRouteIndex: number;
      routeAddress: string;
    }
  // ArrowUp/ArrowDown moved the current suggestion row. The transition reads
  // the current `previewRoute.suggestionIndex` from FSM state, so fast key repeats
  // cannot lose a step by reading a stale React callback closure.
  | {
      type: "pressedSuggestionArrow";
      arrowKey: RouteEditorSuggestionArrowKey;
      context: RouteEditorReplaceRouteContext;
      suggestions: readonly Suggestion[];
    }
  // Pointer, keyboard, or touch scroll moved to a suggestion row. This sets
  // `previewRoute` without changing `draftRouteAddress`. `previewSelectionRouteIndex`
  // keeps the visible preview cursor at the start of the changed token, not at
  // the end of the preview text.
  | {
      type: "previewedSuggestion";
      context: RouteEditorReplaceRouteContext;
      previewSelectionRouteIndex: number;
      source: RouteEditorSuggestionPreview["source"];
      suggestionIndex: number;
      routeAddress: string;
    }
  // Pointer left the suggestion list. This clears `previewRoute` only when
  // `previewRoute.source` is `"pointer"`.
  | {
      type: "clearedPointerSuggestionPreview";
      context: RouteEditorRouteActionContext;
    }
  // TanStack `useLocation()` changed `committedRouteAddress`. It can match
  // `expectedRouteAddress`, match `previewRoute.expectedRouteAddress`, or be a route change from
  // outside this editor state.
  | {
      type: "changedCommittedRoute";
      committedRouteAddress: string;
    };

type RouteEditorAction =
  // `blurInput` and `preventNativeEdit` run DOM methods synchronously.
  | {
      brand: "blurInput";
    }
  | {
      brand: "preventNativeEdit";
      context: RouteEditorPreventNativeEditContext;
    }
  // `setInputSelection` writes `selection` back into the input.
  | {
      brand: "setInputSelection";
      selection: RouteAddressSelection;
      timing: "afterRender" | "sync";
    }
  // `replaceRoute` replaces the TanStack route with `routeAddress`.
  | {
      brand: "replaceRoute";
      routeAddress: string;
      context: RouteEditorRouteActionContext;
    }
  // `pushRoute` restores `baseRouteAddress` with replace, then pushes
  // `routeAddress`, so Back returns to the route before suggestion preview.
  | {
      brand: "pushRoute";
      baseRouteAddress: string;
      routeAddress: string;
      context: RouteEditorPushRouteContext;
    };

type RouteEditorActionHandlerTable = TypedTransitionActionHandlerTable<
  RouteEditorAction["brand"],
  RouteEditorAction
>;

type RouteEditorTransitionTable = TypedTransitionTable<
  RouteEditorState["kind"],
  RouteEditorEvent["type"],
  RouteEditorState,
  RouteEditorEvent,
  RouteEditorAction
>;

function readInputSelectionFromRouteIndex(
  prefix: string,
  routeIndex: number,
): RouteAddressSelection {
  const position = prefix.length + routeIndex - 1;

  return {
    direction: "none",
    end: position,
    start: position,
  };
}

/**
The blurred input renders `committedRouteAddress` such as `/terms`, but the
focused input renders `${prefix}terms`. Keep the user's selected route
position when focus swaps from the display input to the editable input.
*/
function readFocusedInputSelectionFromDisplaySelection(
  prefix: string,
  selection: RouteAddressSelection,
): RouteAddressSelection {
  const readFocusedInputPosition = (displayPosition: number) =>
    Math.max(prefix.length, prefix.length + displayPosition - 1);

  return {
    direction: selection.direction,
    end: readFocusedInputPosition(selection.end),
    start: readFocusedInputPosition(selection.start),
  };
}

/**
Focus adds a query marker before any hash.

Example: focusing `/logo/raster-seams?depth=2` creates draftRouteAddress
`/logo/raster-seams?depth=2&`. That empty `&` token should own suggestions
immediately, so selection moves to the end of draftRouteAddress.
*/
function readRouteAddressFocusedSelection(args: {
  draftRouteAddress: string;
  prefix: string;
  selection: RouteAddressSelection;
}): RouteAddressSelection {
  const querySlot = openRouteAddressQuerySlot(args.draftRouteAddress);
  if (querySlot.selectionRouteIndex === null) {
    return args.selection;
  }

  return readInputSelectionFromRouteIndex(args.prefix, querySlot.selectionRouteIndex);
}

function previewRouteEditorSuggestion(
  prev: Extract<RouteEditorState, { kind: "focused" }>,
  event: {
    context: RouteEditorReplaceRouteContext;
    previewSelectionRouteIndex: number;
    routeAddress: string;
    source: RouteEditorSuggestionPreview["source"];
    suggestionIndex: number;
  },
): TypedTransitionResult<RouteEditorState, RouteEditorAction> {
  // Example: `draftRouteAddress` is `/terms?top=red-`, then ArrowDown previews
  // `/privacy?top=red-`. The browser route may already be `/privacy`, but
  // the next preview still compares against `expectedRouteAddress`
  // (`/terms`) because `draftRouteAddress` is still the base text.
  const readiness = event.context.readRouteAddressReadiness({
    currentRouteAddress: prev.expectedRouteAddress,
    draftRouteAddress: event.routeAddress,
  });

  const expectedRouteAddress =
    readiness.kind === "local" ? prev.expectedRouteAddress : readiness.routeAddress;

  // Example: moving from the `/privacy` row to another row should compare
  // against `previewRoute.expectedRouteAddress` (`/privacy`), so we only call
  // replaceRoute when the preview route actually changes.
  const activeExpectedRouteAddress =
    prev.focusMode === "suggestion"
      ? prev.previewRoute.expectedRouteAddress
      : prev.expectedRouteAddress;

  // Example: previewing `/privacy` uses route index 1, so the cursor stays
  // after the shared `/`. Accepting the row can still move it to the end
  // through `nextSelectionRouteIndex`.
  const selection = readInputSelectionFromRouteIndex(prev.prefix, event.previewSelectionRouteIndex);
  const actions: RouteEditorAction[] = [
    { brand: "setInputSelection", selection, timing: "afterRender" },
  ];
  if (expectedRouteAddress !== activeExpectedRouteAddress) {
    actions.push({
      brand: "replaceRoute",
      routeAddress: expectedRouteAddress,
      context: event.context,
    });
  }

  return {
    actions,
    state: {
      kind: "focused",
      focusMode: "suggestion",
      draftRouteAddress: prev.draftRouteAddress,
      expectedRouteAddress: prev.expectedRouteAddress,
      previewRoute: {
        source: event.source,
        suggestionIndex: event.suggestionIndex,
        routeAddress: event.routeAddress,
        expectedRouteAddress,
      },
      prefix: prev.prefix,
      selection: prev.selection,
    },
  };
}

const routeEditorTransition: RouteEditorTransitionTable = {
  blurred: {
    clickedInput: (prev, event) => {
      const draftRouteAddress = openRouteAddressQuerySlot(event.committedRouteAddress).routeAddress;
      const selection = readRouteAddressFocusedSelection({
        draftRouteAddress,
        prefix: prev.prefix,
        selection: event.selection,
      });

      return {
        actions: [{ brand: "setInputSelection", selection, timing: "afterRender" }],
        state: {
          kind: "focused",
          focusMode: "editing",
          draftRouteAddress,
          expectedRouteAddress: event.committedRouteAddress,
          prefix: prev.prefix,
          selection,
        },
      };
    },
  },

  focused: {
    changedCommittedRoute: (prev, event) => {
      // Example 1: user types `/logo`, this FSM calls replaceRoute(`/logo`),
      // then TanStack reports `/logo`. That matches expectedRouteAddress, so
      // the editor stays focused.
      //
      // Example 2: draftRouteAddress is `/terms?top=red-`; previewing `/privacy`
      // visibly shows `/privacy?top=red-` and calls replaceRoute(`/privacy`).
      // TanStack reports `/privacy`, which matches
      // `previewRoute.expectedRouteAddress`, so `previewRoute` stays set.
      const routeChangeMatchesExpectedRoute =
        event.committedRouteAddress === prev.expectedRouteAddress;
      const routeChangeMatchesSuggestionRoute =
        prev.focusMode === "suggestion" &&
        event.committedRouteAddress === prev.previewRoute.expectedRouteAddress;
      if (routeChangeMatchesExpectedRoute || routeChangeMatchesSuggestionRoute) {
        return keepState(prev);
      }

      // Example: while editing, Back/Forward or another app link changes the
      // route to `/home`. That matches neither `expectedRouteAddress` nor
      // `previewRoute.expectedRouteAddress`, so close the editor and show
      // `committedRouteAddress`.
      return {
        actions: [{ brand: "blurInput" }],
        state: {
          kind: "blurred",
          prefix: prev.prefix,
        },
      };
    },

    changedInput: (prev, event) => {
      // If `nextInputValue` no longer starts with `prefix`, keep `prev` so the
      // controlled input restores `draftRouteAddress` or
      // `previewRoute.routeAddress`.
      if (!event.nextInputValue.startsWith(prev.prefix)) {
        return keepState(prev);
      }

      const draftRouteAddress = `/${event.nextInputValue.slice(prev.prefix.length)}`;

      // Example: draftRouteAddress is `/terms?top=red-`,
      // `previewRoute.routeAddress` visibly shows `/privacy?top=red-`, and
      // the browser route is already `/privacy`. Once the user types, this edit
      // belongs to draftRouteAddress again, so classify from prev.expectedRouteAddress
      // (`/terms`), not the browser route.
      const readiness = event.context.readRouteAddressReadiness({
        currentRouteAddress: prev.expectedRouteAddress,
        draftRouteAddress: draftRouteAddress,
      });

      const actions: RouteEditorAction[] = [];
      let expectedRouteAddress = prev.expectedRouteAddress;

      // `local` updates only `draftRouteAddress`, such as `/logo?dar` while
      // `expectedRouteAddress` remains `/logo`. A ready route means the user
      // reached a new canonical URL while editing, so it creates a history entry.
      if (readiness.kind !== "local") {
        expectedRouteAddress = readiness.routeAddress;
        actions.push({
          brand: "pushRoute",
          baseRouteAddress: prev.expectedRouteAddress,
          routeAddress: readiness.routeAddress,
          context: event.context,
        });
      } else if (
        prev.focusMode === "suggestion" &&
        prev.previewRoute.expectedRouteAddress !== prev.expectedRouteAddress
      ) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "focused",
          focusMode: "editing",
          draftRouteAddress,
          expectedRouteAddress,
          prefix: prev.prefix,
          selection: event.nextSelection,
        },
      };
    },

    changedSelection: (prev, event) => {
      // Example: draftRouteAddress is `/terms?top=red-`, `previewRoute.routeAddress` visibly
      // shows `/privacy?top=red-`, and onSelect reports a cursor inside
      // `/privacy`. Suggestions still use `draftRouteAddress`, so `selection` from
      // `previewRoute` is ignored.
      if (prev.focusMode === "suggestion") {
        return keepState(prev);
      }

      return keepState({
        kind: "focused",
        focusMode: "editing",
        draftRouteAddress: prev.draftRouteAddress,
        expectedRouteAddress: prev.expectedRouteAddress,
        prefix: prev.prefix,
        selection: event.selection,
      });
    },

    clickedFocusedInput: (prev, event) => {
      if (prev.focusMode !== "editing") {
        return keepState(prev);
      }

      return {
        actions: [],
        state: {
          kind: "focused",
          focusMode: "editing",
          draftRouteAddress: prev.draftRouteAddress,
          expectedRouteAddress: prev.expectedRouteAddress,
          prefix: prev.prefix,
          selection: event.selection,
        },
      };
    },

    resumedInputEditing: (prev, event) => {
      if (prev.focusMode === "editing") {
        return keepState({
          kind: "focused",
          focusMode: "editing",
          draftRouteAddress: prev.draftRouteAddress,
          expectedRouteAddress: prev.expectedRouteAddress,
          prefix: prev.prefix,
          selection: event.selection,
        });
      }

      const actions: RouteEditorAction[] = [
        {
          brand: "setInputSelection",
          selection: prev.selection,
          timing: "afterRender",
        },
      ];
      if (prev.previewRoute.expectedRouteAddress !== prev.expectedRouteAddress) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "focused",
          focusMode: "editing",
          draftRouteAddress: prev.draftRouteAddress,
          expectedRouteAddress: prev.expectedRouteAddress,
          prefix: prev.prefix,
          selection: prev.selection,
        },
      };
    },

    lostEditorFocus: (prev, event) => {
      // Root blur leaves `"focused"`. If `previewRoute.expectedRouteAddress`
      // replaced the route through pointer, keyboard, or touch-scroll preview,
      // restore `prev.expectedRouteAddress` before the blurred editor reads
      // `committedRouteAddress`. Only selectedSuggestion commits `previewRoute`.
      const actions: RouteEditorAction[] = [];
      if (
        prev.focusMode === "suggestion" &&
        prev.previewRoute.expectedRouteAddress !== prev.expectedRouteAddress
      ) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "blurred",
          prefix: prev.prefix,
        },
      };
    },

    clearedPointerSuggestionPreview: (prev, event) => {
      // Listbox mouseleave can fire while `focusMode` is already `"editing"` or
      // while keyboard preview is active. Only pointer preview is cleared by
      // this event.
      if (prev.focusMode !== "suggestion" || prev.previewRoute.source !== "pointer") {
        return keepState(prev);
      }

      const actions: RouteEditorAction[] = [];
      // If `previewRoute.expectedRouteAddress` replaced the route, restore
      // `expectedRouteAddress` before returning to `focusMode: "editing"`.
      if (prev.previewRoute.expectedRouteAddress !== prev.expectedRouteAddress) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "focused",
          focusMode: "editing",
          draftRouteAddress: prev.draftRouteAddress,
          expectedRouteAddress: prev.expectedRouteAddress,
          prefix: prev.prefix,
          selection: prev.selection,
        },
      };
    },

    // Escape changes `kind` from `"focused"` to `"blurred"`. If `previewRoute`
    // replaced the route, restore `expectedRouteAddress`; otherwise the route
    // is already what the focused state expected.
    pressedEscape: (prev, event) => {
      const actions: RouteEditorAction[] = [{ brand: "blurInput" }];
      if (
        prev.focusMode === "suggestion" &&
        prev.previewRoute.expectedRouteAddress !== prev.expectedRouteAddress
      ) {
        actions.push({
          brand: "replaceRoute",
          routeAddress: prev.expectedRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "blurred",
          prefix: prev.prefix,
        },
      };
    },

    pressedSuggestionArrow: (prev, event) => {
      const activeSuggestionIndex =
        prev.focusMode === "suggestion" ? prev.previewRoute.suggestionIndex : null;
      const nextSuggestionIndex = readNextRouteEditorSuggestionIndex({
        activeSuggestionIndex,
        arrowKey: event.arrowKey,
        suggestionCount: event.suggestions.length,
      });
      if (nextSuggestionIndex === null) {
        return keepState(prev);
      }

      const suggestion = event.suggestions.at(nextSuggestionIndex);
      if (!suggestion) {
        return keepState(prev);
      }

      return previewRouteEditorSuggestion(prev, {
        context: event.context,
        previewSelectionRouteIndex: suggestion.previewSelectionRouteIndex,
        routeAddress: suggestion.previewRouteAddress,
        source: "keyboard",
        suggestionIndex: nextSuggestionIndex,
      });
    },

    previewedSuggestion: (prev, event) => {
      return previewRouteEditorSuggestion(prev, event);
    },

    // Runs before native Delete, printable replacement, Cut, Paste, and Ctrl/Meta+Backspace.
    // Move the affected range onto editable route text only; the browser still mutates the input,
    // fires onChange, handles clipboard contents, and owns the undo/redo entry.
    requestedEditableSelection: (prev, event) => {
      const lockedPrefixEnd = prev.prefix.length;
      const selection = {
        direction: "none" as const,
        end: Math.max(event.selection.end, lockedPrefixEnd),
        start: lockedPrefixEnd,
      };

      return {
        actions: [{ brand: "setInputSelection", selection, timing: "sync" }],
        state: prev,
      };
    },

    // Plain Backspace needs a separate path: a collapsed caret at prefix.length has no editable
    // selection, so native Backspace would remove the locked prefix character to the left.
    // If clamping leaves selected route text, keep default Backspace native; prevent only the empty
    // boundary no-op.
    requestedLockedPrefixBackspace: (prev, event) => {
      const lockedPrefixEnd = prev.prefix.length;
      const selection = {
        direction: "none" as const,
        end: Math.max(event.selection.end, lockedPrefixEnd),
        start: lockedPrefixEnd,
      };

      const actions: RouteEditorAction[] = [
        { brand: "setInputSelection", selection, timing: "sync" },
      ];
      if (selection.start === selection.end) {
        actions.push({
          brand: "preventNativeEdit",
          context: event.context,
        });
      }

      return {
        actions,
        state: prev,
      };
    },

    selectedSuggestion: (prev, event) => {
      // Suggestion mousedown prevents native click handling to keep focus, so
      // `nextSelectionRouteIndex` is the reliable source for `selection`.
      // Row click/tap/Enter is the only place suggestion preview becomes the
      // next `draftRouteAddress`.
      const selection = readInputSelectionFromRouteIndex(
        prev.prefix,
        event.nextSelectionRouteIndex,
      );
      const actions: RouteEditorAction[] = [
        { brand: "setInputSelection", selection, timing: "afterRender" },
      ];
      let expectedRouteAddress = prev.expectedRouteAddress;
      let selectedReadyRouteAddress: string | null = null;

      // If `previewRoute.routeAddress` is the selected `routeAddress`, reuse
      // `previewRoute.expectedRouteAddress`; `previewedSuggestion` already ran the
      // readiness check.
      if (
        prev.focusMode === "suggestion" &&
        prev.previewRoute.routeAddress === event.routeAddress
      ) {
        expectedRouteAddress = prev.previewRoute.expectedRouteAddress;
        selectedReadyRouteAddress = prev.previewRoute.expectedRouteAddress;
      } else {
        // Without a matching `previewRoute`, classify `event.routeAddress` now and
        // push the route only when it is not `local`.
        const readiness = event.context.readRouteAddressReadiness({
          currentRouteAddress: prev.expectedRouteAddress,
          draftRouteAddress: event.routeAddress,
        });
        if (readiness.kind !== "local") {
          expectedRouteAddress = readiness.routeAddress;
          selectedReadyRouteAddress = readiness.routeAddress;
        } else if (
          prev.focusMode === "suggestion" &&
          prev.previewRoute.expectedRouteAddress !== prev.expectedRouteAddress
        ) {
          // Example: a future row may preview a route-ready value while selecting a local draft.
          // In that case, restore `expectedRouteAddress` instead of leaving the browser on a route
          // that the selected draft no longer represents.
          actions.push({
            brand: "replaceRoute",
            routeAddress: prev.expectedRouteAddress,
            context: event.context,
          });
        }
      }

      if (
        selectedReadyRouteAddress !== null &&
        selectedReadyRouteAddress !== prev.expectedRouteAddress
      ) {
        actions.push({
          brand: "pushRoute",
          baseRouteAddress: prev.expectedRouteAddress,
          routeAddress: selectedReadyRouteAddress,
          context: event.context,
        });
      }

      return {
        actions,
        state: {
          kind: "focused",
          focusMode: "editing",
          draftRouteAddress: event.routeAddress,
          expectedRouteAddress,
          prefix: prev.prefix,
          selection,
        },
      };
    },
  },
};

function readRouteAddressSelection(input: HTMLInputElement): RouteAddressSelection {
  const fallbackPosition = input.value.length;

  return {
    direction: includes(["forward", "backward", "none"], input.selectionDirection)
      ? input.selectionDirection
      : "none",
    end: input.selectionEnd ?? input.selectionStart ?? fallbackPosition,
    start: input.selectionStart ?? fallbackPosition,
  };
}

function readRouteAddressFromRouteHref(routeHref: string): string {
  const url = new URL(routeHref, new URL(readIsomorphicOrigin()));
  return `${url.pathname}${url.search}${url.hash}`;
}

function readNavigationEventType(event: Event): string | null {
  if (!("navigationType" in event)) {
    return null;
  }

  return typeof event.navigationType === "string" ? event.navigationType : null;
}

function restoreBrowserEntryIfShowingUnappliedSuggestionPreview(state: RouteEditorState) {
  if (
    state.kind !== "focused" ||
    state.focusMode !== "suggestion" ||
    state.previewRoute.expectedRouteAddress === state.expectedRouteAddress
  ) {
    return;
  }

  if (
    readRouteAddressFromRouteHref(window.location.href) !== state.previewRoute.expectedRouteAddress
  ) {
    return;
  }

  window.history.replaceState(window.history.state, "", state.expectedRouteAddress);
}

/**
TanStack retained root search keeps keys such as `dev` unless navigation sends
an own `undefined` value for the removed key.

Example: current `/terms?dev`, next `/logo` must send `{ dev: undefined }`
so the visible browser route becomes `/logo`, not `/logo?dev`.
*/
function readRouteEditorExactSearch(args: {
  currentRouteAddress: string;
  nextRouteAddress: string;
  origin: string;
}): Record<string, unknown> {
  const appOrigin = new URL(args.origin);
  const currentUrl = new URL(args.currentRouteAddress, appOrigin);
  const nextUrl = new URL(args.nextRouteAddress, appOrigin);
  const nextSearch: Record<string, unknown> = {
    ...(nextUrl.pathname === "/"
      ? validateRootRouteSearch(parseTanStackSearch(nextUrl.search))
      : parseTanStackSearch(nextUrl.search)),
  };

  for (const key of RETAINED_ROOT_SEARCH_KEYS) {
    if (currentUrl.searchParams.has(key) && !nextUrl.searchParams.has(key)) {
      nextSearch[key] = undefined;
    }
  }

  return nextSearch;
}

function readRouteEditorNavigationOptions(args: {
  currentRouteAddress: string;
  nextRouteAddress: string;
  origin: string;
}) {
  const currentUrl = new URL(args.currentRouteAddress, args.origin);
  const nextUrl = new URL(args.nextRouteAddress, args.origin);

  return {
    hash: nextUrl.hash.replace(/^#/, ""),
    search: () =>
      readRouteEditorExactSearch({
        currentRouteAddress: args.currentRouteAddress,
        nextRouteAddress: args.nextRouteAddress,
        origin: args.origin,
      }),
    ...(currentUrl.pathname === nextUrl.pathname ? { resetScroll: false } : {}),
    to: nextUrl.pathname,
  };
}

export function useRouteEditorVm({ onDebugStateChange, pageHashKeys }: RouteEditorVmProps) {
  const router = useRouter();
  const location = useLocation();

  const viewerAccess = useQuery(api.users.currentViewerAccess);
  const routeAccessViewer = useMemo<NoterRouteAccessViewer>(
    () => ({ accessKeys: viewerAccess?.accessKeys ?? ["access_public"] }),
    [viewerAccess],
  );

  const origin = useMemo(readIsomorphicOrigin, []);
  const prefix = useMemo(() => `${origin}/`, [origin]);

  const committedRouteAddress = useMemo(
    () => readRouteAddressFromRouteHref(location.href),
    [location.href],
  );

  const inputId = useId();
  const listboxId = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const pendingRenderedInputSelectionRef = useRef<RouteAddressSelection | null>(null);

  const runRouteEditorTransitionActions = useCallback((actions: RouteEditorAction[]) => {
    const actionHandlers: RouteEditorActionHandlerTable = {
      blurInput: () => {
        inputRef.current?.blur();
      },
      preventNativeEdit: (action) => {
        action.context.preventDefault();
      },
      pushRoute: (action) => {
        action.context.pushRoute({
          baseRouteAddress: action.baseRouteAddress,
          routeAddress: action.routeAddress,
        });
      },
      replaceRoute: (action) => {
        action.context.replaceRoute(action.routeAddress);
      },
      setInputSelection: (action) => {
        if (action.timing === "afterRender") {
          pendingRenderedInputSelectionRef.current = action.selection;
          return;
        }

        inputRef.current?.setSelectionRange(
          action.selection.start,
          action.selection.end,
          action.selection.direction,
        );
      },
    };

    runTransitionActions(actionHandlers, actions);
  }, []);

  const { state, sendEvent } = useTypedTransitionMachine<
    RouteEditorState["kind"],
    RouteEditorEvent["type"],
    RouteEditorAction["brand"],
    RouteEditorState,
    RouteEditorEvent,
    RouteEditorAction
  >({
    initialState: {
      kind: "blurred",
      prefix,
    },
    transitionTable: routeEditorTransition,
    runActions: runRouteEditorTransitionActions,
    onDebugStateChange,
  });

  /**
Turns TanStack Router `committedRouteAddress` changes into the FSM event `changedCommittedRoute`.

FSM part: `routeEditorTransition.focused.changedCommittedRoute` decides whether the route matches
`expectedRouteAddress`, matches `previewRoute.expectedRouteAddress`, or came from outside the editor.

Effect part: `committedRouteAddress` comes from TanStack `useLocation()`. The FSM cannot subscribe
to that external source by itself, and React cannot call `sendEvent` during render.

Example: typing `/logo` pushes `/logo`; TanStack reports `/logo`; the event matches
`expectedRouteAddress`, so focus stays. If Back/Forward reports `/home` while
`expectedRouteAddress` is `/logo`, the event is external and the FSM blurs.
*/
  useEffect(() => {
    sendEvent({
      type: "changedCommittedRoute",
      committedRouteAddress,
    });
  }, [committedRouteAddress, sendEvent]);

  /**
Turns outside page scroll into the same state transition as clicking outside.

FSM part: `lostEditorFocus` already defines what blur means for editing and suggestion previews.

Effect part: wheel/touch scroll outside the editor does not reliably move DOM focus, especially on
mobile. Calling `blur()` lets the normal root `onBlur` handler send `lostEditorFocus`.

Example: input shows local draft `/logo?leftFace=s`, browser route is still `/logo`, and the user
scrolls the page underneath. The input blurs, suggestions close, and the blurred display reads the
committed `/logo` route.
*/
  useEffect(() => {
    if (state.kind !== "focused" || typeof window === "undefined") {
      return;
    }

    const blurInputOnOutsideScroll = (event: Event) => {
      const root = rootRef.current;
      const target = event.target;
      if (root && target instanceof Node && root.contains(target)) {
        return;
      }

      inputRef.current?.blur();
    };

    window.addEventListener("touchmove", blurInputOnOutsideScroll, true);
    window.addEventListener("wheel", blurInputOnOutsideScroll, true);

    return () => {
      window.removeEventListener("touchmove", blurInputOnOutsideScroll, true);
      window.removeEventListener("wheel", blurInputOnOutsideScroll, true);
    };
  }, [state.kind]);

  /**
Restores an unapplied `previewRoute` route before browser Back/Forward leaves the current entry.

FSM part: `focusMode: "suggestion"` means the visible input can come from `previewRoute.routeAddress`
while the base editable text remains `draftRouteAddress`.

Effect part: browser Back/Forward can happen through toolbar buttons, gestures, or keyboard
shortcuts outside our input handlers. This has to run on the Navigation API `navigate` event before
the browser traverses history; a normal FSM event after traversal would be too late.

Example: start `/logo`, focus the editor, touch-scroll to preview `?top=sky-500`, then press Back.
Before leaving the entry, this rewrites the entry from `/logo?top=sky-500` back to
`expectedRouteAddress` (`/logo`), so Forward does not return to an unapplied suggestion.
  */
  useEffect(() => {
    const currentEntryIsUnappliedSuggestionPreview =
      state.kind === "focused" &&
      state.focusMode === "suggestion" &&
      state.previewRoute.expectedRouteAddress !== state.expectedRouteAddress;

    if (!currentEntryIsUnappliedSuggestionPreview) {
      return;
    }

    const restorePreviewEntryBeforeBrowserLeavesIt = (event: Event) => {
      if (readNavigationEventType(event) === "traverse") {
        // `previewRoute.expectedRouteAddress` is visible only until the row is applied. If Back or
        // Forward happens while that preview owns the current entry, put the entry back to
        // `expectedRouteAddress` first.
        restoreBrowserEntryIfShowingUnappliedSuggestionPreview(state);
      }
    };

    const navigation = readRouteEditorNavigationApi();
    navigation?.addEventListener("navigate", restorePreviewEntryBeforeBrowserLeavesIt);

    return () => {
      navigation?.removeEventListener("navigate", restorePreviewEntryBeforeBrowserLeavesIt);
    };
  }, [state]);

  const replaceRoute = useCallback(
    (routeAddress: string) => {
      void router.navigate({
        ...readRouteEditorNavigationOptions({
          currentRouteAddress: committedRouteAddress,
          nextRouteAddress: routeAddress,
          origin,
        }),
        replace: true,
      });
    },
    [committedRouteAddress, origin, router],
  );

  const pushRoute = useCallback(
    ({ baseRouteAddress, routeAddress }: { baseRouteAddress: string; routeAddress: string }) => {
      if (readRouteAddressFromRouteHref(window.location.href) !== baseRouteAddress) {
        // Suggestion preview can replace this browser entry before the user accepts a row. Put the
        // entry back to `baseRouteAddress` before pushing, so Back returns to the focused base route.
        // Plain typing normally leaves the browser on `baseRouteAddress`, so it skips this restore.
        window.history.replaceState(window.history.state, "", baseRouteAddress);
      }

      router.history.push(routeAddress);
    },
    [router],
  );

  /**
Refresh reloads the browser page, so React cannot wait for a normal blur event to restore preview
state first.

Example: `draftRouteAddress` is `/terms?top=red-`, ArrowDown previews `/privacy?top=red-`, and the user
clicks Refresh. Replace the current browser entry back to `expectedRouteAddress` (`/terms`) before
reload, so an unapplied suggestion preview does not become durable.
*/
  const refreshPage = useCallback(() => {
    restoreBrowserEntryIfShowingUnappliedSuggestionPreview(state);
    window.location.reload();
  }, [state]);

  const readRouteAddressReadinessForRoute = useCallback(
    (args: { currentRouteAddress: string; draftRouteAddress: string }) =>
      readRouteAddressReadiness({
        currentRouteAddress: args.currentRouteAddress,
        draftRouteAddress: args.draftRouteAddress,
        origin,
        readCanonicalRouteAddress: (routeAddress) => {
          const builtLocation = router.buildLocation({
            ...readRouteEditorNavigationOptions({
              currentRouteAddress: committedRouteAddress,
              nextRouteAddress: routeAddress,
              origin,
            }),
            _includeValidateSearch: true,
          });
          const canonicalRouteAddress = readCanonicalRouteAddressForRootSearch({
            acceptedSearchKeys: readMatchingRouteAcceptedSearchKeys(
              builtLocation.pathname,
              router.routesByPath,
            ),
            hash: builtLocation.hash,
            pathname: builtLocation.pathname,
            searchStr: builtLocation.searchStr,
            stripProdUi: isBrowserProductionPublicOrigin(),
          });

          return canonicalRouteAddress ?? builtLocation.href;
        },
        routesByPath: router.routesByPath,
        viewer: routeAccessViewer,
      }),
    [committedRouteAddress, origin, routeAccessViewer, router],
  );

  const handleDisplayInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      sendEvent({
        type: "clickedInput",
        committedRouteAddress,
        selection: readFocusedInputSelectionFromDisplaySelection(
          prefix,
          readRouteAddressSelection(event.currentTarget),
        ),
      });
    },
    [committedRouteAddress, prefix, sendEvent],
  );

  const handleDisplayInputClick = useCallback(
    (event: MouseEvent<HTMLInputElement>) => {
      if (event.currentTarget.value.startsWith(prefix)) {
        sendEvent({
          type: "clickedFocusedInput",
          selection: readRouteAddressSelection(event.currentTarget),
        });
        return;
      }

      sendEvent({
        type: "clickedInput",
        committedRouteAddress,
        selection: readFocusedInputSelectionFromDisplaySelection(
          prefix,
          readRouteAddressSelection(event.currentTarget),
        ),
      });
    },
    [committedRouteAddress, prefix, sendEvent],
  );

  const handleDisplayInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      sendEvent({
        type: "clickedInput",
        committedRouteAddress,
        selection: readFocusedInputSelectionFromDisplaySelection(
          prefix,
          readRouteAddressSelection(event.currentTarget),
        ),
      });
    },
    [committedRouteAddress, prefix, sendEvent],
  );

  const inputAlreadyOwnsTextEditing = state.kind === "focused" && state.focusMode === "editing";
  const suggestionOwnsInput = state.kind === "focused" && state.focusMode === "suggestion";

  const handleInputClick = useCallback(
    (event: MouseEvent<HTMLInputElement>) => {
      if (inputAlreadyOwnsTextEditing) {
        sendEvent({
          type: "clickedFocusedInput",
          selection: readRouteAddressSelection(event.currentTarget),
        });
        return;
      }

      sendEvent({
        type: "resumedInputEditing",
        context: {
          replaceRoute,
        },
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [inputAlreadyOwnsTextEditing, replaceRoute, sendEvent],
  );

  const handleRootBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
        return;
      }

      // Root blur is not a pointer event; suggestion clicks keep focus inside the
      // editor by preventing native mousedown blur.
      sendEvent({
        type: "lostEditorFocus",
        context: {
          replaceRoute,
        },
      });
    },
    [replaceRoute, sendEvent],
  );

  const clampSelectionToRouteText = useCallback(
    (input: HTMLInputElement) => {
      const selection = readRouteAddressSelection(input);
      if (selection.start >= prefix.length || selection.end <= prefix.length) {
        return;
      }

      sendEvent({
        type: "requestedEditableSelection",
        selection,
      });
    },
    [prefix.length, sendEvent],
  );

  const handleInputCut = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      clampSelectionToRouteText(event.currentTarget);
    },
    [clampSelectionToRouteText],
  );

  const handleInputPaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      clampSelectionToRouteText(event.currentTarget);
    },
    [clampSelectionToRouteText],
  );

  const handleInputSelect = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      sendEvent({
        type: "changedSelection",
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [sendEvent],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextSelection = readRouteAddressSelection(event.currentTarget);

      sendEvent({
        type: "changedInput",
        nextInputValue: event.currentTarget.value,
        nextSelection,
        context: {
          pushRoute,
          readRouteAddressReadiness: readRouteAddressReadinessForRoute,
          replaceRoute,
        },
      });
    },
    [pushRoute, readRouteAddressReadinessForRoute, replaceRoute, sendEvent],
  );

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      sendEvent({
        type: "selectedSuggestion",
        context: {
          pushRoute,
          readRouteAddressReadiness: readRouteAddressReadinessForRoute,
          replaceRoute,
        },
        nextSelectionRouteIndex: suggestion.nextSelectionRouteIndex,
        routeAddress: suggestion.selectedRouteAddress,
      });
    },
    [pushRoute, readRouteAddressReadinessForRoute, replaceRoute, sendEvent],
  );

  const handleSuggestionMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>, suggestion: Suggestion) => {
      event.preventDefault();
      selectSuggestion(suggestion);
    },
    [selectSuggestion],
  );

  const handleSuggestionPointerMove = useCallback(
    (suggestion: Suggestion, suggestionIndex: number) => {
      sendEvent({
        type: "previewedSuggestion",
        context: {
          readRouteAddressReadiness: readRouteAddressReadinessForRoute,
          replaceRoute,
        },
        previewSelectionRouteIndex: suggestion.previewSelectionRouteIndex,
        source: "pointer",
        suggestionIndex,
        routeAddress: suggestion.previewRouteAddress,
      });
    },
    [readRouteAddressReadinessForRoute, replaceRoute, sendEvent],
  );

  const previewTouchSuggestion = useCallback(
    (suggestion: Suggestion, suggestionIndex: number) => {
      sendEvent({
        type: "previewedSuggestion",
        context: {
          readRouteAddressReadiness: readRouteAddressReadinessForRoute,
          replaceRoute,
        },
        previewSelectionRouteIndex: suggestion.previewSelectionRouteIndex,
        source: "touch",
        suggestionIndex,
        routeAddress: suggestion.previewRouteAddress,
      });
    },
    [readRouteAddressReadinessForRoute, replaceRoute, sendEvent],
  );

  const handleSuggestionsMouseLeave = useCallback(() => {
    sendEvent({
      type: "clearedPointerSuggestionPreview",
      context: {
        replaceRoute,
      },
    });
  }, [replaceRoute, sendEvent]);

  const visibleRouteAddress =
    state.kind === "blurred"
      ? committedRouteAddress
      : state.focusMode === "suggestion"
        ? state.previewRoute.routeAddress
        : state.draftRouteAddress;

  const suggestionsRouteAddress =
    state.kind === "blurred" ? committedRouteAddress : state.draftRouteAddress;

  const inputValue = `${state.prefix}${visibleRouteAddress.slice(1)}`;

  /**
Runs queued `setInputSelection` actions whose `timing` is `"afterRender"`.

FSM part: transitions decide the exact `selection` to set and return a `setInputSelection` action.

Effect part: DOM selection is imperative. When a transition also changes `inputValue`, the cursor
must be written after React commits that value; writing before render can be overwritten by the
controlled input update.

Example: selecting `/logo` changes `draftRouteAddress` to `/logo?` and queues the cursor before `?`, so the
next suggestions come from the path/query boundary. Prefix-protection still uses synchronous
`setInputSelection`; this layout effect only drains after-render cursor actions.
*/
  useLayoutEffect(() => {
    const selection = pendingRenderedInputSelectionRef.current;
    pendingRenderedInputSelectionRef.current = null;

    if (!selection) {
      return;
    }

    const input = inputRef.current;
    if (!input || document.activeElement !== input) {
      return;
    }

    if (
      input.selectionStart === selection.start &&
      input.selectionEnd === selection.end &&
      input.selectionDirection === selection.direction
    ) {
      return;
    }

    // Some transitions change the controlled input value and the cursor together. Set that cursor
    // after React renders the value; prefix-protection still uses synchronous `setInputSelection`
    // actions before native editing runs.
    input.setSelectionRange(selection.start, selection.end, selection.direction);
  }, [inputValue, state]);

  const suggestionSelection = state.kind === "focused" ? state.selection : null;

  const suggestions = useMemo(
    () =>
      readSuggestions({
        currentRouteAddress: committedRouteAddress,
        pageHashKeys,
        prefix: state.prefix,
        routeAddress: suggestionsRouteAddress,
        routesByPath: router.routesByPath,
        selection: suggestionSelection,
        viewer: routeAccessViewer,
      }),
    [
      router.routesByPath,
      committedRouteAddress,
      pageHashKeys,
      state.prefix,
      suggestionSelection,
      suggestionsRouteAddress,
      routeAccessViewer,
    ],
  );

  const suggestionsVisible = state.kind === "focused" && suggestions.length > 0;
  const activeSuggestionIndex =
    state.kind === "focused" && state.focusMode === "suggestion"
      ? state.previewRoute.suggestionIndex
      : null;

  const activeSuggestion = useMemo(
    () =>
      readActiveRouteEditorSuggestion({
        activeSuggestionIndex,
        listboxId,
        suggestions,
      }),
    [activeSuggestionIndex, listboxId, suggestions],
  );

  const currentSuggestionIndex =
    state.kind === "focused" && state.focusMode === "editing"
      ? readCurrentRouteUrlEditorSuggestionIndex({
          prefix: state.prefix,
          routeAddress: suggestionsRouteAddress,
          selection: suggestionSelection,
          suggestions,
        })
      : null;

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (suggestions.length === 0) {
          return;
        }

        event.preventDefault();

        sendEvent({
          type: "pressedSuggestionArrow",
          arrowKey: event.key,
          context: {
            readRouteAddressReadiness: readRouteAddressReadinessForRoute,
            replaceRoute,
          },
          suggestions,
        });
        return;
      }

      // Enter commits the currently previewed suggestion. Without an
      // `activeSuggestion`, normal form submit remains prevented by the form.
      if (event.key === "Enter" && activeSuggestion) {
        event.preventDefault();

        sendEvent({
          type: "selectedSuggestion",
          context: {
            pushRoute,
            readRouteAddressReadiness: readRouteAddressReadinessForRoute,
            replaceRoute,
          },
          nextSelectionRouteIndex: activeSuggestion.suggestion.nextSelectionRouteIndex,
          routeAddress: activeSuggestion.suggestion.selectedRouteAddress,
        });
        return;
      }

      // Prefix-protection keys stay separate from suggestion navigation so
      // native edit behavior remains browser-owned where possible.
      if ((event.metaKey || event.ctrlKey) && event.key === "Backspace") {
        sendEvent({
          type: "requestedEditableSelection",
          selection: readRouteAddressSelection(event.currentTarget),
        });
        return;
      }

      if (event.key === "Backspace") {
        const selection = readRouteAddressSelection(event.currentTarget);
        const lockedPrefixEnd = prefix.length;

        const backspaceWouldDeleteLockedPrefix =
          selection.start < lockedPrefixEnd ||
          (selection.start === lockedPrefixEnd && selection.end === lockedPrefixEnd);

        // Normal editable Backspace stays native so key-repeat undo grouping remains browser-owned.
        if (!backspaceWouldDeleteLockedPrefix) {
          return;
        }

        sendEvent({
          type: "requestedLockedPrefixBackspace",
          selection,
          context: {
            preventDefault: () => {
              event.preventDefault();
            },
          },
        });
        return;
      }

      if (event.key === "Delete") {
        clampSelectionToRouteText(event.currentTarget);
        return;
      }

      // Printable keys replace the current selection natively; if that selection starts inside
      // the locked URL prefix, clamp it first so only route text is replaced.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        clampSelectionToRouteText(event.currentTarget);
        return;
      }

      // `previewRoute` does not move focus to the suggestion row, so Escape still
      // arrives from the input.
      if (event.key === "Escape") {
        sendEvent({
          type: "pressedEscape",
          context: {
            replaceRoute,
          },
        });
      }
    },
    [
      activeSuggestion,
      clampSelectionToRouteText,
      prefix.length,
      pushRoute,
      readRouteAddressReadinessForRoute,
      replaceRoute,
      sendEvent,
      suggestions,
    ],
  );

  const handleInputKeyUp = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "End" &&
        event.key !== "Home"
      ) {
        return;
      }

      if (suggestionOwnsInput) {
        sendEvent({
          type: "resumedInputEditing",
          context: {
            replaceRoute,
          },
          selection: readRouteAddressSelection(event.currentTarget),
        });
        return;
      }

      sendEvent({
        type: "changedSelection",
        selection: readRouteAddressSelection(event.currentTarget),
      });
    },
    [replaceRoute, sendEvent, suggestionOwnsInput],
  );

  const getSuggestionProps = useCallback(
    (suggestion: Suggestion, suggestionIndex: number) => ({
      "aria-selected": activeSuggestion?.index === suggestionIndex,
      "data-active": activeSuggestion?.index === suggestionIndex,
      id: readRouteEditorSuggestionId(listboxId, suggestionIndex),
      onMouseDown: (event: MouseEvent<HTMLElement>) => handleSuggestionMouseDown(event, suggestion),
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        // A row can appear under a stationary mouse after `selectedSuggestion` or `changedInput`.
        // Only actual mouse movement should make that row own `previewRoute`.
        if (event.pointerType === "mouse" && (event.movementX !== 0 || event.movementY !== 0)) {
          handleSuggestionPointerMove(suggestion, suggestionIndex);
        }
      },
    }),
    [activeSuggestion?.index, handleSuggestionMouseDown, handleSuggestionPointerMove, listboxId],
  );

  const displayInputProps = useMemo(
    () => ({
      autoComplete: "off",
      id: inputId,
      onChange: handleDisplayInputChange,
      onClick: handleDisplayInputClick,
      onFocus: handleDisplayInputFocus,
      title: inputValue,
      value: committedRouteAddress,
    }),
    [
      committedRouteAddress,
      handleDisplayInputChange,
      handleDisplayInputClick,
      handleDisplayInputFocus,
      inputId,
      inputValue,
    ],
  );

  const inputProps = useMemo(
    () => ({
      "aria-activedescendant": suggestionsVisible ? activeSuggestion?.id : undefined,
      "aria-controls": suggestionsVisible ? listboxId : undefined,
      "aria-expanded": suggestionsVisible,
      "aria-haspopup": "listbox" as const,
      autoComplete: "off",
      id: inputId,
      onChange: handleInputChange,
      onClick: handleInputClick,
      onCut: handleInputCut,
      onKeyDown: handleInputKeyDown,
      onKeyUp: handleInputKeyUp,
      onPaste: handleInputPaste,
      onSelect: handleInputSelect,
      ref: inputRef,
      title: inputValue,
      value: inputValue,
    }),
    [
      activeSuggestion?.id,
      handleInputChange,
      handleInputClick,
      handleInputCut,
      handleInputKeyDown,
      handleInputKeyUp,
      handleInputPaste,
      handleInputSelect,
      inputId,
      inputValue,
      listboxId,
      suggestionsVisible,
    ],
  );

  const listboxProps = useMemo(
    () => ({
      id: listboxId,
      onMouseLeave: handleSuggestionsMouseLeave,
    }),
    [handleSuggestionsMouseLeave, listboxId],
  );

  const rootProps = useMemo(
    () => ({
      "data-state": state.kind,
      onBlur: handleRootBlur,
      ref: rootRef,
    }),
    [handleRootBlur, state.kind],
  );

  return useMemo(
    () => ({
      activeSuggestionId: activeSuggestion?.id ?? null,
      currentSuggestionIndex,
      displayInputProps,
      getSuggestionProps,
      inputProps,
      listboxProps,
      previewTouchSuggestion,
      refreshPage,
      rootProps,
      selectSuggestion,
      state,
      suggestions,
      suggestionsVisible,
    }),
    [
      activeSuggestion?.id,
      currentSuggestionIndex,
      displayInputProps,
      getSuggestionProps,
      inputProps,
      listboxProps,
      previewTouchSuggestion,
      refreshPage,
      rootProps,
      selectSuggestion,
      state,
      suggestions,
      suggestionsVisible,
    ],
  );
}
