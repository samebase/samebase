"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { resolveBaseUiAsChild } from "@/lib/baseUiAsChild";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  asChild = false,
  children,
  nativeButton,
  ...props
}: CollapsiblePrimitive.Trigger.Props & {
  asChild?: boolean;
}) {
  const resolvedRenderProps = resolveBaseUiAsChild({
    asChild,
    children,
    nativeButton,
  });

  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      render={resolvedRenderProps.render}
      nativeButton={resolvedRenderProps.nativeButton}
      {...props}
    >
      {resolvedRenderProps.children}
    </CollapsiblePrimitive.Trigger>
  );
}

function CollapsibleContent({
  forceMount = false,
  ...props
}: CollapsiblePrimitive.Panel.Props & {
  forceMount?: boolean;
}) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      keepMounted={forceMount}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
