import { FileViewPushActions } from "@/components/FileViewPushActions";

export type FileViewPushActionsVisualMode =
  | "file-view-push-ready"
  | "file-view-open-pr";

export function FileViewPushActionsVisualFixture({
  mode,
}: {
  mode: FileViewPushActionsVisualMode;
}) {
  const isOpenPullRequestMode = mode === "file-view-open-pr";

  return (
    <div
      data-testid="file-view-push-actions-visual-fixture"
      className="min-h-screen bg-stone-100 p-10 text-stone-950"
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            File View Push Actions
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Visual fixture for the primary branch actions near the editor
            header.
          </p>
        </div>

        <div className="corner-notch-1 border border-stone-300 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileViewPushActions
              canOpenOrCreateDraftPullRequest
              currentPullRequestNumber={isOpenPullRequestMode ? 999 : undefined}
              currentPullRequestUrl={
                isOpenPullRequestMode
                  ? "https://github.com/noter-md/noter/pull/999"
                  : undefined
              }
              hasChangesToCommit={!isOpenPullRequestMode}
              isCreatingDraftPullRequest={false}
              isPushing={false}
              onDraftPullRequest={() => {}}
              onManualCommit={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
