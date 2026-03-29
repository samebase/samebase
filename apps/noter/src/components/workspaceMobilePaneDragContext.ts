import * as React from "react";

export type WorkspaceMobilePaneDragContextValue = {
  isAvailable: boolean;
  isMainPaneActive: boolean;
  dragMobileShellBy: (pointerDeltaX: number) => void;
  settleMobileShell: () => void;
};

const disabledContextValue: WorkspaceMobilePaneDragContextValue = {
  isAvailable: false,
  isMainPaneActive: false,
  dragMobileShellBy: () => {},
  settleMobileShell: () => {},
};

export const WorkspaceMobilePaneDragContext =
  React.createContext<WorkspaceMobilePaneDragContextValue>(
    disabledContextValue,
  );
