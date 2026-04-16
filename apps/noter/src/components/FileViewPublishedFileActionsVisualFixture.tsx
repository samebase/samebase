import { FileViewPublishedFileActions } from "@/components/FileViewPublishedFileActions";
import type { FileViewPublishedFileActionsVisualMode } from "@/components/fileViewPublishedFileActionsVisualModes";

export function FileViewPublishedFileActionsVisualFixture({
  mode,
}: {
  mode: FileViewPublishedFileActionsVisualMode;
}) {
  const isPublished = mode !== "file-view-published-file-unpublished";
  const isPublishing = mode === "file-view-published-file-publishing";

  return (
    <div
      data-testid="file-view-published-file-actions-visual-fixture"
      className="min-h-screen bg-stone-100 p-10 text-stone-950"
    >
      <div className="mx-auto max-w-4xl">
        <div className="corner-notch-1 border border-stone-300 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileViewPublishedFileActions
              canRender
              hasPublishedBranchLink={isPublished}
              hasVersionedLink={isPublished}
              isPublishing={isPublishing}
              isUnpublishing={false}
              onPublish={() => {}}
              onCopyPublicLink={() => {}}
              onCopyVersionLink={() => {}}
              onUnpublish={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
