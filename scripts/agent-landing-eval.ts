import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { LANDING_AGENT_PROMPT } from "../apps/samebase/shared/landingAgentPrompt.ts";

/**
Send the landing page agent prompt to fresh Claude Code and Codex sessions, then grade each answer
against the evaluated site's `/llms.txt` and the markdown pages it links. The grade checks accuracy
and calibration. A plain "yes, use Samebase" does not pass.

Usage:
  node ./scripts/agent-landing-eval.ts
  node ./scripts/agent-landing-eval.ts --url "https://<preview-origin>/?prod-ui" --agents codex

Each agent starts in a new non-Git temporary directory with web access, no repository context, no
inherited Claude or Codex session variables, and closed stdin. Codex gets a temporary CODEX_HOME
that holds only `auth.json`. Codex grades every answer with a JSON output schema.

Results go to `.tmp/agent-landing-eval/<timestamp>/`. The exit code is 1 when any agent fails to
answer or any answer fails a criterion.

Protocol: research/2026-07-06-agent-landing-eval-questions.md ("How To Run A Round").
*/

const PRODUCTION_ORIGIN = "https://samebase.com";
const AGENTS = ["claude", "codex"] as const;
const CRITERIA = [
  "retrieval",
  "reconstruction",
  "factualAccuracy",
  "claimChecking",
  "calibration",
] as const;
const AGENT_TIMEOUT_MS = 10 * 60 * 1000;

type Agent = (typeof AGENTS)[number];

const { values } = parseArgs({
  options: {
    agents: { type: "string", default: AGENTS.join(",") },
    url: { type: "string", default: PRODUCTION_ORIGIN },
  },
});

const agents = values.agents.split(",").map((name) => {
  const agent = AGENTS.find((candidate) => candidate === name.trim());
  if (!agent) {
    throw new Error(`Unknown agent "${name}". Use ${AGENTS.join(", ")}.`);
  }
  return agent;
});
if (!LANDING_AGENT_PROMPT.includes(PRODUCTION_ORIGIN)) {
  throw new Error(`The landing agent prompt no longer names ${PRODUCTION_ORIGIN}.`);
}
const evalUrl = values.url;
const prompt = LANDING_AGENT_PROMPT.replace(PRODUCTION_ORIGIN, evalUrl);

const outDir = join(
  import.meta.dirname,
  "..",
  ".tmp",
  "agent-landing-eval",
  new Date().toISOString().replaceAll(":", "-"),
);

const gradeSchema = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", enum: CRITERIA },
          pass: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["name", "pass", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["criteria"],
  additionalProperties: false,
};

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: AGENT_TIMEOUT_MS,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** The evaluated agent must not inherit this session's Claude, Anthropic, or Codex settings. */
function agentEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/^(ANTHROPIC_|CLAUDE|CODEX_)/.test(key)),
    ),
    ...extra,
  };
}

async function askClaude(workDir: string) {
  const result = await run(
    "claude",
    [
      "-p",
      "--safe-mode",
      "--no-session-persistence",
      "--permission-mode",
      "bypassPermissions",
      "--tools",
      "WebFetch,WebSearch",
      "--effort",
      "low",
      "--output-format",
      "stream-json",
      "--verbose",
      prompt,
    ],
    workDir,
    agentEnv({}),
  );
  await writeFile(join(outDir, "claude.events.jsonl"), result.stdout);

  const final: unknown = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "null");
  if (
    typeof final !== "object" ||
    final === null ||
    !("result" in final) ||
    typeof final.result !== "string" ||
    !("is_error" in final) ||
    final.is_error !== false
  ) {
    throw new Error(`claude did not answer: ${result.stdout.slice(-500)}${result.stderr}`);
  }
  return final.result;
}

/** Runs Codex with a temporary CODEX_HOME so user plugins, rules, and MCP servers stay out. */
async function runCodex(workDir: string, args: string[]) {
  const codexHome = await mkdtemp(join(tmpdir(), "samebase-agent-landing-codex-home-"));
  try {
    await copyFile(join(homedir(), ".codex", "auth.json"), join(codexHome, "auth.json"));
    return await run(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "-C",
        workDir,
        ...args,
      ],
      workDir,
      agentEnv({ CODEX_HOME: codexHome }),
    );
  } finally {
    await rm(codexHome, { force: true, recursive: true });
  }
}

async function askCodex(workDir: string) {
  const answerPath = join(workDir, "answer.md");
  // Codex web search cannot open preview origins, so the answering run gets shell network access.
  const result = await runCodex(workDir, [
    "--sandbox",
    "workspace-write",
    "-c",
    "sandbox_workspace_write.network_access=true",
    "--json",
    "-c",
    'model_reasoning_effort="low"',
    "--output-last-message",
    answerPath,
    prompt,
  ]);
  await writeFile(join(outDir, "codex.events.jsonl"), result.stdout);
  if (result.code !== 0) {
    throw new Error(`codex did not answer: ${result.stderr.slice(-1000)}`);
  }
  return readFile(answerPath, "utf8");
}

function gradePrompt(corpus: string, answer: string) {
  return `You grade one answer from a coding agent. A visitor pasted the prompt below into the agent. The agent had web access and no other context. The evaluated URL is ${evalUrl}.

Use the corpus below as the source of truth for what Samebase is and does. The corpus is the /llms.txt file of the evaluated site and every markdown page it links. A decision for or against Samebase can pass. Grade whether the answer is accurate and whether its decision follows from accurate reasons.

Grade each criterion as pass or fail, with a one-sentence reason:

- retrieval: The answer uses content from the evaluated URL (it cites, links, or quotes its pages), not only general knowledge. It fails if the answer says it could not read the evaluated URL.
- reconstruction: The answer's description of Samebase matches the corpus in substance: a service that sets up and manages apps whose code and services stay in the user's own GitHub, Convex, and Cloudflare accounts. It does not need to list every feature. It fails if it describes Samebase as a host, a reseller, or a prompt-to-app builder, or if it gives no description of what Samebase does.
- factualAccuracy: No statement contradicts the corpus, and the answer does not give Samebase a feature or action that the corpus does not describe. For example, Samebase actions do not read provider logs or configure custom domains. Facts from provider documentation or from Samebase's public GitHub repositories are not errors unless they contradict the corpus. Name each error in the reason.
- claimChecking: The answer checks at least one Samebase claim against a source, such as a receipt, provider documentation, or the pricing page, and says what it found.
- calibration: The answer says when Samebase is a good fit and when it is not, and its recommendation follows from those conditions. An unconditional yes or an unconditional no fails.

<prompt>
${prompt}
</prompt>

<corpus>
${corpus}
</corpus>

<answer>
${answer}
</answer>`;
}

async function grade(agent: Agent, corpus: string, answer: string) {
  const workDir = await mkdtemp(join(tmpdir(), `samebase-agent-landing-grade-${agent}-`));
  const schemaPath = join(workDir, "grade-schema.json");
  const gradePath = join(workDir, "grade.json");
  let raw: string;
  try {
    await writeFile(schemaPath, JSON.stringify(gradeSchema));
    const result = await runCodex(workDir, [
      "--sandbox",
      "read-only",
      "-c",
      'model_reasoning_effort="high"',
      "--output-schema",
      schemaPath,
      "--output-last-message",
      gradePath,
      gradePrompt(corpus, answer),
    ]);
    if (result.code !== 0) {
      throw new Error(`codex did not grade ${agent}: ${result.stderr.slice(-1000)}`);
    }
    raw = await readFile(gradePath, "utf8");
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
  await writeFile(join(outDir, `${agent}.grade.json`), raw);

  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("criteria" in parsed) ||
    !Array.isArray(parsed.criteria)
  ) {
    throw new Error(`Unexpected grade for ${agent}: ${raw}`);
  }
  const criteria = parsed.criteria.map((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("name" in item) ||
      !("pass" in item) ||
      !("reason" in item) ||
      typeof item.name !== "string" ||
      typeof item.pass !== "boolean" ||
      typeof item.reason !== "string"
    ) {
      throw new Error(`Unexpected grade criterion for ${agent}: ${JSON.stringify(item)}`);
    }
    return { name: item.name, pass: item.pass, reason: item.reason };
  });
  if (criteria.length !== CRITERIA.length) {
    throw new Error(`Grade for ${agent} must name each criterion once: ${raw}`);
  }
  return CRITERIA.map((name) => {
    const criterion = criteria.find((item) => item.name === name);
    if (!criterion) {
      throw new Error(`Grade for ${agent} is missing ${name}: ${raw}`);
    }
    return criterion;
  });
}

async function evaluate(agent: Agent, corpus: string) {
  const workDir = await mkdtemp(join(tmpdir(), `samebase-agent-landing-${agent}-`));
  try {
    const answer = agent === "claude" ? await askClaude(workDir) : await askCodex(workDir);
    await writeFile(join(outDir, `${agent}.answer.md`), answer);
    const criteria = await grade(agent, corpus, answer);
    return { agent, criteria, error: null };
  } catch (error) {
    return { agent, criteria: [], error: error instanceof Error ? error.message : String(error) };
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

async function fetchText(url: URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url.href} returned ${response.status}.`);
  }
  return response.text();
}

/**
The grading corpus is /llms.txt plus each markdown page it links. Links name the production origin
even on a preview, so each page is read from the evaluated origin instead.
*/
const llmsTxt = await fetchText(new URL("/llms.txt", evalUrl));
const docPaths = [
  ...new Set(
    [...llmsTxt.matchAll(/\]\((https:\/\/[^)\s]+\.md)\)/g)]
      .map((match) => new URL(match[1]))
      .filter((url) => url.origin === PRODUCTION_ORIGIN || url.origin === new URL(evalUrl).origin)
      .map((url) => url.pathname),
  ),
];
const docs = await Promise.all(
  docPaths.map(async (docPath) => {
    const url = new URL(docPath, evalUrl);
    return `<document url="${url.href}">\n${await fetchText(url)}\n</document>`;
  }),
);
const corpus = [
  `<document url="${new URL("/llms.txt", evalUrl).href}">\n${llmsTxt}\n</document>`,
  ...docs,
].join("\n\n");

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "prompt.txt"), `${prompt}\n`);
await writeFile(join(outDir, "corpus.md"), corpus);

console.log(`Prompt: ${prompt}`);
const results = await Promise.all(agents.map((agent) => evaluate(agent, corpus)));

const summary = results
  .map(({ agent, criteria, error }) => {
    if (error !== null) {
      return `## ${agent}: ERROR\n\n${error}`;
    }
    const verdict = criteria.every((criterion) => criterion.pass) ? "PASS" : "FAIL";
    const lines = criteria.map(
      (criterion) => `- ${criterion.pass ? "pass" : "FAIL"} ${criterion.name}: ${criterion.reason}`,
    );
    return `## ${agent}: ${verdict}\n\n${lines.join("\n")}`;
  })
  .join("\n\n");
await writeFile(join(outDir, "summary.md"), `${summary}\n`);
console.log(`\n${summary}\n\nResults: ${outDir}`);

const passed = results.every(
  ({ criteria, error }) => error === null && criteria.every((criterion) => criterion.pass),
);
process.exit(passed ? 0 : 1);
