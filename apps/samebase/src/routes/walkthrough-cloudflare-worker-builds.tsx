import { createFileRoute } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/walkthrough/cloudflare-worker-builds";

const walkthroughMetadata: PageMetadata = {
  title: "Cloudflare Worker Builds Walkthrough | Samebase",
  description: "Visual walkthrough of the Cloudflare Worker Builds wiring changes in PR 1155.",
  canonicalPath: pathname,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

const flowStages = [
  {
    tone: "repo",
    label: "GitHub repository",
    caption: "Immutable repo id is the source of truth.",
  },
  {
    tone: "worker",
    label: "Attached Worker",
    caption: "Created by Samebase or selected from Cloudflare.",
  },
  {
    tone: "run",
    label: "wire_builds run",
    caption: "Owns repo connection, triggers, token, and first build policy.",
  },
  {
    tone: "cloudflare",
    label: "Workers Builds",
    caption: "Cloudflare keeps the Worker-to-repo link on build triggers.",
  },
  {
    tone: "state",
    label: "Samebase state",
    caption: "Builds and Convex build access are independent axes.",
  },
];

const beforeAfterItems = [
  {
    title: "Before",
    points: [
      "Manual Worker attach stopped at a disconnected row.",
      "Cloudflare setup was tied to the create-app mega-step.",
      "The Worker row had one combined deployment state.",
      "A selected existing Worker could be treated like Samebase owned the whole deploy path.",
    ],
  },
  {
    title: "After",
    points: [
      "Worker attach and Builds wiring are separate blocks.",
      "wire_builds has no Convex input and can serve Cloudflare-only apps.",
      "Builds connection and Convex build access are separate durable states.",
      "Selected existing Workers stay non-invasive until the user explicitly wires builds.",
    ],
  },
];

const stateRows = [
  {
    axis: "builds",
    empty: "not_connected",
    complete: "connected",
    owner: "wire_builds",
  },
  {
    axis: "convexBuildAccess",
    empty: "not_wired",
    complete: "wired",
    owner: "wire_convex_build_access",
  },
];

const guardRows = [
  {
    status: "Recommended",
    detail: "Existing trigger repo id matches the vault GitHub repo id.",
  },
  {
    status: "Available",
    detail: "No trigger exists yet, so Samebase can create the Builds link.",
  },
  {
    status: "Blocked",
    detail: "A trigger already points at a different repo or a deleted repo connection.",
  },
  {
    status: "Unknown",
    detail: "Cloudflare does not return enough trigger repo identity to prove ownership.",
  },
];

const fileGroups = [
  {
    label: "Cloudflare API boundary",
    files: ["cloudflareResources.ts", "cloudflareResources.test.ts"],
    summary: "Repo connection, trigger guard, build token, build trigger, and initial build calls.",
  },
  {
    label: "Durable block state",
    files: ["vault/cloudflareMutations.ts", "vault/model.ts"],
    summary: "Claims, records, retries, and the two-axis Worker deployment model.",
  },
  {
    label: "Workflow orchestration",
    files: ["appProvisioningWorkflow.ts", "infraProvisioning.ts"],
    summary: "Queues wire_builds after provisioned Workers and surfaces failure messages.",
  },
  {
    label: "Repo identity",
    files: ["githubRepoApi.ts"],
    summary: "Uses Octokit to verify the GitHub repo id and owner id before Cloudflare wiring.",
  },
  {
    label: "Plan contract",
    files: ["rfcs/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md"],
    summary: "Documents the block model, discovery classes, and no legacy row adapter.",
  },
];

const scenarios = [
  {
    title: "New app",
    path: "source_setup -> attach_convex -> attach_worker -> wire_builds -> wire_convex_build_access",
    result: "Samebase creates the Worker, wires Builds, then adds Convex deploy-key env vars.",
  },
  {
    title: "Imported repo moving to Cloudflare",
    path: "source_setup -> attach_convex -> attach_worker -> wire_builds -> wire_convex_build_access",
    result:
      "The chessmerge-style path can move from Netlify to Cloudflare without recreating Convex.",
  },
  {
    title: "Cloudflare-only app",
    path: "source_setup -> attach_worker -> wire_builds",
    result: "Builds connect without requiring a Convex deployment.",
  },
  {
    title: "Picked existing Worker",
    path: "attach_worker -> explicit wireBuilds action",
    result: "Samebase records the Worker but does not mutate its Builds settings automatically.",
  },
];

function CloudflareWorkerBuildsWalkthrough() {
  usePageMetadata(walkthroughMetadata);

  return (
    <main className="walkthrough" data-testid="cloudflare-worker-builds-walkthrough">
      <style>{walkthroughCss}</style>
      <section className="walkthrough-hero" aria-labelledby="walkthrough-title">
        <p className="walkthrough-kicker">PR 1155 visual walkthrough</p>
        <h1 id="walkthrough-title">Create or connect a Worker, then wire Builds deliberately</h1>
        <p className="walkthrough-lede">
          The branch turns Cloudflare Worker setup into reusable blocks. Worker attachment no longer
          implies deployment ownership, Builds wiring no longer depends on Convex, and existing
          Cloudflare triggers are adopted only when the GitHub repo id proves they belong to the
          vault.
        </p>
      </section>

      <section className="walkthrough-band" aria-labelledby="flow-title">
        <div className="walkthrough-section-heading">
          <p className="walkthrough-kicker">System flow</p>
          <h2 id="flow-title">The useful path starts after the Worker exists</h2>
        </div>
        <ol className="flow-diagram" aria-label="Cloudflare Worker Builds wiring flow">
          {flowStages.map((stage, index) => (
            <li className="flow-step" data-tone={stage.tone} key={stage.label}>
              <div className="flow-index">{index + 1}</div>
              <h3>{stage.label}</h3>
              <p>{stage.caption}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="walkthrough-split" aria-labelledby="before-after-title">
        <div className="walkthrough-section-heading">
          <p className="walkthrough-kicker">Behavior shift</p>
          <h2 id="before-after-title">From a combined deploy state to composable blocks</h2>
        </div>
        <div className="comparison-grid">
          {beforeAfterItems.map((item) => (
            <article className="comparison-card" key={item.title}>
              <h3>{item.title}</h3>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="walkthrough-band" aria-labelledby="state-title">
        <div className="walkthrough-section-heading">
          <p className="walkthrough-kicker">State model</p>
          <h2 id="state-title">Worker deployment is two axes, not a legacy union</h2>
        </div>
        <div className="state-table" role="table" aria-label="Cloudflare Worker deployment state">
          <div className="state-row state-row-head" role="row">
            <span role="columnheader">Axis</span>
            <span role="columnheader">Empty</span>
            <span role="columnheader">Complete</span>
            <span role="columnheader">Written by</span>
          </div>
          {stateRows.map((row) => (
            <div className="state-row" role="row" key={row.axis}>
              <span role="cell">{row.axis}</span>
              <span role="cell">{row.empty}</span>
              <span role="cell">{row.complete}</span>
              <span role="cell">{row.owner}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="walkthrough-split" aria-labelledby="guard-title">
        <div className="walkthrough-section-heading">
          <p className="walkthrough-kicker">Repo guard</p>
          <h2 id="guard-title">Existing trigger adoption is repo-id based</h2>
        </div>
        <div className="guard-grid">
          {guardRows.map((row) => (
            <article className="guard-card" key={row.status}>
              <h3>{row.status}</h3>
              <p>{row.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="walkthrough-band" aria-labelledby="scenario-title">
        <div className="walkthrough-section-heading">
          <p className="walkthrough-kicker">User flows</p>
          <h2 id="scenario-title">The same blocks cover create, import, and manual attach</h2>
        </div>
        <div className="scenario-list">
          {scenarios.map((scenario) => (
            <article className="scenario-row" key={scenario.title}>
              <h3>{scenario.title}</h3>
              <p className="scenario-path">{scenario.path}</p>
              <p>{scenario.result}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="walkthrough-split" aria-labelledby="files-title">
        <div className="walkthrough-section-heading">
          <p className="walkthrough-kicker">File map</p>
          <h2 id="files-title">Where the branch moved responsibility</h2>
        </div>
        <div className="file-map">
          {fileGroups.map((group) => (
            <article className="file-card" key={group.label}>
              <h3>{group.label}</h3>
              <p>{group.summary}</p>
              <ul>
                {group.files.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="walkthrough-band walkthrough-close" aria-labelledby="review-title">
        <p className="walkthrough-kicker">Review lens</p>
        <h2 id="review-title">The change is intentionally conservative around existing Workers</h2>
        <p>
          Samebase can create a useful Worker for an existing repo, but it does not silently take
          over an unrelated Cloudflare Builds connection. When a Worker already points at another
          repo, the run fails closed with the concrete Cloudflare remediation instead of creating a
          second trigger or hiding the problem behind a generic provisioning error.
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

.walkthrough-hero,
.walkthrough-band,
.walkthrough-split {
  margin: 0 auto;
  max-width: 1180px;
}

.walkthrough-hero {
  padding: 64px 0 40px;
}

.walkthrough-kicker {
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
  font-size: 48px;
  line-height: 1.05;
  max-width: 900px;
}

.walkthrough h2 {
  font-size: 28px;
  line-height: 1.15;
}

.walkthrough h3 {
  font-size: 16px;
  line-height: 1.25;
}

.walkthrough-lede {
  color: #4f4941;
  font-size: 18px;
  line-height: 1.6;
  margin-top: 24px;
  max-width: 860px;
}

.walkthrough-band,
.walkthrough-split {
  padding: 34px 0;
}

.walkthrough-section-heading {
  display: grid;
  gap: 8px;
  margin-bottom: 22px;
}

.flow-diagram {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.flow-step {
  background: #ffffff;
  border: 1px solid #d8d0c4;
  min-height: 190px;
  padding: 18px;
  position: relative;
}

.flow-step::after {
  color: #8d8378;
  content: "->";
  font-weight: 700;
  position: absolute;
  right: -16px;
  top: 50%;
  transform: translateY(-50%);
}

.flow-step:last-child::after {
  content: "";
}

.flow-index {
  align-items: center;
  border: 1px solid currentColor;
  display: flex;
  font-size: 12px;
  height: 26px;
  justify-content: center;
  margin-bottom: 22px;
  width: 26px;
}

.flow-step p,
.comparison-card li,
.guard-card p,
.scenario-row p,
.file-card p,
.walkthrough-close p {
  color: #5a534a;
  font-size: 14px;
  line-height: 1.55;
}

.flow-step h3,
.file-card h3,
.guard-card h3,
.comparison-card h3,
.scenario-row h3 {
  margin-bottom: 8px;
}

.flow-step[data-tone="repo"] {
  border-top: 5px solid #2f6f8f;
}

.flow-step[data-tone="worker"] {
  border-top: 5px solid #c25f3b;
}

.flow-step[data-tone="run"] {
  border-top: 5px solid #6f6aa8;
}

.flow-step[data-tone="cloudflare"] {
  border-top: 5px solid #d18422;
}

.flow-step[data-tone="state"] {
  border-top: 5px solid #4d7c45;
}

.comparison-grid,
.guard-grid,
.file-map {
  display: grid;
  gap: 14px;
}

.comparison-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.guard-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.file-map {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.comparison-card,
.guard-card,
.file-card,
.scenario-row {
  background: #ffffff;
  border: 1px solid #d8d0c4;
  min-width: 0;
  padding: 18px;
}

.comparison-card ul,
.file-card ul {
  display: grid;
  gap: 9px;
  margin: 0;
  padding-left: 18px;
}

.state-table {
  background: #ffffff;
  border: 1px solid #d8d0c4;
}

.state-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr 1.3fr;
}

.state-row + .state-row {
  border-top: 1px solid #e7dfd4;
}

.state-row span {
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
  padding: 16px;
  overflow-wrap: anywhere;
}

.state-row-head {
  background: #2b2926;
  color: #ffffff;
  font-weight: 700;
}

.scenario-list {
  display: grid;
  gap: 12px;
}

.scenario-row {
  display: grid;
  gap: 8px;
  grid-template-columns: 0.8fr 1.5fr 1.2fr;
}

.scenario-path {
  color: #2f6f8f !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 13px !important;
}

.file-card ul {
  color: #2f6f8f;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
  margin-top: 14px;
  overflow-wrap: anywhere;
}

.walkthrough-close {
  max-width: 920px;
  padding-bottom: 72px;
}

.walkthrough-close p {
  font-size: 17px;
  margin-top: 16px;
}

@media (max-width: 1040px) {
  .flow-diagram,
  .guard-grid,
  .file-map {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flow-step::after {
    content: "";
  }

  .scenario-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .walkthrough {
    padding: 18px;
  }

  .walkthrough-hero {
    padding-top: 32px;
  }

  .walkthrough h1 {
    font-size: 34px;
  }

  .walkthrough h2 {
    font-size: 23px;
  }

  .flow-diagram,
  .comparison-grid,
  .guard-grid,
  .file-map {
    grid-template-columns: 1fr;
  }

  .state-row,
  .state-row-head {
    grid-template-columns: 1fr;
  }

  .state-row span + span {
    border-top: 1px solid #eee8df;
  }
}
`;
