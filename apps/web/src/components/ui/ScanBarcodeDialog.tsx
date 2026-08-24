import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { Camera, Usb } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { cn } from '@/lib/utils'

export function ScanBarcodeDialog({
  open, onOpenChange, onScan,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (code: string) => void
}) {
  const [mode, setMode] = useState<'usb' | 'camera'>('usb')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  const handleScan = (code: string) => {
    onScan(code)
    onOpenChange(false)
  }

  // USB scanner: passively listens on a hidden input the moment the dialog opens in "usb" mode —
  // matches the existing app-wide pattern (POSTab, PromotionTargetPicker) of keystroke-timing detection.
  const { inputRef: usbInputRef, handleKeyDown: usbKeyDown, focusInput: focusUsbInput } = useBarcodeScanner(handleScan)

  useEffect(() => {
    if (open && mode === 'usb') focusUsbInput()
  }, [open, mode, focusUsbInput])

  // Camera scanner: starts a live decode loop against the first available camera when switched to
  // "camera" mode, stops it on dialog close or mode switch — must not leave the camera stream running
  // in the background after the user leaves this dialog.
  useEffect(() => {
    if (!open || mode !== 'camera') return
    setCameraError(null)
    const reader = new BrowserMultiFormatReader()
    let cancelled = false
    reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, err) => {
      if (cancelled) return
      if (result) handleScan(result.getText())
      // NotFoundException fires continuously while no barcode is in frame — expected, not an error.
    }).then((controls) => {
      if (cancelled) controls.stop()
      else controlsRef.current = controls
    }).catch(() => {
      if (!cancelled) setCameraError('Could not access camera — check browser permissions, or use a USB scanner instead.')
    })
    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [open, mode])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md outline-none ring-0 focus:ring-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Scan Barcode</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setMode('usb')}
            className={cn('flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
              mode === 'usb' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400')}>
            <Usb className="h-4 w-4" /> USB Scanner
          </button>
          <button type="button" onClick={() => setMode('camera')}
            className={cn('flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
              mode === 'camera' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400')}>
            <Camera className="h-4 w-4" /> Use Camera
          </button>
        </div>

        {mode === 'usb' ? (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-8 text-center space-y-2">
            <Usb className="h-8 w-8 mx-auto text-zinc-500" />
            <p className="text-sm text-zinc-400">Scan now with your USB barcode scanner.</p>
            <input
              ref={usbInputRef}
              onKeyDown={usbKeyDown}
              className="opacity-0 absolute pointer-events-none"
              aria-hidden="true"
              autoFocus
            />
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <p className="text-sm text-red-400 text-center">{cameraError}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
