import React from "react";
import { parseMessageForFunctionCalls, FunctionCallContext } from "@/lib/functionCallParser";
import { parseMessageForCodeBlocks, InlineEditingContext } from "@/lib/codeBlockParser";
import { InlineCodeEditor } from "./InlineCodeEditor";

interface FunctionCallRendererProps {
  text: string;
  context?: FunctionCallContext & InlineEditingContext;
  readOnly?: boolean;
}

export function FunctionCallRenderer({ 
  text, 
  context,
  readOnly = false 
}: FunctionCallRendererProps) {
  // Try function call syntax first, fall back to code blocks
  const functionParsed = parseMessageForFunctionCalls(text);
  const hasFunctionCalls = functionParsed.parts.some(part => part.type === "function");
  
  if (hasFunctionCalls) {
    return (
      <div className="space-y-2">
        {functionParsed.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <div key={index}>
                {renderInlineMarkdown(part.content)}
              </div>
            );
          } else if (part.type === "function" && part.functionCall) {
            return renderFunctionCall(part.functionCall, context, readOnly, index);
          }
          
          return null;
        })}
      </div>
    );
  }

  // Fall back to existing code block parsing
  const codeParsed = parseMessageForCodeBlocks(text);
  
  return (
    <div className="space-y-2">
      {codeParsed.parts.map((part, index) => {
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

function renderFunctionCall(
  functionCall: any,
  context: any,
  readOnly: boolean,
  key: number
): React.ReactNode {
  const { name, args, content } = functionCall;

  switch (name) {
    case "code":
    case "edit":
      // Handle code editing function calls
      const canEdit = !readOnly && 
                     args.filePath && 
                     context?.vaultId && 
                     context?.repositoryFullName;

      return (
        <InlineCodeEditor
          key={`${key}-${functionCall.id}`}
          code={content || args.content || ""}
          language={args.language}
          filePath={args.filePath}
          vaultId={context?.vaultId}
          readOnly={args.readOnly !== undefined ? args.readOnly : !canEdit}
          className="my-3"
        />
      );

    case "file":
      // Handle file display/editing
      return (
        <div key={`${key}-${functionCall.id}`} className="border rounded-lg p-4 bg-muted/50">
          <div className="text-sm font-mono text-muted-foreground mb-2">
            📄 {args.path || args.filePath || "Unknown file"}
          </div>
          {content && (
            <InlineCodeEditor
              code={content}
              language={args.language || inferLanguageFromPath(args.path || args.filePath)}
              filePath={args.path || args.filePath}
              vaultId={context?.vaultId}
              readOnly={args.readOnly !== undefined ? args.readOnly : readOnly}
              className="mt-2"
            />
          )}
        </div>
      );

    case "note":
    case "info":
      // Handle informational notes
      return (
        <div key={`${key}-${functionCall.id}`} className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20 p-4 my-3">
          <div className="text-sm">
            {content || args.message || ""}
          </div>
        </div>
      );

    case "warning":
      // Handle warnings
      return (
        <div key={`${key}-${functionCall.id}`} className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-4 my-3">
          <div className="text-sm">
            {content || args.message || ""}
          </div>
        </div>
      );

    case "error":
      // Handle errors
      return (
        <div key={`${key}-${functionCall.id}`} className="border-l-4 border-red-500 bg-red-50 dark:bg-red-950/20 p-4 my-3">
          <div className="text-sm">
            {content || args.message || ""}
          </div>
        </div>
      );

    default:
      // Unknown function call - render as code block
      return (
        <div key={`${key}-${functionCall.id}`} className="border rounded-lg p-4 bg-muted/10">
          <div className="text-sm text-muted-foreground mb-2">
            Unknown function: @{name}({Object.entries(args).map(([k, v]) => `${k}="${v}"`).join(", ")})
          </div>
          {content && (
            <pre className="text-sm bg-background/80 p-2 rounded">
              <code>{content}</code>
            </pre>
          )}
        </div>
      );
  }
}

function inferLanguageFromPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'md': 'markdown',
    'json': 'json',
    'html': 'html',
    'css': 'css',
    'scss': 'css',
    'sass': 'css',
  };
  
  return ext ? langMap[ext] : undefined;
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