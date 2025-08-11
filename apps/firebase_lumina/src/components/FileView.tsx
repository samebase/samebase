import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery as useReactQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { GitHubLogoIcon, MagnifyingGlassIcon, PlusIcon } from '@radix-ui/react-icons'
import { useState, useEffect } from 'react'
import { useVaults } from '@/hooks/useVaults'
import { cloudFunctions, handleFunctionError } from '@/lib/functions'

// Types
type RepositoryTree = {
  path: string
  mode: string
  type: string
  sha: string
  size?: number
  url?: string
}[]

// Function to find the best file to display
function findBestInitialFile(files: RepositoryTree) {
  // Only consider blob (file) types, not directories
  const fileList = files.filter(item => item.type === 'blob')

  // Priority order for file selection
  const priorities = [
    'README.md',
    'readme.md',
    'index.js',
    'index.ts',
    'index.tsx',
    'main.js',
    'main.ts',
    'app.js',
    'app.ts',
  ]

  // Find first priority file
  for (const priority of priorities) {
    const found = fileList.find(file => file.path === priority)
    if (found) return found.path
  }

  // Return first markdown file
  const markdownFile = fileList.find(
    file => file.path.endsWith('.md') || file.path.endsWith('.markdown'),
  )
  if (markdownFile) return markdownFile.path

  // Return first file
  if (fileList.length > 0) return fileList[0].path

  return null
}

function FileViewWrapper() {
  const navigate = useNavigate()

  const {
    owner,
    repoName,
    '*': branchAndFilePath,
  } = useParams<{
    owner: string
    repoName: string
    '*': string
  }>()

  // Parse branch and file path from the wildcard parameter
  const parsedPath = branchAndFilePath ? branchAndFilePath.split('/') : []
  const branch = parsedPath[0] || 'main'
  const actualFilePath = parsedPath.slice(1).join('/')
  const selectedFile = actualFilePath || undefined
  const repositoryFullName = `${owner}/${repoName}`

  // Get vault for this repository
  const { vaults } = useVaults()
  const vault = vaults.find(v => v.repositoryFullName === repositoryFullName)

  // Fetch repository tree
  const tree = useReactQuery({
    queryKey: ['github-tree', owner, repoName],
    queryFn: async () => {
      if (!owner || !repoName) {
        throw new Error('Owner and repository name are required')
      }
      const result = await cloudFunctions.getRepositoryTree({ owner, repo: repoName })
      return result.data.tree
    },
    enabled: !!(owner && repoName),
  })

  // Auto-redirect to best file when no file is selected
  useEffect(() => {
    if (!selectedFile && (tree.data ?? []).length > 0 && !tree.isLoading && owner && repoName) {
      const bestFile = findBestInitialFile(tree.data ?? [])
      if (bestFile) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${bestFile}`, {
          replace: true,
        })
      }
    }
  }, [selectedFile, tree.data, tree.isLoading, owner, repoName, branch, navigate])

  if (!vault) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600">Repository not found or not connected</div>
          <Button asChild>
            <Link to="/">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!tree.data || !selectedFile || !owner || !repoName) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading repository...</div>
      </div>
    )
  }

  return (
    <FileViewInner
      vault={vault}
      tree={tree.data}
      selectedFile={selectedFile}
      branch={branch}
      owner={owner}
      repoName={repoName}
    />
  )
}

function FileViewInner({
  vault,
  tree,
  selectedFile,
  branch,
  owner,
  repoName,
}: {
  vault: any
  tree: RepositoryTree
  selectedFile: string
  branch: string
  owner: string
  repoName: string
}) {
  const navigate = useNavigate()
  const repositoryFullName = `${owner}/${repoName}`

  // Get file content for editing
  const fileContent = useReactQuery({
    queryKey: ['file-content', repositoryFullName, selectedFile],
    queryFn: async () => {
      const result = await cloudFunctions.getFileForEditing({
        repositoryFullName,
        filePath: selectedFile,
      })
      return result.data
    },
    enabled: !!(repositoryFullName && selectedFile),
  })

  const handleFileSelect = (path: string) => {
    if (owner && repoName) {
      void navigate(`/vault/${owner}/${repoName}/${branch}/${path}`)
    }
  }

  // Simple file tree component (we'll enhance this later)
  const SimpleFileTree = ({ files }: { files: RepositoryTree }) => (
    <div className="space-y-1">
      {files.map(file => (
        <div
          key={file.path}
          className={`p-2 text-sm cursor-pointer rounded hover:bg-muted/50 ${
            selectedFile === file.path ? 'bg-muted' : ''
          }`}
          onClick={() => file.type === 'blob' && handleFileSelect(file.path)}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {file.type === 'tree' ? '📁' : '📄'}
            </span>
            <span className="truncate">{file.path}</span>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className="w-80 border-r bg-muted/20 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b bg-background">
          <div className="flex items-center gap-2 mb-4">
            <GitHubLogoIcon className="h-5 w-5" />
            <span className="font-semibold truncate">{repositoryFullName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">← Back</Link>
            </Button>
            <Button variant="outline" size="sm" disabled>
              <PlusIcon className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
        </div>

        {/* File Tree */}
        <div className="flex-1 overflow-auto p-2">
          {tree.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No files found</div>
          ) : (
            <SimpleFileTree files={tree} />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* File Header */}
        <div className="p-4 border-b bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">📄</span>
              <span className="font-mono text-sm">{selectedFile}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                Save
              </Button>
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto">
          {fileContent.isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading file...</div>
            </div>
          ) : fileContent.error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-600">
                Error loading file: {handleFunctionError(fileContent.error)}
              </div>
            </div>
          ) : fileContent.data ? (
            <CodeEditorWrapper
              key={`${repositoryFullName}-${selectedFile}`}
              firstDoc={fileContent.data}
              repositoryFullName={repositoryFullName}
              filePath={selectedFile}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Simple code editor wrapper (we'll enhance this with prosemark)
function CodeEditorWrapper({
  firstDoc,
  repositoryFullName,
  filePath,
}: {
  firstDoc: { version: number; content: string; sha: string }
  repositoryFullName: string
  filePath: string
}) {
  return (
    <div className="h-full">
      <textarea
        className="w-full h-full p-4 font-mono text-sm border-0 resize-none focus:outline-none"
        value={firstDoc.content}
        readOnly
        placeholder="Loading file content..."
      />
    </div>
  )
}

// Main export
export function FileView() {
  return <FileViewWrapper />
}
