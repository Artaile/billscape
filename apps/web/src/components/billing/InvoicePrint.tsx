import React, { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import QRCode from 'qrcode'
import { formatINR, amountInWords } from '@billscape/core'
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
    window.print()
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

  const showFooterMsg = !!(invoiceTemplate?.invoice_footer || branding?.invoice_footer)
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
  const showDiscount = (branding?.print_show_column_discount ?? true) && totals.discount_total > 0
  const showTaxRate = branding?.print_show_column_tax_rate ?? true

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
          color: ${branding?.print_text_color || '#000'};
          background: #fff;
          max-width: ${
            is58mm ? '54mm' : isThermal ? '76mm' : paperSize === 'a5' ? '148mm' : '210mm'
          };
          margin: 0 auto;
          padding: ${isThermal ? '2mm' : paperSize === 'a5' ? '5mm' : '10mm'};
          font-size: ${is58mm ? '9px' : isThermal ? '10px' : '11px'};
          line-height: 1.3;
        }
      `}</style>

      <div id={rootId} className="bg-white text-black p-4 sm:p-6 rounded-lg">
        {/* Optional Header Message */}
        {showHeaderMsg && (
          <div className="text-center pb-2 mb-2 border-b border-gray-200 text-xs italic text-gray-700">
            {headerMsg}
          </div>
        )}

        {/* Business Header */}
        <div className={`flex ${isThermal ? 'flex-col text-center items-center' : 'items-start justify-between'} border-b-2 border-gray-800 pb-3 mb-3 gap-2`}>
          <div className={`flex ${isThermal ? 'flex-col items-center text-center' : 'items-start'} gap-3`}>
            {(shopLogoUrl || branding?.print_show_logo) && (
              <img src={shopLogoUrl || branding?.logo_url} alt="Logo" className={`${isThermal ? 'h-10 w-10 mb-1' : 'h-14 w-14'} object-contain`} />
            )}
            <div>
              <h1 className={`${isThermal ? 'text-base' : 'text-lg'} font-bold text-gray-900`}>{shopName}</h1>
              {shopAddress && <p className="text-xs text-gray-600 mt-0.5">{shopAddress}</p>}
              <div className="flex flex-wrap gap-x-3 text-xs text-gray-600">
                {shopPhone && <span>Ph: {shopPhone}</span>}
                {shopEmail && <span>{shopEmail}</span>}
              </div>
              {shopGstin && <p className="text-xs font-semibold text-gray-700 mt-0.5">GSTIN: {shopGstin}</p>}
            </div>
          </div>
          <div className={`${isThermal ? 'text-center border-t border-gray-200 pt-2 w-full' : 'text-right'}`}>
            <h2 className="text-sm sm:text-base font-bold text-gray-800 tracking-wider">TAX INVOICE</h2>
            <p className="text-gray-700 mt-0.5">Invoice: <strong className="font-mono">{invoiceNo}</strong></p>
            <p className="text-gray-600 text-xs">Date: {formatDateTime(date)}</p>
          </div>
        </div>

        {/* Customer details */}
        {(customerName || customerPhone || customerGstin || customerAddress) && (
          <div className="border border-gray-300 rounded p-2.5 mb-3 bg-gray-50 text-xs">
            <p className="font-semibold text-gray-700 mb-0.5">Bill To:</p>
            {customerName && <p className="font-medium text-gray-900">{customerName}</p>}
            {customerPhone && <p className="text-gray-600">Phone: {customerPhone}</p>}
            {customerAddress && <p className="text-gray-600">Address: {customerAddress}</p>}
            {customerGstin && <p className="text-gray-700 font-semibold">GSTIN: {customerGstin}</p>}
          </div>
        )}

        {/* Items table */}
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300">
              {showSno && <th className="px-1.5 py-1 text-left">#</th>}
              <th className="px-1.5 py-1 text-left">Item</th>
              {showHsn && <th className="px-1.5 py-1 text-left">HSN</th>}
              <th className="px-1.5 py-1 text-right">Qty</th>
              <th className="px-1.5 py-1 text-right">Rate</th>
              {showDiscount && <th className="px-1.5 py-1 text-right">Disc</th>}
              {showTaxRate && <th className="px-1.5 py-1 text-right">Tax%</th>}
              <th className="px-1.5 py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const base = item.unit_price * item.qty
              const discAmt = base * (item.discount_pct / 100)
              const lineTotal = base - discAmt
              const sellingSecondary = item.secondary_unit && item.selling_unit_id === item.secondary_unit.id && item.conversion_factor
              const displayQty = sellingSecondary ? item.qty / (item.conversion_factor as number) : item.qty
              const displayUnitSymbol = sellingSecondary ? item.secondary_unit?.symbol : item.unit?.symbol
              return (
                <tr key={item.product_id || i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                  {showSno && <td className="px-1.5 py-1 border-b border-gray-200">{i + 1}</td>}
                  <td className="px-1.5 py-1 border-b border-gray-200 font-medium">
                    {item.product_name}
                  </td>
                  {showHsn && <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600">{item.hsn_code ?? '-'}</td>}
                  <td className="px-1.5 py-1 border-b border-gray-200 text-right whitespace-nowrap">
                    {displayQty}{displayUnitSymbol ? ` ${displayUnitSymbol}` : ''}
                  </td>
                  <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(item.unit_price)}</td>
                  {showDiscount && <td className="px-1.5 py-1 border-b border-gray-200 text-right text-green-700">-{item.discount_pct}%</td>}
                  {showTaxRate && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{item.tax_rate}%</td>}
                  <td className="px-1.5 py-1 border-b border-gray-200 text-right font-medium">{formatINR(lineTotal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totals + Tax breakup */}
        <div className={`flex ${isThermal ? 'flex-col' : 'gap-4'} mb-3`}>
          {/* Tax breakup */}
          {!isThermal && totals.tax_breakup.length > 0 && (
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700 mb-1">Tax Summary</p>
              <table className="w-full border-collapse text-xs border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-200 px-2 py-1 text-left">Rate</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">Taxable</th>
                    {totals.is_interstate ? (
                      <th className="border border-gray-200 px-2 py-1 text-right">IGST</th>
                    ) : (
                      <>
                        <th className="border border-gray-200 px-2 py-1 text-right">CGST</th>
                        <th className="border border-gray-200 px-2 py-1 text-right">SGST</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {totals.tax_breakup.map((line) => (
                    <tr key={line.tax_rate}>
                      <td className="border border-gray-200 px-2 py-0.5">{line.tax_rate}%</td>
                      <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.taxable_amount)}</td>
                      {totals.is_interstate ? (
                        <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.igst)}</td>
                      ) : (
                        <>
                          <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.cgst)}</td>
                          <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.sgst)}</td>
                        </>
                      )}
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
                <tr>
                  <td className="py-0.5 text-gray-600">Subtotal</td>
                  <td className="py-0.5 text-right">{formatINR(totals.subtotal)}</td>
                </tr>
                {totals.discount_total > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Discount</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.discount_total)}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-0.5 text-gray-600">Taxable Amount</td>
                  <td className="py-0.5 text-right">{formatINR(totals.taxable_amount)}</td>
                </tr>
                {totals.is_interstate ? (
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
                )}
                <tr>
                  <td className="py-0.5 font-medium text-gray-800">Grand Total</td>
                  <td className="py-0.5 text-right font-medium text-gray-900">
                    {formatINR(totals.grand_total)}
                  </td>
                </tr>
                {totals.order_discount_amount > 0 && (
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
                {typeof totals.round_off_amount === 'number' && totals.round_off_amount !== 0 && (
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
          {footerMsg || branding?.print_thank_you_note || 'Thank you for your purchase! Visit us again.'}
        </p>
      </div>
    </>
  )
}
