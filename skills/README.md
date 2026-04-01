# Skills

`skills/` is for reusable, task-specific playbooks.

Use a skill when all of these are true:

- the workflow repeats often
- it is conditional rather than always-on
- it benefits from a focused `SKILL.md`
- extra references or scripts are helpful but should load lazily

Good skill candidates in this repo:

- live browser and Playwright debugging on the real app
- PR creation and update workflows
- macOS app control tasks

Keep each skill narrow:

- the `SKILL.md` should stay focused on the workflow
- heavier detail belongs in `references/`, `assets/`, or `scripts/`
- descriptions should clearly say when the skill should be used

Do not use skills for:

- broad repo invariants that belong in `AGENTS.md`
- accepted product behavior that belongs in `specs/`
- open-ended exploration that belongs in `research/`
- historical material that belongs in `archive/`
