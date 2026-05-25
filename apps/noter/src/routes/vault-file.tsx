import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import {
  FILE_VIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateFileViewRouteSearch,
} from "@/lib/fileViewRouteSearch";

const FileView = lazy(async () => {
  const module = await import("@/components/FileView/FileView");
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
  ssr: false,
  staticData: {
    permission: "admin",
    searchParamSuggestions: FILE_VIEW_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: FileViewRouteComponent,
  validateSearch: validateFileViewRouteSearch,
});
