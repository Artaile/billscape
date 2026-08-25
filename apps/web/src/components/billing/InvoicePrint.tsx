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
  billedBy?: string
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
  billedBy,
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

  // Joined so the "|" separators only ever appear BETWEEN fields that actually render.
  // Real branding data is sparse (any field may be missing), so appending a leading "| "
  // per-field would emit a dangling pipe whenever an earlier field is absent.
  const bankDetailsLine = [
    branding?.bank_name && `Bank: ${branding.bank_name}`,
    branding?.bank_account && `A/C: ${branding.bank_account}`,
    branding?.bank_ifsc && `IFSC: ${branding.bank_ifsc}`,
  ]
    .filter(Boolean)
    .join(' | ')

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
          <div className="text-center pb-2 mb-2 border-b border-dashed border-zinc-300 text-[0.85em] italic text-zinc-700">
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

        {/* Items list / table */}
        <div className="py-2">
          {isThermal ? (
            <div className="divide-y divide-dashed divide-zinc-300 border-t border-b border-zinc-950 py-1">
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
                const lineTotal = lineCalc.lineTotal

                return (
                  <div key={item.product_id || i} className="py-1.5 space-y-0.5 text-[0.88em]">
                    {/* Line 1: Item Name + HSN */}
                    <div className="flex justify-between font-bold text-zinc-950 leading-tight">
                      <span className="truncate pr-1">
                        {showSno ? `${i + 1}. ` : ''}{item.product_name}
                      </span>
                      {showHsn && item.hsn_code && (
                        <span className="text-[0.82em] text-zinc-500 font-normal shrink-0">HSN: {item.hsn_code}</span>
                      )}
                    </div>
                    {/* Line 2: Qty x Rate (Disc / Tax) -> Amount */}
                    <div className="flex items-center justify-between text-zinc-700 text-[0.88em]">
                      <span className="text-zinc-600">
                        {showColumnQty && <span className="font-semibold text-zinc-900">{displayQty}</span>}
                        {showColumnUnit && displayUnitSymbol ? ` ${displayUnitSymbol}` : ''}
                        {showColumnRate && ` x ${formatINR(item.unit_price)}`}
                        {showDiscount && (item.discount_pct > 0 || (item.discount_amount && item.discount_amount > 0)) ? (
                          <span className="text-zinc-500 text-[0.85em] ml-1">
                            ({item.discount_type === 'flat' ? `-${formatINR(discAmt)}` : `-${item.discount_pct}%`})
                          </span>
                        ) : null}
                        {showTaxRate && item.tax_rate > 0 ? (
                          <span className="text-zinc-500 text-[0.85em] ml-1">GST {item.tax_rate}%</span>
                        ) : null}
                      </span>
                      <span className="font-bold text-zinc-950 tabular-nums shrink-0 ml-2">{formatINR(lineTotal)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <table className="w-full text-left text-[0.9em]">
              <thead>
                <tr className="border-b border-zinc-950 font-bold">
                  {showSno && <th className="py-1 pr-1">#</th>}
                  {showColumnItemName && <th className="py-1">Item</th>}
                  {showHsn && <th className="py-1">HSN</th>}
                  {showColumnMrp && <th className="py-1 text-right">MRP</th>}
                  {showColumnQty && <th className="py-1 text-center">Qty</th>}
                  {showColumnUnit && <th className="py-1">Unit</th>}
                  {showColumnRate && <th className="py-1 text-right">Rate</th>}
                  {showColumnDiscountType && <th className="py-1">Disc Type</th>}
                  {showDiscount && <th className="py-1 text-right">Disc</th>}
                  {showTaxRate && <th className="py-1 text-right">GST%</th>}
                  {showColumnTaxableValue && <th className="py-1 text-right">Taxable</th>}
                  {showColumnTaxAmount && <th className="py-1 text-right">Tax Amt</th>}
                  {showColumnItemTotal && <th className="py-1 text-right">Amount</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
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
                    <tr key={item.product_id || i}>
                      {showSno && <td className="py-1 text-zinc-500">{i + 1}</td>}
                      {showColumnItemName && (
                        <td className="py-1 font-medium">
                          {item.product_name}
                        </td>
                      )}
                      {showHsn && <td className="py-1 text-zinc-600">{item.hsn_code ?? '-'}</td>}
                      {showColumnMrp && <td className="py-1 text-right text-zinc-400">—</td>}
                      {showColumnQty && (
                        <td className="py-1 text-center font-bold whitespace-nowrap">
                          {displayQty}
                        </td>
                      )}
                      {showColumnUnit && <td className="py-1 text-zinc-600">{displayUnitSymbol ?? '-'}</td>}
                      {showColumnRate && <td className="py-1 text-right">{formatINR(item.unit_price)}</td>}
                      {showColumnDiscountType && (
                        <td className="py-1 text-zinc-600 capitalize">{item.discount_type ?? '-'}</td>
                      )}
                      {showDiscount && (
                        <td className="py-1 text-right text-zinc-600">
                          {item.discount_type === 'flat' ? `-${formatINR(discAmt)}` : `-${item.discount_pct}%`}
                        </td>
                      )}
                      {showTaxRate && <td className="py-1 text-right text-zinc-600">{item.tax_rate}%</td>}
                      {showColumnTaxableValue && <td className="py-1 text-right text-zinc-600">{formatINR(rowTaxable)}</td>}
                      {showColumnTaxAmount && <td className="py-1 text-right text-zinc-600">{formatINR(rowTax)}</td>}
                      {showColumnItemTotal && <td className="py-1 text-right font-bold">{formatINR(lineTotal)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Totals + Tax breakup */}
        <div className={`flex ${isThermal ? 'flex-col' : 'gap-4'} mb-3`}>
          {/* Tax breakup */}
          {showTaxSummaryBlock && totals.tax_breakup.length > 0 && (
            <div className="flex-1 py-1.5 border-t border-zinc-200">
              <p className="font-bold text-[0.85em] mb-1">Tax Summary</p>
              <table className="w-full text-left text-[0.85em] text-zinc-600">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th>Rate</th>
                    <th className="text-right">Taxable</th>
                    {showCgstSgstIgst && (
                      totals.is_interstate ? (
                        <th className="text-right">IGST</th>
                      ) : (
                        <>
                          <th className="text-right">CGST</th>
                          <th className="text-right">SGST</th>
                        </>
                      )
                    )}
                    <th className="text-right">Tax Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.tax_breakup.map((line) => (
                    <tr key={line.tax_rate}>
                      <td>{line.tax_rate}%</td>
                      <td className="text-right">{formatINR(line.taxable_amount)}</td>
                      {showCgstSgstIgst && (
                        totals.is_interstate ? (
                          <td className="text-right">{formatINR(line.igst)}</td>
                        ) : (
                          <>
                            <td className="text-right">{formatINR(line.cgst)}</td>
                            <td className="text-right">{formatINR(line.sgst)}</td>
                          </>
                        )
                      )}
                      <td className="text-right">
                        {formatINR(totals.is_interstate ? line.igst : line.cgst + line.sgst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals Calculation Card */}
          <div className={`border-t border-zinc-950 pt-1.5 space-y-0.5 text-[0.9em] ${isThermal ? 'w-full' : 'w-56'}`}>
            {showBlockSubtotal && (
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal:</span>
                <span>{formatINR(totals.subtotal)}</span>
              </div>
            )}
            {showBlockDiscount && totals.discount_total > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Discount:</span>
                <span>-{formatINR(totals.discount_total)}</span>
              </div>
            )}
            {showBlockTaxAmount && (
              <div className="flex justify-between text-zinc-600">
                <span>Taxable Amount:</span>
                <span>{formatINR(totals.taxable_amount)}</span>
              </div>
            )}
            {showCgstSgstIgst && (
              totals.is_interstate ? (
                <div className="flex justify-between text-zinc-600">
                  <span>IGST:</span>
                  <span>{formatINR(totals.igst_total)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-zinc-600">
                    <span>CGST:</span>
                    <span>{formatINR(totals.cgst_total)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>SGST:</span>
                    <span>{formatINR(totals.sgst_total)}</span>
                  </div>
                </>
              )
            )}
            {showBlockGrandTotal && (
              <div className="flex justify-between text-zinc-600">
                <span>Grand Total:</span>
                <span>{formatINR(totals.grand_total)}</span>
              </div>
            )}
            {showBlockDiscount && totals.order_discount_amount > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Bill Discount:</span>
                <span>-{formatINR(totals.order_discount_amount)}</span>
              </div>
            )}
            {totals.loyalty_redeem_amount > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Loyalty Redeemed:</span>
                <span>-{formatINR(totals.loyalty_redeem_amount)}</span>
              </div>
            )}
            {showBlockRoundOff && typeof totals.round_off_amount === 'number' && totals.round_off_amount !== 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Round Off:</span>
                <span>{totals.round_off_amount > 0 ? `+${formatINR(totals.round_off_amount)}` : formatINR(totals.round_off_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[1.1em] pt-1 border-t-2 border-zinc-400 text-zinc-950">
              <span>Net Payable:</span>
              <span>{formatINR(totals.net_payable)}</span>
            </div>
          </div>
        </div>

        {/* Amount in words */}
        <div className="py-1.5 text-[0.85em] text-zinc-600">
          <span className="font-bold text-zinc-800">Amount in Words: </span>
          <span className="italic">{amountInWords(totals.net_payable)}</span>
        </div>

        {/* Footer: Bank/UPI, Terms, Signatory, Payment Mode, Thank-you note — one consolidated section, matching Settings preview */}
        <div className="mt-3 pt-2 border-t border-dashed border-zinc-400 space-y-2">
          {showBankDetails && bankDetailsLine && (
            <div className="text-[0.85em] text-zinc-700 bg-zinc-100 p-1.5 rounded">
              <p className="font-bold">{bankDetailsLine}</p>
            </div>
          )}

          {upiQrDataUrl && (
            isThermal ? (
              <div className="py-2 border-t border-b border-dashed border-zinc-300 my-2 text-center space-y-1">
                <img
                  src={upiQrDataUrl}
                  alt="Scan & Pay UPI QR"
                  className="h-24 w-24 object-contain mx-auto rounded border border-zinc-300 p-1 bg-white shadow-sm"
                />
                <div>
                  <p className="text-[0.85em] font-bold text-zinc-950 uppercase tracking-wide">
                    Scan &amp; Pay {formatINR(totals.net_payable)} via UPI
                  </p>
                  {branding?.upi_id && (
                    <p className="text-[0.8em] font-mono font-semibold text-zinc-700 mt-0.5">{branding.upi_id}</p>
                  )}
                  <p className="text-[0.72em] text-zinc-500 mt-0.5">Google Pay • PhonePe • Paytm • BHIM</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-2 bg-zinc-50 border border-zinc-200 rounded justify-center">
                <img src={upiQrDataUrl} alt="Scan & Pay UPI QR" className="h-20 w-20 object-contain rounded border border-zinc-200 shadow-sm" />
                <div className="text-left space-y-0.5">
                  <p className="text-[0.85em] font-bold text-zinc-900 uppercase">Scan &amp; Pay via UPI</p>
                  {branding?.upi_id && <p className="text-[0.8em] font-mono font-semibold text-zinc-700">{branding.upi_id}</p>}
                  <p className="text-[0.75em] text-zinc-500">Google Pay • PhonePe • Paytm • BHIM</p>
                </div>
              </div>
            )
          )}

          {showTerms && termsText && (
            <p className="text-[0.85em] text-zinc-500 italic leading-tight whitespace-pre-line">{termsText}</p>
          )}

          <div className="flex justify-between items-center text-[0.85em] text-zinc-600">
            <span>
              Payment Mode: <span className="font-bold capitalize">{paymentMode}</span>
              {paymentDetail && <span className="text-zinc-500"> ({paymentDetail})</span>}
            </span>
            {billedBy && (
              <span>
                Billed By: <span className="font-semibold text-zinc-800">{billedBy}</span>
              </span>
            )}
          </div>

          {showSignatory && (
            <div className="pt-2 flex justify-end">
              <div className="text-center w-28">
                {showDigitalSignature && signatureUrl ? (
                  <img src={signatureUrl} alt="Signature" className="h-7 mx-auto object-contain" />
                ) : (
                  <div className={`h-7 w-full ${showSignatureOutline ? 'border-b border-dashed border-zinc-300' : ''}`} />
                )}
                <p className="border-t border-zinc-400 text-[0.75em] font-bold uppercase text-zinc-800 pt-0.5 mt-1">
                  Authorised Signatory
                </p>
                <p className="text-[0.75em] font-semibold text-zinc-700 mt-0.5">{shopName}</p>
              </div>
            </div>
          )}

          <p className="text-center text-[0.85em] font-semibold text-zinc-700 pt-1">
            {(showFooterMsg && footerMsg) || branding?.print_thank_you_note || 'Thank you for your purchase! Visit us again.'}
          </p>
        </div>
      </div>
    </>
  )
}
