import * as React from "react";

type AsChildElement = React.ReactElement<{ children?: React.ReactNode }>;

function inferNativeButton(element: AsChildElement): boolean {
  if (typeof element.type !== "string") {
    // Base UI defaults `nativeButton` to true, so composite `render` targets
    // like TanStack Link need an explicit false unless a caller opts in.
    return false;
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
  nativeButton?: boolean | undefined;
}): {
  children: React.ReactNode;
  render?: AsChildElement;
  nativeButton?: boolean;
} {
  if (!asChild) {
    return {
      children,
      ...(nativeButton === undefined ? {} : { nativeButton }),
    };
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
