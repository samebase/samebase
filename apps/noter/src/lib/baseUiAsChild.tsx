import * as React from "react";

type AsChildElement = React.ReactElement<{ children?: React.ReactNode }>;

function inferNativeButton(element: AsChildElement): boolean | undefined {
  if (typeof element.type !== "string") {
    return undefined;
  }

  return element.type === "button";
}

/**
 * Preserves the existing Radix-style `asChild` API while delegating rendering
 * to Base UI's `render` prop under the hood.
 */
export function resolveBaseUiAsChild({
  asChild = false,
  children,
  nativeButton,
}: {
  asChild?: boolean;
  children: React.ReactNode;
  nativeButton?: boolean;
}): {
  children: React.ReactNode;
  render?: AsChildElement;
  nativeButton?: boolean;
} {
  if (!asChild) {
    return { children, nativeButton };
  }

  const child = React.Children.only(children);

  if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
    throw new Error(
      "Base UI compatibility wrappers require a single React element when `asChild` is true.",
    );
  }

  return {
    children: child.props.children,
    render: child,
    nativeButton: nativeButton ?? inferNativeButton(child),
  };
}
