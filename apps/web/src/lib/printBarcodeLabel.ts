export function printBarcodeLabel(name: string, barcodeValue: string, price: number) {
  const printWindow = window.open('', '_blank', 'width=400,height=300')
  if (!printWindow) return
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Product Label</title>
        <style>
          @page { size: 58mm 40mm; margin: 0; }
          body { margin: 0; padding: 4mm; font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 32mm; }
          h3 { font-size: 9px; margin: 0 0 2mm; text-align: center; max-width: 50mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          svg { width: 50mm; height: 18mm; }
          p { font-size: 8px; margin: 1mm 0 0; }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"></script>
      </head>
      <body>
        <h3>${name}</h3>
        <svg id="barcode"></svg>
        <p>₹${price}</p>
        <script>
          JsBarcode('#barcode', '${barcodeValue}', { format: 'CODE128', width: 1, height: 30, displayValue: true, fontSize: 8 });
          window.onload = () => { window.print(); window.close(); };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
