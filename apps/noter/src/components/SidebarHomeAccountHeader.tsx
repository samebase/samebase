import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

/**
 * Keep repository routes consistent by hosting the dashboard return control in
 * the left sidebar next to the account menu.
 */
export function SidebarHomeAccountHeader({
  userDisplayName,
  dataTestId,
  compact = false,
}: {
  userDisplayName: string;
  dataTestId?: string;
  compact?: boolean;
}) {
  return (
    <SidebarAccountSection dataTestId={dataTestId}>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className={
            compact
              ? "h-7 px-2 text-[12px] font-medium md:h-6 md:text-[11px]"
              : "h-8 px-2 md:h-6"
          }
          asChild
        >
          <Link to="/">Dashboard</Link>
        </Button>
        <UserMenu
          className="shrink-0"
          compact={compact}
          menuLabel={userDisplayName}
        />
      </div>
    </SidebarAccountSection>
  );
}
