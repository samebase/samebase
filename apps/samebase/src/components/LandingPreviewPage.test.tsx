import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DocsDoItYourselfPage,
  DocsIndexPage,
  DocsChangelogPage,
  DocsPricingPage,
  DocsTheBigMigrationPage,
  DocsTheStackPage,
  LandingPage,
} from "@/components/LandingPreviewPage";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import docsChangelogMarkdown from "@/content/docs-changelog.md?raw";
import docsDoItYourselfMarkdown from "@/content/docs-do-it-yourself.md?raw";
import docsPricingMarkdown from "@/content/docs-pricing.md?raw";
import docsTheBigMigrationMarkdown from "@/content/docs-the-big-migration.md?raw";
import docsTheStackMarkdown from "@/content/docs-the-stack.md?raw";
import { PUBLIC_LANDING_LOGO_TEST_ID } from "@/lib/publicLandingLogo";
import { SAMEBASE_PUBLIC_LINKS } from "@/lib/publicLinks";
import {
  DOCS_CHANGELOG_ROUTE,
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  DOCS_THE_BIG_MIGRATION_ROUTE,
  DOCS_THE_STACK_ROUTE,
  LANDING_PAGE_ROUTE,
} from "@/routeSearch/landingPreview";
import { type PublicDeploymentAuthPolicy } from "../../convex/deploymentProfile";

const authState = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false }));
const policyState = vi.hoisted<{
  deploymentAuthPolicy: PublicDeploymentAuthPolicy | undefined;
}>(() => ({ deploymentAuthPolicy: undefined }));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => authState,
}));

// The page reads one query: the root loader's deployment auth policy.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: policyState.deploymentAuthPolicy }),
}));

// This server render has no Start request.
vi.mock("@/lib/isomorphic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/isomorphic")>()),
  readIsomorphicOrigin: () => "http://127.0.0.1:4173",
}));

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({
    children,
    left,
  }: {
    children: ReactNode;
    left?: { content: ReactNode } | null;
  }) => (
    <div>
      <aside>{left?.content}</aside>
      <main>{children}</main>
    </div>
  ),
}));

vi.mock("@/components/MarkdownLandingDocument", () => ({
  MarkdownLandingDocument: ({ markdown }: { markdown: string }) => <article>{markdown}</article>,
}));

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: () => {},
  useAppSignInActions: () => ({
    signInWithOAuth: () => {},
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    search,
    to,
  }: {
    children: ReactNode | ((state: { isActive: boolean }) => ReactNode);
    className?: string;
    search?:
      | Record<string, true | null | undefined>
      | ((
          currentSearch: Record<string, true | null | undefined>,
        ) => Record<string, true | null | undefined>);
    to: string;
  }) => {
    const resolvedSearch = typeof search === "function" ? search({}) : search;
    const searchEntries = Object.entries(resolvedSearch ?? {}).filter((entry) => entry[1] === true);
    const searchSuffix =
      searchEntries.length === 0 ? "" : `?${searchEntries.map((entry) => entry[0]).join("&")}`;

    return (
      <a className={className} href={`${to}${searchSuffix}`}>
        {typeof children === "function" ? children({ isActive: false }) : children}
      </a>
    );
  },
  useLocation: ({ select }: { select: (location: { searchStr: string }) => string }) =>
    select({ searchStr: "" }),
  useMatchRoute: () => () => false,
  useNavigate: () => () => {},
  useRouter: () => ({
    buildLocation: () => ({ href: "/?auth-return=dashboard&signup=github" }),
  }),
}));

vi.mock("@samebase/sidebars/SidebarRuntime", () => ({
  useSidebarLayoutPresentation: () => ({
    isMobile: false,
    mobileMergeProgress: null,
    mobilePane: "main",
    mobilePaneScrollProgress: 0,
  }),
  useSidebarActions: () => ({
    setMobilePane: () => {},
  }),
}));

function countOccurrences(markup: string, fragment: string) {
  return markup.split(fragment).length - 1;
}

describe("LandingPage", () => {
  afterEach(() => {
    authState.isAuthenticated = false;
    policyState.deploymentAuthPolicy = undefined;
  });

  it("renders the landing sections in order, with their links and FAQ answers", () => {
    const markup = renderToStaticMarkup(<LandingPage />);

    const sectionPositions = [
      "<h1",
      'src="/landing-preview/repository-page-desktop-light.webp"',
      'aria-label="Why I build it"',
      'aria-label="What it does"',
      'aria-label="The parts"',
      'aria-label="Frequently asked questions"',
      `data-testid="${PUBLIC_LANDING_LOGO_TEST_ID}"`,
    ].map((marker) => markup.indexOf(marker));
    expect(sectionPositions).not.toContain(-1);
    expect(sectionPositions).toEqual([...sectionPositions].sort((a, b) => a - b));
    expect(countOccurrences(markup, `data-testid="${PUBLIC_LANDING_LOGO_TEST_ID}"`)).toBe(1);

    expect(markup).toContain(
      'href="https://github.com/samebase/samebase" rel="noreferrer" target="_blank"',
    );
    expect(markup).toContain(
      'href="https://github.com/samebase/base" rel="noreferrer" target="_blank"',
    );
    for (const route of [DOCS_DO_IT_YOURSELF_ROUTE, DOCS_THE_STACK_ROUTE]) {
      expect(markup).toContain(`href="${route}"`);
    }

    const faqQuestionCount = countOccurrences(markup, 'data-slot="accordion-trigger"');
    expect(faqQuestionCount).toBeGreaterThan(0);
    expect(countOccurrences(markup, 'data-slot="accordion-content"')).toBe(faqQuestionCount);
  });

  it("keeps the docs sidebar in the routes' static left pane, not in the page", () => {
    const sidebarMarkup = renderToStaticMarkup(DOCS_ROUTE_CHROME.leftPane.content);

    expect(sidebarMarkup).toContain(`data-testid="${DOCS_SIDEBAR_TEST_ID}"`);
    expect(renderToStaticMarkup(<LandingPage />)).not.toContain(
      `data-testid="${DOCS_SIDEBAR_TEST_ID}"`,
    );
  });

  it("links every docs page from an open docs folder, plus the legal and social links", () => {
    const sidebarMarkup = renderToStaticMarkup(DOCS_ROUTE_CHROME.leftPane.content);

    expect(sidebarMarkup).toContain('aria-label="Collapse Docs"');
    for (const href of [
      LANDING_PAGE_ROUTE,
      DOCS_THE_BIG_MIGRATION_ROUTE,
      DOCS_THE_STACK_ROUTE,
      DOCS_DO_IT_YOURSELF_ROUTE,
      DOCS_RECEIPTS_ROUTE,
      DOCS_PRICING_ROUTE,
      DOCS_CHANGELOG_ROUTE,
      "/privacy",
      "/terms",
      SAMEBASE_PUBLIC_LINKS.x.destination,
      SAMEBASE_PUBLIC_LINKS.youtube.destination,
    ]) {
      expect(sidebarMarkup).toContain(`href="${href}"`);
    }
  });

  it("renders the docs navigation in the main pane on the docs index", () => {
    // The docs index has no static left pane (routeAccessMetadata.test.ts), so the list is its page.
    expect(renderToStaticMarkup(<DocsIndexPage />)).toContain(
      `data-testid="${DOCS_SIDEBAR_TEST_ID}"`,
    );
  });

  it.each([
    { name: "do-it-yourself", Page: DocsDoItYourselfPage, markdown: docsDoItYourselfMarkdown },
    { name: "the stack", Page: DocsTheStackPage, markdown: docsTheStackMarkdown },
    { name: "big migration", Page: DocsTheBigMigrationPage, markdown: docsTheBigMigrationMarkdown },
    { name: "changelog", Page: DocsChangelogPage, markdown: docsChangelogMarkdown },
    { name: "pricing", Page: DocsPricingPage, markdown: docsPricingMarkdown },
  ])("renders the $name page from its own markdown file", ({ Page, markdown }) => {
    expect(renderToStaticMarkup(<Page />)).toContain(
      renderToStaticMarkup(<article>{markdown}</article>),
    );
  });
});
