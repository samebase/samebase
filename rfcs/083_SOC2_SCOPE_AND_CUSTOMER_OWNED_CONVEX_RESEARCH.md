# 083 SOC 2 Scope And Customer-Owned Convex Research

## Document Control

- Status: Research note
- Owner: Noter product/backend
- Last updated: 2026-04-02
- Related docs:
  - `rfcs/082_SINGLE_TENANT_RUNTIME_AND_STAGING_DATA_BOUNDARY_RESEARCH.md`
  - `specs/015_BYO_CONVEX_OAUTH_AND_WORKTREE_PROVISIONING_SPEC.md`
  - `specs/055_STAGING_REBASE_CONFLICT_RESOLUTION_SPEC.md`
  - `specs/069_GITHUB_MEDIA_UPLOADS_SPEC.md`

## Purpose

Answer the product/compliance question behind the current staging-data design:

If Convex is SOC 2 Type II, and Noter moved staged data into the customer's own
Convex instance, how much would that actually improve Noter's compliance story?

This note is a product/architecture research document, not legal advice and not
an audit opinion.

## External Facts Verified On 2026-04-02

### 1. SOC 2 is a report on controls, not a transferable certification

The AICPA describes SOC 2 this way:

- a SOC 2 examination is a report on controls at a service organization relevant
  to security, availability, processing integrity, confidentiality, or privacy
- SOC 2 reports are meant to help users understand and manage risks in using a
  service provider

Sources:

- [AICPA SOC 2 overview](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2)
- [AICPA SOC suite overview](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services)

### 2. SOC 2 reports explicitly rely on shared responsibility

The AICPA's own illustrative SOC 2 materials say:

- complementary subservice organization controls may be necessary
- complementary user entity controls may be necessary
- the service auditor does not evaluate those complementary controls inside the
  user entity or subservice organization

Sources:

- [AICPA illustrative SOC 2 transition FAQ PDF](https://us.aicpa.org/content/dam/aicpa/interestareas/frc/assuranceadvisoryservices/downloadabledocuments/othermapping/soc-2-faq-on-transition-guidance.pdf)
- [AICPA information for management in a SOC engagement PDF](https://us.aicpa.org/content/dam/aicpa/interestareas/frc/auditattest/downloadabledocuments/info-for-mgmt-of-serv-org-in-soc-engagement.pdf)

### 3. Convex currently says it is SOC 2 Type II compliant

As of 2026-04-02, Convex's public security page says:

- Convex is SOC 2 Type II compliant
- third-party systems Convex uses for platform services are audited at least
  annually for SOC 2 Type II compliance

Source:

- [Convex security](https://www.convex.dev/security)

## What This Means For Noter

### 1. Convex having SOC 2 does not give Noter SOC 2

This is the most important baseline.

Convex's SOC 2 helps as vendor evidence for the infrastructure Convex runs. It
does not automatically certify:

- Noter's application controls
- Noter's employee access controls
- Noter's support practices
- Noter's incident response
- Noter's production-read approval flow
- Noter's handling of customer content copied into Noter's own data model

Inference from the sources above:

SOC 2 is inherently scoped to the service organization's system and controls.
That means Convex's report is about Convex's controls, not Noter's complete
system.

### 2. If staged data lives in Noter's hosted backend, Noter stays squarely in scope

If Noter stores staged repository content in Noter's own Convex/database layer,
then Noter is not just "using a SOC 2 vendor." Noter is actively processing and
storing customer working data in infrastructure it operates.

Inference:

That keeps the relevant trust-services questions centered on Noter too, for
example:

- who at Noter can access that data
- how access is approved and revoked
- how secrets are handled
- how incidents are detected and responded to
- how logs and backups are managed
- how changes to that system are reviewed and deployed

So the main compliance issue is not the word "Convex." The main issue is where
the customer's uncommitted work actually resides.

### 3. Moving staged data into the customer's Convex instance would narrow scope materially

If Noter exported the staging/backend layer so it runs inside the customer's own
Convex instance, then the data-residency story improves in a meaningful way:

- staged repository content can remain in the customer's tenant
- the hosted Noter service may avoid storing the most sensitive uncommitted
  working state
- vendor inheritance becomes cleaner because the customer can rely on their own
  Convex account relationship and controls for that tenant-local data plane

Inference:

This would not make Noter automatically "out of scope," but it would reduce the
surface area that Noter's own audit story must cover.

### 4. Customer-owned Convex only helps if the boundary is real

A nominal "customer-owned data plane" is not enough if Noter still does any of
the following:

- copies staged content back into a hosted Noter database
- sends staged content through hosted logs, telemetry, or debug traces
- keeps hosted support tooling with broad tenant access
- runs commit/rebase/background jobs in a way that still pulls customer content
  through Noter-operated systems
- stores broad long-lived credentials that let Noter operators read tenant data

Inference:

The architecture only materially helps compliance if the boundary is enforced in
practice, not just described in marketing.

## Strongest Product Interpretation

The strongest compliance-oriented product statement is likely:

"Noter's hosted control plane may exist, but uncommitted repository content and
other sensitive tenant data should stay in customer-owned infrastructure by
default whenever we want the compliance burden for that data to sit primarily
with the customer environment instead of ours."

That is much stronger than:

"We use Convex, and Convex is SOC 2."

## Product Tension

The main problem with the most compliance-friendly architecture is product/IP
exposure.

If the exported customer-side Convex component contains most of the real backend
logic, then:

- the customer-local data boundary improves
- the architecture becomes easier to reason about for compliance
- but the backend becomes easier to inspect, reuse, or copy

So there is a real tradeoff between:

1. minimizing hosted handling of customer data
2. keeping the core backend proprietary

## Candidate Product Shapes

### Option A. Keep current hosted staging model

Properties:

- easiest architecture continuation
- worst compliance story for staged data residency
- Convex SOC 2 helps only as vendor evidence underneath Noter

### Option B. Export a customer-owned data plane for staging and collaboration

Properties:

- best data-boundary story for uncommitted work
- likely strongest improvement for SOC 2 scope reduction
- highest product-copy risk if the exported module is too complete

### Option C. Open-source single-tenant runtime, keep hosted multi-tenant control plane proprietary

Properties:

- aligns with the product boundary in `rfcs/082`
- gives customers a clean self-host/on-prem answer
- may be a better packaging boundary than exposing the exact hosted multi-tenant
  backend shape

This currently looks like the most coherent long-term direction if compliance,
data residency, and product defensibility all matter at once.

## Working Conclusions

1. Convex's SOC 2 materially helps Noter, but only as inherited vendor evidence
   for Convex's part of the stack.
2. Noter cannot honestly claim that Convex's SOC 2 alone solves Noter's own SOC
   2/compliance posture.
3. The biggest architecture lever is whether staged customer data is stored in
   Noter's backend or in customer-owned infrastructure.
4. Moving staged data into customer-owned Convex would narrow Noter's scope
   materially, but only if the boundary is strict and no hosted copy path
   remains.
5. The cleanest product answer may be an open-source/self-hosted single-tenant
   runtime, not an exported version of the hosted multi-tenant backend.

## Next Research Questions

1. Which current Noter data classes still carry customer repository content or
   tenant-sensitive context even if `fileStaging` moves out?
2. Can commit, rebase, preview, collaboration, and media upload flows run
   entirely inside a customer-owned Convex tenant without reintroducing hosted
   content copies?
3. What is the smallest customer-side runtime surface that materially improves
   the compliance story while preserving meaningful hosted differentiation?
4. Which claims should Noter make publicly before its own audit exists, and
   which claims should remain internal architecture intent only?
