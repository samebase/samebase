/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable prefer-const */
import { useRef, useEffect, useState } from 'react'
import { ChangeSet, EditorState, Extension, Text } from '@codemirror/state'
import { EditorView } from 'codemirror'
import { languages } from '@codemirror/language-data'
// Note: closeBrackets functionality requires @codemirror/autocomplete package
// which is not installed in this project
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  foldKeymap,
  syntaxTree,
} from '@codemirror/language'
import { dropCursor, rectangularSelection, keymap, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
// import { useTheme } from "next-themes";
import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
  Update,
} from '@codemirror/collab'
// import { client } from "@/main";
// import { api } from "../../convex/_generated/api";
// import { Id } from "convex/_generated/dataModel";
import { GFM } from '@lezer/markdown'
import {
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
} from '@prosemark/core'
import { printTree } from '@lezer-unofficial/printer'
import { cloudFunctions } from '@/lib/functions'
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
// import { useAction, useQuery } from "convex/react";

// Types for collaborative editing
interface CollaborativeUpdate {
  id: string
  vaultId: string
  filePath: string
  version: number
  clientId: string
  changes: string // Serialized ChangeSet from CodeMirror
  userId: string
  timestamp: number
}

// Custom hook to replace Convex useQuery for collaborative updates
function useCollaborativeUpdates(repositoryFullName: string, filePath: string, version: number) {
  const [updates, setUpdates] = useState<CollaborativeUpdate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // First get the vault ID for this repository
    const vaultsQuery = query(
      collection(db, 'vaults'),
      where('repositoryFullName', '==', repositoryFullName),
    )

    const unsubscribeVaults = onSnapshot(vaultsQuery, vaultsSnapshot => {
      if (vaultsSnapshot.empty) {
        setUpdates([])
        setLoading(false)
        return
      }

      const vaultId = vaultsSnapshot.docs[0].id

      // Now listen for collaborative updates for this vault and file
      const updatesQuery = query(
        collection(db, 'collaborativeUpdates'),
        where('vaultId', '==', vaultId),
        where('filePath', '==', filePath),
        where('version', '>', version),
        orderBy('version'),
        orderBy('timestamp'),
      )

      const unsubscribeUpdates = onSnapshot(updatesQuery, updatesSnapshot => {
        const collaborativeUpdates = updatesSnapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            vaultId: data.vaultId as string,
            filePath: data.filePath as string,
            version: data.version as number,
            clientId: data.clientId as string,
            changes: data.changes as string,
            userId: data.userId as string,
            timestamp: data.timestamp as number,
          } as CollaborativeUpdate
        })
        setUpdates(collaborativeUpdates)
        setLoading(false)
      })

      return () => unsubscribeUpdates()
    })

    return () => unsubscribeVaults()
  }, [repositoryFullName, filePath, version])

  return loading ? undefined : updates
}

// Temporary:
// const tempVaultId = "k976ryb9d1m2gyvxhps87dac257mv5ps" as Id<"vaults">;
// const tempFilePath = "README.md";

function awaitTimeout(timeout: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, timeout)
  })
}

const delay = 500

async function pushUpdates({
  version,
  repositoryFullName,
  filePath,
  fullUpdates,
}: {
  version: number
  repositoryFullName: string
  filePath: string
  fullUpdates: readonly Update[]
}): Promise<boolean> {
  await awaitTimeout(delay)
  // Strip off transaction data
  let updates = fullUpdates.map(u => ({
    clientId: u.clientID,
    changes: JSON.stringify(u.changes.toJSON()),
  }))

  try {
    const result = await cloudFunctions.pushUpdates({
      repositoryFullName,
      filePath,
      version,
      updates,
    })
    return result.data.success
  } catch (error) {
    console.error('Error pushing updates:', error)
    return false
  }
}

// https://github.com/codemirror/website/blob/main/site/examples/collab/collab.ts#L89
export function peerExtension({
  startVersion,
  repositoryFullName,
  filePath,
  setVersion,
  setPull,
}: {
  startVersion: number
  repositoryFullName: string
  filePath: string
  setVersion: (version: number) => void
  setPull: (pull: (updates: readonly Update[], version: number) => void) => void
}) {
  let plugin = ViewPlugin.fromClass(
    class {
      private pushing = false
      private done = false

      constructor(private view: EditorView) {
        // this.pull();
        setPull(this.pull.bind(this))
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.push()
      }

      async push() {
        let updates = sendableUpdates(this.view.state)

        if (this.pushing || !updates.length) return
        this.pushing = true
        let version = getSyncedVersion(this.view.state)
        setVersion(version)

        await pushUpdates({
          version,
          repositoryFullName,
          filePath,
          fullUpdates: updates,
        })
        this.pushing = false
        // Regardless of whether the push failed or new updates came in
        // while it was running, try again if there's updates remaining
        if (sendableUpdates(this.view.state).length) setTimeout(() => this.push(), 100)
      }

      async pull(updates: readonly Update[], incomingVersion: number) {
        let version = getSyncedVersion(this.view.state)
        if (version !== incomingVersion) return

        // let updates = await pullUpdates({
        //   version,
        //   repositoryFullName,
        //   filePath,
        // });
        this.view.dispatch(receiveUpdates(this.view.state, updates))

        const newVersion = getSyncedVersion(this.view.state)
        setVersion(newVersion)
      }

      destroy() {
        this.done = true
      }
    },
  )
  return [collab({ startVersion }), plugin]
}

// Custom basic setup without line numbers and with minimal borders
const customBasicSetup = [
  history(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  rectangularSelection(),
  EditorView.lineWrapping,
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
  // Custom theme to remove all borders
  EditorView.theme({
    '&': {
      border: 'none !important',
      outline: 'none !important',
      boxShadow: 'none !important',
    },
    '.cm-editor': {
      border: 'none !important',
      outline: 'none !important',
      boxShadow: 'none !important',
    },
    '.cm-editor.cm-focused': {
      outline: 'none !important',
      border: 'none !important',
      boxShadow: 'none !important',
    },
    '.cm-focused': {
      outline: 'none !important',
      border: 'none !important',
      boxShadow: 'none !important',
    },
    '.cm-scroller': {
      border: 'none !important',
      outline: 'none !important',
    },
    '.cm-content': {
      border: 'none !important',
      outline: 'none !important',
    },
    '.cm-gutters': {
      border: 'none !important',
      borderRight: 'none !important',
    },
    '.cm-line': {
      border: 'none !important',
    },
  }),
]
// Language detection based on file extension
const getLanguageExtension = (fileName: string): Extension => {
  const ext = fileName.toLowerCase().split('.').pop()

  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return javascript({ jsx: true, typescript: ext.includes('ts') })
    case 'md':
    case 'markdown':
      return markdown()
    case 'json':
      return json()
    case 'html':
    case 'htm':
      return html()
    case 'css':
      return css()
    case 'py':
      return python()
    default:
      return markdown() // Default to markdown for text files
  }
}

// Check if file is markdown
const isMarkdownFile = (fileName?: string) => {
  if (!fileName) return true // Default to markdown if no filename
  const extension = fileName.split('.').pop()?.toLowerCase()
  return extension === 'md' || extension === 'markdown'
}

export function CodeEditorWrapper({
  repositoryFullName,
  filePath,
  initialFilePath,
}: {
  repositoryFullName: string
  filePath: string
  initialFilePath: string
}) {
  // const firstDocAction = useAction(api.fileStaging.getFileForEditing);
  const [firstDocData, setFirstDocData] = useState<
    Awaited<ReturnType<typeof cloudFunctions.getFileForEditing>>['data'] | null
  >(null)

  useEffect(() => {
    console.log('CodeEditor getFileForEditing params:', {
      repositoryFullName,
      initialFilePath,
      originalFilePath: initialFilePath,
    })

    if (!repositoryFullName || !initialFilePath) {
      console.warn('Missing required parameters for getFileForEditing')
      return
    }

    cloudFunctions
      .getFileForEditing({
        repositoryFullName,
        originalFilePath: initialFilePath,
      })
      .then(data => {
        setFirstDocData(data.data)
      })
      .catch(error => {
        console.error('getFileForEditing error:', error)
      })
  }, [repositoryFullName, initialFilePath])

  if (!firstDocData) return null

  return (
    <CodeEditor
      key={`${repositoryFullName}-${filePath}`}
      firstDoc={firstDocData}
      repositoryFullName={repositoryFullName}
      filePath={filePath}
    />
  )
}

export function CodeEditor({
  firstDoc,
  repositoryFullName,
  filePath,
}: {
  firstDoc: { version: number; content: string; sha: string }
  repositoryFullName: string
  filePath: string
}) {
  const fileName = filePath.split('/').pop()
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pullRef = useRef<((updates: readonly Update[], version: number) => void) | null>(null)
  // const { theme, systemTheme } = useTheme();
  // 3 letters/digits to differentiate the mounted editor
  const idRef = useRef(Math.random().toString(36).substring(2, 5))
  const [version, setVersion] = useState(firstDoc.version)

  const updates = useCollaborativeUpdates(repositoryFullName, filePath, version)

  useEffect(() => {
    if (!updates || !pullRef.current) return

    const cmUpdates = updates.map(u => ({
      changes: ChangeSet.fromJSON(JSON.parse(u.changes)),
      clientID: u.clientId,
    }))
    pullRef.current(cmUpdates, version)
  }, [updates])

  useEffect(() => {
    let cancelled = false
    let editor: EditorView | null = null

    const func = async () => {
      if (!editorRef.current) return

      if (cancelled) return

      // editor = createProseMarkEditor({
      //   content: firstDoc.content,
      //   version: firstDoc.version,
      //   parent: editorRef.current,
      //   isDark,
      //   repositoryFullName,
      //   filePath,
      // });

      // Custom basic setup without line numbers and with minimal borders

      const extensions = [
        ...customBasicSetup,
        markdown({
          codeLanguages: languages,
          extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
        }),
        EditorView.lineWrapping,
        prosemarkBasicSetup(),
        prosemarkBaseThemeSetup(),
        peerExtension({
          startVersion: firstDoc.version,
          repositoryFullName,
          filePath,
          setVersion,
          setPull: pull => {
            pullRef.current = pull
          },
        }),

        keymap.of([
          indentWithTab,
          {
            key: 'Alt-p',
            run: view => {
              console.log(printTree(syntaxTree(view.state), view.state.doc.toString()))
              return true
            },
          },
        ]),
      ]

      // Add dark theme if requested

      editor = new EditorView({
        extensions,
        doc: firstDoc.content,
        parent: editorRef.current,
      })

      viewRef.current = editor
      ;(window as any).editor = editor
    }

    func()
    // Cleanup function
    return () => {
      cancelled = true
      editor?.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]) // Re-create editor when theme or filename changes (value intentionally excluded to prevent recreation on every keystroke)

  return (
    <div
      ref={editorRef}
      className={`h-full w-full`}
      style={{
        height: '100%',
        minHeight: '400px', // Minimum height for usability
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
      }}
    />
  )
}
