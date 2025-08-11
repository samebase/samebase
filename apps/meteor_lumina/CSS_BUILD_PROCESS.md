# CSS Build Process for Production

## Issue
Meteor has compatibility issues with Tailwind CSS v4's `@import "tailwindcss"` syntax in production builds. The browser receives HTML instead of CSS, causing a MIME type error.

## Solution
We use a two-file approach:

1. **`client/main.source.css`** - Source file with Tailwind v4 syntax for development
2. **`client/main.css`** - Processed file used by Meteor in production

## Development Workflow

### For Development
```bash
# Use the source file directly (if needed, copy it back)
cp client/main.source.css client/main.css
npm run dev
```

### For Production Deployment
```bash
# Process the CSS and deploy
npm run deploy
```

This automatically:
1. Processes `client/main.source.css` → `client/main.css`
2. Deploys to Meteor hosting

## Scripts

- `npm run build:css` - Process Tailwind CSS for production
- `npm run deploy` - Build CSS and deploy to production
- `npm run dev` - Run development server

## Files

- **`client/main.source.css`** - Edit this file for CSS changes
- **`client/main.css`** - Generated file, don't edit directly
- **`postcss.config.js`** - PostCSS configuration for processing
