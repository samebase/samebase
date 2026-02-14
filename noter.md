---

simpleView:
  exclude:
    - src/** # Frontend implementation code
    - convex/** # Backend functions
    - node_modules/** # Dependencies
    - dist/** # Build output
    - "**/*.{json,ts,tsx,js,jsx,css,html,yaml,toml,tsbuildinfo,yml}" # Source file extensions
    - Makefile
    - pre-commit
    

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
