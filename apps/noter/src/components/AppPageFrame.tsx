import { type ReactNode } from "react";

/**
 * Keep one normal page shell across the app so the browser owns page scroll
 * and route surfaces can opt into local containment only where they need it.
 */
export function AppPageFrame({
  children,
  dataTestId,
  bottomBar,
}: {
  children: ReactNode;
  dataTestId?: string;
  bottomBar?: ReactNode;
}) {
  return (
    <div
      data-testid={dataTestId}
      className="flex min-h-svh w-full flex-col bg-background"
    >
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>

      <div className="h-5 shrink-0 border-t border-border">
        <div className="container flex h-full items-center overflow-hidden text-xs leading-none text-muted-foreground">
          {bottomBar}
        </div>
      </div>
    </div>
  );
}
