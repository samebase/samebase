---
simpleView:
  include:
    - noter.md
  exclude:
    - noter.md # Simple View config file
    - "**/src/**" # Frontend implementation code
    - "**/convex/**" # Backend functions
    - "**/node_modules/**" # Dependencies
    - "**/dist/**" # Build output
    - src/** # Frontend implementation code
    - convex/** # Backend functions
    - node_modules/** # Dependencies
    - dist/** # Build output
    - "**/*.{json,ts,tsx,js,jsx,cjs,mjs,css,html,yaml,sh}" # Source file extensions
    - tsconfig.base.json
    - Makefile
    - Dockerfile.daytona-deps
    - "**/pre-commit" # Git hooks like .husky/pre-commit
    - "**/.*" # Dotfiles and dotfolders
    - "**/.*/**" # Files inside dotfolders
    - "**/_redirects"    
    - "**/*.{json,ts,tsx,js,jsx,css,html,yaml,toml,tsbuildinfo,yml}" # Source file extensions
    - pre-commit
    - wt # worktree helper
---

# noter.md

At the top of markdown you can define arguments/properties with frontmatter.
This is commonly used to pass metadata to `tsx_md` or other markdown pipelines.

## Frontmatter (recommended)

```md
---
title: Example
props:
  variant: compact
  showToc: true
  tags:
    - docs
    - notes
---
```

## JSON-style metadata (alternative)

```md
<!--
{
  "title": "Example",
  "props": {
    "variant": "compact",
    "showToc": true
  }
}
-->
```

    - "**/*.{ts,tsx,js,jsx,css,html}" # Source file extensions
    - "**/*.{json,ts,tsx,js,jsx,css,html}" # Source file extensions
