# Compatibility shim for the repo-owned package scripts.
# .PHONY ensures targets run even if a file with the same name exists.
.PHONY: bootstrap bootstrap-anon run run-dev run-share anon anon-once anon-dev anon-share killport connect connect-once daytona-local daytona-local-once update-fixtures playwright-open record-start record-stop

# Allow `make killport 13124` by treating the extra make goal as the port.
KILLPORT_GOAL = $(firstword $(filter-out killport,$(MAKECMDGOALS)))
ANON_ALLOW_MISSING_SOURCE_ENV_ARG = $(if $(strip $(ANON_ALLOW_MISSING_SOURCE_ENV)),--allow-missing-source-env,)
ANON_VITE_PORT ?= 5174
RUN_VITE_PORT ?= 5173
DAYTONA_VITE_PORT ?= 5173
BOOTSTRAP_ANON_ARGS ?=
DAYTONA_SOURCE_ENV ?= apps/noter/.env.daytona-source.local
DAYTONA_WRITE_SOURCE_ENV_CMD = node ./scripts/daytona-write-source-env.ts --output "$(DAYTONA_SOURCE_ENV)" --optional
ANON_SCRIPT_ARGS = $(BOOTSTRAP_ANON_ARGS) --vite-port "$(ANON_VITE_PORT)" $(ANON_ALLOW_MISSING_SOURCE_ENV_ARG) $(if $(strip $(ANON_SOURCE_ENV)),--source-env "$(ANON_SOURCE_ENV)",) $(if $(strip $(ANON_SOURCE_DEPLOY_KEY)),--source-deploy-key "$(ANON_SOURCE_DEPLOY_KEY)",)
PLAYWRIGHT_BRANCH_BROWSER = node ./scripts/playwright-branch-browser.ts
PLAYWRIGHT_SESSION ?= $(shell $(PLAYWRIGHT_BRANCH_BROWSER) session)
PLAYWRIGHT_PROFILE_DIR = $(shell PLAYWRIGHT_SESSION="$(PLAYWRIGHT_SESSION)" $(PLAYWRIGHT_BRANCH_BROWSER) profile)
PLAYWRIGHT_URL ?= http://127.0.0.1:$(ANON_VITE_PORT)
PLAYWRIGHT_RECORD_DIR ?= /tmp/noter-browser-recordings
CONNECT_LABEL ?= research
CONNECT_INTERVAL_SECONDS ?= 60
CONNECT_RUNNER = node ./scripts/noter-pr-connect.ts --label "$(CONNECT_LABEL)" --interval "$(CONNECT_INTERVAL_SECONDS)"

# also add a step that updates the env for preview server when using worktrees
# or daytona or gh codespaces or something else
bootstrap:
	./scripts/bootstrap-worktree.ts

bootstrap-anon:
	./scripts/bootstrap-worktree.ts --anon $(BOOTSTRAP_ANON_ARGS)

run:
	$(MAKE) bootstrap
	$(MAKE) run-dev RUN_VITE_PORT="$(RUN_VITE_PORT)"

# Long-lived local dev after bootstrap/setup has completed.
run-dev:
	VITE_PORT=$(RUN_VITE_PORT) pnpm dev

# Share the local Noter app over a Cloudflare quick tunnel while keeping the
# configured Convex deployment behind Vite's same-origin proxy path.
run-share:
	node ./scripts/anon-share.ts --mode local --port "$(RUN_VITE_PORT)"

# Full dev (frontend + backend) with anonymous Convex mode.
anon:
	pnpm run anon -- $(ANON_SCRIPT_ARGS)

# `apps/noter/scripts/run-vite-dev.ts` consumes `VITE_PORT` and chooses the
# actual frontend port, while `NOTER_DEV_PORT`/`NOTER_DEV_STRICT_PORT` let
# Vite's config mirror that choice for share/proxy flows.
# Long-lived anonymous local dev after bootstrap/seed setup has completed.
anon-dev:
	CONVEX_AGENT_MODE=anonymous VITE_PORT=$(ANON_VITE_PORT) pnpm dev

# One-off anonymous Convex bootstrap (codegen + push), then exit.
anon-once:
	pnpm run anon:once -- $(ANON_SCRIPT_ARGS)

# Share the local anonymous Noter app over a Cloudflare quick tunnel while
# keeping the local Convex backend behind Vite's same-origin proxy path.
anon-share:
	node ./scripts/anon-share.ts

# Stop the explicit port or the current anon backend port from apps/noter/.env.local.
killport:
	pnpm run killport$(if $(strip $(KILLPORT_GOAL)), -- $(KILLPORT_GOAL),)

# Swallow the extra positional goal (`13124`) so make does not try to build a
# target with that name after running `killport`.
ifneq ($(filter killport,$(MAKECMDGOALS)),)
%:
	@:
endif

# Poll GitHub for explicit noter-origin PRs and launch local Codex runs.
connect:
	$(CONNECT_RUNNER)

# Run one local noter-origin polling cycle, then exit.
connect-once:
	$(CONNECT_RUNNER) --once

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
