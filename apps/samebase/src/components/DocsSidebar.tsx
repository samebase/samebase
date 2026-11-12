import {
  APP_SIDEBAR_CURRENT_LABEL_CLASS_NAME,
  APP_SIDEBAR_NAVIGATION_LINK_PROPS,
} from "@/components/appSidebarNavigation";
import { Button } from "@/components/ui/button";
import { SAMEBASE_PUBLIC_LINKS } from "@/lib/publicLinks";
import { cn } from "@/lib/utils";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_CHANGELOG_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  DOCS_THE_BIG_MIGRATION_ROUTE,
  DOCS_THE_STACK_ROUTE,
  LANDING_PAGE_ROUTE,
} from "@/routeSearch/landingPreview";
import type { AppWorkspaceRouteChromeStaticData } from "@/routing/permissions";
import { Link, useMatchRoute, type LinkProps } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

type DocsSidebarPage = { label: string; to: LinkProps["to"] };

/** The tree follows the URLs: a folder is a path, and its pages are the routes under that path. */
const DOCS_SIDEBAR_TREE: readonly (
  | DocsSidebarPage
  | { label: string; pages: readonly DocsSidebarPage[] }
)[] = [
  { label: "Overview", to: LANDING_PAGE_ROUTE },
  {
    label: "Docs",
    pages: [
      { label: "The big migration", to: DOCS_THE_BIG_MIGRATION_ROUTE },
      { label: "The stack", to: DOCS_THE_STACK_ROUTE },
      { label: "Do it yourself", to: DOCS_DO_IT_YOURSELF_ROUTE },
      { label: "Receipts", to: DOCS_RECEIPTS_ROUTE },
    ],
  },
  { label: "Pricing", to: DOCS_PRICING_ROUTE },
  { label: "Changelog", to: DOCS_CHANGELOG_ROUTE },
];

const DOCS_SIDEBAR_LEGAL_PAGES = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
] as const satisfies readonly DocsSidebarPage[];

/** The brand colors of the old footer links: X in the text color, YouTube in its red. */
const DOCS_SIDEBAR_SOCIAL_LINKS = [
  { label: "/x.com", href: SAMEBASE_PUBLIC_LINKS.x.destination, className: "text-foreground" },
  {
    label: "/YouTube",
    href: SAMEBASE_PUBLIC_LINKS.youtube.destination,
    className: "text-[#FF0000]",
  },
] as const;

const DOCS_SIDEBAR_LINK_CLASS_NAME =
  "block py-2 pr-3 pl-2 text-primary no-underline hover:bg-muted/60 hover:no-underline";

function DocsSidebarLink({ label, to }: DocsSidebarPage) {
  return (
    <Link
      activeOptions={APP_SIDEBAR_NAVIGATION_LINK_PROPS.activeOptions}
      className={DOCS_SIDEBAR_LINK_CLASS_NAME}
      to={to}
    >
      {({ isActive }) => (
        <span
          className={cn(
            "w-fit max-w-full max-lines-2",
            isActive && APP_SIDEBAR_CURRENT_LABEL_CLASS_NAME,
          )}
        >
          {label}
        </span>
      )}
    </Link>
  );
}

/**
The row and its guide line are the repository tree's folder (`RepositoryOverviewSidebar`). A folder
starts open and saves nothing, so the prerendered page already shows the visitor's nav and a sign-in
changes nothing. The sidebar stays mounted across pages, so a closed folder stays closed until a
reload.
*/
function DocsSidebarFolder({ label, pages }: { label: string; pages: readonly DocsSidebarPage[] }) {
  const [open, setOpen] = useState(true);
  const matchRoute = useMatchRoute();
  const hidesCurrentPage =
    !open && pages.some(({ to }) => matchRoute({ includeSearch: false, to }));

  return (
    <section aria-label={hidesCurrentPage ? `${label}, contains current page` : label}>
      <Button
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
        className={cn(
          "w-full justify-start gap-0 p-0 aria-expanded:not-hover:bg-transparent",
          hidesCurrentPage && "bg-muted",
        )}
        type="button"
        variant="ghost"
        onClick={() => setOpen(!open)}
      >
        <span className="flex w-5 shrink-0 items-center justify-center">
          {open ? <ChevronDown /> : <ChevronRight />}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </Button>
      {open ? (
        <div className="ml-2.5 border-l border-border pl-1">
          {pages.map((page) => (
            <DocsSidebarLink key={page.label} label={page.label} to={page.to} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function DocsSidebar() {
  return (
    <nav
      aria-label="Docs sections"
      data-testid={DOCS_SIDEBAR_TEST_ID}
      className="min-h-full px-1 py-2 text-sm"
    >
      {DOCS_SIDEBAR_TREE.map((entry) =>
        "pages" in entry ? (
          <DocsSidebarFolder key={entry.label} label={entry.label} pages={entry.pages} />
        ) : (
          <DocsSidebarLink key={entry.label} label={entry.label} to={entry.to} />
        ),
      )}
      <div className="mt-6">
        {DOCS_SIDEBAR_LEGAL_PAGES.map((page) => (
          <DocsSidebarLink key={page.label} label={page.label} to={page.to} />
        ))}
      </div>
      {/* Outbound links share one row, so they do not read as pages of the site. */}
      <div className="mt-2 flex gap-3 px-2 py-2">
        {DOCS_SIDEBAR_SOCIAL_LINKS.map((link) => (
          <a
            className={link.className}
            href={link.href}
            key={link.label}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/**
The left pane of the landing and docs routes, in their static data: the shell renders it in the
same render as the page, so the server HTML and the prerendered pages have the docs list.
*/
export const DOCS_ROUTE_CHROME = {
  leftPane: { content: <DocsSidebar /> },
} satisfies AppWorkspaceRouteChromeStaticData;
