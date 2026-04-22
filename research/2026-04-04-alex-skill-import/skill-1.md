---
name: generate-test-description
description: Generate testDescription.md files for Playwright test folders. Analyzes test files to extract describe blocks, test names, and component fixtures (onX pattern), then creates a structured description. Use when asked to generate test descriptions, create testDescription.md, or analyze what a test folder tests.
---

# Generate Test Description

This skill generates `testDescription.md` files for Playwright test folders by analyzing the test files within.

## When to Use

- "Generate test description for [folder]"
- "Create testDescription.md for [folder]"
- "Analyze tests in [folder]"
- "What does this test folder test?"
- When ESLint reports `require-test-description` error

## Workflow

### Step 1: Read All Test Files

Read all test files in the target folder:
- Visual tests: `*_views.ts` files
- Feature tests: `*_spec.ts` files

### Step 2: Extract Information

For each test file, extract:

1. **Describe blocks** - `test.describe('Name', ...)` or `describe('Name', ...)`
2. **Test names** - `test('Name', ...)` or `it('Name', ...)`
3. **Component fixtures (onX pattern)** - These are the key signal for testPicker!

### Step 3: Understanding Component Fixtures

Component fixtures follow the `onX` naming pattern (e.g., `onComposer`, `onMediaLibrary`, `onDashboard`). These are Page Object Model (POM) components that indicate **which parts of the Planable app are being interacted with** in the test.

**Why this matters for testPicker:** When AI analyzes a code diff, it can match changed source files to tests that interact with related app areas via these component fixtures.

Look for component fixtures in:
- Destructured test function parameters: `async ({ onComposer, onMediaLibrary, onFeedView }) => { ... }`
- Any usage of `onX` pattern variables in the test body

**Ignore data generation fixtures** like `generateData`, `expectMinimongo`, `page`, `freezeClock` - these don't indicate app areas.

### Step 4: Generate testDescription.md

Create the file with this format:

```markdown
# [FolderName]

[One-line summary derived from folder name and describe blocks]

## Scenarios Tested
- [Test name 1]
- [Test name 2]
- [Grouped/summarized if many similar tests]

## App Areas Touched
These component fixtures indicate which parts of Planable are tested:
- onComponentName → Brief description of what this component represents
- onAnotherComponent → Brief description

## Test Structure
- [filename1.ts]: X tests
```

## Example

### Input: `tests/playwright/integration/visual/AI/`

Reading `aiPostGenerate_views.ts`:
```typescript
test.describe('Composer AI', () => {
  test('Generate Post with AI', async ({
    page,
    onNavbar,
    onDashboard,
    onComposer,
    generateData: data,
    expectMinimongo
  }) => { ... });

  test('Composer AI views - good rating', async ({
    page,
    onNavbar,
    onDashboard,
    onComposer,
    onAiPanelComponent,
    generateData: data
  }) => { ... });

  test('Feed Post AI views', async ({
    page,
    onPlanableUrl,
    onFeedView,
    onFeedPost,
    onAiPanelComponent,
    generateData: data
  }) => { ... });
});
```

### Output: `testDescription.md`

```markdown
# AI

Tests AI-powered content generation features in the composer and feed view.

## Scenarios Tested
- AI post generation banner visibility
- AI response rating (poor/good)
- Rewrite panel with suggestions
- Hashtag generation panel
- AI caption generation from images
- Feed view AI rewrite and hashtags

## App Areas Touched
These component fixtures indicate which parts of Planable are tested:
- onComposer → Post composer modal for creating/editing posts
- onAiPanelComponent → AI assistant panel for text generation
- onNavbar → Top navigation bar
- onDashboard → Main dashboard/home page
- onFeedView → Feed view displaying posts
- onFeedPost → Individual post component in feed
- onPlanableUrl → URL navigation helpers

## Test Structure
- aiPostGenerate_views.ts: 7 tests
- aiPostGenerateTiktok_views.ts: TikTok-specific AI tests
- aiPinterest_views.ts: Pinterest-specific AI tests
```

## Common Component Fixtures Reference

| Fixture | App Area |
|---------|----------|
| `onComposer` | Post composer modal |
| `onMediaLibrary` | Media library for uploads/files |
| `onFeedView` | Feed view of posts |
| `onCalendar` | Calendar view |
| `onListView` | List view of posts |
| `onDashboard` | Main dashboard |
| `onNavbar` | Top navigation bar |
| `onNavSidebar` | Left navigation sidebar |
| `onPostModal` | Post detail modal |
| `onAnalyticsView` | Analytics dashboard |
| `onEngagementView` | Engagement/Social inbox |
| `onCompanySettings` | Company settings page |
| `onWorkspaceSettingsModal` | Workspace settings |
| `onPricing` | Pricing/upgrade modal |
| `onFilters` | Post filtering sidebar |
| `onLabelsPopover` | Labels management |
| `onCampaignView` | Campaign management |
| `onStoryCarousel` | Story carousel component |
| `onSignInForm` | Login form |
| `onSignUpForm` | Registration form |

## Guidelines

### Summarize Similar Tests

If there are many similar tests, group them:

**Before (too verbose):**
```markdown
## Scenarios Tested
- Post with image on Facebook
- Post with image on Instagram
- Post with image on LinkedIn
```

**After (summarized):**
```markdown
## Scenarios Tested
- Post display with different media types across platforms
```

### Use Planable Terminology

- "Feed view" not "main view"
- "Composer" not "post editor"
- "Approval workflow" not "review process"
- "Social pages" not "accounts"
- "Universal content" or "UC" for blog/website content

### Handle Subfolders

Each subfolder needs its own `testDescription.md`. The description should be specific to that subfolder's tests, not inherited from the parent.

## Validation

After generating, verify:
1. The summary accurately reflects what's tested
2. All major test scenarios are listed
3. All `onX` component fixtures are listed with descriptions
4. Test counts match the actual file contents
