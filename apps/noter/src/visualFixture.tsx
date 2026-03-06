import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { DialogProvider } from "@/contexts/DialogContext";
import {
  CommitReviewVisualFixture,
  type CommitReviewVisualMode,
} from "@/components/CommitReviewVisualFixture";
import {
  RepositoryMediaVisualFixture,
  type RepositoryMediaVisualMode,
} from "@/components/RepositoryMediaVisualFixture";
import "./index.css";

type VisualFixtureMode = CommitReviewVisualMode | RepositoryMediaVisualMode;

function readMode(): VisualFixtureMode {
  const value = new URLSearchParams(window.location.search).get("mode");
  if (
    value === "rich" ||
    value === "patch" ||
    value === "deleted" ||
    value === "fallback" ||
    value === "media-png" ||
    value === "media-svg"
  ) {
    return value;
  }
  return "rich";
}

const mode = readMode();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <DialogProvider>
        {mode === "media-png" || mode === "media-svg" ? (
          <RepositoryMediaVisualFixture mode={mode} />
        ) : (
          <CommitReviewVisualFixture mode={mode} />
        )}
      </DialogProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
