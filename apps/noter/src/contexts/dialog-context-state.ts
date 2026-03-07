import { createContext } from "react";

export interface DialogState {
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
