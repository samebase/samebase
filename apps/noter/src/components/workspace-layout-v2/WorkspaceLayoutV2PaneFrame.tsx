import { type ReactNode } from "react";

export type WorkspaceLayoutV2PaneFrameProps = {
  header?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  headerTestId?: string;
  headerVisibility?: "all" | "desktop";
};

export function WorkspaceLayoutV2PaneFrame({
  header,
  content,
  footer,
  headerTestId,
  headerVisibility = "all",
}: WorkspaceLayoutV2PaneFrameProps) {
  const headerClassName =
    headerVisibility === "desktop" ? "hidden h-8 shrink-0 md:block" : "h-8 shrink-0";

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      {header && (
        <div data-testid={headerTestId} className={headerClassName}>
          {header}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="min-h-0 flex-1">{content}</div>
      </div>

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </section>
  );
}
