# TODO

## High Priority
- [ ] fix dark mode/light mode toggle - it's redirecting to /
- [ ] make dragging nice
- [ ] add settings page for each vault and also for the whole app that allows auto commits
- [ ] when path doesn't have owner or repo name or can't find it, redirect to vaults

## Features & Improvements
- [ ] improve file search functionality with better fuzzy matching
- [ ] add keyboard shortcuts for common actions (save, commit, etc.)
- [ ] implement file diff view to show changes before committing
- [ ] add "todo" command functionality for AI assistant to update this file
- [ ] for prompts that are linked to files, enable inline editing that automatically propagates changes to the actual files
- [ ] folders can be used as objects or arrays because of ordered preservation (note: this is undefined behavior in JS)
- [ ] have 1 agent with which I talk, but I also see the agent they are building, on the side. Basically instead of chat and code generated to the right. You get chat and markdown generated to the right, with

## UI/UX Improvements
- [ ] commit proposal UI: make the commit description clickable to go to GitHub commit URL, ensure button inside doesn't change sizes

## Development Environment
- [ ] the dev container should default to fish. Even the ai should prefer that

## Completed ✅
- [x] when committing, commit all changed files
- [x] allow deleting file/folder
- [x] after commit now, the file should already have a new staging
- [x] add more descriptive commit names
- [x] update the tree from time to time?