import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export function QueryDevtools() {
  const shouldShowDevtools =
    typeof window !== "undefined" &&
    window.location.search
      .slice(1)
      .split("&")
      .some((part) => part.split("=")[0] === "devtools");

  return shouldShowDevtools ? (
    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
  ) : null;
}
