// Today's code on files that mix line endings (\n, \r\n, lone \r).
import fc from "fast-check";
import { ChangeSet, EditorState } from "@codemirror/state";
import { run } from "./run.ts";
import { applyCollaborativeChanges, createCollaborativeText } from "./old/collaborativeText-main.ts";
const mixed = fc.array(fc.constantFrom("a", "b", "\n", "\r\n", "\r"), { maxLength: 8 }).map((p) => p.join(""));
const fileAndEdit = mixed.chain((content) => {
  const len = EditorState.create({ doc: content }).doc.length;
  return fc.record({ content: fc.constant(content), from: fc.integer({ min: 0, max: len }), span: fc.integer({ min: 0, max: 3 }),
    insert: fc.stringMatching(/^[x\n]{0,3}$/) }).map((e) => ({ ...e, to: Math.min(len, e.from + e.span) }));
});
const edit = (e: any) => { const tr = EditorState.create({ doc: e.content }).update({ changes: { from: e.from, to: e.to, insert: e.insert } });
  return { changes: ChangeSet.fromJSON(tr.changes.toJSON()), seen: tr.state.doc.toString() }; };
await run("[main, mixed endings] save never throws and reopens as seen", fc.property(fileAndEdit, (e) => {
  const { changes, seen } = edit(e); return EditorState.create({ doc: applyCollaborativeChanges(e.content, changes, e.content) }).doc.toString() === seen; }));
await run("[main, mixed endings] edit then undo returns the original bytes", fc.property(fileAndEdit, (e) => {
  const { changes } = edit(e); const saved = applyCollaborativeChanges(e.content, changes, e.content);
  return applyCollaborativeChanges(saved, changes.invert(createCollaborativeText(e.content)), e.content) === e.content; }));
