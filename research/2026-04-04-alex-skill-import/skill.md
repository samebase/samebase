---
name: e2e-tests
description: Write Playwright E2E tests, visual tests, and POM components following Planable conventions. Use when asked to write E2E tests, create visual tests, build page object components, or debug test failures.
---

# E2E & Visual Testing with Playwright

- We generate data in DB for our test.
- We assume data is generated correctly. This should be validated in unit tests.
- We test the UI and behavior of the app.
- We do not test external APIs, webhooks, etc. This should be validated in unit tests.
- We do not test analytics, error tracking, etc. This is currently not tested.

## When to Use

Use this skill when:

- Writing E2E functional tests for user flows
- Writing visual regression tests
- Creating or modifying Page Object Model (POM) components
- Debugging flaky or failing tests
- Asked to test UI interactions, state transitions, or navigation

## Test Type Classification

### When to Write Visual Tests

Visual tests capture screenshots for regression detection. Use them for:

| Scenario                | Examples                                            |
| ----------------------- | --------------------------------------------------- |
| **Component states**    | Empty, loading, populated, error, disabled          |
| **Content variations**  | Text, image, video, carousel, different media types |
| **Responsive layouts**  | Desktop, mobile, tablet viewports                   |
| **Static UI rendering** | Cards, badges, avatars, headers                     |

**Visual test characteristics:**

- Component only renders data (no complex interactions)
- Focus is on "does it look right?"
- Uses `argosComponentScreenshot` or `argosFullScreenshot`

**When adding new UI components** (e.g. upsell banners, modals, cards), add at least one visual test to capture the default/visible state.

**File location:** `tests/playwright/integration/visual/`
**Naming:** `{featureName}_{scenario}.ts`
**Important** No nested folders in visual/ directory. - Our stacking mechanism relies on the folder structure to be flat.

### When to Write Functional E2E Tests

Functional tests verify behavior and user flows. Use them for:

| Scenario              | Examples                                      |
| --------------------- | --------------------------------------------- |
| **User interactions** | Click, hover, fill, keyboard shortcuts        |
| **State transitions** | Status changes (draft → approved → published) |
| **Contained flows**   | Not dependent on external APIs, webhooks, etc |
| **Navigation flows**  | Tab switching, URL changes, deep linking      |
| **CRUD operations**   | Create, update, delete visible in UI          |
| **Selection/focus**   | Item selection, keyboard navigation           |

**Functional test characteristics:**

- Component has click/hover/focus handlers
- Tests "does the behavior work?"
- Verifies state changes after actions

**File location:** `tests/playwright/integration/`
**Naming:** `{featureName}_{behavior}_spec.ts`

### What Cannot Be E2E Tested

These require unit tests with mocks instead:

- External API calls (Meta, Google, TikTok, LinkedIn, Pinterest)
- Webhook reception (external triggers)
- Real-time sync from external sources
- Email/notification delivery
- Payment processing
- OAuth flows with real providers
- Analytics tracking (Mixpanel, Horizon, etc.)

---

## Core Concepts

### Locator

A way to find element(s) on the page at any moment. Playwright's locators have built-in auto-waiting and retry-ability.

### Page

A tab in a browser. One browser instance might have multiple page instances.

### Actions

Ways a user can interact with the page:

- `click`, `hover`, `fill`, `press`, `scroll`, `navigate`

### Assertions

Check state of DOM or browser:

- `toBeVisible()`, `toHaveClass()`, `toContainText()`, `toBeFocused()`, `toBeChecked()`

---

## Test Structure: Arrange, Act, Assert

Every test follows this three-part structure:

### Arrange

Set up the test context:

1. **Database state** — Generate only the minimum data the test exercises. If the test doesn't assert on or interact with an entity, don't seed it. For example, a folder rename test needs a folder — not media inside it.
2. **UI state** — Navigate to the component under test

### Act

Execute the trigger you want to test:

- Click a button, hover an icon, press a keyboard shortcut, visit a URL

### Assert

Verify the expected outcome:

- Is something present in the DOM?
- Is a button disabled?
- Does an error message appear and disappear?

### Using test.step

Group related commands for better readability and debugging:

```typescript
test('should not be able to upload GIF', async ({ page }) => {
  await test.step('Navigate to upload form', async () => {
    await onPlanableUrl.navigateToFeedView({ workspaceId, pageId: pageIds[0]! });
    await onMediaLibrary.open();
    await onMediaLibrary.assertEmpty();
  });

  await test.step('Attempt GIF upload', async () => {
    await onMediaLibrary.uploadFile('test.gif');
  });

  await test.step('Assert upload failed', async () => {
    await expect(page.getByTestId('errorMessage')).toBeVisible();
    await expect(page.getByTestId('errorMessage')).toHaveText('GIF NOT ALLOWED');
    await expect(page.getByTestId('errorMessage')).not.toBeVisible();
    await onMediaLibrary.assertEmpty();
  });
});
```

### Loops Inside Tests

Avoid loops that execute full scenarios inside a single `test()`. If each loop iteration does its own arrange, act, and assert flow, that is not one test scenario anymore. Split it into separate `test()` cases by looping at the `describe` level instead.

Loops inside a test are acceptable only when the loop supports one scenario and does not create separate scenario-level results.
Scenarios where the purpose is to test multiple instances of the same entity are allowed to be tested in a single test.

Good use of loops inside a test:

- Repeating a small action that is part of the same scenario
- Clicking a list of checkboxes
- Selecting multiple items from the same control
- Asserting the same UI state for a short list of related elements
- Seeding multiple records that are all required for one scenario

Acceptable exceptions:

- Sequential state transitions on the same entity are allowed when the scenario is that one entity can move through multiple states correctly in one session.
- Composite visual states are allowed when the value of the test is the combined rendered screen, not the individual variants inside it.
- Aggregate or matrix states are allowed when the loop is building or lightly verifying one combined state, such as one tab, one sidebar, or one overflow layout.
- Repeated lightweight checks across variants are allowed only when each iteration avoids heavy setup. A lightweight iteration does not re-seed data, re-run a full save/submit flow, or re-run a full navigation/open/close workflow from scratch.

Bad use of loops inside a test:

- Navigating to multiple workspaces and running the full scenario in each one
- Uploading/importing separate datasets and fully asserting each one in the same `test()`
- Repeating complete arrange → act → assert flows for multiple variants

Rule of thumb: a loop inside a test should only perform a small action within the scenario, not the scenario itself. When the variation is the scenario, generate separate tests.

```typescript
// Bad: three scenarios hidden inside one test
test('imports CSV in all timezones', async ({ ...fixtures }) => {
  for (const timezone of ['Europe/Chisinau', 'Europe/London', 'Pacific/Tahiti']) {
    await seedWorkspace(timezone);
    await navigateToWorkspace(timezone);
    await importCsv();
    await assertImportedDate(timezone);
  }
});

// Good: one scenario per test
for (const timezone of ['Europe/Chisinau', 'Europe/London', 'Pacific/Tahiti']) {
  test(`imports CSV in ${timezone}`, async ({ ...fixtures }) => {
    await seedWorkspace(timezone);
    await navigateToWorkspace(timezone);
    await importCsv();
    await assertImportedDate(timezone);
  });
}
```

### Negative Assertions

Always include negative assertions. If testing tab selection:

```typescript
await test.step('Select Reels tab', async () => {
  await onTabs.selectTab('reels');

  await expect(onTabs.getTab('reels')).toHaveAttribute('data-selected', 'true');
  await expect(onTabs.getTab('all')).toHaveAttribute('data-selected', 'false');
  await expect(onTabs.getTab('posts')).toHaveAttribute('data-selected', 'false');
  await expect(onTabs.getTab('stories')).toHaveAttribute('data-selected', 'false');

  await expect(page.getByTestId('reelsList')).toBeVisible();
  await expect(page.getByTestId('postsList')).not.toBeVisible();
  await expect(page.getByTestId('storiesList')).not.toBeVisible();
});
```

---

## Locator Rules

### Use data-cy Attributes Exclusively

```typescript
// Good
page.getByTestId('engagementSidebarHeader');
page.getByTestId(`approveButton-${postId}`);

// Bad
page.locator('div .mainNavbar');
page.locator('.mediaLibraryHeader');
```

### Prefer getByTestId Over locator

```typescript
// These are equivalent, but prefer getByTestId
page.locator('[data-cy="SOME_VALUE"]');
page.getByTestId('SOME_VALUE'); // Preferred
```

### External Package Exception

Only use class selectors for external packages that don't support data attributes:

```typescript
// Acceptable for external packages only
page.locator('.ant-modal-content');
page.locator('.radix-tooltip');
```

### data-cy Naming Conventions

```typescript
// Unique locators: camelCase
data-cy="navigationSidebar"
data-cy="backToDashboardButton"

// Non-unique locators: include ID with hyphen separator
data-cy={`approveButton-${postId}`}
data-cy={`comment-${commentId}`}

// a unique locator is something that is used only once in the page.
// // example: sidebar, navbar, header, footer, modal, single button.
// a non-unique locator is usually in the context of a list of items
// // example : list of comments, list of posts, list of workspaces etc.

// Bad: ID without context
data-cy={commentId}  // Not clear what we're targeting
```

### State Attributes (data-\* for testing)

When testing element states (selected, active, disabled, etc.), prefer adding `data-*` attributes to source components instead of using regex on CSS classes:

```typescript
// Good: use data attributes for state
data-selected={isSelected}
data-active={isActive}
data-expanded={isExpanded}

// In tests:
await expect(element).toHaveAttribute('data-selected', 'true');
await expect(element).toHaveAttribute('data-selected', 'false');

// Bad: regex matching on CSS classes
await expect(element).toHaveClass(/selected/);
await expect(element).not.toHaveClass(/selected/);
```

**Why data attributes are better:**

- Explicit boolean values (`'true'`/`'false'`) are clearer than class presence/absence
- No risk of partial class name matches (e.g., `/selected/` matching `unselected`)
- Decouples test selectors from styling implementation
- Easier to read and maintain

**When to add data attributes to source components:**
If a test needs to verify element state and no suitable `data-*` attribute exists, add one to the source component rather than using regex on classes.

### Avoid .nth(index)

Use semantic filtering instead:

```typescript
// Bad
locator.nth(2);

// Good - filter by unique text
locator.filter({ hasText: 'Workspace Name' });

// Good - locate by type/ID embedded in data-cy
page.getByTestId(`notificationItem-${activityType}`);

// .nth() only when:
// 1. No data-cy exists AND no unique selector exists AND no meaningful text for filtering
// Prefer adding a type/ID-based data-cy attribute to the component over using .nth()
```

### Absence Assertions

```typescript
// Good
await expect(element).not.toBeAttached();

// Avoid
await expect(elements).toHaveCount(0);
```

---

## Action Sandwich Pattern

**Always sandwich actions between assertions.** This is the #1 way to prevent flaky tests.

### Bad Example

```typescript
page.locator('section').hover();
page.getByTestId('hiddenButton').click();
page.getByTestId('modalInput').fill('text');
page.getByTestId('submitButton').click();
expect(page.getByTestId('form')).not.toBeVisible();
```

### Good Example

```typescript
// Action 1: Hover to reveal hidden button
await expect(page.getByTestId('hiddenButton')).not.toBeVisible();
await page.locator('section').hover();
await expect(page.getByTestId('hiddenButton')).toBeVisible();

// Action 2: Click to open modal
await expect(page.getByTestId('modalInput')).not.toBeAttached();
await page.getByTestId('hiddenButton').click();
await expect(page.getByTestId('modalInput')).toBeVisible();

// Action 3: Fill to enable submit
await expect(page.getByTestId('submitButton')).not.toBeEnabled();
await page.getByTestId('modalInput').fill('some-value');
await expect(page.getByTestId('submitButton')).toBeEnabled();

// Action 4: Submit form
await expect(page.getByTestId('form')).toBeVisible();
await page.getByTestId('submitButton').click();
await expect(page.getByTestId('form')).not.toBeVisible();
```

---

## POM Component Guidelines

See [POM_PATTERNS.md](./POM_PATTERNS.md) for detailed patterns and templates.

### Quick Reference

| Rule            | Convention                                         |
| --------------- | -------------------------------------------------- |
| Location        | `tests/playwright/support/components/`             |
| Required method | `assertVisibility(boolean)`                        |
| Action methods  | Start with verb (`openModal`, `selectCard`)        |
| Getter methods  | Start with `get` (`getPostById`, `getReplyButton`) |
| Actions         | Self-contained with action sandwich                |
| Return values   | Actions don't return, getters can                  |
| Naming          | Avoid component name in members                    |

### Component Template

```typescript
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class FeatureComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = this.page.getByTestId('featureContainer');
    this.saveButton = this.page.getByTestId('saveButton');
  }

  async assertVisibility(visibility = true) {
    if (visibility) {
      await expect(this.container).toBeVisible();
    } else {
      await expect(this.container).not.toBeVisible();
    }
  }

  getItemById(id: string): Locator {
    return this.page.getByTestId(`item-${id}`);
  }

  async saveItem({ id }: { id: string }) {
    await expect(this.getItemById(id)).toHaveAttribute('data-saved', 'false');
    await this.saveButton.click();
    await expect(this.getItemById(id)).toHaveAttribute('data-saved', 'true');
  }
}
```

### Method Naming

```typescript
// Good: verb-prefixed action methods
onFilters.selectCustomView('viewName');
onModal.openSettings();
onPost.approvePost(postId);

// Bad: unclear what happens
onFilters.customView('viewName');

// Good: get-prefixed locator methods in case of non-unique locators
getReplyButton(commentId);
getPostById(postId);

// Bad: not clear we're getting a locator
replyButton(commentId);
```

### Method Behavior

- **Avoid**: One method doing multiple actions with inline assertions for each step.
- **Good**: Implement each action as a separate method with its own action sandwich; call them explicitly in tests: `action1()`, `action2()`.
- **Method name matches behavior** — The implementation must match the user intent (e.g. real openDropdown, not file upload). Avoid shortcuts that bypass the real interaction. Name methods for user intent, not code behavior:

```typescript
// Good: openDropdown, selectTime, closeDropdown — explains user intent
// Bad: clickDropdownTriggerButton, clickTimeCell, triggerDropdownClose — describes code behavior
```

- **Assert methods verify state only** — They must not perform navigation or actions. Use explicit action method + inline assert when you need both.
- **No one-use assertion helpers** — If an assert method is only called from one place, inline the assertion there (e.g. inside the action method) instead of a separate method.

```typescript
// Bad: multi-step method with inline assertions
async multiStepFlow() {
  await expect(...).toBeVisible();
  await this.doAction1();
  await expect(...).toBeVisible();
  await this.doAction2();
  await expect(...).toBeVisible();
}

// Good: separate methods, explicit in test
async action1() {
  await expect(...).toBeVisible();
  await this.doAction1();
  await expect(...).toBeVisible();
}
async action2() { /* same pattern */ }
// In test: await comp.action1(); await comp.action2();
```

### Consolidate Symmetric Methods

When two POM methods share the same flow but differ only in the final step (e.g., confirm vs dismiss, check vs uncheck), combine them into a single method with a parameter:

- **Toggle pattern:** Use `toggleX({ finalState: 'checked' | 'unchecked' })` instead of separate `checkX` / `uncheckX`.
- **Confirm/cancel pattern:** Use `action({ confirm: true })` (default) instead of separate `doAction` / `cancelAction`.

```typescript
// Bad: two methods with identical flow except final step
async checkPermission({ userId, column }) { /* ... click ... assert checked */ }
async uncheckPermission({ userId, column }) { /* ... click ... assert unchecked */ }

// Good: single method with finalState parameter
async togglePermission({ userId, column, finalState }: {
  userId: string; column: PermissionColumn; finalState: 'checked' | 'unchecked'
}) {
  const checkbox = this.getPermissionCheckbox(userId, column);
  const initialState = finalState === 'checked' ? 'unchecked' : 'checked';
  await expect(checkbox).toHaveAttribute('data-state', initialState);
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('data-state', finalState);
}

// Bad: separate confirm/cancel methods
async removeMember({ userId }) { /* ... confirm dialog */ }
async cancelRemoveMember({ userId }) { /* ... dismiss dialog */ }

// Good: single method with confirm parameter
async removeMember({ userId, confirm = true }: { userId: string; confirm?: boolean }) {
  await this.openMemberActions({ userId });
  await this.removeFromWorkspaceAction.click();
  if (confirm) {
    await this.confirmDialog();
    await expect(this.getMembersRow(userId)).not.toBeAttached();
  } else {
    await this.dismissDialog();
    await expect(this.getMembersRow(userId)).toBeVisible();
  }
}
```

### Avoid Redundancy

```typescript
// Bad: repeating component name
onComposer.composerButton;
onComposer.addComposerPage(pageId);
onPinturaModal.pinturaFooter;

// Good: clear and concise
onComposer.saveButton;
onComposer.addPage(pageId);
onPinturaModal.footer;
```

---

## Fixtures

### Default: generateData

Use for most tests:

```typescript
test('creates post', async ({ generateData: data, onComposer }) => {
  const { ids, pageIds } = data;
  // Test implementation
});
```

### Specialized Fixtures

| Fixture          | Use Case                             |
| ---------------- | ------------------------------------ |
| `generateData`   | Default for all tests                |
| `analyticsData`  | PostAnalytics, PageAnalytics tests   |
| `engagementData` | Engagement feature tests             |
| `addonData`      | Tests with multiple addons           |
| `baseFixture`    | No scenario needed (sign-in/sign-up) |
| `freezeTime`     | Calendar view, scheduled posts       |

**Prefer extending existing fixtures over creating new ones.** For analytics workspace status, addon plans, or BTTP data, use `addon_fixture` (with `analyticsData`, `generateBttpData`, `grantedAnalyticsForAllWorkspaces`) instead of introducing a new fixture.

### Using freezeTime

FreezeTime is a fixture that freezes the time to a specific date. This is useful for tests that are time-sensitive.

Most often these are used in visual tests which display some time-based information.

- Calendar view
- Scheduled time
- Text like "notification sent at 10:00 AM"

```typescript
test('displays post in calendar', async ({ freezeTime, generateData }) => {
  await freezeTime('2024-03-15T10:00:00Z');
  // Post will always appear in same calendar position
});
```

---

## Data Generation

### Generators Location

`tests/playwright/support/db/generators/`

Keep document generators separate and reusable — move seed/setup here, not inline in tests. Document generator types should align with collection schema; avoid custom invented shapes. Use `Partial<CollectionType>` only when random defaults are sensible (e.g. `PostTimeSlot` where day/hour/color have valid defaults). When all fields are semantically required, use strict types like `Omit<CollectionType, '_id'> & { _id?: string }` so callers must provide every field explicitly.

### Prefer Composable Generators

When a generator creates a parent entity that can have children (e.g., folder with media, conversation with messages), return an object with chainable methods instead of a monolithic seed function.

Bad: `seedFolderWithMedia({ workspaceId, userId, pageId, folderName })` — all-in-one, inflexible.

Good:

```typescript
const folder = await createFolder({ _id: folderId, name: 'My Folder', workspaceId, creatorId: userId });
await folder.addMedia({ fixtureType: 'image', fixture: images.pngs.logo });
```

See `conversations.ts` (`generateConversation` + `generateMessage`) for the reference pattern.

### Snippets

Check `.vscode/e2eGeneration.code-snippets` for code snippets.

### Permission Updates

```typescript
// Workspace permissions
await updateUserWorkspacePermissions(userId, workspaceId, {
  permissions: ['OWNER', 'APPROVE']
});

// Company permissions
await updateUserCompanyPermissions(userId, companyId, ['EDITOR']);
```

### Use Object Parameters

Use object-based parameters for non-trivial methods with multiple arguments.

// Examples of when object-based parameters are not necessary

```typescript
await getPostById('somePostId');
await selectView('grid');
await selectFilter('archived');
```

// Examples of when object-based parameters are necessary

```typescript
// Bad: unclear what arguments mean
generateScheduledAtDate(stableDate, 8, 3, -5);
onMediaLibrary.assertMediaPostsCounter(mediaId1, 0, false);

// Good: self-documenting
generateScheduledAtDate({
  startingDate: stableDate,
  addDays: 8,
  addMinutes: 3,
  addSeconds: -5
});

onMediaLibrary.assertMediaPostsCounter({
  mediaId: mediaId1,
  expectedCount: 0,
  checkCounterVisibility: false
});
```

---

## File Location & Naming

| Test Type      | Location                               | Naming                                                             |
| -------------- | -------------------------------------- | ------------------------------------------------------------------ |
| E2E Functional | `tests/playwright/integration/`        | `{featureName}_spec.ts` (camelCase, e.g. `loginLogout_spec.ts`)    |
| Visual         | `tests/playwright/integration/visual/` | `{featureName}_views.ts` (camelCase, e.g. `mediaLibrary_views.ts`) |

### Visual Test Requirements

Every visual test must include at least one screenshot:

- `argosComponentScreenshot`
- `argosFullScreenshot`

---

## Static Text Management

Store static strings in `tests/playwright/support/texts.ts`:

```typescript
// texts.ts
export const TEXTS = {
  errors: {
    permissionDenied: 'Permission denied',
    notFound: 'Not found'
  },
  buttons: {
    save: 'Save',
    cancel: 'Cancel'
  }
};

// In test
import { TEXTS } from '../support/texts';
await expect(error).toHaveText(TEXTS.errors.permissionDenied);
```

---

## Input Handling

### fill() vs pressSequentially()

```typescript
// Standard text input
await input.fill('text');

// Debounced fields (triggers on each keystroke)
await input.pressSequentially('text');
```

### fill() vs paste methods

```typescript
// Standard input (triggers input/change events)
await input.fill('text');

// Testing paste behavior specifically
await onComposer.pasteItems(items);
```

### Checkboxes

- **Native checkbox** (e.g. antd): Use `setChecked(true)` — it does click + assert.
- **Custom checkbox** (e.g. Radix): `setChecked` fails on custom divs. Use `click()` + explicit assertion after.

---

## Test Naming

```typescript
// Bad: vague terms
'should work properly';
'handles new features correctly';

// Good: specific outcomes
'displays same title as fixture';
'shows error for invalid input';
'disables submit button when form is empty';
```

### Step Descriptions

```typescript
// Bad: describes assertion
await test.step('Verify post exists', async () => { ... });

// Good: describes action
await test.step('Navigate to post', async () => { ... });
```

---

## Animations

For elements that animate, fade, scale, or slide:

```typescript
await stabilizeLocator(locator);
await locator.click();
// or
await argosComponentScreenshot(locator);
```

---

## Dynamic Lists

When interacting with lists (posts, comments, pages, workspaces), always use ID-based methods:

```typescript
// Good: specific element by ID
await onFeed.getPostById(postId).click();
await onSidebar.getWorkspaceItem(workspaceId).hover();

// Bad: position-based
await posts.nth(0).click();
```

### No Inline Dynamic IDs in Test Steps

Never use `page.getByTestId(\`prefix-${id}\`)` directly in test steps. Dynamic IDs must go through POM getter or action methods. This keeps selectors in one place and lets the POM own the action sandwich.

```typescript
// Bad: inline dynamic ID in test
await page.getByTestId(`post-${postId}`).click();
await expect(page.getByTestId(`comment-${commentId}`)).toHaveAttribute('data-selected', 'true');

// Good: POM getter for locators
await expect(onFeed.getPostById(postId)).toBeVisible();
await expect(onThread.getCommentById(commentId)).toHaveAttribute('data-selected', 'true');

// Good: POM action method with built-in sandwich
await onFeed.selectPost(postId);
```

If no POM getter exists for the dynamic `data-cy`, add one to the appropriate component before using it in a test.

### No Inline Locators in POM Methods

All locators must be defined in the constructor — either as static `readonly` properties or as dynamic arrow-function getters. Never create locators inline inside action or assertion methods.

```typescript
// Bad: locator created inline in method
async assertApproverCount(count: number) {
  const rows = this.container.locator('[data-cy^="approver-"]');
  await expect(rows).toHaveCount(count);
}

// Good: locator defined in constructor
constructor(page: Page) {
  this.approverRows = this.container.locator('[data-cy^="approver-"]');
}
async assertApproverCount(count: number) {
  await expect(this.approverRows).toHaveCount(count);
}
```

### Dynamic Locator Getters as Constructor Arrow Functions

Parametrized locator getters must be arrow function properties assigned in the constructor, not class methods. This is the established convention across all POM components.

```typescript
// Bad: class method
getApproverCheckbox(approverId: string): Locator {
  return this.page.getByTestId(`approver-${approverId}`).locator('button[role="checkbox"]');
}

// Good: arrow function property in constructor
readonly getApproverCheckbox: (approverId: string) => Locator;

constructor(page: Page) {
  this.getApproverCheckbox = (approverId: string) =>
    this.page.getByTestId(`approver-${approverId}`).locator('button[role="checkbox"]');
}
```

---

## Running Tests

### Commands

```bash
# Functional tests
meteor npx playwright test tests/playwright/integration/feature_spec.ts -c playwright.config.ts

# Visual tests
meteor npx playwright test tests/playwright/integration/visual/feature.ts -c playwright-visual.config.ts
```

### Config Selection

| Test Location           | Config File                   |
| ----------------------- | ----------------------------- |
| `integration/features/` | `playwright.config.ts`        |
| `integration/visual/`   | `playwright-visual.config.ts` |

---

## Workflow

When writing a test:

1. **Write the test** following patterns in this skill
2. **Run lint and TypeScript** — fix any errors
3. **Check if localhost:4000 is running**
   - If not: `meteor npm run start-test`
4. **Run the test** and check if it passes
5. **If it fails**, fix errors and run again
6. **If it passes**, commit and push

---

## Anti-Patterns

### Never Do

- `waitForTimeout()` unless absolutely required ( hard-coded debounce in code, hard-coded rate limit in code.)
- Text locators for buttons: `getByText('Save')`
- Initialize components in test files (use fixtures)
- Return component instances from action methods
- Manual retry loops (`for (let attempt = 0; attempt < N; attempt++)`) to wait for element state — use `await expect(locator).toBeVisible()` instead, which has built-in Playwright retry logic
- Conditional logic to detect component libraries (e.g. Radix vs AntD) — use a CSS union selector like `'[role="tooltip"]:visible, [data-radix-popper-content-wrapper]:visible'` and let Playwright resolve whichever is present

### Always Do

- Import `expect` from `@playwright/test`
- Use `getByTestId()` for locators
- Use fixtures for component instances
- Prioritize `onPlanableUrl` fixture for navigation whenever possible over raw `page.goto()`
- Prioritize POM locators and methods for element interactions whenever possible over inline `page.getByTestId(...)`
- Include action sandwich in POM methods
- Check if component/helper already exists before creating
- Check similar components (MediaLibraryComponent, composer) before adding methods
- Check `PWUtilsComponent.ts` and similar components before implementing new behavior (including drag/drop helpers when doing DnD)

---

## Branch Scan Checklist

When reviewing changes in `tests/playwright/` (branch scan or PR review), check each file against this checklist. Report violations by category and count.

### Action Sandwich

- [ ] Every POM action has assertion before action
- [ ] Every POM action has assertion after action
- [ ] No bare `.click()` or `.fill()` without surrounding expects — verify before adding redundant expects; `click()` and `setChecked()` already check actionability and visibility (see Special Cases)

### Locator Quality

- [ ] Using `getByTestId('value')` not `locator('[data-cy="value"]')`
- [ ] Using `.filter({ hasText: })` for readable filtering
- [ ] Getter methods only for parametrized locators (e.g. `getElement(id)`) or list items; simple locators as constructor members
- [ ] Using `not.toBeAttached()` for absence, not `toHaveCount(0)`
- [ ] Preferring type/ID-based `data-cy` over `.nth(index)` — add `data-cy={`item-${type}`}` to the component when possible
- [ ] Repeated locators extracted to POM properties — if the same selector (e.g. `page.getByRole('menu')`) is used in multiple places, add it as a `readonly` property on the POM
- [ ] No inline dynamic IDs in test steps — `page.getByTestId(\`prefix-${id}\`)`must go through a POM getter or action method (e.g.`onCalendar.getCalendarPost(postId)`, `onPanel.selectPost(postId)`)
- [ ] No inline locators in POM methods — all locators defined in the constructor (static as `readonly` properties, dynamic as arrow-function getters), never created inside methods
- [ ] Dynamic locator getters use arrow function properties in the constructor, not class methods (e.g. `this.getPost = (id) => ...` not `getPost(id): Locator { ... }`)
- [ ] No split getter chains — if one getter is only consumed by another, combine them into a single getter

### Method Design

- [ ] Methods with 2+ parameters use object syntax `{ param1, param2 }`
- [ ] Action methods do NOT return values
- [ ] No component instances returned from actions (use fixtures)
- [ ] Actions are self-contained; one method = one responsibility
- [ ] Repeated multi-step flows extracted to POM methods — if the same sequence (e.g. open menu → click delete → confirm modal) appears in multiple tests, add a single method on the POM

### Navigation

- [ ] Prioritizing `onPlanableUrl` fixture for navigation whenever possible over raw `page.goto()`
- [ ] Prioritizing POM locators/methods for element interactions whenever possible over inline `page.getByTestId(...)`

### Component Boundaries

- [ ] Methods are in the correct component file
- [ ] Using existing fixtures, not creating new component instances
- [ ] No duplicate methods
- [ ] Prefer extending shared fixtures (e.g. `addon_fixture`) over creating new fixtures for similar scenarios

### Test Structure

- [ ] Static strings in `texts.ts`, not hardcoded
- [ ] Test data generated via `generateData`, not created via UI
- [ ] Add comments when similar test cases (e.g. "active analytics" vs "granted analytics") have different purposes to avoid confusion
- [ ] E2E tests verify UI/persistence, not DB directly
- [ ] Prefer UI assertions over DB polling for async ops — wait for the UI to reflect state changes (e.g. media reappears in list after restore) rather than polling DB; use `toPass()` for resilient visibility checks if needed
- [ ] Arrange seeds only the minimum data the test exercises — no extra entities unless the test asserts on or interacts with them

### Naming

- [ ] camelCase for all identifiers
- [ ] No vague names ("properly", "correctly"); step descriptions describe actions

### Timeouts

- [ ] No hardcoded timeouts in `expect()`; use Playwright config defaults

### Special Cases

- [ ] Using paste-style methods (e.g. `pasteItems()`) for paste behavior, not `fill()`
- [ ] Using `pressSequentially()` for debounced fields, with explicit timeout for debounce handling
- [ ] No redundant `toHaveValue` after `pressSequentially()`
- [ ] Checkboxes: native (antd) → `setChecked()`; custom (Radix) → `click()` + assertion after
- [ ] Using `resetHoverState(page)` not `page.mouse.move(0, 0)` for clearing hover

### Test-Specific Fixtures Belong in the Test

Fixture generators used by a single spec should live in that spec file (or a co-located helper), not in shared utils like `mediaHelpers.ts`.

Bad: Adding `generateSearchMediaFixtures` to shared mediaHelpers when only mediaLibrarySearch_spec uses it.
Good: Defining the generator at the top of mediaLibrarySearch_spec.ts or in a local mediaLibrarySearch_helpers.ts.

### Avoid Thin Wrappers in POMs

If a POM method is a trivial loop (e.g. one-liner per item), inline it in the test instead.

Bad:

```ts
// In POM
async assertMediaItemsNotAttached({ ids }: { ids: string[] }) {
  for (const id of ids) {
    await expect(this.getMediaItem(id)).not.toBeAttached();
  }
}
```

Good:

```ts
// In test
for (const id of [mediaIds.bratImageId, mediaIds.videoId]) {
  await expect(onMediaLibrary.getMediaItem(id)).not.toBeAttached();
}
```

### No Redundant Assertions After Opening Actions

If an "open" action (e.g. `openMediaLibrary`) already asserts visibility before returning, do not call `assertVisibility()` again in the test.

Bad: `await onNavbar.openMediaLibrary(); await onMediaLibrary.assertVisibility();`
Good: `await onNavbar.openMediaLibrary();` (openMediaLibrary already asserts)

### Review: Verify Act Methods Before Asserting

When reviewing tests, if a test asserts visibility right after an act method (e.g. `openX`, `navigateToY`), check the act method's implementation. If the act method already calls `assertVisibility()` (or equivalent), the test-level assertion is redundant. Remove it to avoid duplicate checks.

### Document or Remove Arbitrary Delays in pressSequentially

Avoid `pressSequentially(text, { delay: 300 })` without explanation. Prefer:

- Default (no delay) and rely on Playwright auto-waiting
- Explicit waits for results (e.g. wait for search results) if debounce causes flakiness

If a delay is necessary, add a short comment explaining why.

### Use resetHoverState Instead of page.mouse.move

Always use `resetHoverState(page)` from `/tests/playwright/support/utils/actions/resetHoverState` instead of `page.mouse.move(0, 0)` to clear hover state before screenshots. The utility handles edge cases and is the project standard.

Bad: `await page.mouse.move(0, 0);`
Good: `await resetHoverState(page);`

### Radix Tooltip with appendToBody={false}: Use getByRole

When a Radix Tooltip/Popover uses `appendToBody={false}`, Radix may render duplicate content nodes in the DOM. Using `getByTestId` alone can match multiple elements (strict mode violation). Add an `aria-label` to the component and locate it with `getByRole('tooltip', { name: '...' })` instead.

Bad: `this.page.getByTestId('myTooltip')` — matches 2 nodes
Good: `this.page.getByRole('tooltip', { name: 'My tooltip label' })` — unique match via aria-label

### No Redundant toHaveValue After pressSequentially

Do not assert `toHaveValue` immediately after `pressSequentially` — the value is guaranteed to be set after the call returns. The assertion adds no value and slows the test.

Bad: `await input.pressSequentially('text'); await expect(input).toHaveValue('text');`
Good: `await input.pressSequentially('text');`

### Narrow Error Filtering in Fixtures

When adding error filters to `failConsoleError` (in `base_fixtures.ts`), never ignore broad error classes (e.g., all TRPC 409 Conflict). Scope the filter to the narrowest URL path possible, since browser console errors only contain the HTTP status line, not the response body.

Bad: `msg.location().url.includes('/trpc/') && msg.text().includes('409 (Conflict)')` — silences all TRPC 409 errors.
Good: `msg.location().url.includes('/trpc/mediaFolders.') && msg.text().includes('409 (Conflict)')` — targets only the specific endpoint.

---

## Related Resources

- [POM_PATTERNS.md](./POM_PATTERNS.md) — Detailed Page Object Model patterns
- [EXAMPLES.md](./EXAMPLES.md) — Test examples collection
- [../playwright-login-navigation/SKILL.md](../playwright-login-navigation/SKILL.md) — Login defaults, `login: false`, and deep-link navigation guidance
- Component location: `tests/playwright/support/components/`
- Generators: `tests/playwright/support/db/generators/`
