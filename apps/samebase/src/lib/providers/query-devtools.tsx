import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRootRouteSearch } from "@/routeSearch/root";

export function QueryDevtools() {
  const { devtools } = useRootRouteSearch();

  return import.meta.env.DEV && devtools ? (
    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
  ) : null;
}
