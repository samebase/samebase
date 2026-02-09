import { ReactNode, useSyncExternalStore } from "react";

const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

const getInIframe = () => isInIframe();
const subscribe = () => () => {};

export function Layout({ children }: { children: ReactNode }) {
  const inIframe = useSyncExternalStore(subscribe, getInIframe, () => false);

  return (
    <div
      className="flex w-full flex-col"
      style={{ height: inIframe ? "calc(100vh - 3rem)" : "100vh" }}
    >
      <main className="flex grow flex-col overflow-hidden">{children}</main>
    </div>
  );
}
