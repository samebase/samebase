type TemplateValue = string | number | boolean | null | undefined;

export function stripIndent(
  strings: TemplateStringsArray,
  ...values: TemplateValue[]
): string {
  let combined = "";
  for (let index = 0; index < strings.length; index += 1) {
    combined += strings[index];
    if (index < values.length) {
      combined += String(values[index]);
    }
  }

  const trimmed = combined.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const lines = trimmed.split("\n");
  let minIndent: number | null = null;
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const match = line.match(/^ +/);
    const indent = match ? match[0].length : 0;
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
      if (minIndent === 0) {
        break;
      }
    }
  }

  if (!minIndent) {
    return trimmed;
  }

  const stripPrefix = " ".repeat(minIndent);
  return lines
    .map((line) =>
      line.startsWith(stripPrefix) ? line.slice(minIndent) : line,
    )
    .join("\n");
}
