# TODO

!!!github uses `gh` for its documentation, so that's why it works so well https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-your-connection-to-github-codespaces
- [ ] specifically left blank

- [ ] related to https://youtu.be/l9CPmPk2R-M?si=aBkwhdpB77T9A0ac&t=568 ; give people just a terminal drawer that uses prosemark!!!

- [ ] market just the cloudflare tunnel aspect, basically share your localhost as long as your laptop is open, use github to save it for ever

- [ ] change codex and draft/ branch naming convention to make phrases use _ instead of - inside; but replace / with -    the general idea is to not have to url encode and we need an alternative, maybe something better?

- [ ] create extractor shooter where end game is just a lot of damage, but you can wait it over

- [ ] instead of making the user choose between draft/push, just push to main, and an agent can pick it up and start working on it in a separate pr, but the initila idea is already on main; that way it's more async and you get instand knowledge for all other parallel branches, pretty fast (rebase.md)

- [ ] use Firefox Tree Style Tab as the reference UI for branch/PR representation: branches become collapsible tree items, draft PRs hang off the branch as child nodes, and activity/unread state should stay visible without opening each branch

- [ ] let users provide their own compute! instead of forccing to use Daytona, make it work on their actual machines; but it's much safer alternative to openclaw!!!!!!

- [ ] something

- [ ] idea, when people successfuly go the logo in form 1, it starts getting bigger and transform into a markdown chat input that says welcome and it says that they do something, idk

- [ ] research slogan idea: the same way there are preview frontend (cloudflare) deploys, preview backend (convex) deploys, now you have dev (noter.md) deploys 

- [ ] research this idea then come up with a slogan; the idea is to allow people to import their existing lovable project and we create a plan to transform it and actually do it since the user provides codex;

- [ ] a cool thing we can do when keyboard is opened on mobile is to just shift the whole page up, we usually care more about text when writing? 

- [ ] it should be possible to make sidebar peak a bit before you let go

- [ ] in dashboard don't add so much margin, at least on mobile it should be linear display and each element can take whole width, never need for margins

- [ ] goedel Bach book discussions between turtoise, are same as Ai discussions. same as philosopher discussions? 

- [ ] test using playwright from multiple browser states. E. g. browser was loaded with different version/cache from several days ago, and gets in again. 

- [ ] the minimal unit of work is the draft pr that starts with just experimentation, or just thing research this

- [ ] research slogan "noter never looses your thoughts (everything is markdown)"

- [ ] research: display cloudflare preview link directly on each branch in noter dashboard

- [ ] idea.md -> lightbulb.md -> lumina.md ?!?!?!?!?!

- [ ] web is more transparent than mobile apps

- [ ] load everything without editor and three. js to increase time to see
- [ ] https://x.com/matteocollina/status/2033590124919787819
- [ ] Make the chat always open at the bottom on mobile. Make it part of the UI, the same way chats are like Claude Code on mobile. 
- [ ] maybe jupyterlab is not necessaryle necessary, or even a good idea, since developers usually don't use it; and vibecoders don't even use it; only academia?
- [ ] replace precommit hook with something that can run in convex, or be automated
- [ ] the keyboard takes a lot of space, noter should also provide simpler, without necessary key, using wispr, or Quaid that would make sense to ask
- [ ] In Convex discord I've read that Convex storage is not a good option; R2 from Cloudflare is recommended; This is great is Cloudflare will be part of the stack;
- [ ] I was just thinking about using some sort of .mdx + agent that's specifically trained and has tools to read from github,convex,cloudflare,something for logs; and just displays this in noter.md it's also easy to configure the dashboard since it's just markdown; It's similar in a way to what datadog is doing;
- [ ] add excalidraw or anything that stores data in text
- [ ] everythin on a page can easily be configured by the agent; So if there's a form the agent can edit it directly (saved to convex); so you can even build your dashboard; or you can expose it to someone so someone can bpay for it and you get money
- [ ] allow setting
- [ ] talk with Alex
- [ ] light panda https://lightpanda.io/ - research this browser engine/automation tool
- [ ] review Observable notebooks docs for potential use/integration: https://observablehq.com/documentation/notebooks/
- [ ] if given enough instruction and context, it's good at categorizing, even on small models
- [ ] preview deploys should be created in the pr. But locally in Daytona use local convex
- [ ] add a Make target to stop any running local dev environments (at least processes bound to common dev ports like `5173`, `3000`, and `3210`)
- [ ] enforce the importance of using web apps when you're trying to do something on an older phone, that's not supported anymore. Mobile apps are a liability
- [ ] for netlify, just don't deploy if it's a md change (optimization? )
- [ ] use AST to validate user input; where user input is a JS function; cloudflare already does this with mcp calls
- [ ]  using UI, for example, let's say every time I write something in to-do, I would like there to be an agent that reacts to this and does some action. This could be a new. I think the graph could be used for this. It could use GitHub Actions or stuff like that. GitHub Actions are already graph-based, so we could just allow editing it to search with what product already did this or tried this 

## Companies to Research
- [ ] AFFiNE - https://affine.pro/ - Note-taking/collaboration platform
- [ ] shadcn-editor - https://shadcn-editor.vercel.app/ - Rich text editor components
- [ ] void.cloud - https://void.cloud/ - Research later
- [ ] Tuple - https://tuple.app/ - Remote pair programming app; study its screen sharing, remote control, and collaboration UX for noter

# The most important right now is to fix rebaseing works, because we always accept only things on incoming side instead of even trying to reconcile!!!!

- [ ] add better rebase skill/workflow: when conflict is only `pnpm-lock.yaml`, regenerate lockfile from manifests instead of manual conflict edits
- [ ] bootstrap: make `make anon` / `make anon-once` non-interactive when Convex wants a backend upgrade, or document the exact prompt/answer (`Yes` + `transfer data`)
- [ ] We need less of a profit from AI, if we allow them to stay with their paid tools, for codex/claude, so we don't even need to run any serious ai infra. And the price we can provide is much lower than any competitions, since we don't choose that battle at all
- [ ] pricing: inactive accounts should stay close to $0 cost for us because they mostly sit on Codex + Cloudflare; if someone signs up, tries it once, then disappears for a month or a year, we are not paying bandwidth or Daytona until they actively start developing again
- [ ] pricing model idea: charge more by released features / shipped output than by per-user seats; active development can then map to small usage-based costs (for example ~$5 once someone is actually building)
- [ ] in landing, we need to ask users what tech they know, for github, convex, etc
- [ ] but there's always a chat to just ask to understand, and also mention that the page and agent are built in noter
- [ ] it can use github files as its database, before using convex
- [ ] replace enter with cmd-enter for chat input - will make mobile and PC easier

## Medium Priority

- [ ] move token/credential freshness from frontend-triggered polling to backend scheduling for background agent work (start with Cloudflare, then generalize for other provider connections), with shared retry/backoff and observability

## High Priority

- [ ] **NEXT TASK**: Research how Supabase and other app builders handle worktrees/branching - do they provision different sandboxes for each branch or use a single sandbox per project? Plan to use Codex + Playwright to automate this research across multiple platforms
- [ ] **IMPORTANT / likely next**: switch sandbox ownership from branch-scoped to agent-scoped. Do not provision or lock one sandbox per branch. Each agent gets its own sandbox/runtime, and if it needs multiple branches it can create worktrees inside that sandbox.
- [ ] codex: make worktrees work automatically
- [ ] auth env vars: standardize on `AUTH_*` (or document precedence) and add a warning when multiple GitHub/Google env keys are set
- [ ] MCP consent UX: improve logged-out/no-account flow so users get clear next steps before consent
- [ ] branch actor presence: show Noter agents and MCP clients as per-branch facepiles based on shared tool-runtime activity/attribution, sourced from agent-owned sandboxes/worktrees instead of branch-owned sandboxes
- [ ] add dashboard-level settings panel (currently logout only exists inside vault)
- [ ] settings: add option to remove account
- [ ] decide if Turborepo is necessary or if PNPM workspaces alone are enough
- [ ] chat-first UI: start with chatbot; allow chat messages to render Tailwind/React UI so users can promote pieces into the page (ex: sign-in inside chat)
- [ ] the dev container template, should automatically login with convex so the dev server can be started immediately
- [ ] Daytona prebuild alternative: use GitHub Actions to build devcontainer image and push to GHCR, with a manual UI button to trigger the workflow (auto-trigger later)
- [ ] security: remove first-request token bootstrap in `.codespace-agent/server.js`; require preconfigured secret for auth before exposing agent APIs
- [ ] security: fix codespace agent exposure model (`port 3000` public + `/exec`/file endpoints); restrict reachability or add hardened gateway auth
- [ ] starter manifest hygiene: exclude `.codespace-agent/node_modules/**` from template export and regenerate deterministic `starterSeedManifest.generated.ts`
- [ ] starter template hygiene: add CI coverage for `apps/noter-starter-template` (we missed a `node_modules`/ignore drift once because it wasn't being checked)
- [ ] add help center app, show how easy it is to have one, where everything is markdown
- [ ] add a user-centering support route where someone can report an issue and noter automatically creates a GitHub issue so I can review it and help
- [ ] worktree friendly vibe code editor
- [ ] **IMPORTANT**: make `noter.md` comfortable to use with worktrees using Codex on mac
- [ ] document 3 ways to view `noter.md`:
1. noter is a note taking app based on Markdown similar to obsidian, but it's collaborative like notion (syncs to github in background)
2. since agents can be defined using markdown and tools.json, using a repo with files is a nice and clear representation (instead of pythong or typescript)
3. the agents are running on convex for the backend, and netlify (or similar) for frontend deployment React+tailwind+shadcn. It's github codespaces ready, integrates well with worktrees and teh codex workflow
- [ ] check all commits created from noter if we didn't lose anything due to the way it doesn't update it's own tree correctly

- [ ] cannot click on daytona allow button inside preview if it's rendered inside noter.md

- [ ] sidebar UX: when opening the sidebar, auto-scroll to show the currently selected/highlighted file instead of requiring manual scrolling (especially important on mobile where file list may be long)
- [ ] use vscode terminal embedded in web; it's pretty powerful; it's better than what daytona provides by default
- [ ] left to easily press enter
- [ ] coding on vscode on mobile web is very good, we can try simplifying it for focus only on chat, 
- [ ] https://vt.tiktok.com/ZSmrDkbnF/ https://x1.new
- [ ] 
- [ ] https://theia-ide.org/
- [ ] research https://vly.ai/, and all others startups shown on
- [ ] ai can access convex functions directly and can invoke them, and use them as custom tools or can build for itself
- [ ] https://www.convex.dev/startups
- [ ] research https://vly.ai/, and all others startups shown on https://www.convex.dev/startups
- [ ] https://www.convex.dev/startups has live video of the browser the ai are using
- [ ] transform the chat from fab to sider from left or right
- [ ] check out https://www.kernel.sh/?utm_source=theo - kernel might be useful
- [ ] flex: it's possible to remove github vault of noter completely and then attach it again and this whole time everything works, since we maintain netlify and convex for you. Currently set to remove in checkboxes
- [ ] fix dark mode/light mode toggle - it's redirecting to /
- [ ] make dragging nice for sidebar on left
- [ ] make dragging nice
- [ ] add settings page for each vault and also for the whole app that allows auto commits
- [ ] when path doesn't have owner or repo name or can't find it, redirect to vaults
- [ ] add command "auto-push" "stop auto push" or similar to allow automatic pushing
- [ ] you don't need to open noter in noter.md, you have it as a fab in your prod, just for you
- [ ] don't use builder.io anymore
- [ ] add share functionality to noter.md app - when copying text, allow sharing to Telegram, etc. Create new PWA app for this
- [ ] add backwards and forward buttons
- [ ] always sync input values to Convex so text is remembered on typing (real-time persistence)
- [ ] screenshot support so it can debug itself
- [ ] if new commit button appears, or actually, all previous requests get disabled, can only click last group
- [ ] while waiting for tool, you can still talk with it but it will keep fresh in prompt that it's waiting for tool, no blocking
- [ ] mcp server can be replaced by folder and file. If it's query it can be single expression of convex query. And write here a complex query, as a anonymous with no { ctx.db.query("messages").withIndex("by_vault", q => q.eq("vaultId", args.vaultId)).filter(q => q.and(q.gte(q.field("_creationTime"), args.since), q.or(q.eq(q.field("role"), "user"), q.eq(q.field("role"), "assistant")))).order("desc").take(50)
- [ ] for markdown reads, return file size first and let agents decide whether to include full content in context
- [ ] markdown optimization for agents: show headers/subheaders first, replace paragraph bodies with character counts plus section slugs, and let AI request full text only for selected sections
- [ ] add link to changed files in commit. Also the name of the commit is displayed twice, both in text and in bubble of button
- [ ] add questions at bottom of your messages, make them small, "yes", maybe, no. But the input is always open. That's the thing the input is never waiting. You can even instruct it to stop research
- [ ] the fab is notm click able when sidebar opens. It should have knowledge that it's in the sidebar
- [ ] it's fine to reuse the Sha of the same vault so history should be easy, so we can implement branching easily in noter
- [ ] you don't share code, you share methods how you work with code. Like teach it about type-safety, so senior devs will still be needed, since you need to be technical
- [ ] https://www.deployopenclaw.co/
- [ ] https://link.com/ for payments instead of strip, a lot of apps seem to use it. Need to check if in MOldova
- [ ] https://developers.openai.com/codex/ide/ use this instead of the app. Vscode is the default platform. No need to invent agent+can use openclaw!!!
- [ ] https://github.com/Fission-AI/OpenSpec
- [ ] https://www.youtube.com/watch?v=pey9u_ANXZM
- [ ] easy win: rename simple/all to important/code
- [ ] try out blacksmith instead of github actions
- [ ] the ui is the following, the right side there's a fab that's opened with a chat window, on the left side it's a codex like chat, with all that standard stuff, and using this standard chat you can configure the fab that'll be on your site; commit this atomically
- [ ] vscode has this hidden eye on the .md file

## AI Agent Tools - Web Browsing & Search Capabilities

### Essential Tools for Better Coding Assistance

- [ ] **Web Search Tool** (`search_web`): Search for current documentation, Stack Overflow solutions, API changes, and programming best practices
  - Use Serper API or Brave Search API for web search
  - Focus on technical/programming queries
  - Return 5-10 most relevant results with snippets
  - Priority: HIGH - This would dramatically improve coding help

- [ ] **URL Fetch Tool** (`fetch_url`): Read content from specific URLs (documentation, GitHub issues, blog posts)
  - Extract readable text content from web pages
  - Handle common documentation sites (MDN, npm, GitHub, etc.)
  - Content cleanup and formatting for AI consumption
  - Rate limiting and proper error handling

- [ ] **NPM Package Info Tool** (`npm_package_info`): Get current package information, versions, dependencies
  - Query NPM registry API directly
  - Return package.json info, latest versions, changelogs
  - Help with dependency management and version conflicts
  - Include security advisory information when available

- [ ] **GitHub Repository Search** (`search_github_repos`): Find relevant repositories, issues, and discussions
  - Search across GitHub for similar codebases and solutions
  - Find issues related to specific error messages
  - Discover popular libraries and their usage patterns

- [ ] **Documentation Lookup** (`lookup_docs`): Quick access to official documentation
  - Pre-configured endpoints for popular frameworks (React, Next.js, Tailwind, etc.)
  - API reference lookup for common libraries
  - Version-specific documentation access

### Implementation Notes
- Add these tools to `toolCatalog.ts` with proper descriptions
- Implement handlers in `tools.ts` with robust error handling
- Update system prompt to know when to use these tools
- Consider rate limiting and API key management
- Start with `search_web` as the highest priority tool

### Why These Are Critical
Currently, as an AI assistant, I'm limited to repository files and training data. These tools would allow me to:
- Look up current API documentation when helping with integrations
- Find solutions to specific error messages and bugs  
- Verify current best practices and security recommendations
- Help with library selection and version compatibility
- Provide up-to-date examples and usage patterns

This would transform me from a "static knowledge" assistant to one that can access current, relevant information for better coding help.

## Features & Improvements
- [ ] add line numbers to code display to fix line reference issues in AI assistant
- [ ] improve file search functionality with better fuzzy matching
- [ ] editor: on hover over Tailwind classes, show their definition
- [ ] add keyboard shortcuts for common actions (save, commit, etc.)
- [ ] implement file diff view to show changes before committing
- [ ] add "todo" command functionality for AI assistant to update this file
- [ ] `wt` CLI low-level follow-up: add machine-readable modes (`wt list --json` / `--ndjson`) plus `--plain` (no ANSI), stable keys (`path`, `branch`, `detached`, `head`, `isCurrent`, `staged`, `unstaged`, `untracked`, `conflicts`, `isClean`), and deterministic exit codes for automation
- [ ] simple view: consider switching from exclude-only to explicit include allowlist (ex: `**/*.md`, `**/config.json`, `**/tools.json`)
- [ ] add command "auto-push" "stop auto push" or similar to allows
- [ ] use mermaid?
- [ ] explore a lightweight GitLens-like git graph inside noter.md so branch/commit history can be viewed without opening VS Code; start simple and compare a native React graph vs Mermaid gitgraph vs embedding a small web Git UI
- [ ] remove the "auto delete GitHub repo" option once repos move to the noter.md org flow
- [ ] show actionable error when delete fails due to missing GitHub `delete_repo` scope, with a re-login CTA
- [ ] When repository name already exists show better error
- [ ] make graphic of the services we use: GitHub for storage, Convex for backend+db, Netlify for domains+frontend, GitHub Codespaces for dev
- [ ] Reuse typescript config files (the way we did for ailegis)

## Meta/Philosophy
- [ ] the more our tooling for noter gets better (in terms of ai settings or integrations) the more our user's tooling gets better, since we use noter for building noter

## Demo Ideas
- [ ] **Live Demo Concept**: Conference/meeting screen sharing demo where:
  1. Request AI to build an app on mobile phone in front of audience
  2. When `main` (or any selected branch) opens, show the live preview link immediately at the top
  3. Instruct audience to open that link on their mobile phone so they can validate the site as soon as the preview is ready
  4. Keep a QR code next to the link so people can scan instead of typing
  5. Emphasize the differentiator: preview becomes available in ~10 seconds (vs typical 6+ minutes in other builders), then the page loads almost instantly on mobile
  6. Initial app shows minimal template (even simpler than todo - maybe just empty screen with "hello")
  7. Continue talking to AI while audience watches the site change in real-time via Vite
  8. Demonstrate live collaborative editing where changes appear instantly across all viewers

## Ideas to Explore
- [ ] **Multi-Branch Agent Dashboard**: Enable agents to work on multiple branches simultaneously, but key sandbox ownership by agent instead of branch. A new agent gets a new sandbox; inside that sandbox the agent may create worktrees if needed. Dashboard avatar circles/facepiles should show which agent sandboxes are active on which branches, instead of forcing a separate sandbox or branch-switch lockout per branch.
- [ ] **Agent Work via Git Authors/Co-Authors**: Use git commit author and co-author fields to track agent work on different branches. This makes agent contributions visible in all git tooling (GitLens, GitHub UI, git log, etc.) without requiring Noter-specific infrastructure. Example: `Author: user@example.com, Co-authored-by: research-agent@noter.md`
- [ ] **Conversation Storage Strategy**: Consider where to store all chat conversations for potential desktop app usage. Conversations tied to specific branches/commits could be stored as git notes or in structured commit messages, making the context portable across different development environments.
- [ ] check if I discussed this idea: noter could approach darklang because the logs are automatically in convex
- [ ] add idea regarding the jokes about older people don't know how to convert to pdf. But now with noter
- [ ] Codex auth persistence across Codespaces (file-based credential storage):
```
Yes. When you use file-based credential storage, the OAuth tokens land in ~/.codex/auth.json with this structure:

{
  "auth_mode": "chatgpt",
  "tokens": {
    "access_token": "eyJhbG...",
    "refresh_token": "v1:refresh:...",
    "id_token": "...",
    "expires_at": "2025-12-31T23:59:59Z"
  },
  "last_refresh": "2025-01-15T10:30:00Z"
}

To make sure it uses file storage (not OS keyring, which won't exist in a Codespace), set this in config.toml:

cli_auth_credentials_store = "file"

The strategy for Codespaces:
1. Do the OAuth flow once locally (or in one Codespace via VS Code Desktop)
2. Copy the resulting auth.json content
3. Store the whole JSON blob as a Codespace secret, e.g. CODEX_AUTH_JSON
4. In your devcontainer postCreateCommand or dotfiles, write it out:

mkdir -p ~/.codex
echo "$CODEX_AUTH_JSON" > ~/.codex/auth.json
chmod 600 ~/.codex/auth.json

cat > ~/.codex/config.toml << 'EOF'
cli_auth_credentials_store = "file"
EOF

Codex automatically refreshes tokens 8 minutes before expiration, so as long as the refresh_token is still valid, it'll keep working without re-auth. You'd only need to redo the OAuth flow if the refresh token itself expires or gets revoked.

One caveat: Codespace secrets have a 48KB size limit, but auth.json is tiny so that's fine. The main risk is the refresh token eventually expiring -- in practice ChatGPT OAuth refresh tokens seem to be long-lived, but there's no official guarantee on the lifetime.
```
- [ ] add fish-like aliases, or even better make this input behave like a fish terminal
- [ ] in dev mode, simple terminal should show/accept the full command format: `noter "add todo or whatever paragraph"`
- [ ] explore frontmatter-based settings in markdown (e.g. `noter.md`) as an alternative to JSON: LLM-readable, human-readable, and schema-validated into TypeScript objects
- [ ] treat chat as a terminal UX: user sends commands, system executes/actions, then returns clear output (like a shell loop)
- [ ] pot discuta cu Predeus ca Robolex sa fie dezvoltat pe noter.md; asta e o metoda buna si pentru juniori, pentru ca au acces la aceleasi posibilitati ca seniorii; faptul ca noter.md e facut in noter inseamna ca produsul e bun

## Starter Provisioning Follow-ups
- [ ] make `vaultActions.deleteVault` idempotent for missing docs to avoid repeated "Delete on nonexistent document ID" errors in logs
- [ ] add explicit provisioning logs for `needsRepoPatch` and `existingDeployKeyId` during Netlify repo wiring
- [ ] add integration test for Netlify provisioning order: site create -> env set -> repo patch -> skip manual trigger
- [ ] add retry/backoff around deploy trigger/provisioning calls for transient Netlify/Convex API failures
- [ ] define and document a Convex CLI dependency update cadence for the starter template
- [ ] olap vs oltp

## Completed ✅
- [x] when committing, commit all changed files
- [x] allow deleting file/folder
- [x] after commit now, the file should already have a new staging
- [x] add more descriptive commit names
- [x] update the tree from time to time?
- [x] don't use builder.io anymore
- [x] removing noter from builder.io todo is done

- [ ] allow deleting file/folder
- [ ] after commit now, the file should already have a new staging
- [ ] add more descriptive commit names
- [ ] update the tree from time to time?
- [ ] **IMPORTANT, make less changes to collaborativeUpdates db, takes lots of resources**
- [ ] **BUG: If a GitHub repository is renamed, the vault UI still shows the old name. It also appears in search with the old name, which is confusing. Need to detect repo renames and update vault metadata accordingly.**
- [ ] **CHAT: Don't use "Auto" label for model selection - it implies it's the worst option. Instead, show each message with the model that created it attached. Each message should have `model` field showing "Claude 3.5", "GPT-4o", "Recommended", etc.**
- [ ]
- [ ] add settings page for each vault an also for the whole app that allows auto commits
- [ ] **VERY IMPORTANT**: Try Convex components for defining things internally but also at AI agent component level
- [ ] **AI Agent Access**: Give AI agent ability to query which files are "staged" and generally have more access to the Convex functions themselves
- [ ] **File Staging Bug**: Fix issue where marking newly created files for deletion causes them to appear both as "to be created" and "to be deleted" in stagedFiles. Instead, newly created files should be completely removed from stagedFiles when deleted, not marked for deletion.
- [ ] for prompts that are linked to files, enable inline editing that automatically propagates changes to the actual files
- [ ] folders can be used as objects or arrays because of ordered preservation (note: this is undefined behavior in JS)
- [ ] have 1 agent with which I talk, but I also see the agent they are building, on the side. Basically instead of chat and code generated to the right. You get chat and markdown generated to the right, with
- [ ] **MDX Function Calling Enhancement**: Implement MDX-like syntax with function calls instead of tags for text rendering:
  - Support `@code(language="json", filePath="config/app.json")...@end` syntax
  - Add `@edit()`, `@note()`, `@warning()` function blocks
  - Parse function calls with parameter extraction (language, filePath, etc.)
  - Integrate with existing EnhancedMarkdownRenderer
  - Benefits: No React compilation needed, backward compatible, extensible, type-safe
  - Alternative to full MDX that works with plain text rendering
## UI/UX Improvements
- [ ] commit proposal UI: make the commit description clickable to go to GitHub commit URL, ensure button inside doesn't change sizes
## Development Environment
- [ ] the dev container should default to fish. Even the ai should prefer that
## Research & Inspiration
- [ ] AFFiNE research snapshot (2026-03-05): `toeverything/AFFiNE` has ~63.8k stars, default branch `canary`, and latest stable release `v0.26.3` (2026-02-25). Translate strongest ideas into Noter experiments.
- [ ] AFFiNE-inspired experiment: merge docs + whiteboard in one editable surface (edgeless canvas + blocks) for `noter.md` workspaces.
- [ ] AFFiNE-inspired experiment: local-first/offline path for collaborative editing (CRDT-first UX, Convex sync when online) to reduce perceived latency.
- [ ] AFFiNE-inspired experiment: starter-backed template gallery (one-click insert) for common workflows and onboarding.
- [ ] AFFiNE-inspired architecture check: evaluate whether a plugin/third-party block API should be introduced now or deferred until core editor APIs stabilize.
- [ ] run a 2-week Augment Code pilot per `Ideas/augment-code-research.md` (IDE agent, Context Engine MCP, Code Review)
- [ ] **Video Reference**: Problems that could be solved by Noter - https://www.youtube.com/watch?v=YVq28OTPCKw
- [ ] fix implicit `any` types across frontend components (13 errors, CI-blocking):
  - AddRepository.tsx: `repo`, `vault` params in callbacks (4)
  - ChatFab.tsx: `msg` param (1)
  - CodeEditor.tsx: `u` param in update callback (1)
  - FileView.tsx: `t`, `item`, `staged` params (5)
  - MonacoEditor.tsx: `u` param in update callback (1)
