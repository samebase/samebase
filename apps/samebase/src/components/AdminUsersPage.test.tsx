// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";

const testState = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  loadMore: vi.fn(),
  results: [
    {
      userId: "user_active",
      email: "active@example.test",
      state: "active" as const,
      isApproved: false,
      isCurrentUser: false,
      providers: ["github", "google"],
      createdAt: Date.UTC(2026, 7, 19, 10),
    },
    {
      userId: "user_current",
      email: "current@example.test",
      state: "active" as const,
      isApproved: true,
      isCurrentUser: true,
      providers: ["password"],
      createdAt: Date.UTC(2026, 7, 19, 9),
    },
    {
      userId: "user_deleting",
      email: "deleting@example.test",
      state: "deleting" as const,
      isApproved: true,
      isCurrentUser: false,
      providers: ["password"],
      createdAt: Date.UTC(2026, 7, 18, 9),
    },
    {
      userId: "user_deleted",
      state: "deleted" as const,
      isApproved: false,
      isCurrentUser: false,
      providers: [],
      createdAt: Date.UTC(2026, 7, 17, 9),
    },
  ],
  status: "Exhausted",
}));

vi.mock("convex/react", () => ({
  useMutation: () => testState.deleteUser,
  usePaginatedQuery: () => ({
    loadMore: testState.loadMore,
    results: testState.results,
    status: testState.status,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/components/AppDialogContent", () => ({
  AppDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: ComponentProps<"button"> & { size?: string; variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  buttonVariants: () => "button",
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

import { AdminUsersPage } from "./AdminUsersPage";

function fakeUserId(value: string): Id<"users"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs stable values.
  return value;
}

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountPage() {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
  await act(async () => {
    root?.render(<AdminUsersPage />);
  });
  return rootElement;
}

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    testState.deleteUser.mockReset();
    testState.deleteUser.mockResolvedValue(undefined);
    testState.loadMore.mockReset();
    testState.status = "Exhausted";
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("lists every account and sends the current account to Settings", async () => {
    const container = await mountPage();
    const rows = Array.from(container.querySelectorAll("tbody tr"));

    expect(container.querySelector("[data-posthog-mask]")).not.toBeNull();
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain("active@example.test");
    expect(rows[0]?.textContent).toContain("github, google");
    expect(rows[0]?.textContent).toContain("Pending");
    expect(rows[0]?.querySelector("button")?.disabled).toBe(false);
    expect(rows[1]?.textContent).toContain("current@example.test");
    expect(rows[1]?.querySelector('a[href="/settings"]')?.textContent).toBe("Settings");
    expect(rows[2]?.textContent).toContain("deleting@example.test");
    expect(rows[2]?.textContent).toContain("Deleting");
    expect(rows[2]?.querySelector("button")?.disabled).toBe(true);
    expect(rows[3]?.textContent).toContain("Scrubbed");
    expect(rows[3]?.textContent).toContain("Deleted");
    expect(rows[3]?.querySelector("button")?.disabled).toBe(true);
  });

  it("requires confirmation and disables delete triggers while the request is pending", async () => {
    let resolveDelete: (() => void) | undefined;
    testState.deleteUser.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const container = await mountPage();
    const deleteTrigger = findButton(container, "Delete");
    if (deleteTrigger === undefined) {
      throw new Error("Active user delete trigger was not found.");
    }

    await act(async () => deleteTrigger.click());
    expect(testState.deleteUser).not.toHaveBeenCalled();
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.textContent).toContain("active@example.test");
    expect(dialog?.textContent).toContain("Permanent deletion starts in seven days.");

    const confirmDelete = dialog === null ? undefined : findButton(dialog, "Delete");
    if (confirmDelete === undefined) {
      throw new Error("Confirmation delete action was not found.");
    }
    await act(async () => confirmDelete.click());

    expect(testState.deleteUser).toHaveBeenCalledWith({ userId: fakeUserId("user_active") });
    expect(
      Array.from(container.querySelectorAll("button")).every((button) => button.disabled),
    ).toBe(true);
    expect(container.textContent).toContain("Queuing...");

    await act(async () => resolveDelete?.());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
