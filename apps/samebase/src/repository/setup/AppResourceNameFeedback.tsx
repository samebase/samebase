import { clsx } from "clsx";
import type { ReactNode } from "react";

import { linkStyle } from "@/components/styles";

export function AppResourceNameFeedback({
  children,
  id,
  message,
  suggestion,
  onUseSuggestion,
}: {
  children?: ReactNode;
  id?: string;
  message: string;
  suggestion: string | null;
  onUseSuggestion: (suggestion: string) => void;
}) {
  return (
    <div id={id} role="alert" className="text-xs text-red-600">
      <span>{message}</span>
      {suggestion ? (
        <button
          type="button"
          className={clsx("ml-1 text-left text-blue-600 underline underline-offset-2", linkStyle)}
          onClick={() => {
            onUseSuggestion(suggestion);
          }}
        >
          Use {suggestion}
        </button>
      ) : null}
      {children}
    </div>
  );
}

export function AppResourceNameNotice({
  children,
  id,
  name,
  onUseName,
}: {
  children?: ReactNode;
  id?: string;
  name: string;
  onUseName: (name: string) => void;
}) {
  return (
    <div id={id} role="status" className="text-xs text-muted-foreground">
      <span>
        Samebase will use{" "}
        <button
          type="button"
          aria-label={`Use ${name}`}
          className={clsx("text-left text-blue-600 underline underline-offset-2", linkStyle)}
          onClick={() => {
            onUseName(name);
          }}
        >
          <code className="font-mono text-[11px]">{name}</code>
        </button>
        {"."}
      </span>
      {children}
    </div>
  );
}
