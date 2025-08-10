import React from 'react'

// Simple fuzzy search implementation
export function fuzzyMatch(needle: string, haystack: string): { score: number; matches: number[] } {
  if (!needle) return { score: 0, matches: [] }

  const needleLower = needle.toLowerCase()
  const haystackLower = haystack.toLowerCase()
  const matches: number[] = []

  let needleIndex = 0
  let score = 0

  for (let i = 0; i < haystackLower.length && needleIndex < needleLower.length; i++) {
    if (haystackLower[i] === needleLower[needleIndex]) {
      matches.push(i)
      needleIndex++
      // Boost score for consecutive matches
      if (matches.length > 1 && matches[matches.length - 1] === matches[matches.length - 2] + 1) {
        score += 2
      } else {
        score += 1
      }
    }
  }

  // Only return a match if all characters were found
  if (needleIndex === needleLower.length) {
    // Boost score for matches at the start
    if (matches[0] === 0) score += 3
    // Boost score for matches in filename (after last /)
    const lastSlash = haystack.lastIndexOf('/')
    if (matches.some(m => m > lastSlash)) score += 2
    return { score, matches }
  }

  return { score: -1, matches: [] }
}

export function highlightMatches(text: string, matches: number[]): React.ReactNode {
  if (matches.length === 0) return text

  const parts: React.ReactNode[] = []
  let lastIndex = 0

  matches.forEach((match, i) => {
    // Add text before this match
    if (match > lastIndex) {
      parts.push(text.slice(lastIndex, match))
    }
    // Add highlighted character
    parts.push(
      <mark key={i} className="bg-yellow-200 text-yellow-900">
        {text[match]}
      </mark>,
    )
    lastIndex = match + 1
  })

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <>{parts}</>
}
