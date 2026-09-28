import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    disabled,
    variant,
  }: {
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button className={className} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

import { AppBootFailureState } from "@/appShell/AppBootFailureState";

describe("AppBootFailureState", () => {
  it("renders the stale-asset recovery copy", () => {
    const markup = renderToStaticMarkup(
      <AppBootFailureState error={new Error("Failed to fetch dynamically imported module")} />,
    );

    expect(markup).toContain("Samebase updated while this tab was open.");
    expect(markup).toContain("Reset local data");
    expect(markup).toContain("Build:");
  });

  it("renders the generic startup failure copy", () => {
    const markup = renderToStaticMarkup(
      <AppBootFailureState error={new Error("Unexpected token")} />,
    );

    expect(markup).toContain("Samebase could not finish loading.");
    expect(markup).toContain("Error: Unexpected token");
  });
});
