import { isRecord } from "@samebase/dependent";

export function readAuthorizationCompletionReturnTo(args: {
  completionEventTypes: readonly string[];
  event: MessageEvent;
  expectedCallbackOrigin: string;
  expectedReturnOrigin: string;
  popup: Window;
}): string | null {
  if (
    args.event.source !== args.popup ||
    args.event.origin !== args.expectedCallbackOrigin ||
    !isRecord(args.event.data) ||
    typeof args.event.data["type"] !== "string" ||
    !args.completionEventTypes.includes(args.event.data["type"]) ||
    typeof args.event.data["returnTo"] !== "string"
  ) {
    return null;
  }
  try {
    const returnUrl = new URL(args.event.data["returnTo"]);
    return returnUrl.origin === args.expectedReturnOrigin ? returnUrl.toString() : null;
  } catch {
    return null;
  }
}
