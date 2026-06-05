# Route URL Editor FSM Review

Date: 2026-06-05

This is an adversarial review note, not an accepted product spec. Use it as context when reviewing
the RouteUrlEditor FSM rebuild.

## Review Setup

Three read-only sub-agent reviewers inspected the current RouteUrlEditor FSM work:

- State-model reviewer: impossible states, state-field contracts, derived vs stored state.
- Statecharts reviewer: custom typed FSM vs XState/statechart modeling.
- Production reviewer: behavior regressions, router/search sync, focus/selection, tests.

The reviewers were asked to be skeptical of the custom FSM approach and not to assume our current
model is correct.

## Consensus

The reviewers did not recommend switching to XState just because the editor currently has only
`blurred` and `focused` control states.

They did agree that the current custom FSM needs tighter contracts before adding more behavior. Most
bugs so far are not graph-topology bugs. They are context/action bugs: route readiness,
locked-prefix edits, retained search params, and restore targets.

## High-Risk Findings

### `committedPath` Is Not Clearly Owned

Current `committedPath` is updated optimistically inside the FSM when `readReadyRouteAddress`
returns a route, before TanStack Router has confirmed navigation.

It is also updated later from router location via `changedCommittedRoute`.

That means `committedPath` can mean at least three different things:

- last router location observed
- last router replace requested
- last route the editor assumes was applied

This is the most important state-model risk. If TanStack owns the committed route, the FSM may not
need to store a separate committed copy. Storing it can create another sync system that acts like
hidden `useEffect` logic.

Before adding guardrails around `committedPath`, ask whether the field should exist at all.

### Locked Prefix Is Not Fully Enforced By The FSM

Keyboard/cut/paste paths clamp common edits before native input mutates the value.

But `changedInput` still parses raw `nextInputValue` with `new URL(inputValue)`. Bypasses such as
drop, autofill, composition, programmatic input, malformed values, or external origins can reach the
FSM without a clear rejected-input event.

The reviewers expect the input-change event path to distinguish at least:

- accepted route draft
- rejected locked-prefix edit
- malformed input

### Route-Ready Semantics May Apply Too Early

`readReadyRouteAddress` can drop incomplete search tokens and return a normalized route subset.

That may be correct for some interactions, but the contract is not explicit enough. Example risk:
from `/privacy`, a draft like `/logo?leftFace=s` might apply `/logo`, while the spec language says
partial valued params should stay local.

Reviewers suggested distinguishing:

- local draft
- ready exact draft
- ready normalized draft

### Impossible Events Have Behavior

The exhaustive transition table currently gives behavior to events that should be impossible, such
as `selectedSuggestion` while `blurred`.

That can hide invalid event flows. Either make impossible events unrepresentable or fail closed.

### Debug Logging Is Outside The Action Model

`useTypedTransitionMachine` logs every event unconditionally. That is not an FSM action and can log
typed URLs/search params. Debugging should be opt-in through explicit debug callbacks or actions.

## XState Comparison

There is a mostly direct mapping:

- `state.kind` -> XState state value
- other state fields -> XState context
- event union -> XState events
- transition table cells -> XState transitions
- action union -> XState actions
- direct checks -> XState guards

But a graph with only `blurred` and `focused` would not reveal the important bugs. It would show
`focused --changedInput--> focused`, while the important behavior is hidden inside context updates
and readiness checks.

XState would help only if the model names important branches explicitly, such as:

- `changedInput [keepsLockedPrefix]`
- `changedInput [rejectsLockedPrefixEdit]`
- `changedInput [draftRouteReady]`
- `changedInput [draftRouteLocal]`

The reviewers suggested tightening the custom model first rather than switching libraries.

## Suggested Next Review Steps

1. Decide whether `committedPath` is real FSM state or should be derived from TanStack Router.
2. Move locked-prefix validation into the `changedInput` event path.
3. Make route-readiness result explicit instead of returning only `string | null`.
4. Remove behavior for impossible events such as `blurred.selectedSuggestion`.
5. Gate or remove unconditional event logging.
6. Add tests for malformed input, external-origin input, partial query drafts from a different
   route, rapid ready drafts, external route changes while focused, and suggestion Back behavior.
