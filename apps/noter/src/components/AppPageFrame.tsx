import { type ReactNode } from "react";

/**
 * Keep one normal page shell across the app so the browser owns page scroll
 * and route surfaces can opt into local containment only where they need it.
 */
export function AppPageFrame({
  children,
  dataTestId,
}: {
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <main
      data-testid={dataTestId}
      className="flex min-h-svh w-full flex-col bg-background"
    >
      {children}
    </main>
  );
}
