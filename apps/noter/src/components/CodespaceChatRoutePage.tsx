import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const CodespaceChatOnlyView = lazy(async () => {
  const module = await import("@/components/CodespaceChatOnlyView");
  return { default: module.CodespaceChatOnlyView };
});

export function CodespaceChatRoutePage() {
  return (
    <AuthenticatedAppRoutePage>
      <CodespaceChatOnlyView />
    </AuthenticatedAppRoutePage>
  );
}
