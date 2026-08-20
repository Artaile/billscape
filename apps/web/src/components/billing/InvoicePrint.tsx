import React, { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import QRCode from 'qrcode'
import { formatINR, amountInWords, computeLineTax } from '@billscape/core'
import { formatDateTime } from '@/lib/utils'
import type { CartItem, InvoiceTotals, OrgBranding, OrgInvoiceTemplate } from '@billscape/core'
import { Button } from '@/components/ui/button'

export interface InvoicePrintProps {
  invoiceNo: string
  date: string
  shopName: string
  shopAddress?: string
  shopGstin?: string
  shopPan?: string
  shopLogoUrl?: string
  shopPhone?: string
  shopEmail?: string
  customerName?: string
  customerPhone?: string
  customerGstin?: string
  customerAddress?: string
  items: CartItem[]
  totals: InvoiceTotals
  paymentMode: string
  paymentDetail?: string
  branding?: OrgBranding
  invoiceTemplate?: OrgInvoiceTemplate
  /** Hide the built-in "Print Invoice" button — set when the host page provides its own print action. */
  hidePrintButton?: boolean
  /** DOM id for the printable root — override when a second InvoicePrint may be mounted at the same time (e.g. a preview dialog) to avoid duplicate ids. */
  rootId?: string
}

export function InvoicePrint({
  invoiceNo,
  date,
  shopName,
  shopAddress,
  shopGstin,
  shopPan,
  shopLogoUrl,
  shopPhone,
  shopEmail,
  customerName,
  customerPhone,
  customerGstin,
  customerAddress,
  items,
  totals,
  paymentMode,
  paymentDetail,
  branding,
  invoiceTemplate,
  hidePrintButton,
  rootId = 'invoice-print-root',
}: InvoicePrintProps) {
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string | null>(null)

  const handlePrint = () => {
    const elem = document.getElementById(rootId)
    if (!elem) {
      window.print()
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      window.print()
      return
    }

    let styles = ''
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      styles += node.outerHTML
    })

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${invoiceNo}</title>
          ${styles}
          <style>
            @page {
              margin: 10mm 12mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
          </style>
        </head>
        <body>
          ${elem.outerHTML}
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.focus();
                window.print();
                setTimeout(() => {
                  window.frameElement?.remove();
                }, 1000);
              }, 250);
            };
          </script>
        </body>
      </html>
    `)
    doc.close()
  }

  // Determine Paper Size & Mode
  const paperSize = branding?.print_paper_size || 'a4'
  const isThermal = paperSize === 'thermal_3inch' || paperSize === 'thermal_2inch' || (paperSize as string) === 'thermal-80mm' || (paperSize as string) === 'thermal-58mm'
  const is58mm = paperSize === 'thermal_2inch' || (paperSize as string) === 'thermal-58mm'

  // Generate UPI QR Code if UPI ID is present and enabled
  const upiId = branding?.upi_id
  const showUpiQr = (branding?.print_show_upi_qr ?? true) && !!upiId

  useEffect(() => {
    if (showUpiQr && upiId) {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${totals.net_payable}&cu=INR&tn=${encodeURIComponent(invoiceNo)}`
      QRCode.toDataURL(upiUrl, {
        margin: 1,
        width: isThermal ? 100 : 120,
        errorCorrectionLevel: 'M',
      })
        .then((url) => setUpiQrDataUrl(url))
        .catch((err) => console.error('Failed to generate UPI QR:', err))
    } else {
      setUpiQrDataUrl(null)
    }
  }, [showUpiQr, upiId, shopName, totals.net_payable, invoiceNo, isThermal])

  // Print Visibility Flags from Branding / Template
  const showHeaderMsg = !!(invoiceTemplate?.invoice_header || branding?.invoice_header)
  const headerMsg = invoiceTemplate?.invoice_header || branding?.invoice_header

  const showFooterMsg = (branding?.print_show_notes ?? true) && !!(invoiceTemplate?.invoice_footer || branding?.invoice_footer)
  const footerMsg = invoiceTemplate?.invoice_footer || branding?.invoice_footer

  const showTerms = branding?.print_show_terms ?? true
  const termsText = invoiceTemplate?.default_terms || branding?.invoice_terms || 'Thank you for your business!'

  const showBankDetails = (branding?.print_show_bank_details ?? true) && (branding?.bank_name || branding?.bank_account || branding?.bank_ifsc || branding?.upi_id)

  // Signatory & Digital Signature visibility
  const showSignatory = branding?.print_show_signature ?? true
  const showSignatureOutline = branding?.print_show_signature_outline ?? true
  const showDigitalSignature = (invoiceTemplate?.show_signature ?? branding?.show_signature_on_invoice ?? false) && showSignatory
  const signatureUrl = invoiceTemplate?.signature_url || branding?.signature_url

  // Column Visibility Toggles
  const showSno = branding?.print_show_column_sno ?? true
  const showHsn = (branding?.print_show_column_hsn ?? true) && (branding?.show_hsn_on_invoice ?? true)
  const showColumnMrp = branding?.print_show_column_mrp ?? false
  const showColumnItemName = branding?.print_show_column_item_name ?? true
  const showColumnQty = branding?.print_show_column_qty ?? true
  const showColumnUnit = branding?.print_show_column_unit ?? true
  const showColumnRate = branding?.print_show_column_rate ?? true
  const showColumnDiscountType = branding?.print_show_column_discount_type ?? false
  const showDiscount = (branding?.print_show_column_discount ?? true) && totals.discount_total > 0
  const showTaxRate = branding?.print_show_column_tax_rate ?? true
  const showColumnTaxableValue = branding?.print_show_column_taxable_value ?? false
  const showColumnTaxAmount = branding?.print_show_column_tax_amount ?? false
  const showColumnItemTotal = branding?.print_show_column_item_total ?? true
  const taxInclusivePricing = branding?.tax_inclusive ?? false

  // Header / Business Info Toggles
  const showShopName = branding?.print_show_shop_name ?? true
  const showShopAddress = (branding?.print_show_address ?? true) && !!shopAddress
  const showShopContact = branding?.print_show_contact ?? true
  const showShopGstin = branding?.print_show_gstin ?? true
  const showShopPan = branding?.print_show_pan ?? true
  const showShopEmailWebsite = branding?.print_show_email_website ?? true

  // Document Details Toggles
  const showDocumentNumber = branding?.print_show_document_number ?? true
  const showDocumentDate = branding?.print_show_document_date ?? true
  const showPaymentModeHeader = branding?.print_show_payment_mode ?? false

  // Party (Bill To) Toggles
  const showCustomerBillingAddress = (branding?.print_show_customer_billing_address ?? true) && !!customerAddress
  const showCustomerPhoneLine = branding?.print_show_customer_phone ?? true
  const showPartyBlock = (branding?.print_show_party_details ?? true) && !!(
    customerName ||
    (showCustomerPhoneLine && customerPhone) ||
    (showCustomerBillingAddress && customerAddress) ||
    customerGstin
  )

  // Tax Summary Toggles
  const showTaxSummaryBlock = (branding?.print_show_tax_summary ?? true) && !isThermal
  const showCgstSgstIgst = branding?.print_show_cgst_sgst_igst ?? true

  // Totals Calculation Card Toggles
  const showBlockSubtotal = branding?.print_show_block_subtotal ?? true
  const showBlockDiscount = branding?.print_show_block_discount ?? true
  const showBlockTaxAmount = branding?.print_show_block_tax_amount ?? true
  const showBlockRoundOff = branding?.print_show_block_round_off ?? true
  const showBlockGrandTotal = branding?.print_show_block_grand_total ?? true

  return (
    <>
      {/* Print action button - hidden during print */}
      {!hidePrintButton && (
        <div className="no-print flex justify-end mb-4 gap-2">
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print Invoice
          </Button>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body :not(#${rootId}):not(#${rootId} *) { display: none !important; }
          #${rootId} { display: block !important; }
        }
        #${rootId} {
          font-family: ${branding?.print_font_family || 'Arial, sans-serif'};
          color: ${branding?.print_text_color || '#18181b'};
          background: #fff;
          max-width: ${
            is58mm ? '54mm' : isThermal ? '76mm' : paperSize === 'a5' ? '148mm' : '210mm'
          };
          margin: 0 auto;
          padding: ${isThermal ? '2mm' : paperSize === 'a5' ? '5mm' : '10mm'};
          font-size: ${is58mm ? '9px' : isThermal ? '10px' : '11px'};
          line-height: 1.4;
        }
      `}</style>

      <div id={rootId} className="bg-white text-zinc-900 p-4 sm:p-6 rounded-lg">
        {/* Optional Header Message */}
        {showHeaderMsg && (
          <div className="text-center pb-2 mb-2 border-b border-gray-200 text-xs italic text-gray-700">
            {headerMsg}
          </div>
        )}

        {/* Business Header */}
        <div className={`space-y-1 pb-3 mb-3 border-b-2 border-dashed border-zinc-400 ${isThermal ? 'text-center' : 'flex items-start justify-between text-left'}`}>
          <div className={`space-y-0.5 ${isThermal ? 'mx-auto' : ''}`}>
            {(shopLogoUrl || branding?.print_show_logo) && (
              <div className={`flex items-center ${isThermal ? 'justify-center mb-1' : 'justify-start mb-2'}`}>
                <img src={shopLogoUrl || branding?.logo_url} alt="Logo" className={`object-contain ${isThermal ? 'h-8' : 'h-10'}`} />
              </div>
            )}
            {showShopName && <h1 className="font-bold text-zinc-950 uppercase tracking-tight text-[1.15em]">{shopName}</h1>}
            {showShopAddress && <p className="text-[0.9em] text-zinc-600 leading-tight">{shopAddress}</p>}
            <div className="text-[0.9em] text-zinc-600 space-x-1">
              {showShopContact && shopPhone && <span>Ph: {shopPhone}</span>}
              {showShopContact && shopPhone && showShopEmailWebsite && shopEmail && <span>|</span>}
              {showShopEmailWebsite && shopEmail && <span>{shopEmail}</span>}
            </div>
            <div className="text-[0.9em] font-bold text-zinc-800 space-x-1">
              {showShopGstin && shopGstin && <span>GSTIN: {shopGstin}</span>}
              {showShopGstin && shopGstin && showShopPan && shopPan && <span>|</span>}
              {showShopPan && shopPan && <span>PAN: {shopPan}</span>}
            </div>
          </div>

          {!isThermal && (
            <div className="text-right text-[0.9em] space-y-0.5 shrink-0">
              <h2 className="font-bold text-[1.1em] uppercase text-zinc-950">TAX INVOICE</h2>
              {showDocumentNumber && <p className="text-zinc-600">Invoice: <span className="font-bold font-mono">{invoiceNo}</span></p>}
              {showDocumentDate && <p className="text-zinc-600">Date: {formatDateTime(date)}</p>}
              {showPaymentModeHeader && <p className="text-zinc-600">Mode: <span className="capitalize">{paymentMode}</span></p>}
            </div>
          )}
        </div>

        {isThermal && (showDocumentNumber || showDocumentDate || showPaymentModeHeader) && (
          <div className="py-1 text-[0.9em] flex justify-between text-zinc-600 border-b border-dashed border-zinc-400 flex-wrap gap-1 mb-3">
            {showDocumentNumber && <span>Invoice: <span className="font-bold font-mono">{invoiceNo}</span></span>}
            {showDocumentDate && <span>{formatDateTime(date)}</span>}
            {showPaymentModeHeader && <span>Mode: <span className="capitalize">{paymentMode}</span></span>}
          </div>
        )}

        {/* Customer details */}
        {showPartyBlock && (
          <div className="py-2 mb-3 border-b border-dashed border-zinc-400 text-[0.9em]">
            <p className="font-bold text-zinc-800">Billed To:</p>
            {customerName && <p className="font-medium text-zinc-950">{customerName}</p>}
            {showCustomerBillingAddress && <p className="text-zinc-600">{customerAddress}</p>}
            <div className="text-zinc-600 space-x-1">
              {showCustomerPhoneLine && customerPhone && <span>Ph: {customerPhone}</span>}
              {showCustomerPhoneLine && customerPhone && customerGstin && <span>|</span>}
              {customerGstin && <span>GSTIN: {customerGstin}</span>}
            </div>
          </div>
        )}

        {/* Items table */}
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300">
              {showSno && <th className="px-1.5 py-1 text-left">#</th>}
              {showColumnItemName && <th className="px-1.5 py-1 text-left">Item</th>}
              {showHsn && <th className="px-1.5 py-1 text-left">HSN</th>}
              {showColumnMrp && <th className="px-1.5 py-1 text-right">MRP</th>}
              {showColumnQty && <th className="px-1.5 py-1 text-right">Qty</th>}
              {showColumnUnit && <th className="px-1.5 py-1 text-left">Unit</th>}
              {showColumnRate && <th className="px-1.5 py-1 text-right">Rate</th>}
              {showColumnDiscountType && <th className="px-1.5 py-1 text-left">Disc Type</th>}
              {showDiscount && <th className="px-1.5 py-1 text-right">Disc</th>}
              {showTaxRate && <th className="px-1.5 py-1 text-right">Tax%</th>}
              {showColumnTaxableValue && <th className="px-1.5 py-1 text-right">Taxable</th>}
              {showColumnTaxAmount && <th className="px-1.5 py-1 text-right">Tax Amt</th>}
              {showColumnItemTotal && <th className="px-1.5 py-1 text-right">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const sellingSecondary = item.secondary_unit && item.selling_unit_id === item.secondary_unit.id && item.conversion_factor
              const displayQty = sellingSecondary ? item.qty / (item.conversion_factor as number) : item.qty
              const displayUnitSymbol = sellingSecondary ? item.secondary_unit?.symbol : item.unit?.symbol
              const base = item.unit_price * item.qty
              const discAmt = item.discount_type === 'flat'
                ? Math.min(item.discount_amount ?? 0, base)
                : base * (item.discount_pct / 100)
              const lineCalc = computeLineTax(
                item.unit_price,
                item.qty,
                item.discount_pct,
                item.tax_rate,
                totals.is_interstate,
                item.discount_type,
                item.discount_amount,
                taxInclusivePricing,
              )
              const rowTaxable = lineCalc.taxableAmount
              const rowTax = lineCalc.cgst + lineCalc.sgst + lineCalc.igst
              const lineTotal = lineCalc.lineTotal
              return (
                <tr key={item.product_id || i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                  {showSno && <td className="px-1.5 py-1 border-b border-gray-200">{i + 1}</td>}
                  {showColumnItemName && (
                    <td className="px-1.5 py-1 border-b border-gray-200 font-medium">
                      {item.product_name}
                    </td>
                  )}
                  {showHsn && <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600">{item.hsn_code ?? '-'}</td>}
                  {showColumnMrp && <td className="px-1.5 py-1 border-b border-gray-200 text-right text-gray-400">—</td>}
                  {showColumnQty && (
                    <td className="px-1.5 py-1 border-b border-gray-200 text-right whitespace-nowrap">
                      {displayQty}
                    </td>
                  )}
                  {showColumnUnit && <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600">{displayUnitSymbol ?? '-'}</td>}
                  {showColumnRate && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(item.unit_price)}</td>}
                  {showColumnDiscountType && (
                    <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600 capitalize">{item.discount_type ?? '-'}</td>
                  )}
                  {showDiscount && (
                    <td className="px-1.5 py-1 border-b border-gray-200 text-right text-green-700">
                      {item.discount_type === 'flat' ? `-${formatINR(discAmt)}` : `-${item.discount_pct}%`}
                    </td>
                  )}
                  {showTaxRate && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{item.tax_rate}%</td>}
                  {showColumnTaxableValue && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(rowTaxable)}</td>}
                  {showColumnTaxAmount && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(rowTax)}</td>}
                  {showColumnItemTotal && <td className="px-1.5 py-1 border-b border-gray-200 text-right font-medium">{formatINR(lineTotal)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totals + Tax breakup */}
        <div className={`flex ${isThermal ? 'flex-col' : 'gap-4'} mb-3`}>
          {/* Tax breakup */}
          {showTaxSummaryBlock && totals.tax_breakup.length > 0 && (
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700 mb-1">Tax Summary</p>
              <table className="w-full border-collapse text-xs border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-200 px-2 py-1 text-left">Rate</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">Taxable</th>
                    {showCgstSgstIgst && (
                      totals.is_interstate ? (
                        <th className="border border-gray-200 px-2 py-1 text-right">IGST</th>
                      ) : (
                        <>
                          <th className="border border-gray-200 px-2 py-1 text-right">CGST</th>
                          <th className="border border-gray-200 px-2 py-1 text-right">SGST</th>
                        </>
                      )
                    )}
                    <th className="border border-gray-200 px-2 py-1 text-right">Tax Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.tax_breakup.map((line) => (
                    <tr key={line.tax_rate}>
                      <td className="border border-gray-200 px-2 py-0.5">{line.tax_rate}%</td>
                      <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.taxable_amount)}</td>
                      {showCgstSgstIgst && (
                        totals.is_interstate ? (
                          <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.igst)}</td>
                        ) : (
                          <>
                            <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.cgst)}</td>
                            <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.sgst)}</td>
                          </>
                        )
                      )}
                      <td className="border border-gray-200 px-2 py-0.5 text-right">
                        {formatINR(totals.is_interstate ? line.igst : line.cgst + line.sgst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals Calculation Card */}
          <div className={isThermal ? 'w-full border-t border-gray-300 pt-2' : 'w-56'}>
            <table className="w-full text-xs">
              <tbody>
                {showBlockSubtotal && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Subtotal</td>
                    <td className="py-0.5 text-right">{formatINR(totals.subtotal)}</td>
                  </tr>
                )}
                {showBlockDiscount && totals.discount_total > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Discount</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.discount_total)}</td>
                  </tr>
                )}
                {showBlockTaxAmount && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Taxable Amount</td>
                    <td className="py-0.5 text-right">{formatINR(totals.taxable_amount)}</td>
                  </tr>
                )}
                {showCgstSgstIgst && (
                  totals.is_interstate ? (
                    <tr>
                      <td className="py-0.5 text-gray-600">IGST</td>
                      <td className="py-0.5 text-right">{formatINR(totals.igst_total)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td className="py-0.5 text-gray-600">CGST</td>
                        <td className="py-0.5 text-right">{formatINR(totals.cgst_total)}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-gray-600">SGST</td>
                        <td className="py-0.5 text-right">{formatINR(totals.sgst_total)}</td>
                      </tr>
                    </>
                  )
                )}
                {showBlockGrandTotal && (
                  <tr>
                    <td className="py-0.5 font-medium text-gray-800">Grand Total</td>
                    <td className="py-0.5 text-right font-medium text-gray-900">
                      {formatINR(totals.grand_total)}
                    </td>
                  </tr>
                )}
                {showBlockDiscount && totals.order_discount_amount > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Bill Discount</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.order_discount_amount)}</td>
                  </tr>
                )}
                {totals.loyalty_redeem_amount > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Loyalty Redeemed</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.loyalty_redeem_amount)}</td>
                  </tr>
                )}
                {showBlockRoundOff && typeof totals.round_off_amount === 'number' && totals.round_off_amount !== 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Round Off</td>
                    <td className="py-0.5 text-right">
                      {totals.round_off_amount > 0 ? `+${formatINR(totals.round_off_amount)}` : formatINR(totals.round_off_amount)}
                    </td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-800">
                  <td className="pt-1.5 font-bold text-sm text-gray-900">Net Payable</td>
                  <td className="pt-1.5 text-right font-bold text-sm text-gray-900">
                    {formatINR(totals.net_payable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Amount in words */}
        <div className="border border-gray-300 rounded p-2 mb-3 bg-gray-50 text-xs">
          <span className="font-semibold">Amount in Words: </span>
          <span className="italic">{amountInWords(totals.net_payable)}</span>
        </div>

        {/* Bank Details & UPI QR Code Section */}
        {(showBankDetails || upiQrDataUrl) && (
          <div className="border border-gray-300 rounded p-3 mb-3 bg-gray-50 flex items-center justify-between gap-4">
            {showBankDetails && (
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-gray-800 mb-1">Bank &amp; Payment Details</p>
                {branding?.bank_name && <p><span className="text-gray-500">Bank:</span> <strong>{branding.bank_name}</strong></p>}
                {branding?.bank_account && <p><span className="text-gray-500">A/C No:</span> <strong>{branding.bank_account}</strong></p>}
                {branding?.bank_ifsc && <p><span className="text-gray-500">IFSC:</span> <strong>{branding.bank_ifsc}</strong></p>}
                {branding?.upi_id && <p><span className="text-gray-500">UPI ID:</span> <strong>{branding.upi_id}</strong></p>}
              </div>
            )}
            {upiQrDataUrl && (
              <div className="flex flex-col items-center shrink-0">
                <img src={upiQrDataUrl} alt="Scan & Pay UPI QR" className="h-20 w-20 border border-gray-300 rounded bg-white p-1" />
                <span className="text-[10px] font-semibold text-gray-600 mt-1">Scan &amp; Pay via UPI</span>
              </div>
            )}
          </div>
        )}

        {/* Terms & Conditions */}
        {showTerms && termsText && (
          <div className="text-[10px] text-gray-600 border-t border-gray-200 pt-2 mb-3">
            <p className="font-semibold text-gray-700">Terms &amp; Conditions:</p>
            <p className="whitespace-pre-line mt-0.5">{termsText}</p>
          </div>
        )}

        {/* Signatory & Payment Mode Footer */}
        <div className="flex justify-between items-end border-t border-gray-300 pt-3">
          <div>
            <p className="text-gray-700 text-xs">
              Payment Mode: <strong className="capitalize">{paymentMode}</strong>
              {paymentDetail && <span className="text-gray-500"> ({paymentDetail})</span>}
            </p>
            <p className="text-gray-400 text-[10px] mt-1">
              Computer generated invoice.
            </p>
          </div>

          {showSignatory && (
            <div className="text-center flex flex-col items-center">
              {showDigitalSignature && signatureUrl ? (
                <img src={signatureUrl} alt="Signature" className="h-10 object-contain mb-1" />
              ) : showSignatureOutline ? (
                <div className="h-8" />
              ) : null}
              <div className="border-t border-gray-400 pt-1 w-32">
                <p className="text-[11px] text-gray-600">Authorised Signatory</p>
              </div>
              <p className="text-xs font-semibold mt-0.5">{shopName}</p>
            </div>
          )}
        </div>

        {/* Footer Notes */}
        <p className="text-center text-[10px] text-gray-500 mt-3 border-t border-gray-200 pt-2">
          {(showFooterMsg && footerMsg) || branding?.print_thank_you_note || 'Thank you for your purchase! Visit us again.'}
        </p>
      </div>
    </>
  )
}
