import { describe, expect, it } from "vite-plus/test";
import {
  PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM,
  isPublicLayoutSidebarResetRequested,
} from "./publicLayoutSidebarPreferences";

describe("publicLayoutSidebarPreferences", () => {
  it("keeps search-param reader flag parsing aligned with parsed search records", () => {
    const enabledSearchParams = {
      get: (key: string) =>
        key === PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM ? "" : null,
    };
    const disabledSearchParams = {
      get: (key: string) =>
        key === PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM ? "false" : null,
    };

    expect(isPublicLayoutSidebarResetRequested(enabledSearchParams)).toBe(true);
    expect(
      isPublicLayoutSidebarResetRequested({
        [PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM]: "",
      }),
    ).toBe(true);

    expect(isPublicLayoutSidebarResetRequested(disabledSearchParams)).toBe(
      false,
    );
    expect(
      isPublicLayoutSidebarResetRequested({
        [PUBLIC_LAYOUT_SIDEBAR_RESET_QUERY_PARAM]: "false",
      }),
    ).toBe(false);
  });
});
