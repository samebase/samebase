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

            if (size > ALWAYS_STORAGE_OVER) {
              // TODO: save to storage
              console.log(
                `File ${filePath} is too large (${size} bytes) to store inline, skipping`,
              );
              return;
            }

            // oid is the blob's SHA-1 → use as `sha`
            await ctx.runMutation(internal.gitOperations.saveFileBlob, {
              vaultId: args.vaultId,
              filePath,
              content: blob.slice().buffer, // Create a copy as ArrayBuffer
              sha: oid,
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
