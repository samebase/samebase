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
  onChange: (owner: GitHubOwner) => void;
}) {
  if (owners.length < 2) {
    return null;
  }

  return (
    <Select
      items={owners.map((owner) => ({
        label: owner.githubOwnerLogin,
        value: owner.organizationId,
      }))}
      value={selectedOrganizationId ?? undefined}
      onValueChange={(organizationId) => {
        const owner = owners.find((candidate) => candidate.organizationId === organizationId);
        if (owner) {
          onChange(owner);
        }
      }}
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
