import { createFileRoute } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/walkthrough/cloudflare-worker-builds";
const githubBranchUrl =
  "https://github.com/samebase/samebase/blob/codex-cloudflare-trigger-repo-guard";

const walkthroughMetadata: PageMetadata = {
  title: "Cloudflare Worker Builds Code Walkthrough | Samebase",
  description: "Code-first walkthrough of the Cloudflare Worker Builds wiring changes in PR 1155.",
  canonicalPath: pathname,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

type CodeRef = {
  file: string;
  line: number;
  symbol: string;
};

type CallStep = {
  title: string;
  why: string;
  refs: readonly CodeRef[];
};

const entryPaths = [
  {
    title: "Samebase just created the Worker",
    outcome:
      'The connectCloudflareWorker workflow creates a second provisioning run with trigger wire_builds, but only inside if (args.origin === "provisioned").',
    refs: [
      {
        file: "apps/samebase/convex/appProvisioningWorkflow.ts",
        line: 303,
        symbol: "connectCloudflareWorker",
      },
      {
        file: "apps/samebase/convex/appProvisioningWorkflow.ts",
        line: 329,
        symbol: 'if (args.origin === "provisioned")',
      },
      {
        file: "apps/samebase/convex/appProvisioningWorkflow.ts",
        line: 330,
        symbol: 'createForVault({ trigger: "wire_builds" })',
      },
      {
        file: "apps/samebase/convex/appProvisioningWorkflow.ts",
        line: 370,
        symbol: "startCloudflareBuildsWiring",
      },
    ],
  },
  {
    title: "User picked an existing Worker",
    outcome:
      'The Worker row is recorded with builds: { state: "not_connected" }. Samebase does not mutate Cloudflare Builds until the user runs the explicit wireBuilds action.',
    refs: [
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 431,
        symbol: "wireBuilds",
      },
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 441,
        symbol: 'createForVault({ trigger: "wire_builds" })',
      },
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 446,
        symbol: "startCloudflareBuildsWiringOrFail",
      },
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.convex.test.ts",
        line: 183,
        symbol: "selected_existing worker test",
      },
    ],
  },
] satisfies ReadonlyArray<{
  title: string;
  outcome: string;
  refs: readonly CodeRef[];
}>;

const runSteps = [
  {
    title: "1. Start the wire_builds workflow",
    why: "startCloudflareBuildsWiring starts wireCloudflareBuilds asynchronously and writes the workflow id back to the appProvisioningRuns row.",
    refs: [
      {
        file: "apps/samebase/convex/appProvisioningWorkflow.ts",
        line: 650,
        symbol: "startCloudflareBuildsWiring",
      },
      {
        file: "apps/samebase/convex/appProvisioningWorkflow.ts",
        line: 659,
        symbol: "workflow.start(...wireCloudflareBuilds...)",
      },
    ],
  },
  {
    title: "2. Claim infrastructure ownership",
    why: "claimCloudflareBuildsWiring checks that an attached Worker exists, exits if Builds are already connected, then claims vaultInfrastructureOwnership for this run.",
    refs: [
      {
        file: "apps/samebase/convex/appProvisioningWorkflow.ts",
        line: 409,
        symbol: "wireCloudflareBuilds workflow",
      },
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.ts",
        line: 624,
        symbol: "claimCloudflareBuildsWiring",
      },
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.ts",
        line: 643,
        symbol: "readCloudflareWorkerForAppRoot",
      },
    ],
  },
  {
    title: "3. Read the exact inputs for provider work",
    why: "readActiveCloudflareBuildsWiring returns the vault GitHub repo id, default branch, Worker tag, build config, and a boolean hasConvexDeployment. It does not return Convex keys.",
    refs: [
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.ts",
        line: 717,
        symbol: "readActiveCloudflareBuildsWiring",
      },
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.ts",
        line: 755,
        symbol: "active wiring state",
      },
    ],
  },
  {
    title: "4. Resolve GitHub and Cloudflare identities",
    why: "ensureCloudflareBuildsWiring reads the saved provider connections, verifies the GitHub repo with Octokit, and gets the GitHub owner id Cloudflare needs as provider_account_id.",
    refs: [
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 597,
        symbol: "ensureCloudflareBuildsWiring",
      },
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 620,
        symbol: "fetchGitHubRepoIdentity",
      },
      {
        file: "apps/samebase/convex/githubRepoApi.ts",
        line: 26,
        symbol: "octokit.rest.repos.get",
      },
    ],
  },
  {
    title: "5. Call the Cloudflare Builds helper",
    why: "wireCloudflareWorkerBuilds receives repo id, owner id, Worker tag, build config, and triggerInitialBuild: !active.hasConvexDeployment.",
    refs: [
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 626,
        symbol: "wireCloudflareWorkerBuilds(...)",
      },
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 632,
        symbol: "triggerInitialBuild: !active.hasConvexDeployment",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 1189,
        symbol: "wireCloudflareWorkerBuilds",
      },
    ],
  },
  {
    title: "6. Record the connected Builds state",
    why: "recordCloudflareBuildsForRun patches only the deployment.builds axis and preserves the existing deployment.convexBuildAccess axis.",
    refs: [
      {
        file: "apps/samebase/convex/vault/cloudflare.ts",
        line: 647,
        symbol: "recordCloudflareBuildsForRun",
      },
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.ts",
        line: 772,
        symbol: "recordCloudflareBuildsForRun",
      },
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.ts",
        line: 804,
        symbol: "deployment patch",
      },
    ],
  },
] satisfies readonly CallStep[];

const cloudflareCalls = [
  {
    title: "Connect GitHub repo to Workers Builds",
    method: "PUT",
    endpoint: "/accounts/{account_id}/builds/repos/connections",
    detail: "Body includes provider_account_id, provider_account_name, repo_id, and repo_name.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 444,
        symbol: "ensureRepositoryConnection",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 467,
        symbol: "repo connection body",
      },
    ],
  },
  {
    title: "Read existing Worker triggers",
    method: "GET",
    endpoint: "/accounts/{account_id}/builds/workers/{external_script_id}/triggers",
    detail:
      "This is where Samebase learns whether Cloudflare already has production or preview triggers for the Worker.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 870,
        symbol: "listBuildTriggers",
      },
    ],
  },
  {
    title: "Reuse or create a build token",
    method: "GET/POST",
    endpoint: "/accounts/{account_id}/builds/tokens",
    detail:
      "User-token auth needs a Workers Builds build token. If a Samebase token exists, it is reused.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 488,
        symbol: "resolveBuildTokenUuid",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 762,
        symbol: "createBuildToken",
      },
    ],
  },
  {
    title: "Patch safe triggers or create missing triggers",
    method: "PATCH/POST",
    endpoint: "/accounts/{account_id}/builds/triggers",
    detail:
      "upsertBuildTrigger patches only a branch-matching trigger whose repo_connection.repo_id matches the vault repo id. Otherwise it creates a new trigger or fails closed.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 896,
        symbol: "upsertBuildTrigger",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 911,
        symbol: "selectPatchableBuildTrigger",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 962,
        symbol: "POST new trigger",
      },
    ],
  },
  {
    title: "Start the first production build only when safe",
    method: "POST",
    endpoint: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/builds",
    detail:
      "Convex-backed app roots skip this for now, because Phase 2 has not written PROD_CONVEX_DEPLOY_KEY and PREVIEW_CONVEX_DEPLOY_KEY yet.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 1006,
        symbol: "triggerInitialBuild",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 1219,
        symbol: "if (args.triggerInitialBuild)",
      },
    ],
  },
] satisfies ReadonlyArray<{
  title: string;
  method: string;
  endpoint: string;
  detail: string;
  refs: readonly CodeRef[];
}>;

const guardCases = [
  {
    title: "Existing trigger is usable",
    detail:
      "selectPatchableBuildTrigger found a non-deleted trigger with matching branch shape and matching repo_connection.repo_id.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 836,
        symbol: "find existing trigger",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 861,
        symbol: "repo id equality check",
      },
    ],
  },
  {
    title: "Existing trigger points at another repo",
    detail:
      "The run fails before PATCHing Cloudflare. The user sees the exact message telling them to disconnect Builds in Cloudflare or choose another Worker.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 861,
        symbol: "wrong repo guard",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.test.ts",
        line: 654,
        symbol: "different repo test",
      },
    ],
  },
  {
    title: "Existing trigger has no trustworthy repo id",
    detail:
      "Deleted repo connections and missing repo ids fail closed for the same reason: Samebase cannot prove this Worker belongs to the vault repo.",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 850,
        symbol: "deleted repo connection guard",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.ts",
        line: 855,
        symbol: "missing repo id guard",
      },
      {
        file: "apps/samebase/convex/cloudflareResources.test.ts",
        line: 755,
        symbol: "deleted connection test",
      },
    ],
  },
] satisfies ReadonlyArray<{
  title: string;
  detail: string;
  refs: readonly CodeRef[];
}>;

const stateRows = [
  {
    location: "Worker row schema",
    exactName: "vVaultCloudflareDeployment",
    meaning: "vaultCloudflareWorkers.deployment contains builds and convexBuildAccess.",
    refs: [
      {
        file: "apps/samebase/convex/vault/model.ts",
        line: 206,
        symbol: "vVaultCloudflareDeployment",
      },
    ],
  },
  {
    location: "Builds axis",
    exactName: "vVaultCloudflareBuilds",
    meaning:
      "not_connected or connected with root directory, commands, path filters, production trigger, and preview trigger.",
    refs: [
      {
        file: "apps/samebase/convex/vault/model.ts",
        line: 188,
        symbol: "vVaultCloudflareBuilds",
      },
      {
        file: "apps/samebase/convex/vault/model.ts",
        line: 180,
        symbol: "vVaultCloudflareConnectedBuilds",
      },
    ],
  },
  {
    location: "Convex build-access axis",
    exactName: "vVaultCloudflareConvexBuildAccess",
    meaning:
      "not_wired or wired. Phase 1 leaves this not_wired; Phase 2 will PATCH Convex env vars.",
    refs: [
      {
        file: "apps/samebase/convex/vault/model.ts",
        line: 196,
        symbol: "vVaultCloudflareConvexBuildAccess",
      },
    ],
  },
] satisfies ReadonlyArray<{
  location: string;
  exactName: string;
  meaning: string;
  refs: readonly CodeRef[];
}>;

const failureRefs = [
  {
    title: "Actionable provider errors stay visible",
    detail:
      "USER_FACING_PROVISIONING_ERROR_MARKERS includes the Cloudflare/GitHub messages that should be shown instead of a generic provisioning failure.",
    refs: [
      {
        file: "apps/samebase/convex/infraProvisioning.ts",
        line: 1883,
        symbol: "USER_FACING_PROVISIONING_ERROR_MARKERS",
      },
      {
        file: "apps/samebase/convex/infraProvisioning.ts",
        line: 1924,
        symbol: "marker extraction",
      },
    ],
  },
  {
    title: "wire_builds failures mark the right ownership claim failed",
    detail:
      "markWorkflowProvisioningFailed handles connect_cloudflare_worker and wire_builds together, then logs either cloudflare:worker_connection:failed or cloudflare:builds_wiring:failed.",
    refs: [
      {
        file: "apps/samebase/convex/infraProvisioning.ts",
        line: 2040,
        symbol: "wire_builds failure branch",
      },
      {
        file: "apps/samebase/convex/infraProvisioning.ts",
        line: 2055,
        symbol: "cloudflare:builds_wiring:failed",
      },
      {
        file: "apps/samebase/convex/infraProvisioning.test.ts",
        line: 961,
        symbol: "visible guard error test",
      },
    ],
  },
] satisfies ReadonlyArray<{
  title: string;
  detail: string;
  refs: readonly CodeRef[];
}>;

const pinnedTests = [
  {
    title: "Builds wiring does not write Convex env vars",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.test.ts",
        line: 248,
        symbol: "no environment_variables calls",
      },
    ],
  },
  {
    title: "Initial build can be deferred for Convex-backed roots",
    refs: [
      {
        file: "apps/samebase/convex/cloudflareResources.test.ts",
        line: 278,
        symbol: "triggerInitialBuild: false",
      },
    ],
  },
  {
    title: "Builds run claims, records, and finishes independently",
    refs: [
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.convex.test.ts",
        line: 201,
        symbol: "claim/record/finish wire_builds",
      },
    ],
  },
  {
    title: 'Connected Builds preserve convexBuildAccess: { state: "not_wired" }',
    refs: [
      {
        file: "apps/samebase/convex/vault/cloudflareMutations.convex.test.ts",
        line: 307,
        symbol: "deployment assertion",
      },
    ],
  },
] satisfies ReadonlyArray<{
  title: string;
  refs: readonly CodeRef[];
}>;

function codeRefUrl(codeRef: CodeRef): string {
  return `${githubBranchUrl}/${codeRef.file}#L${codeRef.line}`;
}

function CodeRefLink({ codeRef }: { codeRef: CodeRef }) {
  return (
    <a className="code-ref" href={codeRefUrl(codeRef)} rel="noreferrer" target="_blank">
      <span>{codeRef.symbol}</span>
      <small>
        {codeRef.file}:{codeRef.line}
      </small>
    </a>
  );
}

function CodeRefs({ refs }: { refs: readonly CodeRef[] }) {
  return (
    <div className="code-refs">
      {refs.map((codeRef) => (
        <CodeRefLink codeRef={codeRef} key={`${codeRef.file}:${codeRef.line}:${codeRef.symbol}`} />
      ))}
    </div>
  );
}

function CloudflareWorkerBuildsWalkthrough() {
  usePageMetadata(walkthroughMetadata);

  return (
    <main className="walkthrough" data-testid="cloudflare-worker-builds-walkthrough">
      <style>{walkthroughCss}</style>

      <section className="hero" aria-labelledby="walkthrough-title">
        <p className="kicker">PR 1155 code walkthrough</p>
        <h1 id="walkthrough-title">Worker attach is separate from Builds wiring</h1>
        <p className="lede">
          Read this page as a map of the branch, not as a product spec. Every box names the exact
          function, mutation, schema field, or test that implements the behavior.
        </p>
      </section>

      <section className="section" aria-labelledby="entry-title">
        <div className="section-heading">
          <p className="kicker">Start here</p>
          <h2 id="entry-title">There are two entry paths into wire_builds</h2>
        </div>
        <div className="entry-grid">
          {entryPaths.map((entry) => (
            <article className="card" key={entry.title}>
              <h3>{entry.title}</h3>
              <p>{entry.outcome}</p>
              <CodeRefs refs={entry.refs} />
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="call-title">
        <div className="section-heading">
          <p className="kicker">Run anatomy</p>
          <h2 id="call-title">What a wire_builds run actually executes</h2>
        </div>
        <ol className="call-list">
          {runSteps.map((step) => (
            <li className="call-step" key={step.title}>
              <div>
                <h3>{step.title}</h3>
                <p>{step.why}</p>
              </div>
              <CodeRefs refs={step.refs} />
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="cloudflare-title">
        <div className="section-heading">
          <p className="kicker">Provider boundary</p>
          <h2 id="cloudflare-title">The Cloudflare API calls are concentrated in one helper</h2>
        </div>
        <div className="api-table" role="table" aria-label="Cloudflare Workers Builds API calls">
          <div className="api-row api-row-head" role="row">
            <span role="columnheader">Call</span>
            <span role="columnheader">Method</span>
            <span role="columnheader">Endpoint</span>
            <span role="columnheader">Why it exists</span>
            <span role="columnheader">Code</span>
          </div>
          {cloudflareCalls.map((call) => (
            <div className="api-row" role="row" key={call.title}>
              <span role="cell">{call.title}</span>
              <span className="method" role="cell">
                {call.method}
              </span>
              <span className="endpoint" role="cell">
                {call.endpoint}
              </span>
              <span role="cell">{call.detail}</span>
              <span role="cell">
                <CodeRefs refs={call.refs} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="guard-title">
        <div className="section-heading">
          <p className="kicker">Safety check</p>
          <h2 id="guard-title">Existing Cloudflare triggers are adopted only by repo id</h2>
        </div>
        <div className="guard-grid">
          {guardCases.map((guardCase) => (
            <article className="card" key={guardCase.title}>
              <h3>{guardCase.title}</h3>
              <p>{guardCase.detail}</p>
              <CodeRefs refs={guardCase.refs} />
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="state-title">
        <div className="section-heading">
          <p className="kicker">Persisted state</p>
          <h2 id="state-title">The database shape is explicit</h2>
        </div>
        <div className="state-list">
          {stateRows.map((row) => (
            <article className="state-row" key={row.exactName}>
              <div>
                <p className="state-location">{row.location}</p>
                <h3>{row.exactName}</h3>
              </div>
              <p>{row.meaning}</p>
              <CodeRefs refs={row.refs} />
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="failure-title">
        <div className="section-heading">
          <p className="kicker">Failure surface</p>
          <h2 id="failure-title">The guard errors are meant to reach the dashboard</h2>
        </div>
        <div className="entry-grid">
          {failureRefs.map((failure) => (
            <article className="card" key={failure.title}>
              <h3>{failure.title}</h3>
              <p>{failure.detail}</p>
              <CodeRefs refs={failure.refs} />
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="tests-title">
        <div className="section-heading">
          <p className="kicker">Pinned behavior</p>
          <h2 id="tests-title">Tests that define the branch contract</h2>
        </div>
        <div className="test-grid">
          {pinnedTests.map((test) => (
            <article className="test-card" key={test.title}>
              <h3>{test.title}</h3>
              <CodeRefs refs={test.refs} />
            </article>
          ))}
        </div>
      </section>

      <section className="section close" aria-labelledby="mental-model-title">
        <p className="kicker">Mental model</p>
        <h2 id="mental-model-title">
          The branch adds a reusable run, not a new create-app-only path
        </h2>
        <p>
          The actual implementation shape is: wireBuilds or the provisioned-Worker follow-on creates
          an appProvisioningRuns row with trigger wire_builds; the workflow claims the vault
          infrastructure lock; the action verifies GitHub repo identity with Octokit; the Cloudflare
          helper connects the repo, triggers, and token; then Samebase patches
          vaultCloudflareWorkers.deployment.builds.
        </p>
      </section>
    </main>
  );
}

export const Route = createFileRoute("/walkthrough/cloudflare-worker-builds")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: CloudflareWorkerBuildsWalkthrough,
});

const walkthroughCss = `
.walkthrough {
  background: #f7f5ef;
  color: #24211d;
  min-height: 100dvh;
  padding: 32px;
}

.walkthrough * {
  box-sizing: border-box;
  letter-spacing: 0;
}

.hero,
.section {
  margin: 0 auto;
  max-width: 1220px;
}

.hero {
  padding: 64px 0 36px;
}

.kicker {
  color: #7b4d24;
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 12px;
  text-transform: uppercase;
}

.walkthrough h1,
.walkthrough h2,
.walkthrough h3,
.walkthrough p {
  margin: 0;
}

.walkthrough h1 {
  font-size: 46px;
  line-height: 1.05;
  max-width: 880px;
}

.walkthrough h2 {
  font-size: 26px;
  line-height: 1.15;
}

.walkthrough h3 {
  font-size: 16px;
  line-height: 1.3;
}

.lede {
  color: #4f4941;
  font-size: 18px;
  line-height: 1.6;
  margin-top: 22px;
  max-width: 820px;
}

.section {
  padding: 34px 0;
}

.section-heading {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

.entry-grid,
.guard-grid,
.test-grid {
  display: grid;
  gap: 14px;
}

.entry-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.guard-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.test-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.card,
.test-card {
  background: #ffffff;
  border: 1px solid #d8d0c4;
  min-width: 0;
  padding: 18px;
}

.card p,
.test-card p,
.call-step p,
.api-row span,
.state-row p,
.close p {
  color: #5a534a;
  font-size: 14px;
  line-height: 1.55;
}

.card h3,
.test-card h3 {
  margin-bottom: 8px;
}

.code-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  min-width: 0;
}

.code-ref {
  background: #f3f0e8;
  border: 1px solid #d8d0c4;
  color: #1f5f7a;
  display: grid;
  gap: 3px;
  max-width: 100%;
  min-width: 0;
  padding: 8px 10px;
  text-decoration: none;
}

.code-ref span,
.code-ref small,
.endpoint,
.method {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.code-ref span {
  color: #1f5f7a;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.code-ref small {
  color: #6c6258;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.call-list {
  display: grid;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.call-step {
  align-items: start;
  background: #ffffff;
  border: 1px solid #d8d0c4;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  min-width: 0;
  padding: 18px;
}

.call-step h3 {
  margin-bottom: 8px;
}

.api-table {
  background: #ffffff;
  border: 1px solid #d8d0c4;
}

.api-row {
  display: grid;
  grid-template-columns: 1fr 0.45fr 1.25fr 1.3fr 1.35fr;
}

.api-row + .api-row {
  border-top: 1px solid #e7dfd4;
}

.api-row span {
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 14px;
}

.api-row-head {
  background: #2b2926;
}

.api-row-head span {
  color: #ffffff;
  font-weight: 700;
}

.method {
  color: #7b4d24 !important;
  font-weight: 700;
}

.endpoint {
  color: #1f5f7a !important;
  font-size: 12px !important;
}

.state-list {
  display: grid;
  gap: 12px;
}

.state-row {
  align-items: start;
  background: #ffffff;
  border: 1px solid #d8d0c4;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.3fr) minmax(0, 1fr);
  min-width: 0;
  padding: 18px;
}

.state-location {
  color: #7b4d24 !important;
  font-size: 12px !important;
  font-weight: 700;
  margin-bottom: 6px !important;
  text-transform: uppercase;
}

.close {
  max-width: 960px;
  padding-bottom: 72px;
}

.close p {
  font-size: 17px;
  margin-top: 16px;
}

@media (max-width: 1040px) {
  .entry-grid,
  .guard-grid,
  .test-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .call-step,
  .state-row {
    grid-template-columns: 1fr;
  }

  .api-row,
  .api-row-head {
    grid-template-columns: 1fr;
  }

  .api-row span + span {
    border-top: 1px solid #eee8df;
  }
}

@media (max-width: 720px) {
  .walkthrough {
    padding: 18px;
  }

  .hero {
    padding-top: 32px;
  }

  .walkthrough h1 {
    font-size: 34px;
  }

  .walkthrough h2 {
    font-size: 23px;
  }

  .entry-grid,
  .guard-grid,
  .test-grid {
    grid-template-columns: 1fr;
  }
}
`;
