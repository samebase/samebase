# Codex App Publication Readiness Research

Date: 2026-03-23

## Why This Document Exists

We already have a public privacy policy in the repo at
`apps/noter/src/content/privacy-policy.md`, but I did not find a matching public
terms-and-conditions page in the current app routes or static content. This memo
answers two practical questions:

1. What should a public terms-and-conditions page for the Noter Codex/ChatGPT
   app include?
2. What other real-world requirements or submission blockers exist before the
   app can be published safely?

This is operational research, not legal advice.

## Why This Lives In `research/`

This is a current-state research memo and publication checklist. It is not yet a
product spec, runtime contract, or accepted rollout plan, so it fits better
under `research/` than under `specs/`.

## Bottom Line

As of March 23, 2026, the current app submission UI includes an explicit
`Terms of Service URL` field. The user also provided a screenshot of that
submission form showing these relevant fields:

- `Customer Support URL or Email Address`
- `Privacy Policy URL`
- `Terms of Service URL`
- `Demo Recording URL`
- `App Commerce & Purchasing` disclosure

That means the practical launch checklist is stricter than a docs-only read of
the public submission guide suggests. For this submission flow, Noter should
treat a public terms page as required, not just recommended.

That remains consistent with the underlying policy posture:

- OpenAI's App Developer Terms expressly contemplate that apps may have
  associated end-user terms or documentation.
- OpenAI's Service Terms tell users not to enable an app unless they have
  reviewed that app's terms and privacy policy.
- A terms page is the clean place to allocate responsibility, set acceptable-use
  boundaries, describe third-party dependencies, disclaim beta/runtime
  availability, and handle support, suspension, disputes, and liability.

So the practical recommendation is:

- Keep the privacy policy as a precise data-handling document.
- Add a public `/terms` page for contractual and operational rules.
- Prepare a real support contact and demo recording URL, since the current
  submission UI asks for them explicitly.
- Make sure these pages and assets reflect actual product behavior, especially
  for provider connections, write actions, and AI-driven workflows.

## Revalidation Required Before Submission

Owner: noter publisher / service operator

SLA: Re-check the live OpenAI submission UI and official docs within 7 days
before any actual submission.

Minimum revalidation checklist:

- Confirm that the submission form still requires the same public URLs and
  fields, especially privacy policy, terms of service, support contact, and demo
  recording.
- Confirm that the live privacy policy URL and terms-of-service URL resolve to
  real public pages without auth or JavaScript-only rendering requirements.
- Confirm that the current app-commerce policy still allows the launch posture
  described in this memo.

## What OpenAI Explicitly Requires For Submission

These items are current published requirements or common review blockers from
OpenAI's current Apps SDK docs.

### Submission prerequisites

- Complete identity verification in the OpenAI Platform Dashboard for the exact
  name you want to publish under.
- Use an organization where you have the `Owner` role.
- Host the MCP server on a publicly accessible domain.
- Do not submit a local or testing endpoint.
- Define CSP rules that allow the exact domains your app fetches from.
- Use a project with global data residency for submission. The current docs say
  projects with EU data residency cannot submit apps for review.

### Submission materials

- App name
- Logo
- Description
- Company URL
- Customer support URL or email address
- Privacy policy URL
- Terms of service URL
- Demo recording URL
- MCP and tool information
- Screenshots
- Test prompts and expected responses
- Localization information
- OAuth credentials, if OAuth is used
- Commerce disclosure, if the app links or directs users out of ChatGPT to make
  purchases

### Authenticated app review requirements

- Provide a login and password for a fully featured demo account with sample
  data.
- The review account cannot require additional setup steps, inaccessible 2FA,
  SMS codes, email verification loops, or similar MFA friction.
- Test credentials must remain valid and usable from outside private company
  networks.

### Privacy and data-handling requirements

- The privacy policy must clearly disclose, at minimum:
  - categories of personal data collected
  - purposes of use
  - categories of recipients
  - user controls
- Tool inputs and outputs must be minimal and purpose-driven.
- Tool responses should stay focused on the requested action and avoid
  unnecessary personal data or secrets.
- Restricted data such as PCI data, PHI, government identifiers, passwords, and
  MFA/OTP codes must not be collected.
- User-supplied API keys or OAuth credentials should be collected only when they
  are strictly necessary for an explicit provider-connection flow and must never
  be exposed through tool output, logs, screenshots, or demo materials.
- If the product stores logs, audit records, or operational metadata, sensitive
  user data should be minimized and handled consistently with the privacy
  policy.
- Sensitive or special-category personal data requires strict necessity,
  adequate consent where legally required, and prominent disclosure.

### Tool-definition and behavior requirements

- Tool names and descriptions must accurately match real behavior.
- `readOnlyHint`, `destructiveHint`, and `openWorldHint` must match the actual
  side effects of each tool.
- Hidden or implicit side effects are a rejection risk.
- If a tool changes public internet state or external systems, that must be
  clearly labeled.

### Ongoing publication requirements

- Apps can be removed if they become unstable, inactive, misleading, or
  non-compliant.
- Support contact details must be provided and kept accurate.
- Apps must stay suitable for a general audience, including ages 13 to 17, and
  may not explicitly target children under 13.

## Critical Non-Obvious Blockers For Noter

### 1. Digital subscription monetization is currently not allowed

OpenAI's current submission guidelines say apps may conduct commerce only for
physical goods. Selling digital products or services, including subscriptions,
digital content, tokens, or credits, is not allowed, including indirect freemium
upsells.

Practical implication for Noter:

- If the published app is meant to sell Noter subscriptions inside the ChatGPT
  app experience, that currently conflicts with the published guidelines.
- The safest launch posture is a free-only app with no subscription sales or
  paid upgrade path linked from the ChatGPT app experience.
- If paid Noter access still exists elsewhere, the public app should avoid
  pointing users at that offer until OpenAI's commerce policy changes and the
  submission guidance is revalidated.

### 2. Privacy-policy mismatch is a known rejection reason

OpenAI explicitly calls out rejection cases where tool responses return
user-related data types that are not disclosed in the privacy policy.

Practical implication for Noter:

- The privacy policy must match real tool outputs, not just high-level database
  categories.
- If the app exposes repository metadata, provider usernames, branch names,
  deployment URLs, audit records, or other user-linked identifiers through tool
  responses, those categories should either be disclosed or removed from tool
  output if not strictly necessary.

### 3. Authenticated apps need a real demo account with no MFA friction

If the app requires login, OpenAI review needs a working demo account with a
direct login and password that does not depend on private infrastructure or
inaccessible MFA steps.

Practical implication for Noter:

- If Noter requires external providers to be connected before the app is useful,
  we need a review-friendly demo setup with stable sample data.
- If the production app remains Google-only, that is a review blocker until
  there is a testable username/password reviewer flow or OpenAI explicitly
  approves a different setup.
- If any provider flow depends on manual approval, SMS, email OTP, or a private
  corporate network, that will need a review-safe alternative.

### 4. Iframe-heavy experiences get extra scrutiny

The current OpenAI guidelines say iframe-based experiences are strongly
discouraged for broad distribution and receive extra manual review.

Practical implication for Noter:

- If the Codex app experience depends on embedding something IDE-like in an
  iframe, approval risk is higher.
- The safest published experience is likely a simpler tool-first flow with only
  essential UI.

## What The Terms And Conditions Page Should Include

This section is a practical synthesis for Noter. It is not copied from any one
OpenAI document. The goal is to cover the issues OpenAI's policies surface plus
the risks created by Noter's actual product behavior.

### Recommended section list

1. Operator identity and contact details
   - Legal entity or individual publisher name
   - Support email
   - Business address or legal notice address if you want one published

2. What the service is
   - A plain description of Noter and the ChatGPT/Codex app surface
   - A statement that the app connects to third-party services and may perform
     read or write actions when the user requests them

3. Eligibility and account requirements
   - Minimum age position
   - Whether the service is for businesses, developers, consumers, or a mixed
     audience
   - User responsibility for maintaining account credentials and connected
     provider access

4. Connected accounts and authorizations
   - Which third-party services the app can connect to
   - That the user authorizes Noter and ChatGPT to send the minimum necessary
     data and requests to those services when the user enables the app
   - That third-party service terms also apply

5. Acceptable use
   - Ban abuse, unlawful use, credential misuse, unauthorized scraping,
     circumvention of third-party restrictions, and attempts to use the app in
     ways that violate OpenAI policies or partner-service terms
   - Ban submission of restricted data such as payment card data, PHI, secrets,
     passwords, OTP codes, and similar material

6. AI and automation disclaimers
   - Explain that AI outputs, plans, code changes, and tool suggestions can be
     wrong or incomplete
   - Put responsibility on the user to review high-impact actions before relying
     on them
   - Clarify that external provider actions may depend on third-party
     availability and permissions

7. User content and rights
   - State what the user retains ownership of
   - Grant the service the limited rights needed to host, process, transform,
     and transmit content to operate the product
   - Cover content from connected third-party systems and any limits on reuse

8. Service changes, beta status, and availability
   - Reserve the right to modify, suspend, or discontinue features
   - Explain that preview, beta, or experimental features may change or be
     removed
   - Clarify that uptime is not guaranteed unless you intend to make an SLA

9. Fees, billing, refunds, and cancellation
   - Include this only if you actually charge users outside the ChatGPT app
     experience
   - Keep it aligned with the current OpenAI app-commerce restriction on digital
     services

10. Suspension and termination
    - Right to suspend or terminate access for abuse, policy violations,
      security incidents, legal risk, or provider misuse
    - Effects of termination, including what happens to connected accounts or
      stored workspaces

11. Third-party services and external sites
    - Disclaimer that OpenAI, GitHub, Convex, Cloudflare, Codex, and other
      providers operate under their own terms and availability
    - Disclaimer that Noter is not responsible for outages or policy actions by
      those providers

12. Warranties and liability
    - Standard "as is" / "as available" language
    - Limitation of liability language
    - This is a section to have counsel review carefully

13. Governing law, venue, and dispute process
    - Court venue or arbitration position
    - Required notices
    - This is another section where a jurisdiction-specific legal review matters

14. Changes to the terms
    - How updates will be posted
    - When changes take effect

15. Contact and notices
    - Support email
    - Legal notice email if different

### Noter-specific clauses that should probably appear

- A clause explaining that Noter may connect to repositories, infrastructure,
  and developer tools the user explicitly authorizes.
- A clause explaining that actions may create, modify, or delete resources in
  third-party systems if the user requests or approves those actions.
- A clause explaining that AI-generated code, infrastructure changes, or
  operational suggestions are assistance only and still require human review.
- A clause restricting users from submitting secrets, regulated data, or data
  they are not authorized to expose through the app.

## What I Need From You To Draft A Real Terms Page

I can draft a strong first-pass `/terms` page once these decisions are pinned
down:

- Exact legal publisher name
- Support email
- Public-facing business or legal notice address, if you want one published
- Governing law and venue preference
- Whether you want arbitration or normal court venue
- Minimum age position
- Whether the service is consumer, business, or mixed
- Whether the published ChatGPT app will be free, invite-only, or tied to an
  existing paid Noter subscription outside ChatGPT
- Refund/cancellation policy, if any fees exist outside ChatGPT
- Whether you want beta/preview language for the app
- Whether users can request account deletion or workspace deletion by email, and
  what turnaround you want to promise
- Final list of third-party services that should be named explicitly

## Real-World Tasks Still Needed Before Submission

### Must-do operational tasks

- Complete OpenAI individual or business verification for the exact publication
  name.
- Ensure the submitting account has the `Owner` role.
- Host the MCP server on a public production domain.
- Lock CSP down to exact fetch domains.
- Use a global-data-residency OpenAI project for submission.
- Publish and verify the privacy policy URL.
- Confirm the terms-of-service URL is live and accessible.
- Ensure the company URL is live and accurate.
- Provide support contact details for end users.
- Record a demo URL that covers the main use cases and tools.
- Create a stable demo account with sample data, direct login/password access,
  and no MFA blockers.
- Prepare screenshots, test prompts, expected responses, and localization
  metadata.
- Revalidate this memo against the live OpenAI submission flow within 7 days of
  submission and confirm that the privacy and terms URLs still resolve
  correctly.

### Strongly recommended tasks

- Add the `/terms` link anywhere the `/privacy` link is currently surfaced.
- Run an audit of real tool outputs and compare them field-by-field against the
  privacy policy.
- Remove any unnecessary user-linked identifiers from tool responses.
- Decide on a clear retention and deletion process before publication.
- Run a security review focused on prompt injection, write actions, auth token
  handling, and provider-side side effects.

### Product-strategy decision that should happen before launch

- Decide whether the first published ChatGPT app version is free-only. The
  current OpenAI policy on app commerce makes digital subscription sales a real
  constraint.

## Current Recommendation For Noter

Short version:

1. Keep the existing privacy policy and tighten it against actual tool outputs.
2. Add a public `/terms` page next.
3. Plan the first public app as free-only, with no paid upgrade path linked from
   the ChatGPT app experience unless OpenAI's commerce policy changes.
4. Build a review-safe demo environment with stable credentials and no MFA.
5. Keep the first submitted app surface narrow, explicit, and low-surprise.

## Sources

Official OpenAI sources reviewed on 2026-03-23:

- OpenAI Apps SDK submission guide:
  https://developers.openai.com/apps-sdk/deploy/submission
- OpenAI app submission guidelines:
  https://developers.openai.com/apps-sdk/app-submission-guidelines
- OpenAI Apps SDK security and privacy guide:
  https://developers.openai.com/apps-sdk/guides/security-privacy
- OpenAI App Developer Terms: https://openai.com/policies/developer-apps-terms/
- OpenAI Service Terms: https://openai.com/policies/service-terms/

## Source Notes

- The current submission guide explicitly lists company URL and privacy policy
  URL in the published documentation.
- The current submission UI, as provided by the user in a screenshot on
  2026-03-23, also shows explicit fields for customer support, terms of service,
  demo recording, and commerce disclosure.
- For practical submission planning, the UI should be treated as the operative
  checklist, not the narrower wording in the public docs alone.
- Because these requirements can change, this memo should not be used for an
  actual submission unless it has been revalidated within the 7-day window
  described above.
