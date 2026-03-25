export type EditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};

export const EMPTY_EDITOR_HISTORY_STATE = {
  canUndo: false,
  canRedo: false,
} satisfies EditorHistoryState;

export type EditorHistoryController = {
  undo: () => void;
  redo: () => void;
};
