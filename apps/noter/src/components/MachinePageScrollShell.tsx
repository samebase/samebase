import type { ReactNode } from "react";

/**
 * The shared app layout keeps its main region overflow-hidden for full-screen
 * workspace surfaces, so machine pages need an explicit scroll container when
 * their content grows past the available height.
 */
export function MachinePageScrollShell(props: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {props.children}
    </div>
  );
}
