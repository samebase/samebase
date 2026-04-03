# Codex App-Server Git Auth Risk Research

- Date: 2026-04-03
- Status: Draft research for a separate risk PR

## Question

If Noter exposes the local Codex app-server through a tunnel, what Git
authentication model should the machine use for fetch/push/clone operations?

The immediate trigger was a failed attempt to rely on the local SSH setup from a
remote tunnel workflow. The core risk is larger than one fetch failure: if the
shipped path depends on one interactive 1Password SSH agent session on the
machine, then the remote-control path is fragile by design.

## Current repo context

Relevant existing repo facts:

1. `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md` makes `noter-sync run` the
   owner of the local control service and the Cloudflare tunnel.
2. `apps/noter/convex/providerConnections.ts` already stores user GitHub
   credentials in Noter as provider connections.
3. `apps/noter/convex/githubOAuth.ts` already requests broad GitHub OAuth scopes
   for user-linked GitHub access.
4. `apps/noter/convex/gitOperationsActions.ts` already uses HTTPS token auth for
   Git operations in backend flows.

That means two things:

1. Noter already has a user-linked GitHub credential model.
2. HTTPS token-based Git is already a real pattern in this codebase, not a new
   conceptual direction.

## Why local 1Password SSH cannot be the default

This is the wrong default for tunneled Codex app-server control.

Primary-source reasons:

1. GitHub says SSH agent forwarding is quick to start with, but automated deploy
   processes cannot use it. That is a direct mismatch with a long-running,
   machine-owned local control service. Source:
   [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).
2. 1Password’s SSH agent explicitly requires user consent before a process can
   use a key, and the app must be unlocked to access private keys. Source:
   [About 1Password SSH Agent security](https://developer.1password.com/docs/ssh/agent/security/).
3. 1Password also documents that background Git fetches can trigger suppressed
   prompts that must be surfaced in the foreground. That is hostile to an
   unattended remote-control flow. Source:
   [SSH client compatibility](https://developer.1password.com/docs/ssh/agent/compatibility/).
4. 1Password does support OpenSSH agent forwarding, but our remote-control path
   is not “user SSHs into the machine and forwards an agent”; it is “phone or
   browser calls a machine-local HTTP service through a tunnel.” That is an
   architectural mismatch, not just a setup issue.

Local observation from this machine:

1. Non-interactive SSH fetch probes against `origin` did not return cleanly.
   That is consistent with an interactive SSH/agent dependency.
2. HTTPS Git using GitHub CLI credential helper worked immediately:
   `gh auth setup-git --hostname github.com --force` followed by
   `git -c credential.helper='!gh auth git-credential' ls-remote https://github.com/noter-md/noter.git HEAD`
   returned the repo HEAD successfully.

## Options

### Option A: Keep SSH with local 1Password agent

Verdict: reject as the default tunnel path.

Pros:

1. Good local developer ergonomics when the operator is present at the machine.
2. No extra token issuance flow.

Risks:

1. Requires interactive approval semantics on the machine.
2. Depends on local app unlock state and prompt visibility.
3. Does not fit the `noter-sync run` supervisory model in RFC 078.
4. Turns “Git auth is healthy” into “the operator’s desktop session is healthy.”

This can remain a local power-user path for direct terminal work. It should not
be the contract for remote Codex app-server control.

### Option B: HTTPS Git on the machine via GitHub CLI or Git Credential Manager

Verdict: best near-term option.

What it looks like:

1. The machine authenticates to GitHub over HTTPS once.
2. Git operations run with a local credential helper instead of SSH.
3. `noter-sync run` preflights Git auth non-interactively before advertising
   live control.

Why it fits:

1. GitHub documents HTTPS token auth as a supported server-side automation path.
   Source:
   [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).
2. GitHub CLI stores credentials in the system credential store by default, and
   is explicitly suitable for headless use through environment variables when
   needed. Source: [gh auth login](https://cli.github.com/manual/gh_auth_login).
3. We validated that `gh auth setup-git` plus `gh auth git-credential` works in
   this environment for raw Git HTTPS access.
4. This avoids the SSH-agent prompt dependency entirely.
5. This aligns with existing Noter backend Git behavior, which already uses
   HTTPS token auth.

Risks:

1. The machine still holds a durable user credential locally.
2. Token lifecycle and revocation are weaker than short-lived GitHub App tokens.
3. If implemented with a personal access token, org token policies may require
   approval or enforce maximum lifetime. Source:
   [Setting a personal access token policy for your organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization).
4. Using classic PATs is a poor default because they are broad and long-lived.

Recommended shape for Noter:

1. Treat HTTPS Git auth as the required machine capability for tunneled control.
2. Support `gh auth status` + `gh auth setup-git` as the first operator path on
   macOS.
3. Also allow Git Credential Manager as an equivalent HTTPS credential-helper
   path.
4. Add a preflight that runs a non-interactive HTTPS `git ls-remote` check
   against the target host before Noter publishes live control.
5. Keep the credential local to the machine. Do not proxy a long-lived GitHub
   OAuth token from Convex down to the local control service for ordinary Git.

### Option C: GitHub App installation tokens brokered by Noter

Verdict: best durable architecture.

Why this is strong:

1. GitHub recommends GitHub Apps over OAuth apps for integrations. Source:
   [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app).
2. GitHub Apps use fine-grained permissions, repository selection, and
   short-lived tokens. Source:
   [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app).
3. Installation access tokens can be used for both API calls and HTTP-based Git
   access. Source:
   [Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).
4. Installation tokens expire after one hour and can be further narrowed to
   selected repositories and permissions. Source:
   [Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).
5. GitHub’s deploy-key guidance explicitly recommends GitHub Apps over deploy
   keys for enhanced security and fine-grained control. Source:
   [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

Why this is not the immediate default:

1. It requires App registration, install flow, key management, and token minting
   infrastructure.
2. It changes identity semantics. Installation tokens attribute activity to the
   app, not directly to a user.
3. We would need an explicit user-attribution decision for PR creation and
   similar actions.

Important nuance:

1. GitHub Apps can also act on behalf of a user when user attribution matters.
2. Installation tokens are still the cleaner choice for unattended
   machine-scoped automation.

Inference from the sources:

If Noter wants short-lived credentials, repo-level install control, and a model
that survives employee turnover or a laptop being signed out of 1Password, a
GitHub App broker is the strongest long-term answer.

### Option D: Deploy keys

Verdict: narrow fallback only, not the general solution.

Pros:

1. Single-repo scope.
2. Read-only by default.

Cons:

1. Single-repository only.
2. No expiry.
3. Usually unprotected on the server.
4. Not tied to a user.
5. Git-only; not suitable when the service also needs REST or GraphQL API
   access.

All of those are documented by GitHub in:
[Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

Deploy keys are reasonable for a very constrained single-repo bootstrap or
read-only mirror. They are not a good default for a general Codex app-server
control plane.

### Option E: PATs or SSH keys on a personal account

Verdict: avoid as the platform default.

GitHub’s guidance is clear that classic PATs are too broad, and personal-account
SSH keys also grant broad access. Source:
[Compromised runners](https://docs.github.com/en/enterprise-server%403.18/actions/concepts/security/compromised-runners).

If a PAT must exist at all, prefer a fine-grained PAT over a classic PAT, and
keep it as a temporary bridge rather than the final architecture. GitHub also
documents that organizations can require approval and maximum lifetimes for
fine-grained PATs. Source:
[Setting a personal access token policy for your organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization).

## Recommendation

### Recommended now

Ship the tunnel path assuming HTTPS Git on the machine, not SSH.

Concretely:

1. Define machine Git-health preflight in `noter-sync run` using HTTPS remotes.
2. Document `gh auth login` plus `gh auth setup-git` as the primary local setup
   path on macOS.
3. Accept Git Credential Manager as an equivalent setup on platforms where teams
   prefer it.
4. Refuse to advertise remote live control when non-interactive Git preflight
   fails.

### Recommended next

Design a Noter-brokered GitHub App token flow.

Target shape:

1. Private GitHub App installed on the repos or orgs Noter may control.
2. Noter backend mints short-lived installation tokens on demand.
3. Local control service receives only short-lived Git credentials for the
   current session.
4. Add GitHub App user access tokens later if user-attributed API actions become
   a hard requirement.

## Explicit non-recommendations

Do not make any of these the default shipped contract:

1. “The machine must have the operator’s 1Password SSH agent available.”
2. “Use a personal SSH key attached to a human GitHub account.”
3. “Use a classic PAT on the operator’s account.”
4. “Use deploy keys as the general multi-repo auth model.”

## Source links

Primary sources used:

1. [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
2. [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app)
3. [Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
4. [Setting a personal access token policy for your organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization)
5. [gh auth login](https://cli.github.com/manual/gh_auth_login)
6. [1Password for SSH & Git](https://developer.1password.com/docs/ssh/)
7. [SSH client compatibility](https://developer.1password.com/docs/ssh/agent/compatibility/)
8. [About 1Password SSH Agent security](https://developer.1password.com/docs/ssh/agent/security/)
9. [Compromised runners](https://docs.github.com/en/enterprise-server%403.18/actions/concepts/security/compromised-runners)
