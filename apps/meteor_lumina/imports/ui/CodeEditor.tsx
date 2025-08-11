/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable prefer-const */
import React, { useRef, useEffect, useState } from 'react'
import { useQuery as useReactQuery } from '@tanstack/react-query'
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

import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'

import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
  Update,
} from '@codemirror/collab'
import { Meteor } from 'meteor/meteor'
import { useTracker } from 'meteor/react-meteor-data'
import { GFM } from '@lezer/markdown'
import {
  prosemarkBaseThemeSetup,
  prosemarkBasicSetup,
  prosemarkMarkdownSyntaxExtensions,
  // @ts-expect-error no types
} from '@prosemark/core'
import { printTree } from '@lezer-unofficial/printer'

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

  return Meteor.callAsync('pushUpdates', { repositoryFullName, filePath, version, updates }).then(
    result => result.success,
  )
}

async function pullUpdates({
  version,
  repositoryFullName,
  filePath,
}: {
  version: number
  repositoryFullName: string
  filePath: string
}): Promise<readonly Update[]> {
  await awaitTimeout(delay)
  return Meteor.callAsync('pullUpdates', { repositoryFullName, filePath, version }).then(updates =>
    updates.map((u: any) => ({
      changes: ChangeSet.fromJSON(JSON.parse(u.changes)),
      clientID: u.clientID,
    })),
  )
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
  originalFilePath,
}: {
  repositoryFullName: string
  filePath: string
  originalFilePath: string
}) {
  const [firstDocData, setFirstDocData] = useState<{
    version: number
    content: string
  } | null>(null)

  console.log('CodeEditorWrapper', { repositoryFullName, filePath, originalFilePath })

  useEffect(() => {
    console.log('CodeEditorWrapper useEffect', { repositoryFullName, originalFilePath })
    Meteor.callAsync('getFileForEditing', { repositoryFullName, originalFilePath })
      .then(data => {
        console.log('CodeEditorWrapper useEffect then', { data })
        setFirstDocData(data)
      })
      .catch(console.error)
  }, [repositoryFullName, originalFilePath])

  if (!firstDocData) return <div>Loading file...</div>

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
  firstDoc: { version: number; content: string }
  repositoryFullName: string
  filePath: string
}) {
  const fileName = filePath.split('/').pop()
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pullRef = useRef<((updates: readonly Update[], version: number) => void) | null>(null)

  // 3 letters/digits to differentiate the mounted editor
  const idRef = useRef(Math.random().toString(36).substring(2, 5))
  const [version, setVersion] = useState(firstDoc.version)

  const updates = useReactQuery({
    queryKey: ['pull-updates', repositoryFullName, filePath, version],
    queryFn: async () => {
      if (!repositoryFullName || !filePath || version === undefined) return []
      return await Meteor.callAsync('pullUpdates', { repositoryFullName, filePath, version })
    },
    enabled: !!(repositoryFullName && filePath && version !== undefined),
  })

  useEffect(() => {
    if (!updates.data || !pullRef.current) return

    const cmUpdates = updates.data.map((u: any) => ({
      changes: ChangeSet.fromJSON(JSON.parse(u.changes)),
      clientID: u.clientID,
    }))
    pullRef.current(cmUpdates, version)
  }, [updates.data, version])

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
  }, [fileName]) // Re-create editor when filename changes (value intentionally excluded to prevent recreation on every keystroke)

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
