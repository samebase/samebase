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
import {
  SimpleViewVisualFixture,
  type SimpleViewVisualMode,
} from "@/components/SimpleViewVisualFixture";
import { CornerNotchVisualFixture } from "@/components/CornerNotchVisualFixture";
import {
  LogoThreeVisualFixture,
  type LogoThreeVisualMode,
} from "@/components/LogoThreeVisualFixture";
import {
  LandingCopyVisualFixture,
  type LandingCopyVisualMode,
} from "@/components/LandingCopyVisualFixture";
import "./index.css";

type VisualFixtureMode =
  | CommitReviewVisualMode
  | LandingCopyVisualMode
  | LogoThreeVisualMode
  | RepositoryMediaVisualMode
  | SimpleViewVisualMode
  | "corner-notch";

function readMode(): VisualFixtureMode {
  const value = new URLSearchParams(window.location.search).get("mode");
  if (
    value === "inline" ||
    value === "deleted" ||
    value === "deleted-markdown-link" ||
    value === "trailing-newline-only" ||
    value === "unchanged" ||
    value === "conflict" ||
    value === "logo-three-reference" ||
    value === "media-png" ||
    value === "media-svg" ||
    value === "landing-copy-parity" ||
    value === "simple-repository-config" ||
    value === "simple-missing-config" ||
    value === "corner-notch"
  ) {
    return value;
  }
  return "inline";
}

const mode = readMode();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <DialogProvider>
        {mode === "media-png" || mode === "media-svg" ? (
          <RepositoryMediaVisualFixture mode={mode} />
        ) : mode === "landing-copy-parity" ? (
          <LandingCopyVisualFixture />
        ) : mode === "logo-three-reference" ? (
          <LogoThreeVisualFixture />
        ) : mode === "simple-repository-config" ||
          mode === "simple-missing-config" ? (
          <SimpleViewVisualFixture mode={mode} />
        ) : mode === "corner-notch" ? (
          <CornerNotchVisualFixture />
        ) : (
          <CommitReviewVisualFixture mode={mode} />
        )}
      </DialogProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
