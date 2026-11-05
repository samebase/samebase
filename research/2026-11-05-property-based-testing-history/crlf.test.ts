// Bug: edits to files with Windows line endings (CRLF) could not be saved.
// The server built the document with content.split("\n"); the editor counts "\r\n" as one line break.
// Server side lived from 549131f17 (2025-08-06) to v2167 3e3b443ae (2026-10-26).
import fc from "fast-check";
import { ChangeSet, EditorState, Text } from "@codemirror/state";
import { run } from "./run.ts";
import { applyCollaborativeChanges, createCollaborativeText } from "./old/collaborativeText-main.ts";

// Before v2167: apps/samebase/convex/collaborative.ts, pushUpdates.
const oldServerSave = (content: string, changes: ChangeSet) => changes.apply(Text.of(content.split("\n"))).toString();
// Today: packages/git-editor/src/component/collaborativeText.ts
const todayServerSave = (content: string, changes: ChangeSet) => applyCollaborativeChanges(content, changes, content);

// A file: some lines, one line ending for the whole file (what real files have).
const file = fc.record({
  eol: fc.constantFrom("\n", "\r\n"),
  lines: fc.array(fc.stringMatching(/^[a-z ]{0,6}$/), { minLength: 1, maxLength: 6 }),
}).map(({ eol, lines }) => lines.join(eol));

// What the editor does when the user types: replace [from, to) with some text.
const fileAndEdit = file.chain((content) => {
  const len = EditorState.create({ doc: content }).doc.length;
  return fc.record({
    content: fc.constant(content),
    from: fc.integer({ min: 0, max: len }),
    span: fc.integer({ min: 0, max: 3 }),
    insert: fc.stringMatching(/^[x\n]{1,3}$/),
  }).map((e) => ({ ...e, to: Math.min(len, e.from + e.span) }));
});

function userEdit(e: { content: string; from: number; to: number; insert: string }) {
  const before = EditorState.create({ doc: e.content });
  const tr = before.update({ changes: { from: e.from, to: e.to, insert: e.insert } });
  return { changes: ChangeSet.fromJSON(tr.changes.toJSON()), seen: tr.state.doc.toString() };
}

for (const [label, save] of [["before v2167 3e3b443ae", oldServerSave], ["main", todayServerSave]] as const) {
  await run(`[${label}] every edit the editor makes can be saved`,
    fc.property(fileAndEdit, (e) => { save(e.content, userEdit(e).changes); }));
  await run(`[${label}] the saved file, reopened, shows what the user saw`,
    fc.property(fileAndEdit, (e) => {
      const { changes, seen } = userEdit(e);
      return EditorState.create({ doc: save(e.content, changes) }).doc.toString() === seen;
    }));
}

// Today only: undoing the edit gives back the exact bytes, line endings included.
await run(`[main] edit then undo returns the original bytes`,
  fc.property(fileAndEdit, (e) => {
    const { changes } = userEdit(e);
    const saved = todayServerSave(e.content, changes);
    const undo = changes.invert(createCollaborativeText(e.content));
    return applyCollaborativeChanges(saved, undo, e.content) === e.content;
  }));
