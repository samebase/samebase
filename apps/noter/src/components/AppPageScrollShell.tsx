import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type AppPageScrollShellProps = ComponentPropsWithoutRef<"div">;

/**
 * The shared app layout keeps its main region overflow-hidden for full-screen
 * workspace surfaces, so public routes that need natural page scrolling must
 * opt into their own scroll container.
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
