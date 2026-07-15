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

## One base, more than one shape

The production repo is deliberately less uniform than the starter: one monorepo ships the product, a
first-party analytics proxy, and domain routing as three separate Cloudflare Workers. Its Convex
backend also sends transactional email through Cloudflare Email Sending. The starter stays small;
the platform does not force every root into the same shape.

## The proof

The template lives in the samebase/app repo, private today and public at release. The early commits
were each crafted by hand to keep it as simple as it claims: you can read the template like a story,
one small decision at a time.

## The rest

- Why the base is GitHub, Convex, and Cloudflare: the [Overview](/landing-preview).
- Build everything by hand, with no Samebase account: [Do it yourself](/docs/do-it-yourself).
