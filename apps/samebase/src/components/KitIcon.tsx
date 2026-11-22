import type { IconNode } from "@samebase/alchemy-kit/ui";
import { createElement } from "react";

/** A Lucide drawing from `@samebase/alchemy-kit/ui`, stroked in `color` or the text colour. */
export function KitIcon({
  icon,
  color,
  className,
}: {
  icon: IconNode;
  color?: string;
  className: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon.map(([tag, attributes], index) => createElement(tag, { key: index, ...attributes }))}
    </svg>
  );
}
