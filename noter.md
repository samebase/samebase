---
title: noter.md
description: "Metadata-enabled markdown note"
format: tsx_md
props:
  audience: internal
  feature: markdown-properties
  version: 1
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
