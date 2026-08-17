import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Upload,
  Loader2,
  Plus,
  Store,
  Palette,
  Users,
  CreditCard,
  Moon,
  Sun,
  FileText,
  Globe,
  Download,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Ruler,
  CalendarClock,
  Edit2,
  Calculator,
  Package,
  Barcode,
  Smartphone,
  PenLine,
  Phone,
  Mail,
  Building2,
  Bell,
  Printer,
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { applyBrandColor } from '@/lib/brandColor'
import { UnitsSettingsPanel } from '@/components/settings/UnitsSettingsPanel'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import * as XLSX from 'xlsx'
import type { UserRole } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const INDIAN_STATES = [
  { code: 'AN', name: 'Andaman & Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'DN', name: 'Dadra & Nagar Haveli' },
  { code: 'DD', name: 'Daman & Diu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'JK', name: 'Jammu & Kashmir' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OD', name: 'Odisha' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
]

const BUSINESS_TYPES = [
  { value: 'grocery', label: 'Grocery / Supermarket' },
  { value: 'textile', label: 'Textile / Clothing' },
  { value: 'pharmacy', label: 'Pharmacy / Medical' },
  { value: 'electronics', label: 'Electronics / Mobile' },
  { value: 'service', label: 'Service Provider' },
  { value: 'general', label: 'Retail Shop / General' },
]

const GST_RATES = [0, 5, 12, 18, 28]

const COLOR_PRESETS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rose', value: '#f43f5e' },
]

const ROLES: UserRole[] = ['owner', 'manager', 'cashier']

const shopInfoSchema = z.object({
  name: z.string().min(1, 'Company / Shop name is required'),
  gstin: z
    .string()
    .refine((val) => !val || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(val.trim()), {
      message: 'Invalid GSTIN format (e.g. 33AAAAA0000A1Z5)',
    })
    .optional()
    .or(z.literal('')),
  state_code: z.string().length(2, 'Please select a state'),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  pincode: z
    .string()
    .refine((val) => !val || /^[0-9]{6}$/.test(val.trim()), {
      message: 'Pincode must be 6 digits (e.g. 600001)',
    })
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .refine((val) => !val || /^[\+]?[0-9\s\-]{7,16}$/.test(val.trim()), {
      message: 'Enter a valid phone number (e.g. 98765 43210 or +91 98765 43210)',
    })
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .min(1, 'Email address is required')
    .refine((val) => z.string().email().safeParse(val.trim()).success, {
      message: 'Please enter a valid email address (e.g. shop@example.com)',
    }),
  pan: z
    .string()
    .refine((val) => !val || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(val.trim()), {
      message: 'Invalid PAN format (e.g. ABCDE1234F)',
    })
    .optional()
    .or(z.literal('')),
  business_type: z.string().optional().or(z.literal('')),
  website: z
    .string()
    .refine((val) => !val || /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i.test(val.trim()), {
      message: 'Please enter a valid website (e.g. www.myshop.com or https://myshop.com)',
    })
    .optional()
    .or(z.literal('')),
})

const routineTemplateSchema = z.object({
  name: z.string().min(1, 'Task name is required'),
  category: z.enum(['rent', 'salary', 'utilities', 'maintenance', 'other']),
  due_day: z.number().min(1).max(31),
  default_amount: z.number().min(0),
  is_active: z.boolean(),
})

type RoutineTemplateValues = z.infer<typeof routineTemplateSchema>

const inviteSchema = z.object({
  employee_id: z.string().min(1, 'Select an employee'),
  role: z.enum(['owner', 'manager', 'cashier']),
})

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

function getPasswordStrength(pw: string) {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
  const score = Object.values(checks).filter(Boolean).length
  return { checks, score }
}

type ShopInfoValues = z.infer<typeof shopInfoSchema>
type InviteValues = z.infer<typeof inviteSchema>
type ChangePasswordValues = z.infer<typeof changePasswordSchema>

function LiveTaxCalculator({
  taxInclusive,
  rate,
  currency,
}: {
  taxInclusive: boolean
  rate: number
  currency: string
}) {
  const [samplePrice, setSamplePrice] = useState(1000)

  let baseAmount = samplePrice
  let taxAmount = (samplePrice * rate) / 100
  let totalAmount = samplePrice + taxAmount

  if (taxInclusive) {
    totalAmount = samplePrice
    baseAmount = samplePrice / (1 + rate / 100)
    taxAmount = totalAmount - baseAmount
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5" /> Interactive Tax Breakdown Preview
        </span>
        <Badge variant="outline" className="text-[10px] font-mono">
          {taxInclusive ? 'GST Inclusive' : 'GST Exclusive'} @ {rate}%
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Test Item Price:</Label>
        <div className="relative max-w-[140px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">{currency}</span>
          <Input
            type="number"
            min="1"
            value={samplePrice}
            onChange={(e) => setSamplePrice(Math.max(0, Number(e.target.value) || 0))}
            className="h-8 pl-7 text-xs font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-primary/10">
        <div className="rounded-lg bg-card/70 p-2.5 border border-border/50">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Base Price</p>
          <p className="text-sm font-semibold text-foreground font-mono mt-0.5">{currency}{baseAmount.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-card/70 p-2.5 border border-border/50">
          <p className="text-[10px] text-primary uppercase font-medium">Tax ({rate}%)</p>
          <p className="text-sm font-semibold text-primary font-mono mt-0.5">{currency}{taxAmount.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-primary/20 p-2.5 border border-primary/30">
          <p className="text-[10px] text-foreground uppercase font-semibold">Final Total</p>
          <p className="text-sm font-bold text-foreground font-mono mt-0.5">{currency}{totalAmount.toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}

function LiveBarcodePreview({
  type,
  labelSize,
  templateStyle = 'standard',
  shopName,
  shopAddress,
}: {
  type: string
  labelSize: string
  templateStyle?: 'standard' | 'saravana_stores' | 'circular_bottle' | 'compact_jewelry'
  shopName?: string
  shopAddress?: string
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const svgRef = React.useRef<SVGSVGElement | null>(null)

  React.useEffect(() => {
    if (type === 'qr' || templateStyle === 'saravana_stores') {
      QRCode.toDataURL('https://billscape.app/item/8901234567890', {
        width: 140,
        margin: 1,
        color: { dark: '#09090b', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error(err))
    }

    if (svgRef.current && (type !== 'qr' || templateStyle === 'circular_bottle')) {
      try {
        let value = '8901234567890'
        let format = 'CODE128'

        if (type === 'ean13') {
          value = '8901234567890'
          format = 'EAN13'
        } else if (type === 'code39') {
          value = 'BILL-ITEM-01'
          format = 'CODE39'
        } else if (templateStyle === 'circular_bottle') {
          value = '1003432492'
          format = 'CODE128'
        }

        JsBarcode(svgRef.current, value, {
          format: format,
          width: type === 'code39' ? 1.3 : templateStyle === 'circular_bottle' ? 1.4 : 1.6,
          height: templateStyle === 'circular_bottle' ? 32 : 36,
          displayValue: templateStyle !== 'circular_bottle',
          fontSize: 10,
          font: 'monospace',
          textMargin: 2,
          margin: 0,
          background: 'transparent',
          lineColor: '#09090b',
        })
      } catch (err) {
        console.error('Barcode render error:', err)
      }
    }
  }, [type, labelSize, templateStyle])

  // Dynamic label styling based on labelSize
  const getLabelDimensions = () => {
    switch (labelSize) {
      case '3x2cm':
        return 'w-[220px] min-h-[120px] p-2.5 text-[9px]'
      case '4x2.5cm':
        return 'w-[260px] min-h-[140px] p-3 text-[10px]'
      case '5x3cm':
        return 'w-[300px] min-h-[160px] p-3.5 text-xs'
      case '6x4cm':
        return 'w-[340px] min-h-[180px] p-4 text-xs'
      case 'A4 Sheet':
        return 'w-[380px] min-h-[200px] p-4 text-xs border-dashed'
      default:
        return 'w-[300px] min-h-[160px] p-3.5 text-xs'
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <Barcode className="h-4 w-4 text-primary" /> Format: {type.toUpperCase()}
          {templateStyle !== 'standard' && (
            <Badge variant="secondary" className="text-[10px] ml-1 capitalize">
              {templateStyle.replace('_', ' ')}
            </Badge>
          )}
        </span>
        <Badge variant="outline" className="text-[11px] font-mono">{labelSize}</Badge>
      </div>

      <div className="flex justify-center p-4 bg-zinc-950/70 rounded-xl overflow-x-auto">
        {/* Template 1: Circular Round Jar / Bottle Sticker */}
        {templateStyle === 'circular_bottle' && (
          <div className="flex flex-col items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg border-2 border-zinc-300 w-52 h-52 p-4 text-center select-none transition-all duration-300">
            <p className="font-bold tracking-tight uppercase text-[10px] leading-tight max-w-[140px]">
              {shopName ? `${shopName} JAR` : 'GL CUBICAL JAR'}<br />
              <span className="font-semibold text-[9px] text-zinc-600">300 ML [GD]</span>
            </p>

            <div className="my-1 flex items-center justify-center max-w-[140px] overflow-hidden">
              <svg ref={svgRef} className="max-w-full h-auto" />
            </div>

            <p className="text-[9px] font-mono font-bold text-zinc-900 tracking-wider">1003432492</p>
            <p className="text-[8px] text-zinc-600 font-medium leading-tight mt-0.5">MRP RS 70.00 (Incl. all taxes)</p>
            <p className="text-[11px] font-black text-zinc-950 tracking-tight">SP RS 49.00</p>
            <p className="text-[8px] font-mono text-zinc-400">122602</p>
          </div>
        )}

        {/* Template 2: Saravana Stores / Department Store Side-Ribbon Style */}
        {templateStyle === 'saravana_stores' && (
          <div className="flex rounded-lg bg-white text-zinc-950 shadow-lg border border-zinc-300 overflow-hidden w-[330px] min-h-[145px] transition-all duration-300 select-none">
            <div className="flex-1 p-3 flex flex-col justify-between">
              <div className="flex justify-between items-start text-[8px] font-mono text-zinc-500">
                <span className="font-bold">15675</span>
                <span className="font-bold">F6</span>
              </div>

              <div className="flex items-center gap-3 my-1">
                <div className="shrink-0">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR Code" className="h-16 w-16 object-contain" />
                  ) : (
                    <div className="h-16 w-16 bg-zinc-100 flex items-center justify-center text-[8px] text-zinc-400">Loading...</div>
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <p className="text-[11px] font-black tracking-tight uppercase text-zinc-950 truncate">TIA BUCKET 511</p>
                  <p className="text-[9px] font-mono text-zinc-600">198411</p>
                  <p className="text-sm font-black text-zinc-950 tracking-tight mt-0.5">Rs.232.00</p>
                </div>
              </div>

              <div className="flex justify-between items-center text-[7.5px] font-mono text-zinc-500 border-t border-zinc-200 pt-1">
                <span>BJ:PAA7233/6</span>
                <span>MAMATMTI</span>
              </div>
            </div>

            {/* Vertical Orange Ribbon */}
            <div className="w-14 bg-gradient-to-b from-amber-500 to-orange-500 text-white flex items-center justify-center p-1 border-l border-amber-600">
              <div className="writing-vertical transform -rotate-90 whitespace-nowrap text-center">
                <span className="text-[9px] font-black uppercase tracking-wider block">{shopName || 'SARAVANA STORES'}</span>
                <span className="text-[7px] text-amber-100 tracking-tight block max-w-[120px] truncate">{shopAddress || '129, Usman Road, T.Nagar, Chennai-17'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Template 3: Compact Jewelry / Tag Style */}
        {templateStyle === 'compact_jewelry' && (
          <div className="flex items-center justify-between rounded-lg bg-white text-zinc-950 shadow-lg border border-zinc-300 p-3 w-[290px] min-h-[95px] transition-all duration-300 select-none">
            <div className="space-y-0.5 min-w-0 flex-1 pr-2">
              <p className="text-[10px] font-black truncate uppercase text-zinc-900">{shopName || 'KALYAN JEWELLERS'}</p>
              <p className="text-[9px] font-semibold text-zinc-800 truncate">GOLD RING 22KT</p>
              <p className="text-[8px] text-zinc-500 font-mono">WT: 4.250g | 916 HUID</p>
              <p className="text-[11px] font-black text-zinc-950 mt-1">₹28,500.00</p>
            </div>
            <div className="shrink-0">
              {type === 'qr' ? (
                qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="h-14 w-14 object-contain" />
                ) : (
                  <div className="h-14 w-14 bg-zinc-100" />
                )
              ) : (
                <div className="max-w-[110px] overflow-hidden">
                  <svg ref={svgRef} className="max-w-full h-auto" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Template 4: Standard Retail Label */}
        {templateStyle === 'standard' && (
          <div className={cn('flex flex-col items-center justify-center rounded-lg bg-white text-zinc-950 shadow-md border border-zinc-300 transition-all duration-300 select-none', getLabelDimensions())}>
            <p className="font-bold tracking-wider uppercase text-center truncate w-full text-[11px]">{shopName || 'BILLSCAPE SAMPLE ITEM'}</p>
            <p className="text-[9px] text-zinc-500 font-mono">SKU: SHIRT-COTTON-001</p>

            {type === 'qr' ? (
              <div className="my-1.5 flex items-center justify-center">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="h-20 w-20 object-contain rounded" />
                ) : (
                  <div className="h-20 w-20 bg-zinc-100 flex items-center justify-center text-[10px] text-zinc-400">Loading QR...</div>
                )}
              </div>
            ) : (
              <div className="my-1 flex items-center justify-center overflow-hidden max-w-full">
                <svg ref={svgRef} className="max-w-full h-auto" />
              </div>
            )}

            <p className="text-[10px] font-semibold text-zinc-900 mt-0.5">MRP: ₹499.00 <span className="text-[9px] font-normal text-zinc-500">(Incl. Taxes)</span></p>
          </div>
        )}
      </div>
    </div>
  )
}

function LiveInvoiceFooterPreview({
  bankName,
  bankAccount,
  bankIfsc,
  upiId,
  signatureUrl,
  showSignature,
}: {
  bankName?: string
  bankAccount?: string
  bankIfsc?: string
  upiId?: string
  signatureUrl?: string | null
  showSignature?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-primary" /> Invoice Footer Live Preview
        </span>
        <Badge variant="outline" className="text-[10px]">Print & PDF Output</Badge>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-background/60 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        {/* Bank details */}
        <div className="space-y-1">
          <p className="font-semibold text-foreground uppercase text-[10px] text-muted-foreground">Bank Details</p>
          <p className="text-foreground"><span className="text-muted-foreground">Bank:</span> {bankName || 'Not configured'}</p>
          <p className="text-foreground"><span className="text-muted-foreground">A/C:</span> {bankAccount || '••••••••••••'}</p>
          <p className="text-foreground font-mono"><span className="text-muted-foreground">IFSC:</span> {bankIfsc || '••••••••'}</p>
        </div>

        {/* UPI QR */}
        <div className="flex flex-col items-center justify-center p-2 rounded border border-border/60 bg-card text-center space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground">Scan to Pay via UPI</p>
          <div className="h-12 w-12 rounded border border-primary/30 bg-primary/10 flex items-center justify-center">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <p className="text-[10px] font-mono text-primary truncate max-w-[120px]">{upiId || 'yourname@upi'}</p>
        </div>

        {/* Signature */}
        <div className="flex flex-col items-center justify-end text-center space-y-1">
          {showSignature && signatureUrl ? (
            <img src={signatureUrl} alt="Signatory" className="h-10 object-contain" />
          ) : (
            <div className="h-10 flex items-center justify-center text-[10px] text-muted-foreground italic">
              {showSignature ? 'Signature image' : 'Signature disabled'}
            </div>
          )}
          <div className="w-full border-t border-border pt-1">
            <p className="text-[10px] font-medium text-foreground">Authorized Signatory</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function LivePrintBillPreview({
  paperSize,
  showLogo,
  showShopName,
  showAddress,
  showContact,
  showGstin,
  showPan,
  logoUrl,
  shopName,
  address,
  phone,
  email,
  gstin,
  pan,
  showColumnSno,
  showColumnHsn,
  showColumnMrp,
  showColumnUnit,
  showColumnDiscount,
  showColumnTaxRate,
  showBankDetails,
  bankName,
  bankAccount,
  bankIfsc,
  showUpiQr,
  upiId,
  showTerms,
  terms,
  showSignature,
  signatureUrl,
  thankYouNote,
  currency,
  showEmailWebsite,
  showCustomerBillingAddress,
  showCustomerShippingAddress,
  showCustomerPan,
  showCustomerPhone,
  showDocumentNumber,
  showDocumentDate,
  showDueDate,
  showPlaceOfSupply,
  showDeliveryNote,
  showPaymentMode,
  showColumnItemName,
  showColumnQty,
  showColumnRate,
  showColumnDiscountType,
  showColumnTaxableValue,
  showColumnTaxAmount,
  showColumnItemTotal,
  showCgstSgstIgst,
  showTaxSummary,
  showBlockSubtotal,
  showBlockDiscount,
  showBlockTaxAmount,
  showBlockRounding,
  showBlockRoundOff,
  showBlockGrandTotal,
  showBlockReceivedAmount,
  showBlockBalanceDue,
  showBlockChangeReturned,
  showNotes,
  notes,
  showSignatureOutline,
  showPartyDetails,
  fontFamily,
  fontSize = 'Medium',
}: {
  paperSize: 'a4' | 'a5' | 'thermal_3inch' | 'thermal_2inch'
  showLogo?: boolean
  showShopName?: boolean
  showAddress?: boolean
  showContact?: boolean
  showGstin?: boolean
  showPan?: boolean
  logoUrl?: string | null
  shopName?: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
  pan?: string
  showColumnSno?: boolean
  showColumnHsn?: boolean
  showColumnMrp?: boolean
  showColumnUnit?: boolean
  showColumnDiscount?: boolean
  showColumnTaxRate?: boolean
  showBankDetails?: boolean
  bankName?: string
  bankAccount?: string
  bankIfsc?: string
  showUpiQr?: boolean
  upiId?: string
  showTerms?: boolean
  terms?: string
  showSignature?: boolean
  signatureUrl?: string | null
  thankYouNote?: string
  currency: string
  showEmailWebsite?: boolean
  showCustomerBillingAddress?: boolean
  showCustomerShippingAddress?: boolean
  showCustomerPan?: boolean
  showCustomerPhone?: boolean
  showDocumentNumber?: boolean
  showDocumentDate?: boolean
  showDueDate?: boolean
  showPlaceOfSupply?: boolean
  showDeliveryNote?: boolean
  showPaymentMode?: boolean
  showColumnItemName?: boolean
  showColumnQty?: boolean
  showColumnRate?: boolean
  showColumnDiscountType?: boolean
  showColumnTaxableValue?: boolean
  showColumnTaxAmount?: boolean
  showColumnItemTotal?: boolean
  showCgstSgstIgst?: boolean
  showTaxSummary?: boolean
  showBlockSubtotal?: boolean
  showBlockDiscount?: boolean
  showBlockTaxAmount?: boolean
  showBlockRounding?: boolean
  showBlockRoundOff?: boolean
  showBlockGrandTotal?: boolean
  showBlockReceivedAmount?: boolean
  showBlockBalanceDue?: boolean
  showBlockChangeReturned?: boolean
  showNotes?: boolean
  notes?: string
  showSignatureOutline?: boolean
  showPartyDetails?: boolean
  fontFamily?: string
  fontSize?: string
}) {
  const isThermal = paperSize.startsWith('thermal')
  const is2Inch = paperSize === 'thermal_2inch'
  const [upiQrUrl, setUpiQrUrl] = useState<string>('')

  React.useEffect(() => {
    if (showUpiQr) {
      const activeUpi = upiId?.trim() || 'shop@okhdfcbank'
      const upiString = `upi://pay?pa=${encodeURIComponent(activeUpi)}&pn=${encodeURIComponent(shopName || 'Shop')}&am=2017.00&cu=INR`
      QRCode.toDataURL(upiString, {
        width: isThermal ? 85 : 105,
        margin: 1,
        color: { dark: '#09090b', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
        .then((url) => setUpiQrUrl(url))
        .catch((err) => console.error(err))
    }
  }, [showUpiQr, upiId, shopName, isThermal])
  
  // Choose font family style
  const getFontFamilyStyle = () => {
    if (fontFamily === 'Roboto') return { fontFamily: "'Roboto', sans-serif" }
    if (fontFamily === 'Courier') return { fontFamily: "'Courier Prime', 'Courier New', monospace" }
    return { fontFamily: "'Inter', sans-serif" }
  }

  // Dynamic base font size scaling
  const getBaseFontSize = () => {
    if (fontSize === 'Small') {
      return is2Inch ? '9px' : isThermal ? '10px' : '10.5px'
    }
    if (fontSize === 'Large') {
      return is2Inch ? '11.5px' : isThermal ? '13px' : '14px'
    }
    return is2Inch ? '10px' : isThermal ? '11.5px' : '12px'
  }

  const handleTestPrint = () => {
    const elem = document.getElementById('live-print-bill-sheet')
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

    const isThermalPaper = isThermal || is2Inch

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${shopName || 'BillScape'}</title>
          ${styles}
          <style>
            @page {
              size: ${is2Inch ? '58mm auto' : isThermal ? '80mm auto' : paperSize === 'a5' ? 'A5 portrait' : 'A4 portrait'};
              margin: ${isThermalPaper ? '0mm' : '10mm 12mm'};
            }
            html, body {
              margin: 0 !important;
              padding: ${is2Inch ? '1mm' : isThermal ? '2mm' : '0mm'} !important;
              background: #ffffff !important;
              color: #000000 !important;
              width: 100% !important;
              display: block !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #print-container {
              width: 100% !important;
              max-width: ${is2Inch ? '54mm' : isThermal ? '74mm' : '100%'} !important;
              margin: ${isThermalPaper ? '0 auto' : '0'} !important;
            }
            #print-container #live-print-bill-sheet {
              box-shadow: none !important;
              border-radius: 0 !important;
              border: none !important;
              width: 100% !important;
              max-width: 100% !important;
              padding: 0 !important;
              margin: 0 !important;
              font-size: ${getBaseFontSize()} !important;
              line-height: 1.4 !important;
            }
            #print-container table {
              width: 100% !important;
            }
          </style>
        </head>
        <body>
          <div id="print-container">
            ${elem.outerHTML}
          </div>
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

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 w-full">
      <div className="flex items-center justify-between pb-1 border-b border-border/50">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Printer className="h-4 w-4 text-primary" /> Live Document Preview
          <Badge variant="outline" className="text-[10px] uppercase font-mono">{paperSize}</Badge>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleTestPrint}
          className="h-7 text-xs gap-1.5 border-primary/40 hover:bg-primary/10 hover:text-primary transition-all cursor-pointer"
        >
          <Printer className="h-3.5 w-3.5" />
          Test Print
        </Button>
      </div>

      <div className="flex justify-center p-3 bg-zinc-950/80 rounded-xl overflow-x-auto">
        <div
          id="live-print-bill-sheet"
          style={{
            ...getFontFamilyStyle(),
            fontSize: getBaseFontSize(),
            lineHeight: 1.4,
          }}
          className={cn(
            'bg-white text-zinc-900 shadow-2xl transition-all duration-300',
            is2Inch
              ? 'w-[260px] p-3'
              : isThermal
                ? 'w-[320px] p-4'
                : 'w-full max-w-[540px] p-6 rounded-sm'
          )}
        >
          {/* Header */}
          <div className={cn('space-y-1 pb-3 border-b border-dashed border-zinc-400', isThermal ? 'text-center' : 'flex items-start justify-between text-left')}>
            <div className={cn('space-y-0.5', isThermal ? 'mx-auto' : '')}>
              {showLogo && logoUrl && (
                <div className={cn('flex items-center', isThermal ? 'justify-center mb-1' : 'justify-start mb-2')}>
                  <img src={logoUrl} alt="Logo" className={cn('object-contain', isThermal ? 'h-8' : 'h-10')} />
                </div>
              )}
              {showShopName && shopName && <h4 className="font-bold text-zinc-950 uppercase tracking-tight text-[1.15em]">{shopName}</h4>}
              {showAddress && address && <p className="text-[0.9em] text-zinc-600 leading-tight">{address}</p>}
              
              <div className="text-[0.9em] text-zinc-600 space-x-1">
                {showContact && phone && <span>Ph: {phone}</span>}
                {showContact && phone && showEmailWebsite && email && <span>|</span>}
                {showEmailWebsite && email && <span>{email}</span>}
              </div>

              <div className="text-[0.9em] font-bold text-zinc-800 space-x-1">
                {showGstin && gstin && <span>GSTIN: {gstin}</span>} 
                {showGstin && gstin && showPan && pan && <span>|</span>}
                {showPan && pan && <span>PAN: {pan}</span>}
              </div>
            </div>

            {!isThermal && (
              <div className="text-right text-[0.9em] space-y-0.5 shrink-0">
                <p className="font-bold text-[1.1em] uppercase text-zinc-950">TAX INVOICE</p>
                {showDocumentNumber !== false && <p className="text-zinc-600">Inv: <span className="font-bold">INV-001</span></p>}
                {showDocumentDate !== false && <p className="text-zinc-600">Date: 10/08/2026</p>}
                {showDueDate && <p className="text-zinc-600">Due: 25/08/2026</p>}
                {showPlaceOfSupply && <p className="text-zinc-600">PoS: Tamil Nadu</p>}
                {showDeliveryNote && <p className="text-zinc-600">Del Note: 12345</p>}
                {showPaymentMode && <p className="text-zinc-600">Mode: UPI</p>}
              </div>
            )}
          </div>

          {isThermal && (showDocumentNumber !== false || showDocumentDate !== false) && (
            <div className="py-1 text-[0.9em] flex justify-between text-zinc-600 border-b border-dashed border-zinc-400 flex-wrap gap-1">
              {showDocumentNumber !== false && <span>Inv: INV-001</span>}
              {showDocumentDate !== false && <span>10/08/2026</span>}
              {showDueDate && <span>Due: 25/08/2026</span>}
              {showPaymentMode && <span>Mode: UPI</span>}
            </div>
          )}

          {/* Party Details */}
          {showPartyDetails && (
            <div className="py-2 border-b border-dashed border-zinc-400 text-[0.9em]">
              <p className="font-bold text-zinc-800">Billed To:</p>
              <p className="font-medium text-zinc-950">Acme Corporation</p>
              {showCustomerBillingAddress && <p className="text-zinc-600">123 Business St, Chennai</p>}
              {showCustomerShippingAddress && <p className="text-zinc-600">Ship: 456 Warehouse Ave, Chennai</p>}
              <div className="text-zinc-600 space-x-1">
                {showCustomerPhone && <span>Ph: 9876543210</span>}
                {showCustomerPhone && showCustomerPan && <span>|</span>}
                {showCustomerPan && <span>PAN: ABCDE1234F</span>}
              </div>
            </div>
          )}

          {/* Table Items */}
          <div className="py-2">
            <table className="w-full text-left text-[0.9em]">
              <thead>
                <tr className="border-b border-zinc-950 font-bold">
                  {showColumnSno && <th className="py-1 pr-1">#</th>}
                  {showColumnItemName !== false && <th className="py-1">Item</th>}
                  {showColumnHsn && <th className="py-1">HSN</th>}
                  {showColumnMrp && <th className="py-1 text-right">MRP</th>}
                  {showColumnQty !== false && <th className="py-1 text-center">Qty</th>}
                  {showColumnUnit && <th className="py-1">Unit</th>}
                  {showColumnRate !== false && <th className="py-1 text-right">Rate</th>}
                  {showColumnDiscount && <th className="py-1 text-right">Disc</th>}
                  {showColumnTaxRate && <th className="py-1 text-right">GST%</th>}
                  {showColumnTaxableValue && <th className="py-1 text-right">Taxable</th>}
                  {showColumnTaxAmount && <th className="py-1 text-right">Tax Amt</th>}
                  {showColumnItemTotal !== false && <th className="py-1 text-right">Amount</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                <tr>
                  {showColumnSno && <td className="py-1 text-zinc-500">1</td>}
                  {showColumnItemName !== false && <td className="py-1 font-medium">Premium Cotton T-Shirt</td>}
                  {showColumnHsn && <td className="py-1 text-zinc-600">6109</td>}
                  {showColumnMrp && <td className="py-1 text-right text-zinc-600">{currency}799</td>}
                  {showColumnQty !== false && <td className="py-1 text-center font-bold">2</td>}
                  {showColumnUnit && <td className="py-1 text-zinc-600">pcs</td>}
                  {showColumnRate !== false && <td className="py-1 text-right">{currency}450</td>}
                  {showColumnDiscount && <td className="py-1 text-right text-zinc-600">5%</td>}
                  {showColumnTaxRate && <td className="py-1 text-right text-zinc-600">5%</td>}
                  {showColumnTaxableValue && <td className="py-1 text-right text-zinc-600">{currency}855.00</td>}
                  {showColumnTaxAmount && <td className="py-1 text-right text-zinc-600">{currency}42.75</td>}
                  {showColumnItemTotal !== false && <td className="py-1 text-right font-bold">{currency}897.75</td>}
                </tr>
                <tr>
                  {showColumnSno && <td className="py-1 text-zinc-500">2</td>}
                  {showColumnItemName !== false && <td className="py-1 font-medium">Denim Jeans Regular</td>}
                  {showColumnHsn && <td className="py-1 text-zinc-600">6203</td>}
                  {showColumnMrp && <td className="py-1 text-right text-zinc-600">{currency}1499</td>}
                  {showColumnQty !== false && <td className="py-1 text-center font-bold">1</td>}
                  {showColumnUnit && <td className="py-1 text-zinc-600">pcs</td>}
                  {showColumnRate !== false && <td className="py-1 text-right">{currency}999</td>}
                  {showColumnDiscount && <td className="py-1 text-right text-zinc-600">0%</td>}
                  {showColumnTaxRate && <td className="py-1 text-right text-zinc-600">12%</td>}
                  {showColumnTaxableValue && <td className="py-1 text-right text-zinc-600">{currency}999.00</td>}
                  {showColumnTaxAmount && <td className="py-1 text-right text-zinc-600">{currency}119.88</td>}
                  {showColumnItemTotal !== false && <td className="py-1 text-right font-bold">{currency}1,118.88</td>}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tax Summary Table */}
          {showTaxSummary && (
            <div className="py-1.5 border-t border-zinc-200">
              <p className="font-bold text-[0.85em] mb-1">Tax Summary</p>
              <table className="w-full text-left text-[0.85em] text-zinc-600">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th>Tax</th>
                    <th className="text-right">Taxable</th>
                    {showCgstSgstIgst && <th className="text-right">CGST</th>}
                    {showCgstSgstIgst && <th className="text-right">SGST</th>}
                    <th className="text-right">Tax Amt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>GST 5%</td>
                    <td className="text-right">{currency}855.00</td>
                    {showCgstSgstIgst && <td className="text-right">{currency}21.38</td>}
                    {showCgstSgstIgst && <td className="text-right">{currency}21.37</td>}
                    <td className="text-right">{currency}42.75</td>
                  </tr>
                  <tr>
                    <td>GST 12%</td>
                    <td className="text-right">{currency}999.00</td>
                    {showCgstSgstIgst && <td className="text-right">{currency}59.94</td>}
                    {showCgstSgstIgst && <td className="text-right">{currency}59.94</td>}
                    <td className="text-right">{currency}119.88</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-zinc-950 pt-1.5 text-right space-y-0.5 text-[0.9em]">
            {showBlockSubtotal !== false && (
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal:</span>
                <span>{currency}1,854.00</span>
              </div>
            )}
            {showBlockDiscount && (
              <div className="flex justify-between text-zinc-600">
                <span>Discount:</span>
                <span>-{currency}0.00</span>
              </div>
            )}
            {showBlockTaxAmount !== false && (
              <div className="flex justify-between text-zinc-600">
                <span>Tax (GST):</span>
                <span>{currency}162.63</span>
              </div>
            )}
            {showBlockRoundOff && (
              <div className="flex justify-between text-zinc-600">
                <span>Round Off:</span>
                <span>{currency}0.37</span>
              </div>
            )}
            {showBlockGrandTotal !== false && (
              <div className="flex justify-between font-bold text-[1.1em] pt-1 border-t border-zinc-400 text-zinc-950">
                <span>Grand Total:</span>
                <span>{currency}2,017.00</span>
              </div>
            )}
            {showBlockReceivedAmount && (
              <div className="flex justify-between text-zinc-600 pt-1">
                <span>Received:</span>
                <span>{currency}2,017.00</span>
              </div>
            )}
            {showBlockBalanceDue && (
              <div className="flex justify-between text-zinc-600">
                <span>Balance Due:</span>
                <span>{currency}0.00</span>
              </div>
            )}
          </div>

          {/* Footer Details */}
          <div className="mt-3 pt-2 border-t border-dashed border-zinc-400 space-y-2">
            {showNotes && notes && (
              <p className="text-[0.85em] text-zinc-600 leading-tight">{notes}</p>
            )}

            {showBankDetails && bankAccount && (
              <div className="text-[0.85em] text-zinc-700 bg-zinc-100 p-1.5 rounded">
                <p className="font-bold">Bank: {bankName || 'HDFC Bank'} | A/C: {bankAccount} | IFSC: {bankIfsc}</p>
              </div>
            )}

            {showUpiQr && (
              <div className="flex items-center gap-3 p-2 bg-zinc-50 border border-zinc-200 rounded justify-center">
                {upiQrUrl ? (
                  <img src={upiQrUrl} alt="UPI QR Code" className="h-16 w-16 object-contain rounded border border-zinc-200 shadow-sm" />
                ) : (
                  <Smartphone className="h-5 w-5 text-zinc-800" />
                )}
                <div className="text-left space-y-0.5">
                  <p className="text-[0.85em] font-bold text-zinc-900 uppercase">Scan & Pay via UPI</p>
                  <p className="text-[0.8em] font-mono font-semibold text-zinc-700">{upiId || 'shop@okhdfcbank'}</p>
                  <p className="text-[0.75em] text-zinc-500">Google Pay • PhonePe • Paytm</p>
                </div>
              </div>
            )}

            {showTerms && terms && (
              <p className="text-[0.85em] text-zinc-500 italic leading-tight">{terms}</p>
            )}

            {showSignature && (
              <div className="pt-2 flex justify-end">
                <div className="text-center w-28">
                  {signatureUrl ? (
                    <img src={signatureUrl} alt="Sign" className="h-7 mx-auto object-contain" />
                  ) : (
                    <div className={cn("h-7 w-full", showSignatureOutline ? "border-b border-dashed border-zinc-300" : "")} />
                  )}
                  <p className="border-t border-zinc-400 text-[0.75em] font-bold uppercase text-zinc-800 pt-0.5 mt-1">
                    Authorized Signatory
                  </p>
                </div>
              </div>
            )}

            {thankYouNote && (
              <p className="text-center text-[0.85em] font-semibold text-zinc-700 pt-1">
                {thankYouNote}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const SETTINGS_SECTION_VALUES = [
  'shop', 'regional', 'tax', 'invoice', 'print', 'units',
  'inventory', 'barcode', 'custom_fields', 'routine',
  'notifications', 'team', 'billing', 'backup',
] as const

export function SettingsPage() {
  const { org, user, refreshOrg } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const activeSection = SETTINGS_SECTION_VALUES.includes(sectionParam as any) ? sectionParam! : 'shop'
  const handleSectionChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('section', value)
      return next
    }, { replace: true })
  }

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.branding?.logo_url ?? null)
  const [primaryColor, setPrimaryColor] = useState(org?.branding?.primary_color ?? '#6366f1')
  const [invoiceHeader, setInvoiceHeader] = useState(org?.invoice_template?.invoice_header ?? org?.branding?.invoice_header ?? '')
  const [invoiceFooter, setInvoiceFooter] = useState(org?.invoice_template?.invoice_footer ?? org?.branding?.invoice_footer ?? '')
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteLink, setInviteLink] = useState<{link: string, otp: string} | null>(null)
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  React.useEffect(() => {
    if (org?.branding?.logo_url && !logoFile) {
      setLogoPreview(org.branding.logo_url)
    }
    if (org?.branding?.primary_color) {
      setPrimaryColor(org.branding.primary_color)
    }
  }, [org?.branding?.logo_url, org?.branding?.primary_color])

  // Invoice tab extra fields
  const [bankName, setBankName] = useState(org?.branding?.bank_name ?? '')
  const [bankAccount, setBankAccount] = useState(org?.branding?.bank_account ?? '')
  const [bankIfsc, setBankIfsc] = useState(org?.branding?.bank_ifsc ?? '')
  const [invoiceTerms, setInvoiceTerms] = useState(org?.invoice_template?.default_terms ?? org?.branding?.invoice_terms ?? 'Thank you for your business!')
  
  // Document Prefixes
  const [prefixSale, setPrefixSale] = useState(org?.invoice_template?.prefix_sale ?? org?.branding?.invoice_prefix ?? 'INV')
  const [prefixPurchase, setPrefixPurchase] = useState(org?.invoice_template?.prefix_purchase ?? 'BILL')
  const [prefixEstimate, setPrefixEstimate] = useState(org?.invoice_template?.prefix_estimate ?? 'EST')
  const [prefixSaleOrder, setPrefixSaleOrder] = useState(org?.invoice_template?.prefix_sale_order ?? 'SO')
  const [prefixProforma, setPrefixProforma] = useState(org?.invoice_template?.prefix_proforma ?? 'PI')
  const [prefixCreditNote, setPrefixCreditNote] = useState(org?.invoice_template?.prefix_credit_note ?? 'CN')
  const [prefixChallan, setPrefixChallan] = useState(org?.invoice_template?.prefix_challan ?? 'DC')
  const [prefixReceipt, setPrefixReceipt] = useState(org?.invoice_template?.prefix_receipt ?? 'RCP')
  const [prefixExpense, setPrefixExpense] = useState(org?.invoice_template?.prefix_expense ?? 'EXP')

  // Numbering Format
  const [autoGenerateNumbers, setAutoGenerateNumbers] = useState(org?.invoice_template?.auto_generate_numbers ?? true)
  const [numberFormat, setNumberFormat] = useState(org?.invoice_template?.number_format ?? 'PREFIX-1 (Simple)')
  const [numberSuffix, setNumberSuffix] = useState(org?.invoice_template?.number_suffix ?? '')
  const [invoiceStartNumber, setInvoiceStartNumber] = useState<number>(org?.branding?.invoice_start_number ?? 1)

  // Document Appearance (Merged)
  const [showLogoOnDocs, setShowLogoOnDocs] = useState(org?.invoice_template?.show_logo ?? true)
  const [showSignatureOnDocs, setShowSignatureOnDocs] = useState(org?.invoice_template?.show_signature ?? org?.branding?.show_signature_on_invoice ?? false)
  
  // Round Off Settings
  const [enableRoundOff, setEnableRoundOff] = useState(org?.invoice_template?.enable_round_off ?? true)
  const [roundOffType, setRoundOffType] = useState(org?.invoice_template?.round_off_type ?? 'Round to Nearest')

  // Financial Year Settings
  const [enableFyNumberReset, setEnableFyNumberReset] = useState(org?.invoice_template?.enable_fy_number_reset ?? false)

  // Regional tab
  const [financialYearStart, setFinancialYearStart] = useState<string>((org?.branding as any)?.financial_year_start ?? 'April - March (Indian FY)')
  const [currency, setCurrency] = useState(org?.branding?.currency ?? '₹')
  const [dateFormat, setDateFormat] = useState(org?.branding?.date_format ?? 'DD/MM/YYYY')
  const [timezone, setTimezone] = useState(org?.branding?.timezone ?? 'Asia/Kolkata')

  // Tax & GST settings
  const [taxInclusive, setTaxInclusive] = useState<boolean>(org?.branding?.tax_inclusive ?? false)
  const [defaultGstRate, setDefaultGstRate] = useState<number>(org?.branding?.default_gst_rate ?? 18)
  const [compositionScheme, setCompositionScheme] = useState<boolean>(org?.branding?.composition_scheme ?? false)
  const [interStateTax, setInterStateTax] = useState<boolean>(org?.branding?.inter_state_tax ?? false)
  const [showHsnOnInvoice, setShowHsnOnInvoice] = useState<boolean>(org?.branding?.show_hsn_on_invoice ?? true)
  const [rcmEnabled, setRcmEnabled] = useState<boolean>(org?.branding?.rcm_enabled ?? false)

  
  // Inventory settings (stored in feature_flags JSONB)
  const [allowNegativeStock, setAllowNegativeStock] = useState<boolean>((org as any)?.feature_flags?.allow_negative_stock ?? false)
  const [autoDeductStock, setAutoDeductStock] = useState<boolean>((org as any)?.feature_flags?.auto_deduct_stock ?? true)
  const [lowStockThreshold, setLowStockThreshold] = useState<number>((org as any)?.feature_flags?.low_stock_threshold ?? 10)
  const [showOutOfStockInBilling, setShowOutOfStockInBilling] = useState<boolean>((org as any)?.feature_flags?.show_out_of_stock_in_billing ?? true)
  const [allowDuplicateItemNames, setAllowDuplicateItemNames] = useState<boolean>((org as any)?.feature_flags?.allow_duplicate_item_names ?? false)
  const [enableStockTracking, setEnableStockTracking] = useState<boolean>((org as any)?.feature_flags?.enable_stock_tracking ?? true)
  const [enableExpiryTracking, setEnableExpiryTracking] = useState<boolean>((org as any)?.feature_flags?.enable_expiry_tracking ?? true)
  const [expiryAlertPeriod, setExpiryAlertPeriod] = useState<number>((org as any)?.feature_flags?.expiry_alert_period ?? 7)
  const [hideFromOnlineStoreBeforeExpiry, setHideFromOnlineStoreBeforeExpiry] = useState<number>((org as any)?.feature_flags?.hide_from_online_store_before_expiry ?? 30)

  // Barcode settings
  const [barcodeType, setBarcodeType] = useState<string>(org?.branding?.barcode_type ?? 'code128')
  const [barcodeLabelSize, setBarcodeLabelSize] = useState<string>(org?.branding?.barcode_label_size ?? '5x3cm')
  const [barcodeTemplateStyle, setBarcodeTemplateStyle] = useState<'standard' | 'saravana_stores' | 'circular_bottle' | 'compact_jewelry'>((org?.branding as any)?.barcode_template_style ?? 'standard')
  const [autoPrintBarcodeOnPurchase, setAutoPrintBarcodeOnPurchase] = useState<boolean>(org?.branding?.auto_print_barcode_on_purchase ?? false)

  // Invoice UPI / payment
  const [upiId, setUpiId] = useState<string>(org?.branding?.upi_id ?? '')
  const [defaultPaymentMode, setDefaultPaymentMode] = useState<string>(org?.branding?.default_payment_mode ?? 'cash')
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState<number>(org?.branding?.default_payment_terms ?? 30)
  const [paymentReminderDays, setPaymentReminderDays] = useState<number>(org?.branding?.payment_reminder_days ?? 7)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signaturePreview, setSignaturePreview] = useState<string | null>(org?.invoice_template?.signature_url ?? org?.branding?.signature_url ?? null)

  // Notification Preferences
  const [notifyLowStock, setNotifyLowStock] = useState<boolean>(org?.branding?.notify_low_stock ?? true)
  const [notifyExpiry, setNotifyExpiry] = useState<boolean>(org?.branding?.notify_expiry ?? true)
  const [notifyInvoiceDue, setNotifyInvoiceDue] = useState<boolean>(org?.branding?.notify_invoice_due ?? true)
  const [notifyPaymentReceived, setNotifyPaymentReceived] = useState<boolean>(org?.branding?.notify_payment_received ?? true)
  const [notifyDailySummary, setNotifyDailySummary] = useState<boolean>(org?.branding?.notify_daily_summary ?? false)
  const [notifyTrialExpiry, setNotifyTrialExpiry] = useState<boolean>(org?.branding?.notify_trial_expiry ?? true)
  const [paymentReminders, setPaymentReminders] = useState<boolean>(org?.branding?.payment_reminders ?? true)
  const [dueDateReminders, setDueDateReminders] = useState<boolean>(org?.branding?.due_date_reminders ?? true)
  const [remindBeforeDue, setRemindBeforeDue] = useState<number>(org?.branding?.remind_before_due ?? 3)
  const [remindAfterDue, setRemindAfterDue] = useState<number>(org?.branding?.remind_after_due ?? 1)

  // Colors & Typography
  const [printTextColor, setPrintTextColor] = useState<string>(org?.branding?.print_text_color ?? '#000000')
  const [printFontFamily, setPrintFontFamily] = useState<string>(org?.branding?.print_font_family ?? 'Inter')
  const [printFontSize, setPrintFontSize] = useState<string>(org?.branding?.print_font_size ?? 'Medium')

  // Print & PDF Layout Settings
  const [showLivePreviewPanel, setShowLivePreviewPanel] = useState<boolean>(true)
  const [printPaperSize, setPrintPaperSize] = useState<'a4' | 'a5' | 'thermal_3inch' | 'thermal_2inch'>(org?.branding?.print_paper_size ?? 'thermal_3inch')
  const [printTemplateTheme, setPrintTemplateTheme] = useState<string>(org?.branding?.print_template_theme ?? 'standard')
  const [printShowLogo, setPrintShowLogo] = useState<boolean>(org?.branding?.print_show_logo ?? true)
  const [printShowShopName, setPrintShowShopName] = useState<boolean>(org?.branding?.print_show_shop_name ?? true)
  const [printShowAddress, setPrintShowAddress] = useState<boolean>(org?.branding?.print_show_address ?? true)
  const [printShowContact, setPrintShowContact] = useState<boolean>(org?.branding?.print_show_contact ?? true)
  const [printShowGstin, setPrintShowGstin] = useState<boolean>(org?.branding?.print_show_gstin ?? true)
  const [printShowPan, setPrintShowPan] = useState<boolean>(org?.branding?.print_show_pan ?? true)
  const [printShowEmailWebsite, setPrintShowEmailWebsite] = useState<boolean>(org?.branding?.print_show_email_website ?? true)

  // Customer / Party Details
  const [printShowCustomerBillingAddress, setPrintShowCustomerBillingAddress] = useState<boolean>(org?.branding?.print_show_customer_billing_address ?? true)
  const [printShowCustomerShippingAddress, setPrintShowCustomerShippingAddress] = useState<boolean>(org?.branding?.print_show_customer_shipping_address ?? true)
  const [printShowCustomerPan, setPrintShowCustomerPan] = useState<boolean>(org?.branding?.print_show_customer_pan ?? true)
  const [printShowCustomerPhone, setPrintShowCustomerPhone] = useState<boolean>(org?.branding?.print_show_customer_phone ?? true)

  // Document Details
  const [printShowDocumentNumber, setPrintShowDocumentNumber] = useState<boolean>(org?.branding?.print_show_document_number ?? true)
  const [printShowDocumentDate, setPrintShowDocumentDate] = useState<boolean>(org?.branding?.print_show_document_date ?? true)
  const [printShowDueDate, setPrintShowDueDate] = useState<boolean>(org?.branding?.print_show_due_date ?? true)
  const [printShowPlaceOfSupply, setPrintShowPlaceOfSupply] = useState<boolean>(org?.branding?.print_show_place_of_supply ?? true)
  const [printShowDeliveryNote, setPrintShowDeliveryNote] = useState<boolean>(org?.branding?.print_show_delivery_note ?? false)
  const [printShowPaymentMode, setPrintShowPaymentMode] = useState<boolean>(org?.branding?.print_show_payment_mode ?? false)

  const [printShowColumnSno, setPrintShowColumnSno] = useState<boolean>(org?.branding?.print_show_column_sno ?? true)
  const [printShowColumnHsn, setPrintShowColumnHsn] = useState<boolean>(org?.branding?.print_show_column_hsn ?? true)
  const [printShowColumnMrp, setPrintShowColumnMrp] = useState<boolean>(org?.branding?.print_show_column_mrp ?? false)
  const [printShowColumnItemName, setPrintShowColumnItemName] = useState<boolean>(org?.branding?.print_show_column_item_name ?? true)
  const [printShowColumnQty, setPrintShowColumnQty] = useState<boolean>(org?.branding?.print_show_column_qty ?? true)
  const [printShowColumnUnit, setPrintShowColumnUnit] = useState<boolean>(org?.branding?.print_show_column_unit ?? true)
  const [printShowColumnRate, setPrintShowColumnRate] = useState<boolean>(org?.branding?.print_show_column_rate ?? true)
  const [printShowColumnDiscountType, setPrintShowColumnDiscountType] = useState<boolean>(org?.branding?.print_show_column_discount_type ?? false)
  const [printShowColumnDiscount, setPrintShowColumnDiscount] = useState<boolean>(org?.branding?.print_show_column_discount ?? true)
  const [printShowColumnTaxRate, setPrintShowColumnTaxRate] = useState<boolean>(org?.branding?.print_show_column_tax_rate ?? true)
  const [printShowColumnTaxableValue, setPrintShowColumnTaxableValue] = useState<boolean>(org?.branding?.print_show_column_taxable_value ?? false)
  const [printShowColumnTaxAmount, setPrintShowColumnTaxAmount] = useState<boolean>(org?.branding?.print_show_column_tax_amount ?? false)
  const [printShowColumnItemTotal, setPrintShowColumnItemTotal] = useState<boolean>(org?.branding?.print_show_column_item_total ?? true)

  // Tax Display Settings
  const [printShowCgstSgstIgst, setPrintShowCgstSgstIgst] = useState<boolean>(org?.branding?.print_show_cgst_sgst_igst ?? true)
  const [printShowTaxSummary, setPrintShowTaxSummary] = useState<boolean>(org?.branding?.print_show_tax_summary ?? true)

  // Total Calculation Blocks
  const [printShowBlockSubtotal, setPrintShowBlockSubtotal] = useState<boolean>(org?.branding?.print_show_block_subtotal ?? true)
  const [printShowBlockDiscount, setPrintShowBlockDiscount] = useState<boolean>(org?.branding?.print_show_block_discount ?? true)
  const [printShowBlockTaxAmount, setPrintShowBlockTaxAmount] = useState<boolean>(org?.branding?.print_show_block_tax_amount ?? true)
  const [printShowBlockRounding, setPrintShowBlockRounding] = useState<boolean>(org?.branding?.print_show_block_rounding ?? false)
  const [printShowBlockRoundOff, setPrintShowBlockRoundOff] = useState<boolean>(org?.branding?.print_show_block_round_off ?? true)
  const [printShowBlockGrandTotal, setPrintShowBlockGrandTotal] = useState<boolean>(org?.branding?.print_show_block_grand_total ?? true)
  const [printShowBlockReceivedAmount, setPrintShowBlockReceivedAmount] = useState<boolean>(org?.branding?.print_show_block_received_amount ?? false)
  const [printShowBlockBalanceDue, setPrintShowBlockBalanceDue] = useState<boolean>(org?.branding?.print_show_block_balance_due ?? false)
  const [printShowBlockChangeReturned, setPrintShowBlockChangeReturned] = useState<boolean>(org?.branding?.print_show_block_change_returned ?? false)

  const [printShowBankDetails, setPrintShowBankDetails] = useState<boolean>(org?.branding?.print_show_bank_details ?? true)
  const [printShowUpiQr, setPrintShowUpiQr] = useState<boolean>(org?.branding?.print_show_upi_qr ?? true)
  const [printShowTerms, setPrintShowTerms] = useState<boolean>(org?.branding?.print_show_terms ?? true)
  const [printShowNotes, setPrintShowNotes] = useState<boolean>(org?.branding?.print_show_notes ?? true)
  const [printShowSignatureOutline, setPrintShowSignatureOutline] = useState<boolean>(org?.branding?.print_show_signature_outline ?? true)
  const [printShowSignature, setPrintShowSignature] = useState<boolean>(org?.branding?.print_show_signature ?? true)
  const [printShowPartyDetails, setPrintShowPartyDetails] = useState<boolean>(org?.branding?.print_show_party_details ?? true)
  const [printThankYouNote, setPrintThankYouNote] = useState<string>(org?.branding?.print_thank_you_note ?? 'Thank you for your business! Please visit again.')

  // Custom Fields Settings
  const [customFields, setCustomFields] = useState<any[]>(org?.branding?.custom_fields ?? [
    { id: 'cf-1', name: 'Color / Shade', type: 'text', target: 'product', required: false, show_on_invoice: true },
    { id: 'cf-2', name: 'Warranty Period', type: 'text', target: 'product', required: false, show_on_invoice: true },
    { id: 'cf-3', name: 'Technician Name', type: 'text', target: 'service', required: false, show_on_invoice: false },
  ])
  const [customFieldTargetTab, setCustomFieldTargetTab] = useState<'product' | 'service'>('product')
  const [showAddFieldDialog, setShowAddFieldDialog] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldTarget, setNewFieldTarget] = useState<'product' | 'service'>('product')
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'date' | 'dropdown' | 'checkbox'>('text')
  const [newFieldRequired, setNewFieldRequired] = useState(false)
  const [newFieldShowOnInvoice, setNewFieldShowOnInvoice] = useState(true)

  const [exportLoading, setExportLoading] = useState(false)

  // Change password
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [newPasswordValue, setNewPasswordValue] = useState('')

  const changePasswordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  // Routine Works State
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)

  const templateForm = useForm<RoutineTemplateValues>({
    resolver: zodResolver(routineTemplateSchema),
    defaultValues: {
      name: '',
      category: 'rent',
      due_day: 1,
      default_amount: 0,
      is_active: true,
    },
  })

  const shopForm = useForm<ShopInfoValues>({
    resolver: zodResolver(shopInfoSchema),
    defaultValues: {
      name: org?.name ?? '',
      gstin: org?.gstin ?? '',
      state_code: org?.state_code ?? 'TN',
      address: org?.address ?? '',
      city: org?.city ?? '',
      pincode: org?.pincode ?? '',
      phone: org?.phone ?? '',
      email: org?.email ?? '',
      pan: org?.pan ?? '',
      business_type: org?.business_type ?? '',
      website: org?.website ?? '',
    },
  })

  React.useEffect(() => {
    if (org) {
      shopForm.reset({
        name: org.name || '',
        gstin: org.gstin || '',
        state_code: org.state_code || 'TN',
        address: org.address || '',
        city: org.city || '',
        pincode: org.pincode || '',
        phone: org.phone || '',
        email: org.email || '',
        pan: org.pan || '',
        business_type: org.business_type || '',
        website: org.website || '',
      })
      if ((org?.branding as any)?.financial_year_start) {
        setFinancialYearStart((org.branding as any).financial_year_start)
      }
    }
  }, [org])

  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { employee_id: '', role: 'cashier' },
  })

  
  const { data: employees } = useQuery({
    queryKey: ['employees', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('organization_id', orgId!).eq('is_active', true)
      return data ?? []
    },
  })


  // Fetch members and enrich with profiles & employees
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: mData, error: mErr } = await supabase
        .from('memberships')
        .select('id, role, role_id, user_id, created_at, employee_id')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: true })

      if (mErr) {
        console.error('Error fetching memberships:', mErr)
        throw mErr
      }

      if (!mData || mData.length === 0) return []

      const userIds = mData.map((m) => m.user_id).filter(Boolean)
      let profilesMap: Record<string, { full_name: string; avatar_url: string | null; phone: string | null }> = {}
      if (userIds.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone')
          .in('id', userIds)

        if (pData) {
          for (const p of pData) {
            profilesMap[p.id] = p
          }
        }
      }

      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, email, phone, role')
        .eq('organization_id', orgId!)

      const empMap: Record<string, any> = {}
      if (empData) {
        for (const emp of empData) {
          empMap[emp.id] = emp
        }
      }

      return mData.map((m) => {
        const profile = profilesMap[m.user_id] || null
        const emp = m.employee_id ? empMap[m.employee_id] : null
        const isCurrentUser = m.user_id === user?.id

        const name = isCurrentUser
          ? (user?.user_metadata?.full_name || profile?.full_name || org?.name || 'Shop Owner')
          : (emp?.full_name || profile?.full_name || 'Dashboard User')

        const email = isCurrentUser
          ? user?.email
          : (emp?.email || null)

        const phone = emp?.phone || profile?.phone || null
        const avatarUrl = profile?.avatar_url || null

        return {
          ...m,
          full_name: name,
          email: email,
          phone: phone,
          avatar_url: avatarUrl,
          is_current_user: isCurrentUser,
        }
      })
    },
  })

  // Fetch pending invitations
  const { data: pendingInvitations = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ['user_invitations', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })

      if (error) {
        return []
      }
      return data ?? []
    },
  })

  // Fetch available roles
  const { data: roles = [] } = useQuery({
    queryKey: ['roles', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('roles')
        .select('id, name, is_system')
        .eq('organization_id', orgId!)
        .order('is_system', { ascending: false })
      return data ?? []
    },
  })

  // Fetch Recurring Templates
  const { data: recurringTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ['recurring_templates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_templates')
        .select('*')
        .eq('organization_id', orgId!)
        .order('category')
      if (error) throw error
      return data ?? []
    },
  })

  const saveTemplateMutation = useMutation({
    mutationFn: async (values: RoutineTemplateValues) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from('recurring_templates')
          .update(values)
          .eq('id', editingTemplate.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('recurring_templates')
          .insert({
            organization_id: orgId!,
            ...values,
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_templates', orgId] })
      toast.success('Routine template saved')
      setTemplateDialogOpen(false)
    },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_templates', orgId] })
      toast.success('Routine template deleted')
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  const saveShopMutation = useMutation({
    mutationFn: async (values: ShopInfoValues) => {
      // 1. Save Org Info
      const { error: orgErr } = await supabase
        .from('organizations')
        .update({
          name: values.name.trim(),
          gstin: values.gstin?.trim() || null,
          state_code: values.state_code,
          address: values.address?.trim() || null,
          city: values.city?.trim() || null,
          pincode: values.pincode?.trim() || null,
          phone: values.phone?.trim() || null,
          email: values.email?.trim() || null,
          pan: values.pan ? values.pan.trim().toUpperCase() : null,
          business_type: values.business_type || null,
          website: values.website?.trim() || null,
        })
        .eq('id', orgId!)
      if (orgErr) throw orgErr

      // 2. Save Logo
      let logoUrl = org?.branding?.logo_url
      if (logoFile && orgId) {
        const ext = logoFile.name.split('.').pop()
        const path = `${orgId}/logo.${ext}`
        const { error } = await supabase.storage.from('org-assets').upload(path, logoFile, { upsert: true })
        if (!error) {
          const { data: urlData } = supabase.storage.from('org-assets').getPublicUrl(path)
          logoUrl = urlData.publicUrl
        }
      }

      // 3. Save Branding
      const existing = org?.branding ?? {}
      const { error: brandErr } = await supabase
        .from('org_settings')
        .upsert({
          organization_id: orgId!,
          branding: {
            ...existing,
            logo_url: logoUrl,
            primary_color: primaryColor,
          },
        }, { onConflict: 'organization_id' })
      if (brandErr) throw brandErr
    },
    onSuccess: async () => {
      await refreshOrg()
      toast.success('Shop Info saved successfully')
    },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveInvoiceSettingsMutation = useMutation({
    mutationFn: async () => {
      const existingBranding = org?.branding ?? {}
      const existingInvoice = (org as any)?.invoice_template ?? {}

      let signatureUrl = (org as any)?.invoice_template?.signature_url ?? org?.branding?.signature_url ?? null
      if (signatureFile && orgId) {
        const ext = signatureFile.name.split('.').pop()
        const path = `${orgId}/signature.${ext}`
        const { error } = await supabase.storage.from('org-assets').upload(path, signatureFile, { upsert: true })
        if (!error) {
          const { data: urlData } = supabase.storage.from('org-assets').getPublicUrl(path)
          signatureUrl = urlData.publicUrl
        }
      }

      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existingBranding,
          bank_name: bankName.trim() || null,
          bank_account: bankAccount.trim() || null,
          bank_ifsc: bankIfsc.trim() || null,
          upi_id: upiId.trim() || null,
          default_payment_mode: defaultPaymentMode,
          default_payment_terms: defaultPaymentTerms,
          payment_reminder_days: paymentReminderDays,
          invoice_start_number: invoiceStartNumber, // keeping for fallback
        },
        invoice_template: {
          ...existingInvoice,
          prefix_sale: prefixSale.trim() || 'INV',
          prefix_purchase: prefixPurchase.trim() || 'BILL',
          prefix_estimate: prefixEstimate.trim() || 'EST',
          prefix_sale_order: prefixSaleOrder.trim() || 'SO',
          prefix_proforma: prefixProforma.trim() || 'PI',
          prefix_credit_note: prefixCreditNote.trim() || 'CN',
          prefix_challan: prefixChallan.trim() || 'DC',
          prefix_receipt: prefixReceipt.trim() || 'RCP',
          prefix_expense: prefixExpense.trim() || 'EXP',
          auto_generate_numbers: autoGenerateNumbers,
          number_format: numberFormat,
          number_suffix: numberSuffix.trim(),
          show_logo: showLogoOnDocs,
          show_signature: showSignatureOnDocs,
          signature_url: signatureUrl,
          enable_round_off: enableRoundOff,
          round_off_type: roundOffType,
          enable_fy_number_reset: enableFyNumberReset,
          invoice_header: invoiceHeader.trim() || null,
          invoice_footer: invoiceFooter.trim() || null,
          default_terms: invoiceTerms.trim() || null,
        }
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Invoice settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveRegionalMutation = useMutation({
    mutationFn: async () => {
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: { ...existing, currency, date_format: dateFormat, timezone, financial_year_start: financialYearStart },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Regional settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveTaxGstMutation = useMutation({
    mutationFn: async () => {
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existing,
          tax_inclusive: taxInclusive,
          default_gst_rate: defaultGstRate,
          composition_scheme: compositionScheme,
          inter_state_tax: interStateTax,
          show_hsn_on_invoice: showHsnOnInvoice,
          rcm_enabled: rcmEnabled,
        },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Tax & GST settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveInventoryMutation = useMutation({
    mutationFn: async () => {
      const existing = (org as any)?.feature_flags ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        feature_flags: {
          ...existing,
          allow_negative_stock: allowNegativeStock,
          auto_deduct_stock: autoDeductStock,
          low_stock_threshold: lowStockThreshold,
          show_out_of_stock_in_billing: showOutOfStockInBilling,
          allow_duplicate_item_names: allowDuplicateItemNames,
          enable_stock_tracking: enableStockTracking,
          enable_expiry_tracking: enableExpiryTracking,
          expiry_alert_period: expiryAlertPeriod,
          hide_from_online_store_before_expiry: hideFromOnlineStoreBeforeExpiry,
        },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Inventory settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveBarcodeMutation = useMutation({
    mutationFn: async () => {
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existing,
          barcode_type: barcodeType,
          barcode_label_size: barcodeLabelSize,
          barcode_template_style: barcodeTemplateStyle,
          auto_print_barcode_on_purchase: autoPrintBarcodeOnPurchase,
        },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Barcode settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveNotificationsMutation = useMutation({
    mutationFn: async () => {
      const existingBranding = org?.branding ?? {}
      const existingFlags = (org as any)?.feature_flags ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existingBranding,
          notify_low_stock: notifyLowStock,
          notify_expiry: notifyExpiry,
          notify_invoice_due: notifyInvoiceDue,
          notify_payment_received: notifyPaymentReceived,
          notify_daily_summary: notifyDailySummary,
          notify_trial_expiry: notifyTrialExpiry,
          payment_reminders: paymentReminders,
          due_date_reminders: dueDateReminders,
          remind_before_due: remindBeforeDue,
          remind_after_due: remindAfterDue,
        },
        feature_flags: {
          ...existingFlags,
          low_stock_threshold: lowStockThreshold,
        }
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Notification settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const savePrintMutation = useMutation({
    mutationFn: async () => {
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existing,
          print_paper_size: printPaperSize,
          print_template_theme: printTemplateTheme,
          print_text_color: printTextColor,
          print_font_family: printFontFamily,
          print_font_size: printFontSize,
          print_show_logo: printShowLogo,
          print_show_shop_name: printShowShopName,
          print_show_address: printShowAddress,
          print_show_contact: printShowContact,
          print_show_gstin: printShowGstin,
          print_show_pan: printShowPan,
          print_show_email_website: printShowEmailWebsite,
          print_show_customer_billing_address: printShowCustomerBillingAddress,
          print_show_customer_shipping_address: printShowCustomerShippingAddress,
          print_show_customer_pan: printShowCustomerPan,
          print_show_customer_phone: printShowCustomerPhone,
          print_show_document_number: printShowDocumentNumber,
          print_show_document_date: printShowDocumentDate,
          print_show_due_date: printShowDueDate,
          print_show_place_of_supply: printShowPlaceOfSupply,
          print_show_delivery_note: printShowDeliveryNote,
          print_show_payment_mode: printShowPaymentMode,
          print_show_column_sno: printShowColumnSno,
          print_show_column_hsn: printShowColumnHsn,
          print_show_column_mrp: printShowColumnMrp,
          print_show_column_item_name: printShowColumnItemName,
          print_show_column_qty: printShowColumnQty,
          print_show_column_unit: printShowColumnUnit,
          print_show_column_rate: printShowColumnRate,
          print_show_column_discount_type: printShowColumnDiscountType,
          print_show_column_discount: printShowColumnDiscount,
          print_show_column_tax_rate: printShowColumnTaxRate,
          print_show_column_taxable_value: printShowColumnTaxableValue,
          print_show_column_tax_amount: printShowColumnTaxAmount,
          print_show_column_item_total: printShowColumnItemTotal,
          print_show_cgst_sgst_igst: printShowCgstSgstIgst,
          print_show_tax_summary: printShowTaxSummary,
          print_show_block_subtotal: printShowBlockSubtotal,
          print_show_block_discount: printShowBlockDiscount,
          print_show_block_tax_amount: printShowBlockTaxAmount,
          print_show_block_rounding: printShowBlockRounding,
          print_show_block_round_off: printShowBlockRoundOff,
          print_show_block_grand_total: printShowBlockGrandTotal,
          print_show_block_received_amount: printShowBlockReceivedAmount,
          print_show_block_balance_due: printShowBlockBalanceDue,
          print_show_block_change_returned: printShowBlockChangeReturned,
          print_show_bank_details: printShowBankDetails,
          print_show_upi_qr: printShowUpiQr,
          print_show_terms: printShowTerms,
          print_show_notes: printShowNotes,
          print_show_signature_outline: printShowSignatureOutline,
          print_show_signature: printShowSignature,
          print_show_party_details: printShowPartyDetails,
          print_thank_you_note: printThankYouNote,
        },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Print settings saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveCustomFieldsMutation = useMutation({
    mutationFn: async (updatedFields: any[]) => {
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existing,
          custom_fields: updatedFields,
        },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: async () => { await refreshOrg(); toast.success('Custom fields saved') },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const handleAddCustomField = () => {
    if (!newFieldName.trim()) {
      toast.error('Please enter a field name')
      return
    }
    const newField = {
      id: `cf-${Date.now()}`,
      name: newFieldName.trim(),
      target: newFieldTarget,
      type: newFieldType,
      required: newFieldRequired,
      show_on_invoice: newFieldShowOnInvoice,
    }
    const updated = [...customFields, newField]
    setCustomFields(updated)
    saveCustomFieldsMutation.mutate(updated)
    setNewFieldName('')
    setShowAddFieldDialog(false)
  }

  const handleDeleteCustomField = (id: string) => {
    const updated = customFields.filter((f) => f.id !== id)
    setCustomFields(updated)
    saveCustomFieldsMutation.mutate(updated)
  }

  async function exportAllData() {
    if (!orgId) return
    setExportLoading(true)
    try {
      const [products, customers, sales, purchases, expenses] = await Promise.all([
        supabase.from('products').select('name,sku,price,cost_price,tax_rate,hsn_code,barcode_value').eq('organization_id', orgId).eq('is_active', true),
        supabase.from('customers').select('name,phone,email,gstin,address,balance').eq('organization_id', orgId),
        supabase.from('sales').select('invoice_no,grand_total,payment_mode,created_at').eq('organization_id', orgId).order('created_at', { ascending: false }),
        supabase.from('purchases').select('invoice_no,total_amount,created_at').eq('organization_id', orgId).order('created_at', { ascending: false }),
        supabase.from('expenses').select('category,amount,description,expense_date').eq('organization_id', orgId).order('expense_date', { ascending: false }),
      ])

      const wb = XLSX.utils.book_new()
      
      if (products.data && products.data.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products.data), "Products")
      }
      if (customers.data && customers.data.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customers.data), "Customers")
      }
      if (sales.data && sales.data.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sales.data), "Sales")
      }
      if (purchases.data && purchases.data.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchases.data), "Purchases")
      }
      if (expenses.data && expenses.data.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenses.data), "Expenses")
      }
      
      if (wb.SheetNames.length === 0) {
         XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ message: "No data available" }]), "Empty")
      }
      
      XLSX.writeFile(wb, `billscape-backup-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success('Data exported successfully')
    } catch (e: unknown) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setExportLoading(false)
    }
  }

  const changePasswordMutation = useMutation({
    mutationFn: async (values: ChangePasswordValues) => {
      if (!user?.email) throw new Error('No signed-in user email found')
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: values.currentPassword,
      })
      if (verifyError) throw new Error('Current password is incorrect')

      const { error } = await supabase.auth.updateUser({ password: values.newPassword })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Password changed successfully')
      changePasswordForm.reset()
      setNewPasswordValue('')
    },
    onError: (err: Error) => toast.error('Could not change password', err.message),
  })

  
  const inviteMutation = useMutation({
    mutationFn: async (values: InviteValues) => {
      const emp = employees?.find(e => e.id === values.employee_id)
      if (!emp) throw new Error('Employee not found')
      if (!emp.email) throw new Error('Employee has no email. Update employee details first.')
      
      // 1. Insert into user_invitations
      const { error } = await supabase.from('user_invitations').insert({
        organization_id: orgId!,
        employee_id: emp.id,
        email: emp.email,
        role: values.role,
        otp: 'MAGIC', // Placeholder since it's required by schema but ignored by magic link
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      
      if (error) throw error

      // 2. Send Magic Link
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: emp.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/accept-invite`
        }
      })

      if (authError) throw authError
      
      return { email: emp.email }
    },
    onSuccess: (data) => {
      setInviteLink(data as any)
      queryClient.invalidateQueries({ queryKey: ['user_invitations', orgId] })
      queryClient.invalidateQueries({ queryKey: ['members', orgId] })
      toast.success('Invitation email sent!')
    },
    onError: (err: Error) => toast.error('Failed to send invite', err.message),
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, roleId, roleName }: { memberId: string; roleId: string; roleName: string }) => {
      const baseRole = (roleName === 'owner' || roleName === 'manager' || roleName === 'cashier')
        ? (roleName as UserRole)
        : 'manager'
      const { error } = await supabase
        .from('memberships')
        .update({ role_id: roleId, role: baseRole })
        .eq('id', memberId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgId] })
      toast.success('Role updated')
    },
    onError: (err: Error) => toast.error('Failed to update role', err.message),
  })

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('memberships')
        .delete()
        .eq('id', memberId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgId] })
      toast.success('Member removed from dashboard')
    },
    onError: (err: Error) => toast.error('Failed to remove member', err.message),
  })

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('user_invitations')
        .delete()
        .eq('id', inviteId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_invitations', orgId] })
      toast.success('Invitation cancelled')
    },
    onError: (err: Error) => toast.error('Failed to cancel invitation', err.message),
  })

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSignatureFile(file)
    setSignaturePreview(URL.createObjectURL(file))
  }

  const getRoleBadgeVariant = (role: UserRole) => {
    if (role === 'owner') return 'default' as const
    if (role === 'manager') return 'secondary' as const
    return 'outline' as const
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your business identity, tax rules, billing, inventory, and notifications.</p>
      </div>

      <Tabs value={activeSection} onValueChange={handleSectionChange} className="flex flex-col lg:flex-row gap-4 xl:gap-6 items-start">
        {/* Left Side Settings Navigation Sidebar */}
        <aside className="w-full lg:w-56 shrink-0 rounded-2xl border border-border bg-card p-3 shadow-sm space-y-4 lg:sticky lg:top-4 self-start">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase px-3 py-1 tracking-wider">General</p>
            <TabsList className="flex flex-col w-full h-auto bg-transparent p-0 gap-1 items-stretch">
              <TabsTrigger value="shop" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Store className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Shop Info
              </TabsTrigger>

              <TabsTrigger value="regional" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Globe className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Regional
              </TabsTrigger>
            </TabsList>
          </div>

          <Separator />

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase px-3 py-1 tracking-wider">Sales &amp; Tax</p>
            <TabsList className="flex flex-col w-full h-auto bg-transparent p-0 gap-1 items-stretch">
              <TabsTrigger value="tax" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Calculator className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Tax &amp; GST
              </TabsTrigger>
              <TabsTrigger value="invoice" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <FileText className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Invoice &amp; UPI
              </TabsTrigger>
              <TabsTrigger value="print" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Printer className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Print &amp; Layout
              </TabsTrigger>
              <TabsTrigger value="units" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Ruler className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Units
              </TabsTrigger>
            </TabsList>
          </div>

          <Separator />

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase px-3 py-1 tracking-wider">Operations</p>
            <TabsList className="flex flex-col w-full h-auto bg-transparent p-0 gap-1 items-stretch">
              <TabsTrigger value="inventory" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Package className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Inventory
              </TabsTrigger>
              <TabsTrigger value="barcode" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Barcode className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Barcode
              </TabsTrigger>
              <TabsTrigger value="custom_fields" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Layers className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Custom Fields
              </TabsTrigger>
              <TabsTrigger value="routine" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <CalendarClock className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Routine Works
              </TabsTrigger>
            </TabsList>
          </div>

          <Separator />

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase px-3 py-1 tracking-wider">Account &amp; System</p>
            <TabsList className="flex flex-col w-full h-auto bg-transparent p-0 gap-1 items-stretch">
              <TabsTrigger value="notifications" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Bell className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="team" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Users className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Dashboard Users
              </TabsTrigger>
              <TabsTrigger value="billing" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <CreditCard className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Billing
              </TabsTrigger>
              <TabsTrigger value="backup" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Download className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Backup &amp; Export
              </TabsTrigger>
            </TabsList>
          </div>
        </aside>

        {/* Right Side Main Content Area */}
        <div className="flex-1 w-full min-w-0">
          {/* Company Settings (Shop Info) */}
          <TabsContent value="shop" className="mt-0">
            <form onSubmit={shopForm.handleSubmit((v) => saveShopMutation.mutate(v))} className="space-y-6 pb-12">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Store className="h-6 w-6 text-primary" /> Shop Info
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Manage your business information and branding</p>
                </div>
                <Button type="submit" disabled={saveShopMutation.isPending} size="sm" className="gap-1.5 shadow-sm">
                  {saveShopMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
              {/* Card 1: Business Identity */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-secondary/20">
                  <h3 className="font-semibold text-foreground">Business Identity</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full border-2 border-border bg-secondary/30 overflow-hidden flex items-center justify-center relative group cursor-pointer">
                        {logoPreview ? (
                          <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-2xl font-bold text-muted-foreground uppercase">{shopForm.watch('name')?.[0] || 'C'}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Company Logo <span className="text-muted-foreground font-normal">(optional)</span></p>
                        <p className="text-xs text-muted-foreground mb-2">Used in invoices and documents</p>
                        <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                          <Upload className="h-3.5 w-3.5" />
                          Upload Logo
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                        </label>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Brand Color</Label>
                    <p className="text-xs text-muted-foreground">Select a primary color for your shop's theme.</p>
                    <div className="flex gap-2 flex-wrap">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => {
                            setPrimaryColor(c.value)
                            applyBrandColor(c.value)
                          }}
                          className={cn(
                            'h-9 w-9 rounded-full border-2 transition-all',
                            primaryColor === c.value
                              ? 'border-foreground scale-110 shadow-lg'
                              : 'border-transparent hover:scale-105 hover:border-border',
                          )}
                          style={{ backgroundColor: c.value }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Theme</Label>
                    <p className="text-xs text-muted-foreground">Choose between dark and light mode for the interface.</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => theme === 'light' && toggleTheme()}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all w-32 cursor-pointer',
                          theme === 'dark'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-border/80',
                        )}
                      >
                        <div className="h-14 w-20 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col overflow-hidden">
                          <div className="h-3.5 bg-zinc-900 border-b border-zinc-800 flex items-center px-1.5 gap-1">
                            <div className="h-1 w-1 rounded-full bg-zinc-700" />
                            <div className="h-0.5 w-6 rounded bg-zinc-800" />
                          </div>
                          <div className="flex-1 flex items-center justify-center">
                            <div className="h-1.5 w-8 rounded bg-zinc-800" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">Dark</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => theme === 'dark' && toggleTheme()}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all w-32 cursor-pointer',
                          theme === 'light'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-border/80',
                        )}
                      >
                        <div className="h-14 w-20 rounded-lg bg-white border border-zinc-200 flex flex-col overflow-hidden">
                          <div className="h-3.5 bg-zinc-100 border-b border-zinc-200 flex items-center px-1.5 gap-1">
                            <div className="h-1 w-1 rounded-full bg-zinc-300" />
                            <div className="h-0.5 w-6 rounded bg-zinc-200" />
                          </div>
                          <div className="flex-1 flex items-center justify-center">
                            <div className="h-1.5 w-8 rounded bg-zinc-100" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">Light</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-name">Company Name <span className="text-red-500">*</span></Label>
                      <Input id="shop-name" {...shopForm.register('name')} />
                      {shopForm.formState.errors.name && <p className="text-xs text-red-400">{shopForm.formState.errors.name.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-business-type">Business Type</Label>
                      <select id="shop-business-type" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...shopForm.register('business_type')}>
                        <option value="">Select business type</option>
                        {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Tax Information */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-secondary/20">
                  <h3 className="font-semibold text-foreground">Tax Information</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-gstin">GSTIN <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input id="shop-gstin" className="uppercase" placeholder="15-char GSTIN" {...shopForm.register('gstin')} />
                      {shopForm.formState.errors.gstin && <p className="text-xs text-red-400">{shopForm.formState.errors.gstin.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-pan">PAN Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input id="shop-pan" className="uppercase" placeholder="10-char PAN" maxLength={10} {...shopForm.register('pan')} />
                      {shopForm.formState.errors.pan && <p className="text-xs text-red-400">{shopForm.formState.errors.pan.message}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Contact Information */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-secondary/20">
                  <h3 className="font-semibold text-foreground">Contact Information</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-phone">Phone Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input id="shop-phone" placeholder="e.g. 98765 43210 or +91 98765 43210" {...shopForm.register('phone')} />
                      {shopForm.formState.errors.phone && <p className="text-xs text-red-400">{shopForm.formState.errors.phone.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-email">Email Address <span className="text-red-500">*</span></Label>
                      <Input id="shop-email" type="email" placeholder="contact@yourcompany.com" {...shopForm.register('email')} />
                      {shopForm.formState.errors.email && <p className="text-xs text-red-400">{shopForm.formState.errors.email.message}</p>}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="shop-website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input id="shop-website" placeholder="www.yourcompany.com or https://yourcompany.com" {...shopForm.register('website')} />
                    {shopForm.formState.errors.website && <p className="text-xs text-red-400">{shopForm.formState.errors.website.message}</p>}
                  </div>
                </div>
              </div>

              {/* Card 4: Address */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-secondary/20">
                  <h3 className="font-semibold text-foreground">Address</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="shop-address">Street Address</Label>
                    <textarea
                      id="shop-address"
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Shop No., Street Name, Area"
                      {...shopForm.register('address')}
                    />
                    {shopForm.formState.errors.address && <p className="text-xs text-red-400">{shopForm.formState.errors.address.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-city">City</Label>
                      <Input id="shop-city" placeholder="City / Town" {...shopForm.register('city')} />
                      {shopForm.formState.errors.city && <p className="text-xs text-red-400">{shopForm.formState.errors.city.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-state">State <span className="text-red-500">*</span></Label>
                      <select id="shop-state" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...shopForm.register('state_code')}>
                        {INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                      </select>
                      {shopForm.formState.errors.state_code && <p className="text-xs text-red-400">{shopForm.formState.errors.state_code.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="shop-pincode">Pincode</Label>
                      <Input id="shop-pincode" placeholder="6-digit Pincode" maxLength={6} {...shopForm.register('pincode')} />
                      {shopForm.formState.errors.pincode && <p className="text-xs text-red-400">{shopForm.formState.errors.pincode.message}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 5: Account Security */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-secondary/20">
                  <h3 className="font-semibold text-foreground">Account Security</h3>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Change Password</p>
                        <p className="text-xs text-muted-foreground">Update your password using your current one</p>
                      </div>
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" type="button">Change</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Change Password</DialogTitle>
                          <DialogDescription>Enter your current password and a new password.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-1.5 relative">
                            <Label>Current Password</Label>
                            <Input
                              type={showCurrentPassword ? 'text' : 'password'}
                              {...changePasswordForm.register('currentPassword')}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-[26px] text-muted-foreground hover:text-foreground"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            >
                              {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <div className="space-y-1.5 relative">
                            <Label>New Password</Label>
                            <Input
                              type={showNewPassword ? 'text' : 'password'}
                              {...changePasswordForm.register('newPassword')}
                              onChange={(e) => {
                                changePasswordForm.register('newPassword').onChange(e)
                                setNewPasswordValue(e.target.value)
                              }}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-[26px] text-muted-foreground hover:text-foreground"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <div className="space-y-1.5 relative">
                            <Label>Confirm Password</Label>
                            <Input
                              type={showConfirmPassword ? 'text' : 'password'}
                              {...changePasswordForm.register('confirmPassword')}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-[26px] text-muted-foreground hover:text-foreground"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {changePasswordForm.formState.errors.root && (
                            <p className="text-xs text-red-400">{changePasswordForm.formState.errors.root.message}</p>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            disabled={changePasswordMutation.isPending}
                            onClick={() => {
                              changePasswordForm.handleSubmit((v) => changePasswordMutation.mutate(v))()
                            }}
                          >
                            {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            </form>
          </TabsContent>


          {/* Dashboard Users */}
          <TabsContent value="team" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Dashboard Users
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Team members who can sign in to this shop's dashboard and access features based on their assigned roles.
                  </p>
                </div>
                <Button size="sm" onClick={() => setShowInviteDialog(true)} className="shrink-0 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Invite Member
                </Button>
              </div>

              {/* Members Table */}
              <div className="rounded-lg border border-border/80 overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/40">
                    <TableRow>
                      <TableHead className="w-[300px]">User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <p className="text-xs text-muted-foreground">Loading dashboard users...</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : members.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10">
                          <div className="flex flex-col items-center gap-2">
                            <Users className="h-8 w-8 text-muted-foreground/50" />
                            <p className="text-sm font-medium text-foreground">No dashboard users found</p>
                            <p className="text-xs text-muted-foreground">Invite staff members to grant them dashboard access.</p>
                            <Button size="sm" variant="outline" onClick={() => setShowInviteDialog(true)} className="mt-2">
                              <Plus className="h-3.5 w-3.5 mr-1.5" />
                              Invite Member
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      members.map((member: any) => {
                        const displayName = member.full_name || 'Dashboard User'
                        const displayEmail = member.email || (member.is_current_user ? user?.email : 'No email')
                        const initial = displayName.charAt(0).toUpperCase()
                        const memberRole = roles.find((r) => r.id === member.role_id)?.name || member.role || 'cashier'

                        return (
                          <TableRow key={member.id} className="hover:bg-secondary/20 transition-colors">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-bold shrink-0">
                                  {initial}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-foreground">{displayName}</p>
                                    {member.is_current_user && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal bg-primary/10 text-primary border-primary/20">
                                        You
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                                    {displayEmail}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {member.is_current_user || member.role === 'owner' ? (
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="default" className="text-xs capitalize font-medium">
                                    {memberRole}
                                  </Badge>
                                </div>
                              ) : (
                                <select
                                  value={member.role_id || roles.find(r => r.name.toLowerCase() === member.role.toLowerCase())?.id || ''}
                                  onChange={(e) => {
                                    const selectedRole = roles.find((r) => r.id === e.target.value)
                                    if (selectedRole) {
                                      updateRoleMutation.mutate({
                                        memberId: member.id,
                                        roleId: selectedRole.id,
                                        roleName: selectedRole.name,
                                      })
                                    }
                                  }}
                                  className="h-8 rounded-lg border border-border bg-secondary/50 px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                                  disabled={updateRoleMutation.isPending}
                                >
                                  {roles.length > 0 ? (
                                    roles.map((r) => (
                                      <option key={r.id} value={r.id} className="bg-card text-foreground capitalize">
                                        {r.name}
                                      </option>
                                    ))
                                  ) : (
                                    <>
                                      <option value="owner" className="bg-card text-foreground">Owner</option>
                                      <option value="manager" className="bg-card text-foreground">Manager</option>
                                      <option value="cashier" className="bg-card text-foreground">Cashier</option>
                                    </>
                                  )}
                                </select>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">
                              {member.created_at
                                ? new Date(member.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {member.is_current_user || member.role === 'owner' ? (
                                <span className="text-[11px] text-muted-foreground/60 italic pr-2">Owner</span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Remove user"
                                  onClick={() => {
                                    setMemberToDelete({ id: member.id, name: displayName })
                                    setDeleteConfirmOpen(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pending Invitations section if any */}
              {pendingInvitations.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      Pending Invitations ({pendingInvitations.length})
                    </h3>
                  </div>

                  <div className="rounded-lg border border-border/80 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-secondary/40">
                        <TableRow>
                          <TableHead>Invited Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Cancel</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingInvitations.map((inv: any) => (
                          <TableRow key={inv.id} className="hover:bg-secondary/20 transition-colors">
                            <TableCell className="text-sm font-medium text-foreground">
                              {inv.email}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize font-normal">
                                {inv.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-400 border-amber-500/20 font-medium">
                                Pending Invite
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                disabled={cancelInviteMutation.isPending}
                                onClick={() => cancelInviteMutation.mutate(inv.id)}
                              >
                                Cancel
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Billing */}
          <TabsContent value="billing">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="text-base font-semibold text-foreground">Plan & Billing</h2>

              <div className="rounded-lg border border-indigo-800 bg-indigo-950/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-indigo-300">Free Plan</p>
                    <p className="text-xs text-zinc-400 mt-1">Unlimited bills, 1 user, basic reports</p>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-lg border border-zinc-700 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Pro Plan</p>
                      <p className="text-xs text-zinc-400 mt-1">Unlimited users, advanced reports, WhatsApp invoices</p>
                      <ul className="mt-2 space-y-1">
                        {['Unlimited staff accounts', 'WhatsApp invoice sharing', 'Advanced analytics', 'Priority support', 'Custom invoice template'].map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <div className="h-1 w-1 rounded-full bg-indigo-400" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">₹499</p>
                      <p className="text-xs text-zinc-500">/month</p>
                    </div>
                  </div>
                  <Button className="mt-4 w-full" variant="outline">
                    Upgrade to Pro
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Invoice Settings */}
          <TabsContent value="invoice">
            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <h2 className="text-base font-semibold text-foreground">Invoice Settings</h2>

              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Document Prefixes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Sale Invoice</Label>
                    <Input value={prefixSale} onChange={(e) => setPrefixSale(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Purchase / Bill</Label>
                    <Input value={prefixPurchase} onChange={(e) => setPrefixPurchase(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estimate</Label>
                    <Input value={prefixEstimate} onChange={(e) => setPrefixEstimate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sale Order</Label>
                    <Input value={prefixSaleOrder} onChange={(e) => setPrefixSaleOrder(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Proforma Invoice</Label>
                    <Input value={prefixProforma} onChange={(e) => setPrefixProforma(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Credit Note</Label>
                    <Input value={prefixCreditNote} onChange={(e) => setPrefixCreditNote(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Delivery Challan</Label>
                    <Input value={prefixChallan} onChange={(e) => setPrefixChallan(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Receipt</Label>
                    <Input value={prefixReceipt} onChange={(e) => setPrefixReceipt(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expense</Label>
                    <Input value={prefixExpense} onChange={(e) => setPrefixExpense(e.target.value)} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Numbering Format</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="auto-generate" checked={autoGenerateNumbers} onChange={(e) => setAutoGenerateNumbers(e.target.checked)} className="rounded border-zinc-700 text-primary" />
                      <Label htmlFor="auto-generate">Auto Generate Document Numbers</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="fy-reset" checked={enableFyNumberReset} onChange={(e) => setEnableFyNumberReset(e.target.checked)} className="rounded border-zinc-700 text-primary" />
                      <Label htmlFor="fy-reset">Reset Number at start of Financial Year</Label>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Starting Number</Label>
                      <Input type="number" min="1" value={invoiceStartNumber} onChange={(e) => setInvoiceStartNumber(parseInt(e.target.value) || 1)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Number Format</Label>
                      <select value={numberFormat} onChange={(e) => setNumberFormat(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="PREFIX-1 (Simple)">PREFIX-1 (Simple)</option>
                        <option value="PREFIX/FY/1 (With Financial Year)">PREFIX/FY/1 (With Financial Year)</option>
                        <option value="PREFIX/MM/1 (With Month)">PREFIX/MM/1 (With Month)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Round Off Settings</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="enable-round-off" checked={enableRoundOff} onChange={(e) => setEnableRoundOff(e.target.checked)} className="rounded border-zinc-700 text-primary" />
                    <Label htmlFor="enable-round-off">Enable Round Off</Label>
                  </div>
                  {enableRoundOff && (
                    <select value={roundOffType} onChange={(e) => setRoundOffType(e.target.value)} className="flex h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="Round to Nearest">Round to Nearest</option>
                      <option value="Round Up">Round Up</option>
                      <option value="Round Down">Round Down</option>
                    </select>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Header, Footer & Terms</h3>
                <div className="space-y-3">
                  <Label>Invoice Header Text</Label>
                  <Input value={invoiceHeader} onChange={(e) => setInvoiceHeader(e.target.value)} placeholder="e.g. Thank you for shopping with us!" />
                </div>
                <div className="space-y-3">
                  <Label>Invoice Footer Text</Label>
                  <Input value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} placeholder="e.g. Goods once sold will not be exchanged." />
                </div>
                <div className="space-y-3">
                  <Label>Default Terms & Conditions</Label>
                  <textarea value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value)} placeholder="Thank you for your business!" rows={3} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Bank Details (for invoice footer)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Bank Name</Label>
                    <Input placeholder="e.g. SBI" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Account Number</Label>
                    <Input placeholder="1234567890" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">IFSC Code</Label>
                    <Input placeholder="SBIN0001234" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} className="uppercase" />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div>
                  <Label className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Payment Defaults & Terms</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Configure default payment modes and credit periods for invoices</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Default Payment Mode</Label>
                    <select
                      value={defaultPaymentMode}
                      onChange={(e) => setDefaultPaymentMode(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring capitalize"
                    >
                      {['cash', 'card', 'upi', 'bank_transfer', 'cheque'].map((mode) => (
                        <option key={mode} value={mode}>{mode.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Due Terms</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={defaultPaymentTerms}
                        onChange={(e) => setDefaultPaymentTerms(parseInt(e.target.value) || 0)}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Due Reminder</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={paymentReminderDays}
                        onChange={(e) => setPaymentReminderDays(parseInt(e.target.value) || 1)}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">days before</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div>
                  <Label className="flex items-center gap-2"><Smartphone className="h-4 w-4" />UPI / Digital Payment</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Add your UPI ID to display a QR code on invoices</p>
                </div>
                <div className="space-y-1.5">
                  <Label>UPI ID</Label>
                  <Input placeholder="yourshop@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} className="max-w-xs" />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div>
                  <Label className="flex items-center gap-2"><PenLine className="h-4 w-4" />Signature</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Add an authorized signature image to appear on invoices</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-40 rounded-lg border border-dashed border-border bg-secondary/20 overflow-hidden flex items-center justify-center">
                    {signaturePreview ? (
                      <img src={signaturePreview} alt="Signature" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No signature</span>
                    )}
                  </div>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleSignatureChange} />
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                      <Upload className="h-4 w-4" />
                      {signatureFile ? 'Change Signature' : 'Upload Signature'}
                    </div>
                  </label>
                </div>
                <div className="flex items-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="show-logo"
                      checked={showLogoOnDocs}
                      onChange={(e) => setShowLogoOnDocs(e.target.checked)}
                      className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                    />
                    <Label htmlFor="show-logo">Show Logo on Documents</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="show-signature"
                      checked={showSignatureOnDocs}
                      onChange={(e) => setShowSignatureOnDocs(e.target.checked)}
                      className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                    />
                    <Label htmlFor="show-signature">Show Signature on Documents</Label>
                  </div>
                </div>
              </div>

              {/* Live Invoice Footer Preview */}
              <LiveInvoiceFooterPreview
                bankName={bankName}
                bankAccount={bankAccount}
                bankIfsc={bankIfsc}
                upiId={upiId}
                signatureUrl={signaturePreview}
                showSignature={showSignatureOnDocs}
              />

              <Button onClick={() => saveInvoiceSettingsMutation.mutate()} disabled={saveInvoiceSettingsMutation.isPending}>
                {saveInvoiceSettingsMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Invoice Settings'}
              </Button>
            </div>
          </TabsContent>

          {/* Units */}
          <TabsContent value="units">
            <UnitsSettingsPanel />
          </TabsContent>

          {/* Regional Settings */}
          <TabsContent value="regional">
            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <h2 className="text-base font-semibold text-foreground">Regional Settings</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label>Financial Year Start</Label>
                  <select
                    value={financialYearStart}
                    onChange={(e) => setFinancialYearStart(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="April - March (Indian FY)">April - March (Indian FY)</option>
                    <option value="January - December (Calendar Year)">January - December (Calendar Year)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Currency Symbol</Label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="₹">₹ — Indian Rupee</option>
                    <option value="$">$ — US Dollar</option>
                    <option value="€">€ — Euro</option>
                    <option value="£">£ — British Pound</option>
                    <option value="AED">AED — UAE Dirham</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date Format</Label>
                  <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="DD/MM/YYYY">DD/MM/YYYY (India)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Timezone</Label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT +8:00)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>

              <Button onClick={() => saveRegionalMutation.mutate()} disabled={saveRegionalMutation.isPending}>
                {saveRegionalMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Regional Settings'}
              </Button>
            </div>
          </TabsContent>

          {/* Routine Works */}
          <TabsContent value="routine">
            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Daily Routine Works</h2>
                  <p className="text-sm text-muted-foreground mt-1">Manage monthly recurring tasks and expenses.</p>
                </div>
                <Button onClick={() => {
                  setEditingTemplate(null)
                  templateForm.reset({
                    name: '',
                    category: 'rent',
                    due_day: 1,
                    default_amount: 0,
                    is_active: true,
                  })
                  setTemplateDialogOpen(true)
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Template
                </Button>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Due Day</TableHead>
                      <TableHead>Default Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templatesLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading templates...
                        </TableCell>
                      </TableRow>
                    ) : recurringTemplates?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                          No recurring templates configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recurringTemplates?.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="capitalize">{t.category}</TableCell>
                          <TableCell>Day {t.due_day}</TableCell>
                          <TableCell>{currency}{t.default_amount}</TableCell>
                          <TableCell>
                            <Badge variant={t.is_active ? 'default' : 'secondary'}>
                              {t.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingTemplate(t)
                                templateForm.reset({
                                  name: t.name,
                                  category: t.category,
                                  due_day: t.due_day,
                                  default_amount: t.default_amount,
                                  is_active: t.is_active,
                                })
                                setTemplateDialogOpen(true)
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this template?')) {
                                  deleteTemplateMutation.mutate(t.id)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* Backup & Export */}
          <TabsContent value="backup">
            <div className="rounded-lg border border-border bg-card p-6 space-y-5">
              <h2 className="text-base font-semibold text-foreground">Backup & Data Export</h2>
              <p className="text-sm text-muted-foreground">
                Download all your business data as a CSV file. This includes products, customers, sales, purchases, and expenses.
              </p>

              <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Download className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Full Data Export</p>
                    <p className="text-xs text-muted-foreground">Products, Customers, Sales, Purchases, Expenses — single CSV file</p>
                  </div>
                </div>
                <Button onClick={exportAllData} disabled={exportLoading} className="w-full sm:w-auto">
                  {exportLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Exporting...</> : <><Download className="h-4 w-4" /> Download Backup</>}
                </Button>
              </div>

              <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Danger Zone</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Deleting your account or organization cannot be undone. Please export your data first.
                      Contact support to delete your account.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tax & GST Settings */}
          <TabsContent value="tax">
            <div className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Tax &amp; GST Settings</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Configure how taxes are applied across your invoices and billing.</p>
              </div>

              {/* Tax Type */}
              <div className="space-y-3">
                <Label>Tax Calculation Method</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setTaxInclusive(false)}
                    className={cn(
                      'flex-1 rounded-lg border-2 p-4 text-left transition-all',
                      !taxInclusive ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80'
                    )}
                  >
                    <p className="text-sm font-semibold text-foreground">GST Exclusive</p>
                    <p className="text-xs text-muted-foreground mt-1">Tax is added on top of the product price. ₹100 + 18% GST = ₹118</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxInclusive(true)}
                    className={cn(
                      'flex-1 rounded-lg border-2 p-4 text-left transition-all',
                      taxInclusive ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80'
                    )}
                  >
                    <p className="text-sm font-semibold text-foreground">GST Inclusive</p>
                    <p className="text-xs text-muted-foreground mt-1">Tax is included in the product price. ₹118 includes 18% GST</p>
                  </button>
                </div>
              </div>

              <Separator />

              {/* Default GST Rate */}
              <div className="space-y-3">
                <Label>Default GST Rate</Label>
                <p className="text-xs text-muted-foreground">Applied when adding new products without a specific GST rate</p>
                <div className="flex gap-2 flex-wrap">
                  {GST_RATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setDefaultGstRate(rate)}
                      className={cn(
                        'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all',
                        defaultGstRate === rate ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                      )}
                    >
                      {rate}%
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Live Interactive Tax Calculator */}
              <LiveTaxCalculator
                taxInclusive={taxInclusive}
                rate={defaultGstRate}
                currency={currency}
              />

              {/* GST Toggles */}
              <div className="space-y-4">
                <Label>GST Configuration</Label>
                {[
                  { id: 'composition-scheme', label: 'Composition Scheme', desc: 'Registered under GST Composition Scheme (lower flat rate, no ITC)', value: compositionScheme, setter: setCompositionScheme },
                  { id: 'inter-state', label: 'Enable Inter-State Transactions (IGST)', desc: 'Apply IGST for sales to customers in a different state', value: interStateTax, setter: setInterStateTax },
                  { id: 'show-hsn', label: 'Show HSN/SAC Code on Invoice', desc: 'Print HSN/SAC code for each line item on the invoice', value: showHsnOnInvoice, setter: setShowHsnOnInvoice },
                  { id: 'rcm', label: 'Reverse Charge Mechanism (RCM)', desc: 'Enable RCM for applicable purchases from unregistered dealers', value: rcmEnabled, setter: setRcmEnabled },
                ].map(({ id, label, desc, value, setter }) => (
                  <div key={id} className="flex items-start justify-between gap-4 py-3 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={value}
                      onClick={() => setter(!value)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        value ? 'bg-primary' : 'bg-zinc-600'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', value ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>
                ))}
              </div>

              <Button onClick={() => saveTaxGstMutation.mutate()} disabled={saveTaxGstMutation.isPending}>
                {saveTaxGstMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Tax & GST Settings'}
              </Button>
            </div>
          </TabsContent>

          {/* Inventory Settings */}
          <TabsContent value="inventory" className="mt-0">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">Inventory & Product Settings</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Configure stock tracking and product management behavior</p>
              </div>
              <Button onClick={() => saveInventoryMutation.mutate()} disabled={saveInventoryMutation.isPending} size="sm">
                {saveInventoryMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Changes'}
              </Button>
            </div>

            <div className="space-y-6 max-w-4xl pb-10">
              
              {/* Item Uniqueness */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border bg-secondary/30">
                  <h3 className="font-semibold text-sm text-foreground">Item Uniqueness</h3>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Allow Duplicate Item Names</Label>
                      <p className="text-xs text-muted-foreground">If enabled, duplicate item names are allowed and SKU becomes mandatory and used as the unique identifier.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={allowDuplicateItemNames}
                      onClick={() => setAllowDuplicateItemNames(!allowDuplicateItemNames)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        allowDuplicateItemNames ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', allowDuplicateItemNames ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Stock Tracking */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border bg-secondary/30">
                  <h3 className="font-semibold text-sm text-foreground">Stock Tracking</h3>
                </div>
                <div className="p-5 space-y-6">
                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Enable Stock Tracking</Label>
                      <p className="text-xs text-muted-foreground">Track inventory levels for products</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enableStockTracking}
                      onClick={() => setEnableStockTracking(!enableStockTracking)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        enableStockTracking ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', enableStockTracking ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Allow Negative Stock</Label>
                      <p className="text-xs text-muted-foreground">Allow sales even when stock is insufficient</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={allowNegativeStock}
                      onClick={() => setAllowNegativeStock(!allowNegativeStock)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        allowNegativeStock ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', allowNegativeStock ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Show Out of Stock Items in Billing</Label>
                      <p className="text-xs text-muted-foreground">Display items with zero inventory in the POS billing grid</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showOutOfStockInBilling}
                      onClick={() => setShowOutOfStockInBilling(!showOutOfStockInBilling)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        showOutOfStockInBilling ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', showOutOfStockInBilling ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Low Stock Alert Threshold</Label>
                      <p className="text-xs text-muted-foreground">Show alert when product stock falls below this level</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="0"
                        value={lowStockThreshold}
                        onChange={(e) => setLowStockThreshold(parseInt(e.target.value) || 0)}
                        className="w-24 text-center"
                      />
                      <span className="text-sm text-muted-foreground">units</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expiry Tracking */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border bg-secondary/30">
                  <h3 className="font-semibold text-sm text-foreground">Expiry Tracking</h3>
                </div>
                <div className="p-5 space-y-6">
                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Enable Expiry Date Field</Label>
                      <p className="text-xs text-muted-foreground">Show an Expiry Date field on products.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enableExpiryTracking}
                      onClick={() => setEnableExpiryTracking(!enableExpiryTracking)}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        enableExpiryTracking ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', enableExpiryTracking ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Expiry Alert Period</Label>
                      <p className="text-xs text-muted-foreground">Show an alert when a product is within this many days of its expiry date.</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Input
                        type="number"
                        min="0"
                        value={expiryAlertPeriod}
                        onChange={(e) => setExpiryAlertPeriod(parseInt(e.target.value) || 0)}
                        className="w-20 text-center"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">days before expiry</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Hide from Online Store Before Expiry</Label>
                      <p className="text-xs text-muted-foreground">Products whose remaining stock all expires within this window are automatically hidden from the online store.</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Input
                        type="number"
                        min="0"
                        value={hideFromOnlineStoreBeforeExpiry}
                        onChange={(e) => setHideFromOnlineStoreBeforeExpiry(parseInt(e.target.value) || 0)}
                        className="w-20 text-center"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">days before expiry</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Behavior Info */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border bg-secondary/30">
                  <h3 className="font-semibold text-sm text-foreground">Stock Behavior Info</h3>
                </div>
                <div className="p-5">
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li><span className="font-medium text-foreground">Sale Invoice:</span> Reduces stock automatically</li>
                    <li><span className="font-medium text-foreground">Purchase Bill:</span> Increases stock automatically</li>
                    <li><span className="font-medium text-foreground">Credit Note (with stock):</span> Restores stock on return</li>
                    <li><span className="font-medium text-foreground">Estimates/Proforma:</span> No stock impact until converted</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Barcode Settings */}
          <TabsContent value="barcode">
            <div className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Barcode Settings</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Configure how barcodes are generated and printed for your products.</p>
              </div>

              <div className="space-y-3">
                <Label>Barcode Type</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 'code128', label: 'CODE 128', desc: 'Most common, alphanumeric' },
                    { value: 'ean13', label: 'EAN-13', desc: 'Retail standard, 13 digits' },
                    { value: 'qr', label: 'QR Code', desc: 'Can store more data' },
                    { value: 'code39', label: 'CODE 39', desc: 'Industrial / warehouse' },
                  ].map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setBarcodeType(type.value)}
                      className={cn(
                        'rounded-lg border-2 p-3 text-left transition-all',
                        barcodeType === type.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">{type.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{type.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Label Size</Label>
                <div className="flex gap-2 flex-wrap">
                  {['3x2cm', '4x2.5cm', '5x3cm', '6x4cm', 'A4 Sheet'].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setBarcodeLabelSize(size)}
                      className={cn(
                        'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all',
                        barcodeLabelSize === size ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Label Design Template</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { value: 'standard', label: 'Standard Retail', desc: 'Classic rectangular with barcode/QR & MRP' },
                    { value: 'saravana_stores', label: 'Department Store', desc: 'Saravana Stores style with vertical brand ribbon' },
                    { value: 'circular_bottle', label: 'Round Jar / Bottle', desc: 'Circular die-cut sticker for jars & bottles' },
                    { value: 'compact_jewelry', label: 'Compact Tag', desc: 'Slim tag for jewelry, optics & cosmetics' },
                  ].map((tpl) => (
                    <button
                      key={tpl.value}
                      type="button"
                      onClick={() => setBarcodeTemplateStyle(tpl.value as any)}
                      className={cn(
                        'rounded-xl border-2 p-3.5 text-left transition-all cursor-pointer',
                        barcodeTemplateStyle === tpl.value
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border hover:border-primary/50 bg-card'
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">{tpl.label}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">{tpl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Live Barcode Format Preview */}
              <LiveBarcodePreview
                type={barcodeType}
                labelSize={barcodeLabelSize}
                templateStyle={barcodeTemplateStyle}
                shopName={shopForm.watch('name')}
                shopAddress={[shopForm.watch('address'), shopForm.watch('city')].filter(Boolean).join(', ')}
              />

              <div className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-Print Barcode on Purchase</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Automatically queue barcode printing when a purchase invoice is saved</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoPrintBarcodeOnPurchase}
                  onClick={() => setAutoPrintBarcodeOnPurchase(!autoPrintBarcodeOnPurchase)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                    autoPrintBarcodeOnPurchase ? 'bg-primary' : 'bg-zinc-600'
                  )}
                >
                  <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', autoPrintBarcodeOnPurchase ? 'translate-x-4' : 'translate-x-0')} />
                </button>
              </div>

              <Button onClick={() => saveBarcodeMutation.mutate()} disabled={saveBarcodeMutation.isPending}>
                {saveBarcodeMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Barcode Settings'}
              </Button>
            </div>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="mt-0">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Bell className="h-6 w-6 text-primary p-1 bg-primary/10 rounded-full" /> Notification Settings</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Configure in-app notification preferences</p>
              </div>
              <Button onClick={() => saveNotificationsMutation.mutate()} disabled={saveNotificationsMutation.isPending} size="sm">
                {saveNotificationsMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Changes'}
              </Button>
            </div>

            <div className="space-y-6 max-w-4xl pb-10">
              
              {/* In-App Notification Types */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border bg-secondary/30">
                  <h3 className="font-semibold text-sm text-foreground">In-App Notification Types</h3>
                </div>
                <div className="p-5 space-y-6">
                  
                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Low Stock Alerts</Label>
                      <p className="text-xs text-muted-foreground">Notify when product stock falls below threshold</p>
                    </div>
                    <button type="button" role="switch" aria-checked={notifyLowStock} onClick={() => setNotifyLowStock(!notifyLowStock)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', notifyLowStock ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', notifyLowStock ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Low Stock Threshold</Label>
                      <p className="text-xs text-muted-foreground">Alert when stock falls to or below this number</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input type="number" min="0" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(parseInt(e.target.value) || 0)} className="w-24 text-center" />
                      <span className="text-sm text-muted-foreground">units</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Expiry Alerts</Label>
                      <p className="text-xs text-muted-foreground">Notify when products are expired or nearing their expiry date</p>
                    </div>
                    <button type="button" role="switch" aria-checked={notifyExpiry} onClick={() => setNotifyExpiry(!notifyExpiry)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', notifyExpiry ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', notifyExpiry ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Invoice Due Alerts</Label>
                      <p className="text-xs text-muted-foreground">Notify when invoices are overdue</p>
                    </div>
                    <button type="button" role="switch" aria-checked={notifyInvoiceDue} onClick={() => setNotifyInvoiceDue(!notifyInvoiceDue)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', notifyInvoiceDue ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', notifyInvoiceDue ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Payment Received</Label>
                      <p className="text-xs text-muted-foreground">Notify when payments are recorded</p>
                    </div>
                    <button type="button" role="switch" aria-checked={notifyPaymentReceived} onClick={() => setNotifyPaymentReceived(!notifyPaymentReceived)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', notifyPaymentReceived ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', notifyPaymentReceived ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Trial Expiry Warning</Label>
                      <p className="text-xs text-muted-foreground">Notify when trial is about to expire</p>
                    </div>
                    <button type="button" role="switch" aria-checked={notifyTrialExpiry} onClick={() => setNotifyTrialExpiry(!notifyTrialExpiry)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', notifyTrialExpiry ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', notifyTrialExpiry ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Daily Summary</Label>
                      <p className="text-xs text-muted-foreground">Show a daily summary notification</p>
                    </div>
                    <button type="button" role="switch" aria-checked={notifyDailySummary} onClick={() => setNotifyDailySummary(!notifyDailySummary)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', notifyDailySummary ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', notifyDailySummary ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment Reminders */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border bg-secondary/30">
                  <h3 className="font-semibold text-sm text-foreground">Payment Reminders</h3>
                </div>
                <div className="p-5 space-y-6">
                  
                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Payment Reminders</Label>
                      <p className="text-xs text-muted-foreground">Send reminders for pending payments</p>
                    </div>
                    <button type="button" role="switch" aria-checked={paymentReminders} onClick={() => setPaymentReminders(!paymentReminders)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', paymentReminders ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', paymentReminders ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Due Date Reminders</Label>
                      <p className="text-xs text-muted-foreground">Alert before invoice due dates</p>
                    </div>
                    <button type="button" role="switch" aria-checked={dueDateReminders} onClick={() => setDueDateReminders(!dueDateReminders)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200', dueDateReminders ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700')}>
                      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', dueDateReminders ? 'translate-x-4' : 'translate-x-0')} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Remind Before Due</Label>
                      <div className="flex items-center gap-3">
                        <Input type="number" min="0" value={remindBeforeDue} onChange={(e) => setRemindBeforeDue(parseInt(e.target.value) || 0)} className="w-24 text-center" />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Remind After Due</Label>
                      <div className="flex items-center gap-3">
                        <Input type="number" min="0" value={remindAfterDue} onChange={(e) => setRemindAfterDue(parseInt(e.target.value) || 0)} className="w-24 text-center" />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </TabsContent>
          {/* Print & PDF Layout Settings */}
          <TabsContent value="print" className="mt-0">
            <div className={cn("grid gap-4 xl:gap-6 items-start h-full pb-10", showLivePreviewPanel ? "lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_460px]" : "grid-cols-1")}>
              
              {/* Left Column - Scrollable Settings */}
              <div className="space-y-4 xl:space-y-6 lg:overflow-y-auto lg:h-[calc(100vh-120px)] pr-2 pb-24 custom-scrollbar">
                
                {/* Header */}
                <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border sticky top-0 z-10 shadow-sm backdrop-blur-md bg-card/90">
                  <div>
                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Printer className="h-5 w-5 text-primary" /> Print Settings</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Configure printing and PDF layout</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowLivePreviewPanel(!showLivePreviewPanel)} title="Toggle Live Preview">
                      {showLivePreviewPanel ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
                      {showLivePreviewPanel ? 'Hide Preview' : 'Show Preview'}
                    </Button>
                    <Button onClick={() => savePrintMutation.mutate()} disabled={savePrintMutation.isPending} size="sm">
                      {savePrintMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Settings'}
                    </Button>
                  </div>
                </div>

                {/* 1. Colors & Typography */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-secondary/30">
                    <h3 className="font-semibold text-sm text-foreground">Colors & Typography</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Font Family</Label>
                        <Select value={printFontFamily} onValueChange={setPrintFontFamily}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Inter">Inter (Modern)</SelectItem>
                            <SelectItem value="Roboto">Roboto (Standard)</SelectItem>
                            <SelectItem value="Courier">Courier (Monospace)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Font Size</Label>
                        <Select value={printFontSize} onValueChange={setPrintFontSize}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Small">Small</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="Large">Large</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Helper function for Switch Grids */}
                {(() => {
                  const renderSwitches = (title: string, items: { label: string, value: boolean, setter: (v: boolean) => void }[]) => (
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-border bg-secondary/30">
                        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
                      </div>
                      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-secondary/10 hover:bg-secondary/20 transition-colors">
                            <span className="text-xs font-medium text-foreground">{item.label}</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={item.value}
                              onClick={() => item.setter(!item.value)}
                              className={cn(
                                'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                                item.value ? 'bg-primary' : 'bg-zinc-600'
                              )}
                            >
                              <span className={cn('pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200', item.value ? 'translate-x-3' : 'translate-x-0')} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )

                  return (
                    <>
                      {/* 2. Business Information */}
                      {renderSwitches('Business Information', [
                        { label: 'Business Logo', value: printShowLogo, setter: setPrintShowLogo },
                        { label: 'Business Name', value: printShowShopName, setter: setPrintShowShopName },
                        { label: 'Business Address', value: printShowAddress, setter: setPrintShowAddress },
                        { label: 'Contact Details', value: printShowContact, setter: setPrintShowContact },
                        { label: 'GST Number', value: printShowGstin, setter: setPrintShowGstin },
                        { label: 'Email / Website', value: printShowEmailWebsite, setter: setPrintShowEmailWebsite },
                      ])}

                      {/* 3. Customer / Party Details */}
                      {renderSwitches('Customer / Party Details', [
                        { label: 'Show Entire Party Block', value: printShowPartyDetails, setter: setPrintShowPartyDetails },
                        { label: 'Billing Address', value: printShowCustomerBillingAddress, setter: setPrintShowCustomerBillingAddress },
                        { label: 'Shipping Address', value: printShowCustomerShippingAddress, setter: setPrintShowCustomerShippingAddress },
                        { label: 'Party PAN Number', value: printShowCustomerPan, setter: setPrintShowCustomerPan },
                        { label: 'Party Phone Number', value: printShowCustomerPhone, setter: setPrintShowCustomerPhone },
                      ])}

                      {/* 4. Document Details */}
                      {renderSwitches('Document Details', [
                        { label: 'Invoice Number', value: printShowDocumentNumber, setter: setPrintShowDocumentNumber },
                        { label: 'Invoice Date', value: printShowDocumentDate, setter: setPrintShowDocumentDate },
                        { label: 'Due Date', value: printShowDueDate, setter: setPrintShowDueDate },
                        { label: 'Place of Supply', value: printShowPlaceOfSupply, setter: setPrintShowPlaceOfSupply },
                        { label: 'Delivery Note', value: printShowDeliveryNote, setter: setPrintShowDeliveryNote },
                        { label: 'Payment Mode', value: printShowPaymentMode, setter: setPrintShowPaymentMode },
                      ])}

                      {/* 5. Item Table Columns */}
                      {renderSwitches('Item Table Columns', [
                        { label: 'Serial No (S.No)', value: printShowColumnSno, setter: setPrintShowColumnSno },
                        { label: 'HSN / SAC Code', value: printShowColumnHsn, setter: setPrintShowColumnHsn },
                        { label: 'Item Name', value: printShowColumnItemName, setter: setPrintShowColumnItemName },
                        { label: 'MRP Column', value: printShowColumnMrp, setter: setPrintShowColumnMrp },
                        { label: 'Quantity', value: printShowColumnQty, setter: setPrintShowColumnQty },
                        { label: 'Unit', value: printShowColumnUnit, setter: setPrintShowColumnUnit },
                        { label: 'Rate', value: printShowColumnRate, setter: setPrintShowColumnRate },
                        { label: 'Discount %', value: printShowColumnDiscount, setter: setPrintShowColumnDiscount },
                        { label: 'GST Tax Rate %', value: printShowColumnTaxRate, setter: setPrintShowColumnTaxRate },
                        { label: 'Taxable Value', value: printShowColumnTaxableValue, setter: setPrintShowColumnTaxableValue },
                        { label: 'Tax Amount', value: printShowColumnTaxAmount, setter: setPrintShowColumnTaxAmount },
                        { label: 'Item Total', value: printShowColumnItemTotal, setter: setPrintShowColumnItemTotal },
                      ])}

                      {/* 6. Tax Display Settings */}
                      {renderSwitches('Tax Display Settings', [
                        { label: 'Show CGST/SGST/IGST', value: printShowCgstSgstIgst, setter: setPrintShowCgstSgstIgst },
                        { label: 'Tax Summary Table', value: printShowTaxSummary, setter: setPrintShowTaxSummary },
                      ])}

                      {/* 7. Total Calculation Blocks */}
                      {renderSwitches('Total Calculation Blocks', [
                        { label: 'Sub Total', value: printShowBlockSubtotal, setter: setPrintShowBlockSubtotal },
                        { label: 'Discount', value: printShowBlockDiscount, setter: setPrintShowBlockDiscount },
                        { label: 'Tax Amount', value: printShowBlockTaxAmount, setter: setPrintShowBlockTaxAmount },
                        { label: 'Rounding', value: printShowBlockRounding, setter: setPrintShowBlockRounding },
                        { label: 'Round Off', value: printShowBlockRoundOff, setter: setPrintShowBlockRoundOff },
                        { label: 'Grand Total', value: printShowBlockGrandTotal, setter: setPrintShowBlockGrandTotal },
                        { label: 'Received Amount', value: printShowBlockReceivedAmount, setter: setPrintShowBlockReceivedAmount },
                        { label: 'Balance Due', value: printShowBlockBalanceDue, setter: setPrintShowBlockBalanceDue },
                        { label: 'Change Returned', value: printShowBlockChangeReturned, setter: setPrintShowBlockChangeReturned },
                      ])}

                      {/* 8. Additional Sections */}
                      <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-5 py-3 border-b border-border bg-secondary/30">
                          <h3 className="font-semibold text-sm text-foreground">Additional Sections</h3>
                        </div>
                        <div className="p-5 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                              { label: 'Terms & Conditions', value: printShowTerms, setter: setPrintShowTerms },
                              { label: 'Notes', value: printShowNotes, setter: setPrintShowNotes },
                              { label: 'Bank Details', value: printShowBankDetails, setter: setPrintShowBankDetails },
                              { label: 'Signature Outline', value: printShowSignatureOutline, setter: setPrintShowSignatureOutline },
                              { label: 'Authorized Signatory', value: printShowSignature, setter: setPrintShowSignature },
                              { label: 'UPI QR Code', value: printShowUpiQr, setter: setPrintShowUpiQr },
                            ].map((item, i) => (
                              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-secondary/10 hover:bg-secondary/20 transition-colors">
                                <span className="text-xs font-medium text-foreground">{item.label}</span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={item.value}
                                  onClick={() => item.setter(!item.value)}
                                  className={cn(
                                    'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                                    item.value ? 'bg-primary' : 'bg-zinc-600'
                                  )}
                                >
                                  <span className={cn('pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200', item.value ? 'translate-x-3' : 'translate-x-0')} />
                                </button>
                              </div>
                            ))}
                          </div>
                          
                          
                        </div>
                      </div>
                    </>
                  )
                })()}

                {/* 10. Paper Size Format */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-secondary/30">
                    <h3 className="font-semibold text-sm text-foreground">Paper Size</h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { id: 'a4', title: 'A4 Standard', desc: 'Full-sheet Laser' },
                        { id: 'a5', title: 'A5 Compact', desc: 'Half-sheet Bill' },
                        { id: 'thermal_3inch', title: 'Thermal 3"', desc: '80mm POS Roll' },
                        { id: 'thermal_2inch', title: 'Thermal 2"', desc: '58mm Handheld' },
                      ].map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setPrintPaperSize(item.id as any)}
                          className={cn(
                            'cursor-pointer rounded-xl border p-3 text-center transition-all',
                            printPaperSize === item.id
                              ? 'border-primary bg-primary/10 shadow-sm'
                              : 'border-border bg-card hover:bg-secondary/40'
                          )}
                        >
                          <p className={cn('text-sm font-semibold', printPaperSize === item.id ? 'text-primary' : 'text-foreground')}>{item.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column - Sticky Live Preview */}
              {showLivePreviewPanel && (
                <div className="hidden lg:block sticky top-0 pt-0 h-[calc(100vh-120px)]">
                  <div className="bg-card border border-border rounded-xl h-full flex flex-col shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/20">
                      <span className="text-sm font-semibold flex items-center gap-2"><Printer className="h-4 w-4 text-primary"/> Live Document Preview</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono bg-background">
                          {printPaperSize.replace('_', ' ')}
                        </Badge>
                        <button type="button" onClick={() => setShowLivePreviewPanel(false)} className="p-1 hover:bg-secondary rounded-md transition-colors">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                   
                   {/* Preview Container */}
                   <div className="flex-1 overflow-y-auto bg-zinc-900 p-4 flex justify-center custom-scrollbar">
                     <LivePrintBillPreview
                        paperSize={printPaperSize}
                        showLogo={printShowLogo}
                        showShopName={printShowShopName}
                        showAddress={printShowAddress}
                        showContact={printShowContact}
                        showGstin={printShowGstin}
                        showPan={printShowPan}
                        logoUrl={logoPreview}
                        shopName={shopForm.watch('name')}
                        address={[
                          shopForm.watch('address'),
                          shopForm.watch('city'),
                          shopForm.watch('state_code') ? INDIAN_STATES.find((s) => s.code === shopForm.watch('state_code'))?.name || shopForm.watch('state_code') : '',
                          shopForm.watch('pincode') ? `PIN: ${shopForm.watch('pincode')}` : '',
                        ].filter(Boolean).join(', ')}
                        phone={shopForm.watch('phone')}
                        email={shopForm.watch('email')}
                        gstin={shopForm.watch('gstin')}
                        pan={shopForm.watch('pan')}
                        showColumnSno={printShowColumnSno}
                        showColumnHsn={printShowColumnHsn}
                        showColumnMrp={printShowColumnMrp}
                        showColumnUnit={printShowColumnUnit}
                        showColumnDiscount={printShowColumnDiscount}
                        showColumnTaxRate={printShowColumnTaxRate}
                        showBankDetails={printShowBankDetails}
                        bankName={bankName}
                        bankAccount={bankAccount}
                        bankIfsc={bankIfsc}
                        showUpiQr={printShowUpiQr}
                        upiId={upiId}
                        showTerms={printShowTerms}
                        terms={invoiceTerms}
                        showSignature={printShowSignature}
                        signatureUrl={signaturePreview}
                        thankYouNote={invoiceHeader}
                        notes={invoiceFooter}
                        currency={currency}

                        // We will need to pass the new props here later once we update LivePrintBillPreview definition!
                        showEmailWebsite={printShowEmailWebsite}
                        showCustomerBillingAddress={printShowCustomerBillingAddress}
                        showCustomerShippingAddress={printShowCustomerShippingAddress}
                        showCustomerPan={printShowCustomerPan}
                        showCustomerPhone={printShowCustomerPhone}
                        showDocumentNumber={printShowDocumentNumber}
                        showDocumentDate={printShowDocumentDate}
                        showDueDate={printShowDueDate}
                        showPlaceOfSupply={printShowPlaceOfSupply}
                        showDeliveryNote={printShowDeliveryNote}
                        showPaymentMode={printShowPaymentMode}
                        showColumnItemName={printShowColumnItemName}
                        showColumnQty={printShowColumnQty}
                        showColumnRate={printShowColumnRate}
                        showColumnDiscountType={printShowColumnDiscountType}
                        showColumnTaxableValue={printShowColumnTaxableValue}
                        showColumnTaxAmount={printShowColumnTaxAmount}
                        showColumnItemTotal={printShowColumnItemTotal}
                        showCgstSgstIgst={printShowCgstSgstIgst}
                        showTaxSummary={printShowTaxSummary}
                        showBlockSubtotal={printShowBlockSubtotal}
                        showBlockDiscount={printShowBlockDiscount}
                        showBlockTaxAmount={printShowBlockTaxAmount}
                        showBlockRounding={printShowBlockRounding}
                        showBlockRoundOff={printShowBlockRoundOff}
                        showBlockGrandTotal={printShowBlockGrandTotal}
                        showBlockReceivedAmount={printShowBlockReceivedAmount}
                        showBlockBalanceDue={printShowBlockBalanceDue}
                        showBlockChangeReturned={printShowBlockChangeReturned}
                        showNotes={printShowNotes}
                        showSignatureOutline={printShowSignatureOutline}
                        showPartyDetails={printShowPartyDetails}
                        fontFamily={printFontFamily}
                        fontSize={printFontSize}
                     />
                   </div>
                 </div>
                </div>
              )}
            </div>
          </TabsContent>


          {/* Custom Fields Settings */}
          <TabsContent value="custom_fields">
            <div className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Custom Fields</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Add extra custom attributes for Products and Services to track unique specifications.</p>
                </div>
                <Button onClick={() => setShowAddFieldDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" /> Add Field
                </Button>
              </div>

              {/* Tabs for Target */}
              <div className="flex gap-2 border-b border-border pb-3">
                <button
                  type="button"
                  onClick={() => setCustomFieldTargetTab('product')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                    customFieldTargetTab === 'product'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary'
                  )}
                >
                  Product Fields ({customFields.filter((f) => f.target === 'product').length})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomFieldTargetTab('service')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                    customFieldTargetTab === 'service'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary'
                  )}
                >
                  Service Fields ({customFields.filter((f) => f.target === 'service').length})
                </button>
              </div>

              {/* List */}
              <div className="space-y-2">
                {customFields.filter((f) => f.target === customFieldTargetTab).length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-border rounded-xl">
                    <p className="text-sm text-muted-foreground">No custom fields defined for {customFieldTargetTab}s.</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddFieldDialog(true)} className="mt-3">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add your first field
                    </Button>
                  </div>
                ) : (
                  customFields
                    .filter((f) => f.target === customFieldTargetTab)
                    .map((field) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card/60 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{field.name}</p>
                            <Badge variant="secondary" className="text-[10px] uppercase font-mono">{field.type}</Badge>
                            {field.required && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                            {field.show_on_invoice && <Badge variant="outline" className="text-[10px]">On Invoice</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">Target: {field.target}</p>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCustomField(field.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </TabsContent>
        </div>

      </Tabs>

      {/* Invite member dialog */}
      <Dialog open={showInviteDialog} onOpenChange={(open) => { setShowInviteDialog(open); if(!open) { setInviteLink(null); inviteForm.reset(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Dashboard User</DialogTitle>
          </DialogHeader>
          {inviteLink ? (
            <div className="space-y-4 text-center py-6">
              <div className="mx-auto w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-xl font-semibold text-white">Invitation Sent!</h3>
              <p className="text-sm text-zinc-400">
                An email has been sent to <br/><span className="text-white font-medium">{(inviteLink as any).email}</span><br/> with a secure link to join the dashboard.
              </p>
              <Button className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowInviteDialog(false)}>Done</Button>
            </div>
          ) : (
            <form
              onSubmit={inviteForm.handleSubmit((v) => inviteMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="invite-emp">Select Employee</Label>
                <select
                  id="invite-emp"
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...inviteForm.register('employee_id')}
                >
                  <option value="" disabled className="bg-zinc-900">-- Choose Employee --</option>
                  {employees?.filter((e: any) => !members?.some((m: any) => m.employee_id === e.id || (m.email && e.email && m.email.toLowerCase() === e.email.toLowerCase()))).map((emp: any) => (
                    <option key={emp.id} value={emp.id} className="bg-zinc-900">{emp.full_name} ({emp.email || 'No email'})</option>
                  ))}
                </select>
                {inviteForm.formState.errors.employee_id && (
                  <p className="text-xs text-red-400">{inviteForm.formState.errors.employee_id.message}</p>
                )}
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Employee Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  readOnly
                  disabled
                  value={employees?.find((e: any) => e.id === inviteForm.watch('employee_id'))?.email || ''}
                  className="bg-zinc-800/50 text-zinc-400"
                  placeholder="Select an employee to view email"
                />
                <p className="text-[10px] text-muted-foreground">Must update in Employees tab if incorrect.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Dashboard Role</Label>
                <select
                  id="invite-role"
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...inviteForm.register('role')}
                >
                  <option value="cashier" className="bg-zinc-900">Cashier — can bill only</option>
                  <option value="manager" className="bg-zinc-900">Manager — can manage products</option>
                  <option value="owner" className="bg-zinc-900">Owner — full access</option>
                </select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full">
                  {inviteMutation.isPending ? 'Sending Email...' : 'Send Dashboard Invite'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Dashboard User</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <span className="font-semibold text-foreground">{memberToDelete?.name}</span> from accessing this shop's dashboard?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMemberMutation.isPending}
              onClick={() => {
                if (memberToDelete?.id) {
                  deleteMemberMutation.mutate(memberToDelete.id, {
                    onSettled: () => setDeleteConfirmOpen(false),
                  })
                }
              }}
            >
              {deleteMemberMutation.isPending ? 'Removing...' : 'Remove User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Field Dialog */}
      <Dialog open={showAddFieldDialog} onOpenChange={setShowAddFieldDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cf-name">Field Label / Name</Label>
              <Input
                id="cf-name"
                placeholder="e.g. Warranty, Color, IMEI"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-target">Applies To</Label>
              <select
                id="cf-target"
                value={newFieldTarget}
                onChange={(e) => setNewFieldTarget(e.target.value as any)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="product">Products</option>
                <option value="service">Services</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-type">Field Data Type</Label>
              <select
                id="cf-type"
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as any)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="text">Text (Single Line)</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="dropdown">Dropdown Options</option>
                <option value="checkbox">Yes / No Checkbox</option>
              </select>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="cf-req"
                  checked={newFieldRequired}
                  onChange={(e) => setNewFieldRequired(e.target.checked)}
                  className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                />
                <Label htmlFor="cf-req" className="text-xs">Required Field</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="cf-inv"
                  checked={newFieldShowOnInvoice}
                  onChange={(e) => setNewFieldShowOnInvoice(e.target.checked)}
                  className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                />
                <Label htmlFor="cf-inv" className="text-xs">Display on Printed Invoice</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddFieldDialog(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleAddCustomField}>
                Create Field
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Routine Template' : 'Add Routine Template'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={templateForm.handleSubmit((v) => saveTemplateMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="temp-name">Task Name</Label>
              <Input
                id="temp-name"
                placeholder="e.g. Shop Rent"
                {...templateForm.register('name')}
              />
              {templateForm.formState.errors.name && (
                <p className="text-xs text-red-400">{templateForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temp-category">Category</Label>
              <select
                id="temp-category"
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                {...templateForm.register('category')}
              >
                <option value="rent">Rent</option>
                <option value="salary">Salary / Payroll</option>
                <option value="utilities">Utilities</option>
                <option value="maintenance">Maintenance</option>
                <option value="other">Other</option>
              </select>
              {templateForm.formState.errors.category && (
                <p className="text-xs text-red-400">{templateForm.formState.errors.category.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="temp-due">Due Day</Label>
                <Input
                  id="temp-due"
                  type="number"
                  min="1"
                  max="31"
                  {...templateForm.register('due_day', { valueAsNumber: true })}
                />
                {templateForm.formState.errors.due_day && (
                  <p className="text-xs text-red-400">{templateForm.formState.errors.due_day.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="temp-amount">Default Amount</Label>
                <Input
                  id="temp-amount"
                  type="number"
                  min="0"
                  {...templateForm.register('default_amount', { valueAsNumber: true })}
                />
                {templateForm.formState.errors.default_amount && (
                  <p className="text-xs text-red-400">{templateForm.formState.errors.default_amount.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="temp-active"
                className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                {...templateForm.register('is_active')}
              />
              <Label htmlFor="temp-active">Active</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveTemplateMutation.isPending}>
                {saveTemplateMutation.isPending ? 'Saving...' : 'Save Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
