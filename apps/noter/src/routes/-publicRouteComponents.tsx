import { Suspense, useMemo, type ReactNode } from "react";
import { Layout } from "@/Layout";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";

/**
 * Shared public-route shell for metadata plus the optional public-site layout.
 */
export function RoutedPage(props: {
  children?: ReactNode;
  pathname: string;
  withLayout?: boolean;
}) {
  const metadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname: props.pathname,
        isAuthenticated: false,
      }),
    [props.pathname],
  );
  usePageMetadata(metadata);

  const content = <Suspense fallback={null}>{props.children}</Suspense>;

  return props.withLayout ? <Layout>{content}</Layout> : content;
}
