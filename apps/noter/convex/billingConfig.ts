import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { Infer, v } from "convex/values";

const { literal, object, optional, string, union } = v;

const paddleEnvironmentValidator = union(literal("sandbox"), literal("live"));

const paddlePricePairValidator = object({
  monthly: optional(string()),
  annual: optional(string()),
});

const paddlePublicConfigValidator = object({
  environment: paddleEnvironmentValidator,
  clientToken: optional(string()),
  prices: object({
    pro: paddlePricePairValidator,
    team: paddlePricePairValidator,
  }),
});

export type PaddlePublicConfig = Infer<typeof paddlePublicConfigValidator>;

const PADDLE_PRICE_IDS = {
  sandbox: {
    pro: {
      monthly: "",
      annual: "",
    },
    team: {
      monthly: "",
      annual: "",
    },
  },
  live: {
    pro: {
      monthly: "",
      annual: "",
    },
    team: {
      monthly: "",
      annual: "",
    },
  },
} as const;

function readOptionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function inferPaddleEnvironment(): "sandbox" | "live" {
  const raw = process.env.CONVEX_DEPLOYMENT?.trim() ?? "";
  const prefix = raw.split(":")[0]?.trim().toLowerCase() ?? "";
  return prefix === "prod" ? "live" : "sandbox";
}

export const getPaddlePublicConfig = query({
  args: {},
  returns: v.union(paddlePublicConfigValidator, v.null()),
  handler: async (ctx): Promise<PaddlePublicConfig | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const environment = inferPaddleEnvironment();
    const prices = PADDLE_PRICE_IDS[environment];

    return {
      environment,
      clientToken: readOptionalEnv("PADDLE_PUBLIC_CLIENT_TOKEN"),
      prices: {
        pro: {
          monthly: toOptionalString(prices.pro.monthly),
          annual: toOptionalString(prices.pro.annual),
        },
        team: {
          monthly: toOptionalString(prices.team.monthly),
          annual: toOptionalString(prices.team.annual),
        },
      },
    };
  },
});
