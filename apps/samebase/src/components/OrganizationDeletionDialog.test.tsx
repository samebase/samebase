// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";
import type { ViewerOrganization } from "@/lib/organizationContext";

const testState = vi.hoisted(() => ({
  deleteOrganization: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => testState.deleteOrganization,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: testState.navigate }),
}));

vi.mock("@/components/AppDialogContent", () => ({
  AppDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ComponentProps<"button"> & { variant?: string }) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: (props: ComponentProps<"label">) => <label {...props} />,
}));

import { OrganizationDeletionDialog } from "./OrganizationDeletionDialog";

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs a stable value.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization" as const,
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner" as const,
} satisfies ViewerOrganization;

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountDialog() {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
  await act(async () => {
    root?.render(<OrganizationDeletionDialog organization={organization} onClose={vi.fn()} />);
  });
  return rootElement;
}

async function enterConfirmation(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>("input");
  if (input === null) {
    throw new Error("Organization confirmation input was not found.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (descriptor?.set === undefined) {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  descriptor.set.call(input, organization.githubOwnerLogin);
  await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
}

function findDeleteButton(container: HTMLElement) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Delete organization",
  );
}

describe("OrganizationDeletionDialog", () => {
  beforeEach(() => {
    testState.deleteOrganization.mockReset();
    testState.deleteOrganization.mockResolvedValue(null);
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("lets the last owner confirm deletion and leaves the removed organization route", async () => {
    const container = await mountDialog();
    const deleteButton = findDeleteButton(container);
    if (deleteButton === undefined) {
      throw new Error("Organization delete button was not found.");
    }
    expect(deleteButton.disabled).toBe(true);

    await enterConfirmation(container);
    expect(deleteButton.disabled).toBe(false);
    await act(async () => {
      deleteButton.click();
      await vi.waitFor(() => expect(testState.deleteOrganization).toHaveBeenCalledOnce());
    });

    expect(testState.deleteOrganization).toHaveBeenCalledWith({
      organizationId: organization.organizationId,
      deletionConfirmationText: organization.githubOwnerLogin,
    });
    expect(testState.navigate).toHaveBeenCalledWith({ href: "/vault", replace: true });
  });
});
