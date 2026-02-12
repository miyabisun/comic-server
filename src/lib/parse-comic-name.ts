// Parse comic directory name to extract metadata
// Supported formats:
//   (genre) [brand (author)] title (original)
//   (genre) [brand (author)] title
//   [brand] title
//   other -> title = name

function zipObj(ks: string[], vs: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  ks.forEach((k, i) => { result[k] = vs[i] || '' })
  return result
}

export default function parseComicName(name: string) {
  let parsed: Record<string, string> | undefined

  let m: RegExpMatchArray | null

  if ((m = name.match(/^\(([^)]+)\).*\[([^\]]+)\](.+)\(([^)]+)\)$/))) {
    const values = m.slice(1).map((s) => s.trim())
    parsed = zipObj(['genre', 'brand', 'title', 'original'], values)
  } else if ((m = name.match(/^\(([^)]+)\).*\[([^\]]+)\](.+)/))) {
    const values = m.slice(1).map((s) => s.trim())
    parsed = zipObj(['genre', 'brand', 'title'], values)
  } else if ((m = name.match(/^\[([^\]]+)\](.+)/))) {
    const values = m.slice(1).map((s) => s.trim())
    parsed = zipObj(['brand', 'title'], values)
  }

  return { title: name, genre: '', brand: '', original: '', ...parsed }
}
