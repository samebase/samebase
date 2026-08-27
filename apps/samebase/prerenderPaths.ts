export type PrerenderPath = `/${string}`;

type ExpectedPublicPrerenderMetadata = {
  title: string;
  description: string;
  robots: "index,follow" | "noindex,nofollow";
};

export type PublicPrerenderPage = {
  path: PrerenderPath;
  expectedMetadata: ExpectedPublicPrerenderMetadata;
  prerender: {
    enabled: true;
    outputPath?: PrerenderPath;
  };
};

export type PrerenderPathRewrites = Readonly<Record<string, PrerenderPath>>;

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- slash-prefix-template: startsWith checks the complete runtime fact represented by PrerenderPath
function isPrerenderPath(value: string): value is PrerenderPath {
  return value.startsWith("/");
}

export function readPrerenderHtmlOutputPath(page: PublicPrerenderPage) {
  if (page.path === "/" && !page.prerender.outputPath) {
    throw new Error(
      "The root prerender page must set outputPath because the SPA shell owns /index.html.",
    );
  }

  const outputPath = page.prerender.outputPath ?? `${page.path}/index.html`;
  const htmlOutputPath = outputPath.endsWith(".html") ? outputPath : `${outputPath}.html`;

  if (!isPrerenderPath(htmlOutputPath)) {
    throw new Error(`Prerender output path must be root-relative: ${htmlOutputPath}`);
  }
  if (htmlOutputPath === "/index.html") {
    throw new Error(
      "Prerender pages must not output /index.html because the SPA shell serves that file for unknown app routes.",
    );
  }

  return htmlOutputPath;
}

function createRouteAliases(routePath: PrerenderPath): readonly PrerenderPath[] {
  if (routePath === "/") {
    return ["/"];
  }

  return [routePath, `${routePath}/`, `${routePath}/index.html`];
}

export function createPrerenderPathRewrites(
  pages: readonly PublicPrerenderPage[],
): PrerenderPathRewrites {
  const rewrites: Record<string, PrerenderPath> = {};

  for (const page of pages) {
    const outputPath = readPrerenderHtmlOutputPath(page);
    for (const alias of createRouteAliases(page.path)) {
      if (rewrites[alias]) {
        throw new Error(`Duplicate prerender route alias: ${alias}`);
      }
      rewrites[alias] = outputPath;
    }
  }

  return Object.freeze(rewrites);
}
