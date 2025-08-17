"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
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

// Tune thresholds to your usage
const INLINE_TEXT_MAX = 400_000; // ~400 KB text fast path
const ALWAYS_STORAGE_OVER = 900_000; // keep margin below ~1MB doc limit

/**
 * Download a git repository using isomorphic-git and save all files to fileBlobs table
 */
export const downloadGitRepository = internalAction({
  args: {
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    repositoryUrl: v.string(),
    branch: v.optional(v.string()), // defaults to 'main'
  },
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!currentUser) {
      throw new Error("User not found");
    }
    if (!currentUser.githubAccessToken) {
      throw new Error("User does not have a GitHub access token");
    }

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
            password: currentUser.githubAccessToken,
          };
        },
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`Cloned repository in ${duration}ms`);

      const commitOid = await git.resolveRef({ fs, dir, ref: branch });
      const files = await git.listFiles({ fs, dir, ref: commitOid }); // paths at that commit

      await allLimited(
        files.map((filePath) => async () => {
          try {
            const { blob, oid } = await git.readBlob({
              fs,
              dir,
              oid: commitOid,
              filepath: filePath,
            });

            const size = blob.byteLength;

            let text: string | undefined;
            let storageId: Id<"_storage"> | undefined;

            if (isLikelyText(filePath) && size <= INLINE_TEXT_MAX) {
              // Inline UTF-8 text for fast reads
              text = new TextDecoder("utf-8", { fatal: false }).decode(blob);
            } else {
              // Store bytes in File Storage
              storageId = await ctx.storage.store(toBlob(blob));
            }

            const mime = guessMime(filePath);

            // oid is the blob's SHA-1 → use as `sha`
            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              sha: oid,
              size,
              ext: path.extname(filePath).slice(1).toLowerCase(),
              text,
              storageId,
              mime,
            });
          } catch (error) {
            // TODO:
            console.error(`Error saving file ${filePath}:`, error);
          }
        }),
      );

      const endTime2 = Date.now();
      const duration2 = endTime2 - endTime;
      console.log(`Saved ${files.length} files in ${duration2}ms`);
    } catch (error) {
      console.error("Error downloading git repository:", error);
      throw new Error(
        `Failed to download repository: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  },
});

const toBlob = (u8: Uint8Array, type?: string) =>
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
      return "application/octet-stream";
  }
}
