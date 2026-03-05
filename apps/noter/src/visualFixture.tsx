import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { DialogProvider } from "@/contexts/DialogContext";
import {
  CommitReviewVisualFixture,
  type CommitReviewVisualMode,
} from "@/components/CommitReviewVisualFixture";
import "./index.css";

function readMode(): CommitReviewVisualMode {
  const value = new URLSearchParams(window.location.search).get("mode");
  if (
    value === "rich" ||
    value === "patch" ||
    value === "deleted" ||
    value === "fallback"
  ) {
    return value;
  }
  return "rich";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <DialogProvider>
        <CommitReviewVisualFixture mode={readMode()} />
      </DialogProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
