# set default  to be `make run`
.PHONY: run

# also add a step that updates the env for preview server when using worktrees
# or daytona or gh codespaces or something else
run:
	pnpm dev 