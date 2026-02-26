# set default  to be `make run`
# .PHONY ensures targets run even if a file with the same name exists.
.PHONY: bootstrap bootstrap-anon run anon anon-once update-fixtures

ANON_SETUP_ONCE_CMD = cd apps/noter && CONVEX_AGENT_MODE=anonymous npx convex dev --once --tail-logs=disable --typecheck=disable
ANON_SYNC_ENV_CMD = node ./scripts/convex-sync-dev-env.js
ANON_SEED_PASSWORD_ACCOUNT_CMD = cd apps/noter && CONVEX_AGENT_MODE=anonymous npx convex dev --once --env-file .env.anon-seed.local --run devAuth:seedPasswordAccount --tail-logs=disable --typecheck=disable

# also add a step that updates the env for preview server when using worktrees
# or daytona or gh codespaces or something else
bootstrap:
	./scripts/bootstrap-worktree.js

bootstrap-anon:
	./scripts/bootstrap-worktree.js --anon

run:
	$(MAKE) bootstrap
	pnpm dev

# Full dev (frontend + backend) with anonymous Convex mode.
anon:
	$(MAKE) bootstrap-anon
	$(ANON_SETUP_ONCE_CMD)
	$(ANON_SYNC_ENV_CMD)
	$(ANON_SEED_PASSWORD_ACCOUNT_CMD)
	CONVEX_AGENT_MODE=anonymous pnpm dev

# One-off anonymous Convex bootstrap (codegen + push), then exit.
anon-once:
	$(MAKE) bootstrap-anon
	$(ANON_SETUP_ONCE_CMD)
	$(ANON_SYNC_ENV_CMD)
	$(ANON_SEED_PASSWORD_ACCOUNT_CMD)

update-fixtures:
	UPDATE_SIMPLE_VIEW_FIXTURES=1 pnpm exec vitest run apps/noter/src/lib/simpleView.test.ts
