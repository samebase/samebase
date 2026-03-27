# Public Landing Builder-Intent Intake Research

Date: 2026-03-27

## Why This Document Exists

The public Noter landing page currently has a classic email-only `Join Waitlist`
form. The goal of this memo is to research a better alternative for the current
moment: a public prompt that invites people to tell us what they would want to
make with `noter.md`, while making email optional.

This is not just a copy tweak. It changes the framing from:

- access scarcity
- queue management
- "we will contact you when a spot opens up"

to:

- active development
- learning what real people want to do with `noter.md`
- creating a lightweight path for follow-up without making contact info the
  price of participation

## Why This Lives In `docs/research`

This is exploratory product and messaging research. It does not define an
accepted runtime contract or implementation plan yet, so it fits better in
`docs/research/` than in `specs/`.

## Current Noter State

Today the public landing flow is explicitly a waitlist:

- `apps/noter/src/SignInForm.tsx` renders a `WaitlistForm` with one required
  email field and `Join Waitlist` button text.
- `apps/noter/convex/schema.ts` stores a `waitlist` table with `email` and
  `createdAt`.
- `apps/noter/convex/waitlist.ts` deduplicates by normalized email and stores
  only the email.
- `apps/noter/convex/waitlistActions.ts` emails the operator with
  `New waitlist signup`.
- `apps/noter/src/content/privacy-policy.md` and
  `apps/noter/public/privacy/index.html` describe waitlist data collection.
- `apps/noter/src/App.tsx` also uses waitlist wording for unapproved signed-in
  users: `You're on the waitlist`.
- `apps/noter/src/bootstrap.ts` and
  `apps/noter/e2e/public-landing-shell.spec.ts` are built around the current
  email-first landing shell and hydration handoff.

So if we change the public form, the product should stop pretending this is only
one button-label change. The message, data model, notification copy, privacy
copy, and some approval-state language are all tied to the current framing.

## Research Questions

1. Is there a better public-facing framing than `Join Waitlist` for Noter's
   current stage?
2. Should the primary input be an open message instead of an email?
3. Should email be optional?
4. What wording best supports "I'm actively building this" without sounding
   gated, needy, or fake-founder polished?
5. What is the smallest v1 that gives useful signal without turning the landing
   page into a survey tool?

## External Pattern Research

### 1. Wabi mixes waitlist gating with idea capture

Wabi's public/app pages are useful because they do not rely on waitlist as the
only story. Their product framing pairs waitlist mechanics with app-idea
sharing, which is a strong example of treating contribution as a signal of
intent instead of treating email capture as the entire relationship.

Relevant source:

- [Wabi app page](https://wabi.ai/%40anna/positive-thought-reframer-1020039)

Takeaway for Noter:

- the interesting part is not the waitlist itself
- the interesting part is that idea-sharing becomes a signal of intent
- Noter can borrow the "show me what you want to make" energy without copying
  Wabi's exact wording or social mechanic

### 2. Builder tools increasingly lead with intent, not signup mechanics

Lovable's ChatGPT page repeatedly frames the interaction around describing what
you want to create and turning brainstorms into something real. That is useful
because it keeps the user's goal in the foreground instead of the vendor's
funnel mechanics.

Relevant sources:

- [Lovable ChatGPT app page](https://lovable.dev/chatgpt-app)
- [Replit Design docs](https://docs.replit.com/replitai/design-canvas)

Takeaway for Noter:

- a builder-facing landing page can feel alive and specific when it starts from
  user intent
- `What are you trying to make?` is stronger than `Join Waitlist`
- the landing CTA can sound like the beginning of collaboration, not a mailing
  list transaction

### 3. Open-ended questions are better for discovering the "what" and the "why"

Contentsquare's survey guidance is useful here because it argues for open-ended
questions when you want richer qualitative signal in the user's own words, not
just categorical responses.

That matches Noter's goal better than a pure waitlist because the point is to
learn what people are actually trying to do, not only whether they are willing
to hand over an email address.

Relevant sources:

- [Open-ended questions guidance](https://contentsquare.com/blog/open-ended-questions/)
- [Survey sentiment analysis guide](https://contentsquare.com/guides/sentiment-analysis/surveys/)

Takeaways for Noter:

- an open text prompt is the right input if the goal is product learning, not
  just lead collection
- wording should stay neutral and specific
- the form should ask for one real thing, not a stack of marketing fields

### 4. Short forms still matter, but "fewer fields" is not the whole story

Survicate's response-rate guidance says `1-3` questions are the optimal range
for strong completion. Unbounce's landing-page testing guidance adds a more
useful nuance: fewer fields do not automatically win, and when contact
information is needed, more threatening personal fields should come later.

Relevant sources:

- [Survicate response-rate guidance](https://help.survicate.com/en/articles/4118514-how-to-get-more-people-to-take-a-survey-maximizing-response-rate)
- [Unbounce landing page testing](https://unbounce.com/landing-pages/landing-page-testing/)

Takeaways for Noter:

- a short message field plus optional email is still within a low-friction form
- email should be visually secondary and placed after the main prompt
- if we ever expand the flow, contact info should remain the last step, not the
  first

## Recommendation

Replace the public `Join Waitlist` form with a small builder-intent intake.

The recommended v1 shape is:

1. Required open text message
2. Optional email field
3. Button that sounds like contribution, not queuing

This should be framed as:

- "I'm actively building noter.md"
- "tell me what you're trying to make / write / ship"
- "leave your email only if you want a reply"

This is better than the current waitlist for three reasons:

1. It matches the real stage better. The operator wants signal and conversation,
   not passive list growth.
2. It produces higher-value product input than email-only capture.
3. It lowers the emotional cost of participating because users can contribute
   anonymously or semi-anonymously.

## Recommended Copy Direction

### What Not To Lead With

Avoid centering the form on:

- `Join Waitlist`
- `Request Access`
- `Reserve a spot`
- `Be the first to know`

Those all imply scarcity-first marketing. That may still be operationally true
in the approval flow, but it is not the most useful public message for this
stage.

### Why `What would you build on noter.md?` is close but not quite right

This phrase is directionally strong, but I would not use it as-is for the main
prompt.

Pros:

- ambitious
- builder-centric
- invites imagination

Cons:

- `build` leans heavily toward apps and may underserve writing, notes, docs, or
  lightweight publishing use cases
- it can invite speculative ideas instead of immediate real workflows
- `on noter.md` can sound platform-first rather than problem-first

### Better Prompt Candidates

Recommended primary prompt candidates:

1. `What are you trying to make with noter.md?`
2. `What would you want noter.md to help you ship?`
3. `What are you building, writing, or publishing right now?`
4. `If noter.md existed for your workflow today, what would you use it for?`

My recommendation for v1:

- headline or label: `What are you trying to make with noter.md?`
- helper copy:
  `I'm actively building noter.md. Tell me what you'd want it to help with. Leave your email only if you want a reply.`

This keeps the prompt:

- specific enough to answer
- broad enough for notes, docs, apps, and publishing
- honest about the product still taking shape

### Button Copy Candidates

Best options:

- `Share idea`
- `Send note`
- `Tell me`

Avoid:

- `Submit`
- `Join`
- `Request invite`

My recommendation for v1:

- `Share idea`

### Success State Candidates

Recommended success copy:

- `Thanks. I'm reading these while noter.md is still taking shape.`
- `Thanks. This is exactly the kind of signal I want while building noter.md.`

If an email was provided, the success state can add:

- `If it makes sense, I'll follow up by email.`

## Recommended V1 UX

Keep it minimal and visible on the landing page:

- one multiline text field for the message
- one optional email field underneath
- one button

Recommended field order:

1. Message
2. Email (optional)
3. Submit

Recommended placeholder text for the message field:

- `A repo-native notes space for product docs, lightweight publishing, and small tools.`

Recommended placeholder text for the email field:

- `Email for a reply (optional)`

Why this shape is better than a hidden popover or pure email field:

- the primary action is immediately legible
- the page signals active listening, not passive capture
- the required field is the one that creates product insight

## Product And Implementation Implications

If this moves from research to implementation, the likely scope is:

### Public landing UI

- replace `WaitlistForm` in `apps/noter/src/SignInForm.tsx`
- update the fast shell in `apps/noter/src/bootstrap.ts`
- update the shell/hydration tests in
  `apps/noter/e2e/public-landing-shell.spec.ts`

### Data model

Current `waitlist` is too narrow for this idea. A better v1 table would be
something like:

- `message`
- `email?`
- `createdAt`

Optional but probably useful later:

- `source`
- `reviewedAt`
- `contactedAt`

Important note: I would not carry over the current email dedupe behavior as the
main model. When the point is learning, repeated submissions can be legitimate.
If dedupe exists at all, it should be soft and only for operational views.

### Notifications

`apps/noter/convex/waitlistActions.ts` would need to become message-aware.
Operator notifications should foreground the message and treat email as optional
metadata.

### Privacy copy

The public privacy page and markdown source would need to change from
`waitlist data` to something closer to:

- product feedback / builder-intent submissions
- optional contact information
- temporary in-memory landing draft state for the message and optional email

### Approval-state copy

Even if the landing page changes, signed-in unapproved users currently still see
`You're on the waitlist` in `apps/noter/src/App.tsx`.

If the product wants a consistent voice, that copy should likely become
something like:

- `Access is still limited`
- `Early access is still rolling out`
- `You're signed in, but access isn't enabled yet`

That can remain a separate decision, but the mismatch should be explicit.

## Suggested Rollout Order

If implemented, the cleanest order would be:

1. Replace public landing form and success copy
2. Change storage and operator notifications
3. Update privacy copy
4. Decide whether approval-state `waitlist` language should also change

## Bottom Line

Noter should stop using `Join Waitlist` as the primary public CTA for this
surface.

The stronger move is a builder-intent intake:

- required message
- optional email
- explicit active-development framing

The best v1 prompt is probably not exactly `What would you build on noter.md?`
but something very close to it that is broader, more grounded, and less
platform-marketing coded.

Recommended default:

- prompt: `What are you trying to make with noter.md?`
- helper:
  `I'm actively building noter.md. Tell me what you'd want it to help with. Leave your email only if you want a reply.`
- button: `Share idea`
