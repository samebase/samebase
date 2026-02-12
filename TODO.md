# TODO

## High Priority
- [ ] fix dark mode/light mode toggle - it's redirecting to /
- [ ] make dragging nice
- [ ] add settings page for each vault and also for the whole app that allows auto commits
- [ ] when path doesn't have owner or repo name or can't find it, redirect to vaults
- [ ] add command "auto-push" "stop auto push" or similar to allow automatic pushing
- [ ] you don't need to open noter in noter.md, you have it as a fab in your prod, just for you
- [ ] add share functionality to noter.md app - when copying text, allow sharing to Telegram, etc. Create new PWA app for this
- [ ] add backwards and forward buttons
- [ ] always sync input values to Convex so text is remembered on typing (real-time persistence)
- [ ] screenshot support so it can debug itself
- [ ] if new commit button appears, or actually, all previous requests get disabled, can only click last group
- [ ] while waiting for tool, you can still talk with it but it will keep fresh in prompt that it's waiting for tool, no blocking

## Features & Improvements
- [ ] improve file search functionality with better fuzzy matching
- [ ] add keyboard shortcuts for common actions (save, commit, etc.)
- [ ] implement file diff view to show changes before committing
- [ ] add "todo" command functionality for AI assistant to update this file
- [ ] add command "auto-push" "stop auto push" or similar to allows
- [ ] use mermaid?
- [ ] remove the "auto delete GitHub repo" option once repos move to the noter.md org flow
- [ ] show actionable error when delete fails due to missing GitHub `delete_repo` scope, with a re-login CTA

## Meta/Philosophy
- [ ] the more our tooling for noter gets better (in terms of ai settings or integrations) the more our user's tooling gets better, since we use noter for building noter

## Ideas to Explore
- [ ] check if I discussed this idea: noter could approach darklang because the logs are automatically in convex
- [ ] add idea regarding the jokes about older people don't know how to convert to pdf. But now with noter

## Completed ✅
- [x] when committing, commit all changed files
- [x] allow deleting file/folder
- [x] after commit now, the file should already have a new staging
- [x] add more descriptive commit names
- [x] update the tree from time to time?
- [x] don't use builder.io anymore
- [x] removing noter from builder.io todo is done