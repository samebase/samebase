import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PublicWaitlistForm } from "@/components/PublicWaitlistForm";

/**
 * Until publish-link records exist in Convex, the public file route should
 * fail closed with a product-specific explanation instead of the generic app
 * 404. This keeps the route stable while giving interested users a real next
 * step.
 */
export function PublishedFileRoutePage({ pathname }: { pathname: string }) {
  return (
    <div className="container my-auto">
      <div
        data-testid="published-file-unavailable-content"
        className="mx-auto flex max-w-[384px] flex-col gap-4 py-16 text-center"
      >
        <h2 className="text-xl font-semibold tracking-tight">
          This file is not public
        </h2>
        <p className="text-sm text-muted-foreground">
          Either this file does not exist or it has not been published yet. Join
          the waitlist and you&apos;ll be able to publish and share files like
          this once your spot opens up.
        </p>
        <code className="max-w-full overflow-x-auto text-xs text-muted-foreground">
          {pathname}
        </code>
        <PublicWaitlistForm submittedMessage="You're on the waitlist. We'll let you know when published file links open up." />
        <Button asChild variant="outline">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
