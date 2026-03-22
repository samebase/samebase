import { ChevronDownIcon } from "@radix-ui/react-icons";
import { type ReactNode } from "react";
import { Button } from "@/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";

/**
 * Keeps dashboard sidebar panels compact so the project list remains the main
 * focus of the dashboard.
 */
export function DashboardSidebarSection({
  title,
  description,
  children,
  open = true,
  onOpenChange,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <section className="border-b border-border/50 px-3 py-3 last:border-b-0">
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        className="space-y-2"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-between px-0 text-sm font-medium hover:bg-transparent [&[data-state=open]>svg]:rotate-180"
          >
            <span>{title}</span>
            <ChevronDownIcon className="h-4 w-4 transition-transform" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent
          forceMount
          className="space-y-2 data-[state=closed]:hidden"
        >
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
          <div>{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
