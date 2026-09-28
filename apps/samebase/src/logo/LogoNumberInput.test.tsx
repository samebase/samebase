// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { LogoNumberInput } from "./LogoNumberInput";

const { act } = React;

function formatInteger(value: number): string {
  return Math.round(value).toString();
}

function normalizeInteger(value: number): number {
  return Math.round(value);
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (!descriptor || typeof descriptor.set !== "function") {
    throw new Error("Expected native input value setter.");
  }

  descriptor.set.call(input, value);
}

function dispatchInput(input: HTMLInputElement, value: string) {
  setNativeInputValue(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function dispatchBlur(input: HTMLInputElement) {
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

function renderNumberInput({
  onValueChange,
  value,
}: {
  onValueChange: (value: number) => void;
  value: number;
}) {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  const render = (nextValue: number) => {
    act(() => {
      root.render(
        <LogoNumberInput
          ariaLabel="Grid size"
          formatValue={formatInteger}
          inputMode="numeric"
          normalizeValue={normalizeInteger}
          onValueChange={onValueChange}
          step="1"
          value={nextValue}
          variant="preview"
        />,
      );
    });
  };

  render(value);

  const input = rootElement.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected rendered number input.");
  }

  return { input, render, root };
}

describe("LogoNumberInput", () => {
  let root: Root | null = null;

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot !== null) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    document.body.replaceChildren();
  });

  it("does not emit unchanged normalized values", () => {
    const onValueChange = vi.fn<(value: number) => void>();
    const rendered = renderNumberInput({ onValueChange, value: 10 });
    root = rendered.root;

    act(() => {
      dispatchInput(rendered.input, "10");
    });
    act(() => {
      dispatchBlur(rendered.input);
    });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(rendered.input.value).toBe("10");
  });

  it("survives route rerenders with unchanged formatted values", () => {
    const onValueChange = vi.fn<(value: number) => void>();
    const rendered = renderNumberInput({ onValueChange, value: 10 });
    root = rendered.root;

    for (let index = 0; index < 80; index += 1) {
      rendered.render(10);
    }

    expect(onValueChange).not.toHaveBeenCalled();
    expect(rendered.input.value).toBe("10");
  });
});
