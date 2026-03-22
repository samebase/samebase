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
import {
  VaultDashboardVisualFixture,
  type VaultDashboardVisualMode,
} from "@/components/VaultDashboardVisualFixture";
import { CornerNotchVisualFixture } from "@/components/CornerNotchVisualFixture";
import {
  LogoThreeVisualFixture,
  type LogoThreeVisualMode,
} from "@/components/LogoThreeVisualFixture";
import {
  LandingCopyVisualFixture,
  type LandingCopyVisualMode,
} from "@/components/LandingCopyVisualFixture";
import { CornerNotchDetailVisualFixture } from "@/components/CornerNotchDetailVisualFixture";
import {
  LogoSnapAnglesVisualFixture,
  type LogoSnapAnglesVisualMode,
} from "@/components/LogoSnapAnglesVisualFixture";
import "./index.css";

type VisualFixtureMode =
  | CommitReviewVisualMode
  | LandingCopyVisualMode
  | LogoSnapAnglesVisualMode
  | LogoThreeVisualMode
  | RepositoryMediaVisualMode
  | SimpleViewVisualMode
  | VaultDashboardVisualMode
  | "corner-notch"
  | "corner-notch-detail";

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
    value === "landing-copy-editable-parity-single-line" ||
    value === "landing-copy-editable-parity-two-line" ||
    value === "landing-copy-editable-parity-three-line" ||
    value === "simple-repository-config" ||
    value === "simple-missing-config" ||
    value === "vault-branch-pr-labels" ||
    value === "corner-notch" ||
    value === "logo-snap-angles" ||
    value === "corner-notch-detail"
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
        ) : mode === "landing-copy-parity" ||
          mode === "landing-copy-editable-parity-single-line" ||
          mode === "landing-copy-editable-parity-two-line" ||
          mode === "landing-copy-editable-parity-three-line" ? (
          <LandingCopyVisualFixture mode={mode} />
        ) : mode === "logo-three-reference" ? (
          <LogoThreeVisualFixture />
        ) : mode === "logo-snap-angles" ? (
          <LogoSnapAnglesVisualFixture />
        ) : mode === "simple-repository-config" ||
          mode === "simple-missing-config" ? (
          <SimpleViewVisualFixture mode={mode} />
        ) : mode === "vault-branch-pr-labels" ? (
          <VaultDashboardVisualFixture mode={mode} />
        ) : mode === "corner-notch" ? (
          <CornerNotchVisualFixture />
        ) : mode === "corner-notch-detail" ? (
          <CornerNotchDetailVisualFixture />
        ) : (
          <CommitReviewVisualFixture mode={mode} />
        )}
      </DialogProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
