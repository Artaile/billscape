/**
 * Export data to a downloadable CSV file with UTF-8 BOM for Excel compatibility
 */
export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const escapeCell = (cell: string | number | boolean | null | undefined): string => {
    if (cell === null || cell === undefined) return '""'
    const str = String(cell)
    const escaped = str.replace(/"/g, '""')
    return `"${escaped}"`
  }

  const csvLines = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ]

  const csvString = '\uFEFF' + csvLines.join('\r\n')
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Parse a CSV file into array of header-mapped objects
 */
export function parseCSV(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        if (!text) {
          resolve([])
          return
        }

        const lines = parseCSVText(text)
        if (lines.length < 2) {
          resolve([])
          return
        }

        // Clean headers: lowercase, stripped quotes and spaces
        const rawHeaders = lines[0]
        const headers = rawHeaders.map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))

        const result: Record<string, string>[] = []

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i]
          if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue

          const rowObj: Record<string, string> = {}
          let hasData = false

          headers.forEach((header, idx) => {
            const val = (row[idx] ?? '').trim()
            if (val) hasData = true
            rowObj[header] = val
          })

          if (hasData) {
            result.push(rowObj)
          }
        }

        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsText(file)
  })
}

/**
 * Helper parser to handle quoted cells with commas and newlines
 */
function parseCSVText(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '') // remove BOM
  const lines: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let insideQuotes = false

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i]
    const nextChar = cleanText[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        i++ // skip escaped quote
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // skip \n
      }
      currentRow.push(currentCell)
      lines.push(currentRow)
      currentRow = []
      currentCell = ''
    } else {
      currentCell += char
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell)
    lines.push(currentRow)
  }

  return lines
}
