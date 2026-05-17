import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "#src/components/AuthenticatedAppRoutePage.tsx";
import { validateFileViewRouteSearch } from "#src/lib/fileViewRouteSearch.ts";

const FileView = lazy(async () => {
  const module = await import("#src/components/FileView/FileView.tsx");
  return { default: module.FileView };
});

/**
 * Keep the editor stack lazy so signed-out deep links can render the auth gate
 * without preloading the full file-view bundle.
 */
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
