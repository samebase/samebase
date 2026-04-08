import { useAutoSignIn } from "@/authClient";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
import { type RootRouteSearch } from "@/lib/rootRouteSearch";

export function useAppAuthRuntimeEffects(
  pathname: string,
  auth: RootRouteSearch["auth"],
) {
  useAutoSignIn(auth);
  useCloseOAuthPopup(pathname, true);
}
