import { Link } from "@tanstack/react-router";
import { type ReactNode } from "react";

export function PublicSignupClosedNotice({ footer }: { footer?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-medium">The app is still internal.</p>
      <p className="text-sm text-muted-foreground">
        Follow{" "}
        <a href="https://x.com/samebasecom" target="_blank" rel="noopener noreferrer">
          @samebasecom
        </a>{" "}
        for updates.
      </p>
      {footer ?? (
        <Link className="text-base underline underline-offset-4" to="/">
          go back
        </Link>
      )}
    </div>
  );
}
