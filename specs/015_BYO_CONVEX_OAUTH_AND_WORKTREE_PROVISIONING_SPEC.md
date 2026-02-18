# 015 BYO Convex OAuth (Web UI) Spec

## Document Control
- Status: Proposed
- Owner: Noter platform + dev tooling
- Last updated: 2026-02-18
- Supersedes: `specs/014_WORKTREE_CLOUD_PROVISIONING_AND_CLI_AUTH_SPEC.md`
- Related specs:
- `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
- `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
- `specs/012_DEV_ENV_ORIGIN_SITE_URL_SYNC_SPEC.md`

## Summary
Ship **Bring Your Own Convex** from day one and separate **app login** from **GitHub provisioning access**. Noter should use **Google OAuth** for primary login (low friction) and prompt for GitHub connection only when the user wants to create a project. Noter must let users connect **their** Convex accounts in the web UI so Noter provisions projects and deployments inside their accounts.

This spec is **web UI + backend only**. Local worktree provisioning and CLI integration are explicitly deferred to `specs/014_WORKTREE_CLOUD_PROVISIONING_AND_CLI_AUTH_SPEC.md`.

## Goals
- Primary app auth uses Google OAuth (easy onboarding).
- GitHub OAuth is a separate, explicit connection step for repo provisioning.
- Web UI supports Convex OAuth connection for each user.
- Noter provisions Convex projects/deployments using **user tokens**, not operator tokens.
- Netlify OAuth is specified separately in `specs/017_NETLIFY_OAUTH_AND_TEAM_SELECTION_SPEC.md`.
- Preserve “single seed commit” for new repos.

## Non-Goals
- Netlify OAuth details (handled in `specs/017_NETLIFY_OAUTH_AND_TEAM_SELECTION_SPEC.md`).
- Local worktree provisioning / CLI integration (covered in a follow-up spec).
- Changing starter template seeding behavior (still a single commit).

## Background (Current State)
- Noter currently uses GitHub OAuth for both app login and repo provisioning.
- Server-side infra provisioning uses user-scoped OAuth tokens.

## Product Requirements
### 0. App Login vs GitHub Connection
- App login uses **Google OAuth** via Convex Auth.
- GitHub access is a **second step** and only requested when the user initiates project creation.
- The UI should explain that GitHub access is required to create/manage the repo.
- The UI should request the **minimum viable permissions** needed for repo creation and ongoing sync.

### 1. Web UI: Convex Connection (BYO Convex)
- A signed-in user can connect Convex in the Noter UI.
- After connection, Noter can create Convex projects and deployments in the user’s account.
- “Create project” (rename from “Create agent”) is disabled until **both** GitHub and Convex are connected.
- If either connection is missing, the UI shows a clear CTA to connect.

### 2. Backend: User-Scoped Provisioning
- All Convex provisioning uses **the user’s Convex OAuth token**.
- Operator tokens are not used unless explicitly allowed by an `ALLOW_OPERATOR_FALLBACK` env flag (default: false).
- Each new vault created by the user provisions a Convex project (one per repo) and a Convex deployment (prod or dev, following existing infra provisioning flow).

### 3. Deferred: Local Worktree Provisioning
Local worktree provisioning and CLI integration are intentionally out of scope here and are covered in `specs/014_WORKTREE_CLOUD_PROVISIONING_AND_CLI_AUTH_SPEC.md`.

## User Journeys
### A. SaaS Onboarding (External User)
1. User signs in with Google.
2. User clicks “Connect GitHub”.
3. GitHub OAuth completes and Noter stores GitHub tokens.
4. User clicks “Connect Convex”.
5. Convex OAuth completes and Noter stores Convex tokens.
6. User clicks “Create project”.
7. Noter creates a GitHub repo (uses user token).
8. Noter provisions a Convex project + deployment in the user’s Convex account.
9. Template app is seeded into the repo (single commit).

## Data Model Changes (Convex)
### Users table additions
Add the following optional fields to `users`:
- `convexAccessToken: string`
- `convexRefreshToken?: string`
- `convexExpiresAt?: number`
- `convexUserId?: string`
- `convexTeamId?: string`
- `convexTeamSlug?: string`

Reasoning:
- Keep provider tokens co-located with user for MVP.
- Matches existing GitHub token pattern in `users`.

### OAuth State table
Add table `oauthStates`:
- `provider: "convex"`
- `userId: Id<"users">`
- `state: string`
- `codeVerifier: string`
- `createdAt: number`
- `expiresAt: number`
Indexes:
- `by_state`
- `by_user`

## Backend API Changes
### New HTTP Actions
- `auth.startConvexOAuth`
- Builds authorization URL with PKCE.
- Persists state + code verifier in `oauthStates`.
- Redirects to Convex authorize endpoint.

- `auth.finishConvexOAuth`
- Exchanges code for tokens.
- Stores tokens on `users`.
- Deletes oauth state row.
- Redirects back to Noter UI.

### New Queries/Mutations
- `users.getConvexConnectionStatus`
- Returns connected boolean + team display info.

- `users.disconnectConvex`
- Clears Convex tokens and team metadata.

- `users.getGithubConnectionStatus` (if not already present)
- Returns connected boolean + username.

- `users.disconnectGithub` (if not already present)
- Clears GitHub tokens and metadata.

### Updated Provisioning
- `infraProvisioning.provisionVaultInfrastructure` uses user Convex token when available.
- If missing and `ALLOW_OPERATOR_FALLBACK=false`, fail with a clear error stored in `infraLastError`.
- `createInfraProviders` accepts `convexToken` override (already supported) and must be wired with user token.

## Frontend UX Changes
- Login screen uses Google OAuth.
- Add “Connect GitHub” button on the dashboard (or onboarding panel).
- Add “Connect Convex” button on the dashboard.
- Rename “Create agent” to “Create project”.
- Disable “Create project” until **GitHub + Convex** are connected.
- Show GitHub connection status (username) and Convex connection status (team).
- Provide “Disconnect GitHub” and “Disconnect Convex” actions.

## Configuration
### OAuth env vars (server)
- `CONVEX_OAUTH_CLIENT_ID`
- `CONVEX_OAUTH_CLIENT_SECRET`
- `CONVEX_OAUTH_REDIRECT_URL`

### Auth providers (Convex Auth)
- Enable Google provider for app login.
- Keep GitHub provider enabled for repo provisioning connection flow.

## Security
- Never send Convex tokens to the client.
- Store OAuth tokens only in Convex DB and access from server functions.
- Redact tokens in logs and errors.
- Do not fall back to operator tokens unless `ALLOW_OPERATOR_FALLBACK=true`.

## Migration Plan
- Existing users must connect Convex before creating new projects.
- Existing vaults provisioned with operator tokens remain untouched.
- When a connected user retries infra provisioning, it uses their token.

## Test Plan
### Unit
- OAuth state creation and expiration.
- Token storage and disconnect path.

### Integration
- OAuth flow: connect Convex and verify `users` fields.
- Create project: repo + Convex project + deployment created in user account.
- Failure path: missing Convex connection blocks provisioning with clear error.

## Acceptance Criteria
- A new user can connect Convex and create a project that provisions in their account.
- Netlify connection is required for hosting and is covered in spec 017.
- The repo seed remains a single commit.
