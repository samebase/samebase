import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { PaneLayoutExplorer } from "@/components/PaneLayoutExplorer";
import "@samebase/sidebars/structure.css";
import "@/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("The pane study needs its root element.");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <PaneLayoutExplorer />
    </ThemeProvider>
  </StrictMode>,
);
