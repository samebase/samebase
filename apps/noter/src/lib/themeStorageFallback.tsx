import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import type { RootThemeMode } from "#src/lib/rootThemeModeSearch.ts";

function canUseThemeStorage(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    void window.localStorage;
    return true;
  } catch {
    return false;
  }
}

export function OptionalThemeProvider({
  children,
  forcedTheme,
}: {
  children: ReactNode;
  forcedTheme?: RootThemeMode;
}) {
  // localStorage access can be denied in browser privacy modes. Keep the app
  // bootable on those paths by dropping theme persistence instead of crashing
  // before the landing route can render.
  if (!canUseThemeStorage()) {
    return children;
  }

  return (
    <ThemeProvider
      attribute="class"
      forcedTheme={forcedTheme === "system" ? undefined : forcedTheme}
    >
      {children}
    </ThemeProvider>
  );
}
