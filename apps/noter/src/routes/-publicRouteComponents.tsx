import { Suspense, useMemo, type ReactNode } from "react";
import { resolvePageMetadata } from "#src/lib/pageMetadata.ts";
import { usePageMetadata } from "#src/lib/usePageMetadata.ts";

/**
 * Shared route wrapper for public metadata and lazy child boundaries.
 */
export function RoutedPage(props: { children?: ReactNode; pathname: string }) {
  const metadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname: props.pathname,
        isAuthenticated: false,
      }),
    [props.pathname],
  );
  usePageMetadata(metadata);

  return <Suspense fallback={null}>{props.children}</Suspense>;
}
