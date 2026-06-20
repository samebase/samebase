export function sanitizeSlug(input: string, maxLen = 58): string {
  const sanitized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (sanitized.length === 0) {
    return "vault";
  }
  return sanitized.slice(0, maxLen);
}

export function vaultSuffix(vaultId: string): string {
  const alnumOnly = vaultId.replace(/[^a-zA-Z0-9]/g, "");
  return alnumOnly.slice(-6).toLowerCase() || "vault";
}
