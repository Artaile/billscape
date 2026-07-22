import React from 'react'
import { Printer } from 'lucide-react'
import { formatINR, amountInWords } from '@billscape/core'
import { formatDateTime } from '@/lib/utils'
import type { CartItem, InvoiceTotals } from '@billscape/core'
import { Button } from '@/components/ui/button'

interface InvoicePrintProps {
  invoiceNo: string
  date: string
  shopName: string
  shopAddress?: string
  shopGstin?: string
  shopLogoUrl?: string
  customerName?: string
  customerPhone?: string
  customerGstin?: string
  items: CartItem[]
  totals: InvoiceTotals
  paymentMode: string
}

export function InvoicePrint({
  invoiceNo,
  date,
  shopName,
  shopAddress,
  shopGstin,
  shopLogoUrl,
  customerName,
  customerPhone,
  customerGstin,
  items,
  totals,
  paymentMode,
}: InvoicePrintProps) {
  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      {/* Print action button - hidden during print */}
      <div className="no-print flex justify-end mb-4">
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Print Invoice
        </Button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body > * { display: none !important; }
          #invoice-print-root { display: block !important; }
        }
        #invoice-print-root {
          font-family: Arial, sans-serif;
          color: #000;
          background: #fff;
          max-width: 210mm;
          margin: 0 auto;
          padding: 10mm;
          font-size: 11px;
        }
      `}</style>

      <div id="invoice-print-root" className="bg-white text-black p-6 rounded-lg text-xs">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-3 mb-3">
          <div className="flex items-start gap-3">
            {shopLogoUrl && (
              <img src={shopLogoUrl} alt="Logo" className="h-14 w-14 object-contain" />
            )}
            <div>
              <h1 className="text-lg font-bold text-gray-900">{shopName}</h1>
              {shopAddress && <p className="text-xs text-gray-600 mt-0.5">{shopAddress}</p>}
              {shopGstin && <p className="text-xs text-gray-600">GSTIN: {shopGstin}</p>}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-base font-bold text-gray-800">TAX INVOICE</h2>
            <p className="text-gray-600 mt-1">Invoice No: <strong>{invoiceNo}</strong></p>
            <p className="text-gray-600">Date: {formatDateTime(date)}</p>
          </div>
        </div>

        {/* Customer details */}
        {(customerName || customerPhone || customerGstin) && (
          <div className="border border-gray-300 rounded p-3 mb-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700 mb-1">Bill To:</p>
            {customerName && <p className="font-medium">{customerName}</p>}
            {customerPhone && <p className="text-gray-600">Phone: {customerPhone}</p>}
            {customerGstin && <p className="text-gray-600">GSTIN: {customerGstin}</p>}
          </div>
        )}

        {/* Items table */}
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 text-left">#</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">Item</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">HSN</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Qty</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Rate</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Disc%</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Tax%</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const base = item.unit_price * item.qty
              const discAmt = base * (item.discount_pct / 100)
              const lineTotal = base - discAmt
              return (
                <tr key={item.product_id} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                  <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1 font-medium">{item.product_name}</td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600">{item.hsn_code ?? '-'}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{item.qty}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{formatINR(item.unit_price)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{item.discount_pct}%</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{item.tax_rate}%</td>
                  <td className="border border-gray-300 px-2 py-1 text-right font-medium">{formatINR(lineTotal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totals + Tax breakup side by side */}
        <div className="flex gap-4 mb-3">
          {/* Tax breakup */}
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-700 mb-1">Tax Summary</p>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-left">Rate</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">Taxable</th>
                  {totals.is_interstate ? (
                    <th className="border border-gray-300 px-2 py-1 text-right">IGST</th>
                  ) : (
                    <>
                      <th className="border border-gray-300 px-2 py-1 text-right">CGST</th>
                      <th className="border border-gray-300 px-2 py-1 text-right">SGST</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {totals.tax_breakup.map((line) => (
                  <tr key={line.tax_rate}>
                    <td className="border border-gray-300 px-2 py-1">{line.tax_rate}%</td>
                    <td className="border border-gray-300 px-2 py-1 text-right">{formatINR(line.taxable_amount)}</td>
                    {totals.is_interstate ? (
                      <td className="border border-gray-300 px-2 py-1 text-right">{formatINR(line.igst)}</td>
                    ) : (
                      <>
                        <td className="border border-gray-300 px-2 py-1 text-right">{formatINR(line.cgst)}</td>
                        <td className="border border-gray-300 px-2 py-1 text-right">{formatINR(line.sgst)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="w-52">
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
                <tr className="border-t-2 border-gray-800">
                  <td className="pt-1 font-bold text-sm text-gray-900">Grand Total</td>
                  <td className="pt-1 text-right font-bold text-sm text-gray-900">
                    {formatINR(totals.grand_total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Amount in words */}
        <div className="border border-gray-300 rounded p-2 mb-3 bg-gray-50">
          <span className="font-semibold">Amount in Words: </span>
          <span className="italic">{amountInWords(totals.grand_total)}</span>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-end border-t border-gray-300 pt-3">
          <div>
            <p className="text-gray-600">Payment Mode: <strong className="capitalize">{paymentMode}</strong></p>
            <p className="text-gray-400 text-[10px] mt-1">
              This is a computer generated invoice and does not require a signature.
            </p>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-1 w-32">
              <p className="text-xs text-gray-600">Authorised Signatory</p>
            </div>
            <p className="text-xs font-medium mt-1">{shopName}</p>
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-3 border-t border-gray-200 pt-2">
          Thank you for your purchase! Visit us again.
        </p>
      </div>
    </>
  )
}
