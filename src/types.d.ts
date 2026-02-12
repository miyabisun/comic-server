declare module 'fs-readdir-recursive' {
  function readdir(path: string, filter?: (name: string, index: number, dir: string) => boolean): string[]
  export = readdir
}

declare module 'smart-sort' {
  export function naturalSort(arr: string[], caseSensitive?: boolean, order?: 'ASC' | 'DESC'): string[]
}
