import { createContext } from "react";

type CreationDialogState =
  | {
      isOpen: false;
    }
  | {
      isOpen: true;
      folderPath: string;
    };

export interface DialogState {
  fileCreationDialog: CreationDialogState;
  folderCreationDialog: CreationDialogState;
}

export interface DialogContextType extends DialogState {
  openFileCreation: (folderPath: string) => void;
  closeFileCreation: () => void;
  openFolderCreation: (folderPath: string) => void;
  closeFolderCreation: () => void;
}

export const DialogContext = createContext<DialogContextType | undefined>(undefined);
