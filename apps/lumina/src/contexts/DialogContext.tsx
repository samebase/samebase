import { createContext, useState, ReactNode } from "react";

interface DialogState {
  fileCreationDialog: {
    isOpen: boolean;
    folderPath?: string;
  };
}

export interface DialogContextType extends DialogState {
  openFileCreation: (folderPath: string) => void;
  closeFileCreation: () => void;
}

export const DialogContext = createContext<DialogContextType | undefined>(
  undefined,
);

interface DialogProviderProps {
  children: ReactNode;
}

export function DialogProvider({ children }: DialogProviderProps) {
  const [dialogState, setDialogState] = useState<DialogState>({
    fileCreationDialog: { isOpen: false },
  });

  const openFileCreation = (folderPath: string) => {
    setDialogState({
      fileCreationDialog: {
        isOpen: true,
        folderPath,
      },
    });
  };

  const closeFileCreation = () => {
    setDialogState({
      fileCreationDialog: {
        isOpen: false,
        folderPath: undefined,
      },
    });
  };

  const value: DialogContextType = {
    ...dialogState,
    openFileCreation,
    closeFileCreation,
  };

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}
