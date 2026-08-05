import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { NewAppCreateFormFields } from "./NewAppPage";

describe("NewAppCreateFormFields", () => {
  it("links invalid provider names to an alert", () => {
    const markup = renderToStaticMarkup(
      <NewAppCreateFormFields
        cloudflareWorkerName="samebase app"
        cloudflareWorkerNameInvalid
        cloudflareWorkerNameSupport="Cloudflare Worker name is invalid."
        convexProjectName="samebase-app"
        convexProjectNameInvalid={false}
        convexProjectNameSupport={null}
        githubConnected={false}
        githubRepositoryNameInvalid={false}
        githubRepositoryNameSupport={null}
        githubRepositoryOwnerOptions={[]}
        hasRequiredCreateConnections
        isCreating={false}
        isLoadingGithubRepositoryOwners={false}
        newRepositoryName="samebase-app"
        onCloudflareWorkerNameBlur={() => {}}
        onCloudflareWorkerNameChange={() => {}}
        onConvexProjectNameBlur={() => {}}
        onConvexProjectNameChange={() => {}}
        onGithubRepositoryOwnerChange={() => {}}
        onNewRepositoryNameChange={() => {}}
        selectedGithubRepositoryOwner=""
      />,
    );
    const input = markup.match(/<input[^>]*aria-label="Cloudflare Worker name"[^>]*>/)?.[0];
    const support = markup.match(
      /<div id="new-app-cloudflare-worker-name-support"[^>]*>.*?<\/div>/,
    )?.[0];

    expect(input).toContain('aria-describedby="new-app-cloudflare-worker-name-support"');
    expect(input).toContain('aria-invalid="true"');
    expect(support).toContain('role="alert"');
    expect(support).toContain("Cloudflare Worker name is invalid.");
  });
});
