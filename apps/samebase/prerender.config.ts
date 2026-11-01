import { entries } from "@samebase/dependent/object";
import {
  ROUTE_ACCESS_METADATA_BY_PATH,
  type PublicPrerenderRoutePath,
  type RoutePath,
} from "./src/routeAccessMetadata";

type ExpectedPublicPrerenderMetadata = {
  title: string;
  description: string;
  robots: "index,follow" | "noindex,nofollow";
};

const expectedPublicPrerenderMetadataByPath = {
  "/": {
    title: "Samebase | Give your coding agent a working app",
    description:
      "One place to manage GitHub, Convex, and Cloudflare across all your apps. Just use the samebase/base template without creating an account.",
    robots: "index,follow",
  },
  "/docs": {
    title: "Docs | Samebase",
    description: "Samebase product, setup, stack, pricing, and source documentation.",
    robots: "index,follow",
  },
  "/docs/cloudflare-setup": {
    title: "Set up Cloudflare for your first Samebase app | Samebase",
    description:
      "Create the first Cloudflare Workers Builds API token, then let Samebase create the real Worker.",
    robots: "index,follow",
  },
  "/docs/cloudflare-previews-migration": {
    title: "Migrate to Cloudflare Worker Previews | Samebase",
    description: "Update an existing Samebase app to use Cloudflare Worker Previews.",
    robots: "index,follow",
  },
  "/docs/do-it-yourself": {
    title: "Do it yourself | Samebase",
    description: "Deploy the Samebase stack by hand, with no Samebase account.",
    robots: "index,follow",
  },
  "/docs/receipts": {
    title: "Receipts | Samebase",
    description: "Every factual Samebase claim with its primary source and check date.",
    robots: "index,follow",
  },
  "/docs/the-big-migration": {
    title: "The big migration | Samebase",
    description: "How Samebase works with Alchemy, and how to move a Worker or Convex app.",
    robots: "index,follow",
  },
  "/docs/the-stack": {
    title: "The stack | Samebase",
    description: "What the Samebase template ships and why each piece was chosen.",
    robots: "index,follow",
  },
  "/pricing": {
    title: "Pricing | Samebase",
    description: "The Free and Pro connection limits, member limits, and monthly prices.",
    robots: "index,follow",
  },
  "/changelog": {
    title: "Changelog | Samebase",
    description: "What changed in Samebase, newest first.",
    robots: "index,follow",
  },
  "/privacy": {
    title: "Privacy Policy | Samebase",
    description:
      "How Samebase handles personal information, including why it is used, who receives it, how long it is kept, and your rights.",
    robots: "index,follow",
  },
  "/terms": {
    title: "Terms of Service | Samebase",
    description:
      "Terms of Service for Samebase. Describes the rules, responsibilities, and legal terms for using Samebase and samebase.com.",
    robots: "index,follow",
  },
} as const satisfies Record<PublicPrerenderRoutePath, ExpectedPublicPrerenderMetadata>;

type PrerenderPage = {
  path: RoutePath;
  expectedMetadata: ExpectedPublicPrerenderMetadata;
  prerender: {
    enabled: true;
  };
};

function compareRoutePaths(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === "/") {
    return -1;
  }
  if (right === "/") {
    return 1;
  }

  return left.localeCompare(right);
}

// Keep Vite config on metadata-only imports. Importing the router here pulls
// route components before app aliases are active during config loading.
const routePaths = entries(ROUTE_ACCESS_METADATA_BY_PATH)
  .filter(([, routeAccessMetadata]) => "prerender" in routeAccessMetadata)
  .map(([routePath]) => routePath)
  .sort(compareRoutePaths);
const expectedRoutePaths = entries(expectedPublicPrerenderMetadataByPath)
  .map(([routePath]) => routePath)
  .sort(compareRoutePaths);

if (
  routePaths.length !== expectedRoutePaths.length ||
  routePaths.some((routePath, index) => routePath !== expectedRoutePaths[index])
) {
  throw new Error(
    `Public prerender routes (${routePaths.join(", ")}) do not match expected metadata routes (${expectedRoutePaths.join(", ")}).`,
  );
}

export const prerenderPages = routePaths.map((routePath) => {
  const expectedMetadata = entries(expectedPublicPrerenderMetadataByPath).find(
    ([expectedPath]) => expectedPath === routePath,
  )?.[1];
  if (!expectedMetadata) {
    throw new Error(`Public prerender metadata is not configured for ${routePath}.`);
  }

  return {
    path: routePath,
    expectedMetadata,
    prerender: {
      enabled: true,
    },
  };
}) satisfies PrerenderPage[];
