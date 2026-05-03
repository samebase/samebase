import { useDebouncer } from "@tanstack/react-pacer/debouncer";
import { useEffect, useState } from "react";

type PacedCommittedStateDraft<TState> = {
  base: TState;
  value: TState;
};

/**
 * Keeps an immediate local draft over a committed external value, then writes
 * that draft back through a paced commit function.
 *
 * Use this for state that has one durable owner, such as typed route search,
 * but still needs low-latency UI updates while the user drags, types, or
 * animates. The draft remembers the committed value it was based on so external
 * navigation or another commit can cancel stale pending writes instead of
 * being overwritten by an old debounce.
 */
export function usePacedCommittedState<TState>({
  committed,
  commit,
  equals,
  wait,
}: {
  committed: TState;
  commit: (value: TState) => void;
  equals: (left: TState, right: TState) => boolean;
  wait: number;
}) {
  const [draft, setDraft] = useState<PacedCommittedStateDraft<TState> | null>(
    null,
  );
  const activeDraft =
    draft !== null && equals(draft.base, committed) ? draft : null;
  const value = activeDraft?.value ?? committed;

  const executeCommit = (nextDraft: PacedCommittedStateDraft<TState>) => {
    if (
      !equals(nextDraft.base, committed) ||
      equals(nextDraft.value, committed)
    ) {
      return;
    }

    commit(nextDraft.value);
  };

  const commitDebouncer = useDebouncer(executeCommit, {
    wait,
    onUnmount: (debouncer) => {
      debouncer.flush();
    },
  });
  const { cancel, maybeExecute } = commitDebouncer;

  /**
   * Drops drafts based on an older committed value so navigation or other
   * external commits cannot be overwritten by a stale debounced write.
   */
  useEffect(() => {
    if (draft === null || equals(draft.base, committed)) {
      return;
    }

    cancel();
    setDraft(null);
  }, [cancel, committed, draft, equals]);

  const buildDraft = (nextValue: TState): PacedCommittedStateDraft<TState> => ({
    base: activeDraft?.base ?? committed,
    value: nextValue,
  });

  const setDraftValue = (nextValue: TState) => {
    const nextDraft = buildDraft(nextValue);
    setDraft(equals(nextValue, committed) ? null : nextDraft);
    return nextDraft;
  };

  return {
    cancelCommit: cancel,
    commitCurrent: () => {
      cancel();
      if (activeDraft !== null) {
        executeCommit(activeDraft);
      }
    },
    commitValue: (nextValue: TState) => {
      cancel();
      executeCommit(setDraftValue(nextValue));
    },
    debounceValue: (nextValue: TState) => {
      maybeExecute(setDraftValue(nextValue));
    },
    setDraftValue,
    value,
  };
}
