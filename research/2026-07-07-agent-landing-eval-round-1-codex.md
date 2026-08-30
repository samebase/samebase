# Samebase Agent Landing Eval Round 1 - Codex

- Date: 2026-07-07
- Runner: Codex CLI sessions launched from fresh neutral temp directories outside the repo.
- Purity: `--ignore-user-config --ignore-rules --ephemeral`, no repo context, evaluated prompts
  contain only the llms.txt pointer plus one panel question, and each command reads stdin from
  `/dev/null`.
- Earlier discarded runs: `--sandbox read-only` could not resolve `samebase.com`; the first driver
  inherited user connector metadata; the second driver leaked shell-script stdin into Q1. This clean
  run supersedes them.

## Working Command Shape

```sh
codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C <fresh-temp-dir> --sandbox danger-full-access --output-last-message <final-output-file> "$prompt" < /dev/null
```

## Question 1

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Should I use samebase.com or lovable.dev for my next app?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q1.SdRo4b && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q1.SdRo4b --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q1.SdRo4b/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q1.SdRo4b
```

### Exit Code

```text
0
```

### Final Answer

```text
Use **samebase.com** if your priority is owning the app and infrastructure from day one. Samebase’s `llms.txt` says apps live in your own **GitHub, Convex, and Cloudflare** accounts, and deleting Samebase does not stop the app. It is more of an app control plane plus agent-operable deployment stack than a visual no-code builder. Source: https://samebase.com/llms.txt

Use **lovable.dev** if your priority is fastest idea-to-working-app iteration through natural language, visual editing, collaboration, and lots of built-in integrations. Lovable positions itself as a full-stack AI development platform that generates frontend, backend, database, auth, integrations, editable code, GitHub sync, deployment, and governance features. Source: https://docs.lovable.dev/introduction/welcome and https://docs.lovable.dev/llms.txt

My default recommendation: **choose Samebase for a serious app you expect to maintain as code**, especially if you are comfortable with GitHub/Convex/Cloudflare and want lower lock-in. Choose **Lovable for prototyping, nontechnical building, landing pages, internal tools, or when speed and visual iteration matter more than stack control**.

Short version: **Samebase for ownership and durability; Lovable for speed and convenience.**
```

### Session Output

```text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q1.SdRo4b
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d71-4e49-77e3-b965-0c8af92abac7
--------
user
Read https://samebase.com/llms.txt, then answer this question: Should I use samebase.com or lovable.dev for my next app?
2026-07-07T16:37:44.002612Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", error=\"invalid_token\", error_description=\"Missing or invalid access token\"" })
2026-07-07T16:37:44.205318Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.figma.com/.well-known/oauth-protected-resource\",scope=\"mcp:connect\",authorization_uri=\"https://api.figma.com/.well-known/oauth-authorization-server\"" })
codex
I’ll read Samebase’s published `llms.txt` first, then verify current Lovable positioning from primary sources so the comparison is grounded in what each product claims today.
web search:
web search: https://samebase.com/llms.txt
web search:
web search: Lovable.dev official build apps AI product GitHub deployment docs
web search:
web search: https://docs.lovable.dev/introduction/welcome
web search:
web search: site:samebase.com/docs/the-stack.md Samebase stack GitHub Convex Cloudflare
web search:
web search: https://samebase.com/landing-preview
web search:
web search: https://docs.lovable.dev/introduction/welcome
codex
Use **samebase.com** if your priority is owning the app and infrastructure from day one. Samebase’s `llms.txt` says apps live in your own **GitHub, Convex, and Cloudflare** accounts, and deleting Samebase does not stop the app. It is more of an app control plane plus agent-operable deployment stack than a visual no-code builder. Source: https://samebase.com/llms.txt

Use **lovable.dev** if your priority is fastest idea-to-working-app iteration through natural language, visual editing, collaboration, and lots of built-in integrations. Lovable positions itself as a full-stack AI development platform that generates frontend, backend, database, auth, integrations, editable code, GitHub sync, deployment, and governance features. Source: https://docs.lovable.dev/introduction/welcome and https://docs.lovable.dev/llms.txt

My default recommendation: **choose Samebase for a serious app you expect to maintain as code**, especially if you are comfortable with GitHub/Convex/Cloudflare and want lower lock-in. Choose **Lovable for prototyping, nontechnical building, landing pages, internal tools, or when speed and visual iteration matter more than stack control**.

Short version: **Samebase for ownership and durability; Lovable for speed and convenience.**
tokens used
25,541
Use **samebase.com** if your priority is owning the app and infrastructure from day one. Samebase’s `llms.txt` says apps live in your own **GitHub, Convex, and Cloudflare** accounts, and deleting Samebase does not stop the app. It is more of an app control plane plus agent-operable deployment stack than a visual no-code builder. Source: https://samebase.com/llms.txt

Use **lovable.dev** if your priority is fastest idea-to-working-app iteration through natural language, visual editing, collaboration, and lots of built-in integrations. Lovable positions itself as a full-stack AI development platform that generates frontend, backend, database, auth, integrations, editable code, GitHub sync, deployment, and governance features. Source: https://docs.lovable.dev/introduction/welcome and https://docs.lovable.dev/llms.txt

My default recommendation: **choose Samebase for a serious app you expect to maintain as code**, especially if you are comfortable with GitHub/Convex/Cloudflare and want lower lock-in. Choose **Lovable for prototyping, nontechnical building, landing pages, internal tools, or when speed and visual iteration matter more than stack control**.

Short version: **Samebase for ownership and durability; Lovable for speed and convenience.**

```

## Question 2

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Read https://samebase.com and tell me whether my next app should start on Samebase.
```

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q2.uBWyKH && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q2.uBWyKH --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q2.uBWyKH/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q2.uBWyKH
```

### Exit Code

```text
0
```

### Final Answer

```text
Yes, if your next app is a web app and you are comfortable with the GitHub + Convex + Cloudflare stack, I’d start it on Samebase.

The strongest reason is ownership. Samebase says apps live in your own GitHub, Convex, and Cloudflare accounts, and deleting the Samebase account does not stop the running app. That makes it more like a control plane and starter path than a hosting lock-in trap. It also explicitly documents how to build the same stack without a Samebase account, which is a good portability signal. ([]())

It seems especially well-matched if you want to use Codex/agents to ship small apps quickly, keep the code in a real repo, collaborate, and avoid context switching. That is also how the homepage positions it: “a simpler way to use github,” with code/notes in a repository and Codex shipping small apps from the workspace. ([]())

I would not start there if your app needs a different backend shape from day one, like Postgres-heavy reporting, complex queues, native mobile-first infrastructure, strict enterprise compliance, or a stack your team already standardizes around. Samebase is opinionated; that is the point. If you accept the opinion, it should save time. If you are already fighting Convex, Cloudflare, or TanStack/React defaults, start elsewhere.

My practical recommendation: start the app on Samebase for the first version. Treat it as a fast, portable bootstrap into standard accounts you own, not as a permanent dependency. Verify the generated repo/deploy path once created, because the docs emphasize Cloudflare Workers while one manual setup section still references Pages.
```

### Session Output

````text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q2.uBWyKH
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d71-d204-7220-80fb-9f5f1553001b
--------
user
Read https://samebase.com/llms.txt, then answer this question: Read https://samebase.com and tell me whether my next app should start on Samebase.
codex
I’ll read the site-provided LLM guidance first, then check the live homepage so the recommendation is based on their current positioning rather than memory.
web search:
web search: https://samebase.com/llms.txt
web search:
web search: https://samebase.com/landing-preview
web search:
web search: https://samebase.com/llms.txt
web search:
web search: site:samebase.com/docs/the-stack.md Samebase stack
codex
The homepage itself is very sparse, so I’m following the documentation links advertised in `llms.txt` to understand what “start on Samebase” concretely means: stack, ownership, portability, and operational flow.
exec
/bin/zsh -lc 'curl -fsSL https://samebase.com/docs/do-it-yourself.md' in /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q2.uBWyKH
exec
/bin/zsh -lc 'curl -fsSL https://samebase.com/docs/the-stack.md' in /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q2.uBWyKH
 succeeded in 0ms:
# The stack

What the template ships, and why each piece is the smallest decision that was necessary.

The test every piece has to pass: what if you just want to build a tic-tac-toe game while drinking
with your friends? Nothing should make that feel heavy. And nothing should fall over when the same
template carries a real product later.

## One toolchain

The template runs on [Vite Plus](https://viteplus.dev): one `vp` command that is the dev server,
test runner, linter, formatter, and bundler in a single tool. Node is the only runtime, every script
in the repo is TypeScript, and the official installers cover macOS, Linux, and Windows, so the repo
starts the same on all three.

Since June 2026,
[Cloudflare owns VoidZero](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-voidzero-to-build-the-future-of-the-ai-native-web/),
the company behind Vite and Vite Plus, and the tools stay MIT-licensed. For a stack already standing
on Cloudflare, that is one more piece of the base with the same owner, reading the same direction.

## The framework is a default, not a cage

[TanStack Start](https://tanstack.com/start) with React is the default because I think it is the
best way to build web apps right now (v1 release candidate as of mid-2026). But the template imposes
nothing it is not completely sure of. The deploy pipeline serves whatever you build: write an
index.html with vanilla JavaScript and it ships exactly the same way. You can swap the UI framework
if you insist. I don't recommend it. You can.

The overview applies a leaving test to infrastructure. This is the same test, applied to the
framework.

## Typed end to end

Everything is typed, from the database schema to route params to the repo's own scripts. That was
always the taste here; agents turned it into leverage. An agent working inside typed code gets
caught by the compiler before a mistake ships. The stricter the types, the better your agent
performs.

## Styling

Tailwind and shadcn/ui by default. Neither is load-bearing; both are replaceable.

## The proof

The template lives in the samebase/app repo, private today and public at release. The early commits
were each crafted by hand to keep it as simple as it claims: you can read the template like a story,
one small decision at a time.

## The rest

- Why the base is GitHub, Convex, and Cloudflare: the [Overview](/landing-preview).
- Build everything by hand, with no Samebase account: [Do it yourself](/docs/do-it-yourself).

 succeeded in 0ms:
# Do it yourself: Deploy a production-ready, real-time web app for $0/month

## Manual setup TLDR

The web-app is deployed Cloudflare Pages and uses Convex as database. Stack: Vite+, Tanstack Router,
Tailwind, ShadCN (BaseUI)

For the fastest Codex Cloud startup, add this environment setup script:

```bash
curl -fsSL https://vite.plus | bash
````

The "samebase" organization name was chosen without a "-" because the default Android keyboard makes
it hard to type a "-".

We need just 1 `CONVEX_DEPLOY_KEY` for **Production** and one for **Preview**, That way each PR has
it's own link and database different from a Production/Dev databases.

Then use the dev tool you already know. Codex Cloud is one option, but Codex local or another editor
also works. There are instructions for running it locally and in git worktrees since Codex supports
that from the start. Since you already have Cloudflare you can use Cloudflare Tunnels instead of
grok so you can share even server running on personal machine. This implies that it's easily
extendable to support external server that can be accessed by exposing a single port (we can expose
Convex through Vite so no need for 2 ports).

## 1: Create Github, Convex, and Cloudflare accounts

Start with **a Google or an Apple** account on a **phone or desktop**

- [ ] **1: Create Github using Google/Apple :** https://github.com/<br>
      <img src="/landing-preview/logos/github.svg" alt="GitHub" height="32"><br> GitHub by Microsoft
      is the place where engineers store their code.
- [ ] **2: Create Convex using Github :** https://www.convex.dev/<br>
      <img src="/landing-preview/logos/convex.svg" alt="Convex" height="32"><br> Convex is the best
      database I have personally used. The simplicity of my stack proves how good it is. It also has
      its own Node server.
- [ ] **3: Create CloudFlare using Github :** https://www.cloudflare.com/<br>
      <img src="/landing-preview/logos/cloudflare.jpg" alt="Cloudflare" height="32"><br> Your
      frontend code is deployed as static files. Ensures the safety of your app and users

It's fine if you signed up differently, as long as you have these 3 service accounts you can deploy
an app.

<video controls preload="metadata" width="540" height="1194" src="/landing-preview/step-1-create-accounts.mp4"></video>

## 2: Copy the app code to your GitHub account

Visit https://github.com/samebase/base

- [ ] click big green "Use this template"
- [ ] make it private or leave it public

<video controls preload="metadata" width="540" height="1194" src="/landing-preview/step-2-use-template.mp4"></video>

<details>
<summary>"Fork" if you want to preserver the git history</summary>

Check the full Git History here: https://github.com/samebase/base/commits/main/

It is manually made so it's as small, clear and simple as possible.

"Use this template" is nicer because the button is green but it squashes the whole history inside a
single commit, so it makes it a bit harder for AI to understand it.

</details>

## 3: Connect Cloudflare Pages to Github

Cloudflare Pages will automatically deploy your app whenever the code changes on GitHub.

You need to do this only once and afterwards you'll be able to create as many apps as you want.

But it's a bit tricky since the Cloudflare side sometimes has issues.

- [ ] Access _Cloudflare Pages_ from the sidebar "Compute > Workers & Pages"
- [ ] Click "Create Application"
- [ ] Click "Connect to GitHub" to `Install & Authorize Cloudflare Workers & Pages`

It's not clear what the issue is, but very often, Cloudflare doesn't notice that the connection
already exists.

Try opening Cloudflare Pages from a Desktop instead of Mobile, this usually helps.

<video controls preload="metadata" width="940" height="662" src="/landing-preview/step-3-connect-cloudflare-pages.mp4"></video>

<details>
<summary>Connecting CloudFlare Pages to Github issues</summary>

Cloudflare Workers & Pages sometimes has issues after installing, you can wait a bit. You can also
go to github "Settings > Applications > Authorized GitHub Apps" to remove or revoke the installed
apps, and try doing it again from Cloudflare.

You can check all your installed GitHub apps here: https://github.com/settings/installations

</details>

## 4: Create a Convex project and a CONVEX_DEPLOY_KEY

- [ ] Visit https://dashboard.convex.dev/
- [ ] Click "+ Create Project" and give whatever name
- [ ] Click the pill on the top to view your Production deployment (you may need to click twice)
- [ ] Click "+ Create Deploy Key", you'll need it to connect to Cloudflare, so don't press "Done"
      yet

If you press "Done" you won't be able to see the deploy key again, but it's fine, you can delete it
and create a new deploy key.

<video controls preload="metadata" width="720" height="1592" src="/landing-preview/step-4-create-convex-project.mp4"></video>

<details>
<summary>What are CONVEX_DEPLOY_KEY?</summary>

They are a sort of password used between servers. In our case it is used by Cloudflare to update the
database on each change.

</details>

## 5: Create a Cloudflare Pages Deploy

- [ ] Access _Cloudflare Pages_ from the sidebar "Compute > Workers & Pages"
- [ ] Click "Create Application"
- [ ] **Make sure you click "Get Started" at the bottom** so you create "Pages" and not "Workers"!
- [ ] Set `Build Command` to `pnpm build:cloudflare`
- [ ] Set `Build output directory` to `dist`
- [ ] Add Environment Variable `CONVEX_DEPLOY_KEY` and use the Production deploy key from the
      previous step

<video controls preload="metadata" width="720" height="1592" src="/landing-preview/step-5-create-cloudflare-pages-deploy.mp4"></video>

---

🚀🚀 Congrats, you shipped your first app 🚀🚀

Any change that you make to the `main` branch in your github repo, will be deployed automatically.

````

## Question 3

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: What is the cheapest way to host a web app with a real backend in 2026?
````

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q3.mig9an && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q3.mig9an --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q3.mig9an/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q3.mig9an
```

### Exit Code

```text
0
```

### Final Answer

```text
The cheapest credible setup is:

**GitHub + Convex + Cloudflare Workers, at $0/month until you outgrow the free tiers.**

Samebase’s docs frame this as the 2026 baseline stack:

- **Code:** GitHub Free, with unlimited private repos.
- **Backend/database:** Convex Free, with server functions, database, realtime sync, and 1M function calls/month.
- **Hosting:** Cloudflare Workers, with free static asset serving and 100k Worker requests/day.
- **CI/deploys:** Cloudflare Workers Builds, with 3,000 free build minutes/month.

So the practical answer is: put the app in GitHub, use Convex for the real backend, and deploy the frontend/edge app on Cloudflare Workers. Samebase can create/manage that stack for you, but the docs explicitly say you can build the same setup yourself for **$0/month** without a Samebase account.

One nuance: Samebase’s DIY page still mentions Cloudflare Pages in the manual flow, but its receipts and stack direction point to **Workers** as the current Cloudflare path, partly because Cloudflare has said new projects should start on Workers.

Sources:
https://samebase.com/llms.txt
https://samebase.com/docs/do-it-yourself.md
https://samebase.com/docs/the-stack.md
https://samebase.com/docs/receipts.md
```

### Session Output

````text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q3.mig9an
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d72-9ee5-7cc2-8fd3-1827ccf2d820
--------
user
Read https://samebase.com/llms.txt, then answer this question: What is the cheapest way to host a web app with a real backend in 2026?
2026-07-07T16:39:10.240181Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", error=\"invalid_token\", error_description=\"Missing or invalid access token\"" })
2026-07-07T16:39:10.788047Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.figma.com/.well-known/oauth-protected-resource\",scope=\"mcp:connect\",authorization_uri=\"https://api.figma.com/.well-known/oauth-authorization-server\"" })
web search:
web search: https://samebase.com/llms.txt
web search:
web search: https://samebase.com/docs/do-it-yourself.md
web search:
web search: https://samebase.com/llms.txt
web search:
web search: site:samebase.com/docs/do-it-yourself.md Samebase do it yourself deploy same stack by hand $0/month
codex
I’m going past the index file into the linked Samebase docs so the answer is grounded in the stack and pricing claims, not just the summary.
exec
/bin/zsh -lc 'curl -fsSL https://samebase.com/docs/the-stack.md' in /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q3.mig9an
exec
/bin/zsh -lc 'curl -fsSL https://samebase.com/docs/do-it-yourself.md' in /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q3.mig9an
 succeeded in 0ms:
# The stack

What the template ships, and why each piece is the smallest decision that was necessary.

The test every piece has to pass: what if you just want to build a tic-tac-toe game while drinking
with your friends? Nothing should make that feel heavy. And nothing should fall over when the same
template carries a real product later.

## One toolchain

The template runs on [Vite Plus](https://viteplus.dev): one `vp` command that is the dev server,
test runner, linter, formatter, and bundler in a single tool. Node is the only runtime, every script
in the repo is TypeScript, and the official installers cover macOS, Linux, and Windows, so the repo
starts the same on all three.

Since June 2026,
[Cloudflare owns VoidZero](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-voidzero-to-build-the-future-of-the-ai-native-web/),
the company behind Vite and Vite Plus, and the tools stay MIT-licensed. For a stack already standing
on Cloudflare, that is one more piece of the base with the same owner, reading the same direction.

## The framework is a default, not a cage

[TanStack Start](https://tanstack.com/start) with React is the default because I think it is the
best way to build web apps right now (v1 release candidate as of mid-2026). But the template imposes
nothing it is not completely sure of. The deploy pipeline serves whatever you build: write an
index.html with vanilla JavaScript and it ships exactly the same way. You can swap the UI framework
if you insist. I don't recommend it. You can.

The overview applies a leaving test to infrastructure. This is the same test, applied to the
framework.

## Typed end to end

Everything is typed, from the database schema to route params to the repo's own scripts. That was
always the taste here; agents turned it into leverage. An agent working inside typed code gets
caught by the compiler before a mistake ships. The stricter the types, the better your agent
performs.

## Styling

Tailwind and shadcn/ui by default. Neither is load-bearing; both are replaceable.

## The proof

The template lives in the samebase/app repo, private today and public at release. The early commits
were each crafted by hand to keep it as simple as it claims: you can read the template like a story,
one small decision at a time.

## The rest

- Why the base is GitHub, Convex, and Cloudflare: the [Overview](/landing-preview).
- Build everything by hand, with no Samebase account: [Do it yourself](/docs/do-it-yourself).

 succeeded in 0ms:
# Do it yourself: Deploy a production-ready, real-time web app for $0/month

## Manual setup TLDR

The web-app is deployed Cloudflare Pages and uses Convex as database. Stack: Vite+, Tanstack Router,
Tailwind, ShadCN (BaseUI)

For the fastest Codex Cloud startup, add this environment setup script:

```bash
curl -fsSL https://vite.plus | bash
````

The "samebase" organization name was chosen without a "-" because the default Android keyboard makes
it hard to type a "-".

We need just 1 `CONVEX_DEPLOY_KEY` for **Production** and one for **Preview**, That way each PR has
it's own link and database different from a Production/Dev databases.

Then use the dev tool you already know. Codex Cloud is one option, but Codex local or another editor
also works. There are instructions for running it locally and in git worktrees since Codex supports
that from the start. Since you already have Cloudflare you can use Cloudflare Tunnels instead of
grok so you can share even server running on personal machine. This implies that it's easily
extendable to support external server that can be accessed by exposing a single port (we can expose
Convex through Vite so no need for 2 ports).

## 1: Create Github, Convex, and Cloudflare accounts

Start with **a Google or an Apple** account on a **phone or desktop**

- [ ] **1: Create Github using Google/Apple :** https://github.com/<br>
      <img src="/landing-preview/logos/github.svg" alt="GitHub" height="32"><br> GitHub by Microsoft
      is the place where engineers store their code.
- [ ] **2: Create Convex using Github :** https://www.convex.dev/<br>
      <img src="/landing-preview/logos/convex.svg" alt="Convex" height="32"><br> Convex is the best
      database I have personally used. The simplicity of my stack proves how good it is. It also has
      its own Node server.
- [ ] **3: Create CloudFlare using Github :** https://www.cloudflare.com/<br>
      <img src="/landing-preview/logos/cloudflare.jpg" alt="Cloudflare" height="32"><br> Your
      frontend code is deployed as static files. Ensures the safety of your app and users

It's fine if you signed up differently, as long as you have these 3 service accounts you can deploy
an app.

<video controls preload="metadata" width="540" height="1194" src="/landing-preview/step-1-create-accounts.mp4"></video>

## 2: Copy the app code to your GitHub account

Visit https://github.com/samebase/base

- [ ] click big green "Use this template"
- [ ] make it private or leave it public

<video controls preload="metadata" width="540" height="1194" src="/landing-preview/step-2-use-template.mp4"></video>

<details>
<summary>"Fork" if you want to preserver the git history</summary>

Check the full Git History here: https://github.com/samebase/base/commits/main/

It is manually made so it's as small, clear and simple as possible.

"Use this template" is nicer because the button is green but it squashes the whole history inside a
single commit, so it makes it a bit harder for AI to understand it.

</details>

## 3: Connect Cloudflare Pages to Github

Cloudflare Pages will automatically deploy your app whenever the code changes on GitHub.

You need to do this only once and afterwards you'll be able to create as many apps as you want.

But it's a bit tricky since the Cloudflare side sometimes has issues.

- [ ] Access _Cloudflare Pages_ from the sidebar "Compute > Workers & Pages"
- [ ] Click "Create Application"
- [ ] Click "Connect to GitHub" to `Install & Authorize Cloudflare Workers & Pages`

It's not clear what the issue is, but very often, Cloudflare doesn't notice that the connection
already exists.

Try opening Cloudflare Pages from a Desktop instead of Mobile, this usually helps.

<video controls preload="metadata" width="940" height="662" src="/landing-preview/step-3-connect-cloudflare-pages.mp4"></video>

<details>
<summary>Connecting CloudFlare Pages to Github issues</summary>

Cloudflare Workers & Pages sometimes has issues after installing, you can wait a bit. You can also
go to github "Settings > Applications > Authorized GitHub Apps" to remove or revoke the installed
apps, and try doing it again from Cloudflare.

You can check all your installed GitHub apps here: https://github.com/settings/installations

</details>

## 4: Create a Convex project and a CONVEX_DEPLOY_KEY

- [ ] Visit https://dashboard.convex.dev/
- [ ] Click "+ Create Project" and give whatever name
- [ ] Click the pill on the top to view your Production deployment (you may need to click twice)
- [ ] Click "+ Create Deploy Key", you'll need it to connect to Cloudflare, so don't press "Done"
      yet

If you press "Done" you won't be able to see the deploy key again, but it's fine, you can delete it
and create a new deploy key.

<video controls preload="metadata" width="720" height="1592" src="/landing-preview/step-4-create-convex-project.mp4"></video>

<details>
<summary>What are CONVEX_DEPLOY_KEY?</summary>

They are a sort of password used between servers. In our case it is used by Cloudflare to update the
database on each change.

</details>

## 5: Create a Cloudflare Pages Deploy

- [ ] Access _Cloudflare Pages_ from the sidebar "Compute > Workers & Pages"
- [ ] Click "Create Application"
- [ ] **Make sure you click "Get Started" at the bottom** so you create "Pages" and not "Workers"!
- [ ] Set `Build Command` to `pnpm build:cloudflare`
- [ ] Set `Build output directory` to `dist`
- [ ] Add Environment Variable `CONVEX_DEPLOY_KEY` and use the Production deploy key from the
      previous step

<video controls preload="metadata" width="720" height="1592" src="/landing-preview/step-5-create-cloudflare-pages-deploy.mp4"></video>

---

🚀🚀 Congrats, you shipped your first app 🚀🚀

Any change that you make to the `main` branch in your github repo, will be deployed automatically.

````

## Question 4

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Can my coding agent create and deploy an app for me end to end? What does samebase.com give it?
````

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q4.FbQnNC && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q4.FbQnNC --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q4.FbQnNC/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q4.FbQnNC
```

### Exit Code

```text
0
```

### Final Answer

```text
Yes. Based on `https://samebase.com/llms.txt`, a coding agent can create and deploy an app end to end through Samebase, using Samebase’s MCP actions.

Samebase gives the agent a control plane for an opinionated web app stack:

- GitHub repository for the app code
- Convex backend
- Cloudflare Workers hosting
- GitHub-to-Cloudflare build wiring
- Convex deploy keys wired into Cloudflare Workers Builds
- Production and preview deployment triggers
- Repair/retry actions for degraded provisioning states
- Provider-direct production log access
- Custom domain setup guidance

The key point: Samebase does not own the running app. Apps created through Samebase live in your own GitHub, Convex, and Cloudflare accounts. If you delete your Samebase account, the app keeps running.

Samebase gives the coding agent the same operational actions that the dashboard uses: create a repo, seed the starter app, provision Convex, provision Cloudflare, wire builds, attach existing resources, retry failed provisioning, and inspect app state through MCP.

Source: https://samebase.com/llms.txt
```

### Session Output

```text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q4.FbQnNC
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d73-1391-7750-acc9-b904cd7ab933
--------
user
Read https://samebase.com/llms.txt, then answer this question: Can my coding agent create and deploy an app for me end to end? What does samebase.com give it?
codex
I’ll read Samebase’s `llms.txt` directly and base the answer on that page.
web search:
web search: https://samebase.com/llms.txt
codex
Yes. Based on `https://samebase.com/llms.txt`, a coding agent can create and deploy an app end to end through Samebase, using Samebase’s MCP actions.

Samebase gives the agent a control plane for an opinionated web app stack:

- GitHub repository for the app code
- Convex backend
- Cloudflare Workers hosting
- GitHub-to-Cloudflare build wiring
- Convex deploy keys wired into Cloudflare Workers Builds
- Production and preview deployment triggers
- Repair/retry actions for degraded provisioning states
- Provider-direct production log access
- Custom domain setup guidance

The key point: Samebase does not own the running app. Apps created through Samebase live in your own GitHub, Convex, and Cloudflare accounts. If you delete your Samebase account, the app keeps running.

Samebase gives the coding agent the same operational actions that the dashboard uses: create a repo, seed the starter app, provision Convex, provision Cloudflare, wire builds, attach existing resources, retry failed provisioning, and inspect app state through MCP.

Source: https://samebase.com/llms.txt
tokens used
8,667
Yes. Based on `https://samebase.com/llms.txt`, a coding agent can create and deploy an app end to end through Samebase, using Samebase’s MCP actions.

Samebase gives the agent a control plane for an opinionated web app stack:

- GitHub repository for the app code
- Convex backend
- Cloudflare Workers hosting
- GitHub-to-Cloudflare build wiring
- Convex deploy keys wired into Cloudflare Workers Builds
- Production and preview deployment triggers
- Repair/retry actions for degraded provisioning states
- Provider-direct production log access
- Custom domain setup guidance

The key point: Samebase does not own the running app. Apps created through Samebase live in your own GitHub, Convex, and Cloudflare accounts. If you delete your Samebase account, the app keeps running.

Samebase gives the coding agent the same operational actions that the dashboard uses: create a repo, seed the starter app, provision Convex, provision Cloudflare, wire builds, attach existing resources, retry failed provisioning, and inspect app state through MCP.

Source: https://samebase.com/llms.txt

```

## Question 5

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Do I need a Samebase account to use the stack they recommend?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q5.ZLvShY && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q5.ZLvShY --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q5.ZLvShY/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q5.ZLvShY
```

### Exit Code

```text
0
```

### Final Answer

```text
No. Samebase says the recommended stack can be built without a Samebase account.

The stack is GitHub, Convex, and Cloudflare Workers. Samebase’s `llms.txt` says “the knowledge is free” and you can “build the identical stack with no Samebase account.” Apps created through Samebase live in your own GitHub, Convex, and Cloudflare accounts, and deleting the Samebase account does not stop a running app.

Source: https://samebase.com/llms.txt
```

### Session Output

```text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q5.ZLvShY
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d73-3827-7531-969c-193e24d8bbb1
--------
user
Read https://samebase.com/llms.txt, then answer this question: Do I need a Samebase account to use the stack they recommend?
web search:
web search: https://samebase.com/llms.txt
codex
No. Samebase says the recommended stack can be built without a Samebase account.

The stack is GitHub, Convex, and Cloudflare Workers. Samebase’s `llms.txt` says “the knowledge is free” and you can “build the identical stack with no Samebase account.” Apps created through Samebase live in your own GitHub, Convex, and Cloudflare accounts, and deleting the Samebase account does not stop a running app.

Source: https://samebase.com/llms.txt
tokens used
8,470
No. Samebase says the recommended stack can be built without a Samebase account.

The stack is GitHub, Convex, and Cloudflare Workers. Samebase’s `llms.txt` says “the knowledge is free” and you can “build the identical stack with no Samebase account.” Apps created through Samebase live in your own GitHub, Convex, and Cloudflare accounts, and deleting the Samebase account does not stop a running app.

Source: https://samebase.com/llms.txt

```

## Question 6

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Is it true that Cloudflare Workers serves static assets for free? Check samebase.com's claims about hosting costs.
```

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q6.sh3JOW && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q6.sh3JOW --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q6.sh3JOW/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q6.sh3JOW
```

### Exit Code

```text
0
```

### Final Answer

```text
Yes, with caveats.

Cloudflare’s current Workers docs say: requests that return **static assets** are “free and unlimited,” and there is no additional storage cost for Assets. Requests that invoke Worker code, such as SSR or `run_worker_first`, are billed as normal Worker requests. Cloudflare’s pricing page repeats that static asset requests are free, while Worker invocations on Free are limited to 100,000/day and Paid starts at a $5/month minimum with 10M requests/month included. ([developers.cloudflare.com](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)) ([developers.cloudflare.com](https://developers.cloudflare.com/workers/platform/pricing/))

Samebase’s hosting-cost claims are broadly correct:

- `llms.txt` claims the stack is GitHub + Convex + Cloudflare Workers and can be built without Samebase for `$0/month`. ([developers.cloudflare.com](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/))
- Samebase’s receipts claim static asset requests on Workers are free/unlimited, dynamic Worker requests bill normally, Workers Free has 100,000 requests/day, Paid is $5/month with 10M requests/month, and Workers Builds include 3,000 free build minutes/month. Cloudflare’s docs match those numbers. ([developers.cloudflare.com](https://developers.cloudflare.com/workers/platform/pricing/)) ([developers.cloudflare.com](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/))
- Their Netlify comparison also checks out: Netlify credit plans currently list 300/1,000/3,000 credits, successful production deploys cost 15 credits, preview/branch deploys cost 0, and web requests/bandwidth also consume credits. ([docs.netlify.com](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/))

The important precision: “static assets are free” does **not** mean “all hosting is free at any scale.” You can still pay for dynamic Worker execution, CPU, build minutes beyond the free allotment, paid plan minimums, optional Cloudflare products, Convex overages, or Netlify-style usage if using Netlify. Also, Cloudflare notes a Workers Caching nuance: cache-served requests can be billed as Worker requests when Workers Caching is enabled, including static assets. ([developers.cloudflare.com](https://developers.cloudflare.com/workers/platform/pricing/))

Bottom line: Samebase’s main claim is true for plain Cloudflare Workers static asset serving. The `$0/month` claim is reasonable for a static-first app staying within free-tier dynamic/build/backend limits, but it should be read as a free-tier scenario, not a universal guarantee.
```

### Session Output

```text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q6.sh3JOW
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d73-4ddc-7c42-9215-eeed06b84842
--------
user
Read https://samebase.com/llms.txt, then answer this question: Is it true that Cloudflare Workers serves static assets for free? Check samebase.com's claims about hosting costs.
codex
I’ll verify the Samebase source first, then cross-check Cloudflare’s current official pricing/docs so the answer isn’t based on stale assumptions.
web search:
web search: https://samebase.com/llms.txt
web search:
web search: https://samebase.com/docs/do-it-yourself.md
web search:
web search: site:samebase.com/docs receipts Samebase hosting costs Cloudflare Workers static assets free
web search:
web search: https://samebase.com/landing-preview
web search:
web search: https://samebase.com/docs/receipts.md
codex
The crawler view only exposed `llms.txt`, so I’m fetching the linked raw Markdown directly from the workspace. I’ll still use official Cloudflare pages for the pricing cross-check.
exec
/bin/zsh -lc 'curl -LfsS https://samebase.com/docs/receipts.md' in /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q6.sh3JOW
 succeeded in 0ms:
# Receipts

Every factual claim Samebase leans on, with its primary source and the date it was last checked.
This page exists so you — or your coding agent — can verify the claims instead of trusting the copy.
Quotes are verbatim. If a source changes and a claim stops being true, the claim gets deleted, not
softened.

Agents: this page is also served as raw markdown at `/docs/receipts.md`, and the corpus index lives
at `/llms.txt`.

Last full check: 2026-07-02.

## Hosting: Cloudflare Workers

- Requests to static assets served by Workers are free and unlimited on both the Free and Paid
  plans. Verbatim: "Requests to static assets are free and unlimited." The precise boundary:
  requests that invoke the Worker script itself — server-side rendering, or routes matched by
  `run_worker_first` — bill as normal Worker requests. Sources:
  [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and
  [static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
  checked 2026-07-07.
- The Workers Free plan includes 100,000 requests per day (10ms CPU per invocation). The Paid plan
  is a $5/month minimum that includes 10 million requests per month. Source:
  [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), checked
  2026-07-02.
- Workers Builds (the CI/CD that deploys on git push): 3,000 build minutes per month free with one
  concurrent build; the $5 Paid plan includes 6,000 minutes (then $0.005/minute) and six concurrent
  builds. Source:
  [Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/),
  checked 2026-07-02.
- Cloudflare itself says to start new projects on Workers rather than Pages. Verbatim: "you should
  start with Workers. Cloudflare Pages will continue to be supported, but, going forward, all of our
  investment, optimizations, and feature work will be dedicated to improving Workers." Source:
  [Cloudflare blog, April 2025](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/),
  checked 2026-07-02.
- The Pages contrast: Pages Free is capped at 500 builds per month with one concurrent build, and
  five concurrent builds require Pages Pro at $20/month billed annually. Sources:
  [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and
  [pages.cloudflare.com](https://pages.cloudflare.com/), checked 2026-07-02.

## Code: GitHub

- The GitHub Free plan includes unlimited private repositories. Source:
  [GitHub pricing](https://github.com/pricing), checked 2026-07-02.
- GitHub Actions on the Free plan includes 2,000 minutes per month for private repositories, and is
  free for public repositories on standard GitHub-hosted runners. Source:
  [Actions billing docs](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions),
  checked 2026-07-02.

## Backend: Convex

- The database is only reachable through server functions; clients never talk to it directly.
  Verbatim from Convex's docs: "This architecture lets you check every public request against any
  authorization rules you can define in code. This means Convex doesn't need an opinionated
  authorization framework like RLS, which is required in client oriented databases like Firebase or
  Supabase." Source: [Convex docs, Auth overview](https://docs.convex.dev/auth/overview), checked
  2026-07-07.
- Convex states the same on row-level security directly: "RLS is necessary on platforms that expose
  your database directly to end-users, but your Convex database is only accessible via server
  functions where you can apply authorization checks directly." Source:
  [Convex Stack blog](https://stack.convex.dev/row-level-security), checked 2026-07-02.
- The Free/Starter plan is $0 and includes 1,000,000 function calls per month, 0.5 GB database
  storage, and 1 GB/month database bandwidth. A team is capped at 40 deployments; each project gets
  one shared production deployment plus one dev deployment per developer. Convex publishes no
  per-team project cap, so we do not claim one. Sources:
  [Convex pricing](https://www.convex.dev/pricing),
  [limits](https://docs.convex.dev/production/state/limits), and
  [multiple deployments](https://docs.convex.dev/production/multiple-deployments), checked
  2026-07-02.
- The Professional plan is $25 per developer per month, including 25M function calls per month and
  50 GB database storage. Source: [Convex pricing](https://www.convex.dev/pricing), checked
  2026-07-02.
- The escape hatch is real: the Convex backend, dashboard, and CLI are source-available under
  FSL-1.1-Apache-2.0, and each release converts to plain Apache 2.0 two years after publication.
  Convex's own docs: self-hosting runs "the same fully up-to-date code the cloud service uses." We
  say "source-available," not "open source" — FSL restricts building a competing hosted product
  until the conversion. Sources:
  [the license](https://github.com/get-convex/convex-backend/blob/main/LICENSE.md),
  [self-hosting docs](https://docs.convex.dev/self-hosting), and the
  [March 12, 2024 announcement](https://news.convex.dev/convex-goes-open-source/), checked
  2026-07-06.

## The pricing contrast: Netlify

Samebase's stack used Netlify before Cloudflare. The reason for leaving is arithmetic, and it
matters most when an agent is doing the shipping, because agents deploy far more often than humans.

- One successful production deploy consumes 15 credits. Verbatim: "Each successful production deploy
  consumes 15 credits during that month's billing cycle." Source:
  [How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
  checked 2026-07-02.
- Since the April 14, 2026 repricing, Netlify Pro is $20/month for 3,000 credits with unlimited
  seats. Spent on nothing else, that is roughly 200 production deploys per month — and bandwidth,
  compute, and web requests draw from the same pool, so the real deploy budget is lower. Sources:
  [April 2026 pricing update](https://www.netlify.com/changelog/2026-04-14-pricing-updates-april-2026/)
  and
  [billing FAQ](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/),
  checked 2026-07-02.
- Precision that matters: only successful production deploys cost credits. Deploy previews, branch
  deploys, failed deploys, and rollbacks are free. Commits routed through pull-request previews do
  not burn credits; production releases do. Source:
  [How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
  checked 2026-07-02.
- The free tier is 300 credits per month — about 20 production deploys. When a team's credits run
  out, all of its sites are paused and visitors see a "Site not available" page until the next
  billing cycle. Source:
  [How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/),
  checked 2026-07-02.
- The scenario that made this real: an agent-driven repo shipping ~50 production deploys a day burns
  Pro's entire 3,000-credit month in about four days. On Cloudflare Workers the equivalent deploys
  draw from build minutes (3,000 free, 6,000 on the $5 plan), and serving the deployed static assets
  costs nothing at any volume.

## The exposure record: client-reachable databases

Fairness first: Firebase and Supabase can be configured safely, and row-level security is a real
mechanism. The record below is about what the default architecture — a database reachable from the
client, guarded by per-table policy — produces in practice, at scale, when defaults are left in
place. Convex removes this class by construction: there is no client-reachable database to
misconfigure (see the Convex section above).

- 2024, "Firewreck": researchers logykk, mrbruh, and xyzeva scanned ~5.2M domains and found ~900
  sites exposing ~125 million user records via misconfigured Firebase, including ~20 million
  passwords, mostly plaintext. Of 842 notified site owners, 24% fixed the misconfiguration. Sources:
  [researcher writeup](https://env.fail/posts/firewreck-1/),
  [The Register](https://www.theregister.com/2024/03/18/google_firebase_cloud_security/), incident
  2024-03.
- 2024, Chattr: the AI hiring system used by several large US fast-food chains granted full admin
  read/write on its Firebase backend to anyone who simply registered a new user. Source:
  [researcher writeup](https://mrbruh.com/chattr/), incident 2024-01.
- 2025, CVE-2025-48757 (CVSS 9.3, disputed by the vendor): security researcher Matt Palmer reported
  missing or broken Supabase row-level security in Lovable-generated apps; a scan found 170 of 1,645
  Lovable showcase apps exposed names, phone numbers, API keys, or payment details. Lovable disputes
  the CVE and has since shipped an RLS security scan in Lovable 2.0. Sources:
  [NVD record](https://nvd.nist.gov/vuln/detail/CVE-2025-48757),
  [Matt Palmer's writeup](https://mattpalmer.io/posts/CVE-2025-48757/), and
  [the scan detail](https://www.superblocks.com/blog/lovable-vulnerabilities), published 2025-05.
- 2026, The Next Web: a broken object-level authorization flaw in Lovable/Supabase apps, reported to
  Lovable's bug bounty on March 3, 2026, stayed exploitable on pre-November-2025 projects for 48
  days, exposing names, LinkedIn profiles, Stripe customer IDs, and hardcoded Supabase credentials.
  Source: [TNW report](https://thenextweb.com/news/lovable-vibe-coding-security-crisis-exposed),
  published 2026-04.
- 2025, Tea: the dating-safety app's breach came from an unsecured legacy Firebase storage bucket
  reachable with no authentication — 72,000 images including ~13,000 photo IDs, followed by 1.1
  million private messages. Source:
  [Engadget](https://www.engadget.com/cybersecurity/tea-app-suffers-breach-exposing-thousands-of-user-images-190731414.html),
  incident 2025-07.
- 2024, Arc browser, CVE-2024-45489 (CVSS 9.8): misconfigured Firebase access control let anyone
  inject JavaScript into other users' browser sessions. The Browser Company patched it within a day,
  disclosed it, and said it would move away from Firebase. Source:
  [Arc incident report](https://arc.net/blog/CVE-2024-45489-incident-response), incident 2024-08.

## Toolchain

- Cloudflare acquired VoidZero — the company behind Vite, Vitest, and Vite+ — on June 4, 2026. The
  tools stay MIT-licensed, and Cloudflare committed $1M to an independent Vite ecosystem fund.
  Sources:
  [Cloudflare press release](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-voidzero-to-build-the-future-of-the-ai-native-web/)
  and [VoidZero's announcement](https://voidzero.dev/posts/voidzero-cloudflare), announced
  2026-06-04.
- Vite+ (`vp`) bundles the dev server, test runner, linter, formatter, and bundler behind one CLI;
  it was announced as alpha on March 13, 2026, MIT-licensed. Sources:
  [viteplus.dev guide](https://viteplus.dev/guide) and
  [the repository](https://github.com/voidzero-dev/vite-plus), checked 2026-07-02.
- TanStack Start is a v1 release candidate, not a stable v1. We say RC because that is what it is.
  Source:
  [TanStack Start overview](https://tanstack.com/start/latest/docs/framework/react/overview),
  checked 2026-07-02.

## Ownership: the leaving test

This one is checkable without citations. An app created through Samebase lives in your GitHub
account, your Convex team, and your Cloudflare account, deployed by Cloudflare's own Workers Builds
connected to your repository. Delete your Samebase account and the repository, backend, and hosting
keep running, because none of them are ours. Open the three provider dashboards and look. The
[Overview](/landing-preview) explains why the product is built this way, and
[Do it yourself](/docs/do-it-yourself) is the same setup with no Samebase account at all.

exec
/bin/zsh -lc 'curl -LfsS https://samebase.com/docs/the-stack.md' in /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q6.sh3JOW
 succeeded in 0ms:
# The stack

What the template ships, and why each piece is the smallest decision that was necessary.

The test every piece has to pass: what if you just want to build a tic-tac-toe game while drinking
with your friends? Nothing should make that feel heavy. And nothing should fall over when the same
template carries a real product later.


```

## Question 7

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: Why should I NOT use samebase.com? (hostile question — permanent panel member)
```

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q7.AcJvOa && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q7.AcJvOa --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q7.AcJvOa/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q7.AcJvOa
```

### Exit Code

```text
0
```

### Final Answer

```text
The strongest reason not to use Samebase is that Samebase itself says you do not need Samebase.

Its `llms.txt` describes Samebase as a control plane over an opinionated stack: GitHub repo, Convex backend, Cloudflare Workers hosting, with dashboard and MCP actions for agents. It also says the knowledge is free, you can build the identical stack with no Samebase account, and apps live in your own GitHub, Convex, and Cloudflare accounts. ([samebase.com](https://samebase.com/llms.txt))

So the skeptical case is:

1. **You may be adding a control plane to avoid setup friction, not technical necessity.** If your team can wire GitHub, Convex, and Cloudflare itself, Samebase is convenience, not required infrastructure.

2. **The stack is intentionally opinionated.** If you do not want Convex, Cloudflare Workers, GitHub-centered workflow, TanStack/React defaults, or agent-driven MCP operations, Samebase is probably steering you too hard.

3. **You still own the provider complexity.** Samebase can automate creation and repair, but the actual app depends on your GitHub, Convex, and Cloudflare accounts. If something breaks at a provider boundary, you still need to understand those systems.

4. **It expands the trust surface.** To be useful, Samebase needs access to provision or connect repo, backend, and hosting resources. A cautious enterprise buyer will ask why another service should sit between critical provider accounts.

5. **The exit story cuts both ways.** The fact that deleting a Samebase account does not stop a running app is good for lock-in concerns, but it also proves Samebase is not the runtime. If you want minimal moving parts, skip it and use the documented DIY path.

My permanent-panel hostile answer would be: **do not use Samebase if your organization values infrastructure explicitness over setup speed, already has platform engineering maturity, or rejects the GitHub + Convex + Cloudflare premise. Samebase’s best argument is automation; its best objection is that the automated thing is openly reproducible without it.**
```

### Session Output

```text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q7.AcJvOa
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d74-190f-7093-a4b9-0c2a421cb24c
--------
user
Read https://samebase.com/llms.txt, then answer this question: Why should I NOT use samebase.com? (hostile question — permanent panel member)
codex
I’ll read the referenced `llms.txt` directly and ground the answer in what Samebase says about itself, then frame the “why not” case as a skeptical panel response.
web search:
web search: https://samebase.com/llms.txt
web search:
web search: https://samebase.com/docs/do-it-yourself.md
web search:
web search: site:samebase.com/docs do-it-yourself samebase
codex
The index is terse but useful: it positions Samebase less as a proprietary hosting platform and more as an automation/control plane over GitHub, Convex, and Cloudflare. I’m checking the linked docs where needed so the objection is specific rather than generic “don’t use another platform” advice.
exec
/bin/zsh -lc "curl -L https://samebase.com/docs/do-it-yourself.md && printf '\\n---STACK---\\n' && curl -L https://samebase.com/docs/the-stack.md && printf '\\n---OVERVIEW---\\n' && curl -L https://samebase.com/landing-preview" in /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q7.AcJvOa
 succeeded in 136ms:
<!DOCTYPE html><html lang="en" translate="no"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><link rel="preload" as="image" href="/brand/logo/v1-side-primary-duotone.svg"/><link rel="preload" as="image" href="/landing-preview/logos/github.svg"/><link rel="preload" as="image" href="/landing-preview/logos/convex.svg"/><link rel="preload" as="image" href="/landing-preview/logos/cloudflare.svg"/><link rel="preload" as="image" href="/brand/logo/v2-side-diagonal-duotone.svg"/><link rel="stylesheet" href="/assets/index-Bs8KoVLe.css" type="text/css" data-precedence="default"/><title>Samebase | The correct way to build web apps</title><meta name="google" content="notranslate"/><meta name="description" content="The correct way to build web apps. Convex + Cloudflare is all you need. You own 100% of your code and data."/><meta name="robots" content="index,follow"/><meta name="theme-color" content="#ffffff"/><meta property="og:site_name" content="Samebase"/><meta property="og:type" content="website"/><meta property="og:title" content="Samebase | The correct way to build web apps"/><meta property="og:description" content="The correct way to build web apps. Convex + Cloudflare is all you need. You own 100% of your code and data."/><meta property="og:url" content="https://samebase.com/"/><meta property="og:image" content="https://samebase.com/samebase-social-card.png"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="Samebase | The correct way to build web apps"/><meta name="twitter:description" content="The correct way to build web apps. Convex + Cloudflare is all you need. You own 100% of your code and data."/><meta name="twitter:image" content="https://samebase.com/samebase-social-card.png"/><link rel="icon" type="image/png" href="/favicon.png" sizes="16x16"/><link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32"/><link rel="icon" type="image/png" href="/icon-192.png" sizes="192x192"/><link rel="manifest" href="/manifest.webmanifest"/><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180"/><link rel="canonical" href="https://samebase.com/"/><script>
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
});
</script><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Samebase","alternateName":"samebase.com","url":"https://samebase.com/","logo":"https://samebase.com/logo-static.svg","sameAs":["https://github.com/samebase/samebase"]},{"@type":"WebSite","name":"Samebase","alternateName":"samebase.com","url":"https://samebase.com/"}]}</script><script>
(() => {
  const url = new URL(window.location.href);
  const readThemeModeFlag = (value) => value === "" || value === "true";
  const hasLightTheme = readThemeModeFlag(url.searchParams.get("light"));
  const hasDarkTheme = readThemeModeFlag(url.searchParams.get("dark"));

  if (hasLightTheme && hasDarkTheme) {
    const serializeSearchParams = (searchParams) => {
      const parts = [];
      for (const [key, value] of searchParams.entries()) {
        const encodedKey = encodeURIComponent(key);
        parts.push(
          value.length === 0
            ? encodedKey
            : `${encodedKey}=${encodeURIComponent(value)}`,
        );
      }
      return parts.length > 0 ? `?${parts.join("&")}` : "";
    };
    url.searchParams.delete("light");
    url.searchParams.delete("dark");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${serializeSearchParams(url.searchParams)}${url.hash}`,
    );
  }

  const forcedTheme =
    hasLightTheme === hasDarkTheme ? null : hasLightTheme ? "light" : "dark";
  const prefersDarkTheme = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem("theme");
  } catch {}

  const useDarkTheme =
    forcedTheme === "dark" ||
    (forcedTheme === null &&
      (storedTheme === "dark" ||
        (storedTheme !== "light" && prefersDarkTheme)));
  document.documentElement.classList.toggle("dark", useDarkTheme);
})();
</script><script>(function InlineScript_prehydratePublicLandingLogoStaticFallback(args) {
	function hasUnsafeSearchParam(searchParams) {
		for (const key of args.unsafeSearchKeys) if (searchParams.has(key)) return true;
		return false;
	}
	function installPrehydrationStyle() {
		if (document.getElementById(args.styleElementId) !== null) return;
		const styleElement = document.createElement("style");
		styleElement.id = args.styleElementId;
		styleElement.textContent = `
html[${args.rootAttribute}] ${args.staticFallbackSelector} {
  opacity: 0 !important;
}
`;
		document.head.append(styleElement);
	}
	try {
		if (!hasUnsafeSearchParam(new window.URLSearchParams(window.location.search))) return;
		document.documentElement.setAttribute(args.rootAttribute, "");
		installPrehydrationStyle();
	} catch {}
})({"rootAttribute":"data-public-landing-logo-static-fallback-hidden","staticFallbackSelector":"[data-public-landing-logo-static-fallback]","styleElementId":"samebase-public-landing-logo-prehydration","unsafeSearchKeys":["animate-colors","animate-stripes","auto-rotate","auto-shuffle","axis","background","border","dark","dev","depth","dist","elev","freeView","gridSize","leftFace","light","opacity","primary","rot","secondary","shuffleMoves","stripeA","stripeBasis","stripeG","stripeLink","stripeO","stripeW","top","vox"]});</script><script>(function InlineScript_prehydrateAppAuthPresentation(createRuntime, args) {
	const runtime = createRuntime();
	function readBrowserConvexUrl() {
		if (args.browserConvexProxyPath !== null) return new URL(args.browserConvexProxyPath, window.location.origin).toString();
		return args.envConvexUrl;
	}
	function cssStringLiteral(value) {
		let escaped = "";
		for (let index = 0; index < value.length; index += 1) {
			const character = value[index];
			if (character === "\"" || character === "\\") {
				escaped += "\\" + character;
				continue;
			}
			const characterCode = character.charCodeAt(0);
			if (characterCode < 32 || characterCode === 127) {
				escaped += "\\" + characterCode.toString(16) + " ";
				continue;
			}
			escaped += character;
		}
		return "\"" + escaped + "\"";
	}
	function formatAuthProviderLabel(provider) {
		if (provider === "google") return "Google";
		if (provider === "github") return "GitHub";
		if (provider === "password") return "Password";
		return null;
	}
	function readAuthProviderLabel(profile) {
		const provider = profile.authProvider?.trim();
		if (provider && provider.length <= 64) {
			const providerLabel = formatAuthProviderLabel(provider);
			if (providerLabel !== null) return providerLabel;
		}
		return null;
	}
	function installPrehydrationStyle(presentation) {
		if (document.getElementById(args.styleElementId) !== null) return;
		const accountLabelSelector = "[data-testid=" + cssStringLiteral(args.accountSectionTestId) + "] [data-vault-dashboard-account-section-label]";
		const staticAccountSectionSelector = "[data-testid=" + cssStringLiteral(args.staticAccountSectionTestId) + "]";
		const staticAccountLabelSelector = staticAccountSectionSelector + " [data-vault-dashboard-account-section-label]";
		const staticAccountContentSelector = staticAccountSectionSelector + " [data-vault-dashboard-account-section-content]";
		const signedOutSelector = staticAccountSectionSelector + " [data-app-auth-prehydration-signed-out]";
		const signedOutLabelSelector = staticAccountSectionSelector + " [data-app-auth-prehydration-signed-out-label]";
		const signedInSelector = staticAccountSectionSelector + " [data-app-auth-prehydration-signed-in]";
		const signedInEmailSelector = staticAccountSectionSelector + " [data-app-auth-prehydration-email]";
		const signedInProviderSelector = staticAccountSectionSelector + " [data-app-auth-prehydration-provider]";
		const passwordAuthSectionSelector = "[data-testid=" + cssStringLiteral(args.passwordAuthSectionTestId) + "]";
		const styleElement = document.createElement("style");
		styleElement.id = args.styleElementId;
		styleElement.textContent = `
html[${args.rootAttribute}="signed-out"] ${accountLabelSelector} {
  color: transparent !important;
  position: relative !important;
}

html[${args.rootAttribute}="signed-out"] ${accountLabelSelector}::after {
  color: hsl(var(--foreground));
  content: ${cssStringLiteral(presentation.label)};
  display: block;
  font-size: 0.875rem;
  inset-block-start: 0;
  inset-inline-end: 0;
  inset-inline-start: 0;
  line-height: 1.25rem;
  overflow-wrap: anywhere;
  position: absolute;
}

html[${args.rootAttribute}="signed-out"] ${staticAccountLabelSelector} {
  display: none !important;
}

html[${args.rootAttribute}="signed-out"] ${staticAccountContentSelector} {
  display: block !important;
  margin-top: 0 !important;
}

html[${args.rootAttribute}="signed-out"] ${signedOutSelector} {
  display: block !important;
}

html[${args.rootAttribute}="signed-out"] ${signedOutLabelSelector}::after {
  content: ${cssStringLiteral(presentation.label)};
  display: block;
  overflow-wrap: anywhere;
}

html[${args.rootAttribute}="signed-in"] ${accountLabelSelector} {
  color: transparent !important;
  position: relative !important;
}

html[${args.rootAttribute}="signed-in"] ${accountLabelSelector}::after {
  color: hsl(var(--foreground));
  content: ${cssStringLiteral(presentation.label)};
  display: block;
  font-size: 0.875rem;
  inset-block-start: 0;
  inset-inline-end: 0;
  inset-inline-start: 0;
  line-height: 1.25rem;
  overflow-wrap: anywhere;
  position: absolute;
}

html[${args.rootAttribute}="signed-in"] ${staticAccountLabelSelector} {
  display: none !important;
}

html[${args.rootAttribute}="signed-in"] ${staticAccountContentSelector} {
  display: block !important;
  margin-top: 0 !important;
}

html[${args.rootAttribute}="signed-in"] ${signedInSelector} {
  display: block !important;
}

html[${args.rootAttribute}="signed-in"] ${signedInEmailSelector}::after {

```

## Question 8

### Exact Evaluated Prompt

```text
Read https://samebase.com/llms.txt, then answer this question: If Samebase shuts down tomorrow, what happens to my app?
```

### Command

```sh
(cd /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q8.ZhtgBa && codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -C /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q8.ZhtgBa --sandbox danger-full-access --output-last-message /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q8.ZhtgBa/final.txt "$prompt" < /dev/null)
```

### Temp Directory

```text
/tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q8.ZhtgBa
```

### Exit Code

```text
0
```

### Final Answer

```text
If Samebase shuts down tomorrow, your running app does **not** stop.

Per Samebase’s `llms.txt`, apps created through Samebase live in **your own GitHub, Convex, and Cloudflare accounts**. Samebase is the control plane, not the runtime host. Deleting your Samebase account also “does not stop a running app.”

What you would lose is Samebase’s dashboard/MCP control-plane convenience for provisioning, wiring, retrying, and managing the stack. Your code, backend, hosting, builds, and provider resources remain with you.

Source: https://samebase.com/llms.txt
```

### Session Output

```text
Reading additional input from stdin...
OpenAI Codex v0.133.0
--------
workdir: /tmp/samebase-agent-landing-codex-clean-stdin.cWFc3w/q8.ZhtgBa
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019f3d74-abaf-7ec1-8f1e-d99aa0bacd34
--------
user
Read https://samebase.com/llms.txt, then answer this question: If Samebase shuts down tomorrow, what happens to my app?
web search:
web search: https://samebase.com/llms.txt
codex
If Samebase shuts down tomorrow, your running app does **not** stop.

Per Samebase’s `llms.txt`, apps created through Samebase live in **your own GitHub, Convex, and Cloudflare accounts**. Samebase is the control plane, not the runtime host. Deleting your Samebase account also “does not stop a running app.”

What you would lose is Samebase’s dashboard/MCP control-plane convenience for provisioning, wiring, retrying, and managing the stack. Your code, backend, hosting, builds, and provider resources remain with you.

Source: https://samebase.com/llms.txt
tokens used
10,257
If Samebase shuts down tomorrow, your running app does **not** stop.

Per Samebase’s `llms.txt`, apps created through Samebase live in **your own GitHub, Convex, and Cloudflare accounts**. Samebase is the control plane, not the runtime host. Deleting your Samebase account also “does not stop a running app.”

What you would lose is Samebase’s dashboard/MCP control-plane convenience for provisioning, wiring, retrying, and managing the stack. Your code, backend, hosting, builds, and provider resources remain with you.

Source: https://samebase.com/llms.txt

```
