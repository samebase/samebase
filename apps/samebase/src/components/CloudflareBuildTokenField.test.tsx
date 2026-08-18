// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { CloudflareBuildTokenField } from "./CloudflareBuildTokenField";

describe("CloudflareBuildTokenField", () => {
  it("shows loading and failed list states without presenting a selection", () => {
    const loadingMarkup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        disabled={false}
        emptyState="required"
        error={false}
        id="build-token"
        isLoading
        lastUsedUuid={null}
        onReload={() => {}}
        onValueChange={() => {}}
        selectionUnavailable={false}
        tokens={[]}
        value=""
      />,
    );
    const failedMarkup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        disabled={false}
        emptyState="required"
        error
        id="build-token"
        isLoading={false}
        lastUsedUuid={null}
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
        disabled={false}
        emptyState="required"
        error={false}
        id="build-token"
        isLoading={false}
        lastUsedUuid="bbbbbbbb-second"
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

    expect(markup).toContain("Workers Builds (bbbbbbbb) · Last used");
  });

  it("keeps required and deferred empty states distinct", () => {
    const requiredMarkup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        disabled={false}
        emptyState="required"
        error={false}
        id="build-token"
        isLoading={false}
        lastUsedUuid={null}
        onReload={() => {}}
        onValueChange={() => {}}
        selectionUnavailable={false}
        tokens={[]}
        value=""
      />,
    );
    const deferredMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/org/ada/new-app"]}>
        <CloudflareBuildTokenField
          disabled={false}
          emptyState="deferred"
          error={false}
          id="build-token"
          isLoading={false}
          lastUsedUuid={null}
          onReload={() => {}}
          onValueChange={() => {}}
          selectionUnavailable={false}
          tokens={[]}
          value=""
        />
      </TestRouterProvider>,
    );
    expect(requiredMarkup).toContain("No API tokens are listed.");
    expect(requiredMarkup).not.toContain("You can create the app now");
    expect(requiredMarkup).not.toContain("Open Cloudflare");
    expect(requiredMarkup).not.toContain("dash.cloudflare.com");
    expect(deferredMarkup).toContain(
      "No API token is available. Samebase will create the GitHub repository and Convex project, but it will not create a Cloudflare Worker.",
    );
    expect(deferredMarkup).toContain(
      "Complete first-time Cloudflare setup after you create the app.",
    );
    expect(deferredMarkup).toContain('href="/docs/cloudflare-setup"');
    expect(deferredMarkup).toContain("View first-time Cloudflare setup");
    expect(deferredMarkup).toContain('role="status"');
    expect(deferredMarkup).not.toContain("Create one in Cloudflare");
    expect(deferredMarkup).not.toContain("Open Cloudflare");
    expect(deferredMarkup).toContain("Reload tokens");
  });

  it("does not replace a selection that is no longer listed", () => {
    const markup = renderToStaticMarkup(
      <CloudflareBuildTokenField
        disabled={false}
        emptyState="required"
        error={false}
        id="build-token"
        isLoading={false}
        lastUsedUuid={null}
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
