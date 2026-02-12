## E2B Sandboxes as the Universal Runtime for Noter

### The Problem
Dev containers (Codespaces) take ~3 minutes to start. We currently need them mainly for `npx convex codegen` to generate TypeScript types. This kills the "instant, magical" experience from the vision doc.

### The Key Insight
Replace Codespaces entirely with E2B sandboxes (~200ms cold start). Use them for everything: development previews, TypeScript codegen, AND autonomous agent execution. This unifies the dev experience and the agent runtime into one model.

### Architecture Decision: Convex as Brain, E2B as Hands
Agents don't need persistent CLI environments. Convex handles the always-on stuff (state, scheduling, cron, webhooks, real-time UI, LLM orchestration). When something needs a shell -- running code, installing packages, codegen, pushing to GitHub -- spin up an ephemeral E2B sandbox, do the work, tear it down.

For self-modifying agents (the recursive vision), most "CLI" needs like `gh` are just GitHub API wrappers that Convex actions can call directly. True shell access via E2B is for when agents need to actually run/test code.

### File Architecture
Convex DB remains the source of truth for all project files (fits the "everything is text" philosophy). E2B sandboxes are ephemeral execution environments hydrated from Convex. This is cleaner than Codespaces where the container is both editor backend and runtime.

```
Monaco editor <-> Convex (source of truth, collaborative)
                    |
              E2B sandbox (ephemeral runtime)
                    |
              Preview / terminal output / codegen results
```

### Implementation Sequence

**Phase 1 -- Codegen pipeline:** Schema/function changes trigger an E2B sandbox that runs `npx convex codegen`, returns `_generated/` types back to Convex, Monaco picks them up. Debounce on 2-3s of inactivity. Pre-bake convex into the E2B sandbox template so it's fast.

**Phase 2 -- Live preview:** Full sandbox running `convex dev` + `vite dev`, preview shown in iframe. Kept alive with heartbeats during active sessions, torn down on inactivity. Rehydrated from Convex on return.

**Phase 3 -- Agent runtime:** Same E2B infrastructure used for autonomous agent execution (cron/webhook triggered). Convex action orchestrates: LLM decides what to do, spins up sandbox if needed, runs commands, stores results.

**Phase 4 (optional) -- Browser-side codegen:** Lightweight web worker that generates Convex types without a sandbox round-trip, making intellisense truly instant.

### Reference
E2B Fragments (github.com/e2b-dev/fragments) is an open-source Claude Artifacts clone proving this pattern works. LLM reasoning server-side, code execution in E2B sandboxes, preview in iframe. Same model, different application.

### Key Risks
- E2B sandbox limit is 24 hours (fine for sessions, need teardown/rehydrate pattern)
- Package install state is lost on sandbox teardown (solve with pre-baked templates or cached node_modules)
- Cost scales with sandbox-seconds, need to be smart about keeping sandboxes alive vs tearing down