import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { type ReactNode } from "react";
import appCss from "../index.css?url";
import { ExampleSidebarProvider } from "@/sidebars/ExampleSidebarProvider";

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ExampleSidebarProvider>{children}</ExampleSidebarProvider>
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  component: () => (
    <RootDocument>
      <Outlet />
    </RootDocument>
  ),
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "Samebase Sidebars Example" },
      {
        content: "A complete React example for the @samebase/sidebars package.",
        name: "description",
      },
    ],
  }),
});
