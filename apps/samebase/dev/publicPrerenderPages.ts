import { entries } from "@samebase/dependent/object";
import {
  ROUTE_ACCESS_METADATA_BY_PATH,
  type PublicPrerenderRoutePath,
  type RoutePath,
} from "../src/routeAccessMetadata";

type ExpectedPublicPrerenderMetadata = {
  title: string;
  description: string;
  robots: "index,follow" | "noindex,nofollow";
};

const expectedPublicPrerenderMetadataByPath = {
  "/": {
    title: "Samebase | The correct way to build web apps",
    description:
      "The correct way to build web apps. Convex + Cloudflare is all you need. You own 100% of your code and data.",
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
  "/docs/the-stack": {
    title: "The stack | Samebase",
    description: "What the Samebase template ships and why each piece was chosen.",
    robots: "index,follow",
  },
  "/logo": {
    title: "Logo Preview | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/hover/carpet": {
    title: "Carpet Hover Reveal Lab | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/hover/menger": {
    title: "Menger Hover Reveal Lab | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/iso": {
    title: "Logo ISO Preview | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/raster": {
    title: "Logo Raster Preview | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/raster-seams": {
    title: "Logo Raster Seam Lab | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/single-cube": {
    title: "Single Cube Rotation Lab | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/svg": {
    title: "Static SVG Preview | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/transition": {
    title: "Logo Transition Lab | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/transition/menger": {
    title: "Menger Depth Transition Lab | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/logo/transition/transforms": {
    title: "Single Cube Transform Lab | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/links": {
    title: "Links | Samebase",
    description: "Official Samebase links for YouTube, Discord, the GitHub plugin, and X.",
    robots: "index,follow",
  },
  "/oauth/mcp/consent": {
    title: "Authorize MCP client | Samebase",
    description: "Authorization route for a Samebase MCP client.",
    robots: "noindex,nofollow",
  },
  "/pricing": {
    title: "Pricing | Samebase",
    description: "The Free and Pro connection limits, member limits, and monthly prices.",
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
    outputPath?: string;
  };
};

function isConcreteRoutePath(routePath: string): boolean {
  return !routePath.includes("$");
}

function isProductionAvailable(availableEnvironments: readonly string[] | undefined): boolean {
  return availableEnvironments === undefined || availableEnvironments.includes("production");
}

function isPrerenderEnabled(prerender: false | undefined): boolean {
  return prerender !== false;
}

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

export function readPublicPrerenderPages() {
  // Keep Vite config on metadata-only imports. Importing the router here pulls
  // route components before app aliases are active during config loading.
  const routePaths = entries(ROUTE_ACCESS_METADATA_BY_PATH)
    .filter(
      ([routePath, routeAccessMetadata]) =>
        routeAccessMetadata.access === "access_public" &&
        isPrerenderEnabled(
          "prerender" in routeAccessMetadata ? routeAccessMetadata.prerender : undefined,
        ) &&
        isConcreteRoutePath(routePath) &&
        isProductionAvailable(
          "availableEnvironments" in routeAccessMetadata
            ? routeAccessMetadata.availableEnvironments
            : undefined,
        ),
    )
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

  return routePaths.map((routePath) => {
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
        ...(routePath === "/" ? { outputPath: "/_landing.html" } : {}),
      },
    };
  }) satisfies PrerenderPage[];
}
