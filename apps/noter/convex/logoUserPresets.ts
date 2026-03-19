import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { LogoFaceColors } from "./schema";

const {
  array,
  id,
  literal,
  null: nullValue,
  number,
  object,
  string,
  union,
} = v;

const nullResultValidator = nullValue();
const logoUserPresetIdValidator = id("logoUserPresets");
const logoPresetKindValidator = union(literal("shape"), literal("color"));
const savedShapePresetValidator = object({
  _id: logoUserPresetIdValidator,
  name: string(),
  voxelState: string(),
  updatedAt: number(),
});
const savedColorPresetValidator = object({
  _id: logoUserPresetIdValidator,
  name: string(),
  faceColors: LogoFaceColors,
  updatedAt: number(),
});
const getViewerPresetsArgsValidator = object({});
const getViewerPresetsReturnsValidator = object({
  shapePresets: array(savedShapePresetValidator),
  colorPresets: array(savedColorPresetValidator),
});
const saveShapePresetArgsValidator = object({
  name: string(),
  voxelState: string(),
});
const saveColorPresetArgsValidator = object({
  name: string(),
  faceColors: LogoFaceColors,
});

type SavedShapePreset = Infer<typeof savedShapePresetValidator>;
type SavedColorPreset = Infer<typeof savedColorPresetValidator>;
type GetViewerPresetsArgs = Infer<typeof getViewerPresetsArgsValidator>;
type SaveShapePresetArgs = Infer<typeof saveShapePresetArgsValidator>;
type SaveColorPresetArgs = Infer<typeof saveColorPresetArgsValidator>;

function normalizePresetName(name: string): {
  displayName: string;
  nameKey: string;
} {
  const displayName = name.trim().replace(/\s+/g, " ");
  if (!displayName) {
    throw new Error("Preset name is required.");
  }

  return {
    displayName,
    nameKey: displayName.toLowerCase(),
  };
}

async function upsertPreset(
  ctx: MutationCtx,
  args: {
    kind: Infer<typeof logoPresetKindValidator>;
    name: string;
    voxelState?: string;
    faceColors?: Infer<typeof LogoFaceColors>;
  },
) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("User not authenticated");
  }

  const now = Date.now();
  const { displayName, nameKey } = normalizePresetName(args.name);
  const existingPreset = await ctx.db
    .query("logoUserPresets")
    .withIndex("by_user_kind_name", (q) =>
      q.eq("userId", userId).eq("kind", args.kind).eq("nameKey", nameKey),
    )
    .first();

  const patch = {
    name: displayName,
    nameKey,
    updatedAt: now,
    ...(args.voxelState !== undefined
      ? {
          voxelState: args.voxelState,
        }
      : {}),
    ...(args.faceColors !== undefined
      ? {
          faceColors: args.faceColors,
        }
      : {}),
  };

  if (existingPreset) {
    await ctx.db.patch(existingPreset._id, patch);
    return;
  }

  await ctx.db.insert("logoUserPresets", {
    userId,
    kind: args.kind,
    createdAt: now,
    ...patch,
  });
}

export const getViewerPresets = query({
  args: getViewerPresetsArgsValidator,
  returns: getViewerPresetsReturnsValidator,
  handler: async (
    ctx,
    _args: GetViewerPresetsArgs,
  ): Promise<{
    shapePresets: SavedShapePreset[];
    colorPresets: SavedColorPreset[];
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        shapePresets: [],
        colorPresets: [],
      };
    }

    const presets = await ctx.db
      .query("logoUserPresets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const shapePresets: SavedShapePreset[] = [];
    const colorPresets: SavedColorPreset[] = [];

    for (const preset of presets) {
      if (preset.kind === "shape" && typeof preset.voxelState === "string") {
        shapePresets.push({
          _id: preset._id,
          name: preset.name,
          voxelState: preset.voxelState,
          updatedAt: preset.updatedAt,
        });
      }

      if (preset.kind === "color" && preset.faceColors !== undefined) {
        colorPresets.push({
          _id: preset._id,
          name: preset.name,
          faceColors: preset.faceColors,
          updatedAt: preset.updatedAt,
        });
      }
    }

    const sortByUpdatedAtAndName = <
      T extends { name: string; updatedAt: number },
    >(
      left: T,
      right: T,
    ) =>
      right.updatedAt - left.updatedAt || left.name.localeCompare(right.name);

    shapePresets.sort(sortByUpdatedAtAndName);
    colorPresets.sort(sortByUpdatedAtAndName);

    return {
      shapePresets,
      colorPresets,
    };
  },
});

export const saveShapePreset = mutation({
  args: saveShapePresetArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args: SaveShapePresetArgs) => {
    await upsertPreset(ctx, {
      kind: "shape",
      name: args.name,
      voxelState: args.voxelState,
    });

    return null;
  },
});

export const saveColorPreset = mutation({
  args: saveColorPresetArgsValidator,
  returns: nullResultValidator,
  handler: async (ctx, args: SaveColorPresetArgs) => {
    await upsertPreset(ctx, {
      kind: "color",
      name: args.name,
      faceColors: args.faceColors,
    });

    return null;
  },
});
