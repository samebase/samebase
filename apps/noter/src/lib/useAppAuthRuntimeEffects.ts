import { useAutoSignIn } from "@/authClient";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";

export function useAppAuthRuntimeEffects(pathname: string) {
  useAutoSignIn();
  useCloseOAuthPopup(pathname, true);
}
