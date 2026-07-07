# Samebase Pitch Language

Positioning language for spoken and written pitches, drafted by a third party (Claude Fable 5
session, 2026-07-06) after the RFC 093 research pass over the specs, receipts, competitor notes, and
the landing-copy interview. Companion to `research/2026-07-02-landing-copy-interview.md` and
`rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`. Every factual beat below is receipts-backed
(`apps/samebase/src/content/docs-receipts.md`); if a receipt dies, retire the beat.

The diagnosis behind all of it: Samebase is hard to explain because it fits no existing category,
and every category people reach for — app builder, host, backend platform — misleads. Describe it by
**position**, not category: it sits between the user's coding agent and the three providers, sets
everything up on accounts the user owns, and then deliberately stays removable.

## One-liners, by situation

- Distilled: "Samebase deletes the gap between 'my AI wrote an app' and 'my app is live, mine, and
  costs nothing while idle.'"
- For developers: "One action provisions a real app — GitHub repo, Convex backend, Cloudflare
  Worker, CI wired — on your own accounts, from a dashboard or from your agent over MCP. We host
  nothing."
- The anti-builder: "Every app builder wants your app living inside their platform. Samebase sets it
  up on your accounts and gets out of the way — delete us and your app keeps running."
- The tool-inside-tool (from the landing interview): "It's not an AI that builds apps. It's the tool
  your AI uses to ship real ones."
- Designed-backward: "App builders sell you minute one. Samebase is designed backward from month
  twelve — still yours, still $0 idle, still fixable from your phone."
- The name, unpacked: "Same base, three ways: every app on the same stack, the same stack Samebase
  itself runs on, and the same definition of every action for humans and agents."

## 30-second elevator

Coding agents can write a whole app now — the unsolved part is making it real: a repo, a backend,
hosting, deploy keys, previews, all wired together. Samebase does that part in one action, on your
accounts — GitHub repo you own, Convex backend in your team, Cloudflare hosting under your name —
and your agent can do it too, through the same actions you'd click. We're not another chat builder:
idle apps cost $0, and if you delete your Samebase account tomorrow, the app keeps running. We know,
because Samebase runs on Samebase.

## The four-minute pitch (speakable beats)

**Hook.** "Can I show you something weird about app builders? None of them are built in themselves.
If an AI chat box is really the best way to build software, why is nobody building their company in
one? Samebase is built in Samebase — first customer was me. That's not a gimmick, it's the whole
idea: the way I ship my own product is the product."

**Problem.** "Coding agents can genuinely write a full app now — writing is close to solved. What's
not solved is everything around it: git repo, real database, hosting, build pipeline, deploy keys,
previews. That's five accounts and an afternoon if you know what you're doing, and a wall if you
don't. The industry's answer was walled gardens: chat in our box, and your app lives on our
infrastructure, at our prices, until you 'export' — which nobody really does."

**The move.** "Samebase does the opposite. One action — a click, or an MCP call from your own agent
— and you get a real app: a GitHub repository under your account, a Convex backend in your team, a
Cloudflare Worker on your account, wired so pushing deploys and PRs get previews. About a minute. We
host nothing. We're the setup, the living record of how it all fits together, and the repair actions
when something drifts."

**Why this stack.** "It's opinionated on purpose, and every claim ships with a dated receipt you can
check. Cloudflare serves static assets free and unlimited on every plan — an idle idea costs $0 a
month. Convex's database is only reachable through server functions, so the 'app builder left my
database open' breach class — the one that keeps making headlines — can't even be expressed. And
it's typed end to end, which used to be taste and is now leverage: typed code is what agents are
best at not breaking."

**Agent-native.** "Everything a human can click, an agent can call — same actions, same definitions;
our status responses literally name the action that fixes what's broken. We take it far enough that
the marketing works this way too: the landing page tells you to ask your coding agent about
samebase.com, and we publish the receipts so the agent can verify us instead of trusting us."

**Trust close.** "Our design test: delete your Samebase account — nothing happens to your app. We
even publish the full do-it-yourself recipe for the identical stack with no account at all. If we're
only valuable because leaving hurts, we've failed. We want to be worth it because one-minute setup,
a phone dashboard for every app, and agent-operable everything is just worth it."

**Ask.** "If you already use a coding agent and want what it builds to be real and yours — that's
who this is for."

## The no-jargon version

"You know how AI can write apps now? The part that's still annoying is making what it writes real —
actually online, on your own accounts, cheap to keep. I make that one click. And unlike the
app-builder startups, the app is actually yours — you could delete my product and your app wouldn't
notice."

## Defensive answers

- "So it's like Lovable?" — "Opposite direction. They optimize your first ten minutes; the app lives
  in their platform. We optimize year two: your app starts in your GitHub, and you keep using
  whatever coding agent you already have — which is better than any in-app chat anyway."
- "So you're a host?" — "We host nothing. Cloudflare hosts, Convex runs the backend, both bill you
  directly. We're setup, status, and repair."
- "Why would I pay you?" — "The knowledge is free — we publish the whole manual recipe. You pay for
  the compression: one action instead of an afternoon, previews and repair from your phone, and
  tools your agent can operate."

## Anti-patterns

- Never open with "it's like X but…" — it concedes the category and invites a feature comparison in
  the competitor's frame.
- With non-developers, never lead with the stack names; lead with ownership and $0 idle, and name
  the providers only when asked.
- Never say "platform" without immediately disclaiming hosting; the ownership story dies the moment
  the listener files Samebase under "hosts my app".
