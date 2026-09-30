import { type ComponentProps } from "react";

import { DialogContent as DialogContentUI } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AppDialogContentSize = "default" | "lg" | "xl";

const appDialogContentSizeClass: Record<AppDialogContentSize, string> = {
  default: "[--samebase-dialog-max-width:28rem]",
  lg: "[--samebase-dialog-max-width:42rem]",
  xl: "[--samebase-dialog-max-width:72rem]",
};

/**
 * App default dialog popup. The position and width use visual viewport units so
 * mobile offscreen panes cannot stretch a dialog while a nested popup opens.
 */
export function AppDialogContent({
  className,
  size = "default",
  ...props
}: ComponentProps<typeof DialogContentUI> & {
  size?: AppDialogContentSize;
}) {
  return (
    <DialogContentUI
      className={cn(
        appDialogContentSizeClass[size],
        className,
        "[--samebase-dialog-left:50dvw] [--samebase-dialog-top:50dvh] [--samebase-dialog-width:min(var(--samebase-dialog-max-width),calc(100dvw-2rem))] top-(--samebase-dialog-top) left-(--samebase-dialog-left) w-(--samebase-dialog-width) max-w-(--samebase-dialog-width) sm:w-(--samebase-dialog-width) sm:max-w-(--samebase-dialog-width)",
      )}
      {...props}
    />
  );
}
