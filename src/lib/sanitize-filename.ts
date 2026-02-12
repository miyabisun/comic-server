import normalizeBrackets from './normalize-brackets.js'

// Sanitize filename to avoid issues with web servers and file systems
// Replaces problematic characters with full-width equivalents
// Also normalizes bracket structures
export default function sanitizeFilename(filename: string): string {
  const replaced = filename
    .replace(/#/g, '＃')      // Full-width sharp (避免 URL fragment)
    .replace(/\?/g, '？')     // Full-width question mark
    .replace(/</g, '＜')      // Full-width less than
    .replace(/>/g, '＞')      // Full-width greater than
    .replace(/:/g, '：')      // Full-width colon (Windows compatibility)
    .replace(/"/g, '\u201D')  // Full-width double quote
    .replace(/\|/g, '｜')     // Full-width pipe
    .replace(/\*/g, '＊')     // Full-width asterisk
    .replace(/\\/g, '＼')     // Full-width backslash

  return normalizeBrackets(replaced)
}
