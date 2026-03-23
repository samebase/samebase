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
import {
  FileViewPushActionsVisualFixture,
  type FileViewPushActionsVisualMode,
} from "@/components/FileViewPushActionsVisualFixture";
import { VaultDashboardBranchVisualFixture } from "@/components/VaultDashboardBranchVisualFixture";
import { ButtonVisualFixture } from "@/components/ButtonVisualFixture";
import {
  EditorChatVisualFixture,
  type EditorChatVisualMode,
} from "@/components/EditorChatVisualFixture";
import "./index.css";

type VisualFixtureMode =
  | CommitReviewVisualMode
  | FileViewPushActionsVisualMode
  | EditorChatVisualMode
  | LandingCopyVisualMode
  | LogoSnapAnglesVisualMode
  | LogoThreeVisualMode
  | RepositoryMediaVisualMode
  | SimpleViewVisualMode
  | VaultDashboardVisualMode
  | "vault-dashboard-branch-pr-title"
  | "button"
  | "corner-notch"
  | "corner-notch-detail";

function readMode(): VisualFixtureMode {
  const value = new URLSearchParams(window.location.search).get("mode");
  if (
    value === "inline" ||
    value === "deleted" ||
    value === "deleted-staged-changes" ||
    value === "deleted-markdown-link" ||
    value === "trailing-newline-only" ||
    value === "unchanged" ||
    value === "conflict" ||
    value === "logo-three-reference" ||
    value === "media-png" ||
    value === "media-svg" ||
    value === "editor-chat-open-desktop" ||
    value === "editor-chat-open-mobile" ||
    value === "editor-chat-closed" ||
    value === "landing-copy-parity" ||
    value === "landing-copy-editable-parity-single-line" ||
    value === "landing-copy-editable-parity-two-line" ||
    value === "landing-copy-editable-parity-three-line" ||
    value === "dashboard-shared-sidebar" ||
    value === "simple-repository-config" ||
    value === "simple-missing-config" ||
    value === "vault-branch-pr-labels" ||
    value === "file-view-push-ready" ||
    value === "file-view-open-pr" ||
    value === "vault-dashboard-branch-pr-title" ||
    value === "button" ||
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
        ) : mode === "editor-chat-open-desktop" ||
          mode === "editor-chat-open-mobile" ||
          mode === "editor-chat-closed" ? (
          <EditorChatVisualFixture mode={mode} />
        ) : mode === "simple-repository-config" ||
          mode === "simple-missing-config" ? (
          <SimpleViewVisualFixture mode={mode} />
        ) : mode === "dashboard-shared-sidebar" ||
          mode === "vault-branch-pr-labels" ? (
          <VaultDashboardVisualFixture mode={mode} />
        ) : mode === "file-view-push-ready" || mode === "file-view-open-pr" ? (
          <FileViewPushActionsVisualFixture mode={mode} />
        ) : mode === "vault-dashboard-branch-pr-title" ? (
          <VaultDashboardBranchVisualFixture />
        ) : mode === "button" ? (
          <ButtonVisualFixture />
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
