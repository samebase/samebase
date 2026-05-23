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
        "top-[50dvh] left-[50dvw] w-[calc(100dvw-2rem)] max-w-[min(var(--noter-dialog-max-width),calc(100dvw-2rem))] sm:w-full sm:max-w-[min(var(--noter-dialog-max-width),calc(100dvw-2rem))]",
      )}
      {...props}
    />
  );
}
