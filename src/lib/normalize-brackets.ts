// Normalize brackets in filenames with context awareness
// This function attempts to intelligently fix bracket imbalances

// Known tag patterns that should be self-contained in brackets
export const KNOWN_TAGS = [
  'DL版',
  '中文翻訳',
  '中国翻訳',
  '無修正',
  '進行中',
  '完結',
  'FANZA特別版',
  'デジタル版',
  '単行本版',
  '修正版',
]

// Create regex pattern for known tags
const TAG_PATTERN = new RegExp(`\\[(${KNOWN_TAGS.join('|')})(?!\\])`, 'g')

export default function normalizeBrackets(filename: string): string {
  let normalized = filename

  // First, try to fix known tag patterns
  // Example: [DL版 (オリジナル) -> [DL版] (オリジナル)
  normalized = normalized.replace(TAG_PATTERN, (match, tag) => {
    // Check what comes after the tag
    const afterTag = normalized.substring(normalized.indexOf(match) + match.length)

    // If followed by a space and opening bracket, close the tag bracket first
    if (/^\s*[\(\[\{]/.test(afterTag)) {
      return `[${tag}]`
    }

    return match
  })

  // Count remaining bracket imbalances
  const brackets = [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '（', close: '）' },
    { open: '［', close: '］' },
    { open: '｛', close: '｝' },
  ]

  for (const bracket of brackets) {
    const { open, close } = bracket
    const openCount = (normalized.match(new RegExp(`\\${open}`, 'g')) || []).length
    const closeCount = (normalized.match(new RegExp(`\\${close}`, 'g')) || []).length

    if (openCount > closeCount) {
      // More opening brackets - add closing brackets at the end
      normalized += close.repeat(openCount - closeCount)
    }
  }

  return normalized
}
