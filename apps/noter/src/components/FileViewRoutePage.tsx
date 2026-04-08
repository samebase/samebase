import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const FileView = lazy(async () => {
  const module = await import("@/components/FileView");
  return { default: module.FileView };
});

export function FileViewRoutePage() {
  return (
    <AuthenticatedAppRoutePage>
      <FileView />
    </AuthenticatedAppRoutePage>
  );
}
