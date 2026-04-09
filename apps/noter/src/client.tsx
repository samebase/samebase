import "@xyflow/react/dist/style.css";
import "./index.css";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { ensureWindowStorageAccess } from "@/lib/storageAccess";

ensureWindowStorageAccess("localStorage");

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
