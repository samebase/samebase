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
    links: [
      {
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%232563eb' d='M1 2h4v12H1zM6 2h4v12H6zM11 2h4v12h-4z'/%3E%3C/svg%3E",
        rel: "icon",
      },
      { href: appCss, rel: "stylesheet" },
    ],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "Samebase Sidebars Example" },
      {
        content: "A single-page React example with two resizable sidebars.",
        name: "description",
      },
    ],
  }),
});
