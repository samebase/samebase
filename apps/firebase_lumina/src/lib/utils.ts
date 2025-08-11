import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Debug helper for development
export const debug = {
  log: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      console.log(`[DEBUG] ${message}`, data)
    }
  },
  error: (message: string, error?: any) => {
    if (import.meta.env.DEV) {
      console.error(`[ERROR] ${message}`, error)
    }
  },
  warn: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      console.warn(`[WARN] ${message}`, data)
    }
  },
}

// Helper to format file sizes
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Helper to validate GitHub repository names
export const isValidRepoName = (name: string): boolean => {
  // GitHub repository names can contain alphanumeric characters and hyphens
  // They cannot start or end with hyphens and cannot contain consecutive hyphens
  const pattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/
  return pattern.test(name) && name.length <= 100
}

// Helper to extract owner and repo from full name
export const parseRepoFullName = (fullName: string): { owner: string; repo: string } | null => {
  const parts = fullName.split('/')
  if (parts.length !== 2) return null

  const [owner, repo] = parts
  if (!owner || !repo) return null

  return { owner, repo }
}

// Helper to generate random colors for avatars
export const generateAvatarColor = (seed: string): string => {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ]

  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}
