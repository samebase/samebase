// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { AuthorizationErrorSearch } from "@/routeSearch/authorizationError";
import { useAuthorizationErrorNotice } from "./useAuthorizationErrorNotice";

const ALLOWED_PROVIDERS = ["convex"] as const;
let rootElement: HTMLDivElement | null = null;

function NoticeProbe({
  onConsume,
  search,
  scopeKey = "samebase",
}: {
  onConsume: () => void;
  search: AuthorizationErrorSearch;
  scopeKey?: string;
}) {
  const notice = useAuthorizationErrorNotice({
    allowedProviders: ALLOWED_PROVIDERS,
    onConsume,
    search,
    scopeKey,
  });
  return <span>{notice ? `${notice.provider}:${notice.code}` : "none"}</span>;
}

afterEach(() => {
  rootElement?.remove();
  rootElement = null;
});

describe("useAuthorizationErrorNotice", () => {
  it("keeps the current notice after it consumes the URL values", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    const onConsume = vi.fn();

    await act(async () => {
      root.render(
        <NoticeProbe
          onConsume={onConsume}
          search={{
            "authorization-provider": "convex",
            "authorization-error": "target-mismatch",
          }}
        />,
      );
    });
    expect(rootElement.textContent).toBe("convex:target-mismatch");
    expect(onConsume).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(<NoticeProbe onConsume={onConsume} search={{}} />);
    });
    expect(rootElement.textContent).toBe("convex:target-mismatch");
    expect(onConsume).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("clears the captured notice when its organization scope changes", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    const onConsume = vi.fn();

    await act(async () => {
      root.render(
        <NoticeProbe
          onConsume={onConsume}
          search={{
            "authorization-provider": "convex",
            "authorization-error": "target-mismatch",
          }}
        />,
      );
    });
    expect(rootElement.textContent).toBe("convex:target-mismatch");

    await act(async () => {
      root.render(<NoticeProbe onConsume={onConsume} scopeKey="other" search={{}} />);
    });
    expect(rootElement.textContent).toBe("none");

    await act(async () => root.unmount());
  });
});
