/**
 * Apply RLS fix for purchase_items and re-seed purchase items.
 * Run: npx tsx apps/web/scripts/fix_purchase_items.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bzvbkscspzdschskbqtd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmJrc2NzcHpkc2Noc2ticXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTY1OTQsImV4cCI6MjEwMDIzMjU5NH0.6wVrlIR__mVCCLyBqftUv2nLKYav9kCReg7Z3DBTkN4'
const EMAIL = 'muhammadfazilsl455@gmail.com'
const PASSWORD = 'Fazil2512@'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function log(msg: string) { console.log(`✅ ${msg}`) }
function warn(msg: string) { console.warn(`⚠️  ${msg}`) }

async function run() {
  // Authenticate
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (authErr || !authData.user) { console.error('Auth failed:', authErr?.message); process.exit(1) }
  const userId = authData.user.id
  log(`Authenticated as ${EMAIL}`)

  // Get org
  const { data: mems } = await supabase.from('memberships').select('organization_id').eq('user_id', userId)
  const orgId = mems?.[0]?.organization_id as string
  if (!orgId) { console.error('No org found'); process.exit(1) }
  log(`Organization: ${orgId}`)

  // Get purchases by invoice_no
  const { data: purchases } = await supabase
    .from('purchases')
    .select('id, invoice_no, supplier_id')
    .eq('organization_id', orgId)
    .in('invoice_no', ['APEX-INV-2026-0821', 'HER-INV-2026-0745', 'SUN-INV-2026-0312'])

  if (!purchases?.length) { console.error('Purchases not found'); process.exit(1) }
  log(`Found ${purchases.length} purchases to add items for`)

  // Get product IDs
  const { data: products } = await supabase
    .from('products')
    .select('id, name, cost_price, tax_rate, hsn_code')
    .eq('organization_id', orgId)

  const prodMap: Record<string, { id: string; cost_price: number; tax_rate: number; hsn_code: string | null }> = {}
  for (const p of products ?? []) {
    prodMap[p.name] = { id: p.id, cost_price: p.cost_price, tax_rate: p.tax_rate, hsn_code: p.hsn_code }
  }

  // Check if purchase_items already exist for these purchases
  const purchaseIds = purchases.map(p => p.id)
  const { data: existingItems } = await supabase
    .from('purchase_items')
    .select('purchase_id')
    .in('purchase_id', purchaseIds)

  const purchasesWithItems = new Set((existingItems ?? []).map(e => e.purchase_id))
  log(`Purchases already with items: ${purchasesWithItems.size}`)

  // Define items per purchase
  const purchaseItems: Record<string, Array<{ product: string; qty: number; unit_cost: number; tax_rate: number }>> = {
    'APEX-INV-2026-0821': [
      { product: 'India Gate Basmati Rice 5kg', qty: 20, unit_cost: 295, tax_rate: 5 },
      { product: 'Fortune Sunflower Oil 1L', qty: 30, unit_cost: 140, tax_rate: 5 },
      { product: 'Bisleri Water 1L Bottle', qty: 48, unit_cost: 12, tax_rate: 18 },
      { product: 'Lays Classic Salted 52g', qty: 60, unit_cost: 13.50, tax_rate: 18 },
      { product: 'Parle-G Glucose Biscuits 250g', qty: 40, unit_cost: 14, tax_rate: 18 },
    ],
    'HER-INV-2026-0745': [
      { product: 'Organic Toor Dal 1kg Premium', qty: 25, unit_cost: 128, tax_rate: 5 },
      { product: 'Aashirvaad Atta Wheat 5kg', qty: 15, unit_cost: 195, tax_rate: 0 },
      { product: 'Sugar White 1kg', qty: 30, unit_cost: 40, tax_rate: 5 },
    ],
    'SUN-INV-2026-0312': [
      { product: 'Surf Excel Matic Liquid 2kg', qty: 12, unit_cost: 298, tax_rate: 18 },
      { product: 'Colgate Strong Teeth 300g', qty: 24, unit_cost: 98, tax_rate: 18 },
    ],
  }

  for (const purchase of purchases) {
    if (purchasesWithItems.has(purchase.id)) {
      log(`Purchase items already exist for: ${purchase.invoice_no}`)
      continue
    }

    const items = purchaseItems[purchase.invoice_no ?? ''] ?? []
    console.log(`\n📦 Adding items for: ${purchase.invoice_no} (${items.length} items)`)

    for (const item of items) {
      const prod = prodMap[item.product]
      if (!prod) { warn(`Product not found: ${item.product}`); continue }

      const taxableAmount = item.qty * item.unit_cost
      const gstAmount = taxableAmount * (item.tax_rate / 100)
      const cgst = gstAmount / 2
      const sgst = gstAmount / 2
      const lineTotal = taxableAmount + gstAmount

      const { error } = await supabase.from('purchase_items').insert({
        purchase_id: purchase.id,
        organization_id: orgId,
        product_id: prod.id,
        product_name: item.product,
        qty: item.qty,
        unit_cost: item.unit_cost,
        line_total: lineTotal,
        tax_rate: item.tax_rate,
        taxable_amount: taxableAmount,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: 0,
      })

      if (error) warn(`Item failed: ${item.product} - ${error.message}`)
      else log(`  → ${item.product} x${item.qty} @ ₹${item.unit_cost}`)
    }
  }

  console.log('\n🎉 Purchase items seeding complete!')
}

run().catch(console.error)
