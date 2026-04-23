import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/ProsemarkReadOnly", () => ({
  ProsemarkReadOnly: ({
    value,
    className,
    styleVariant,
  }: {
    value: string;
    className?: string;
    styleVariant?: string;
  }) => (
    <div
      data-component="ProsemarkReadOnly"
      data-style-variant={styleVariant}
      className={className}
    >
      {value}
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    disabled,
    size,
    variant,
  }: {
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
    size?: string;
    variant?: string;
  }) => (
    <button
      className={className}
      disabled={disabled}
      data-size={size}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

import { DaytonaPreviewErrorState } from "./DaytonaPreviewErrorState";

describe("DaytonaPreviewErrorState", () => {
  it("matches the default landing-style error snapshot", () => {
    const markup = renderToStaticMarkup(
      <DaytonaPreviewErrorState
        message={`Latest snapshot failed: pnpm install failed\nCheck the bootstrap log for details.`}
        isLoading={false}
        onShowPreview={() => {}}
        onResetToGitHub={() => {}}
      />,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="mt-3 corner-notch-1 border bg-background/70 p-3"><div data-component="ProsemarkReadOnly" data-style-variant="landingCopy" class="text-sm leading-6">## daytona preview error

- Latest snapshot failed: pnpm install failed
- Check the bootstrap log for details.</div><div class="mt-3 flex flex-wrap items-center gap-2"><button data-size="sm" data-variant="outline">Show Preview</button><button class="text-orange-600 hover:text-orange-700" data-size="sm" data-variant="outline">Reset to GitHub</button></div></div>"`,
    );
  });

  it("matches the loading and resetting snapshot", () => {
    const markup = renderToStaticMarkup(
      <DaytonaPreviewErrorState
        message="Preview URL is not ready yet."
        isLoading
        onShowPreview={() => {}}
        onResetToGitHub={() => {}}
        isResettingToGitHub
      />,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="mt-3 corner-notch-1 border bg-background/70 p-3"><div data-component="ProsemarkReadOnly" data-style-variant="landingCopy" class="text-sm leading-6">## daytona preview error

- Preview URL is not ready yet.</div><div class="mt-3 flex flex-wrap items-center gap-2"><button disabled="" data-size="sm" data-variant="outline"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>Loading...</button><button class="text-orange-600 hover:text-orange-700" disabled="" data-size="sm" data-variant="outline">Resetting...</button></div></div>"`,
    );
  });
});
