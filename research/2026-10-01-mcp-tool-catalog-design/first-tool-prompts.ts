/**
Frozen first-tool prompt set (57 prompts) with labels, written before any first-tool run.

Each label names the acceptable first action per design:
- a list of Samebase tool keys (strict: the first tool must be one of them),
- "provider:<server>" for a request that belongs to another connected server,
- "none" when the right first action is to answer or ask without a tool.
`lenient` adds keys that are a reasonable preflight (for example reading the app list first).
*/
export type Expect = { strict: string[]; lenient?: string[] };
export type FirstToolPrompt = {
  id: string;
  kind:
    | "review_positive"
    | "review_negative"
    | "direct"
    | "indirect"
    | "multi_step"
    | "cross_server"
    | "unsupported";
  prompt: string;
  P: Expect;
  H: Expect;
};

const app = "samebase-live-tests/tmp-my-cool-app2";
const listP = ["list_repositories"];
const listH = ["list_apps"];

export const FIRST_TOOL_PROMPTS: FirstToolPrompt[] = [
  // The 8 submitted review cases (apps/samebase/scripts/chatgptAppSubmissionSource.ts, origin/main).
  {
    id: "R1",
    kind: "review_positive",
    prompt: "Which Samebase account am I signed in as, and what can this connection access?",
    P: { strict: ["auth_status"] },
    H: { strict: ["auth_status"] },
  },
  {
    id: "R2",
    kind: "review_positive",
    prompt: "List my Samebase apps and their setup status.",
    P: { strict: listP },
    H: { strict: listH },
  },
  {
    id: "R3",
    kind: "review_positive",
    prompt: `Show me the Cloudflare Workers I can attach to ${app}.`,
    P: { strict: listP },
    H: { strict: ["find_workers"], lenient: listH },
  },
  {
    id: "R4",
    kind: "review_positive",
    prompt:
      "Create a private Samebase app under samebase-live-tests in US East (N. Virginia) with a unique name that starts with tmp-plugin-review-. Report its repository and provider setup status.",
    P: { strict: listP, lenient: ["list_build_tokens"] },
    H: { strict: ["create_app"], lenient: [...listH, "auth_status"] },
  },
  {
    id: "R5",
    kind: "review_positive",
    prompt: "Open my Samebase dashboard in the browser.",
    P: { strict: ["sign_in_link"] },
    H: { strict: ["sign_in_link"] },
  },
  {
    id: "R6",
    kind: "review_negative",
    prompt: "Change the README heading in octocat/Hello-World and open a pull request.",
    P: { strict: ["provider:github"] },
    H: { strict: ["provider:github"] },
  },
  {
    id: "R7",
    kind: "review_negative",
    prompt: "Can I delete a Samebase app and all of its resources through Samebase MCP?",
    P: { strict: ["none"] },
    H: { strict: ["none"] },
  },
  {
    id: "R8",
    kind: "review_negative",
    prompt: "Create a standalone Cloudflare Worker for me.",
    P: { strict: ["none", "provider:cloudflare-bindings", "provider:cloudflare-builds"] },
    H: { strict: ["none", "provider:cloudflare-bindings", "provider:cloudflare-builds"] },
  },

  // Direct and indirect phrasings per capability.
  {
    id: "D01",
    kind: "direct",
    prompt: "Which Samebase account is this connection using?",
    P: { strict: ["auth_status"] },
    H: { strict: ["auth_status"] },
  },
  {
    id: "I01",
    kind: "indirect",
    prompt: "Am I logged into Samebase with my work account or my personal one?",
    P: { strict: ["auth_status"] },
    H: { strict: ["auth_status"] },
  },
  {
    id: "D02",
    kind: "direct",
    prompt: "Give me a link to sign in to the Samebase dashboard.",
    P: { strict: ["sign_in_link"] },
    H: { strict: ["sign_in_link"] },
  },
  {
    id: "I02",
    kind: "indirect",
    prompt: "Take me to the Samebase web UI.",
    P: { strict: ["sign_in_link"] },
    H: { strict: ["sign_in_link"] },
  },
  {
    id: "D03",
    kind: "direct",
    prompt:
      "Send this feedback to the Samebase team: the Worker discovery list is too long to read.",
    P: { strict: ["submit_feedback"] },
    H: { strict: ["submit_feedback"] },
  },
  {
    id: "I03",
    kind: "indirect",
    prompt: "The Samebase create flow confused me. Can you let them know?",
    P: { strict: ["none"] },
    H: { strict: ["none"] },
  },
  {
    id: "D04",
    kind: "direct",
    prompt: "Show all my Samebase apps.",
    P: { strict: listP },
    H: { strict: listH },
  },
  {
    id: "I04",
    kind: "indirect",
    prompt: "What have I got running on Samebase right now?",
    P: { strict: listP },
    H: { strict: listH },
  },
  {
    id: "D05",
    kind: "direct",
    prompt: `What is the deployment status of ${app}?`,
    P: { strict: listP, lenient: ["repository_status"] },
    H: { strict: ["app_status"], lenient: listH },
  },
  {
    id: "I05",
    kind: "indirect",
    prompt: "Is the production site for tmp-my-cool-app2 up to date with main?",
    P: { strict: listP, lenient: ["repository_status"] },
    H: { strict: ["app_status"], lenient: listH },
  },
  {
    id: "D06",
    kind: "direct",
    prompt: "Create a new Samebase app called tmp-recipes under samebase-live-tests.",
    P: { strict: listP, lenient: ["list_build_tokens"] },
    H: { strict: ["create_app"], lenient: listH },
  },
  {
    id: "I06",
    kind: "indirect",
    prompt:
      "Spin up a new full-stack project for me on Samebase named tmp-habits, owned by samebase-live-tests.",
    P: { strict: listP, lenient: ["list_build_tokens"] },
    H: { strict: ["create_app"], lenient: listH },
  },
  {
    id: "D07",
    kind: "direct",
    prompt:
      "Connect my existing GitHub repository samebase-live-tests/legacy-portfolio to Samebase.",
    P: { strict: ["connect_repository"], lenient: listP },
    H: { strict: ["connect_app"], lenient: listH },
  },
  {
    id: "I07",
    kind: "indirect",
    prompt: "I already have the repo samebase-live-tests/legacy-portfolio. Make it a Samebase app.",
    P: { strict: ["connect_repository"], lenient: listP },
    H: { strict: ["connect_app"], lenient: listH },
  },
  {
    id: "D08",
    kind: "direct",
    prompt: `Retry the failed provider setup for ${app}.`,
    P: { strict: listP },
    H: { strict: ["repair"], lenient: ["app_status"] },
  },
  {
    id: "I08",
    kind: "indirect",
    prompt: "Setup for tmp-my-cool-app2 stopped with an error. Please get it working.",
    P: { strict: listP },
    H: { strict: ["app_status", "repair"], lenient: listH },
  },
  {
    id: "D09",
    kind: "direct",
    prompt: "Which Workers Builds API tokens can Samebase use for samebase-live-tests?",
    P: { strict: ["list_build_tokens"] },
    H: { strict: ["none"] },
  },
  {
    id: "D10",
    kind: "direct",
    prompt: `Which Cloudflare Workers can I attach to ${app}?`,
    P: { strict: listP },
    H: { strict: ["find_workers"], lenient: listH },
  },
  {
    id: "I10",
    kind: "indirect",
    prompt: "Are there existing Workers I could hook up to tmp-my-cool-app2?",
    P: { strict: listP },
    H: { strict: ["find_workers"], lenient: listH },
  },
  {
    id: "D11",
    kind: "direct",
    prompt: `Attach the Worker tmp-my-cool-app2-api to ${app}.`,
    P: { strict: listP },
    H: { strict: ["attach_workers"], lenient: ["find_workers", ...listH] },
  },
  {
    id: "I11",
    kind: "indirect",
    prompt:
      "tmp-my-cool-app2-api already deploys from my repo. Link it to the tmp-my-cool-app2 app in Samebase.",
    P: { strict: listP },
    H: { strict: ["attach_workers"], lenient: ["find_workers", ...listH] },
  },
  {
    id: "D12",
    kind: "direct",
    prompt: `Connect my existing Worker legacy-landing to ${app} with Workers Builds.`,
    P: { strict: listP },
    H: { strict: ["connect_worker", "none"], lenient: ["find_workers", ...listH] },
  },
  {
    id: "D13",
    kind: "direct",
    prompt: `Create a new Cloudflare Worker called tmp-my-cool-app2-admin for ${app}.`,
    P: { strict: listP },
    H: { strict: ["create_worker"], lenient: listH },
  },
  {
    id: "I13",
    kind: "indirect",
    prompt:
      "My Samebase app tmp-my-cool-app2 needs a second Worker for the admin panel in admin/. Set it up.",
    P: { strict: listP },
    H: { strict: ["create_worker"], lenient: listH },
  },
  {
    id: "D14",
    kind: "direct",
    prompt: `Reconfigure Workers Builds for the tmp-my-cool-app Worker on ${app}.`,
    P: { strict: listP },
    H: { strict: ["repair"], lenient: ["app_status"] },
  },
  {
    id: "D15",
    kind: "direct",
    prompt: "Rotate the Convex deploy keys used by tmp-my-cool-app2's Worker builds.",
    P: { strict: listP },
    H: { strict: ["repair"], lenient: ["app_status", ...listH] },
  },
  {
    id: "D16",
    kind: "direct",
    prompt: `Detach the Worker tmp-my-cool-app from ${app}, but keep it in Cloudflare.`,
    P: { strict: listP },
    H: { strict: ["detach", "none"] },
  },
  {
    id: "D17",
    kind: "direct",
    prompt: `Which Convex projects can I attach to ${app}?`,
    P: { strict: listP },
    H: { strict: ["find_convex"], lenient: listH },
  },
  {
    id: "D18",
    kind: "direct",
    prompt: `Attach the Convex project weather-data to ${app}.`,
    P: { strict: listP },
    H: { strict: ["add_convex"], lenient: ["find_convex", ...listH] },
  },
  {
    id: "I18",
    kind: "indirect",
    prompt: "Use my existing weather-data backend for the Samebase app tmp-my-cool-app2.",
    P: { strict: listP },
    H: { strict: ["add_convex"], lenient: ["find_convex", ...listH] },
  },
  {
    id: "D19",
    kind: "direct",
    prompt: `Create a new Convex project named tmp-my-cool-app2-analytics for ${app}.`,
    P: { strict: listP },
    H: { strict: ["add_convex"], lenient: ["find_convex", ...listH] },
  },
  {
    id: "D20",
    kind: "direct",
    prompt:
      "I moved the convex folder to backend/convex in tmp-my-cool-app2. Update the code location in Samebase.",
    P: { strict: listP },
    H: { strict: ["none", "sign_in_link"] },
  },
  {
    id: "D21",
    kind: "direct",
    prompt: `Detach the Convex project from ${app} without deleting it.`,
    P: { strict: listP },
    H: { strict: ["detach", "none"] },
  },
  {
    id: "D22",
    kind: "direct",
    prompt:
      "I created the Workers Builds token. Finish the Cloudflare setup for dana-builds/tmp-first-app.",
    P: { strict: listP },
    H: { strict: ["create_worker", "repair"], lenient: ["app_status", ...listH] },
  },

  // Multi-step requests: label the first tool.
  {
    id: "M1",
    kind: "multi_step",
    prompt:
      "Create an app named tmp-shop under samebase-live-tests, then attach my weather-data Convex project to it.",
    P: { strict: listP, lenient: ["list_build_tokens"] },
    H: { strict: ["create_app"], lenient: listH },
  },
  {
    id: "M2",
    kind: "multi_step",
    prompt: "Check whether tmp-my-cool-app2's last push deployed, and fix the build if it failed.",
    P: { strict: listP },
    H: { strict: ["app_status"], lenient: listH },
  },
  {
    id: "M3",
    kind: "multi_step",
    prompt: "Add the Worker legacy-landing to tmp-my-cool-app2 and then tell me its URL.",
    P: { strict: listP },
    H: { strict: ["find_workers", "connect_worker"], lenient: listH },
  },

  // Ambiguous cross-server requests.
  {
    id: "X1",
    kind: "cross_server",
    prompt: "Show me the build logs for the latest failed build of my Worker tmp-my-cool-app.",
    P: { strict: ["provider:cloudflare-builds"] },
    H: { strict: ["provider:cloudflare-builds"] },
  },
  {
    id: "X2",
    kind: "cross_server",
    prompt: "Set the environment variable STRIPE_KEY on my Convex production deployment.",
    P: { strict: ["provider:convex", "none"] },
    H: { strict: ["provider:convex", "none"] },
  },
  {
    id: "X3",
    kind: "cross_server",
    prompt: "List the tables in my Convex deployment.",
    P: { strict: ["provider:convex"] },
    H: { strict: ["provider:convex"] },
  },
  {
    id: "X4",
    kind: "cross_server",
    prompt: "Create a new GitHub repository called tmp-scratch under my account.",
    P: { strict: ["provider:github"] },
    H: { strict: ["provider:github"] },
  },
  {
    id: "X5",
    kind: "cross_server",
    prompt: "List my GitHub repositories.",
    P: { strict: ["provider:github"] },
    H: { strict: ["provider:github"] },
  },
  {
    id: "X6",
    kind: "cross_server",
    prompt: `Open a pull request in ${app} that bumps React to the latest version.`,
    P: { strict: ["provider:github"] },
    H: { strict: ["provider:github"] },
  },
  {
    id: "X7",
    kind: "cross_server",
    prompt: "What Workers do I have in my Cloudflare account?",
    P: { strict: ["provider:cloudflare-bindings", "provider:cloudflare-builds"] },
    H: { strict: ["provider:cloudflare-bindings", "provider:cloudflare-builds"] },
  },
  {
    id: "X8",
    kind: "cross_server",
    prompt: "Delete the KV namespace cache-v1 in my Cloudflare account.",
    P: { strict: ["provider:cloudflare-bindings"] },
    H: { strict: ["provider:cloudflare-bindings"] },
  },

  // Unsupported through Samebase MCP: answer and offer the dashboard, no tool first.
  {
    id: "U1",
    kind: "unsupported",
    prompt: "Invite alice@example.com to my Samebase organization.",
    P: { strict: ["none"] },
    H: { strict: ["none"] },
  },
  {
    id: "U2",
    kind: "unsupported",
    prompt: "Rename the Worker tmp-my-cool-app to tmp-weather in Samebase.",
    P: { strict: ["none"] },
    H: { strict: ["none"] },
  },
  {
    id: "U3",
    kind: "unsupported",
    prompt: "Upgrade my Samebase plan to Professional.",
    P: { strict: ["none"] },
    H: { strict: ["none"] },
  },
  {
    id: "U4",
    kind: "unsupported",
    prompt: "Delete my Samebase app tmp-my-cool-app2.",
    P: { strict: ["none"] },
    H: { strict: ["none"] },
  },
];
