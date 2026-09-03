I asked Codex to figure out the main problems that we encountered while building Samebase so that we
could figure out the best prompt I can give you, and I realised that all of them have point to the
same thing (base 😁 if you will). Here are some the top 3 out of a total of 5. The last 2 are about
panes layout and big agent context, which are not that important to thing I'm thinking right now.

```md
I’m working on Samebase: a Convex + Cloudflare Workers + GitHub app provisioning/control plane.

The hardest current problem is that create-app, imported repos, manual Worker attachment, manual
Convex attachment, Workers Builds configuration, Convex deploy-key rotation, retry, preview status,
and cleanup have drifted into separate paths. Prior agents repeatedly hit issues around the old
ensure_cloudflare mega-step, wrong-repo trigger adoption, preview deploy keys, Cloudflare build
variables, and dashboard states that look incomplete after successful provisioning.

Task: decide the final provisioning architecture. Do not implement. Produce one recommended state
model and execution graph.

Use these local anchors:

- archive/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md
- archive/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md
- specs/096_INITIALIZING_REPOSITORY_GITHUB_PROVISIONING_SPEC.md
- specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md
- specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md
- specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md
- research/2026-06-25-noter-guest-create-app-manual-test.md
- research/2026-05-16-cloudflare-workers-build-preview-env-ui-gap.md

Deliverable:

1. the final block graph
2. durable state shape per provider resource
3. retry and ownership/locking rules
4. exact failure boundaries
5. what to delete from the old model
6. implementation phases with the first PR slice
7. edge cases that would invalidate the design

Give a recommendation, not a survey.
```

```md
I’m deciding Samebase’s public product strategy.

Samebase is not trying to be another in-app AI chat builder. The thesis is: start from real
engineering workflows, simplify them, and make every AI coding tool able to create and operate real
apps with GitHub ownership, Convex backend, and Cloudflare Workers hosting. The app should be usable
from Codex/Claude Code/MCP, but serious development remains in the user’s coding agent or local
repo.

Use these anchors:

- research/2026-07-02-landing-copy-interview.md
- research/2026-07-02-landing-copy-receipts.md
- recent competitor-watch findings: Vercel Services/Agent Runs, Bloom Expo+Convex, Freebuff/Vly,
  cto.new, Convex Chef
- prior discussion themes: ChatGPT cannot reliably mutate GitHub repos unless Samebase exposes write
  tools; local Codex/Claude Code is the serious workflow.

Task: decide the sharpest product wedge and launch story.

Deliverable:

1. one primary audience
2. one homepage promise
3. what Samebase should explicitly not be
4. which proof demo should ship first
5. whether to name competitors directly
6. how hard to lean on Convex security and Cloudflare ownership
7. what features are mandatory before public launch
8. what features are distractions
```

```md
Samebase needs humans and agents to understand the same operational actions: create app, connect
Worker, connect Convex, configure Workers Builds for GitHub, rotate Convex deploy keys, retry
provisioning, clean previews, list apps, open PR/deploy status.

We have discussed an action-contract catalog: docs that are human-readable, raw-file/public-repo
accessible, and also exposed through MCP resources/tools. The risk is duplicating Convex function
validators, MCP tool schemas, UI copy, plugin docs, and public docs until they drift.

Use:

- rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md
- samebase/plugin context from prior work
- the recent public-docs/export discussion
- docs/artifacts/samebase-base/\*
- archive/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md

Task: design the minimum durable action-contract system.

Deliverable:

1. source-of-truth file/code shape
2. how Convex function contracts map to MCP tools
3. how docs are exported to a public raw repo without losing monorepo benefits
4. how Claude/Codex plugins consume the same contracts
5. what not to expose through MCP yet
6. first two actions to implement end-to-end
```

---

Now that you read these, here's my view and my idea (that I think is a bit influenced by
https://github.com/BuilderIO/agent-native)

the idea is that we could change our landing page to be just something like "Ask
Codex/Claude/Cursor/ etc. about samebase.com"

even better we could play more on this idea and have create a screenrecording where I open lovable,
converge.dev, etc. and ask "should I use samebase.com or lovable.dev"

and the whole idea is that agents should be able to read the real explanation what samebase.com
provides and what it is. The thing is it may be hard to pinpoint exactly what it is. The main thing
we provide is the knowledge that the best way to build a web app (or even mobile app really) is by
using convex + deploy to cloudflare workers. This conviction is what made we do this.

Maybe I got to fast to this idea now, the last big project we worked on, we reworked how we
provision fully or partially the necessary resources. And even now the UI would probably need some
fixing to make it really clear. But if I would take the time, I could explain that the whole idea is
that convex + cloudflare workers is the best way to build something fast and safe and be sure that
it scales. And everything else around that idea is what samebase.com is or tries to be. So then
comes the idea that there should be the same definition between an UI action, API, MCP, etc.
basically what Agent-Native provides.

the idea that if we'd give the same shittty UI to Codex it could figure it out and make things work.

But if we take this idea to its final destination we realize that we can apply the same principle
globally, in that the landing page is hard to create a compelling UI to explain to a human why our
template/knowledge is better than lovable. But explaining it to an agent is much simpler since we
can provide receipts, we can pinpoint direct documentation of supabase, or netlify or other things
and explain why cloudflare workers is cheaper for assets (free actually). And we can explain why
convex is much better than supabase or firebase or whatever else. etc.

so if we distill everything we get to a landing page where the main slogan is basically instructing
users to ask their chatgpt or codex or claude about samebase.com and all we have to do is actually
provide all the necessary details and knowledge

so that this is much more transparent than relying on a big marketing team that tries to appeal to
humans that don't always have the time to research this in depth.

So after saying all this, I'm not even sure what your goal should be. I guess I would like you to
absorb everything I just said and then go ahead and research the specs, the documents, because some
of the prompts that I linked above contain specs and refs and RFCs research. Then probably help me
make a plan or some guide about how to achieve this idea, because this would also mean that we will
probably have to implement something like [auth.md](https://workos.com/auth-md) where we allow
agents to create accounts. But even regarding accounts, if we provide knowledge, we can just tell
people that, "Hey, you don't necessarily need an account. You can just use Cloudflare and Convex and
create an account." The reality is that, compared to other app builders, building a single app is
kind of solved. With the knowledge that we provide, you then just pay for codes or cloud and you
build your app.

I guess what we provide is something much more specific and just a comfortable web tool that you can
use on your phone to check on other projects. You can use subagents if you need to research
something and you don't want to spend all the Fable 5 tokens on reading code, because we have 10% of
Fable 5 left. I need you to spend all your effort, all your high effort, thinking about these ideas
and give me some guidance. Maybe you need to research what specifically you need to give me, or how
to approach this idea, or how to change the direction of this project.
