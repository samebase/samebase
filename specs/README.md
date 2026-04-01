# Specs

`specs/` is for accepted, current source-of-truth behavior and accepted
implementation plans that the team intends to execute or has already shipped.

A document belongs here when it answers "what should the product do now?" or
"what is the currently accepted implementation contract?"

Use `specs/` for:

- current behavior contracts
- accepted rollout plans that the team is actively implementing
- validation expectations for shipped or accepted behavior

Do not use `specs/` for:

- open-ended exploration
- competing proposals
- historical notes
- operator runbooks or compliance artifacts that do not define product behavior

When a proposal becomes accepted and active, move or replace the relevant RFC
with a spec. When a spec no longer matches reality, move it to `archive/` or
replace it with the new source of truth.
