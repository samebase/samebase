import { type ComponentProps } from "react";

import {
  SelectContent as SelectContentUI,
  SelectItem as SelectItemUI,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function AppSelectContent({ className, ...props }: ComponentProps<typeof SelectContentUI>) {
  return <SelectContentUI className={cn(className, "max-w-[var(--available-width)]")} {...props} />;
}

export function AppSelectItem({ className, ...props }: ComponentProps<typeof SelectItemUI>) {
  return (
    <SelectItemUI
      className={cn(
        className,
        "[&>*:first-child]:line-clamp-2 [&>*:first-child]:min-w-0 [&>*:first-child]:shrink [&>*:first-child]:whitespace-normal [&>*:first-child]:[overflow-wrap:anywhere]",
      )}
      {...props}
    />
  );
}
