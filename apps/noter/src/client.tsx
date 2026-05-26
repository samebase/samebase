import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
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
