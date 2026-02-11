import React from "react";
import { parseMessageForCodeBlocks, InlineEditingContext } from "@/lib/codeBlockParser";
import { InlineCodeEditor } from "./InlineCodeEditor";

interface EnhancedMarkdownRendererProps {
  text: string;
  context?: InlineEditingContext;
  readOnly?: boolean;
}

export function EnhancedMarkdownRenderer({ 
  text, 
  context,
  readOnly = false 
}: EnhancedMarkdownRendererProps) {
  const parsed = parseMessageForCodeBlocks(text);

  return (
    <div className="space-y-2">
      {parsed.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <div key={index}>
              {renderInlineMarkdown(part.content)}
            </div>
          );
        } else if (part.type === "code" && part.codeBlock) {
          const { codeBlock } = part;
          
          // Only enable inline editing if we have a file path and context
          const canEdit = !readOnly && 
                         codeBlock.filePath && 
                         context?.vaultId && 
                         context?.repositoryFullName;

          return (
            <InlineCodeEditor
              key={`${index}-${codeBlock.id}`}
              code={codeBlock.code}
              language={codeBlock.language}
              filePath={codeBlock.filePath}
              vaultId={context?.vaultId}
              readOnly={!canEdit}
              className="my-3"
            />
          );
        }
        
        return null;
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Handle inline code, bold, and italic
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith("`")) {
      parts.push(
        <code
          key={i++}
          className="rounded bg-background/80 px-1 py-0.5 text-xs"
        >
          {m.slice(1, -1)}
        </code>,
      );
    } else if (m.startsWith("**")) {
      parts.push(<strong key={i++}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("*")) {
      parts.push(<em key={i++}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}