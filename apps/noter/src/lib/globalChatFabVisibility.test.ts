import { describe, expect, it } from "vitest";
import { MACHINES_ROUTE, MACHINES_V2_ROUTE } from "@/lib/noterSync";
import { shouldShowGlobalChatFab } from "@/lib/globalChatFabVisibility";

describe("shouldShowGlobalChatFab", () => {
  it("hides the global chat fab on routes with dedicated chat surfaces", () => {
    expect(shouldShowGlobalChatFab("/")).toBe(false);
    expect(shouldShowGlobalChatFab("/vault/acme/noter/main")).toBe(false);
    expect(shouldShowGlobalChatFab(MACHINES_ROUTE)).toBe(false);
    expect(shouldShowGlobalChatFab(MACHINES_V2_ROUTE)).toBe(false);
  });

  it("keeps the global chat fab on unrelated routes", () => {
    expect(shouldShowGlobalChatFab("/add")).toBe(true);
    expect(shouldShowGlobalChatFab("/pricing")).toBe(true);
    expect(shouldShowGlobalChatFab("/research/codex-app-server")).toBe(true);
  });
});
