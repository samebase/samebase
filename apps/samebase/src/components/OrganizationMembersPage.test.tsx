// @vitest-environment jsdom

import type { ViewerOrganization } from "@/lib/organizationContext";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { OrganizationMembersPage } from "./OrganizationMembersPage";

const testState = vi.hoisted(() => ({
  pageQueryArgs: new Array<{ now: number; organizationId: unknown }>(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isError: false }),
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useQuery: (_reference: unknown, args: { now: number; organizationId: unknown }) => {
    testState.pageQueryArgs.push(args);
    return undefined;
  },
}));

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; the test only needs a stable identity.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization",
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner",
} satisfies ViewerOrganization;

describe("OrganizationMembersPage", () => {
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:34:45.000Z"));
    testState.pageQueryArgs = [];
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    rootElement.remove();
    vi.useRealTimers();
  });

  it("refreshes pending invitation time while the page stays open", async () => {
    await act(async () => root.render(<OrganizationMembersPage organization={organization} />));

    expect(testState.pageQueryArgs.at(-1)?.now).toBe(
      new Date("2026-08-11T12:34:00.000Z").getTime(),
    );

    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(testState.pageQueryArgs.at(-1)?.now).toBe(
      new Date("2026-08-11T12:35:00.000Z").getTime(),
    );
  });
});
