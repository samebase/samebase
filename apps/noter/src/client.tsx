import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
// Keep the root Tailwind bundle owned by the client entry. A rootHead
// `index.css?url` import can resolve to a chunk-local asset name and leave
// prerendered HTML pointing at a stylesheet that was not deployed.
import "./index.css";
import { initializeAppBootRecovery } from "@/lib/appBootRecovery";

function hydrateApp() {
  initializeAppBootRecovery();

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}

hydrateApp();
