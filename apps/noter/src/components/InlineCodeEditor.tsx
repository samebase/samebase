import { useState, useRef, useEffect, useCallback } from "react";
import { EditorView } from "codemirror";
import { EditorState, Extension } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { useTheme } from "next-themes";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Check, Edit3, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";

// Language detection based on file extension or language hint
const getLanguageExtension = (language?: string): Extension => {
  if (!language) return [];
  
  const lang = language.toLowerCase();
  
  switch (lang) {
    case "js":
    case "javascript":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "typescript":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "md":
    case "markdown":
      return markdown();
    case "json":
      return json();
    case "html":
    case "htm":
      return html();
    case "css":
      return css();
    case "py":
    case "python":
      return python();
    default:
      return [];
  }
};

interface InlineCodeEditorProps {
  code: string;
  language?: string;
  filePath?: string;
  vaultId?: Id<"vaults">;
  className?: string;
  readOnly?: boolean;
  onSave?: (newCode: string) => void;
}

export function InlineCodeEditor({
  code,
  language,
  filePath,
  vaultId,
  className,
  readOnly = false,
  onSave,
}: InlineCodeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentCode, setCurrentCode] = useState(code);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { theme, systemTheme } = useTheme();

  // Mutation to save file changes through the collaborative editing system
  const saveToStaging = useMutation(api.fileStaging.saveToStaging);

  // Determine if we should use dark theme
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";

  // Initialize CodeMirror editor when entering edit mode
  useEffect(() => {
    if (!isEditing || !editorRef.current) return;

    const extensions = [
      basicSetup,
      getLanguageExtension(language),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          fontSize: "13px",
        },
        ".cm-editor": {
          border: "1px solid hsl(var(--border))",
          borderRadius: "6px",
        },
        ".cm-focused": {
          outline: "2px solid hsl(var(--ring))",
          outlineOffset: "2px",
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newCode = update.state.doc.toString();
          setCurrentCode(newCode);
          setHasChanges(newCode !== code);
        }
      }),
    ];

    if (isDark) {
      extensions.push(oneDark);
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: currentCode,
        extensions,
      }),
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Focus the editor
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [isEditing, language, isDark, currentCode, code]);

  const handleEdit = useCallback(() => {
    if (readOnly) return;
    setIsEditing(true);
  }, [readOnly]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setCurrentCode(code);
    setHasChanges(false);
  }, [code]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      // If we have a file path and vault ID, save to the actual file
      if (filePath && vaultId) {
        await saveToStaging({
          vaultId,
          initialFilePath: filePath,
          content: currentCode,
          initialContent: code,
          parentCommitSha: null, // Let the system determine this
          branch: "main",
        });
      }

      // Call the onSave callback if provided
      if (onSave) {
        onSave(currentCode);
      }

      setIsEditing(false);
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save code changes:", error);
      // TODO: Show error toast
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, currentCode, filePath, vaultId, code, saveToStaging, onSave]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, handleCancel, handleSave]);

  if (isEditing) {
    return (
      <div className={cn("relative", className)}>
        <div
          ref={editorRef}
          className="min-h-[100px] w-full"
        />
        <div className="flex items-center justify-between gap-2 mt-2 p-2 bg-muted/50 rounded-b-md border border-t-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {filePath && (
              <span className="font-mono">{filePath}</span>
            )}
            {hasChanges && (
              <span className="text-orange-600 dark:text-orange-400">
                • Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-7 px-2 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!hasChanges || isSaving}
              className="h-7 px-2 text-xs"
            >
              {isSaving ? (
                <>
                  <div className="h-3 w-3 mr-1 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative group", className)}>
      <pre className="overflow-x-auto rounded bg-background/80 p-3 text-sm">
        <code>{code}</code>
      </pre>
      {!readOnly && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleEdit}
          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit code inline"
        >
          <Edit3 className="h-3 w-3" />
        </Button>
      )}
      {filePath && (
        <div className="absolute bottom-2 left-3 text-xs text-muted-foreground/70 font-mono">
          {filePath}
        </div>
      )}
    </div>
  );
}