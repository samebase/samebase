import { type ComponentProps } from "react";

import { DialogContent as DialogContentUI } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AppDialogContentSize = "default" | "lg";

const appDialogContentSizeClass: Record<AppDialogContentSize, string> = {
  default: "[--noter-dialog-max-width:28rem]",
  lg: "[--noter-dialog-max-width:42rem]",
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
        "[--noter-dialog-left:50dvw] [--noter-dialog-top:50dvh] [--noter-dialog-width:min(var(--noter-dialog-max-width),calc(100dvw-2rem))] top-(--noter-dialog-top) left-(--noter-dialog-left) w-(--noter-dialog-width) max-w-(--noter-dialog-width) sm:w-(--noter-dialog-width) sm:max-w-(--noter-dialog-width)",
      )}
      {...props}
    />
  );
}
