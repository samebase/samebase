import { type ReactNode } from "react";

export function WorkspaceLayoutV2PageFrame({
  children,
  dataTestId,
  topBar,
}: {
  children: ReactNode;
  dataTestId?: string;
  topBar?: ReactNode;
}) {
  return (
    <div
      data-testid={dataTestId}
      className="flex h-dvh min-h-svh w-full flex-col overflow-hidden bg-background overscroll-none"
    >
      {topBar}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
