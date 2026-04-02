import { MACHINES_ROUTE } from "@/lib/noterSync";

/**
 * Routes with their own chat or composer surfaces should not also render the
 * global floating chat entrypoint on top of that UI.
 */
export function shouldShowGlobalChatFab(pathname: string): boolean {
  return (
    !pathname.startsWith("/vault/") &&
    pathname !== "/" &&
    pathname !== MACHINES_ROUTE
  );
}
