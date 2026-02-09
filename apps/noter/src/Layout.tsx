import { ReactNode, useEffect } from "react";

export function Layout({ children }: { children: ReactNode }) {
  useEffect(() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    document.documentElement.style.setProperty(
      "--bottom-inset",
      inIframe ? "3rem" : "0px",
    );
  }, []);

  return (
    <div
      className="flex w-full flex-col"
      style={{ height: "calc(100vh - var(--bottom-inset, 0px))" }}
    >
      <main className="flex grow flex-col overflow-hidden">{children}</main>
    </div>
  );
}
