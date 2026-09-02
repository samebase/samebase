import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { EditedFilesCategories } from "./EditedFilesCategories";

describe("EditedFilesCategories", () => {
  it("renders outside the file-view route without requiring an active /repo/$ match", () => {
    expect(() =>
      renderToStaticMarkup(
        <TestRouterProvider initialEntries={["/logo"]}>
          <EditedFilesCategories
            branch="main"
            categories={{
              deleted: [],
              modified: [],
              new: [],
              renamed: [],
              renamedAndModified: [],
            }}
            repositoryFullName="samebase/samebase"
          />
        </TestRouterProvider>,
      ),
    ).not.toThrow();
  });
});
