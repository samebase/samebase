import type { ReactNode } from "react";

/**
 * The shared app layout keeps its main region overflow-hidden for full-screen
 * workspace surfaces, so public routes that need natural page scrolling must
 * opt into their own scroll container.
 */
export function AppPageScrollShell(props: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto">
      {props.children}
    </div>
  );
}
