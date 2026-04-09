import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type AppPageScrollShellProps = ComponentPropsWithoutRef<"div">;

/**
 * Shared page shell for routes that either keep scroll inside the component or
 * hand it back to the browser viewport.
 */
export const AppPageScrollShell = forwardRef<
  HTMLDivElement,
  AppPageScrollShellProps & {
    scrollMode?: "container" | "document";
  }
>(function AppPageScrollShell(
  { children, className, scrollMode = "container", ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        scrollMode === "document"
          ? "flex flex-1 flex-col"
          : "flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
});
