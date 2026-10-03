import { v } from "convex/values";

import { ACCESS_FEEDBACK_SUBMIT } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { string } = v;

export const MAX_FEEDBACK_REPORT_LENGTH = 6_000;

export const submitFeedbackContract = {
  id: "submit_feedback",
  access: ACCESS_FEEDBACK_SUBMIT,
  args: {
    report: string(),
  },
  returns: v.null(),
  mcp: {
    title: "Submit Samebase feedback",
    name: "feedback_submit",
    description:
      "Email one feedback report to Samebase staff. After a clear Samebase product or plugin problem, draft a short report that states what the user tried, what happened, and what should improve. Show the exact report and say that you can send it automatically with no form. Call only after the user approves that exact text. A direct request to send specified feedback is approval. Call once and do not retry unless the user asks. Do not include credentials, file contents, full logs, or unrelated conversation.",
    safety: "destructive",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      report: `The exact user-approved feedback report. Maximum ${MAX_FEEDBACK_REPORT_LENGTH} characters.`,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Emails one feedback report to Samebase staff. The agent must show the complete report
and get the user's explicit approval for that exact text before it calls the tool. A direct request
to send specified feedback is already approval.

The email contains only the exact report. It must not contain credentials, file contents, full logs,
or unrelated conversation. The tool sends the email through Cloudflare Email Sending to a fixed
Samebase staff mailbox. Samebase stores one account-linked submission-attempt counter. It also
stores the report and delivery history in its email inbox until a trusted Samebase operator
explicitly deletes them.

Confirmed Cloudflare throttling returns a queued-delivery message. Do not submit the report again;
the email component retries automatically, at most three provider attempts. Queued does not mean
that staff received the email. Uncertain delivery outcomes do not retry automatically.`,
} as const;
