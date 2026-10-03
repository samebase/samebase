import { EmailInbox } from "@samebase/convex-cloudflare-email-inbox";
import {
  deliveryView,
  historyPage,
  inboxView,
  listHistoryArgs,
  messageView,
} from "@samebase/convex-cloudflare-email-inbox/monitor";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { query } from "./functions";

const { array, null: nullValue, string, union } = v;
const inbox = new EmailInbox(components.mail);

export const listInboxes = query({
  access: "access_admin",
  args: {},
  returns: array(inboxView),
  handler: async (ctx) => await inbox.listInboxes(ctx),
});

export const listHistory = query({
  access: "access_admin",
  args: listHistoryArgs,
  returns: historyPage,
  handler: async (ctx, args) =>
    await inbox.listHistory(ctx, {
      inboxId: args.inboxId,
      status: args.status,
      paginationOpts: args.paginationOpts,
    }),
});

export const getMessage = query({
  access: "access_admin",
  args: { messageId: string() },
  returns: union(nullValue(), messageView),
  handler: async (ctx, args) => await inbox.getMessage(ctx, { messageId: args.messageId }),
});

export const getDelivery = query({
  access: "access_admin",
  args: { messageId: string() },
  returns: deliveryView,
  handler: async (ctx, args) => await inbox.getDelivery(ctx, { messageId: args.messageId }),
});
