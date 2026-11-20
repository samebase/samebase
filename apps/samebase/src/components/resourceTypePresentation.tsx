import { resourceTypeUI } from "@samebase/alchemy-kit/ui";
import { createElement } from "react";

export function resourceTypePresentation(resourceType: string) {
  const { name, icon, color } = resourceTypeUI(resourceType);
  return {
    label: name,
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke={color ?? "currentColor"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon.map(([tag, attributes], index) => createElement(tag, { key: index, ...attributes }))}
      </svg>
    ),
  };
}
