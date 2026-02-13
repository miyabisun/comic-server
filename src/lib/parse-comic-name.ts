// Parse comic directory name to extract metadata
// Supported formats:
//   (genre) [brand (author)] title (original)
//   (genre) [brand (author)] title
//   [brand] title
//   other -> title = name
//
// Known tags like [DL版] are stripped before parsing
// to avoid misidentifying them as brand names.

import { KNOWN_TAGS } from './normalize-brackets.js'

const KNOWN_TAG_PATTERN = new RegExp(`\\[(${KNOWN_TAGS.join('|')})\\]\\s*`, 'g')

function stripKnownTags(name: string): string {
  return name.replace(KNOWN_TAG_PATTERN, '').replace(/\s+/g, ' ').trim()
}

export default function parseComicName(name: string) {
  const stripped = stripKnownTags(name)

  let m: RegExpMatchArray | null

  if ((m = stripped.match(/^\(([^)]+)\).*\[([^\]]+)\](.+)\(([^)]+)\)$/))) {
    const [genre, brand, title, original] = m.slice(1).map((s) => s.trim())
    return { title, genre, brand, original }
  }

  if ((m = stripped.match(/^\(([^)]+)\).*\[([^\]]+)\](.+)/))) {
    const [genre, brand, title] = m.slice(1).map((s) => s.trim())
    return { title, genre, brand, original: '' }
  }

  if ((m = stripped.match(/^\[([^\]]+)\](.+)/))) {
    const [brand, title] = m.slice(1).map((s) => s.trim())
    return { title, genre: '', brand, original: '' }
  }

  return { title: name, genre: '', brand: '', original: '' }
}
