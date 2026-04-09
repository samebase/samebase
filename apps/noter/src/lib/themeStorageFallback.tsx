import { ThemeProvider } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";

function canUseThemeStorage(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  if (typeof window.matchMedia !== "function") {
    return false;
  }

  try {
    void window.localStorage;
    return true;
  } catch {
    return false;
  }
}

export function OptionalThemeProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // localStorage access can be denied in browser privacy modes. Keep the app
  // bootable on those paths by dropping theme persistence instead of crashing
  // before the landing route can render.
  if (!mounted || !canUseThemeStorage()) {
    return children;
  }

  return <ThemeProvider attribute="class">{children}</ThemeProvider>;
}
