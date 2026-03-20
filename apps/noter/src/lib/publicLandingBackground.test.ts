import { describe, expect, it } from "vitest";
import {
  clearPublicLandingHoverPosition,
  updatePublicLandingHoverPosition,
} from "./publicLandingBackground";

function createStyleStore() {
  const values = new Map<string, string>();

  return {
    getPropertyValue(name: string) {
      return values.get(name) ?? "";
    },
    setProperty(name: string, value: string) {
      values.set(name, value);
    },
  };
}

describe("publicLandingBackground", () => {
  it("writes rounded hover coordinates relative to the landing surface", () => {
    const element = {
      getBoundingClientRect: () =>
        ({
          bottom: 420,
          height: 400,
          left: 24,
          right: 344,
          top: 20,
          width: 320,
          x: 24,
          y: 20,
          toJSON: () => ({}),
        }) satisfies DOMRect,
      style: createStyleStore(),
    };

    updatePublicLandingHoverPosition(element, 145.7, 93.2);

    expect(element.style.getPropertyValue("--public-landing-hover-x")).toBe(
      "122px",
    );
    expect(element.style.getPropertyValue("--public-landing-hover-y")).toBe(
      "73px",
    );
    expect(
      element.style.getPropertyValue("--public-landing-hover-opacity"),
    ).toBe("1");
  });

  it("hides the hover tint without clearing the last coordinates", () => {
    const element = {
      getBoundingClientRect: () =>
        ({
          bottom: 420,
          height: 400,
          left: 24,
          right: 344,
          top: 20,
          width: 320,
          x: 24,
          y: 20,
          toJSON: () => ({}),
        }) satisfies DOMRect,
      style: createStyleStore(),
    };
    element.style.setProperty("--public-landing-hover-x", "120px");
    element.style.setProperty("--public-landing-hover-y", "64px");

    clearPublicLandingHoverPosition(element);

    expect(
      element.style.getPropertyValue("--public-landing-hover-opacity"),
    ).toBe("0");
    expect(element.style.getPropertyValue("--public-landing-hover-x")).toBe(
      "120px",
    );
    expect(element.style.getPropertyValue("--public-landing-hover-y")).toBe(
      "64px",
    );
  });
});
