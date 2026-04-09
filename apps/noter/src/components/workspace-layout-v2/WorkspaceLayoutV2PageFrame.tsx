import { type ReactNode } from "react";

export function WorkspaceLayoutV2PageFrame({
  allowDocumentScroll = false,
  children,
  dataTestId,
  topBar,
}: {
  allowDocumentScroll?: boolean;
  children: ReactNode;
  dataTestId?: string;
  topBar?: ReactNode;
}) {
  return (
    <div
      data-testid={dataTestId}
      className={
        allowDocumentScroll
          ? "flex min-h-svh w-full flex-col bg-background"
          : "flex h-dvh min-h-svh w-full flex-col overflow-hidden bg-background"
      }
    >
      {topBar}
      <div
        className={
          allowDocumentScroll ? "flex-1" : "min-h-0 flex-1 overflow-hidden"
        }
      >
        {children}
      </div>
    </div>
  );
}
