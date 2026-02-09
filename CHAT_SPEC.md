# Chat Agent Feature Specification

## Overview

A floating action button (FAB) chat widget that opens a chat window for users to interact with AI agents. The feature is integrated into the noter app as a way to provide real-time assistance while editing code.

## Current Implementation

### Frontend Component: `ChatFab` (`apps/noter/src/components/ChatFab.tsx`)

- **Location**: Bottom-right corner (fixed positioning)
- **FAB Button**:
  - Shows `MessageSquare` icon when closed
  - Shows `X` icon when open
  - Primary styling when closed, muted when open
- **Chat Window**:
  - 448px width (sm: 384px) on mobile
  - Fixed height of 448px (28rem)
  - Rounded borders with shadow
  - Three sections: header, messages area, input
- **Message Structure**:
  - `id`: UUID
  - `role`: "user" | "assistant"
  - `content`: string
  - **TODO**: Add `model` field to track which LLM generated each message

### Features

- Auto-scrolls to latest message
- Input field focuses automatically when window opens
- Enter key sends message (Shift+Enter for newlines)
- Placeholder echo response (needs real agent integration)
- Only visible to authenticated users (rendered in `<Authenticated>` block in `App.tsx`)

## Integration Points

- **Mounted in**: `App.tsx` inside `<Authenticated>` block
- **State**: Client-side only (in-memory)
- **Styling**: Tailwind CSS + shadcn/ui primitives

## Future Enhancements

### High Priority

1. **Message Model Attribution**

   - Add `model?: string` field to Message interface
   - Display model name/icon below each assistant message
   - Examples: "Claude 3.5", "GPT-4o", "Auto (Claude selected)"
   - **Rationale**: "Auto" option currently implies it's the worst choice; explicit model attribution shows the actual model being used

2. **Backend Integration**

   - Connect to Convex actions for real chat responses
   - Implement message persistence (optional)
   - Add context awareness (current file, vault info)

3. **Model Selection**
   - Allow users to select preferred model per conversation
   - Show model capabilities/speed/cost tradeoffs
   - **Design note**: Avoid labeling any option as "Auto" if possible, or clarify it means "Recommended based on request"

### Medium Priority

- Message editing/deletion
- Conversation history/saving
- Code snippet references from current editor
- Input character limit feedback
- Typing indicators for agent responses

### Low Priority

- Message reactions/feedback
- Export conversation
- Theme-aware styling refinements

## Known Issues

- Currently uses placeholder responses
- No persistence between sessions
- No context from edited files

## Message Interface (TypeScript)

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string // e.g., "Claude 3.5 Sonnet", "GPT-4o", "Recommended"
}
```

## UX Guidelines

- Keep chat window compact to not obstruct editor
- Prioritize clarity over feature richness
- Model attribution should be visible but not obtrusive
- Avoid terminology that implies one model/option is "lesser"
