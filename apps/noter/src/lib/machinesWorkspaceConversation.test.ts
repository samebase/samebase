import { describe, expect, it } from 'vite-plus/test'
import { startedDraftConversationThreadMatches } from '@/lib/machinesWorkspaceConversation'

describe('startedDraftConversationThreadMatches', () => {
  it('clears the pending-start guard once the first prompt resolves the started thread', () => {
    expect(
      startedDraftConversationThreadMatches({
        nextThreadId: 'thread-new',
        startedThreadId: 'thread-new',
      }),
    ).toBe(true)
  })

  it('keeps the pending-start guard when the submission did not start a new thread', () => {
    expect(
      startedDraftConversationThreadMatches({
        nextThreadId: 'thread-existing',
        startedThreadId: null,
      }),
    ).toBe(false)
  })
})
