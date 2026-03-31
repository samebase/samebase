import * as React from "react";

export type WorkspaceMobilePaneDragContextValue = {
  isAvailable: boolean;
  dragMobileShellBy: (pointerDeltaX: number) => boolean;
  settleMobileShell: () => void;
};

const disabledContextValue: WorkspaceMobilePaneDragContextValue = {
  isAvailable: false,
  dragMobileShellBy: () => false,
  settleMobileShell: () => {},
};

export const WorkspaceMobilePaneDragContext =
  React.createContext<WorkspaceMobilePaneDragContextValue>(
    disabledContextValue,
  );
