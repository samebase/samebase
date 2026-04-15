import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Input } from "@/components/input";
import { Button } from "@/components/ui/button";
import {
  clearPublicLandingWaitlistDraft,
  readPublicLandingWaitlistDraft,
  writePublicLandingWaitlistDraft,
} from "@/lib/publicLandingWaitlistDraft";

/**
 * Keep the public waitlist entrypoint identical across landing and other
 * public-gated surfaces so users only learn one request-access path.
 */
export function PublicWaitlistForm({
  submittedMessage,
}: {
  submittedMessage: string;
}) {
  const joinWaitlist = useMutation(api.waitlist.joinWaitlist);
  const [email, setEmail] = useState(readPublicLandingWaitlistDraft);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    writePublicLandingWaitlistDraft(email);
  }, [email]);

  useEffect(() => {
    return () => {
      clearPublicLandingWaitlistDraft();
    };
  }, []);

  if (submitted) {
    return (
      <p
        data-testid="public-waitlist-submitted"
        className="text-sm text-muted-foreground text-center"
      >
        {submittedMessage}
      </p>
    );
  }

  return (
    <div
      data-testid="public-waitlist-form"
      className="flex flex-col gap-2 pt-2"
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!email.trim()) {
            return;
          }
          void joinWaitlist({ email: email.trim() }).then(() => {
            clearPublicLandingWaitlistDraft();
            setSubmitted(true);
          });
        }}
      >
        <Input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Button type="submit" variant="outline" className="shrink-0">
          Join Waitlist
        </Button>
      </form>
    </div>
  );
}
