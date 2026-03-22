# set default  to be `make run`
# .PHONY ensures targets run even if a file with the same name exists.
.PHONY: bootstrap bootstrap-anon run anon anon-once daytona-local daytona-local-once update-fixtures playwright-open record-start record-stop

ANON_SETUP_ONCE_CMD = cd apps/noter && CONVEX_AGENT_MODE=anonymous node convex-dev.js --once --codegen=enable --tail-logs=disable --typecheck=disable
ANON_ALLOW_MISSING_SOURCE_ENV_ARG = $(if $(strip $(ANON_ALLOW_MISSING_SOURCE_ENV)),--allow-missing-source-env,)
ANON_VALIDATE_SOURCE_ENV_CMD = $(if $(strip $(ANON_SOURCE_DEPLOY_KEY)),CONVEX_DEPLOY_KEY="$(ANON_SOURCE_DEPLOY_KEY)" ,)node ./scripts/convex-sync-dev-env.js --check-prereqs $(ANON_ALLOW_MISSING_SOURCE_ENV_ARG) $(if $(strip $(ANON_SOURCE_ENV)),--source-env "$(ANON_SOURCE_ENV)",)
ANON_SYNC_ENV_CMD = $(if $(strip $(ANON_SOURCE_DEPLOY_KEY)),CONVEX_DEPLOY_KEY="$(ANON_SOURCE_DEPLOY_KEY)" ,)node ./scripts/convex-sync-dev-env.js $(ANON_ALLOW_MISSING_SOURCE_ENV_ARG) $(if $(strip $(ANON_SOURCE_ENV)),--source-env "$(ANON_SOURCE_ENV)",)
ANON_SEED_PASSWORD_ACCOUNT_CMD = node ./scripts/convex-seed-dev-auth.js
ANON_REFRESH_AUTH_KEYS_CMD = cd apps/noter && CONVEX_AGENT_MODE=anonymous node convex-dev.js --refresh-anon-auth --codegen=disable --tail-logs=disable --typecheck=disable
ANON_VITE_PORT ?= 5174
DAYTONA_VITE_PORT ?= 5173
BOOTSTRAP_ANON_ARGS ?=
DAYTONA_SOURCE_ENV ?= apps/noter/.env.daytona-source.local
DAYTONA_WRITE_SOURCE_ENV_CMD = node ./scripts/daytona-write-source-env.js --output "$(DAYTONA_SOURCE_ENV)" --optional
PLAYWRIGHT_BRANCH_BROWSER = node ./scripts/playwright-branch-browser.js
PLAYWRIGHT_SESSION ?= $(shell $(PLAYWRIGHT_BRANCH_BROWSER) session)
PLAYWRIGHT_PROFILE_DIR = $(shell PLAYWRIGHT_SESSION="$(PLAYWRIGHT_SESSION)" $(PLAYWRIGHT_BRANCH_BROWSER) profile)
PLAYWRIGHT_URL ?= http://127.0.0.1:$(ANON_VITE_PORT)
PLAYWRIGHT_RECORD_DIR ?= /tmp/noter-browser-recordings

# also add a step that updates the env for preview server when using worktrees
# or daytona or gh codespaces or something else
bootstrap:
	./scripts/bootstrap-worktree.js

bootstrap-anon:
	./scripts/bootstrap-worktree.js --anon $(BOOTSTRAP_ANON_ARGS)

run:
	$(MAKE) bootstrap
	pnpm dev

# Full dev (frontend + backend) with anonymous Convex mode.
anon:
	$(ANON_VALIDATE_SOURCE_ENV_CMD)
	$(MAKE) bootstrap-anon
	$(ANON_SETUP_ONCE_CMD)
	$(ANON_SYNC_ENV_CMD)
	$(ANON_SEED_PASSWORD_ACCOUNT_CMD)
	$(ANON_REFRESH_AUTH_KEYS_CMD)
	CONVEX_AGENT_MODE=anonymous VITE_PORT=$(ANON_VITE_PORT) pnpm dev

# One-off anonymous Convex bootstrap (codegen + push), then exit.
anon-once:
	$(ANON_VALIDATE_SOURCE_ENV_CMD)
	$(MAKE) bootstrap-anon
	$(ANON_SETUP_ONCE_CMD)
	$(ANON_SYNC_ENV_CMD)
	$(ANON_SEED_PASSWORD_ACCOUNT_CMD)
	$(ANON_REFRESH_AUTH_KEYS_CMD)

# Daytona-local bootstrap: one repo checkout, no internal branch creation,
# explicit source env when Daytona exposes a cloud dev deployment identity.
daytona-local:
	$(DAYTONA_WRITE_SOURCE_ENV_CMD)
	@if [ -f "$(DAYTONA_SOURCE_ENV)" ]; then \
		$(MAKE) anon BOOTSTRAP_ANON_ARGS=--no-branch ANON_VITE_PORT="$(DAYTONA_VITE_PORT)" ANON_SOURCE_ENV="$(DAYTONA_SOURCE_ENV)" ANON_SOURCE_DEPLOY_KEY="$(DAYTONA_CONVEX_DEPLOY_KEY)"; \
	else \
		$(MAKE) anon BOOTSTRAP_ANON_ARGS=--no-branch ANON_VITE_PORT="$(DAYTONA_VITE_PORT)" ANON_ALLOW_MISSING_SOURCE_ENV=1; \
	fi

daytona-local-once:
	$(DAYTONA_WRITE_SOURCE_ENV_CMD)
	@if [ -f "$(DAYTONA_SOURCE_ENV)" ]; then \
		$(MAKE) anon-once BOOTSTRAP_ANON_ARGS=--no-branch ANON_VITE_PORT="$(DAYTONA_VITE_PORT)" ANON_SOURCE_ENV="$(DAYTONA_SOURCE_ENV)" ANON_SOURCE_DEPLOY_KEY="$(DAYTONA_CONVEX_DEPLOY_KEY)"; \
	else \
		$(MAKE) anon-once BOOTSTRAP_ANON_ARGS=--no-branch ANON_VITE_PORT="$(DAYTONA_VITE_PORT)" ANON_ALLOW_MISSING_SOURCE_ENV=1; \
	fi

update-fixtures:
	UPDATE_SIMPLE_VIEW_FIXTURES=1 pnpm exec vitest run apps/noter/src/lib/simpleView.test.ts

# Open the deterministic branch-owned Playwright session for the current repo.
playwright-open:
	@mkdir -p "$(PLAYWRIGHT_RECORD_DIR)" ".playwright-cli"
	PLAYWRIGHT_SESSION="$(PLAYWRIGHT_SESSION)" $(PLAYWRIGHT_BRANCH_BROWSER) open "$(PLAYWRIGHT_URL)"
	@echo "$(PLAYWRIGHT_SESSION)" > .playwright-cli/active-session
	@echo "Opened Playwright session $(PLAYWRIGHT_SESSION) at $(PLAYWRIGHT_URL) using profile $(PLAYWRIGHT_PROFILE_DIR)"

# Start Playwright browser recording for the current branch session.
record-start:
	@mkdir -p "$(PLAYWRIGHT_RECORD_DIR)" ".playwright-cli"
	PLAYWRIGHT_SESSION="$(PLAYWRIGHT_SESSION)" $(PLAYWRIGHT_BRANCH_BROWSER) open "$(PLAYWRIGHT_URL)"
	PLAYWRIGHT_SESSION="$(PLAYWRIGHT_SESSION)" $(PLAYWRIGHT_BRANCH_BROWSER) cli tracing-start
	PLAYWRIGHT_SESSION="$(PLAYWRIGHT_SESSION)" $(PLAYWRIGHT_BRANCH_BROWSER) cli video-start
	@echo "$(PLAYWRIGHT_SESSION)" > .playwright-cli/active-session
	@echo "Recording started for session $(PLAYWRIGHT_SESSION) at $(PLAYWRIGHT_URL) using profile $(PLAYWRIGHT_PROFILE_DIR)"

# Stop Playwright recording and persist artifacts to PLAYWRIGHT_RECORD_DIR.
record-stop:
	@SESSION="$${PLAYWRIGHT_SESSION:-$$(cat .playwright-cli/active-session 2>/dev/null)}"; \
	if [ -z "$$SESSION" ]; then \
		echo "No active Playwright session. Run 'make record-start' first or set PLAYWRIGHT_SESSION."; \
		exit 1; \
	fi; \
	TS="$$(date +%Y%m%d-%H%M%S)"; \
	OUT="$(PLAYWRIGHT_RECORD_DIR)"; \
	mkdir -p "$$OUT"; \
	PLAYWRIGHT_SESSION="$$SESSION" $(PLAYWRIGHT_BRANCH_BROWSER) cli snapshot > "$$OUT/$$SESSION-$$TS.snapshot.txt"; \
	PLAYWRIGHT_SESSION="$$SESSION" $(PLAYWRIGHT_BRANCH_BROWSER) cli screenshot --filename="$$OUT/$$SESSION-$$TS.png"; \
	PLAYWRIGHT_SESSION="$$SESSION" $(PLAYWRIGHT_BRANCH_BROWSER) cli video-stop --filename="$$OUT/$$SESSION-$$TS.webm"; \
	PLAYWRIGHT_SESSION="$$SESSION" $(PLAYWRIGHT_BRANCH_BROWSER) cli tracing-stop > "$$OUT/$$SESSION-$$TS.trace.txt"; \
	PLAYWRIGHT_SESSION="$$SESSION" $(PLAYWRIGHT_BRANCH_BROWSER) cli close; \
	rm -f .playwright-cli/active-session; \
	echo "Saved recording artifacts to $$OUT"
