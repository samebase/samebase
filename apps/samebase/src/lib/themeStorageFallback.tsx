import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import type { RootThemeMode } from "@/lib/rootThemeModeSearch";

export function OptionalThemeProvider({
  children,
  forcedTheme,
}: {
  children: ReactNode;
  forcedTheme?: RootThemeMode;
}) {
  // next-themes wraps each localStorage access in try/catch, so it renders the same tree on the
  // server and in browsers that deny storage.
  return (
    <ThemeProvider
      attribute="class"
      forcedTheme={forcedTheme === "system" ? undefined : forcedTheme}
    >
      {children}
    </ThemeProvider>
  );
}
