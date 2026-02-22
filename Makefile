# set default  to be `make run`
# .PHONY ensures targets run even if a file with the same name exists.
.PHONY: bootstrap bootstrap-anon run anon anon:once update-fixtures

# also add a step that updates the env for preview server when using worktrees
# or daytona or gh codespaces or something else
bootstrap:
	./scripts/bootstrap-worktree.js

bootstrap-anon:
	./scripts/bootstrap-worktree.js --anon

run:
	$(MAKE) bootstrap
	pnpm dev

anon:
	$(MAKE) bootstrap-anon
	CONVEX_AGENT_MODE=anonymous pnpm dev

anon:once:
	$(MAKE) bootstrap-anon
	cd apps/noter && CONVEX_AGENT_MODE=anonymous node convex-dev.js --once --tail-logs=disable --codegen=enable

update-fixtures:
	UPDATE_SIMPLE_VIEW_FIXTURES=1 pnpm exec vitest run apps/noter/src/lib/simpleView.test.ts
