import type { ReactNode } from "react";
import {
  useCreateWorkspaceLayoutV2Store,
  WorkspaceLayoutV2Context,
} from "./WorkspaceLayoutV2Context";

export function WorkspaceLayoutV2Provider({
  children,
}: {
  children: ReactNode;
}) {
  const store = useCreateWorkspaceLayoutV2Store();

  return (
    <WorkspaceLayoutV2Context.Provider value={store}>
      {children}
    </WorkspaceLayoutV2Context.Provider>
  );
}
