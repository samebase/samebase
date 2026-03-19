# Pricing page copy draft

Date: 2026-03-20

## Goal

Replace the current stiff/internal-feeling pricing copy with language that is:

1. honest
2. specific
3. calm
4. better suited to a public pricing page

The page should tell the truth:

- Noter is free by default.
- Private-code access is `$4.99/month`.
- Private-code access is manual and limited for now.
- The current next step is not checkout. It is email updates and access
  instructions.

## Writing principles

1. Lead with the default plan, not the paid plan.
2. Say exactly what the paid plan changes: Noter can work directly with private
   code.
3. Do not pretend the current flow is self-serve if it is not.
4. Avoid startup-cosplay language like `contact sales`, `enterprise`, `team`,
   `recommended`, or `coming soon`.
5. Avoid defensive copy like `while we validate workflows` in the hero. Keep
   that for supporting text.

## Recommended page copy

### Hero

# Pricing

Free to start. `$4.99/month` if you want Noter to work with your private code.

Noter is free by default. If you want direct help inside a private repository,
private-code access is `$4.99/month` and handled manually for now.

Right now, joining the paid path means getting milestone updates and access
instructions first, not going straight to checkout.

### Trust note

Private-code access stays limited for the next few months.

We do not automatically add strangers to the GitHub organization that gives
Noter access to private repositories. Access opens manually, with explicit
approval, before billing starts.

### Card 1

#### Free

Free

Start here if you want to understand how Noter works before granting any private
repo access.

- Explore the product before committing private code access
- Follow milestones and product progress
- Use Noter as the default entry point

CTA: `Start free`

### Card 2

#### Private code access

`$4.99/month`

Use this when you want Noter to inspect and work with your private code.

- Direct private-repo access after approval
- GitHub organization invite handled manually
- Milestone updates and access instructions before billing starts

CTA: `Get private access updates`

### How it works

#### How private access works right now

1. Join the private access list.
2. Get milestone updates as the workflow improves.
3. When access opens, we send instructions.
4. Billing starts only after private access is actually enabled.

### FAQ

#### Why is Noter free by default?

Because the default product should be easy to try. Most people should be able to
understand the workflow before they decide whether they want private-code
access.

#### What does `$4.99/month` pay for?

It pays for the private-code access path: the moment when Noter can work
directly with your private repository after approval.

#### Why is the paid flow manual?

Because private repositories require trust, not just billing. Right now access
is opened deliberately instead of automatically.

#### Does clicking the paid CTA start a subscription?

No. It puts you on the update/access path. Checkout should not appear until the
manual private-access step is actually ready.

## Stronger alternate headlines

### Option A

Free to start. Pay only when Noter needs private code access.

### Option B

Use Noter for free. Upgrade only when you want direct help in a private repo.

### Option C

Free by default. Private-code access is `$4.99/month`.

## Stronger alternate CTA labels

- `Get private access updates`
- `Join private access list`
- `Notify me when private access opens`

## UI direction for the next pass

1. Keep the page to two cards only.
2. Put the trust/manual-access explanation in a separate box under the hero, not
   inside the main headline.
3. Remove generic SaaS badges like `Recommended`.
4. Make the paid CTA visibly different from a checkout CTA.
5. Add a short `How it works` section under the cards so the paid flow feels
   concrete instead of vague.
