import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Force the desktop branch so the static markup stays stable in this test.
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

// Replace portal-backed dialog primitives with passthrough shells for SSR assertions.
vi.mock("@/components/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Mirror the sheet API with inert wrappers so mobile-only structure stays simple here.
vi.mock("@/components/sheet", () => ({
  Sheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

// Keep the button primitive minimal while preserving disabled-state assertions.
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
  }: {
    children?: ReactNode;
    disabled?: boolean;
  }) => <button disabled={disabled}>{children}</button>,
}));

// Keep input markup inspectable without pulling in interactive wrapper behavior.
vi.mock("@/components/input", () => ({
  Input: ({
    id,
    value,
    disabled,
    placeholder,
  }: {
    id?: string;
    value?: string;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <input
      id={id}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      readOnly
    />
  ),
}));

import { MediaUploadDialog } from "./MediaUploadDialog";

describe("MediaUploadDialog", () => {
  it("associates the Location label with the folder input and avoids an anonymous tab stop", () => {
    const markup = renderToStaticMarkup(
      <MediaUploadDialog
        isOpen={true}
        onClose={() => {}}
        fileName="cover.png"
        initialFolderPath="assets/uploads"
        folders={[
          {
            path: "assets/uploads",
            type: "tree",
          },
        ]}
        existingFilePaths={["assets/uploads/cover.png"]}
        onSubmit={() => {}}
      />,
    );

    const labelMatch = markup.match(/<label\b[^>]*\bfor=["']([^"']+)["']/);
    expect(labelMatch?.[1]).toBeTruthy();
    expect(markup).toContain(`id="${labelMatch?.[1]}"`);
    expect(markup).not.toContain('<span tabindex="0"></span>');
  });
});
