import * as React from "react";
import { describe, expect, it } from "vite-plus/test";

import { resolveBaseUiAsChild } from "./baseUiAsChild";

describe("resolveBaseUiAsChild", () => {
  it("marks native buttons as native buttons", () => {
    const resolved = resolveBaseUiAsChild({
      asChild: true,
      children: <button type="button">Click</button>,
    });

    expect(resolved.nativeButton).toBe(true);
  });

  it("marks composite children as non-native buttons by default", () => {
    function ExampleLink(props: { children?: React.ReactNode }) {
      return <a href="/example">{props.children}</a>;
    }

    const resolved = resolveBaseUiAsChild({
      asChild: true,
      children: <ExampleLink>Go</ExampleLink>,
    });

    expect(resolved.nativeButton).toBe(false);
  });

  it("preserves an explicit nativeButton override", () => {
    function ExampleButton(props: { children?: React.ReactNode }) {
      return <button type="button">{props.children}</button>;
    }

    const resolved = resolveBaseUiAsChild({
      asChild: true,
      children: <ExampleButton>Go</ExampleButton>,
      nativeButton: true,
    });

    expect(resolved.nativeButton).toBe(true);
  });
});
