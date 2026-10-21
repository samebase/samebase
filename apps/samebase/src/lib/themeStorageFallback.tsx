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
  //
  // The root head's theme script (lib/rootHead.ts) applies the stored or system theme before the
  // first paint. next-themes renders a second copy of that script from `Function#toString`, which
  // the Convex CLI's esbuild `keepNames` pass breaks in the server bundle (a call to its `__name`
  // helper, which the page does not have). A non-JavaScript `type` keeps that copy from running.
  return (
    <ThemeProvider
      attribute="class"
      forcedTheme={forcedTheme === "system" ? undefined : forcedTheme}
      scriptProps={{ type: "application/json" }}
    >
      {children}
    </ThemeProvider>
  );
}
