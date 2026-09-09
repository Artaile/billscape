export function printBarcodeLabel(
  name: string,
  barcodeValue: string,
  price: number,
  type: string = 'code128',
  labelSize?: string,
  templateStyle: string = 'standard',
  shopName?: string,
  shopAddress?: string,
  options?: {
    showShopName?: boolean
    showSku?: boolean
    showCodeValue?: boolean
    showPrice?: boolean
  }
) {
  const printWindow = window.open('', '_blank', 'width=400,height=300')
  if (!printWindow) return

  const isQr = type === 'qr'
  let format = 'CODE128'
  if (type === 'ean13') format = 'EAN13'
  if (type === 'code39') format = 'CODE39'

  const showShopName = options?.showShopName ?? true
  const showSku = options?.showSku ?? true
  const showCodeValue = options?.showCodeValue ?? true
  const showPrice = options?.showPrice ?? true

  let bodyHtml = ''
  if (templateStyle === 'compact_jewelry') {
    bodyHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; width:100%; border:1px solid #ccc; padding:6px; border-radius:6px; box-sizing:border-box;">
        <div style="text-align:left;">
          ${showShopName ? `<p style="font-size:9px; font-weight:bold; margin:0; text-transform:uppercase;">${shopName || 'JEWELRY TAG'}</p>` : ''}
          <p style="font-size:9px; font-weight:bold; margin:2px 0 0;">${name}</p>
          ${showPrice ? `
            <p style="font-size:8px; color:#666; margin:2px 0 0;">MRP RS <span style="text-decoration:line-through;">30,000.00</span></p>
            <p style="font-size:10px; font-weight:900; margin:1px 0 0;">SP RS ${price}</p>
          ` : ''}
        </div>
        <div>
          ${isQr ? '<canvas id="qrcode"></canvas>' : '<svg id="barcode"></svg>'}
        </div>
      </div>
    `
  } else if (templateStyle === 'saravana_stores') {
    bodyHtml = `
      <div style="display:flex; width:100%; border:1px solid #ccc; border-radius:6px; overflow:hidden; box-sizing:border-box;">
        <div style="flex:1; padding:6px; text-align:left;">
          <div style="display:flex; align-items:center; gap:8px;">
            ${isQr ? '<canvas id="qrcode"></canvas>' : '<svg id="barcode"></svg>'}
            <div>
              <p style="font-size:9px; font-weight:bold; margin:0; text-transform:uppercase;">${name}</p>
              ${showPrice ? `
                <p style="font-size:8px; color:#666; margin:2px 0 0;">MRP RS <span style="text-decoration:line-through;">300.00</span></p>
                <p style="font-size:10px; font-weight:900; margin:1px 0 0;">SP RS ${price}</p>
              ` : ''}
            </div>
          </div>
        </div>
        <div style="width:24px; background:linear-gradient(to bottom, #f59e0b, #ea580c); color:white; font-size:7px; font-weight:bold; display:flex; align-items:center; justify-content:center; text-transform:uppercase; writing-mode:vertical-rl; transform:rotate(180deg); padding:4px;">
          ${showShopName ? (shopName || 'DEPARTMENT STORE') : ''}
        </div>
      </div>
    `
  } else if (templateStyle === 'circular_bottle') {
    bodyHtml = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; border:2px solid #ccc; border-radius:50%; width:140px; height:140px; text-align:center; padding:8px; box-sizing:border-box;">
        ${showShopName ? `<p style="font-size:8px; font-weight:bold; margin:0; text-transform:uppercase;">${shopName || 'JAR LABEL'}</p>` : ''}
        <p style="font-size:8px; margin:1px 0;">${name}</p>
        ${isQr ? '<canvas id="qrcode"></canvas>' : '<svg id="barcode"></svg>'}
        ${showPrice ? `
          <p style="font-size:7.5px; color:#666; margin:1px 0 0;">MRP RS 70.00 (Incl. all taxes)</p>
          <p style="font-size:9px; font-weight:900; margin:1px 0 0;">SP RS ${price}</p>
        ` : ''}
      </div>
    `
  } else {
    // Standard retail label
    bodyHtml = `
      ${showShopName ? `<h3 style="font-size:10px; margin:0 0 2px; text-align:center; max-width:50mm; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:uppercase;">${shopName || name}</h3>` : ''}
      <p style="font-size:8px; color:#666; margin:0 0 4px;">${name}</p>
      ${isQr ? '<canvas id="qrcode"></canvas>' : '<svg id="barcode"></svg>'}
      ${showPrice ? `
        <p style="font-size:8px; color:#666; margin:2px 0 0;">MRP RS <span style="text-decoration:line-through;">599.00</span></p>
        <p style="font-size:10px; font-weight:bold; margin:1px 0 0;">SP RS ${price}</p>
      ` : ''}
    `
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Product Label - ${name}</title>
        <style>
          @page { size: ${labelSize ? labelSize.replace('cm', '0mm') : '58mm 40mm'}; margin: 0; }
          body { margin: 0; padding: 4mm; font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 32mm; }
          svg, canvas, img { max-width: 45mm; max-height: 18mm; }
        </style>
        ${isQr ? '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>' : '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"></script>'}
      </head>
      <body>
        ${bodyHtml}
        <script>
          window.onload = () => {
            if (${isQr}) {
              QRCode.toCanvas(document.getElementById('qrcode'), '${barcodeValue}', { width: 65, margin: 1 }, () => {
                setTimeout(() => { window.print(); window.close(); }, 150);
              });
            } else {
              try {
                JsBarcode('#barcode', '${barcodeValue}', { format: '${format}', width: 1.2, height: 28, displayValue: true, fontSize: 8 });
              } catch (e) {
                console.error(e);
              }
              setTimeout(() => { window.print(); window.close(); }, 150);
            }
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
