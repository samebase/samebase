import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
import { ClockIcon, GitHubLogoIcon } from "@/lib/radixIcons";

export type AddRepositoryVisualMode =
  | "add-repository-loading-more"
  | "add-repository-background-error"
  | "add-repository-retrying"
  | "add-repository-empty-final";

type RepositoryFixture = {
  id: number;
  ownerName: string;
  repoName: string;
  updatedLabel: string;
};

const RECENT_REPOSITORIES: RepositoryFixture[] = [
  {
    id: 1,
    ownerName: "noter-md",
    repoName: "noter",
    updatedLabel: "4m ago",
  },
  {
    id: 2,
    ownerName: "noter-md",
    repoName: "starter-kit",
    updatedLabel: "18m ago",
  },
  {
    id: 3,
    ownerName: "octo-org",
    repoName: "transferred-repo",
    updatedLabel: "1h ago",
  },
];

const OWNER_GUIDANCE_COPY =
  "Missing a private org repo? GitHub may be blocking Noter's OAuth app. If you're an org owner, approve Noter in the org's settings. Otherwise request access from GitHub's Authorized OAuth Apps page or ask an org owner to approve Noter.";

const FIXTURE_BY_MODE: Record<
  AddRepositoryVisualMode,
  {
    searchQuery: string;
    repositories: RepositoryFixture[];
    loadingMore: boolean;
    backgroundError: boolean;
    retrying: boolean;
    emptyMessage?: string;
  }
> = {
  "add-repository-loading-more": {
    searchQuery: "",
    repositories: RECENT_REPOSITORIES,
    loadingMore: true,
    backgroundError: false,
    retrying: false,
  },
  "add-repository-background-error": {
    searchQuery: "transferred",
    repositories: [],
    loadingMore: false,
    backgroundError: true,
    retrying: false,
    emptyMessage:
      "Couldn't finish loading the rest of your repositories. Retry to finish your search.",
  },
  "add-repository-retrying": {
    searchQuery: "transferred",
    repositories: [],
    loadingMore: true,
    backgroundError: true,
    retrying: true,
    emptyMessage: "Loading more repositories to finish your search...",
  },
  "add-repository-empty-final": {
    searchQuery: "",
    repositories: [],
    loadingMore: false,
    backgroundError: false,
    retrying: false,
  },
};

export function AddRepositoryVisualFixture({
  mode,
}: {
  mode: AddRepositoryVisualMode;
}) {
  const fixture = FIXTURE_BY_MODE[mode];

  return (
    <div
      data-testid="add-repository-visual-fixture"
      className="min-h-screen bg-background p-6 text-foreground"
    >
      <div className="mx-auto flex max-w-5xl flex-col">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GitHubLogoIcon className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">
              Connect an existing repository
            </h1>
          </div>
          <Button variant="outline">Back to Vaults</Button>
        </div>

        <div className="mb-6">
          <Input
            readOnly
            value={fixture.searchQuery}
            placeholder="Search repositories..."
            className="max-w-md"
          />
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
            {OWNER_GUIDANCE_COPY}
          </p>

          {fixture.loadingMore && (
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              Showing the 10 most recently updated repositories while we load
              the rest. Search results stay partial until loading finishes.
            </p>
          )}

          {fixture.backgroundError && (
            <div className="mt-3 flex max-w-2xl items-center justify-between gap-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 corner-notch-1">
              <div>
                Couldn&apos;t load the rest of your repositories. You&apos;re
                still seeing the most recently updated ones.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-300 bg-transparent"
                disabled={fixture.retrying}
              >
                {fixture.retrying ? "Retrying..." : "Retry"}
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {fixture.repositories.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {fixture.emptyMessage}
            </div>
          ) : (
            <div className="space-y-2">
              {fixture.repositories.map((repository) => (
                <div
                  key={repository.id}
                  className="flex items-center justify-between border p-4 transition-colors corner-notch-1"
                >
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex-1">
                      <div className="flex flex-col items-start">
                        <span className="text-sm text-muted-foreground">
                          {repository.ownerName}/
                        </span>
                        <h3 className="font-semibold">{repository.repoName}</h3>
                      </div>
                    </div>

                    <div className="flex flex-col items-end text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        <span className="text-xs">
                          {repository.updatedLabel}
                        </span>
                      </div>
                      <Button variant="outline" size="sm" className="mt-2">
                        Connect
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
