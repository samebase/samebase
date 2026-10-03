import {
  EmailMonitor,
  type EmailButtonProps,
  type EmailSelectProps,
} from "@samebase/convex-cloudflare-email-inbox-ui";
import "@samebase/convex-cloudflare-email-inbox-ui/styles.css";
import { createFileRoute } from "@tanstack/react-router";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { api } from "../../convex/_generated/api";

function EmailButton({ appearance, className, ...props }: EmailButtonProps) {
  return (
    <Button
      {...props}
      variant={appearance === "text" ? "link" : "outline"}
      className={cn(
        appearance === "text" ? "h-auto justify-start p-0 text-left whitespace-normal" : undefined,
        className,
      )}
    />
  );
}

function EmailSelect({ id, value, onValueChange, options }: EmailSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} items={options}>
      <SelectTrigger id={id} className="max-w-full text-base">
        <SelectValue />
      </SelectTrigger>
      <AppSelectContent>
        {options.map((option) => (
          <AppSelectItem key={option.value} value={option.value}>
            {option.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </Select>
  );
}

const emailControls = { Button: EmailButton, Select: EmailSelect };

function AdminEmailsRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <main
        data-testid="admin-emails-page"
        data-posthog-block
        className="container mx-auto w-full max-w-6xl py-6 [--sb-email-border:hsl(var(--border))] [--sb-email-muted:hsl(var(--muted-foreground))] [--sb-email-selected:hsl(var(--muted))]"
      >
        <h1 className="mb-6 text-xl font-semibold @2xl:text-2xl">Emails</h1>
        <EmailMonitor api={api.emailMonitor} controls={emailControls} />
      </main>
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/admin/emails")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/admin/emails"],
  component: AdminEmailsRouteComponent,
});
