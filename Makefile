# set default  to be `make run`
# .PHONY ensures targets run even if a file with the same name exists.
.PHONY: bootstrap bootstrap-anon run run-dev run-share anon anon-once anon-dev anon-share killport connect connect-once daytona-local daytona-local-once update-fixtures playwright-open record-start record-stop

ANON_SETUP_ONCE_CMD = cd apps/noter && CONVEX_AGENT_MODE=anonymous node convex-dev.js --once --codegen=enable --tail-logs=disable --typecheck=disable
# Allow `make killport 13124` by treating the extra make goal as the port.
KILLPORT_GOAL = $(firstword $(filter-out killport,$(MAKECMDGOALS)))
ANON_ALLOW_MISSING_SOURCE_ENV_ARG = $(if $(strip $(ANON_ALLOW_MISSING_SOURCE_ENV)),--allow-missing-source-env,)
ANON_VALIDATE_SOURCE_ENV_CMD = $(if $(strip $(ANON_SOURCE_DEPLOY_KEY)),CONVEX_DEPLOY_KEY="$(ANON_SOURCE_DEPLOY_KEY)" ,)node ./scripts/convex-sync-dev-env.js --check-prereqs $(ANON_ALLOW_MISSING_SOURCE_ENV_ARG) $(if $(strip $(ANON_SOURCE_ENV)),--source-env "$(ANON_SOURCE_ENV)",)
ANON_SYNC_ENV_CMD = $(if $(strip $(ANON_SOURCE_DEPLOY_KEY)),CONVEX_DEPLOY_KEY="$(ANON_SOURCE_DEPLOY_KEY)" ,)node ./scripts/convex-sync-dev-env.js $(ANON_ALLOW_MISSING_SOURCE_ENV_ARG) $(if $(strip $(ANON_SOURCE_ENV)),--source-env "$(ANON_SOURCE_ENV)",)
ANON_SEED_PASSWORD_ACCOUNT_CMD = node ./scripts/convex-seed-dev-auth.js
ANON_REFRESH_AUTH_KEYS_CMD = cd apps/noter && CONVEX_AGENT_MODE=anonymous node convex-dev.js --refresh-anon-auth --codegen=disable --tail-logs=disable --typecheck=disable
ANON_VITE_PORT ?= 5174
RUN_VITE_PORT ?= 5173
DAYTONA_VITE_PORT ?= 5173
BOOTSTRAP_ANON_ARGS ?=
DAYTONA_SOURCE_ENV ?= apps/noter/.env.daytona-source.local
DAYTONA_WRITE_SOURCE_ENV_CMD = node ./scripts/daytona-write-source-env.js --output "$(DAYTONA_SOURCE_ENV)" --optional
PLAYWRIGHT_BRANCH_BROWSER = node ./scripts/playwright-branch-browser.js
PLAYWRIGHT_SESSION ?= $(shell $(PLAYWRIGHT_BRANCH_BROWSER) session)
PLAYWRIGHT_PROFILE_DIR = $(shell PLAYWRIGHT_SESSION="$(PLAYWRIGHT_SESSION)" $(PLAYWRIGHT_BRANCH_BROWSER) profile)
PLAYWRIGHT_URL ?= http://127.0.0.1:$(ANON_VITE_PORT)
PLAYWRIGHT_RECORD_DIR ?= /tmp/noter-browser-recordings
CONNECT_LABEL ?= research
CONNECT_INTERVAL_SECONDS ?= 60
CONNECT_RUNNER = node ./scripts/noter-pr-connect.js --label "$(CONNECT_LABEL)" --interval "$(CONNECT_INTERVAL_SECONDS)"

# also add a step that updates the env for preview server when using worktrees
# or daytona or gh codespaces or something else
bootstrap:
	./scripts/bootstrap-worktree.js

bootstrap-anon:
	./scripts/bootstrap-worktree.js --anon $(BOOTSTRAP_ANON_ARGS)

run:
	$(MAKE) bootstrap
	$(MAKE) run-dev RUN_VITE_PORT="$(RUN_VITE_PORT)"

# Long-lived local dev after bootstrap/setup has completed.
run-dev:
	VITE_PORT=$(RUN_VITE_PORT) pnpm dev

# Share the local Noter app over a Cloudflare quick tunnel while keeping the
# configured Convex deployment behind Vite's same-origin proxy path.
run-share:
	node ./scripts/anon-share.js --mode local --port "$(RUN_VITE_PORT)"

# Full dev (frontend + backend) with anonymous Convex mode.
anon:
	$(MAKE) killport
	$(ANON_VALIDATE_SOURCE_ENV_CMD)
	$(MAKE) bootstrap-anon
	$(ANON_SETUP_ONCE_CMD)
	$(ANON_SYNC_ENV_CMD)
	$(ANON_SEED_PASSWORD_ACCOUNT_CMD)
	$(ANON_REFRESH_AUTH_KEYS_CMD)
	$(MAKE) anon-dev ANON_VITE_PORT="$(ANON_VITE_PORT)"

# `apps/noter/scripts/run-vite-dev.js` consumes `VITE_PORT` and chooses the
# actual frontend port, while `NOTER_DEV_PORT`/`NOTER_DEV_STRICT_PORT` let
# Vite's config mirror that choice for share/proxy flows.
# Long-lived anonymous local dev after bootstrap/seed setup has completed.
anon-dev:
	CONVEX_AGENT_MODE=anonymous VITE_PORT=$(ANON_VITE_PORT) pnpm dev

# One-off anonymous Convex bootstrap (codegen + push), then exit.
anon-once:
	$(MAKE) killport
	$(ANON_VALIDATE_SOURCE_ENV_CMD)
	$(MAKE) bootstrap-anon
	$(ANON_SETUP_ONCE_CMD)
	$(ANON_SYNC_ENV_CMD)
	$(ANON_SEED_PASSWORD_ACCOUNT_CMD)
	$(ANON_REFRESH_AUTH_KEYS_CMD)

# Share the local anonymous Noter app over a Cloudflare quick tunnel while
# keeping the local Convex backend behind Vite's same-origin proxy path.
anon-share:
	node ./scripts/anon-share.js

# Send SIGTERM to the explicit port or the current anon backend port from apps/noter/.env.local.
# This is intentionally Mac-first for now: the local operator flow relies on
# `lsof`, and we can revisit cross-platform probing if we need Linux support.
killport:
	@port="$(KILLPORT_GOAL)"; \
	if [ -z "$$port" ] && [ -f "apps/noter/.env.local" ]; then \
		port="$$(sed -nE "s/^(VITE_CONVEX_URL|CONVEX_URL)=['\"]?http:\/\/127\.0\.0\.1:([0-9]+).*/\2/p" apps/noter/.env.local | head -n 1)"; \
	fi; \
	[ -n "$$port" ] || exit 0; \
	pids="$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null || true)"; \
	[ -n "$$pids" ] || exit 0; \
	kill -TERM $$pids; \
	echo "Sent SIGTERM to $$pids on port $$port."

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
	UPDATE_SIMPLE_VIEW_FIXTURES=1 pnpm exec vp test run apps/noter/src/lib/simpleView.test.ts

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
