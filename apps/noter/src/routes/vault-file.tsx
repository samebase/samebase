import { createFileRoute } from "@tanstack/react-router";
import { FileViewRoutePage } from "@/components/FileViewRoutePage";
import { validateFileViewRouteSearch } from "@/lib/fileViewRouteSearch";

export const Route = createFileRoute("/vault/$")({
  component: FileViewRoutePage,
  validateSearch: validateFileViewRouteSearch,
});
