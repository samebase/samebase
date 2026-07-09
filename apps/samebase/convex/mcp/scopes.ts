export function parseScopeTokens(scope: string): string[] {
  return scope
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}
