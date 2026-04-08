import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

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

export function OptionalThemeProvider({ children }: { children: ReactNode }) {
  // localStorage access can be denied in browser privacy modes. Keep the app
  // bootable on those paths by dropping theme persistence instead of crashing
  // before the landing route can render.
  if (!canUseThemeStorage()) {
    return children;
  }

  return <ThemeProvider attribute="class">{children}</ThemeProvider>;
}
