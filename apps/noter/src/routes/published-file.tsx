import { createFileRoute, useLocation } from "@tanstack/react-router";
import { PublishedFileRoutePage } from "@/components/PublishedFileRoutePage";
import { RoutedPage } from "./-publicRouteComponents";

function PublishedFileRouteComponent() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });

  return (
    <RoutedPage pathname={pathname} withLayout>
      <PublishedFileRoutePage pathname={pathname} />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/p/$")({
  component: PublishedFileRouteComponent,
});
