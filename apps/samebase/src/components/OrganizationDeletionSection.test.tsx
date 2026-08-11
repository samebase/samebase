// @vitest-environment jsdom

import type { Id } from "../../convex/_generated/dataModel";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  OrganizationDeletionSection,
  type OrganizationDeletionSettings,
} from "./OrganizationDeletionSection";

vi.mock("@/components/AppDialogContent", () => ({
  AppDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogDescription: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogFooter: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogTitle: ({ children, ...props }: { children: ReactNode }) => <h2 {...props}>{children}</h2>,
}));

const mutationState = vi.hoisted(() => ({ requestDeletion: vi.fn() }));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: () => mutationState.requestDeletion,
  };
});

function fakeId<TableName extends "organizations" | "workflow_organizationDeletion_runs">(
  value: string,
): Id<TableName> {
  // @ts-expect-error Convex ids are strings at runtime; this component test needs stable values.
  return value;
}

const commonSettings = {
  organizationId: fakeId<"organizations">("organization_samebase"),
  githubOwnerLogin: "samebase",
  confirmationPhrase: "delete samebase",
};

function settings(
  deletion: OrganizationDeletionSettings["deletion"],
): OrganizationDeletionSettings {
  switch (deletion.state) {
    case "eligible":
      return { ...commonSettings, deletion };
    case "shared_organization":
      return { ...commonSettings, deletion };
    case "not_owner":
      return { ...commonSettings, deletion };
    case "running":
      return { ...commonSettings, deletion };
    case "needs_attention":
      return { ...commonSettings, deletion };
    default: {
      deletion satisfies never;
      throw new Error("Unexpected organization deletion state.");
    }
  }
}

function getButton(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (!descriptor || typeof descriptor.set !== "function") {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  descriptor.set.call(input, value);
}

describe("OrganizationDeletionSection", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    mutationState.requestDeletion.mockReset();
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => mountedRoot.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  async function renderSection(deletion: OrganizationDeletionSettings["deletion"]) {
    await act(async () => {
      root?.render(
        <TestRouterProvider initialEntries={["/org/samebase/settings"]}>
          <OrganizationDeletionSection settings={settings(deletion)} />
        </TestRouterProvider>,
      );
    });
    if (!rootElement) {
      throw new Error("Organization deletion section was not mounted.");
    }
    return rootElement;
  }

  it("requires the exact phrase and explains the Samebase deletion boundary", async () => {
    let finishRequest: ((value: { state: "accepted" }) => void) | undefined;
    mutationState.requestDeletion.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    const mounted = await renderSection({ state: "eligible" });

    await act(async () => getButton(mounted, "Delete organization").click());
    const dialog = mounted.querySelector<HTMLElement>("[role=dialog]");
    if (!dialog) {
      throw new Error("Organization deletion dialog was not rendered.");
    }
    expect(dialog.textContent).toContain(
      "Samebase will permanently delete this organization, its vault records, staged changes, provider connections, billing state, and saved settings.",
    );
    expect(dialog.textContent).toContain(
      "GitHub repositories, Convex projects and deployments, Cloudflare Workers, and domains will stay online. Samebase will not uninstall or delete them.",
    );
    expect(dialog.textContent).toContain("delete samebase");

    const input = dialog.querySelector<HTMLInputElement>("input");
    if (!input) {
      throw new Error("Organization deletion confirmation input was not rendered.");
    }
    const deleteButton = getButton(dialog, "Delete organization");
    expect(deleteButton.disabled).toBe(true);

    setInputValue(input, "delete Samebase");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    expect(deleteButton.disabled).toBe(true);

    setInputValue(input, "delete samebase");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    expect(deleteButton.disabled).toBe(false);

    await act(async () => {
      deleteButton.click();
      await Promise.resolve();
    });
    expect(mutationState.requestDeletion).toHaveBeenCalledWith({
      organizationId: "organization_samebase",
      confirmationPhrase: "delete samebase",
    });
    expect(getButton(dialog, "Deleting...").disabled).toBe(true);

    const resolveRequest = finishRequest;
    if (!resolveRequest) {
      throw new Error("Organization deletion request did not start.");
    }
    await act(async () => resolveRequest({ state: "accepted" }));
    expect(mounted.querySelector("[role=dialog]")).toBeNull();
  });

  it("directs a shared organization owner to Members", async () => {
    const mounted = await renderSection({ state: "shared_organization" });

    expect(mounted.textContent).toContain("Samebase will not delete a shared organization.");
    const membersLink = [...mounted.querySelectorAll("a")].find(
      (link) => link.textContent.trim() === "Members",
    );
    expect(membersLink?.getAttribute("href")).toBe("/org/samebase/settings/members");
    expect(mounted.querySelector("button")).toBeNull();
  });

  it("shows running and staff-attention states without another delete action", async () => {
    const runId = fakeId<"workflow_organizationDeletion_runs">("organization_deletion_run");
    const mounted = await renderSection({
      state: "running",
      runId,
      currentStep: "stop_billing",
      requestedAt: 1,
      latestProgressAt: 2,
    });

    expect(mounted.textContent).toContain("Samebase is deleting this organization.");
    expect(mounted.textContent).toContain(
      "GitHub repositories, Convex projects and deployments, Cloudflare Workers, and domains stay online.",
    );
    expect(mounted.querySelector("button")).toBeNull();

    await act(async () => {
      root?.render(
        <TestRouterProvider initialEntries={["/org/samebase/settings"]}>
          <OrganizationDeletionSection
            settings={settings({
              state: "needs_attention",
              runId,
              currentStep: "delete_samebase_data",
              requestedAt: 1,
              latestProgressAt: 3,
              latestSafeError: "Billing cleanup could not be confirmed.",
            })}
          />
        </TestRouterProvider>,
      );
    });

    expect(mounted.textContent).toContain(
      "Samebase has not completed organization deletion. Staff attention is required.",
    );
    expect(mounted.textContent).toContain("Billing cleanup could not be confirmed.");
    expect(mounted.querySelector("button")).toBeNull();
  });
});
