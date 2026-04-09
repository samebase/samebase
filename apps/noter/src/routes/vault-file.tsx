import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { FileView } from "@/components/FileView";
import { validateFileViewRouteSearch } from "@/lib/fileViewRouteSearch";

function FileViewRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <FileView />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/vault/$")({
  component: FileViewRouteComponent,
  validateSearch: validateFileViewRouteSearch,
});
