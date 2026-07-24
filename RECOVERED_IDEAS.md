> [!NOTE] This is a recovered historical dump, not an active backlog or product contract. Codespaces
> references describe the feature retired on 2026-07-24.

## bd66cc18d4311937d5d0363b2385744bc9be62df 2026-02-15 TODO.md[6]

File: TODO.md

- # The most important right now is to fix rebaseing works, because we always accept only things on incoming side instead of even trying to reconcile!!!!
- - [ ] security: remove first-request token bootstrap in `.codespace-agent/server.ts`; require
        preconfigured secret for auth before exposing agent APIs
- - [ ] security: fix codespace agent exposure model (`port 3000` public + `/exec`/file endpoints);
        restrict reachability or add hardened gateway auth
- - [ ] starter manifest hygiene: exclude `.codespace-agent/node_modules/**` from template export
        and regenerate deterministic `starterSeedManifest.generated.ts`
- - [ ] starter template hygiene: add CI coverage for `apps/samebase-starter-template` (we missed a
        `node_modules`/ignore drift once because it wasn't being checked)
- - [ ] editor: on hover over Tailwind classes, show their definition
- - [ ] simple view: consider switching from exclude-only to explicit include allowlist (ex:
        `**/*.md`, `**/config.json`, `**/tools.json`)
- - [x] removing noter from builder.io todo is done

## 4c85f40b0778553e94963907aa041e32bdebae69 2026-02-15 TODO.md[6-7]

File: TODO.md

- - [ ] security: remove first-request token bootstrap in `.codespace-agent/server.ts`; require
        preconfigured secret for auth before exposing agent APIs
- - [ ] security: fix codespace agent exposure model (`port 3000` public + `/exec`/file endpoints);
        restrict reachability or add hardened gateway auth
- - [ ] starter manifest hygiene: exclude `.codespace-agent/node_modules/**` from template export
        and regenerate deterministic `starterSeedManifest.generated.ts`
- - [ ] starter template hygiene: add CI coverage for `apps/samebase-starter-template` (we missed a
        `node_modules`/ignore drift once because it wasn't being checked)
- - [ ] editor: on hover over Tailwind classes, show their definition
- - [x] removing noter from builder.io todo is done

## cf10d29accb21e424f926ba698d48ae1382ee4c3 2026-02-14 TODO.md[32-34]

File: TODO.md

- - [ ] https://developers.openai.com/codex/ide/ use this instead of the app. Vscode is the default
        platform. No need to invent agent+can use openclaw!!!

## 8e9b6e91a420e20006486c0a4202a254fd435154 2026-02-14 noter.md[5-10,17-18]

File: noter.md

-     - noter.md # Simple View config file
-     - src/** # Frontend implementation code
-     - convex/** # Backend functions
-     - node_modules/** # Dependencies
-     - dist/** # Build output
-     - "**/*.{json,ts,tsx,js,jsx,cjs,mjs,css,html,yaml}" # Source file extensions

## 0ea89a1a24332ff38ecb7aea6c5b91c941c58886 2026-02-14 noter.md[9,16]

File: noter.md

-     - "**/*.{json,ts,tsx,js,jsx,cjs,mjs,css,html,yaml}" # Source file extensions

## 64b12b9b13bb994edfa2c65da3b851edd6300686 2026-02-14 noter.md[5-8,13-15]

File: noter.md

-     - noter.md # Simple View config file
-     - src/** # Frontend implementation code
-     - convex/** # Backend functions
-     - node_modules/** # Dependencies
-     - dist/** # Build output

## 4014419d3557fd940dd61bc99b9efc47f931bafc 2026-02-14 TODO.md[4-7]

File: TODO.md

- - [ ] research https://vly.ai/, and all others startups shown on https://www.convex.dev/startups

## 1f5e31f9896f785cf0529b06787b1c64615415b7 2026-02-14 TODO.md[28], noter.md[9-10]

File: apps/samebase-starter-template/noter.md

-     - "**/*.{ts,tsx,js,jsx,css,html}" # Source file extensions

## fbba927165c72cc0438c22a6d064cbb12539b636 2026-02-14 TODO.md[27]

File: TODO.md

- - [ ]

## 403c455008977f8b6612653bc7436c460d2ac16b 2026-02-14 noter.md[10,13-18]

File: noter.md

-     - "**/*.{json,ts,tsx,js,jsx,css,html,yaml,toml,tsbuildinfo,yml}" # Source file extensions
-     - pre-commit

## 67a1f6f0c3b8fbc3b0fc416a8f4bd323cd8c7804 2026-02-14 TODO.md[4-6], noter.md[9-12]

File: noter.md

-     - noter.md # Simple View config file
-     - "**/*.{json,ts,tsx,js,jsx,css,html}" # Source file extensions
-     - tsconfig.base.json

## 3125f485f12589e5771abbbd911f36dc45c9078d 2026-02-14 README.md[24], noter.md[10-11]

File: README.md

- - **Authentication**: Convex Auth File: noter.md
-     - "**/*.{ts,tsx,js,jsx,css,html}" # Source file extensions

## 17dd2311b139181764b43c00054f7f9e16043a2c 2026-02-14 TODO.md[4,56]

File: TODO.md

- - [ ] for markdown reads, return file size first and let agents decide whether to include full
        content in context
- - [ ] markdown optimization for agents: show headers/subheaders first, replace paragraph bodies
        with character counts plus section slugs, and let AI request full text only for selected
        sections
- - [ ] add fish-like aliases, or even better make this input behave like a fish terminal
- - [ ] in dev mode, simple terminal should show/accept the full command format:
        `noter "add todo or whatever paragraph"`
- - [ ] explore frontmatter-based settings in markdown (e.g. `noter.md`) as an alternative to JSON:
        LLM-readable, human-readable, and schema-validated into TypeScript objects
- - [ ] treat chat as a terminal UX: user sends commands, system executes/actions, then returns
        clear output (like a shell loop)
- - [ ] pot discuta cu Predeus ca Robolex sa fie dezvoltat pe noter.md; asta e o metoda buna si
        pentru juniori, pentru ca au acces la aceleasi posibilitati ca seniorii; faptul ca noter.md
        e facut in noter inseamna ca produsul e bun
- - [x] removing noter from builder.io todo is done

## d32c2b9b26128a2b61989a844c175db22be6dafe 2026-02-13 README.md[5,7]

File: README.md

- Noter is a collaborative, GitHub-connected code editor built as a Turborepo monorepo with React +
  Vite on the frontend and Convex on the backend.
- ## Current Product Capabilities (2026-02-13)
- - Real-time collaborative editing with CodeMirror + Convex synchronization
- - GitHub repository connection (`connectRepository`) for existing repos
- - New agent/repo creation (`createRepository`) for noter-managed vaults, seeded as a runnable
    starter in a single commit
- - Automatic infrastructure provisioning for new noter-managed vaults:
- - Convex project/deployment
- - Netlify site + environment wiring
- - Infrastructure status surfaced in Vault Dashboard
- - Manual infra retry for failed/partial provisioning
- - GitHub Codespaces integration for cloud execution
- - Persistent in-app chat with approval cards for:
- - Commit proposals
- - Production infrastructure/data read requests
- ## Important Behavior
- - Auto infra provisioning is triggered only for newly created noter-managed vaults.
- - Connecting an existing GitHub repository does not auto-provision infra.
- - Starter seed source of truth is maintained in `apps/samebase-starter-template` and exported to
    `apps/samebase/convex/starterSeedManifest.generated.ts`.
- - Frontend: React 18, TypeScript, Vite, React Router
- - Backend: Convex (queries, mutations, actions, scheduler)
- - Editor: CodeMirror 6
- - Auth: Convex Auth + GitHub OAuth
- - UI: Tailwind CSS + Radix UI + shadcn/ui patterns
- - Monorepo: Turborepo + PNPM
- ## Project Layout
- ```text

  ```

- .
- ├── AGENTS.md
- ├── specs/
- │ ├── noter/
- │ │ ├── convex/
- │ │ └── src/
- │ └── noter-starter-template/
- │ ├── convex/
- │ └── src/
- ├── package.json
- └── turbo.json
- ## Development
- - Node 24+
- - PNPM 9+
- ### Root commands
- pnpm dev # noter app only (default filtered)
- pnpm build # noter app only (default filtered)
- pnpm lint # noter app only (default filtered)
- pnpm dev:starter
- pnpm build:starter
- pnpm lint:starter
- ### App commands (`apps/samebase`)
- npm run dev # frontend + backend
- npm run dev:frontend
- npm run dev:backend
- npm run build
- npm run lint
- ## Environment Notes
- Infra provisioning requires backend environment configuration for provider tokens/team IDs (see
  `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`).
- ## Read-First Docs for New Agent Sessions
- 1. `AGENTS.md`
- 2. `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
- 3. `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
- 4. `specs/001_CODESPACE_CONNECTION_SPEC.md`
- 5. `apps/samebase/convex/schema.ts`
- MIT

## 1ef8f91b4ca720bfe0096806cdd75939bbf03788 2026-02-13 to-do.md[10-14]

File: Ideas/to-do.md

- - Reference: https://vt.tiktok.com/ZSmjxL79p/

## 8cda659dc179b0f902d2c8387145903bd59b1d24 2026-02-13 to-do.md[5-10]

File: Ideas/to-do.md

- - https://vt.tiktok.com/ZSmjxL79p/

## 10e84b8a4071264c80643f5b638006b4d5b2b96a 2026-02-13 TODO.md[5,19-21]

File: TODO.md

- - [ ] make dragging nice

## 4b5335fdd840920f29399c74900098f189aae948 2026-02-13 TODO.md[27-29,36-37]

File: TODO.md

- - [x] don't use builder.io anymore

## 35da2f479135357567aeb8990863e1e63384c3c1 2026-02-13 TODO.md[32-33]

File: TODO.md

- - [ ] don't use builder.io anymore
- - [x] update the tree from time to time?

## 0c9e941dcd32e048a3f2c5df0caa520df75841f7 2026-02-13 TODO.md[25-26,33]

File: TODO.md

- - [x] update the tree from time to time?

## 1a917c03f27c7f6412e735534ddc5fececedec75 2026-02-12 CODESPACE_CONNECTION_SPEC.md[1-75]

File: specs/CODESPACE_CONNECTION_SPEC.md

- # GitHub Codespace Connection Specification
- ### Creation Process
- ### Agent API Endpoints
- ## Implementation Details
- ### Codespace States
- - `creating` - Codespace is being provisioned
- - `running` - Codespace is active and accessible
- - `stopped` - Codespace is shut down (can be restarted)
- - `error` - Codespace creation or operation failed
- ### Connection Establishment
- The connection is established automatically when you create a Codespace through Noter's interface,
  providing both visual and programmatic access to your GitHub repository in a cloud development
  environment.
- ## TODO/Ideas
- ### Enhanced Code Block Rendering
- - **Scope**: Not limited to TypeScript - apply to all languages that would use Monaco if they were
    in a file
- - **Benefits**:
- - Syntax highlighting
- - IntelliSense/autocomplete
- - Error detection
- - Consistent editing experience
- - **Implementation Considerations**:
- - Embed Monaco as a ProseMirror node view
- - Language detection from code fence info
- - Seamless integration with document flow
- - Performance optimization for multiple code blocks

## 00e4d95e3d2b81ca118f185c807051576ecb83d2 2026-02-12 CODESPACE_CONNECTION_SPEC.md[1-74]

File: specs/CODESPACE_CONNECTION_SPEC.md

- This document specifies how Noter connects to and interacts with GitHub Codespaces, providing both
  visual and programmatic access to cloud development environments.
- **URL Pattern**: `https://{codespace-name}.github.dev`
- - **Access Type**: Direct browser access to VS Code in the browser
- - **Authentication**: GitHub session-based authentication
- **URL Pattern**: `https://{codespace-name}-3000.app.github.dev`
- - **Port**: Runs on port 3000 inside the Codespace
- ### 1. Codespace Creation Process
- 1. **API Call**: Noter calls GitHub API to create a Codespace
- 2. **Agent Setup**: Node.js HTTP server starts on port 3000 inside the Codespace
- 5. **Status Tracking**: Real-time status updates (creating → running → stopped)
- ### 2. Connection Establishment
- ```typescript

  ```

- // Example connection flow
- const codespace = await createCodespace(repoOwner, repoName);
- const webUrl = `https://${codespace.name}.github.dev`;
- const agentUrl = `https://${codespace.name}-3000.app.github.dev`;
- ```

  ```

- ## Agent API Specification
- ### Authentication
- All API endpoints (except health check) require Bearer token authentication:
- ```http

  ```

- Authorization: Bearer {uuid-token}
- ```

  ```

- ### Endpoints
- #### Health Check
- ```http

  ```

- GET /health
- ```

  ```

- - **Auth Required**: No
- - **Response**: `{ status: "ok" }`
- #### Execute Commands
- ```http

  ```

- POST /exec
- Content-Type: application/json
- {
- "command": "string",
- "cwd": "string (optional)"
- }
- ```

  ```

- #### File Operations
- **Write File**
- ```http

  ```

- POST /files/write
- Content-Type: application/json
- {
- "path": "string",
- "content": "string"
- }
- ```

  ```

- **Read File**
- ```http

  ```

- GET /files/read?path={file-path}
- ```

  ```

- **List Directory**
- ```http

  ```

- GET /files/list?path={directory-path}
- ```

  ```

- **Delete File/Directory**
- ```http

  ```

- DELETE /files/delete?path={file-path}
- ```

  ```

- **Get File Metadata**
- ```http

  ```

- GET /files/stat?path={file-path}
- ```

  ```

- ### 1. Authentication
- - **Token-based**: UUID tokens for API access
- - **Session-based**: GitHub authentication for web interface
- - **Scope Isolation**: Each Codespace has unique token
- ### 2. Path Validation
- - **Directory Traversal Protection**: Prevents `../` attacks
- - **Workspace Restriction**: All operations limited to `/workspaces` directory
- - **Path Sanitization**: Input validation on all file paths
- ### 3. Error Handling
- - **Graceful Degradation**: Fallback to external links if iframe fails
- - **Timeout Management**: Request timeouts for API calls
- - **Status Monitoring**: Real-time connection health checks
- ## Integration Points
- ### 1. Noter UI Components
- **CodespaceIframe Component**
- - Embeds VS Code web interface
- - Handles authentication state
- - Provides fallback external link
- **CodespaceStatus Component**
- - Real-time status display
- - Connection health indicators
- - Action buttons (start/stop/delete)
- ### 2. Convex Backend
- **Database Schema**
- ```typescript

  ```

- codespaces: {
- id: string;
- name: string;
- webUrl: string;
- agentUrl: string;
- token: string;
- status: "creating" | "running" | "stopped";
- createdAt: number;
- updatedAt: number;
- }
- ```

  ```

- **API Functions**
- - `createCodespace`: Creates new Codespace
- - `getCodespaceStatus`: Retrieves current status
- - `executeCommand`: Runs commands via agent API
- - `manageFiles`: File operations through agent
- ## Error Scenarios
- ### 1. Connection Failures
- - **Network Issues**: Retry logic with exponential backoff
- - **Authentication Errors**: Token refresh or re-authentication
- - **Timeout Errors**: Graceful degradation to manual access
- ### 2. Codespace States
- - **Creating**: Show loading state, poll for completion
- - **Stopped**: Provide start button, disable interactions
- - **Deleted**: Clean up database records, show creation option
- ### 3. Agent Unavailability
- - **Port Not Ready**: Retry connection with delays
- - **Service Down**: Fall back to web interface only
- - **Invalid Token**: Regenerate and update database
- ## Performance Considerations
- ### 1. Connection Optimization
- - **Connection Pooling**: Reuse HTTP connections
- - **Request Batching**: Combine multiple file operations
- - **Caching**: Cache file metadata and directory listings
- ### 2. UI Responsiveness
- - **Async Operations**: Non-blocking API calls
- - **Loading States**: Clear feedback during operations
- - **Progressive Enhancement**: Core functionality without agent API
- ## Future Enhancements
- ### 1. Advanced Features
- - **Port Forwarding**: Support for custom application ports
- - **Extension Management**: Install/configure VS Code extensions
- - **Environment Variables**: Secure environment configuration
- ### 2. Monitoring & Analytics
- - **Usage Metrics**: Track Codespace utilization
- - **Performance Monitoring**: API response times and errors
- - **Cost Optimization**: Automatic shutdown policies
- ## Implementation Notes
- ### 1. Development Setup
- - Agent server code located in `.codespace-agent/`
- - Automatic startup via `.devcontainer/devcontainer.json`
- - Environment-specific configuration
- ### 2. Deployment Considerations
- - **Token Security**: Secure storage and transmission
- - **Rate Limiting**: GitHub API quota management
- - **Resource Cleanup**: Automatic Codespace lifecycle management

## 882a507db781ccc1d3ad2754e097b4da178cbe6c 2026-02-12 AGENTS.md[85-87,121], FileView.tsx[628,631,…]

File: AGENTS.md

- - **NEVER merge a PR until CI is green** - always wait for checks to pass, then squash-merge with
    `gh pr merge --squash`

## da4dfebcfdda37b63e9c8a2117057a764425327e 2026-02-12 TODO.md[11]

File: TODO.md

- - [ ] add share functionality to noter.md app

## a2c34f30c5eaaaabf269daa7865d415d6de5b3cc 2026-02-11 VISION.md[5,7,…]

File: VISION.md

- Noter is evolving from a collaborative code editor into a comprehensive platform for building
  LangGraph agents with full-stack capabilities. The goal is to compete with tools like Agent
  Builder (LangSmith) and Lovable, but with a unique approach that combines AI agents, real-time
  collaboration, and full-stack development.
- ## The Meta-Proof
- - Proves the Convex + React stack can scale to complex, real-world applications
- ## Target Positioning
- ### vs Agent Builder (LangSmith)
- - **Similar**: Create LangGraph agents with defined behaviors and tools
- - **Different**: Full-stack UI/database capabilities, not just agent logic
- - **Advantage**: Complete development environment, not just agent configuration
- ### vs Lovable/No-Code Platforms
- - **Similar**: Rapid full-stack application development
- - **Different**: AI-first development through conversation, not drag-and-drop
- - **Advantage**: Can build truly sophisticated applications, not limited to templates
- ### vs Cursor/GitHub Copilot
- - **Similar**: AI-assisted development
- - **Different**: Complete application scaffolding and deployment, not just code assistance
- - **Advantage**: End-to-end development platform with built-in hosting/database
- - **Frontend**: React + Vite + Tailwind
- - **Deployment**: Netlify (frontend) + Convex (backend)
- - **Collaboration**: Real-time editing via Convex
- ### Agent Development Flow
- 1. **Create New Agent**: User clicks "Create New" → new GitHub repo created
- 2. **Agent Scaffold**: Repo initialized with:
- - `AGENTS.md` - Agent behavior definition
- - `tools.json` - Available tools/capabilities
- - `subagents/` - Multi-agent workflow support
- - React UI components
- - Convex backend functions
- 3. **Development**: Use Noter as IDE for the entire stack
- 4. **Deployment**: Automatic deployment via CI/CD
- ## Missing Capabilities (Priority Order)
- ### High Priority
- 1. **Repository Creation**: GitHub API integration to create new repos
- 2. **Agent Scaffolding**: Templates for AGENTS.md, tools.json, basic React+Convex setup
- 3. **Terminal Access**: Execute commands, run builds, install packages
- 4. **Development Server Control**: Start/stop dev servers, see running processes
- ### Medium Priority
- 1. **Package Management**: Install/remove dependencies via npm/pnpm
- 2. **Test Execution**: Run test suites and see results
- 3. **Environment Management**: Handle env vars, deployment configs
- 4. **Real-time Error Feedback**: Compilation errors, linting issues
- ### Lower Priority
- 1. **Database Management**: Direct database queries/modifications
- 2. **API Testing**: Make HTTP requests for testing endpoints
- 3. **Performance Monitoring**: Track app performance, usage metrics
- 4. **Advanced Deployment**: Multiple environments, staging/production
- ## Immediate Next Steps
- 1. **Update Project Documentation**: Reflect new vision in README, AGENTS.md
- 2. **Implement Repo Creation**: Add "Create New Agent" button and GitHub repo creation flow
- 3. **Create Agent Templates**: Define standard scaffolding for new agent projects
- 4. **Add Terminal Capabilities**: Enable command execution for full dev environment
- ## Success Metrics
- ### Technical
- - Can create and deploy a functional LangGraph agent in <30 minutes
- - Self-hosting: Noter development happens entirely within Noter
- - Performance: Real-time collaboration with <100ms latency
- ### Market
- - Developer adoption: Active users building agents on the platform
- - Complexity proof: Agents built that go beyond simple CRUD operations
- - Community: Open-source contributions and agent templates
- Noter becomes the go-to platform for AI agent development, where:
- - **Non-technical users** can describe what they want and get a working agent
- - **Developers** have a complete IDE for sophisticated agent development
- - **Teams** can collaborate in real-time on complex multi-agent systems
- - **The platform itself** continues to evolve through self-improvement
- The ultimate goal: Make building AI agents as easy as creating a document, but with the power to
  create truly sophisticated applications.

## 2488d6a2259c545ac11e7c9ef31d06bd83de7411 2026-02-11 TODO.md[8,15-16,…]

File: TODO.md

- - [ ] **VERY IMPORTANT**: Try Convex components for defining things internally but also at AI
        agent component level
- - [ ] **AI Agent Access**: Give AI agent ability to query which files are "staged" and generally
        have more access to the Convex functions themselves
- - [ ] **File Staging Bug**: Fix issue where marking newly created files for deletion causes them
        to appear both as "to be created" and "to be deleted" in stagedFiles. Instead, newly created
        files should be completely removed from stagedFiles when deleted, not marked for deletion.
- - [ ] for prompts that are linked to files, enable inline editing that automatically propagates
        changes to the actual files
- - [ ] folders can be used as objects or arrays because of ordered preservation (note: this is
        undefined behavior in JS)
- - [ ] have 1 agent with which I talk, but I also see the agent they are building, on the side.
        Basically instead of chat and code generated to the right. You get chat and markdown
        generated to the right, with
- - [ ] **MDX Function Calling Enhancement**: Implement MDX-like syntax with function calls instead
        of tags for text rendering:
- - Support `@code(language="json", filePath="config/app.json")...@end` syntax
- - Add `@edit()`, `@note()`, `@warning()` function blocks
- - Parse function calls with parameter extraction (language, filePath, etc.)
- - Integrate with existing EnhancedMarkdownRenderer
- - Benefits: No React compilation needed, backward compatible, extensible, type-safe
- - Alternative to full MDX that works with plain text rendering
- ## UI/UX Improvements
- - [ ] commit proposal UI: make the commit description clickable to go to GitHub commit URL, ensure
        button inside doesn't change sizes
- ## Development Environment
- - [ ] the dev container should default to fish. Even the ai should prefer that
- ## Research & Inspiration
- - [ ] **Video Reference**: Problems that could be solved by Noter -
        https://www.youtube.com/watch?v=YVq28OTPCKw
- - [ ] add settings page for each vault an also for the whole app that allows auto commits
- - [ ] when path doesn't have owner or repo name or can't find it, redirect to vaults
- - [x] update the tree from time to time?
- - [ ] fix dark mode/light mode toggle - it's redirecting to /
- - [ ]
- - [ ] improve file search functionality with better fuzzy matching
- - [ ] add keyboard shortcuts for common actions (save, commit, etc.)
- - [ ] implement file diff view to show changes before committing
- - [ ] fix implicit `any` types across frontend components (13 errors, CI-blocking):
- - AddRepository.tsx: `repo`, `vault` params in callbacks (4)
- - ChatFab.tsx: `msg` param (1)
- - CodeEditor.tsx: `u` param in update callback (1)
- - FileView.tsx: `t`, `item`, `staged` params (5)
- - MonacoEditor.tsx: `u` param in update callback (1)

## 5a776c8b7b946a425fa9cf30786f2b04b24e0051 2026-02-10 TODO.md[1-4,6-15,…]

File: TODO.md

- - [ ] add settings page for each vault an also for the whole app that allows auto commits
- - [ ] when path doesn't have owner or repo name or can't find it, redirect to vaults
- - [x] update the tree from time to time?
- - [ ] fix dark mode/light mode toggle - it's redirecting to /
- - [ ]
- - [ ] improve file search functionality with better fuzzy matching
- - [ ] add keyboard shortcuts for common actions (save, commit, etc.)
- - [ ] implement file diff view to show changes before committing

## 66d60a6fd80d83cc0b4179c19fa649764cda5499 2026-02-10 TODO.md[9]

File: TODO.md

- - [ ] add line numbers to code display to fix line reference issues in AI assistant

## 5a98c3c727c3352a8ea98662c1725495c61894b8 2026-02-10 TODO.md[9]

File: TODO.md

- - [ ]

## 6d9b931b96bd0c1009fcf56b285098bc70e94b40 2026-02-10 README.md[1,3,…]

File: README.md

- # noter
- Turborepo + PNPM monorepo with React + Vite + Convex.
- Also using ProseMark. something
- ## Install
- ## Development
- ```

  ```

- ## Build
- ```

  ```

- commit

## c29049f85dabefd9e3750705fefef79d5055772b 2026-02-10 TODO.md[8-12]

File: TODO.md

- - [ ] update the tree from time to time?
- - [ ] **IMPORTANT, make less changes to collaborativeUpdates db, takes lots of resources**
- - [ ] **BUG: If a GitHub repository is renamed, the vault UI still shows the old name. It also
        appears in search with the old name, which is confusing. Need to detect repo renames and
        update vault metadata accordingly.**
- - [ ] **CHAT: Don't use "Auto" label for model selection - it implies it's the worst option.
        Instead, show each message with the model that created it attached. Each message should have
        `model` field showing "Claude 3.5", "GPT-4o", "Recommended", etc.**
- - [ ]

## 87a137a1d724d44503bc8972f20707fcbf8bfd2e 2025-08-08 TODO.md[5-6]

File: TODO.md

- - [x] add more descriptive commit names

## f2ec827b6cd489936db8fbda8c0033786d6a55c3 2025-08-08 TODO.md[3-5]

File: TODO.md

- - [ ] allow deleting file/folder
- - [ ] after commit now, the file should already have a new staging
- - [ ] add more descriptive commit names
- -
