# Page Object Model (POM) Patterns

Detailed patterns for creating and maintaining POM components in Playwright tests.

## Component Structure

### File Location

```
tests/playwright/support/components/
├── {feature}/
│   ├── FeatureMainComponent.ts
│   └── FeatureSubComponent.ts
├── modals/
│   └── FeatureModal.ts
└── ExampleComponent.ts
```

### Base Template

```typescript
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class FeatureComponent {
  readonly page: Page;

  readonly container: Locator;
  readonly header: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = this.page.getByTestId('featureContainer');
    this.header = this.page.getByTestId('featureHeader');
    this.saveButton = this.page.getByTestId('saveButton');
    this.cancelButton = this.page.getByTestId('cancelButton');
  }

  async assertVisibility(visibility = true) {
    if (visibility) {
      await expect(this.container).toBeVisible();
    } else {
      await expect(this.container).not.toBeVisible();
    }
  }
}
```

---

## Required Methods

### assertVisibility

Every component must have this method:

```typescript
async assertVisibility(visibility = true) {
  if (visibility) {
    await expect(this.container).toBeVisible();
  } else {
    await expect(this.container).not.toBeVisible();
  }
}
```

---

## Locator Patterns

### Static Locators (Constructor)

For elements that always exist with the same selector:

```typescript
constructor(page: Page) {
  this.page = page;
  this.saveButton = this.page.getByTestId('saveButton');
  this.header = this.page.getByTestId('header');
}
```

### Dynamic Locators (Getter Methods)

For elements that need runtime values (IDs):

```typescript
getPostById(postId: string): Locator {
  return this.page.getByTestId(`post-${postId}`);
}

getCommentById(commentId: string): Locator {
  return this.page.getByTestId(`comment-${commentId}`);
}

getActionButton({ itemId, action }: { itemId: string; action: string }): Locator {
  return this.page.getByTestId(`${action}Button-${itemId}`);
}
```

### Naming Convention

| Type            | Prefix | Example           |
| --------------- | ------ | ----------------- |
| Dynamic locator | `get`  | `getPostById(id)` |
| Static locator  | none   | `this.saveButton` |

---

## Action Methods

### The Action Sandwich

Every action method MUST follow this pattern:

1. **Assert precondition** — Element is in expected state
2. **Perform action** — Click, fill, etc.
3. **Assert postcondition** — State changed as expected

### Avoid Redundant Actionability Checks

Playwright automatically performs actionability checks before actions like `.click()`, `.fill()`, `.hover()`, etc. These checks verify:

- Element is visible
- Element is attached to DOM
- Element is enabled (for clickable elements)
- Element is stable (not animating)

**DO NOT add redundant checks before actions:**

```typescript
// Bad: redundant visibility check
async submit() {
  await expect(this.submitButton).toBeVisible();
  await expect(this.submitButton).toBeEnabled();
  await this.submitButton.click();
}

// Good: Playwright handles actionability automatically
async submit() {
  await this.submitButton.click();
  await this.assertVisibility(false);
}
```

```typescript
// Bad: redundant visibility check before fill
async fillCalendarUrl(url: string) {
  await expect(this.icalUrlInput).toBeVisible();
  await this.icalUrlInput.fill(url);
}

// Good: fill() automatically checks visibility
async fillCalendarUrl(url: string) {
  await this.icalUrlInput.fill(url);
  await expect(this.icalUrlInput).toHaveValue(url);
}
```

```typescript
// Bad: redundant visibility check before click
async openModal() {
  await expect(this.modalButton).toBeVisible();
  await this.modalButton.click();
}

// Good: click() automatically checks visibility
async openModal() {
  await this.assertVisibility(false); // Assert modal is closed (precondition)
  await this.modalButton.click();
  await this.assertVisibility(true); // Assert modal is open (postcondition)
}
```

**When to add explicit visibility checks:**

- As part of the action sandwich pattern (precondition/postcondition assertions)
- When waiting for elements to appear/disappear after an action (e.g., dropdown menus)
- When asserting state changes that aren't covered by actionability checks

```typescript
// Good: visibility check is part of action sandwich (precondition)
async openModal() {
  await this.assertVisibility(false); // Precondition: modal should be closed
  await this.modalButton.click();
  await this.assertVisibility(true); // Postcondition: modal should be open
}

// Good: waiting for menu to appear after click (not redundant)
async selectVisibility(visibility: ExternalCalendarVisibility) {
  await this.shareAccessDropdownBtn.click();
  await expect(this.shareAccessDropdownMenu).toBeVisible(); // Wait for menu to appear
  const visibilityOption = this.page.getByTestId(`visibility-${visibility}`);
  await visibilityOption.click();
  await expect(this.shareAccessDropdownMenu).not.toBeVisible();
}
```

### Bad Example

```typescript
async clickSaveButton() {
  await this.saveButton.click();
}
```

### Good Example

```typescript
async saveItem({ id }: { id: string }) {
    await expect(this.getItemById(id)).toHaveAttribute('data-saved', 'false');
    await this.saveButton.click();
    await expect(this.getItemById(id)).toHaveAttribute('data-saved', 'true');
  }
```

### Self-Contained Actions

Actions should be complete within the component:

```typescript
// Bad: test has to do the sandwich
// Component
async openModal() {
  await this.modalButton.click();
}

// Test
await expect(onModal.container).not.toBeVisible();
await onSidebar.openModal();
await expect(onModal.container).toBeVisible();

// Good: action is self-contained
// Component
async openModal() {
  const onModal = new ModalComponent(this.page);
  await onModal.assertVisibility(false);
  await this.modalButton.click();
  await onModal.assertVisibility(true);
}

// Test
await onSidebar.openModal();
await onModal.doStuff();
```

### Selection Example

```typescript
// Bad: test repeats sandwich for every select call
async selectCard(id: string) {
  await this.getCard(id).click();
}

// Good: self-contained with proper assertions
async selectCard(id: string) {
  const card = this.getCard(id);
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('data-selected', 'true');
  await card.click();
  await expect(card).toHaveAttribute('data-selected', 'true');
}
```

---

## Method Return Values

### Actions: No Return

Action methods modify state and should NOT return values:
If you need to return a value, it should be a signal for you that you're not doing something right.

```typescript
// Good
async openMediaEditor() {
  await expect(this.mediaButton).toBeVisible();
  await this.mediaButton.click();
  await expect(this.page.getByTestId('mediaEditor')).toBeVisible();
}

// Bad: returning component instance
async openMediaEditor() {
  await this.mediaButton.click();
  return new MediaEditorComponent(this.page);
}
```

Use component fixtures instead:

```typescript
// In test
await onComposer.openMediaEditor();
await onMediaEditor.cropImage();  // Use fixture
```

### Getters: Can Return

Getter methods return locators or computed values:

```typescript
getMediaById(id: string): Locator {
  return this.page.getByTestId(`media-${id}`);
}

async getMediaCount(): Promise<number> {
  return await this.mediaList.count();
}
```

---

## Naming Conventions

### Verb choosing

Good: verbs that describe the user action

- openModal
- closeModal
- selectTab
- selectItem

  Bad: verbs that describe the browser action

- clickButton
- hoverInput

  Borderline: verbs that can be attributed to both user and browser

- fillInput ( both user and browser "fill" input)
- navigateToTab ( both user and browser "navigate" to a tab)

### Method Names

Start action methods with verbs:

```typescript
// Good: clear action verbs
async openModal() { ... }
async closePopover() { ... }
async createEntity() { ... }
async selectItem(id: string) { ... }
async navigateToTab(tab: string) { ... }
async fillInput(value: string) { ... }

// Bad: unclear
async customView(name: string) { ... }  // select? create? view?
async status(id: string) { ... }  // get? set? check?
```

### Assertion Methods

Assertion methods should be used when the action of asserting something is non-trivial and non-ubiquitous playwright code. They should be prefixed with `assert`:

```typescript
async assertVisibility(visible: boolean) { ... }
async assertStatus(expectedStatus: string) { ... }
async assertItemCount(count: number) { ... }
```

Obvious examples:

```typescript
async assertModalOpened() {
  await expect(this.modal).toBeVisible();
}
async assertItemCount(count: number) {
  await expect(this.itemList).toHaveCount(count);
}
```

We don't want to have assert methods for simple clear playwright code.
In those situations, we should just write the code directly in the test since it's easy to read/maintain and the assert method doesn't add much value.

non obvious examples:

```typescript
async assertModalOpened() {
  await expect(this.modal).toBeVisible();
  await expect(this.dialog).to.notHaveCSS('opacity', '0');
  await assertAbsent(this.modalLoader)
} // great method! It's not obvious that we need to assert all these things.
```

### Avoid Deceptive Names

```typescript
// Bad: name says assert but does actions
async assertStatus(postId: string, status: string) {
  await this.getPostById(postId).click();  // Action!
  await this.openModal() // More action! Opened modal!
  await this.assertModalOpened();
  await this.assertPostStatus(status);
}

// Good: name reflects actual behavior
async openPostAndAssertStatus(postId: string, status: string) {
  await this.openPost(postId);
  await this.assertPostStatus(status);
}
```

### Avoid Redundancy

Component context is already known from the variable name:

```typescript
// Bad: repeating component name
onComposer.composerButton
onComposer.addComposerPage(pageId)
onPinturaModal.pinturaFooter
onAnalyticsView.selectAnalyticsCard(card)

// Good: concise
onComposer.saveButton
onComposer.addPage(pageId)
onPinturaModal.footer
onAnalyticsView.selectCard(card)
```

---

## Object Parameters

Use object parameters for methods with multiple arguments:

```typescript
// Bad: unclear what arguments mean
async assertMediaPostsCounter(mediaId: string, count: number, visible: boolean) { ... }
await onMediaLibrary.assertMediaPostsCounter(mediaId1, 0, false);

// Good: self-documenting
async assertMediaPostsCounter({
  mediaId,
  expectedCount,
  checkCounterVisibility
}: {
  mediaId: string;
  expectedCount: number;
  checkCounterVisibility: boolean;
}) { ... }

await onMediaLibrary.assertMediaPostsCounter({
  mediaId: mediaId1,
  expectedCount: 0,
  checkCounterVisibility: false
});
```

### When to Use Object Parameters

Use for:

- Methods with 2+ parameters
- Parameters where meaning isn't obvious from type
- Methods where parameter is not obvious from the method name

Simple cases can use positional:

```typescript
// Fine: single obvious argument
async selectTab(tabName: string) { ... }
await onTabs.selectTab('reels');

// Fine: obvious pattern
async assertVisibility(visible: boolean) { ... }

// Fine: obvious param name
async getPostContainer(postId: string) { ... }
```

---

## Component Boundaries

### Keep Methods in Correct Component

```typescript
// Bad: MediaEditor methods in Composer
class ComposerComponent {
  async cropImage() { ... }  // Should be in MediaEditorComponent
}

// Good: proper separation
class ComposerComponent {
  async openMediaEditor() {
    await this.mediaButton.click();
    await expect(this.page.getByTestId('mediaEditor')).toBeVisible();
  }
}

class MediaEditorComponent {
  async cropImage() { ... }
}
```

### Use Fixtures for Cross-Component

```typescript
// In test
await onComposer.openMediaEditor();
await onMediaEditor.cropImage();
await onMediaEditor.save();
```

### Check Before Adding

Before adding a new method:

1. Check if it already exists in the component
2. Check if it belongs in a different component
3. Check if a similar pattern exists to follow

---

## Fixture Integration

### Don't Initialize in Tests

```typescript
// Bad: initializing component in test
test('test', async ({ page }) => {
  const onComposer = new ComposerComponent(page);
  await onComposer.open();
});

// Good: use fixture
test('test', async ({ onComposer }) => {
  await onComposer.open();
});
```

### Component Fixture Pattern

Components are provided through fixtures defined in the test setup.

---

## Common Patterns

### Toggle State

```typescript
async toggleFeature(enabled: boolean) {
  const toggle = this.featureToggle;
  const currentState = await toggle.getAttribute('aria-checked');

  if ((currentState === 'true') !== enabled) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(enabled));
  }
}
```

### Select from List

```typescript
async selectItem({ itemId }: { itemId: string }) {
  const item = this.getItemById(itemId);
  await expect(item).toBeVisible();
  await expect(item).not.toHaveAttribute('data-selected', 'true');
  await item.click();
  await expect(item).toHaveAttribute('data-selected', 'true');
}
```

### Fill with Validation

```typescript
async fillAndSubmit({ value }: { value: string }) {
  await expect(this.input).toBeVisible();
  await expect(this.submitButton).toBeDisabled();

  await this.input.fill(value);
  await expect(this.submitButton).toBeEnabled();

  await this.submitButton.click();
  await expect(this.container).not.toBeVisible();
}
```

### Navigate and Verify

```typescript
async navigateToTab({ tab }: { tab: string }) {
  const tabButton = this.getTabButton(tab);
  await expect(tabButton).toBeVisible();

  await tabButton.click();

  await expect(tabButton).toHaveAttribute('aria-selected', 'true');
  await expect(this.getTabContent(tab)).toBeVisible();
}
```

---

## State Assertions

### Prefer data Attributes Over Regex

When asserting element state (selected, active, expanded, etc.), use `data-*` attributes instead of regex on CSS classes:

```typescript
// Good: explicit data attribute
await expect(thumbnail).toHaveAttribute('data-selected', 'true');
await expect(thumbnail).toHaveAttribute('data-selected', 'false');

// Bad: regex on CSS class
await expect(thumbnail).toHaveClass(/selected/);
await expect(thumbnail).not.toHaveClass(/selected/);
```

### Adding data Attributes to Source Components

If a test needs to verify element state and no suitable `data-*` attribute exists:

1. Add the attribute to the source component:

```tsx
// In source component
<div
  data-cy={`item-${id}`}
  data-selected={isSelected}
  data-expanded={isExpanded}
>
```

2. Use it in the POM:

```typescript
async selectItem({ id }: { id: string }) {
  const item = this.getItemById(id);
  await expect(item).toHaveAttribute('data-selected', 'false');
  await item.click();
  await expect(item).toHaveAttribute('data-selected', 'true');
}
```

**Benefits:**

- Explicit boolean values are clearer than class presence/absence
- No risk of partial matches (e.g., `/selected/` matching `unselected`)
- Decouples tests from styling implementation
- Easier to read and maintain

---

## Checklist

Before creating/modifying a POM component:

- [ ] File in correct location under `support/components/`
- [ ] Has `assertVisibility(boolean)` method
- [ ] All locators use `getByTestId()` not `locator()`
- [ ] Dynamic locators use `get` prefix
- [ ] Action methods follow action sandwich
- [ ] Action methods don't return values
- [ ] No redundant component names in members
- [ ] Object parameters for multi-arg methods
- [ ] Method doesn't already exist
- [ ] Method is in correct component
- [ ] State assertions use `data-*` attributes, not regex on classes
