import {
  RouterContextProvider,
  createMemoryHistory,
} from "@tanstack/react-router";
import {
  createElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createAppRouter } from "@/lib/appRouter";

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

  return createElement(RouterContextProvider, {
    children,
    router,
  });
}
