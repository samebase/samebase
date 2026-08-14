// @vitest-environment jsdom

import { ConvexError } from "convex/values";
import { act, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX } from "../../convex/billingErrors";
import { OrganizationBillingErrorBoundary } from "./OrganizationBillingErrorBoundary";

type TestErrorBoundaryState = {
  error: Error | null;
};

class TestErrorBoundary extends Component<{ children: ReactNode }, TestErrorBoundaryState> {
  override state: TestErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): TestErrorBoundaryState {
    return { error };
  }

  override render() {
    return this.state.error ? (
      <div>Outer error: {this.state.error.message}</div>
    ) : (
      this.props.children
    );
  }
}

function ThrowError({ error }: { error: Error }): never {
  throw error;
}

async function renderComponent(element: ReactNode) {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(element);
  });

  return { root, rootElement };
}

describe("OrganizationBillingErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("contains the billing-limit error and resets after route navigation", async () => {
    const hybridErrorMessage: string = "Server Error Called by client";
    const billingError = new ConvexError(hybridErrorMessage);
    billingError.data = `${ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX}. Billing and member management are still available.`;
    const { root, rootElement } = await renderComponent(
      <TestErrorBoundary>
        <OrganizationBillingErrorBoundary resetKey="/vault/acme/app?add-cloudflare">
          <ThrowError error={billingError} />
        </OrganizationBillingErrorBoundary>
      </TestErrorBoundary>,
    );

    expect(rootElement.textContent).toContain("Organization billing needs attention");
    expect(rootElement.textContent).not.toContain("Outer error");

    await act(async () => {
      root.render(
        <TestErrorBoundary>
          <OrganizationBillingErrorBoundary resetKey="/vault/acme/app">
            <div>Vault dashboard</div>
          </OrganizationBillingErrorBoundary>
        </TestErrorBoundary>,
      );
    });

    expect(rootElement.textContent).toContain("Vault dashboard");

    await act(async () => {
      root.unmount();
    });
  });

  it("forwards an unrelated error to the outer app boundary", async () => {
    const { root, rootElement } = await renderComponent(
      <TestErrorBoundary>
        <OrganizationBillingErrorBoundary resetKey="/vault/acme/app">
          <ThrowError
            error={
              new ConvexError(
                "This organization needs another paid member seat before another member can join.",
              )
            }
          />
        </OrganizationBillingErrorBoundary>
      </TestErrorBoundary>,
    );

    expect(rootElement.textContent).toContain("Outer error: This organization needs another");
    expect(rootElement.textContent).not.toContain("Organization billing needs attention");

    await act(async () => {
      root.unmount();
    });
  });
});
