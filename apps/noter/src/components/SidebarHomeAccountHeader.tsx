import { SidebarAccountSection } from "#src/components/SidebarAccountSection.tsx";
import { UserMenu } from "#src/components/UserMenu.tsx";
import { Button } from "#src/components/ui/button.tsx";
import { Link } from "@tanstack/react-router";

/**
 * Keep repository routes consistent by hosting the dashboard return control in
 * the left sidebar next to the account menu.
 */
export function SidebarHomeAccountHeader({
  userDisplayName,
  dataTestId,
}: {
  userDisplayName: string;
  dataTestId?: string;
}) {
  return (
    <SidebarAccountSection dataTestId={dataTestId}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" className="h-8 px-2 md:h-6" asChild>
          <Link to="/">Dashboard</Link>
        </Button>
        <UserMenu menuLabel={userDisplayName} />
      </div>
    </SidebarAccountSection>
  );
}
