/**
Scripted user for multi-turn tasks, shared by the Codex driver and the say.ts command.
*/
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TASKS, type Task } from "./tasks.ts";

export const SUBJECT_FRAME = `You are an assistant in a chat app. The user has connected these apps: Samebase, GitHub, Cloudflare (Workers Bindings and Workers Builds), and Convex. Work only through their tools. Do not run shell commands, read local files, or edit files for the user's request.`;

export function taskById(id: string): Task {
  const task = TASKS.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Unknown task ${id}.`);
  return task;
}

export function wantsReply(message: string): boolean {
  const tail = message.trim().slice(-400);
  return (
    /\?\s*\**\s*$/.test(tail) ||
    /(would you like|shall i|do you want|should i|want me to|please confirm|confirm (that|whether|you)|let me know|which (one|token)|reply with)/i.test(
      tail,
    )
  );
}

type Transcript = {
  taskId: string;
  messages: { role: "assistant" | "user"; text: string }[];
  usage: unknown[];
  turns: number;
  error: string | null;
};

export function transcriptPath(runDir: string): string {
  return path.join(runDir, "transcript.json");
}

export function readTranscript(runDir: string, taskId: string): Transcript {
  const file = transcriptPath(runDir);
  if (!existsSync(file)) return { taskId, messages: [], usage: [], turns: 0, error: null };
  const parsed: Transcript = JSON.parse(readFileSync(file, "utf8"));
  return parsed;
}

export function writeTranscript(runDir: string, transcript: Transcript): void {
  writeFileSync(transcriptPath(runDir), JSON.stringify(transcript, null, 2));
}

/** Records an assistant message and returns the scripted user reply, or null when the conversation ends. */
export function nextUserReply(
  runDir: string,
  taskId: string,
  assistantText: string,
  usage: unknown,
): string | null {
  const task = taskById(taskId);
  const transcript = readTranscript(runDir, taskId);
  transcript.messages.push({ role: "assistant", text: assistantText });
  transcript.usage.push(usage);
  transcript.turns += 1;
  const repliesSoFar = transcript.messages.filter((message) => message.role === "user").length;
  let reply: string | null = null;
  if (wantsReply(assistantText) && repliesSoFar < Math.min(2, task.followUps.length)) {
    reply = task.followUps[repliesSoFar];
    transcript.messages.push({ role: "user", text: reply });
    appendFileSync(
      path.join(runDir, "calls.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), server: "_user", tool: "reply", args: { reply }, ok: true, text: "" })}\n`,
    );
  }
  writeTranscript(runDir, transcript);
  return reply;
}
