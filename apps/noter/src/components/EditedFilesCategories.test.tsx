import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { TestRouterProvider } from "#src/test/TestRouterProvider.tsx";
import { EditedFilesCategories } from "./EditedFilesCategories";

describe("EditedFilesCategories", () => {
  it("renders outside the file-view route without requiring an active /vault/$ match", () => {
    expect(() =>
      renderToStaticMarkup(
        <TestRouterProvider initialEntries={["/machines?mobileLineNumbers=1"]}>
          <EditedFilesCategories
            branch="main"
            categories={{
              deleted: [],
              modified: [],
              new: [],
              renamed: [],
              renamedAndModified: [],
            }}
            repositoryFullName="noter-md/noter"
          />
        </TestRouterProvider>,
      ),
    ).not.toThrow();
  });
});
