export function formatAuthProviderLabel(provider: string | undefined): string {
  if (!provider) return "Unknown";
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
