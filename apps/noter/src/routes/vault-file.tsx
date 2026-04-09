import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { validateFileViewRouteSearch } from "@/lib/fileViewRouteSearch";
import { lazy } from "react";

const FileView = lazy(async () => {
  const module = await import("@/components/FileView");
  return { default: module.FileView };
});

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
