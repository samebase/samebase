import { RouterContextProvider, createMemoryHistory } from "@tanstack/react-router";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { createAppRouter } from "@/router";

type TestRouterProviderProps = {
  children?: ReactNode;
  initialEntries?: string[];
  initialIndex?: number;
};

/**
 * Mount the real app router against an in-memory history so tests and visual
 * fixtures exercise the shipped TanStack route tree without touching browser
 * history.
 */
export function TestRouterProvider({
  children,
  initialEntries = ["/"],
  initialIndex,
}: TestRouterProviderProps): ReactElement {
  const [router] = useState(() =>
    createAppRouter(
      createMemoryHistory({
        initialEntries,
        initialIndex,
      }),
    ),
  );

  // Fixtures mount router context without TanStack's Matches/Transitioner tree,
  // so keep memory-history navigations loading the same way production does.
  useEffect(
    () =>
      router.history.subscribe(() => {
        void router.load();
      }),
    [router],
  );

  return <RouterContextProvider router={router}>{children}</RouterContextProvider>;
}
