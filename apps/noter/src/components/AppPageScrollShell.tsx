import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "#src/lib/utils.ts";

type AppPageScrollShellProps = ComponentPropsWithoutRef<"div">;

/**
 * Shared inner scroll surface for routes that intentionally keep scroll inside
 * the route body instead of the browser document.
 */
export const AppPageScrollShell = forwardRef<
  HTMLDivElement,
  AppPageScrollShellProps
>(function AppPageScrollShell({ children, className, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
});
