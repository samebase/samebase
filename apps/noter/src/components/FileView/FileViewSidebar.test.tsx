import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileViewSidebarFooter } from "./FileViewSidebar";

describe("FileViewSidebarFooter", () => {
  it("announces upload errors as alerts", () => {
    const markup = renderToStaticMarkup(
      <FileViewSidebarFooter
        mediaUploadError="Upload failed."
        isMediaUploadDragOver={false}
        isUploadingMedia={false}
        onRequestMediaUpload={() => {}}
        onMediaUploadDragOverChange={() => {}}
        onMediaUploadDrop={() => {}}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Upload failed.");
  });
});
