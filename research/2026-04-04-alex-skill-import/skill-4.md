---
name: unit-tests
description: Write unit tests for Meteor methods, TRPC routes, services, and React hooks following project conventions. Use when asked to write, create, or add unit tests, or when testing server-side logic, API routes, or hooks.
---

# Writing Unit Tests

## Quick Reference

| Item           | Convention                                     |
| -------------- | ---------------------------------------------- |
| File extension | `*.tests.ts` or `*.tests.tsx` (not `.test.ts`) |
| Assertions     | `assert` from Node.js                          |
| Stubs/mocks    | `sinon` with sandbox pattern                   |
| HTTP mocking   | `nock`                                         |
| Hook testing   | vitest + `@testing-library/react`              |
| Factories      | `imports/test/factories/*`                     |

## Test Environment (Node vs jsdom)

Vitest runs two projects with different environments:

| Suffix        | Environment | Use for                                     |
| ------------- | ----------- | ------------------------------------------- |
| `*.tests.ts`  | Node        | Meteor methods, TRPC routes, services, APIs |
| `*.tests.tsx` | jsdom       | React components, hooks, DOM-dependent code |

## File Structure Template

```typescript
import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import sinon from 'sinon';
// Import factories
import { createCompany } from '/imports/test/factories/companies';
import { createPage } from '/imports/test/factories/pages';
import { createPost } from '/imports/test/factories/posts';
import { buildUserWorkspace, createUser } from '/imports/test/factories/users';
import { createWorkspace } from '/imports/test/factories/workspaces';
// Import the module under test
import { yourMethod } from './yourMethod';

describe('YourModule.methodName', () => {
  const sandbox = sinon.createSandbox();

  const companyId = Random.id();
  const workspaceId = Random.id();
  let user: Meteor.User;

  beforeEach(async () => {
    // 1. Create entities in order of dependencies
    await createCompany({ companyId });
    await createWorkspace({ workspaceId, companyId });
    user = await createUser({
      workspaces: [buildUserWorkspace({ workspaceId, permissions: ['OWNER', 'APPROVE'] })]
    });

    // 2. Stub Meteor auth
    sandbox.stub(Meteor, 'userAsync').resolves(user);
    sandbox.stub(Meteor, 'userId').returns(user._id);

    // 3. Stub time if needed
    sandbox.useFakeTimers({ now: new Date() });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('describes expected behavior', async () => {
    // Arrange - create test-specific data
    const post = await createPost({ workspaceId });

    // Act - call the method
    await yourMethod._execute({ userId: user._id }, { postId: post._id, workspaceId });

    // Assert - verify results
    const updatedPost = await Posts.findOneAsync(post._id);

    assert(updatedPost);
    assert.strictEqual(updatedPost.status, 'expected-status');
  });
});
```

## Factory Patterns

### `buildX` vs `createX`

- **`buildX()`**: Returns a plain object (no DB insertion). Use for building request payloads or nested objects.
- **`createX()`**: Inserts into DB and returns the document. Use for setting up test state.

```typescript
// Build an object without DB insertion
const postData = buildPost({ pageId, workspaceId });

// Create in database
const post = await createPost({ pageId, workspaceId });
```

### Available Factories

| Factory    | Location               | Common Options                                                |
| ---------- | ---------------------- | ------------------------------------------------------------- |
| Users      | `factories/users`      | `createUser`, `buildUserWorkspace`, `createUserWithWorkspace` |
| Workspaces | `factories/workspaces` | `createWorkspace`                                             |
| Companies  | `factories/companies`  | `createCompany`                                               |
| Posts      | `factories/posts`      | `createPost`, `createStory`, `createReels`, `buildPost`       |
| Pages      | `factories/pages`      | `createPage`, `buildPage`                                     |
| Comments   | `factories/comments`   | `createComment`, `createSuggestion`                           |
| Media      | `factories/media`      | `buildImage`, `buildNewTypeVideo`, `buildSuccessfulImage`     |

## Test Patterns by Type

### Meteor Methods

```typescript
describe('Posts.update.status', () => {
  it('updates post status', async () => {
    const post = await createPost({ workspaceId });

    await postsUpdateStatus._execute(
      { userId: user._id },
      { _id: post._id, status: 'approved', workspaceId }
    );

    const updated = await Posts.findOneAsync(post._id);

    assert(updated);
    assert.strictEqual(updated.status, 'approved');
  });

  it('throws if user lacks permission', async () => {
    const otherUser = await createUser({ workspaces: [] });

    await assert.rejects(
      postsUpdateStatus._execute({ userId: otherUser._id }, { _id: Random.id(), workspaceId }),
      /Permission denied/
    );
  });
});
```

### TRPC Routes

```typescript
describe('workspaceRouter', () => {
  let caller: ReturnType<typeof workspacesRouter.createCaller>;

  beforeEach(async () => {
    caller = workspacesRouter.createCaller({
      user: await createUser({
        workspaces: [buildUserWorkspace({ workspaceId })],
        companies: [buildUserCompany({ companyId })]
      })
    });
  });

  it('returns workspaces for company', async () => {
    await createWorkspace({ companyId, workspaceId });

    const { items } = await caller.getForCompany({ companyId, sortBy: 'name' });

    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0]?._id, workspaceId);
  });
});
```

### External API Calls (nock)

```typescript
import nock from 'nock';

describe('TikTokAPI', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('refreshes access token', async () => {
    nock(/open.tiktokapis.com/)
      .post(/oauth\/token/)
      .reply(200, {
        access_token: 'new-token',
        expires_in: 86400
      });

    const result = await TikTokAPI.refreshAccessToken('refresh-token');

    assert.strictEqual(result.access_token, 'new-token');
  });

  it('handles API errors', async () => {
    nock(/business-api.tiktok.com/)
      .get(/endpoint/)
      .reply(200, {
        code: 40002,
        message: 'Something went wrong'
      });

    await assert.rejects(
      TikTokAPI.getData('token'),
      /Something went wrong/
    );
  });
});
```

### React Hooks (vitest + jsdom)

Use the `*.tests.tsx` suffix so tests run in the jsdom Vitest project (see [Test Environment](#test-environment-node-vs-jsdom)).

```typescript
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import useDebounce from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces callback', () => {
    const callback = vi.fn();

    const { result } = renderHook(() => useDebounce(callback, 500));

    act(() => {
      result.current('test');
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(callback).toHaveBeenCalledWith('test');
  });
});
```

## Common Stubs

```typescript
// Auth stubs (almost always needed)
sandbox.stub(Meteor, 'userId').returns(user._id);
sandbox.stub(Meteor, 'userAsync').resolves(user);

// Fake timers
sandbox.useFakeTimers({ now: new Date() });

// S3/file operations
sandbox.stub(S3Helper, 'getS3Url').resolves('https://cdn.example.com/file.jpg');
sandbox.stub(S3Helper, 'createReadableStreamRange').returns(new PassThrough());

// Analytics (stub but don't assert)
sandbox.stub(HorizonUsageAnalytics, 'updateForCompany').resolves();
```

## Assertion Patterns

```typescript
// Equality
assert.strictEqual(actual, expected);
assert.deepStrictEqual(actualObj, expectedObj);

// Truthy checks
assert(value);
assert(value, 'custom error message');

// Error testing
await assert.rejects(asyncFn(), /error message regex/);
await assert.rejects(asyncFn(), { message: 'exact message' });

// No error
await assert.doesNotReject(asyncFn());

// Sinon assertions
sinon.assert.calledOnce(stub);
sinon.assert.calledWith(stub, expectedArg);
sinon.assert.calledOnceWithExactly(stub, arg1, arg2);
```

## Required Test Cases

Every method/function should test:

1. **Success case** - Happy path works correctly
2. **Permission denied** - Unauthorized users are rejected
3. **Not found** - Missing entities handled gracefully
4. **Idempotency** - Repeated calls don't break (when applicable)
5. **Edge cases** - Platform-specific behavior, boundary conditions

## Test Organization Rules

### Avoid single-it describe blocks

Don't wrap a single `it` in a `describe`. Only use `describe` when grouping multiple related tests.

```typescript
// Bad - unnecessary nesting
describe('updatePost', () => {
  describe('when post is archived', () => {
    it('throws error', async () => { ... });
  });
});

// Good - flat structure for single cases
describe('updatePost', () => {
  it('throws error when post is archived', async () => { ... });
});
```

### Assert only what's relevant to each test

Each test should verify only the behavior it's testing. Don't repeat the same assertions across tests.

```typescript
// Bad - repeating assertions
it('approves post', async () => {
  await approvePost(postId);
  const post = await Posts.findOneAsync(postId);
  assert(post);
  assert.strictEqual(post.approved, true);
  assert.strictEqual(post.status, 'default');  // not relevant to approval
  assert.strictEqual(post.archived, false);    // not relevant to approval
});

it('sets approvedBy', async () => {
  await approvePost(postId);
  const post = await Posts.findOneAsync(postId);
  assert(post);
  assert.strictEqual(post.approved, true);     // already tested above
  assert.deepStrictEqual(post.approvedBy, [{ userId: user._id }]);
});

// Good - each test focuses on one thing
it('sets approved to true', async () => {
  await approvePost(postId);
  const post = await Posts.findOneAsync(postId);

  assert(post);
  assert.strictEqual(post.approved, true);
});

it('records who approved', async () => {
  await approvePost(postId);
  const post = await Posts.findOneAsync(postId);

  assert(post);
  assert.deepStrictEqual(post.approvedBy, [{ userId: user._id, approvedAt: new Date() }]);
});
```

### One concept per test

If you find yourself testing multiple behaviors in one test, split them. If behaviors are tightly coupled, test them together but name the test accordingly.

```typescript
// Good - testing coupled behavior together
it('sets approved and records approver', async () => {
  await approvePost(postId);
  const post = await Posts.findOneAsync(postId);

  assert(post);
  assert.strictEqual(post.approved, true);
  assert.deepStrictEqual(post.approvedBy, [{ userId: user._id, approvedAt: new Date() }]);
});
```

## What NOT to Do

- **No manual collection cleanup in `afterEach`** - The database is globally reset before each test. Never add `afterEach` blocks that call `removeAsync({})`, `remove({})`, or similar cleanup on collections. It's redundant and adds noise.
- **Don't stub logging calls just to assert them** - Stub `serverLogger`, `isoLogger` but don't assert
- **Don't assert analytics events** - Stub analytics functions but don't verify calls
- **Don't test implementation details** - Focus on behavior, not internal variables

## Running Tests

```bash
# Single file
npm run test -- path/to/file.tests.ts

# Multiple files (more efficient)
npm run test -- path/to/file1.tests.ts path/to/file2.tests.ts

# With pattern matching
npm run test -- --testNamePattern="describe block name"
```

## Checklist

Before submitting tests:

- [ ] File named `*.tests.ts` (Node) or `*.tests.tsx` (jsdom for React/DOM)
- [ ] Sandbox restored in `afterEach`
- [ ] Meteor auth stubbed when testing authenticated methods
- [ ] Used factories for data creation
- [ ] Empty line between Act and Assert
- [ ] Tests success, error, and edge cases
- [ ] No assertions on logging or analytics
- [ ] No single-it describe blocks (flatten structure)
- [ ] Each test asserts only what's relevant to that case
- [ ] No repeated assertions across tests
