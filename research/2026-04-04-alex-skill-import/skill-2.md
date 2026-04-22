---
name: qa-maintenance
description: Monthly QA maintenance workflow that analyzes recent PR feedback, extracts new coding rules, updates e2e-tests skill, and scans the current branch for violations. Use when asked to run QA maintenance, update testing rules, analyze PR feedback patterns, or check what patterns you're being corrected on.
---

# QA Maintenance Skill

This skill performs a complete QA maintenance cycle to keep testing standards up-to-date based on actual PR feedback.

## When to Use

- "Run QA maintenance"
- "Update testing rules from PR feedback"
- "Analyze my recent PR comments"
- "What patterns am I being corrected on?"
- "Sync rules with PR feedback"

## Prerequisites

- GitHub MCP must be enabled
- User must have merged PRs in the repository

## Workflow

### Step 1: Identify Current User

```
Tool: get_me (GitHub MCP)
```

This returns the GitHub username to use in PR searches.

### Step 2: Fetch Recent Merged PRs

```
Tool: search_pull_requests (GitHub MCP)
Arguments:
  query: "author:{username} is:merged"
  perPage: 20
  sort: "updated"
  order: "desc"
```

### Step 3: Extract Review Comments

For each PR found, fetch the review comments:

```
Tool: pull_request_read (GitHub MCP)
Arguments:
  method: "get_review_comments"
  owner: "Planable"
  repo: "planable-app"
  pullNumber: {pr_number}
  perPage: 50
```

### Step 4: Analyze Feedback Patterns

Look for recurring corrections in the comments. Key patterns to identify:

| Pattern Type     | Keywords to Search                                 |
| ---------------- | -------------------------------------------------- |
| Locator issues   | "bad locator", "getByTestId", "data-cy", "locator" |
| Assertion issues | "assert", "expect", "sandwich", "visibility"       |
| Naming issues    | "camelCase", "rename", "naming"                    |
| Method design    | "object syntax", "params", "return", "getter"      |
| Component issues | "wrong component", "fixture", "already exists"     |
| Test structure   | "texts file", "generate", "DB", "UI creation"      |

Group comments by category and count occurrences.

### Step 5: Synthesize New Rules

For each pattern with **3+ occurrences**:

1. Draft a clear rule statement
2. Read existing `.cursor/skills/e2e-tests/SKILL.md`
3. Check for conflicts or redundancy:
   - If rule already exists → Skip (note as "reinforced")
   - If rule conflicts → Flag for manual review
   - If rule is new → Add to update list

### Step 6: Update Rules File

Append new rules to `.cursor/skills/e2e-tests/SKILL.md`:

Format for each new rule:

````markdown
---

## [Rule Category Name]

[Clear description of the rule]

Bad:

```ts
// Example of what NOT to do
```
````

Good:

```ts
// Example of correct approach
```

````

### Step 7: Run Branch Scan

After updating rules, scan the current branch for violations:

1. Read `.cursor/commands/testing/review-my-branch-e2e.md`
2. Execute the branch review workflow (diff → analyze against Branch Scan Checklist in `.cursor/skills/e2e-tests/SKILL.md` → report → auto-fix)
3. Report violations with counts by category; do not update rules (rules were updated in Step 6)

## Output Format

Provide a comprehensive summary:

```markdown
# QA Maintenance Report

**Date**: [current date]
**User**: [GitHub username]

## PR Analysis

- **PRs analyzed**: X
- **Review comments processed**: X
- **Unique reviewers**: [list]

## Feedback Patterns Found

| Category | Occurrences | Sample Comment |
|----------|-------------|----------------|
| [Category] | X | "[quote]" |

## Rules Update

### New Rules Added
1. [Rule name] - [brief description]

### Existing Rules Reinforced
1. [Rule name] - seen X times in feedback

### Conflicts Detected
- [Any conflicts requiring manual review]

## Current Branch Scan

- **Files scanned**: X
- **Violations found**: X
- **Auto-fixed**: X

### Violations by Category

Group by the sections in the Branch Scan Checklist (`.cursor/skills/e2e-tests/SKILL.md`):

| Category | Count |
|----------|-------|
| Action Sandwich | X |
| ... | ... |

### Remaining Issues
[List any issues that need manual attention]

## Recommendations

- [Any suggestions for improving test quality]
- [Patterns that might need team discussion]
````

## Scheduling Recommendation

Run this maintenance workflow:

- Monthly (recommended)
- After every 10+ merged PRs
- Before major test refactoring efforts
- When onboarding new team members to review standards

## Related Files

- E2E Testing Skill: `.cursor/skills/e2e-tests/SKILL.md`
- POM Patterns: `.cursor/skills/e2e-tests/POM_PATTERNS.md`
- Branch review: `.cursor/commands/testing/review-my-branch-e2e.md`
- Test components: `tests/playwright/support/components/`
- Test generators: `tests/playwright/support/db/generators/`
