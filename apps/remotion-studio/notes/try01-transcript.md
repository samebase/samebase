# `try01` working transcript

- Source: `try01.mov`
- Duration: `31:59`
- Recorded: 2026-08-16
- Transcription: Local `mlx-community/whisper-large-v3-turbo`
- Status: Machine transcript. Timestamps are approximate. Clear product and technology names are
  corrected. Unclear text is marked.
- Privacy: The video and audio were processed on this Mac. They were not uploaded.
- Script relation: This follows the recording, not [the planned script](./founder-demo-script.md).

## Recording outline

- `00:00-05:42`: The accidental complexity of a database, a backend, a frontend, and both
  connections.
- `05:43-08:21`: Meteor.js, the search for a replacement, and why Convex is different.
- `08:22-10:10`: Samebase as an opinion about Convex plus Cloudflare.
- `10:11-14:06`: Create an app, inspect its GitHub, Convex, and Cloudflare resources, then remove
  it.
- `14:07-20:02`: Use Samebase through Codex, complete the browser handoff, correct the agent, and
  wait for the dolphin demo.
- `20:03-25:13`: Folders, no lock-in, reconnecting a repository, monorepo support, and deterministic
  resource detection.
- `25:14-29:39`: Run locally, create a pull request, watch the preview build, and open the dolphin
  result.
- `29:40-31:59`: Closing argument, mobile use, honesty, and the Samebase recommendation.

## Transcript

**[00:00]** Ever since I was a young child I wanted to figure out the best way to build full-stack
B2B web apps.
<!--
**[00:11]** And for a long time people have told me to just get started and just use whatever. Use
Django, use Joomla, use Rails.

**[00:21]** and that for me that disdain that I've seen for the tools that I'm supposed to use every
day seemed strange

**[00:34]** around 2017 I started to use TypeScript and I slowly realized that you don't really need
another language -->

**[00:49]** A simple web app is composed, usually people tell me that it's composed of three parts.

**[00:59]** You have the database, the backend and the frontend.

**[01:06]** But usually what people don't say or don't see is that this diagram has two additional
parts.

**[01:18]** This line and this line.

**[01:23]** and usually the connection between the database and the server and the server and the
front end

**[01:31]** is the thing that adds the most complexity without adding any business logic so it's

**[01:41]** basically accidental complexity with no benefits. To make it more clear let's say

**[01:50]** well here I gave some example but most of them are just with Postgres but maybe

**[01:56]** use MongoDB. Doesn't really matter let's suppose that you use Postgres because a

**[02:02]** A lot of the people in my life use Postgres.

**[02:10]** And let's say for the backend use whatever. It doesn't really matter.

**[02:18]** But then you have to make a very hard decision.

**[02:20]** You basically have to decide how you're going to talk between the backend and the
database.

**[02:26]** And these are just some

ember trying.

**[02:32]** And the good thing about having so much options is that you have fun every day.

**[02:42]** Each of them is broken in a slightly different way.

**[02:46]** Well not broken because a lot of people have spent a lot of time making them useful.

**[02:50]** but it's hard to find something that works for you and then you have to decide how you
would

**[03:01]** connect the back end to the front end and for the front end I didn't really write
anything you can

**[03:06]** just write whatever let's say react but it doesn't really matter if it's React or Vue or
SolidJS

**[03:15]** it's mostly the same thing but it's a new thing every six months so that's why it
doesn't really

**[03:21]** matter what does matter is how you connect the back end to the front end if you're a bit
older

**[03:35]** you probably use nothing you just send fetch request and then maybe you validate maybe
you

**[03:44]** a lot of people don't really care about what happens on the front end

**[03:49]** by the past few years approaches like tRPC and ts-rest which provide the very type safe
interface

**[04:02]** have popped up and

**[04:06]** and we have been used more and more.

**[04:11]** And as you can see we didn't even get too far, we are just building a to-do app but we

**[04:18]** already have to make so many decisions.

**[04:23]** And we didn't even get to the important part, to the part about how the hell we put this

**[04:34]** right? Because this idealized version is what is supposed to run in production. But the

**[04:41]** reality that most people except one have development machines where they test the code
instead

**[04:50]** of writing directly to production. So then you have to think can you start this app
locally

**[04:58]** to test it what's the process of deploying it do you need Docker or

**[05:05]** something like that would it be possible to have a preview deploy for each pull

**[05:12]** request so that you can share a link with your friends or with your product

**[05:17]** toner to show what you actually did and as you can see even something as simple

**[05:29]** as this makes you make a lot of decisions and you didn't even get started

**[05:35]** on the important parts

**[05:43]** almost 10 years ago in my career i worked for a bit well for several years with
Meteor.js

**[05:49]** which was probably a decade ahead of the JavaScript ecosystem but unfortunately now is
not

**[06:00]** as known. And Meteor.js tried to kind of bring all this together so that you have a

**[06:09]** single way of building apps. But you probably don't know about Meteor so unfortunately
it's

**[06:18]** not as popular, it's not as supported. And ever since I've used Meteor, I tried to find

**[06:33]** a replacement for it. I tried to find a modern approach that would bring me the same
efficiency,

**[06:39]** basically and then I tried Convex and I think a lot of people compare Convex to things
like

**[06:53]** Supabase or other managed databases but that doesn't really do justice but Convex
doesn't

**[07:04]** cover just this part of the database. It covers the database, the connection to the
database,

**[07:11]** the server, the server and the connection of the server to the frontend.

**[07:21]** And basically the only thing you have to choose is what you

**[07:26]** what you use for the frontend and you know as I said that doesn't really matter.
Although it

**[07:35]** usually pick and choose. And I started taking Convex seriously I think around

**[07:47]** two years ago when they decided to open source their backend. And I started

**[07:57]** preaching it to people that I met every day. I was trying to explain how easy it is, how

**[08:06]** you don't need to think about any of these things that I mentioned, you just basically

**[08:13]** create a Convex project and you have everything you need. But I always felt that people
don't

**[08:22]** believe me so and also to prove my point I build Samebase so what Samebase is

**[08:41]** Samebase is basically my opinion and that's all it is.

**[08:49]** That you can build 95% of any app.

**[08:54]** All the apps you want in just using Convex plus Cloudflare.

**[09:02]** Because you still need something to host your frontend.

**[09:08]** And there's a much bigger discussion why specifically Cloudflare.

**[09:13]** But in short this is, that's it.

**[09:17]** That's what Samebase is.

**[09:18]** Samebase is just my opinion about how you should build apps.

**[09:28]** And initially it kinda...

**[09:34]** they had even chat interface inside the app.

**[09:41]** But then I started to think what actually I personally use because the first user of

**[09:49]** Samebase was me and I almost put all my projects inside of Samebase.

**[10:00]** So even Samebase is managed inside the Samebase.

**[10:11]** And I guess the benefit of it is that you have this new app and you can just do
something like, let's say `tmp-my-new-cool-app`.

**[10:21]** It will check.

**[10:23]** This is a different thing. We might have a very long discussion.

**[10:27]** and then you press new app and then you get a fully provisioned GitHub repository

**[10:35]** Convex project and Cloudflare worker

**[10:39]** and it's not just about provisioning them production it also comes with

**[10:45]** preview deploys for each pull request it comes for instructions how to run it locally it
comes for

**[10:52]** or with instructions and scripts for running it in multiple worktrees

**[10:57]** so that you can run like 10 agents in parallel

**[11:01]** because that's a much simpler thing to do in Convex

**[11:04]** as opposed to having, you know, putting Postgres in several Docker instances

**[11:11]** and then managing that

**[11:17]** And also Samebase is, I know there's a lot of stuff happening, but it's mostly because

**[11:25]** I have a lot of projects, but basically all my projects are now Samebase, because that's
another thing.

**[11:34]** I'm not the first person that realized that Convex is the best thing that happened in
the JavaScript ecosystem.

**[11:44]** And there are a lot of other app builders.

**[11:51]** But in my opinion, if I believe that Convex is the best thing, that means that Convex

**[11:57]** is the best thing and I need to build all my stuff in Convex.

**[12:01]** So I moved all my stuff to exactly the same stack basically.

**[12:09]** Here we can see the...

**[12:15]** Sorry, we can look at the settings.

**[12:17]** It created a GitHub repo.

**[12:27]** It created the Samebase.

**[12:28]** Okay.

**[12:29]** We were supposed to create it in my...

**[12:31]** yeah you can have you can manage multiple GitHub organization and for each of them you
can have

**[12:37]** its own Convex and Cloudflare provider an account there's a bit a lot there's a bit more
text that

**[12:47]** you'd be expecting from a simple app builder but the idea is that

**[12:54]** uh i use this information for myself to debug sometimes for example sometimes an

**[12:59]** an API token expires or sometimes your OAuth gets rejected.

**[13:04]** And you can just see that here you don't have to call support, you can ask your agent.

**[13:14]** So it created the repo, it provisioned the Convex project.

**[13:25]** It also provisioned the Cloudflare worker.

**[13:34]** And here you can just open it and probably have an app.

**[13:40]** It has a very basic authentication support, but I wasn't really sure about...

**[13:47]** Well, there's a lot of discussion there.

**[13:51]** So yeah, you can just build an app instantly.

**[13:56]** And you can even probably remove it because we don't really need it.

**[14:07]** And the cool thing is that you don't necessarily need to use it inside.

**[14:14]** I mean, I usually use it in the browser, but sometimes you can use it inside Codex.

**[14:21]** Because it also has a plugin, so you can say...

**[14:28]** By the way, let's try this one. browse samebase.com

**[14:35]** So there's a cool thing, even if you're not authenticated in the in-app browser,

**[14:40]** You can just say open Samebase.

**[14:48]** I should probably use medium fast.

**[14:56]** Yeah, let's do that.

**[15:03]** And then basically I have a handoff where it will generate using the MCP tooling token

**[15:10]** And then it will open the browser and it will do a handshake and then it will basically
log you in.

**[15:19]** So, Samebase doesn't really act like a standard SaaS that kind of tries to encompass how
you create apps.

**[15:29]** It mostly acts as a sort of tool that kind of fits into the cracks of how you build
apps.

**[15:37]** okay i'm looking at that uh great uh great yeah you can actually i have a video where
you

**[15:49]** in the landing page you can see a video of me creating an app but basically you can tell
to

**[15:56]** create an animation of beach and dolphins are jumping in the sunset. No mistakes. Use
Samebase.

**[16:22]** the plugin is still a work in progress because usually i

**[16:34]** usually see what problems i encounter and then i try to put that into skills

**[16:38]** and then i tell mr codex to start several subagent and test if that skill actually is
useful or not

**[16:54]** Okay, so

**[17:02]** Yes

**[17:12]** Okay

**[17:22]** This is another issue that the user experience is still a bit too technical but if you
are

**[17:34]** even a non-technical person but you have enough time to ask codex what does this mean

**[17:42]** it will probably explain to you but these are problems related to how Cloudflare workers

**[17:51]** work because the team with Cloudflare is constantly updating it and have to constantly

**[17:57]** keep up with what they add and what they don't yet have and this api token is one of the
things that

**[18:04]** It's still an issue.

**[18:15]** I'm not sure how good is Codex at building dolphins, but...

**[18:27]** Let's see.

**[18:29]** Okay, it created the... it has, by the way, it has access to the Samebase endpoints

**[18:42]** as tools that you have in the web.

**[18:44]** And sometimes it doesn't to some, but you can ask it and it can click because the web

**[18:49]** interface...

**[18:50]** I know it looks kind of strange, but it's specifically designed to work at not only
responsive

**[18:57]** sizes but ultra-responsive sizes so when you make it extremely small it still kind of
work

**[19:03]** you can make it even smaller.

**[19:07]** So yeah the idea was there's a lot of thought to put in every single bug that you see.

**[19:26]** Sometimes Cloudflare workers say build but it still needs a bit of time before it's
actually

**[19:31]** okay.

**[20:03]** I'll put it into small demos.

**[20:08]** This folder feature is something that I always wanted to have in GitHub.

**[20:15]** By always, I mean more than 12 years probably.

**[20:23]** And now I did it myself.

**[20:25]** so usually I try to not create a lot of features that are Samebase only just so

**[20:33]** that you're not locked in and this is different thing regarding looking for

**[20:40]** example the Samebase app is also managed from here but you can just go and remove

**[20:50]** vault. You will of course probably don't want to remove your repository and the data,
but

**[20:58]** you can remove the vault because the vault is just a connection. So that's one of the

**[21:06]** things, one of the cool things because I'm the first user. I created a lot of stuff that

**[21:16]** that you probably also want as a user because a lot of the app builders that I try to
use

**[21:24]** besides other problems like pricing they always try to lock you in somehow by you know
you

**[21:34]** have to pay additional money to have GitHub synchronization or stuff like that.

**[21:39]** Here is the other way around. I kinda let you come and go. My main bet, this is what

**[21:49]** I bet on with Samebase, is that I'll make building apps so easy that you'll probably

**[21:56]** want to build 5 apps, 6 apps, whatever. I mean you can build an app every day. Pricing

**[22:06]** is a different... okay so let's... we removed that but let's go to samebase where we
could

**[22:12]** connect an existing repository back so connect samebase. Of course it will not add the
workers

**[22:21]** manually automatically so you have to click this button and then it will search for
them.

**[22:28]** And as you can see it finds three workers with different root directories. This is
another

**[22:36]** engineer we have full monorepo support not just you know a list a table we

**[22:47]** actually have a list of repositories and every repository can be a monorepo

**[22:51]** with multiple databases multiple Cloudflare workers so let me connect them

**[23:01]** Here I have just three workers and I have a single, you should probably find it.

**[23:10]** Okay, I have to decide.

**[23:13]** Every project is slightly different.

**[23:18]** I can't expect every project to use exactly the same stack.

**[23:21]** so I have some checks, some deterministic checks, where I can basically figure out

**[23:30]** if something is probably a Convex project based on Convex JSON location or a Convex
folder.

**[23:39]** Okay, so we can add it.

**[23:47]** And you can see it kind of figured out that these are connected.

**[23:52]** [unclear technical identifier] uses 839.

**[23:54]** It's probably the ID of this thing.

**[23:58]** Samebase app.

**[24:02]** Yeah, there's a lot of interesting things, but the idea is that it's not just about,

**[24:10]** you're creating an app and you know be done with it it's about importing all your repos
here

**[24:21]** i imported a lot of

**[24:25]** trinkets that i built basically small ideas that i had i don't know 10 years ago

**[24:32]** that were kind of forgotten and now i just move them in their own folder and they have
like

**[24:43]** They have their own worker URL or whatever.

**[24:52]** There are still some bigger projects that I didn't completely merge because I want to

**[24:58]** probably make a video to showcase how you can take something that's deployed to Netlify

**[25:03]** and move it to samebase so I can use that as a case study in the future

**[25:14]** and also it probably tries to let's see

**[25:23]** Run it locally so I can see it.

**[25:27]** It of course can run, we'll publish it and publish you will see the production URL.

**[25:36]** You will also see for each pull request its preview deploy.

**[25:45]** For example here you can see we have this at work attachment removal action.

**[25:50]** you can see a branch preview, right? That's extracted from the... Okay, it opened and
it's beautiful, right?

**[26:03]** You can see it's the local version. Okay, create PR.

**[26:14]** slow evening on the edge of the wall yeah Codex got very good at creating

**[26:21]** you know aquatic stuff in the last past few months

**[26:26]** I think you're seeing samebase.com.

**[26:40]** The UI still needs a bit of work and kind of still moving things around so don't judge
too harsh please.

**[26:56]** Nice it created 23 tests and that's exactly what we needed right now.

**[27:00]** So, let's see.

**[27:40]** You can also theme your...

**[27:45]** Let's change the background to something more...

**[27:55]** More...

**[27:57]** This is enough.

**[28:00]** Okay, so we have the pull request here.

**[28:06]** Okay, I'm logged in, created a draft.

**[28:12]** And you can see that the worker already started building it.

**[28:31]** And you should get…

**[28:36]** Where is our…

**[28:37]** Here, okay.

**[28:42]** So you see the branch preview.

**[28:45]** you get, well, Cloudflare workers does this as do others, as it does Netlify probably
yourself or whatever.

**[28:59]** But yeah, you got the beautiful dolphin scene and then you can just go to the pull
request and squash.

**[29:23]** I still sometimes need to refresh.

**[29:29]** I'm working on that.

**[29:33]** Not logged in here, but you get the main idea.

**[29:40]** So yeah, that's... let's reset the colors.

**[29:46]** That's a kind of preview of what Samebase is.

**[29:52]** Once you accept Convex in your life, you should probably really think about using
Samebase.

**[30:01]** Maybe it's not useful if you have a single app or maybe two apps, but once you start

**[30:09]** creating stuff, I recommend thinking about it.

**[30:15]** Also you can ask your agent about this, because usually agents can research everything I
say

**[30:22]** and they can test if I'm lying or not.

**[30:36]** That's why I usually use it in the browser. By the way, the UI looks a bit strange

**[30:43]** just because it's in a browser, but I recommend opening it, opening Samebase

**[30:48]** inside your phone browser because I tested both on my iPhone and my Android phone just

**[30:56]** to make sure it works perfectly.

**[31:00]** That's by the way one of the reasons I have a URL bar here.

**[31:06]** Maybe you've seen some secrets there.

**[31:10]** Because you can basically jump around the app even though I didn't create a button
specifically

**[31:19]** location key for the sunset this is the beautiful so yeah that's Samebase same

**[31:35]** base uses uses the Samebase that Samebase

**[31:37]** recommends so you should think if you're a current app builder this is the Samebase

**[31:46]** they recommend maybe they do maybe they don't i don't know

**[31:55]** thank you for listening and goodbye
