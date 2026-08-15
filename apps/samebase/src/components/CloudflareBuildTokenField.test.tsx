// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { CloudflareBuildTokenField } from "./CloudflareBuildTokenField";

describe("CloudflareBuildTokenField", () => {
  it("shows loading and failed list states without presenting a selection", () => {
    const loadingMarkup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        accountId="account-1"
        disabled={false}
        error={false}
        id="build-token"
        isLoading
        onReload={() => {}}
        onValueChange={() => {}}
        selectionUnavailable={false}
        tokens={[]}
        value=""
      />,
    );
    const failedMarkup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        accountId="account-1"
        disabled={false}
        error
        id="build-token"
        isLoading={false}
        onReload={() => {}}
        onValueChange={() => {}}
        selectionUnavailable={false}
        tokens={[]}
        value=""
      />,
    );

    expect(loadingMarkup).toContain("Loading API tokens...");
    expect(loadingMarkup).not.toContain("Choose a token");
    expect(failedMarkup).toContain("Could not load API tokens.");
    expect(failedMarkup).toContain("Retry");
    expect(failedMarkup).not.toContain("Choose a token");
  });

  it("shows the selected name and distinguishes duplicate names by UUID", () => {
    const markup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        accountId="account-1"
        disabled={false}
        error={false}
        id="build-token"
        isLoading={false}
        onReload={() => {}}
        onValueChange={() => {}}
        selectionUnavailable={false}
        tokens={[
          { name: "Workers Builds", uuid: "aaaaaaaa-first" },
          { name: "Workers Builds", uuid: "bbbbbbbb-second" },
        ]}
        value="bbbbbbbb-second"
      />,
    );

    expect(markup).toContain("Workers Builds (bbbbbbbb)");
  });

  it("gives the Cloudflare setup and reload actions when no records are available", () => {
    const markup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        accountId="account-1"
        disabled={false}
        error={false}
        id="build-token"
        isLoading={false}
        onReload={() => {}}
        onValueChange={() => {}}
        selectionUnavailable={false}
        tokens={[]}
        value=""
      />,
    );

    expect(markup).toContain("No API tokens are listed.");
    expect(markup).toContain('href="https://dash.cloudflare.com/account-1/workers-and-pages"');
    expect(markup).toContain("Open Cloudflare");
    expect(markup).toContain("Reload tokens");
  });

  it("does not replace a selection that is no longer listed", () => {
    const markup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        accountId="account-1"
        disabled={false}
        error={false}
        id="build-token"
        isLoading={false}
        onReload={() => {}}
        onValueChange={() => {}}
        selectionUnavailable
        tokens={[{ name: "Replacement token", uuid: "replacement-token" }]}
        value=""
      />,
    );

    expect(markup).toContain("Choose a token");
    expect(markup).toContain(
      "This token is not in Cloudflare&#x27;s current list. Choose another token.",
    );
  });
});
