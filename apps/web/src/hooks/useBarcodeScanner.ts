import { useCallback, useEffect, useRef } from 'react'

// USB barcode scanners act as keyboard-wedge devices — they "type" the code followed by
// Enter, faster than any human can type. Distinguishing scan input from manual typing is done
// by inter-keystroke timing: consecutive keys arriving under this threshold are treated as
// scanner input and buffered; anything slower resets the buffer as manual typing.
const SCANNER_THRESHOLD_MS = 75
// Same physical scan (e.g. a barcode still under the scanner's laser, or a double-fire)
// shouldn't trigger the callback twice within this window.
const DUPLICATE_SCAN_WINDOW_MS = 500

export function useBarcodeScanner(onScan: (code: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null)
  const buffer = useRef('')
  const lastKeystrokeTime = useRef(0)
  const lastScannedCode = useRef('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    focusInput()
  }, [focusInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const now = Date.now()
      const delta = now - lastKeystrokeTime.current
      lastKeystrokeTime.current = now

      if (e.key === 'Enter') {
        const code = buffer.current.trim()
        buffer.current = ''
        if (!code) return

        if (code === lastScannedCode.current) return
        lastScannedCode.current = code
        clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
          lastScannedCode.current = ''
        }, DUPLICATE_SCAN_WINDOW_MS)

        onScan(code)
        focusInput()
        return
      }

      if (delta < SCANNER_THRESHOLD_MS) {
        if (e.key.length === 1) buffer.current += e.key
        e.preventDefault()
      } else {
        buffer.current = e.key.length === 1 ? e.key : ''
      }
    },
    [onScan, focusInput],
  )

  return { inputRef, handleKeyDown, focusInput }
}
