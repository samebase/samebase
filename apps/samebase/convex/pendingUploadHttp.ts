import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const uploadPendingMedia = httpAction(async (ctx, request) => {
  const uploadId = new URL(request.url).searchParams.get("uploadId");
  if (uploadId === null) {
    return textResponse("Upload capability is missing.", 400);
  }

  const uploadAttemptId = crypto.randomUUID();
  const reservation = await ctx.runMutation(internal.pendingUploads.beginHttpUpload, {
    uploadId,
    uploadAttemptId,
  });
  if (reservation.state === "unavailable") {
    return textResponse("Upload capability is not available.", 409);
  }

  const storageId = await ctx.storage.store(
    new Blob([await request.arrayBuffer()], { type: reservation.storageContentType }),
  );
  const recorded = await ctx.runMutation(internal.pendingUploads.recordHttpUploadedBlob, {
    uploadId: reservation.uploadId,
    uploadAttemptId,
    storageId,
  });
  if (!recorded) {
    return textResponse("Upload capability is not available.", 409);
  }

  return new Response(JSON.stringify({ storageId }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});

export const optionsPendingMediaUpload = httpAction(
  async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
);
