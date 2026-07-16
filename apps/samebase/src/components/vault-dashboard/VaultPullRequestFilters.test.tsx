// @vitest-environment jsdom

import * as React from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/hooks/useCoarsePointer", () => ({ useCoarsePointer: () => false }));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked === true}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    />
  ),
}));

import { VaultPullRequestFiltersControl } from "./VaultPullRequestFilters";
import type { RepositoryInventoryFilters } from "./repositoryInventoryFilters";

const { act } = React;

describe("VaultPullRequestFiltersControl", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
  });

  it("keeps emitting complete filter values for each existing control", () => {
    const value: RepositoryInventoryFilters = {
      hiddenLabels: ["research"],
      includeDrafts: true,
      includeNoLabel: false,
    };
    const changes: RepositoryInventoryFilters[] = [];
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <VaultPullRequestFiltersControl
          value={value}
          options={[
            {
              kind: "label",
              key: "research",
              name: "research",
              pullRequestCount: 3,
              included: false,
            },
            {
              kind: "no_label",
              key: "no-label",
              name: "No label",
              pullRequestCount: 2,
              included: false,
            },
          ]}
          onChange={(nextValue) => changes.push(nextValue)}
        />,
      );
    });

    const checkboxes = rootElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    act(() => {
      checkboxes[0]?.click();
      checkboxes[1]?.click();
      checkboxes[2]?.click();
      Array.from(rootElement?.querySelectorAll("button") ?? [])
        .find((button) => button.textContent === "Reset all")
        ?.click();
    });

    expect(changes).toEqual([
      { hiddenLabels: [], includeDrafts: true, includeNoLabel: false },
      { hiddenLabels: ["research"], includeDrafts: true, includeNoLabel: true },
      { hiddenLabels: ["research"], includeDrafts: false, includeNoLabel: false },
      { hiddenLabels: [], includeDrafts: false, includeNoLabel: true },
    ]);
  });
});
