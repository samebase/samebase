import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type GitHubOwner = (typeof api.organizations.listForViewer)["_returnType"][number];

export function GitHubOwnerSelect({
  disabled,
  owners,
  selectedOrganizationId,
  onChange,
}: {
  disabled: boolean;
  owners: GitHubOwner[];
  selectedOrganizationId: Id<"organizations"> | null;
  onChange: (organizationId: Id<"organizations">) => void;
}) {
  if (owners.length < 2) {
    return null;
  }

  return (
    <Select
      value={selectedOrganizationId ?? undefined}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full" aria-label="GitHub owner">
        <SelectValue placeholder="GitHub owner" />
      </SelectTrigger>
      <AppSelectContent>
        {owners.map((owner) => (
          <AppSelectItem key={owner.organizationId} value={owner.organizationId}>
            {owner.githubOwnerLogin}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </Select>
  );
}
