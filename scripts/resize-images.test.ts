import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('resize works without Real-CUGAN and rejects obsolete noise options', () => {
  const root = mkdtempSync(join(tmpdir(), 'resize-images-'))
  try {
    const bin = join(root, 'bin')
    const input = join(root, 'input')
    const output = join(root, 'output')
    mkdirSync(bin)
    mkdirSync(input)
    for (const name of ['bash', 'basename', 'mkdir', 'stat', 'numfmt', 'sed']) {
      const command = spawnSync('which', [name], { encoding: 'utf8' })
      expect(command.status).toBe(0)
      symlinkSync(command.stdout.trim(), join(bin, name))
    }
    writeFileSync(join(bin, 'magick'), `#!/usr/bin/env bash
if [[ "$1" == identify ]]; then
  read -r w h < "\${@: -1}"
  if [[ "$3" == '%w %h' ]]; then printf '%s %s' "$w" "$h"; else printf '%sx%s' "$w" "$h"; fi
else
  printf '3840 1920\\n' > "\${@: -1}"
fi
`, { mode: 0o755 })
    writeFileSync(join(input, 'large.jpg'), '4000 2000\n')
    writeFileSync(join(input, 'small.png'), '800 600\n')
    const run = (...args: string[]) => spawnSync(join(bin, 'bash'), [join(import.meta.dir, 'resize-images.sh'), input, output, ...args], {
      encoding: 'utf8', env: { ...process.env, PATH: bin, RCUGAN_BIN: 'missing-realcugan' },
    })
    const result = run()
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: expect.any(String) })
    expect(readdirSync(output)).toEqual(['large.jpg'])
    expect(readFileSync(join(input, 'large.jpg'), 'utf8')).toBe('4000 2000\n')
    expect(result.stdout).toContain('Processed: 1')
    expect(result.stdout).toContain('Skipped:   1')
    for (const option of ['-n', '--noise']) {
      const rejected = run(option, '2')
      expect(rejected.status).not.toBe(0)
      expect(rejected.stderr).toContain(`Unknown option: ${option}`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
