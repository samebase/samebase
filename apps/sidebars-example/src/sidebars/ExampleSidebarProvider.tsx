import { SidebarRuntimeProvider } from "@samebase/sidebars/SidebarRuntime";
import { type ReactNode } from "react";
import { useExampleSidebarController } from "./exampleSidebarState";

export function ExampleSidebarProvider({ children }: { children: ReactNode }) {
  const controller = useExampleSidebarController();

  return <SidebarRuntimeProvider controller={controller}>{children}</SidebarRuntimeProvider>;
}
