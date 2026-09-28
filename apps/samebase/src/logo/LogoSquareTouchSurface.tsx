import { type ReactNode } from "react";

const LOGO_SQUARE_TOUCH_SURFACE_SIZE = "min(100cqw, 100cqh, 22rem, calc(100svh - 12rem))";

export function LogoSquareTouchSurface({
  children,
  dataTestId,
  size = "pane",
}: {
  children: ReactNode;
  dataTestId?: string;
  size?: "landing" | "pane";
}) {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center @container-[size]">
      {/* Keep touch capture square so mobile top and bottom drag lanes stay free. */}
      <div
        className={
          size === "pane"
            ? "relative size-[min(100cqw,100cqh)] [@media(pointer:coarse)]:size-[max(12rem,min(100cqw,calc(100cqh-12rem)))]"
            : "relative"
        }
        data-testid={dataTestId}
        style={
          size === "landing"
            ? { height: LOGO_SQUARE_TOUCH_SURFACE_SIZE, width: LOGO_SQUARE_TOUCH_SURFACE_SIZE }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
