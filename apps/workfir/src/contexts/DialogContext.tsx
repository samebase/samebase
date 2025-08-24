import { createContext, useState, ReactNode } from "react";

interface DialogState {
  fileCreationDialog: {
    isOpen: boolean;
    folderPath?: string;
  };
  folderCreationDialog: {
    isOpen: boolean;
    folderPath?: string;
  };
}

export interface DialogContextType extends DialogState {
  openFileCreation: (folderPath: string) => void;
  closeFileCreation: () => void;
  openFolderCreation: (folderPath: string) => void;
  closeFolderCreation: () => void;
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
    folderCreationDialog: { isOpen: false },
  });

  const openFileCreation = (folderPath: string) => {
    setDialogState((prev) => ({
      ...prev,
      fileCreationDialog: {
        isOpen: true,
        folderPath,
      },
    }));
  };

  const closeFileCreation = () => {
    setDialogState((prev) => ({
      ...prev,
      fileCreationDialog: {
        isOpen: false,
        folderPath: undefined,
      },
    }));
  };

  const openFolderCreation = (folderPath: string) => {
    setDialogState((prev) => ({
      ...prev,
      folderCreationDialog: {
        isOpen: true,
        folderPath,
      },
    }));
  };

  const closeFolderCreation = () => {
    setDialogState((prev) => ({
      ...prev,
      folderCreationDialog: {
        isOpen: false,
        folderPath: undefined,
      },
    }));
  };

  const value: DialogContextType = {
    ...dialogState,
    openFileCreation,
    closeFileCreation,
    openFolderCreation,
    closeFolderCreation,
  };

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}
