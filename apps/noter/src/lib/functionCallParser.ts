import { Id } from "../../convex/_generated/dataModel";

export interface FunctionCall {
  id: string;
  name: string;
  args: Record<string, any>;
  content?: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedMessageWithFunctions {
  parts: Array<{
    type: "text" | "function";
    content: string;
    functionCall?: FunctionCall;
  }>;
}

/**
 * Parse text for function-call syntax like:
 * @code(language="js", filePath="src/file.js")
 * code content here
 * @end
 * 
 * Or inline: @edit(filePath="config.json", content="...")
 */
export function parseMessageForFunctionCalls(text: string): ParsedMessageWithFunctions {
  const parts: ParsedMessageWithFunctions["parts"] = [];
  let lastIndex = 0;
  let callId = 0;

  // Match block-style function calls
  const blockFunctionRegex = /@(\w+)\(([^)]*)\)\s*\n([\s\S]*?)@end/g;
  
  // Match inline function calls
  const inlineFunctionRegex = /@(\w+)\(([^)]*)\)/g;

  let match;

  // First pass: handle block functions
  while ((match = blockFunctionRegex.exec(text)) !== null) {
    // Add text before function call
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index);
      if (textContent.trim()) {
        parts.push({
          type: "text",
          content: textContent,
        });
      }
    }

    const [fullMatch, functionName, argsString, content] = match;
    const args = parseArguments(argsString);
    
    const functionCall: FunctionCall = {
      id: `function-${callId++}`,
      name: functionName,
      args,
      content: content.trim(),
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
    };

    parts.push({
      type: "function",
      content: fullMatch,
      functionCall,
    });

    lastIndex = match.index + fullMatch.length;
  }

  // Reset regex for inline functions on remaining text
  const remainingText = text.slice(lastIndex);
  let remainingLastIndex = 0;

  while ((match = inlineFunctionRegex.exec(remainingText)) !== null) {
    // Add text before function call
    if (match.index > remainingLastIndex) {
      const textContent = remainingText.slice(remainingLastIndex, match.index);
      if (textContent.trim()) {
        parts.push({
          type: "text",
          content: textContent,
        });
      }
    }

    const [fullMatch, functionName, argsString] = match;
    const args = parseArguments(argsString);
    
    const functionCall: FunctionCall = {
      id: `function-${callId++}`,
      name: functionName,
      args,
      startIndex: lastIndex + match.index,
      endIndex: lastIndex + match.index + fullMatch.length,
    };

    parts.push({
      type: "function",
      content: fullMatch,
      functionCall,
    });

    remainingLastIndex = match.index + fullMatch.length;
  }

  // Add remaining text
  if (remainingLastIndex < remainingText.length) {
    const textContent = remainingText.slice(remainingLastIndex);
    if (textContent.trim()) {
      parts.push({
        type: "text",
        content: textContent,
      });
    }
  }

  return { parts };
}

/**
 * Parse function arguments from string like:
 * language="js", filePath="src/file.js", readOnly=true
 */
function parseArguments(argsString: string): Record<string, any> {
  const args: Record<string, any> = {};
  
  if (!argsString.trim()) return args;

  // Simple argument parsing - handles quoted strings, booleans, numbers
  const argRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\w+))/g;
  let match;

  while ((match = argRegex.exec(argsString)) !== null) {
    const [, key, doubleQuoted, singleQuoted, unquoted] = match;
    let value: any = doubleQuoted || singleQuoted || unquoted;

    // Type conversion
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    else if (value === 'undefined') value = undefined;
    else if (!isNaN(Number(value)) && value !== '') value = Number(value);

    args[key] = value;
  }

  return args;
}

/**
 * Context for function call execution
 */
export interface FunctionCallContext {
  vaultId?: Id<"vaults">;
  repositoryFullName?: string;
  branch?: string;
  currentFilePath?: string;
}