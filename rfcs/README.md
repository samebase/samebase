# RFCs

This folder is for proposals, pilots, rollout plans, and requests for comments that are still under
discussion or are not yet committed source-of-truth implementation docs.

Use `rfcs/` when the repo needs a proposed direction, an implementation plan that still needs
acceptance, or a phased rollout document for work that is not yet the accepted current contract.

Use `research/` instead when the document is still primarily evidence gathering, benchmarking, or
exploratory analysis rather than a concrete proposal.

Number a new RFC with the next number after the highest one already in `rfcs/` on `origin/main`, and
never reuse a number that is already taken; duplicate numbers from parallel branches are accidents
to renumber before merge, not a convention.

Extract a doc from `rfcs/` into `specs/` only after the decision is accepted and the implementation
is active. Move it to `archive/` if it becomes historical without becoming the active source of
truth. If the proposal ships, either reduce the accepted parts into a compact spec or archive the
RFC when the code and tests are enough.

See `docs/repo-documentation-standard.md` for the full placement decision table.
