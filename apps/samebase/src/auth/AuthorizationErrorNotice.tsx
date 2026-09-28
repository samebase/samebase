import type { ReactNode } from "react";

export function AuthorizationErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div
      className="corner-notch-1 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground"
      role="alert"
    >
      {children}
    </div>
  );
}
