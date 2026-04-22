# E2E Test Examples

Practical examples from simple to advanced complexity.

## Simple Examples

### Basic Navigation Test

```typescript
test('should be able to open onboarding section', async ({ page }) => {
  await test.step('Arrange: visit page and check initial state', async () => {
    await page.goto('www.productWithOnboarding.com');
    await expect(page.locator('.mainOnboardingScreen')).not.toBeVisible();
  });

  await test.step('Act: press button', async () => {
    await page.getByTestId('startOnboardingButton').click();
  });

  await test.step('Assert: section becomes visible', async () => {
    await expect(page.locator('.mainOnboardingScreen')).toBeVisible();
  });
});
```

### Form Submission Test

```typescript
test('should greet user based on user name', async ({ page }) => {
  const firstName = 'Alex';
  const lastName = 'Ursu';

  await test.step('Arrange: navigate to onboarding', async () => {
    await page.goto('www.onboardingForProduct.com');
    await page.getByTestId('startOnboardingButton').click();
    await expect(page.getByTestId('mainOnboardingScreen')).toBeVisible();
    await page.getByTestId('firstNameInput').fill(firstName);
    await page.getByTestId('lastNameInput').fill(lastName);
  });

  await test.step('Act: complete onboarding', async () => {
    await page.getByTestId('finishOnboardingButton').click();
  });

  await test.step('Assert: greeting displayed correctly', async () => {
    await expect(page.getByTestId('greetingMessage'))
      .toHaveText(`Greetings ${lastName}, ${firstName}`);
    await expect(page.getByTestId('greetingMessage'))
      .not.toBeVisible({ timeout: 5000 });
  });
});
```

---

## Medium Examples

### Toggle State Test

```typescript
test('toggling mainCheckbox should toggle all other boxes', async ({ page }) => {
  await test.step('Arrange: visit site and check initial state', async () => {
    await page.goto('www.someSiteWithCheckboxes.com');
    await expect(page.getByTestId('mainCheckbox')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-1')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-2')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-3')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-4')).not.toBeChecked();
  });

  await test.step('Act: toggle main checkbox on', async () => {
    await page.getByTestId('mainCheckbox').check();
  });

  await test.step('Assert: all checkboxes checked', async () => {
    await expect(page.getByTestId('mainCheckbox')).toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-1')).toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-2')).toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-3')).toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-4')).toBeChecked();
  });

  await test.step('Act: toggle main checkbox off', async () => {
    await page.getByTestId('mainCheckbox').uncheck();
  });

  await test.step('Assert: all checkboxes unchecked', async () => {
    await expect(page.getByTestId('mainCheckbox')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-1')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-2')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-3')).not.toBeChecked();
    await expect(page.getByTestId('secondaryCheckbox-4')).not.toBeChecked();
  });
});
```

---

## Advanced Examples

### Full Feature Test with Data Generation

```typescript
test('Display options for medias in progress state', async ({
  page,
  generateData: data,
  onPlanableUrl,
  onFeedPost,
  expectMinimongo
}) => {
  const { ids, pageIds } = data;
  const pageId = pageIds[0];

  if (!pageId) {
    throw Error('No page found');
  }

  const postId = Random.id();

  await test.step('Arrange: generate post with media in processing', async () => {
    await generatePost({
      ...createQuickPost(data.ids.workspaceId, pageId, data.ids.userId, plainText),
      mediaType: 'single-image',
      _id: postId,
      images: [
        {
          mediaType: 'image',
          mediaLibraryId: 'zkX5uW5c38Kpi67sG',
          creatorId: 'XKD7vGompnTYsyqSx',
          mediaStatus: 'processing',
          size: 94234,
          blobUrl: 'blob:https://app.planable.io/cca843ec-aecf-41d1-8765-a5743774b54a',
          uuid: 'oz3cAFXjwQkZvrX4s',
          type: 'image/jpeg',
          name: 'Save the Date!.jpg'
        }
      ]
    });
  });

  await test.step('Arrange: navigate to workspace', async () => {
    await onPlanableUrl.navigateToFeedView({ workspaceId: ids.workspaceId, pageId: pageIds[0]! });
    await expectMinimongo(async query => {
      const posts = await query.Posts(page);
      expect(posts).toHaveLength(1);
    });
  });

  await test.step('Act: hover on processing media', async () => {
    await expect(onFeedPost.getFeedPost(postId)).toBeVisible();
    await onFeedPost.getFeedPost(postId).hover();
  });

  await test.step('Assert: options for media in progress are displayed', async () => {
    await expect(onFeedPost.getPostMediaPreview(postId)).toBeVisible();
    await expect(onFeedPost.getPostLeftButtons(postId)).toBeVisible();
    await expect(onFeedPost.getPostRightButtons(postId)).toBeVisible();
  });
});
```

---

## Visual Test Examples

### Component States

```typescript
test('post card visual states', async ({
  generateData: data,
  onPlanableUrl,
  onFeedPost
}) => {
  const { ids, pageIds } = data;
  const pageId = pageIds[0]!;

  await test.step('Arrange: navigate to workspace', async () => {
    await onPlanableUrl.navigateToFeedView({ workspaceId: ids.workspaceId, pageId });
  });

  await test.step('Screenshot: default state', async () => {
    await argosComponentScreenshot({
      locator: onFeedPost.getFeedPost(postId),
      name: 'post-card-default'
    });
  });

  await test.step('Act: hover post', async () => {
    await onFeedPost.getFeedPost(postId).hover();
  });

  await test.step('Screenshot: hover state', async () => {
    await argosComponentScreenshot({
      locator: onFeedPost.getFeedPost(postId),
      name: 'post-card-hover'
    });
  });
});
```

### Empty State

```typescript
test('media library empty state', async ({
  generateData: data,
  onPlanableUrl,
  onMediaLibrary
}) => {
  const { ids, pageIds } = data;
  const pageId = pageIds[0]!;

  await test.step('Arrange: navigate to empty media library', async () => {
    await onPlanableUrl.navigateToFeedView({ workspaceId: data.ids.workspaceId, pageId: data.pageIds[0]! });
    await onMediaLibrary.open();
    await onMediaLibrary.assertEmpty();
  });

  await test.step('Assert: empty state visible', async () => {
    await onMediaLibrary.assertEmpty();
  });

  await test.step('Screenshot: empty state', async () => {
    await argosFullScreenshot({ name: 'media-library-empty' });
  });
});
```

---

## Action Sandwich Examples

### Hover to Reveal

```typescript
await test.step('Reveal hidden delete button', async () => {
  await expect(page.getByTestId('deleteButton')).not.toBeVisible();
  await page.getByTestId('postCard').hover();
  await expect(page.getByTestId('deleteButton')).toBeVisible();
});
```

### Modal Flow

```typescript
await test.step('Open and fill modal', async () => {
  await expect(page.getByTestId('modal')).not.toBeAttached();
  await page.getByTestId('openModalButton').click();
  await expect(page.getByTestId('modal')).toBeVisible();

  await expect(page.getByTestId('submitButton')).toBeDisabled();
  await page.getByTestId('modalInput').fill('test value');
  await expect(page.getByTestId('submitButton')).toBeEnabled();

  await page.getByTestId('submitButton').click();
  await expect(page.getByTestId('modal')).not.toBeVisible();
});
```

### Status Transition

```typescript
await test.step('Approve post', async () => {
  const post = onFeedPost.getPostById(postId);
  await expect(post).toHaveAttribute('data-status', 'draft');

  await post.hover();
  await expect(page.getByTestId(`approveButton-${postId}`)).toBeVisible();
  await page.getByTestId(`approveButton-${postId}`).click();

  await expect(post).toHaveAttribute('data-status', 'approved');
});
```

---

## Selection State Examples

### Using data-selected Attribute

```typescript
await test.step('Select media item', async () => {
  const thumbnail = onMediaLibrary.getMediaThumbnail(mediaId);

  // Assert initial unselected state
  await expect(thumbnail).toHaveAttribute('data-selected', 'false');

  // Click to select
  await thumbnail.click();

  // Assert selected state
  await expect(thumbnail).toHaveAttribute('data-selected', 'true');
});

await test.step('Deselect media item', async () => {
  const thumbnail = onMediaLibrary.getMediaThumbnail(mediaId);

  // Assert currently selected
  await expect(thumbnail).toHaveAttribute('data-selected', 'true');

  // Click to deselect
  await thumbnail.click();

  // Assert deselected state
  await expect(thumbnail).toHaveAttribute('data-selected', 'false');
});
```

### Multi-Select with data Attributes

```typescript
await test.step('Select multiple items', async () => {
  const item1 = onList.getItemById(id1);
  const item2 = onList.getItemById(id2);
  const item3 = onList.getItemById(id3);

  // Assert all unselected initially
  await expect(item1).toHaveAttribute('data-selected', 'false');
  await expect(item2).toHaveAttribute('data-selected', 'false');
  await expect(item3).toHaveAttribute('data-selected', 'false');

  // Select first two items
  await item1.click();
  await item2.click({ modifiers: ['Shift'] });

  // Assert correct selection state
  await expect(item1).toHaveAttribute('data-selected', 'true');
  await expect(item2).toHaveAttribute('data-selected', 'true');
  await expect(item3).toHaveAttribute('data-selected', 'false');
});
```

---

## Negative Assertion Examples

### Tab Selection

```typescript
await test.step('Select Stories tab', async () => {
  await onTabs.selectTab('stories');

  // Use data-selected attribute (preferred over aria-selected when available)
  await expect(onTabs.getTab('stories')).toHaveAttribute('data-selected', 'true');
  await expect(onTabs.getTab('all')).toHaveAttribute('data-selected', 'false');
  await expect(onTabs.getTab('posts')).toHaveAttribute('data-selected', 'false');
  await expect(onTabs.getTab('reels')).toHaveAttribute('data-selected', 'false');

  await expect(page.getByTestId('storiesContent')).toBeVisible();
  await expect(page.getByTestId('postsContent')).not.toBeVisible();
  await expect(page.getByTestId('reelsContent')).not.toBeVisible();
});
```

### Delete Last Item

```typescript
await test.step('Delete last comment shows empty state', async () => {
  await expect(onComments.getCommentById(commentId)).toBeVisible();
  await expect(page.getByTestId('emptyState')).not.toBeVisible();

  await onComments.deleteComment({ commentId });

  await expect(onComments.getCommentById(commentId)).not.toBeAttached();
  await expect(page.getByTestId('emptyState')).toBeVisible();
});
```

---

## Calendar/Time-Sensitive Test

```typescript
test('post appears at correct time in calendar', async ({
  freezeTime,
  generateData: data,
  onPlanableUrl,
  onCalendar
}) => {
  const { ids } = data;
  const postId = Random.id();
  const scheduledTime = new Date('2024-03-15T14:30:00Z');

  await test.step('Arrange: freeze time and create scheduled post', async () => {
    await freezeTime('2024-03-15T10:00:00Z');

    await generatePost({
      _id: postId,
      workspaceId: ids.workspaceId,
      scheduledAt: scheduledTime,
      status: 'scheduled'
    });
  });

  await test.step('Arrange: navigate to calendar view', async () => {
    await onPlanableUrl.navigateToCalendar({ workspaceId: ids.workspaceId });
    await onCalendar.assertVisibility();
  });

  await test.step('Assert: post in correct time slot', async () => {
    const postElement = onCalendar.getPostById(postId);
    await expect(postElement).toBeVisible();
    await expect(postElement).toHaveAttribute('data-time', '14:30');
  });
});
```

---

## Permission Test

```typescript
test('user without approve permission cannot approve posts', async ({
  generateData: data,
  onDashboard,
  onFeedPost
}) => {
  const { ids, userId } = data;
  const postId = Random.id();

  await test.step('Arrange: set limited permissions', async () => {
    await updateUserWorkspacePermissions(userId, ids.workspaceId, {
      permissions: ['VIEW']
    });

    await generatePost({
      _id: postId,
      workspaceId: ids.workspaceId,
      status: 'draft'
    });
  });

  await test.step('Arrange: navigate to workspace', async () => {
    await onPlanableUrl.navigateToFeedView({ workspaceId: ids.workspaceId, pageId: pageIds[0]! });
  });

  await test.step('Assert: approve button not visible', async () => {
    const post = onFeedPost.getPostById(postId);
    await expect(post).toBeVisible();
    await post.hover();
    await expect(page.getByTestId(`approveButton-${postId}`)).not.toBeAttached();
  });
});
```

---

## Form Validation Test

```typescript
test('form shows validation errors', async ({ page, onForm }) => {
  await test.step('Arrange: open form', async () => {
    await onForm.open();
  });

  await test.step('Act: submit empty form', async () => {
    await onForm.submit();
  });

  await test.step('Assert: validation errors shown', async () => {
    await expect(page.getByTestId('nameError')).toBeVisible();
    await expect(page.getByTestId('nameError')).toHaveText('Name is required');
    await expect(page.getByTestId('emailError')).toBeVisible();
    await expect(page.getByTestId('emailError')).toHaveText('Email is required');
  });

  await test.step('Act: fill valid name', async () => {
    await page.getByTestId('nameInput').fill('Test User');
  });

  await test.step('Assert: name error cleared', async () => {
    await expect(page.getByTestId('nameError')).not.toBeVisible();
    await expect(page.getByTestId('emailError')).toBeVisible();
  });

  await test.step('Act: fill valid email and submit', async () => {
    await page.getByTestId('emailInput').fill('test@example.com');
    await onForm.submit();
  });

  await test.step('Assert: form submitted successfully', async () => {
    await expect(page.getByTestId('successMessage')).toBeVisible();
    await onForm.assertVisibility(false);
  });
});
```
