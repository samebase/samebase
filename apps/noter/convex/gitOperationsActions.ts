"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

// import LightningFS from "@isomorphic-git/lightning-fs";
// import { promises as fs } from "fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { allLimited } from "./common";
import { Id } from "./_generated/dataModel";

const ALWAYS_STORAGE_OVER = 900_000; // keep margin below ~1MB doc limit

type StagedInline = {
  kind: "inline";
  filePath: string;
  oid: string; // blob sha
  size: number;
  mime: string;
  text: string; // small UTF-8 text
  ext: string;
};

type StagedStored = {
  kind: "stored";
  filePath: string;
  oid: string; // blob sha
  size: number;
  mime: string;
  u8: Uint8Array; // raw bytes to upload
  ext: string;
};

const READ_CONCURRENCY = 50; // cheap
const DB_CONCURRENCY = 80; // inline doc writes
const UP_CONCURRENCY = 12; // storage uploads
export const INLINE_TEXT_MAX = 900_000;

async function getGithubAccessToken(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<string> {
  const connection = await ctx.runQuery(
    internal.providerConnections.getByUserAndKind,
    {
      userId,
      kind: "github",
    },
  );
  if (connection?.kind !== "github") {
    throw new Error("GitHub is not connected");
  }
  return connection.auth.credential;
}

/**
 * Download a git repository using isomorphic-git and save all files to fileBlobs table
 */
export const downloadGitRepositoryAndMarkReady = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    repositoryUrl: v.string(),
    branch: v.optional(v.string()), // defaults to 'main'
  },
  handler: async (ctx, args) => {
    const githubAccessToken = await getGithubAccessToken(ctx, args.userId);

    const base = await fs.mkdtemp(path.join(os.tmpdir(), "repo-")); // ✅ writable
    const dir = path.join(base, "workdir");
    // await fs.mkdir(dir);

    // const fs = new LightningFS("repo").promises;
    // const dir = "/repo";
    const branch = args.branch || "main";

    try {
      // Create the directory
      await fs.mkdir(dir);

      // start timer
      const startTime = Date.now();
      console.log(`Cloning repository: ${args.repositoryUrl}`);

      // Clone the repository with shallow depth of 1
      await git.clone({
        fs,
        http,
        dir,
        url: args.repositoryUrl,
        ref: branch,
        singleBranch: true,
        depth: 1,
        noCheckout: true, // we only care about the shas
        onAuth: () => {
          // Only for github
          return {
            username: "token",
            password: githubAccessToken,
          };
        },
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`Cloned repository in ${duration}ms`);

      const commitOid = await git.resolveRef({ fs, dir, ref: branch });
      const files = await git.listFiles({ fs, dir, ref: commitOid }); // paths at that commit

      // 1) Stage: read all blobs (fast, higher concurrency)
      const staged = await allLimited(
        files.map(
          (filePath) => async (): Promise<StagedInline | StagedStored> => {
            const { blob, oid } = await git.readBlob({
              fs,
              dir,
              oid: commitOid,
              filepath: filePath,
            });

            // TODO: Filter if SHA is already saved

            const size = blob.byteLength;
            const ext = path.extname(filePath).slice(1).toLowerCase();
            const isText = isTextBuffer(blob);
            let mime = guessMime(filePath);
            if (mime === "application/octet-stream" && isText) {
              mime = "text/plain; charset=utf-8";
            }

            if (isText && size <= INLINE_TEXT_MAX) {
              const text = new TextDecoder("utf-8", { fatal: false }).decode(
                blob,
              );
              return { kind: "inline", filePath, oid, size, mime, text, ext };
            } else {
              return {
                kind: "stored",
                filePath,
                oid,
                size,
                mime,
                u8: blob,
                ext,
              };
            }
          },
        ),
        READ_CONCURRENCY,
      );

      console.log("finished stage 1, read all blobs");

      // 2) Split
      const inlineItems: StagedInline[] = staged.filter(
        (x): x is StagedInline => x.kind === "inline",
      );
      const storedItems: StagedStored[] = staged.filter(
        (x): x is StagedStored => x.kind === "stored",
      );

      await Promise.all([
        // 3) Write inline blobs to DB (no storage) — throttle lightly
        allLimited(
          inlineItems.map((item) => async () => {
            const { filePath, oid, size, mime, text } = item;

            // idempotent upsert by sha on the server
            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: args.vaultId,
              // blob record
              sha: oid,
              size,
              mime,
              text,
              storageId: undefined,
              ext: path.extname(filePath).slice(1).toLowerCase(),
              debugFilePath: filePath,
            });
          }),
          DB_CONCURRENCY,
        ),

        // 4) Upload storage blobs (heavy) + write metadata — throttle harder
        allLimited(
          storedItems.map((item) => async () => {
            const { filePath, oid, size, mime, u8, ext } = item;

            // optional: avoid re-uploading if we already have this sha with a storageId
            const existing = await ctx.runQuery(
              internal.gitOperations.getBlobBySha,
              { sha: oid },
            );
            let storageId: Id<"_storage"> | undefined = existing?.storageId;

            if (!storageId) {
              storageId = await withRetry(() =>
                ctx.storage.store(toBlob(u8, mime)),
              );
            }

            console.log("expected to store blob", { storageId, oid, filePath });

            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: args.vaultId,
              sha: oid,
              size,
              mime,
              text: undefined,
              storageId,
              ext,
              debugFilePath: filePath,
            });
          }),
          UP_CONCURRENCY,
        ),
      ]);

      console.log("finished stage 4, uploaded storage blobs");

      const endTime2 = Date.now();
      const duration2 = endTime2 - endTime;
      console.log(`Saved ${files.length} files in ${duration2}ms`);
    } catch (error) {
      console.error("Error downloading git repository:", error);
      throw new Error(
        `Failed to download repository: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    await ctx.runMutation(internal.vault.markVaultAsReady, {
      vaultId: args.vaultId,
    });
  },
});

const toBlob = (u8: Uint8Array, type?: string) =>
  // @ts-expect-error - Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'.
  new Blob([u8], type ? { type } : undefined);

function isLikelyText(p: string) {
  return /\.(md|markdown|txt|json|yaml|yml|toml|csv|ts|js|tsx|jsx|css|html)$/i.test(
    p,
  );
}
/**
 * Guess a MIME type from the file extension.
 * Defaults to application/octet-stream if unknown.
 */
export function guessMime(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "markdown":
      return "text/markdown; charset=utf-8";
    case "txt":
      return "text/plain; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "yaml":
    case "yml":
      return "application/x-yaml; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";

    // code / config files – treat as plain text
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "css":
    case "html":
    case "xml":
    case "toml":
      return "text/plain; charset=utf-8";

    // images
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";

    default:
      console.log("unknown mime", ext);
      return "application/octet-stream";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let err: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await sleep(150 * (i + 1));
    }
  }
  throw err;
}

export function isTextBuffer(buf: Uint8Array): boolean {
  const len = Math.min(buf.length, 8000); // sample first 8KB
  let suspicious = 0;

  for (let i = 0; i < len; i++) {
    const byte = buf[i];
    // Allow: tab, line feed, carriage return
    if (byte === 9 || byte === 10 || byte === 13) continue;
    // Printable ASCII
    if (byte >= 32 && byte <= 126) continue;
    // UTF-8 multibyte starts (quick + permissive)
    if (byte >= 128) continue;

    suspicious++;
    if (suspicious > 10) return false; // too many weird bytes
  }
  return true;
}
