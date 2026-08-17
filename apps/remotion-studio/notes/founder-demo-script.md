Samebase is just an opinion.

That opinion is that all you need to build any web app is Convex and Cloudflare workers. That's all.

When the Convex backend became open source in 2024, I started treating it as a serious option.

And ever since then, I've been preaching it to all my friends and family.

Unfortunately, not everyone in my family is a full-stack engineer, so this had limited impact.

But then AI got good at building software.

You can tell an agent what you want, and it can deal with most of the technical details.

But those details still matter.

And I think YOUR agent should use the same tools I would choose for myself.

So that's why I built Samebase.

<open web browser>

I already use Samebase for all my ideas and apps.

You just connnect Github, Convex and Cloudflare, and you're good to go.

We can provision an app right here and now.

<probably long pause for provisioning>

<opens codex>

But of course, nobody really uses browsers anymore.

That's samebase is made to also be used by your agent.

<probably long pause for provisioning + developing>

---

// The screen shoudl contain a tldraw with the db<->server<->frontend

Ever since I was a young child, I wanteed to figure out the best way to build fullstack b2b
web-apps.

And people told me just to get started, and that the tech doesn't matter, doesn't matter if it's
django, or rails, or express, whatever

That disdain for the tools I'm supposed to use every day, seemed strange

Around 2017 I started working in Typescript slowly I realized that you don't really need another
language.

Simplified, any web-app is composed of a db a server and a frontend. But this diagram contains 2
other pieces that are very important and not usually represented, but they usually add the most
accidental complexity.

let's say you use postgres, then you'll need to somehow interact from your server with it. I know
that currently the code is written by LLM agents, but that doesn't change the problems, it just
postpones them.

There are a dozen ways to interact with a postgres Prisma, TypeORM, Knex, Drizzle, kysely, etc.

And then you have to decide what you use for the server. There are lots of different modern Express
alternatives: Hono, NestJS, Fastify

But then you also have to think how to connect the server to the frontend in a type-safe way

tRPC is the current standard for doing this nicely, but there are other REST-centered alternatives
like TS-REST

And for the frontend you can probably choose whatever you feel like, React is usually fine enough.

And this are just decisions that have to be made without taking into account the developer/agent
experience

- Can I start the app locally with a local DB to work on it
- What's the process of deploying it
- Do I need something like Docker to deploy it?
- Would it be possible to create a separate preview deploy for each PR?

Of course since forever there was a lot of effort to provide a simpler way. I've worked several
years with MeteorJS and even though at that time it was considered a bit old-tech it was a decade
ahead of the Javascript ecosystem.

Ever since I've tried finding a replacement, I even tried creating replacement myself (without
really getting anywhere)

And then I tried Convex.

Comparing Convex to other managed database providers like Supabase doesn't do it justice

Convex cover 4 out of the 5 pieces of the puzzle, you only need to choose what fronend you want to
use and where to host the frontend.

I started taking it seriously 2 years ago when it went open-source.

So I started preaching to people I met about convex and how it's so easy and good.

But nobody would believe me, and so to prove my point I created Samebase.

At it's core, Samebase it's just an opinion.

That opinion is that "Convex + Cloudflare workers is the best way to create web apps".

Once you accept that you can stop making technical decisions, and just focus on building as much as
you want.

Some people might say that "best" is subjective but I base it on whether it covers the most
use-cases.

I moved most of my projects to Samebase already. I left some on their previous platform so that
maybe I can make a video about how I move them later on.

Samebase doesn't really fit in the category of App builders since it doesn't try to be a golden
cage. I made it for myself first, and my engineer friends seconds.

And friends are not funnels. It's important to have a good, transparent tool from the get-go.

---

The problem with existing app builders is 2-fold

1. They try to cover ALL spectrum of app building. As an engineer I then have to figure out how to
   use their internal system instead of relying on editors or patterns that I'm already familiar
   with.
2. The pricing is not realistic. Most app builders buy tokens and then resell them to their
   customers. As an engineer I already know about codex or claude or cursor, I can't pay a few
   hundred bucks more for another app-builder. I'd rather use my existing tools. And their tokens
   are not subsidized, so they have to sell them at a higher price.
3. They lock your data or code in their platform, and it's not trivial to get out. Or you need to
   pay more to get Github integration.

So Samebase is basically what happens if you'd take an app-builder and then remove everything that
can already be solved externally.

---

For a long time people would say to me, just use Django, just use Rails. The tech doesn't matter. I
always felt that's not true, that tech does matter. That there is a way that is objectively easier,
cheaper, safer to do things.

And the existence of Samebase is my proof after all these years.
