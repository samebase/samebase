import { useEffect, useState } from "react";
import type { AuthorizationError, AuthorizationProvider } from "../../shared/authorizationError";
import {
  readAuthorizationError,
  type AuthorizationErrorSearch,
} from "@/routeSearch/authorizationError";

export function useAuthorizationErrorNotice(args: {
  allowedProviders: readonly AuthorizationProvider[];
  onConsume: () => void;
  search: AuthorizationErrorSearch;
  scopeKey: string;
}): AuthorizationError | null {
  const { onConsume } = args;
  const currentError = readAuthorizationError(args.search);
  const acceptedError =
    currentError !== null &&
    args.allowedProviders.some((provider) => provider === currentError.provider)
      ? currentError
      : null;
  const [noticeState, setNoticeState] = useState<{
    notice: AuthorizationError | null;
    scopeKey: string;
  }>({ notice: acceptedError, scopeKey: args.scopeKey });
  const currentCode = acceptedError?.code;
  const currentProvider = acceptedError?.provider;

  useEffect(() => {
    if (currentCode === undefined || currentProvider === undefined) {
      if (noticeState.scopeKey !== args.scopeKey) {
        setNoticeState({ notice: null, scopeKey: args.scopeKey });
      }
      return;
    }
    setNoticeState((currentState) =>
      currentState.scopeKey === args.scopeKey &&
      currentState.notice?.code === currentCode &&
      currentState.notice.provider === currentProvider
        ? currentState
        : {
            notice: { code: currentCode, provider: currentProvider },
            scopeKey: args.scopeKey,
          },
    );
    onConsume();
  }, [args.scopeKey, currentCode, currentProvider, noticeState.scopeKey, onConsume]);

  return noticeState.scopeKey === args.scopeKey ? noticeState.notice : acceptedError;
}
