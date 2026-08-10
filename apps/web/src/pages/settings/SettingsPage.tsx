import React, { useState } from 'react'
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { applyBrandColor } from '@/lib/brandColor'
import { UnitsSettingsPanel } from '@/components/settings/UnitsSettingsPanel'
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
} from '@/components/ui/dialog'
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
  'Retail Shop',
  'Wholesale',
  'Restaurant / Food',
  'Service Provider',
  'Manufacturing',
  'Pharmacy',
  'Supermarket',
  'Electronics',
  'Clothing & Apparel',
  'Other',
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
  name: z.string().min(1, 'Shop name required'),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .optional()
    .or(z.literal('')),
  state_code: z.string().length(2),
  address: z.string().optional(),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/, 'Invalid phone number').optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN (e.g. ABCDE1234F)').optional().or(z.literal('')),
  business_type: z.string().optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
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
  email: z.string().email('Enter a valid email'),
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

function BusinessCardPreview({
  name,
  gstin,
  pan,
  phone,
  email,
  address,
  stateCode,
  businessType,
  website,
  logoUrl,
  primaryColor,
}: {
  name: string
  gstin?: string
  pan?: string
  phone?: string
  email?: string
  address?: string
  stateCode?: string
  businessType?: string
  website?: string
  logoUrl?: string | null
  primaryColor?: string
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-gradient-to-br from-card to-secondary/30 p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <Store className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground text-base tracking-tight">{name || 'Your Shop Name'}</h3>
              {businessType && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                  {businessType}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                {stateCode ? `State: ${stateCode}` : 'State: TN'}
              </Badge>
              {gstin && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-emerald-400 border-emerald-500/30">
                  GSTIN: {gstin}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="h-3.5 w-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: primaryColor || '#6366f1' }} title="Brand Primary Accent" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
        {phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{phone}</span>
          </div>
        )}
        {email && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{email}</span>
          </div>
        )}
        {pan && (
          <div className="flex items-center gap-1.5 font-mono">
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>PAN: {pan}</span>
          </div>
        )}
        {website && (
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{website}</span>
          </div>
        )}
        {address && (
          <div className="flex items-center gap-1.5 col-span-full">
            <Store className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{address}</span>
          </div>
        )}
      </div>
    </div>
  )
}

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

function LiveBarcodePreview({ type, labelSize }: { type: string; labelSize: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <Barcode className="h-4 w-4 text-primary" /> Format Preview: {type.toUpperCase()}
        </span>
        <Badge variant="outline" className="text-[11px] font-mono">{labelSize}</Badge>
      </div>

      <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-white text-zinc-950 shadow-inner">
        <p className="text-[10px] font-bold tracking-widest uppercase mb-1">BILLSCAPE SAMPLE ITEM</p>

        {type === 'qr' ? (
          <div className="p-2 border-2 border-zinc-900 rounded bg-white my-1">
            <div className="grid grid-cols-5 gap-1 w-16 h-16">
              {Array.from({ length: 25 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-sm',
                    (i % 2 === 0 || i % 7 === 0 || i === 0 || i === 4 || i === 20 || i === 24)
                      ? 'bg-zinc-950'
                      : 'bg-transparent'
                  )}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-center h-12 w-48 gap-[2px] my-1">
            {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 3, 2].map((w, i) => (
              <div
                key={i}
                className="bg-zinc-950 h-full"
                style={{ width: `${w * 1.3}px` }}
              />
            ))}
          </div>
        )}

        <p className="text-[10px] font-mono font-bold tracking-wider mt-1">8901234567890</p>
        <p className="text-[9px] font-medium text-zinc-600">MRP: ₹499.00 (Incl. of all taxes)</p>
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
}: {
  paperSize: string
  showLogo: boolean
  logoUrl?: string | null
  shopName?: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
  pan?: string
  showColumnSno: boolean
  showColumnHsn: boolean
  showColumnMrp: boolean
  showColumnUnit: boolean
  showColumnDiscount: boolean
  showColumnTaxRate: boolean
  showBankDetails: boolean
  bankName?: string
  bankAccount?: string
  bankIfsc?: string
  showUpiQr: boolean
  upiId?: string
  showTerms: boolean
  terms?: string
  showSignature: boolean
  signatureUrl?: string | null
  thankYouNote?: string
  currency: string
}) {
  const isThermal = paperSize.startsWith('thermal')
  const is2Inch = paperSize === 'thermal_2inch'

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <Printer className="h-4 w-4 text-primary" /> Live Document Preview
        </span>
        <Badge variant="outline" className="text-[10px] uppercase font-mono">
          {paperSize.replace('_', ' ')}
        </Badge>
      </div>

      <div className="flex justify-center p-3 bg-zinc-950/80 rounded-xl overflow-x-auto">
        <div
          className={cn(
            'bg-white text-zinc-900 shadow-2xl transition-all duration-300',
            is2Inch
              ? 'w-[260px] p-3 text-[10px] font-mono'
              : isThermal
              ? 'w-[320px] p-4 text-[11px] font-mono'
              : 'w-full max-w-[520px] p-6 text-xs font-sans rounded-sm'
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
              {shopName && <h4 className={cn('font-bold text-zinc-950 uppercase tracking-tight', isThermal ? 'text-xs' : 'text-sm')}>{shopName}</h4>}
              {address && <p className="text-[10px] text-zinc-600 leading-tight">{address}</p>}
              {(phone || email) && (
                <p className="text-[10px] text-zinc-600">
                  {phone ? `Ph: ${phone}` : ''} {email ? `| ${email}` : ''}
                </p>
              )}
              {(gstin || pan) && (
                <p className="text-[10px] font-bold text-zinc-800">
                  {gstin ? `GSTIN: ${gstin}` : ''} {pan ? `| PAN: ${pan}` : ''}
                </p>
              )}
            </div>

            {!isThermal && (
              <div className="text-right text-[10px] space-y-0.5 shrink-0">
                <p className="font-bold text-xs uppercase text-zinc-950">TAX INVOICE</p>
                <p className="text-zinc-600">Inv: <span className="font-bold">INV-001</span></p>
                <p className="text-zinc-600">Date: 10/08/2026</p>
              </div>
            )}
          </div>

          {isThermal && (
            <div className="py-1 text-[10px] flex justify-between text-zinc-600 border-b border-dashed border-zinc-400">
              <span>Inv: INV-001</span>
              <span>10/08/2026</span>
            </div>
          )}

          {/* Table Items */}
          <div className="py-2">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="border-b border-zinc-950 font-bold">
                  {showColumnSno && <th className="py-1 pr-1">#</th>}
                  <th className="py-1">Item</th>
                  {showColumnHsn && <th className="py-1">HSN</th>}
                  {showColumnMrp && <th className="py-1">MRP</th>}
                  <th className="py-1 text-center">Qty</th>
                  {showColumnUnit && <th className="py-1">Unit</th>}
                  <th className="py-1 text-right">Rate</th>
                  {showColumnDiscount && <th className="py-1 text-right">Disc</th>}
                  {showColumnTaxRate && <th className="py-1 text-right">GST%</th>}
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                <tr>
                  {showColumnSno && <td className="py-1 text-zinc-500">1</td>}
                  <td className="py-1 font-medium">Premium Cotton T-Shirt</td>
                  {showColumnHsn && <td className="py-1 text-zinc-600">6109</td>}
                  {showColumnMrp && <td className="py-1 text-zinc-600">{currency}799</td>}
                  <td className="py-1 text-center font-bold">2</td>
                  {showColumnUnit && <td className="py-1 text-zinc-600">pcs</td>}
                  <td className="py-1 text-right">{currency}450</td>
                  {showColumnDiscount && <td className="py-1 text-right text-zinc-600">5%</td>}
                  {showColumnTaxRate && <td className="py-1 text-right text-zinc-600">5%</td>}
                  <td className="py-1 text-right font-bold">{currency}855.00</td>
                </tr>
                <tr>
                  {showColumnSno && <td className="py-1 text-zinc-500">2</td>}
                  <td className="py-1 font-medium">Denim Jeans Regular</td>
                  {showColumnHsn && <td className="py-1 text-zinc-600">6203</td>}
                  {showColumnMrp && <td className="py-1 text-zinc-600">{currency}1499</td>}
                  <td className="py-1 text-center font-bold">1</td>
                  {showColumnUnit && <td className="py-1 text-zinc-600">pcs</td>}
                  <td className="py-1 text-right">{currency}999</td>
                  {showColumnDiscount && <td className="py-1 text-right text-zinc-600">0%</td>}
                  {showColumnTaxRate && <td className="py-1 text-right text-zinc-600">12%</td>}
                  <td className="py-1 text-right font-bold">{currency}999.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-zinc-950 pt-1.5 text-right space-y-0.5 text-[10px]">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal:</span>
              <span>{currency}1,854.00</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Tax (GST):</span>
              <span>{currency}162.63</span>
            </div>
            <div className="flex justify-between font-bold text-xs pt-1 border-t border-zinc-400 text-zinc-950">
              <span>Grand Total:</span>
              <span>{currency}2,016.63</span>
            </div>
          </div>

          {/* Footer Details */}
          <div className="mt-3 pt-2 border-t border-dashed border-zinc-400 space-y-2">
            {showBankDetails && bankAccount && (
              <div className="text-[9px] text-zinc-700 bg-zinc-100 p-1.5 rounded">
                <p className="font-bold">Bank: {bankName || 'HDFC Bank'} | A/C: {bankAccount} | IFSC: {bankIfsc}</p>
              </div>
            )}

            {showUpiQr && upiId && (
              <div className="flex items-center gap-2 p-1.5 bg-zinc-50 border border-zinc-200 rounded justify-center">
                <Smartphone className="h-4 w-4 text-zinc-800" />
                <span className="text-[9px] font-mono font-bold text-zinc-800">Scan &amp; Pay: {upiId}</span>
              </div>
            )}

            {showTerms && terms && (
              <p className="text-[9px] text-zinc-500 italic leading-tight">{terms}</p>
            )}

            {showSignature && (
              <div className="pt-2 flex justify-end">
                <div className="text-center w-28">
                  {signatureUrl ? (
                    <img src={signatureUrl} alt="Sign" className="h-7 mx-auto object-contain" />
                  ) : (
                    <div className="h-7" />
                  )}
                  <p className="border-t border-zinc-400 text-[8px] font-bold uppercase text-zinc-800 pt-0.5">
                    Authorized Signatory
                  </p>
                </div>
              </div>
            )}

            {thankYouNote && (
              <p className="text-center text-[9px] font-semibold text-zinc-700 pt-1">
                {thankYouNote}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


export function SettingsPage() {
  const { org, user, refreshOrg } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.branding?.logo_url ?? null)
  const [primaryColor, setPrimaryColor] = useState(org?.branding?.primary_color ?? '#6366f1')
  const [invoiceHeader, setInvoiceHeader] = useState(org?.branding?.invoice_header ?? '')
  const [invoiceFooter, setInvoiceFooter] = useState(org?.branding?.invoice_footer ?? '')
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  // Invoice tab extra fields
  const [bankName, setBankName] = useState(org?.branding?.bank_name ?? '')
  const [bankAccount, setBankAccount] = useState(org?.branding?.bank_account ?? '')
  const [bankIfsc, setBankIfsc] = useState(org?.branding?.bank_ifsc ?? '')
  const [invoiceTerms, setInvoiceTerms] = useState(org?.branding?.invoice_terms ?? 'Thank you for your business!')
  const [invoicePrefix, setInvoicePrefix] = useState(org?.branding?.invoice_prefix ?? 'INV')

  // Regional tab
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

  // Barcode settings
  const [barcodeType, setBarcodeType] = useState<string>(org?.branding?.barcode_type ?? 'code128')
  const [barcodeLabelSize, setBarcodeLabelSize] = useState<string>(org?.branding?.barcode_label_size ?? '5x3cm')
  const [autoPrintBarcodeOnPurchase, setAutoPrintBarcodeOnPurchase] = useState<boolean>(org?.branding?.auto_print_barcode_on_purchase ?? false)

  // Invoice UPI / payment
  const [upiId, setUpiId] = useState<string>(org?.branding?.upi_id ?? '')
  const [defaultPaymentMode, setDefaultPaymentMode] = useState<string>(org?.branding?.default_payment_mode ?? 'cash')
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState<number>(org?.branding?.default_payment_terms ?? 30)
  const [paymentReminderDays, setPaymentReminderDays] = useState<number>(org?.branding?.payment_reminder_days ?? 7)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signaturePreview, setSignaturePreview] = useState<string | null>(org?.branding?.signature_url ?? null)
  const [showSignatureOnInvoice, setShowSignatureOnInvoice] = useState<boolean>(org?.branding?.show_signature_on_invoice ?? false)
  const [invoiceStartNumber, setInvoiceStartNumber] = useState<number>(org?.branding?.invoice_start_number ?? 1)

  // Notification Preferences
  const [notifyLowStock, setNotifyLowStock] = useState<boolean>(org?.branding?.notify_low_stock ?? true)
  const [notifyExpiry, setNotifyExpiry] = useState<boolean>(org?.branding?.notify_expiry ?? true)
  const [notifyInvoiceDue, setNotifyInvoiceDue] = useState<boolean>(org?.branding?.notify_invoice_due ?? true)
  const [notifyPaymentReceived, setNotifyPaymentReceived] = useState<boolean>(org?.branding?.notify_payment_received ?? true)
  const [notifyDailySummary, setNotifyDailySummary] = useState<boolean>(org?.branding?.notify_daily_summary ?? false)

  // Print & PDF Layout Settings
  const [printPaperSize, setPrintPaperSize] = useState<'a4' | 'a5' | 'thermal_3inch' | 'thermal_2inch'>(org?.branding?.print_paper_size ?? 'thermal_3inch')
  const [printTemplateTheme, setPrintTemplateTheme] = useState<string>(org?.branding?.print_template_theme ?? 'standard')
  const [printShowLogo, setPrintShowLogo] = useState<boolean>(org?.branding?.print_show_logo ?? true)
  const [printShowShopName, setPrintShowShopName] = useState<boolean>(org?.branding?.print_show_shop_name ?? true)
  const [printShowAddress, setPrintShowAddress] = useState<boolean>(org?.branding?.print_show_address ?? true)
  const [printShowContact, setPrintShowContact] = useState<boolean>(org?.branding?.print_show_contact ?? true)
  const [printShowGstin, setPrintShowGstin] = useState<boolean>(org?.branding?.print_show_gstin ?? true)
  const [printShowPan, setPrintShowPan] = useState<boolean>(org?.branding?.print_show_pan ?? true)
  const [printShowColumnSno, setPrintShowColumnSno] = useState<boolean>(org?.branding?.print_show_column_sno ?? true)
  const [printShowColumnHsn, setPrintShowColumnHsn] = useState<boolean>(org?.branding?.print_show_column_hsn ?? true)
  const [printShowColumnMrp, setPrintShowColumnMrp] = useState<boolean>(org?.branding?.print_show_column_mrp ?? false)
  const [printShowColumnUnit, setPrintShowColumnUnit] = useState<boolean>(org?.branding?.print_show_column_unit ?? true)
  const [printShowColumnDiscount, setPrintShowColumnDiscount] = useState<boolean>(org?.branding?.print_show_column_discount ?? true)
  const [printShowColumnTaxRate, setPrintShowColumnTaxRate] = useState<boolean>(org?.branding?.print_show_column_tax_rate ?? true)
  const [printShowColumnTaxAmount, setPrintShowColumnTaxAmount] = useState<boolean>(org?.branding?.print_show_column_tax_amount ?? false)
  const [printShowBankDetails, setPrintShowBankDetails] = useState<boolean>(org?.branding?.print_show_bank_details ?? true)
  const [printShowUpiQr, setPrintShowUpiQr] = useState<boolean>(org?.branding?.print_show_upi_qr ?? true)
  const [printShowTerms, setPrintShowTerms] = useState<boolean>(org?.branding?.print_show_terms ?? true)
  const [printShowSignature, setPrintShowSignature] = useState<boolean>(org?.branding?.print_show_signature ?? true)
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
      phone: (org as any)?.phone ?? '',
      email: (org as any)?.email ?? '',
      pan: (org as any)?.pan ?? '',
      business_type: (org as any)?.business_type ?? '',
      website: (org as any)?.website ?? '',
    },
  })

  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'cashier' },
  })

  // Fetch members
  const { data: members } = useQuery({
    queryKey: ['members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('memberships')
        .select('id, role, user_id, profiles(full_name, email, avatar_url)')
        .eq('organization_id', orgId!)
        .order('created_at')
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
      const { error } = await supabase
        .from('organizations')
        .update({
          name: values.name,
          gstin: values.gstin || null,
          state_code: values.state_code,
          address: values.address || null,
          phone: values.phone || null,
          email: values.email || null,
          pan: values.pan ? values.pan.toUpperCase() : null,
          business_type: values.business_type || null,
          website: values.website || null,
        })
        .eq('id', orgId!)
      if (error) throw error
    },
    onSuccess: async () => {
      await refreshOrg()
      toast.success('Shop info saved')
    },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
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

      const { error } = await supabase
        .from('org_settings')
        .update({
          branding: {
            primary_color: primaryColor,
            shop_name: org?.name ?? '',
            logo_url: logoUrl,
            invoice_header: invoiceHeader,
            invoice_footer: invoiceFooter,
          },
        })
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: async () => {
      await refreshOrg()
      toast.success('Branding saved')
    },
    onError: (err: Error) => toast.error('Save failed', err.message),
  })

  const saveInvoiceSettingsMutation = useMutation({
    mutationFn: async () => {
      const existing = org?.branding ?? {}

      let signatureUrl = org?.branding?.signature_url ?? null
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
          ...existing,
          bank_name: bankName.trim() || null,
          bank_account: bankAccount.trim() || null,
          bank_ifsc: bankIfsc.trim() || null,
          invoice_terms: invoiceTerms.trim(),
          invoice_prefix: invoicePrefix.trim() || 'INV',
          invoice_start_number: invoiceStartNumber,
          upi_id: upiId.trim() || null,
          default_payment_mode: defaultPaymentMode,
          default_payment_terms: defaultPaymentTerms,
          payment_reminder_days: paymentReminderDays,
          signature_url: signatureUrl,
          show_signature_on_invoice: showSignatureOnInvoice,
        },
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
        branding: { ...existing, currency, date_format: dateFormat, timezone },
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
      const existing = org?.branding ?? {}
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId!,
        branding: {
          ...existing,
          notify_low_stock: notifyLowStock,
          notify_expiry: notifyExpiry,
          notify_invoice_due: notifyInvoiceDue,
          notify_payment_received: notifyPaymentReceived,
          notify_daily_summary: notifyDailySummary,
        },
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
          print_show_logo: printShowLogo,
          print_show_shop_name: printShowShopName,
          print_show_address: printShowAddress,
          print_show_contact: printShowContact,
          print_show_gstin: printShowGstin,
          print_show_pan: printShowPan,
          print_show_column_sno: printShowColumnSno,
          print_show_column_hsn: printShowColumnHsn,
          print_show_column_mrp: printShowColumnMrp,
          print_show_column_unit: printShowColumnUnit,
          print_show_column_discount: printShowColumnDiscount,
          print_show_column_tax_rate: printShowColumnTaxRate,
          print_show_column_tax_amount: printShowColumnTaxAmount,
          print_show_bank_details: printShowBankDetails,
          print_show_upi_qr: printShowUpiQr,
          print_show_terms: printShowTerms,
          print_show_signature: printShowSignature,
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

      const toCSV = (headers: string[], rows: Record<string, unknown>[]) =>
        [headers, ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`))].map((r) => r.join(',')).join('\n')

      const sections = [
        '=== PRODUCTS ===\n' + toCSV(['name','sku','price','cost_price','tax_rate','hsn_code','barcode_value'], products.data ?? []),
        '=== CUSTOMERS ===\n' + toCSV(['name','phone','email','gstin','address','balance'], customers.data ?? []),
        '=== SALES ===\n' + toCSV(['invoice_no','grand_total','payment_mode','created_at'], sales.data ?? []),
        '=== PURCHASES ===\n' + toCSV(['invoice_no','total_amount','created_at'], purchases.data ?? []),
        '=== EXPENSES ===\n' + toCSV(['category','amount','description','expense_date'], expenses.data ?? []),
      ].join('\n\n')

      const blob = new Blob([sections], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `billscape-backup-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
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

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: UserRole }) => {
      const { error } = await supabase
        .from('memberships')
        .update({ role })
        .eq('id', memberId)
        .eq('organization_id', orgId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgId] })
      toast.success('Role updated')
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (values: InviteValues) => {
      // In a real app, send invite via edge function
      // Here we just show a toast with instructions
      toast({ title: 'Invite sent', description: `Invitation sent to ${values.email} as ${values.role}` })
    },
    onSuccess: () => {
      inviteForm.reset()
      setShowInviteDialog(false)
    },
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

      <Tabs defaultValue="shop" className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Side Settings Navigation Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 rounded-2xl border border-border bg-card p-3 shadow-sm space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase px-3 py-1 tracking-wider">General</p>
            <TabsList className="flex flex-col w-full h-auto bg-transparent p-0 gap-1 items-stretch">
              <TabsTrigger value="shop" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Store className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Shop Info
              </TabsTrigger>
              <TabsTrigger value="branding" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                <Palette className="h-4 w-4 mr-2.5 shrink-0 text-primary" />
                Branding
              </TabsTrigger>
              <TabsTrigger value="appearance" className="justify-start px-3 py-2 text-sm font-medium rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-secondary/60 transition-all">
                {theme === 'dark' ? <Moon className="h-4 w-4 mr-2.5 shrink-0 text-primary" /> : <Sun className="h-4 w-4 mr-2.5 shrink-0 text-primary" />}
                Appearance
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
                Team
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
          {/* Shop Info */}
          <TabsContent value="shop" className="mt-0">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Shop Information</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Manage your legal business entity and contact profile.</p>
            </div>

            {/* Live Business Card Preview */}
            <BusinessCardPreview
              name={shopForm.watch('name')}
              gstin={shopForm.watch('gstin')}
              pan={shopForm.watch('pan')}
              phone={shopForm.watch('phone')}
              email={shopForm.watch('email')}
              address={shopForm.watch('address')}
              stateCode={shopForm.watch('state_code')}
              businessType={shopForm.watch('business_type')}
              website={shopForm.watch('website')}
              logoUrl={logoPreview}
              primaryColor={primaryColor}
            />

            {/* Quick Logo Upload in Shop Info */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg border border-border bg-card overflow-hidden flex items-center justify-center">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <Store className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Brand Logo</p>
                  <p className="text-[11px] text-muted-foreground">Appears on invoices, receipts, and identity card</p>
                </div>
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <div className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  {logoFile || logoPreview ? 'Change Logo' : 'Upload Logo'}
                </div>
              </label>
            </div>

            <form
              onSubmit={shopForm.handleSubmit((v) => saveShopMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="shop-name">Shop Name</Label>
                <Input id="shop-name" {...shopForm.register('name')} />
                {shopForm.formState.errors.name && (
                  <p className="text-xs text-red-400">{shopForm.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-gstin">GSTIN (optional)</Label>
                <Input
                  id="shop-gstin"
                  className="uppercase"
                  placeholder="15-char GSTIN"
                  {...shopForm.register('gstin')}
                />
                {shopForm.formState.errors.gstin && (
                  <p className="text-xs text-red-400">{shopForm.formState.errors.gstin.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-state">State</Label>
                <select
                  id="shop-state"
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...shopForm.register('state_code')}
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code} className="bg-zinc-900">
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-address">Address</Label>
                <Input
                  id="shop-address"
                  placeholder="Street, City, State, Pincode"
                  {...shopForm.register('address')}
                />
              </div>

              <Separator />

              <h3 className="text-sm font-medium text-muted-foreground">Contact & Identity</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="shop-phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="shop-phone"
                      placeholder="+91 98765 43210"
                      className="pl-9"
                      {...shopForm.register('phone')}
                    />
                  </div>
                  {shopForm.formState.errors.phone && (
                    <p className="text-xs text-red-400">{shopForm.formState.errors.phone.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="shop-email">Business Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="shop-email"
                      type="email"
                      placeholder="shop@example.com"
                      className="pl-9"
                      {...shopForm.register('email')}
                    />
                  </div>
                  {shopForm.formState.errors.email && (
                    <p className="text-xs text-red-400">{shopForm.formState.errors.email.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="shop-pan">PAN Number (optional)</Label>
                  <Input
                    id="shop-pan"
                    className="uppercase"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    {...shopForm.register('pan')}
                  />
                  {shopForm.formState.errors.pan && (
                    <p className="text-xs text-red-400">{shopForm.formState.errors.pan.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="shop-business-type">Business Type</Label>
                  <select
                    id="shop-business-type"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    {...shopForm.register('business_type')}
                  >
                    <option value="">Select business type</option>
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shop-website">Website (optional)</Label>
                <Input
                  id="shop-website"
                  placeholder="https://yourshop.com"
                  {...shopForm.register('website')}
                />
                {shopForm.formState.errors.website && (
                  <p className="text-xs text-red-400">{shopForm.formState.errors.website.message}</p>
                )}
              </div>

              <Button type="submit" disabled={saveShopMutation.isPending}>
                {saveShopMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </form>
          </div>
        </TabsContent>


        {/* Branding */}
        <TabsContent value="branding">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <h2 className="text-base font-semibold text-foreground">Branding & Invoice</h2>

            {/* Logo */}
            <div className="space-y-3">
              <Label>Shop Logo</Label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Store className="h-8 w-8 text-zinc-600" />
                    </div>
                  )}
                </div>
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                    <Upload className="h-4 w-4" />
                    {logoFile ? 'Change logo' : 'Upload logo'}
                  </div>
                </label>
              </div>
            </div>

            <Separator />

            {/* Color */}
            <div className="space-y-3">
              <Label>Primary Color</Label>
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
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded border border-zinc-700" style={{ backgroundColor: primaryColor }} />
                <span className="text-xs text-zinc-400">{primaryColor}</span>
              </div>
            </div>

            <Separator />

            {/* Invoice text */}
            <div className="space-y-3">
              <Label>Invoice Header Text</Label>
              <Input
                placeholder="e.g. Thank you for shopping with us!"
                value={invoiceHeader}
                onChange={(e) => setInvoiceHeader(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <Label>Invoice Footer Text</Label>
              <Input
                placeholder="e.g. Goods once sold will not be exchanged."
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
              />
            </div>

            <Button onClick={() => saveBrandingMutation.mutate()} disabled={saveBrandingMutation.isPending}>
              {saveBrandingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Branding'
              )}
            </Button>
          </div>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <h2 className="text-base font-semibold text-foreground">Appearance</h2>

            <div className="space-y-3">
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">Choose between dark and light mode for the interface.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => theme === 'light' && toggleTheme()}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all w-32',
                    theme === 'dark'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/80',
                  )}
                >
                  <div className="h-16 w-24 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col overflow-hidden">
                    <div className="h-4 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                      <div className="h-1 w-8 rounded bg-zinc-800" />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="h-2 w-12 rounded bg-zinc-800" />
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
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all w-32',
                    theme === 'light'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/80',
                  )}
                >
                  <div className="h-16 w-24 rounded-lg bg-white border border-zinc-200 flex flex-col overflow-hidden">
                    <div className="h-4 bg-zinc-100 border-b border-zinc-200 flex items-center px-2 gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                      <div className="h-1 w-8 rounded bg-zinc-200" />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="h-2 w-12 rounded bg-zinc-100" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Light</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Team */}
        <TabsContent value="team" className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Change Password</h2>
            <form
              onSubmit={changePasswordForm.handleSubmit((v) => changePasswordMutation.mutate(v))}
              className="space-y-4 max-w-sm"
            >
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                    autoComplete="current-password"
                    {...changePasswordForm.register('currentPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {changePasswordForm.formState.errors.currentPassword && (
                  <p className="text-xs text-red-400">{changePasswordForm.formState.errors.currentPassword.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                    autoComplete="new-password"
                    {...changePasswordForm.register('newPassword', {
                      onChange: (e) => setNewPasswordValue(e.target.value),
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {changePasswordForm.formState.errors.newPassword && (
                  <p className="text-xs text-red-400">{changePasswordForm.formState.errors.newPassword.message}</p>
                )}
                {newPasswordValue.length > 0 && (() => {
                  const { checks, score } = getPasswordStrength(newPasswordValue)
                  const strengthLabel = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong'
                  const strengthColor = score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-yellow-500' : score === 3 ? 'bg-blue-500' : 'bg-emerald-500'
                  const textColor = score <= 1 ? 'text-red-400' : score === 2 ? 'text-yellow-400' : score === 3 ? 'text-blue-400' : 'text-emerald-400'
                  return (
                    <div className="space-y-2 mt-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex gap-1">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i <= score ? strengthColor : 'bg-zinc-700')} />
                          ))}
                        </div>
                        <span className={cn('text-xs font-medium', textColor)}>{strengthLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { key: 'length', label: '8+ characters' },
                          { key: 'upper', label: 'Uppercase letter (A-Z)' },
                          { key: 'lower', label: 'Lowercase letter (a-z)' },
                          { key: 'special', label: 'Special character (!@#...)' },
                        ].map(({ key, label }) => (
                          <div key={key} className={cn('flex items-center gap-1.5 text-[11px]', checks[key as keyof typeof checks] ? 'text-emerald-400' : 'text-zinc-500')}>
                            <div className={cn('h-1.5 w-1.5 rounded-full', checks[key as keyof typeof checks] ? 'bg-emerald-400' : 'bg-zinc-600')} />
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                    autoComplete="new-password"
                    {...changePasswordForm.register('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {changePasswordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-red-400">{changePasswordForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Team Members</h2>
              <Button size="sm" onClick={() => setShowInviteDialog(true)}>
                <Plus className="h-4 w-4" />
                Invite Member
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members?.map((member) => {
                  const profile = (member.profiles as unknown as { full_name: string; email: string }) ?? null
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                            {(profile?.full_name ?? profile?.email ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-200">{profile?.full_name ?? 'Unknown'}</p>
                            <p className="text-xs text-zinc-500">{profile?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(member.role as UserRole)} className="capitalize">
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <select
                          defaultValue={member.role}
                          onChange={(e) =>
                            updateRoleMutation.mutate({
                              memberId: member.id,
                              role: e.target.value as UserRole,
                            })
                          }
                          className="h-7 rounded border border-zinc-700 bg-zinc-800 px-2 text-xs text-zinc-200 focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r} className="bg-zinc-900 capitalize">
                              {r}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Invoice Number Prefix</Label>
                <Input placeholder="INV" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} />
                <p className="text-xs text-muted-foreground">e.g. INV → INV-20260723-001</p>
              </div>
              <div className="space-y-1.5">
                <Label>Starting Invoice Number</Label>
                <Input
                  type="number"
                  min="1"
                  value={invoiceStartNumber}
                  onChange={(e) => setInvoiceStartNumber(parseInt(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground">Your first invoice will use this number</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Terms &amp; Conditions</Label>
              <textarea
                value={invoiceTerms}
                onChange={(e) => setInvoiceTerms(e.target.value)}
                placeholder="Thank you for your business!"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
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
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="show-signature"
                  checked={showSignatureOnInvoice}
                  onChange={(e) => setShowSignatureOnInvoice(e.target.checked)}
                  className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                />
                <Label htmlFor="show-signature">Show signature on invoice</Label>
              </div>
            </div>

            {/* Live Invoice Footer Preview */}
            <LiveInvoiceFooterPreview
              bankName={bankName}
              bankAccount={bankAccount}
              bankIfsc={bankIfsc}
              upiId={upiId}
              signatureUrl={signaturePreview}
              showSignature={showSignatureOnInvoice}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <TabsContent value="inventory">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Inventory Settings</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Control how inventory is tracked and managed across your shop.</p>
            </div>

            <div className="space-y-1">
              {[
                {
                  id: 'auto-deduct',
                  label: 'Auto-Deduct Stock on Sale',
                  desc: 'Automatically reduce inventory when a sale invoice is created',
                  value: autoDeductStock,
                  setter: setAutoDeductStock,
                },
                {
                  id: 'allow-negative',
                  label: 'Allow Negative Stock',
                  desc: 'Allow billing even when stock quantity goes below zero',
                  value: allowNegativeStock,
                  setter: setAllowNegativeStock,
                },
                {
                  id: 'show-out-of-stock',
                  label: 'Show Out-of-Stock Products in Billing',
                  desc: 'Display products with zero stock during POS / billing (they will be shown with a warning)',
                  value: showOutOfStockInBilling,
                  setter: setShowOutOfStockInBilling,
                },
              ].map(({ id, label, desc, value, setter }) => (
                <div key={id} className="flex items-start justify-between gap-4 py-4 border-b border-border/50 last:border-0">
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

            <Separator />

            <div className="space-y-3">
              <div>
                <Label>Low Stock Alert Threshold</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Get alerted when product quantity falls below this number</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Input
                  type="number"
                  min="0"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(parseInt(e.target.value) || 0)}
                  className="max-w-[120px]"
                />
                <span className="text-sm text-muted-foreground">units</span>
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-xs text-muted-foreground">Quick Presets:</span>
                  {[5, 10, 20, 50].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setLowStockThreshold(val)}
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium border transition-colors',
                        lowStockThreshold === val
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={() => saveInventoryMutation.mutate()} disabled={saveInventoryMutation.isPending}>
              {saveInventoryMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Inventory Settings'}
            </Button>
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

            <Separator />

            {/* Live Barcode Format Preview */}
            <LiveBarcodePreview type={barcodeType} labelSize={barcodeLabelSize} />

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
        <TabsContent value="notifications">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Notification Preferences</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Control which in-app alerts and notifications are triggered for your shop.</p>
            </div>

            <div className="space-y-1">
              {[
                {
                  id: 'notify-low-stock',
                  label: 'Low Stock Alerts',
                  desc: 'Notify when any product quantity reaches or falls below the alert threshold',
                  value: notifyLowStock,
                  setter: setNotifyLowStock,
                },
                {
                  id: 'notify-expiry',
                  label: 'Batch Expiry Alerts',
                  desc: 'Notify when batch inventory items are expiring soon or past expiration date',
                  value: notifyExpiry,
                  setter: setNotifyExpiry,
                },
                {
                  id: 'notify-invoice-due',
                  label: 'Invoice Due & Overdue Alerts',
                  desc: 'Notify when credit invoices are approaching their due date or overdue',
                  value: notifyInvoiceDue,
                  setter: setNotifyInvoiceDue,
                },
                {
                  id: 'notify-payment-received',
                  label: 'Payment Received Alerts',
                  desc: 'Receive confirmation alerts whenever customer or supplier payments are recorded',
                  value: notifyPaymentReceived,
                  setter: setNotifyPaymentReceived,
                },
                {
                  id: 'notify-daily-summary',
                  label: 'Daily Operational Summary',
                  desc: 'Receive an end-of-day digest of daily sales, collections, and pending tasks',
                  value: notifyDailySummary,
                  setter: setNotifyDailySummary,
                },
              ].map(({ id, label, desc, value, setter }) => (
                <div key={id} className="flex items-start justify-between gap-4 py-4 border-b border-border/50 last:border-0">
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

            <Button onClick={() => saveNotificationsMutation.mutate()} disabled={saveNotificationsMutation.isPending}>
              {saveNotificationsMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Notification Settings'}
            </Button>
          </div>
        </TabsContent>
        {/* Print & PDF Layout Settings */}
        <TabsContent value="print">
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Print &amp; Document Customization</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Customize paper sizes, visible invoice table columns, header branding, and footer notes.</p>
            </div>

            {/* Paper Size Format */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 font-medium"><Printer className="h-4 w-4 text-primary" />Paper Format</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'thermal_3inch', title: 'Thermal 3"', desc: '80mm POS Roll' },
                  { id: 'thermal_2inch', title: 'Thermal 2"', desc: '58mm Handheld' },
                  { id: 'a4', title: 'A4 Standard', desc: 'Full-sheet Laser' },
                  { id: 'a5', title: 'A5 Compact', desc: 'Half-sheet Bill' },
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

            <Separator />

            {/* Header Details Visibility */}
            <div className="space-y-3">
              <Label className="font-medium">Company &amp; Header Elements</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: 'show-logo', label: 'Show Shop Logo', value: printShowLogo, setter: setPrintShowLogo },
                  { id: 'show-shop-name', label: 'Show Business Name', value: printShowShopName, setter: setPrintShowShopName },
                  { id: 'show-address', label: 'Show Address', value: printShowAddress, setter: setPrintShowAddress },
                  { id: 'show-contact', label: 'Show Phone & Email', value: printShowContact, setter: setPrintShowContact },
                  { id: 'show-gstin', label: 'Show GSTIN', value: printShowGstin, setter: setPrintShowGstin },
                  { id: 'show-pan', label: 'Show PAN Number', value: printShowPan, setter: setPrintShowPan },
                ].map(({ id, label, value, setter }) => (
                  <div key={id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-secondary/20">
                    <span className="text-xs font-medium text-foreground">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={value}
                      onClick={() => setter(!value)}
                      className={cn(
                        'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        value ? 'bg-primary' : 'bg-zinc-600'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200', value ? 'translate-x-3' : 'translate-x-0')} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Table Column Toggles */}
            <div className="space-y-3">
              <Label className="font-medium">Item Table Columns</Label>
              <p className="text-xs text-muted-foreground">Select which columns appear on printed invoices and bills</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { id: 'col-sno', label: 'Serial No (S.No)', value: printShowColumnSno, setter: setPrintShowColumnSno },
                  { id: 'col-hsn', label: 'HSN / SAC Code', value: printShowColumnHsn, setter: setPrintShowColumnHsn },
                  { id: 'col-mrp', label: 'MRP Column', value: printShowColumnMrp, setter: setPrintShowColumnMrp },
                  { id: 'col-unit', label: 'Unit of Measure', value: printShowColumnUnit, setter: setPrintShowColumnUnit },
                  { id: 'col-disc', label: 'Discount %', value: printShowColumnDiscount, setter: setPrintShowColumnDiscount },
                  { id: 'col-tax', label: 'GST Tax Rate %', value: printShowColumnTaxRate, setter: setPrintShowColumnTaxRate },
                ].map(({ id, label, value, setter }) => (
                  <div key={id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-secondary/20">
                    <span className="text-xs font-medium text-foreground">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={value}
                      onClick={() => setter(!value)}
                      className={cn(
                        'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        value ? 'bg-primary' : 'bg-zinc-600'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200', value ? 'translate-x-3' : 'translate-x-0')} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Footer Options */}
            <div className="space-y-3">
              <Label className="font-medium">Footer &amp; Declaration</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: 'show-bank', label: 'Show Bank Details', value: printShowBankDetails, setter: setPrintShowBankDetails },
                  { id: 'show-upi', label: 'Show UPI QR Code', value: printShowUpiQr, setter: setPrintShowUpiQr },
                  { id: 'show-terms', label: 'Show Terms & Conditions', value: printShowTerms, setter: setPrintShowTerms },
                  { id: 'show-sign', label: 'Show Authorized Signature', value: printShowSignature, setter: setPrintShowSignature },
                ].map(({ id, label, value, setter }) => (
                  <div key={id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-secondary/20">
                    <span className="text-xs font-medium text-foreground">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={value}
                      onClick={() => setter(!value)}
                      className={cn(
                        'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                        value ? 'bg-primary' : 'bg-zinc-600'
                      )}
                    >
                      <span className={cn('pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200', value ? 'translate-x-3' : 'translate-x-0')} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 pt-2">
                <Label>Thank You Note / Greeting</Label>
                <Input
                  value={printThankYouNote}
                  onChange={(e) => setPrintThankYouNote(e.target.value)}
                  placeholder="Thank you for shopping with us! Please visit again."
                />
              </div>
            </div>

            {/* Live Interactive Preview */}
            <LivePrintBillPreview
              paperSize={printPaperSize}
              showLogo={printShowLogo}
              logoUrl={logoPreview}
              shopName={shopForm.watch('name')}
              address={shopForm.watch('address')}
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
              thankYouNote={printThankYouNote}
              currency={currency}
            />

            <Button onClick={() => savePrintMutation.mutate()} disabled={savePrintMutation.isPending}>
              {savePrintMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Print Settings'}
            </Button>
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
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={inviteForm.handleSubmit((v) => inviteMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                {...inviteForm.register('email')}
              />
              {inviteForm.formState.errors.email && (
                <p className="text-xs text-red-400">{inviteForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
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
              <Button type="submit" disabled={inviteMutation.isPending}>
                Send Invite
              </Button>
            </DialogFooter>
          </form>
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
