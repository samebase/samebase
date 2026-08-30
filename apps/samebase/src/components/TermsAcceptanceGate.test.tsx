// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TermsAcceptanceGate, TermsAcceptanceScreen } from "./TermsAcceptanceGate";

const testState = vi.hoisted(() => ({
  acceptCurrentTerms: vi.fn(async () => null),
  queryResult: { role: "role_member", termsAccepted: true },
}));

vi.mock("convex/react", () => ({
  useMutation: () => testState.acceptCurrentTerms,
  useQuery: () => testState.queryResult,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, target, to }: { children: ReactNode; target?: string; to: string }) => (
    <a href={to} target={target}>
      {children}
    </a>
  ),
}));

describe("TermsAcceptanceGate", () => {
  beforeEach(() => {
    testState.acceptCurrentTerms.mockReset();
    testState.acceptCurrentTerms.mockResolvedValue(null);
    testState.queryResult = { role: "role_member", termsAccepted: true };
  });

  it("replaces the route with the Terms screen for a Terms-pending account", () => {
    const markup = renderToStaticMarkup(
      <TermsAcceptanceGate viewerAccess={{ role: "role_terms_pending", termsAccepted: false }}>
        <div>Route child</div>
      </TermsAcceptanceGate>,
    );

    expect(markup).toContain("Terms of Service");
    expect(markup).toContain("Send me occasional Samebase product updates and announcements.");
    expect(markup).toContain("Continue");
    expect(markup).toContain('href="/terms"');
    expect(markup).toContain('href="/privacy"');
    expect(markup).not.toContain("Sign out");
    expect(markup).not.toContain("Route child");
  });

  it("renders the route after Terms acceptance", () => {
    const markup = renderToStaticMarkup(
      <TermsAcceptanceGate viewerAccess={{ role: "role_member", termsAccepted: true }}>
        <div>Route child</div>
      </TermsAcceptanceGate>,
    );

    expect(markup).toContain("Route child");
    expect(markup).not.toContain("Send me occasional Samebase product updates");
  });

  it("renders the route before account approval", () => {
    const markup = renderToStaticMarkup(
      <TermsAcceptanceGate viewerAccess={{ role: "role_pending_access", termsAccepted: false }}>
        <div>Route child</div>
      </TermsAcceptanceGate>,
    );

    expect(markup).toContain("Route child");
    expect(markup).not.toContain("Send me occasional Samebase product updates");
  });

  it("records acceptance from the primary action", async () => {
    let resolveAcceptance = () => {};
    const acceptance = new Promise<null>((resolve) => {
      resolveAcceptance = () => resolve(null);
    });
    testState.acceptCurrentTerms.mockReturnValue(acceptance);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(<TermsAcceptanceScreen />);
    });
    const acceptButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent === "Continue",
    );
    if (acceptButton === undefined) {
      throw new Error("The Terms acceptance action is missing.");
    }
    const termsCheckbox = rootElement.querySelector<HTMLElement>("#terms-acceptance-required");
    if (termsCheckbox === null) {
      throw new Error("The Terms acceptance checkbox is missing.");
    }

    expect(acceptButton.disabled).toBe(true);
    await act(async () => {
      termsCheckbox.click();
    });
    expect(acceptButton.disabled).toBe(false);

    await act(async () => {
      acceptButton.click();
    });

    expect(testState.acceptCurrentTerms).toHaveBeenCalledWith({
      termsAccepted: true,
      productUpdateEmailConsent: "denied",
    });
    expect(acceptButton.disabled).toBe(true);
    expect(acceptButton.textContent).toBe("Continuing...");

    await act(async () => {
      resolveAcceptance();
      await acceptance;
    });
    expect(acceptButton.disabled).toBe(false);

    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });

  it("records the optional product-update email choice", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(<TermsAcceptanceScreen />);
    });
    const acceptButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent === "Continue",
    );
    const termsCheckbox = rootElement.querySelector<HTMLElement>("#terms-acceptance-required");
    const productUpdateEmailsCheckbox =
      rootElement.querySelector<HTMLElement>("#product-update-emails");
    if (
      acceptButton === undefined ||
      termsCheckbox === null ||
      productUpdateEmailsCheckbox === null
    ) {
      throw new Error("The Terms choices are missing.");
    }

    await act(async () => {
      termsCheckbox.click();
      productUpdateEmailsCheckbox.click();
    });
    await act(async () => {
      acceptButton.click();
    });

    expect(testState.acceptCurrentTerms).toHaveBeenCalledWith({
      termsAccepted: true,
      productUpdateEmailConsent: "granted",
    });

    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });
});
