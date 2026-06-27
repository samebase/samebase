# The correct<sup>✱</sup> way to build web apps

Samebase creates real web apps from your own GitHub, Convex, Cloudflare, and OpenAI accounts. It
chooses the same stack it runs on, then leaves you with a normal repo and normal infrastructure.

> ✱ Correct means the default is honest about its stack, cheap to leave running, simple enough to
> understand, and transparent enough to replace.

## What Samebase is

Samebase is an app builder and operations surface for small real web apps. It connects your accounts
once, creates the repo, provisions the backend and deployment, and keeps the app editable from the
browser.

The goal is not to hide web development behind a toy. The goal is to choose a stack where the simple
path is also the path you can keep using if the app starts to matter.

## Why "samebase"

Samebase uses the exact same technologies it recommends. If an app builder's recipe is correct, it
should be able to build and run itself on that recipe.

## What "correct" means

### Same stack

Samebase is built on the same base it gives users. That keeps recommendations grounded in daily use
instead of partner pages or marketing copy.

### Cost follows usage

A forgotten app should not become a monthly tax. A personal app used once a week should not cost the
same as an app used by a team every day. Testing an idea should not cost $20. It should not even
cost $3/month just because the idea exists. Samebase optimizes for infrastructure that can sit close
to $0 while idle and scale when people actually use it.

### Simple does not mean toy

Simplicity means fewer moving parts, fewer private conventions, and less operational state you have
to remember. Convex is the center of that choice: one realtime backend, one database model, and a
deployment flow that stays understandable as the app grows.

### Transparent and replaceable

The first user is me. The next users are friends. Only after that come people I do not know. That
order forces Samebase to be transparent: apps should be inspectable, deletable, and useful even if
Samebase disappears.

Samebase is not asking you to pay for a mystery box. It exists because I needed this workflow for my
own apps, and sharing the parts that do not add meaningful cost should not require pretending they
are expensive.

## Do it yourself

The manual setup steps live at [Do it yourself](/landing/do-it-yourself). They stay separate because
they are proof, not the landing page.
