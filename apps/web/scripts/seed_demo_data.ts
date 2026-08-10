/**
 * BillScape Demo Data Seeder
 * Seeds realistic business data across all 14 modules for the active organization.
 *
 * Run with:
 *   npx tsx apps/web/scripts/seed_demo_data.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bzvbkscspzdschskbqtd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmJrc2NzcHpkc2Noc2ticXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTY1OTQsImV4cCI6MjEwMDIzMjU5NH0.6wVrlIR__mVCCLyBqftUv2nLKYav9kCReg7Z3DBTkN4'

const EMAIL = 'muhammadfazilsl455@gmail.com'
const PASSWORD = 'Fazil2512@'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function log(msg: string) {
  console.log(`✅ ${msg}`)
}
function warn(msg: string) {
  console.warn(`⚠️  ${msg}`)
}
function err(msg: string, e?: unknown) {
  console.error(`❌ ${msg}`, e instanceof Error ? e.message : e)
}

async function run() {
  // ── 1. Authenticate ──────────────────────────────────────────────────────
  console.log('\n🔐 Authenticating...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  if (authError || !authData.user) {
    err('Auth failed', authError)
    process.exit(1)
  }
  const userId = authData.user.id
  log(`Authenticated as ${EMAIL} (${userId})`)

  // ── 2. Get Organization ──────────────────────────────────────────────────
  const { data: memberships } = await supabase
    .from('memberships')
    .select('organization_id, organizations(id, name)')
    .eq('user_id', userId)
  if (!memberships?.length) {
    err('No organization found for this user. Please create an organization first.')
    process.exit(1)
  }
  const orgId = memberships[0].organization_id as string
  const orgName = (memberships[0] as Record<string, unknown>)?.organizations as { name: string }
  log(`Using organization: ${orgName?.name ?? orgId} (${orgId})`)

  // ── 3. Get Unit IDs ──────────────────────────────────────────────────────
  console.log('\n📐 Fetching units...')
  const { data: units } = await supabase
    .from('units')
    .select('id, name, symbol')
    .eq('organization_id', orgId)

  const unitMap: Record<string, string> = {}
  for (const u of units ?? []) {
    unitMap[u.name] = u.id
  }

  // Insert missing units if any
  const requiredUnits = [
    { name: 'Piece', symbol: 'pc', allow_decimal: false },
    { name: 'Kilogram', symbol: 'kg', allow_decimal: true },
    { name: 'Gram', symbol: 'g', allow_decimal: true },
    { name: 'Litre', symbol: 'L', allow_decimal: true },
    { name: 'Box', symbol: 'box', allow_decimal: false },
    { name: 'Dozen', symbol: 'dz', allow_decimal: false },
    { name: 'Pack', symbol: 'pack', allow_decimal: false },
    { name: 'Meter', symbol: 'm', allow_decimal: true },
    { name: 'Bag', symbol: 'bag', allow_decimal: false },
  ]

  for (const u of requiredUnits) {
    if (!unitMap[u.name]) {
      const { data: inserted } = await supabase
        .from('units')
        .insert({ ...u, organization_id: orgId })
        .select('id, name')
        .single()
      if (inserted) {
        unitMap[u.name] = inserted.id
        log(`Created unit: ${u.name}`)
      }
    }
  }
  log(`Units ready: ${Object.keys(unitMap).join(', ')}`)

  // ── 4. Seed Categories ───────────────────────────────────────────────────
  console.log('\n🏷️  Seeding categories...')
  const categoriesData = [
    { name: 'Grains & Staples', color: '#f59e0b' },
    { name: 'Oils & Ghee', color: '#ef4444' },
    { name: 'Beverages & Tea', color: '#3b82f6' },
    { name: 'Snacks & Confectionery', color: '#8b5cf6' },
    { name: 'Dairy & Fresh', color: '#06b6d4' },
    { name: 'Personal Care & Cleaning', color: '#ec4899' },
    { name: 'Apparel & Textiles', color: '#f97316' },
    { name: 'Kitchenware & Utensils', color: '#10b981' },
    { name: 'Packaging & Supplies', color: '#6366f1' },
  ]
  const categoryMap: Record<string, string> = {}
  for (const cat of categoriesData) {
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', cat.name)
      .maybeSingle()
    if (existing) {
      categoryMap[cat.name] = existing.id
    } else {
      const { data: inserted } = await supabase
        .from('categories')
        .insert({ ...cat, organization_id: orgId })
        .select('id')
        .single()
      if (inserted) {
        categoryMap[cat.name] = inserted.id
        log(`Category: ${cat.name}`)
      }
    }
  }

  // ── 5. Seed Employees ────────────────────────────────────────────────────
  console.log('\n👥 Seeding employees...')
  const employeesData = [
    {
      full_name: 'Arjun Krishnamurthy',
      phone: '9845001234',
      email: 'arjun.krishnamurthy@smartfazil.in',
      role: 'manager',
      is_active: true,
      joined_date: '2023-04-01',
      notes: 'Senior Store Manager, handles billing and inventory oversight.',
    },
    {
      full_name: 'Meenakshi Sundaram',
      phone: '9845002345',
      email: 'meenakshi.s@smartfazil.in',
      role: 'cashier',
      is_active: true,
      joined_date: '2023-09-15',
      notes: 'Senior cashier, morning shift specialist.',
    },
    {
      full_name: 'Ravi Kumar Patel',
      phone: '9845003456',
      email: 'ravi.patel@smartfazil.in',
      role: 'cashier',
      is_active: true,
      joined_date: '2024-01-10',
      notes: 'Afternoon shift cashier and customer service.',
    },
    {
      full_name: 'Lakshmi Narayanan',
      phone: '9845004567',
      email: 'lakshmi.n@smartfazil.in',
      role: 'cashier',
      is_active: true,
      joined_date: '2024-03-20',
      notes: 'Inventory & stock counting specialist.',
    },
    {
      full_name: 'Suresh Babu Venkataraman',
      phone: '9845005678',
      email: 'suresh.venkat@smartfazil.in',
      role: 'cashier',
      is_active: true,
      joined_date: '2024-06-01',
      notes: 'Evening shift, handles UPI and card payments.',
    },
    {
      full_name: 'Priya Dharshini Raj',
      phone: '9845006789',
      email: 'priya.raj@smartfazil.in',
      role: 'cashier',
      is_active: false,
      joined_date: '2023-11-01',
      notes: 'On leave - logistics & delivery associate.',
    },
  ]

  for (const emp of employeesData) {
    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('organization_id', orgId)
      .eq('full_name', emp.full_name)
      .maybeSingle()
    if (!existing) {
      const { error } = await supabase
        .from('employees')
        .insert({ ...emp, organization_id: orgId })
      if (error) warn(`Employee insert failed: ${emp.full_name} - ${error.message}`)
      else log(`Employee: ${emp.full_name} (${emp.role})`)
    } else {
      log(`Employee exists: ${emp.full_name}`)
    }
  }

  // ── 6. Seed Suppliers ────────────────────────────────────────────────────
  console.log('\n🚚 Seeding suppliers...')
  const suppliersData = [
    {
      name: 'Apex FMCG Wholesale Distributors',
      phone: '04422001122',
      email: 'orders@apexfmcg.in',
      gstin: '33AABCA1234B1ZP',
      address: '14, Koyambedu Market Complex, Chennai, Tamil Nadu - 600107',
      bank_name: 'HDFC Bank',
      bank_account: '50200012345678',
      bank_ifsc: 'HDFC0001234',
      upi_id: 'apexfmcg@hdfcbank',
    },
    {
      name: 'Heritage Organic Farms & Mills',
      phone: '04362321456',
      email: 'supply@heritageorganics.in',
      gstin: '33AABCH9876C1ZL',
      address: '5, Cauvery Nagar, Thanjavur, Tamil Nadu - 613001',
      bank_name: 'Canara Bank',
      bank_account: '0987654321001',
      bank_ifsc: 'CNRB0001111',
      upi_id: 'heritageorganic@cnrb',
    },
    {
      name: 'Royal Tex & Fabrics Syndicate',
      phone: '04212567890',
      email: 'bulk@royaltex.in',
      gstin: '33AABCR5432D1ZM',
      address: '22, Saradha College Road, Salem, Tamil Nadu - 636016',
      bank_name: 'State Bank of India',
      bank_account: '33456789012345',
      bank_ifsc: 'SBIN0001222',
      upi_id: 'royaltex@sbi',
    },
    {
      name: 'Precision Packaging Solutions',
      phone: '04422998877',
      email: 'sales@precisionpack.in',
      gstin: '33AABCP7654E1ZN',
      address: '8, SIDCO Industrial Estate, Ambattur, Chennai - 600098',
      bank_name: 'Axis Bank',
      bank_account: '91234567890123',
      bank_ifsc: 'UTIB0002345',
      upi_id: 'precisionpack@axis',
    },
    {
      name: 'Metro Logistics & General Supplies',
      phone: '09944556677',
      email: 'dispatch@metrologistics.in',
      gstin: '33AABCM3210F1ZR',
      address: '3, Anna Salai, Trichy, Tamil Nadu - 620002',
      bank_name: 'ICICI Bank',
      bank_account: '123456789012',
      bank_ifsc: 'ICIC0003456',
      upi_id: 'metrolog@icici',
    },
    {
      name: 'Sunrise Household & Personal Care',
      phone: '04444123456',
      email: 'hello@sunrisehpc.in',
      gstin: '33AABCS6543G1ZS',
      address: '16, Gandhi Road, Coimbatore, Tamil Nadu - 641009',
      bank_name: 'Kotak Mahindra Bank',
      bank_account: '1234567890',
      bank_ifsc: 'KKBK0004567',
      upi_id: 'sunrise@kotak',
    },
  ]

  const supplierMap: Record<string, string> = {}
  for (const sup of suppliersData) {
    const { data: existing } = await supabase
      .from('suppliers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', sup.name)
      .maybeSingle()
    if (existing) {
      supplierMap[sup.name] = existing.id
      log(`Supplier exists: ${sup.name}`)
    } else {
      const { data: inserted, error } = await supabase
        .from('suppliers')
        .insert({ ...sup, organization_id: orgId })
        .select('id')
        .single()
      if (error) warn(`Supplier failed: ${sup.name} - ${error.message}`)
      else if (inserted) {
        supplierMap[sup.name] = inserted.id
        log(`Supplier: ${sup.name}`)
      }
    }
  }

  // ── 7. Seed Customers ────────────────────────────────────────────────────
  console.log('\n🛍️  Seeding customers...')
  const customersData = [
    {
      name: 'Walk-in Customer',
      phone: null,
      email: null,
      gstin: null,
      state_code: 'TN',
      address: null,
      balance: 0,
    },
    {
      name: 'Ramesh Babu Iyer',
      phone: '9841234501',
      email: 'ramesh.iyer@gmail.com',
      gstin: null,
      state_code: 'TN',
      address: '12, Gandhi Street, T. Nagar, Chennai - 600017',
      balance: 0,
    },
    {
      name: 'Kavitha Sundaram',
      phone: '9841234502',
      email: 'kavitha.s@yahoo.com',
      gstin: null,
      state_code: 'TN',
      address: '5, Anna Nagar East, Chennai - 600102',
      balance: 450.00,
    },
    {
      name: 'Sri Murugan Departmental Stores',
      phone: '04422887766',
      email: 'srimurugan.stores@gmail.com',
      gstin: '33AAACS7654B1ZM',
      state_code: 'TN',
      address: '45, Usman Road, T. Nagar, Chennai - 600017',
      balance: -2500.00,
    },
    {
      name: 'Anbu Mani Kumar',
      phone: '9841234503',
      email: 'anbu.kumar@hotmail.com',
      gstin: null,
      state_code: 'TN',
      address: '8, West CIT Nagar, Nandanam, Chennai - 600035',
      balance: 0,
    },
    {
      name: 'Saranya Krishnan',
      phone: '9841234504',
      email: null,
      gstin: null,
      state_code: 'TN',
      address: '22, Kodambakkam, Chennai - 600024',
      balance: 150.00,
    },
    {
      name: 'Vijay Namasivayam Retail',
      phone: '04422991100',
      email: 'vijayretail@gmail.com',
      gstin: '33AAACV4321C1ZN',
      state_code: 'KA',
      address: '7, Brigade Road, Bangalore - 560001',
      balance: -1200.00,
    },
    {
      name: 'Deepa Venkatesan',
      phone: '9841234505',
      email: 'deepa.v@gmail.com',
      gstin: null,
      state_code: 'TN',
      address: '3, Velachery Main Road, Chennai - 600042',
      balance: 0,
    },
  ]

  const customerMap: Record<string, string> = {}
  for (const cust of customersData) {
    const query = supabase.from('customers').select('id').eq('organization_id', orgId)
    if (cust.phone) query.eq('phone', cust.phone)
    else query.eq('name', cust.name)
    const { data: existing } = await query.maybeSingle()

    if (existing) {
      customerMap[cust.name] = existing.id
      log(`Customer exists: ${cust.name}`)
    } else {
      const { data: inserted, error } = await supabase
        .from('customers')
        .insert({ ...cust, organization_id: orgId })
        .select('id')
        .single()
      if (error) warn(`Customer failed: ${cust.name} - ${error.message}`)
      else if (inserted) {
        customerMap[cust.name] = inserted.id
        log(`Customer: ${cust.name}`)
      }
    }
  }

  // ── 8. Seed Products ─────────────────────────────────────────────────────
  console.log('\n📦 Seeding products...')
  const pieceId = unitMap['Piece']
  const kgId = unitMap['Kilogram']
  const litreId = unitMap['Litre']
  const packId = unitMap['Pack']
  const gramId = unitMap['Gram']

  const productsData = [
    // Grains & Staples
    {
      name: 'India Gate Basmati Rice 5kg',
      sku: 'BS-RICE-5KG',
      hsn_code: '1006',
      tax_rate: 5,
      price: 380.00,
      mrp: 399.00,
      cost_price: 295.00,
      barcode_value: 'BSP-RICE-5KG-001',
      track_stock: true,
      category: 'Grains & Staples',
      unit: 'Piece',
    },
    {
      name: 'Organic Toor Dal 1kg Premium',
      sku: 'BS-DAL-1KG',
      hsn_code: '0713',
      tax_rate: 5,
      price: 165.00,
      mrp: 180.00,
      cost_price: 128.00,
      barcode_value: 'BSP-DAL-1KG-002',
      track_stock: true,
      category: 'Grains & Staples',
      unit: 'Kilogram',
    },
    {
      name: 'Aashirvaad Atta Wheat 5kg',
      sku: 'BS-ATTA-5KG',
      hsn_code: '1101',
      tax_rate: 0,
      price: 245.00,
      mrp: 270.00,
      cost_price: 195.00,
      barcode_value: 'BSP-ATTA-5KG-003',
      track_stock: true,
      category: 'Grains & Staples',
      unit: 'Piece',
    },
    {
      name: 'Sugar White 1kg',
      sku: 'BS-SUGAR-1KG',
      hsn_code: '1701',
      tax_rate: 5,
      price: 48.00,
      mrp: 52.00,
      cost_price: 40.00,
      barcode_value: 'BSP-SUGAR-1KG-004',
      track_stock: true,
      category: 'Grains & Staples',
      unit: 'Kilogram',
    },
    // Oils & Ghee
    {
      name: 'Fortune Sunflower Oil 1L',
      sku: 'BS-OIL-SNFL-1L',
      hsn_code: '1512',
      tax_rate: 5,
      price: 168.00,
      mrp: 180.00,
      cost_price: 140.00,
      barcode_value: 'BSP-OIL-SNFL-005',
      track_stock: true,
      category: 'Oils & Ghee',
      unit: 'Litre',
    },
    {
      name: 'Amul Pure Ghee 1L Tin',
      sku: 'BS-GHEE-1L',
      hsn_code: '0405',
      tax_rate: 12,
      price: 620.00,
      mrp: 650.00,
      cost_price: 530.00,
      barcode_value: 'BSP-GHEE-1L-006',
      track_stock: true,
      category: 'Oils & Ghee',
      unit: 'Litre',
    },
    // Beverages
    {
      name: 'Tata Tea Gold 500g',
      sku: 'BS-TEA-500G',
      hsn_code: '0902',
      tax_rate: 5,
      price: 255.00,
      mrp: 265.00,
      cost_price: 200.00,
      barcode_value: 'BSP-TEA-500G-007',
      track_stock: true,
      category: 'Beverages & Tea',
      unit: 'Piece',
    },
    {
      name: 'Bru Original Coffee 200g',
      sku: 'BS-COFFEE-200G',
      hsn_code: '0901',
      tax_rate: 5,
      price: 225.00,
      mrp: 240.00,
      cost_price: 180.00,
      barcode_value: 'BSP-COFFEE-200G-008',
      track_stock: true,
      category: 'Beverages & Tea',
      unit: 'Piece',
    },
    {
      name: 'Bisleri Water 1L Bottle',
      sku: 'BS-WATER-1L',
      hsn_code: '2201',
      tax_rate: 18,
      price: 20.00,
      mrp: 20.00,
      cost_price: 12.00,
      barcode_value: 'BSP-WATER-1L-009',
      track_stock: true,
      category: 'Beverages & Tea',
      unit: 'Piece',
    },
    // Snacks
    {
      name: 'Lays Classic Salted 52g',
      sku: 'BS-LAYS-52G',
      hsn_code: '2106',
      tax_rate: 18,
      price: 20.00,
      mrp: 20.00,
      cost_price: 13.50,
      barcode_value: 'BSP-LAYS-52G-010',
      track_stock: true,
      category: 'Snacks & Confectionery',
      unit: 'Piece',
    },
    {
      name: 'Parle-G Glucose Biscuits 250g',
      sku: 'BS-PARLEG-250G',
      hsn_code: '1905',
      tax_rate: 18,
      price: 20.00,
      mrp: 20.00,
      cost_price: 14.00,
      barcode_value: 'BSP-PARLEG-250G-011',
      track_stock: true,
      category: 'Snacks & Confectionery',
      unit: 'Piece',
    },
    {
      name: 'Cadbury Dairy Milk 150g',
      sku: 'BS-CDM-150G',
      hsn_code: '1806',
      tax_rate: 18,
      price: 175.00,
      mrp: 185.00,
      cost_price: 130.00,
      barcode_value: 'BSP-CDM-150G-012',
      track_stock: true,
      category: 'Snacks & Confectionery',
      unit: 'Piece',
    },
    // Dairy
    {
      name: 'Amul Butter 500g',
      sku: 'BS-BUTTER-500G',
      hsn_code: '0405',
      tax_rate: 12,
      price: 285.00,
      mrp: 295.00,
      cost_price: 248.00,
      barcode_value: 'BSP-BUTTER-500G-013',
      track_stock: true,
      category: 'Dairy & Fresh',
      unit: 'Piece',
    },
    {
      name: 'Nandini Full Cream Milk 500ml',
      sku: 'BS-MILK-500ML',
      hsn_code: '0401',
      tax_rate: 0,
      price: 28.00,
      mrp: 28.00,
      cost_price: 22.00,
      barcode_value: 'BSP-MILK-500ML-014',
      track_stock: true,
      category: 'Dairy & Fresh',
      unit: 'Piece',
    },
    // Personal Care
    {
      name: 'Surf Excel Matic Liquid 2kg',
      sku: 'BS-SURF-2KG',
      hsn_code: '3402',
      tax_rate: 18,
      price: 375.00,
      mrp: 399.00,
      cost_price: 298.00,
      barcode_value: 'BSP-SURF-2KG-015',
      track_stock: true,
      category: 'Personal Care & Cleaning',
      unit: 'Piece',
    },
    {
      name: 'Colgate Strong Teeth 300g',
      sku: 'BS-COLGATE-300G',
      hsn_code: '3306',
      tax_rate: 18,
      price: 129.00,
      mrp: 136.00,
      cost_price: 98.00,
      barcode_value: 'BSP-COLGATE-300G-016',
      track_stock: true,
      category: 'Personal Care & Cleaning',
      unit: 'Piece',
    },
    // Apparel
    {
      name: 'Pure Cotton Casual Shirt (L)',
      sku: 'BS-SHIRT-COT-L',
      hsn_code: '6205',
      tax_rate: 5,
      price: 899.00,
      mrp: 999.00,
      cost_price: 480.00,
      barcode_value: 'BSP-SHIRT-COTL-017',
      track_stock: true,
      category: 'Apparel & Textiles',
      unit: 'Piece',
    },
    {
      name: 'Premium Denim Jeans (32)',
      sku: 'BS-JEANS-32',
      hsn_code: '6203',
      tax_rate: 12,
      price: 1499.00,
      mrp: 1699.00,
      cost_price: 799.00,
      barcode_value: 'BSP-JEANS-32-018',
      track_stock: true,
      category: 'Apparel & Textiles',
      unit: 'Piece',
    },
    // Kitchenware
    {
      name: 'Stainless Steel Water Bottle 1L',
      sku: 'BS-BOTTLE-SS-1L',
      hsn_code: '7323',
      tax_rate: 18,
      price: 450.00,
      mrp: 499.00,
      cost_price: 225.00,
      barcode_value: 'BSP-BOTTLE-SS-019',
      track_stock: true,
      category: 'Kitchenware & Utensils',
      unit: 'Piece',
    },
    {
      name: 'Prestige Non-Stick Fry Pan 24cm',
      sku: 'BS-FRYPAN-24CM',
      hsn_code: '7323',
      tax_rate: 18,
      price: 999.00,
      mrp: 1199.00,
      cost_price: 650.00,
      barcode_value: 'BSP-FRYPAN-24CM-020',
      track_stock: true,
      category: 'Kitchenware & Utensils',
      unit: 'Piece',
    },
  ]

  const productMap: Record<string, string> = {}
  for (const prod of productsData) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('organization_id', orgId)
      .eq('barcode_value', prod.barcode_value)
      .maybeSingle()

    if (existing) {
      productMap[prod.name] = existing.id
      log(`Product exists: ${prod.name}`)
      continue
    }

    const unitId = unitMap[prod.unit] || pieceId
    const categoryId = categoryMap[prod.category] || null

    const { data: inserted, error } = await supabase
      .from('products')
      .insert({
        organization_id: orgId,
        name: prod.name,
        sku: prod.sku,
        hsn_code: prod.hsn_code,
        tax_rate: prod.tax_rate,
        price: prod.price,
        mrp: prod.mrp,
        cost_price: prod.cost_price,
        barcode_value: prod.barcode_value,
        track_stock: prod.track_stock,
        category_id: categoryId,
        unit_id: unitId,
        is_active: true,
      })
      .select('id')
      .single()

    if (error) warn(`Product failed: ${prod.name} - ${error.message}`)
    else if (inserted) {
      productMap[prod.name] = inserted.id
      log(`Product: ${prod.name}`)
    }
  }

  // ── 9. Seed Inventory ────────────────────────────────────────────────────
  console.log('\n📊 Seeding inventory levels...')
  const inventoryLevels: Record<string, { stock: number; reorder: number }> = {
    'India Gate Basmati Rice 5kg': { stock: 45, reorder: 10 },
    'Organic Toor Dal 1kg Premium': { stock: 32, reorder: 8 },
    'Aashirvaad Atta Wheat 5kg': { stock: 28, reorder: 8 },
    'Sugar White 1kg': { stock: 60, reorder: 15 },
    'Fortune Sunflower Oil 1L': { stock: 40, reorder: 10 },
    'Amul Pure Ghee 1L Tin': { stock: 22, reorder: 5 },
    'Tata Tea Gold 500g': { stock: 50, reorder: 12 },
    'Bru Original Coffee 200g': { stock: 35, reorder: 8 },
    'Bisleri Water 1L Bottle': { stock: 96, reorder: 24 },
    'Lays Classic Salted 52g': { stock: 120, reorder: 30 },
    'Parle-G Glucose Biscuits 250g': { stock: 80, reorder: 20 },
    'Cadbury Dairy Milk 150g': { stock: 48, reorder: 12 },
    'Amul Butter 500g': { stock: 18, reorder: 6 },
    'Nandini Full Cream Milk 500ml': { stock: 30, reorder: 12 },
    'Surf Excel Matic Liquid 2kg': { stock: 25, reorder: 6 },
    'Colgate Strong Teeth 300g': { stock: 42, reorder: 10 },
    'Pure Cotton Casual Shirt (L)': { stock: 15, reorder: 5 },
    'Premium Denim Jeans (32)': { stock: 12, reorder: 4 },
    'Stainless Steel Water Bottle 1L': { stock: 20, reorder: 5 },
    'Prestige Non-Stick Fry Pan 24cm': { stock: 8, reorder: 3 },
  }

  for (const [name, levels] of Object.entries(inventoryLevels)) {
    const productId = productMap[name]
    if (!productId) continue

    const { data: existing } = await supabase
      .from('inventory')
      .select('product_id')
      .eq('product_id', productId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('inventory')
        .update({ stock_qty: levels.stock, reorder_level: levels.reorder })
        .eq('product_id', productId)
      log(`Inventory updated: ${name} → ${levels.stock} units`)
    } else {
      const { error } = await supabase.from('inventory').insert({
        product_id: productId,
        organization_id: orgId,
        stock_qty: levels.stock,
        reorder_level: levels.reorder,
      })
      if (error) warn(`Inventory failed: ${name} - ${error.message}`)
      else log(`Inventory set: ${name} → ${levels.stock} units`)
    }
  }

  // ── 10. Seed Expenses ────────────────────────────────────────────────────
  console.log('\n💸 Seeding expenses...')
  const today = new Date()
  const thisMonth = today.toISOString().slice(0, 7)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 7)

  const expensesData = [
    { category: 'Rent', amount: 35000, description: 'Monthly shop rent – Ground Floor, 8th Cross Road', date: `${thisMonth}-01` },
    { category: 'Salary', amount: 42000, description: 'Staff payroll – 5 employees (July 2026)', date: `${thisMonth}-05` },
    { category: 'Electricity', amount: 6450, description: 'TANGEDCO commercial electricity bill – Aug 2026', date: `${thisMonth}-10` },
    { category: 'Internet', amount: 1299, description: 'Jio Fiber 200Mbps broadband – Aug 2026', date: `${thisMonth}-15` },
    { category: 'Packaging', amount: 3500, description: 'Carry bags, PP bags, thermal paper rolls', date: `${thisMonth}-08` },
    { category: 'Maintenance', amount: 1800, description: 'Monthly deep cleaning & pest control', date: `${thisMonth}-12` },
    { category: 'Transport', amount: 2400, description: 'Local van hire for stock collection – Koyambedu market', date: `${thisMonth}-06` },
    { category: 'Marketing', amount: 2500, description: 'Facebook & Instagram sponsored ads – August campaign', date: `${thisMonth}-03` },
    { category: 'Miscellaneous', amount: 850, description: 'Office stationery, pen, registers, receipt books', date: `${thisMonth}-11` },
    { category: 'Miscellaneous', amount: 650, description: 'Staff refreshments & tea for the month', date: `${thisMonth}-15` },
    // Last month expenses too
    { category: 'Rent', amount: 35000, description: 'Monthly shop rent – Ground Floor, 8th Cross Road', date: `${lastMonth}-01` },
    { category: 'Salary', amount: 40500, description: 'Staff payroll – 5 employees (June 2026)', date: `${lastMonth}-05` },
    { category: 'Electricity', amount: 7200, description: 'TANGEDCO commercial electricity bill – Jul 2026', date: `${lastMonth}-10` },
    { category: 'Internet', amount: 1299, description: 'Jio Fiber broadband – Jul 2026', date: `${lastMonth}-15` },
    { category: 'Transport', amount: 1800, description: 'Supplier pickup – Apex FMCG monthly run', date: `${lastMonth}-07` },
  ]

  for (const exp of expensesData) {
    const { error } = await supabase.from('expenses').insert({
      organization_id: orgId,
      created_by: userId,
      category: exp.category,
      amount: exp.amount,
      description: exp.description,
      expense_date: exp.date,
    })
    if (error) warn(`Expense failed: ${exp.description} - ${error.message}`)
    else log(`Expense: ${exp.category} ₹${exp.amount} on ${exp.date}`)
  }

  // ── 11. Seed Purchases ───────────────────────────────────────────────────
  console.log('\n📥 Seeding purchases...')
  const apexId = supplierMap['Apex FMCG Wholesale Distributors']
  const heritageId = supplierMap['Heritage Organic Farms & Mills']
  const sunriseId = supplierMap['Sunrise Household & Personal Care']

  const purchasesData = [
    {
      supplier_id: apexId,
      invoice_no: 'APEX-INV-2026-0821',
      purchase_no: 'PUR-2026-001',
      purchase_date: `${thisMonth}-02`,
      purchase_type: 'credit' as const,
      notes: 'Monthly bulk FMCG restock from Apex Wholesale',
      total_amount: 28500,
      items: [
        { product: 'India Gate Basmati Rice 5kg', qty: 20, unit_cost: 295, tax_rate: 5 },
        { product: 'Fortune Sunflower Oil 1L', qty: 30, unit_cost: 140, tax_rate: 5 },
        { product: 'Bisleri Water 1L Bottle', qty: 48, unit_cost: 12, tax_rate: 18 },
        { product: 'Lays Classic Salted 52g', qty: 60, unit_cost: 13.50, tax_rate: 18 },
        { product: 'Parle-G Glucose Biscuits 250g', qty: 40, unit_cost: 14, tax_rate: 18 },
      ],
    },
    {
      supplier_id: heritageId,
      invoice_no: 'HER-INV-2026-0745',
      purchase_no: 'PUR-2026-002',
      purchase_date: `${thisMonth}-05`,
      purchase_type: 'cash' as const,
      notes: 'Organic grains and dals from Heritage Farms',
      total_amount: 12800,
      items: [
        { product: 'Organic Toor Dal 1kg Premium', qty: 25, unit_cost: 128, tax_rate: 5 },
        { product: 'Aashirvaad Atta Wheat 5kg', qty: 15, unit_cost: 195, tax_rate: 0 },
        { product: 'Sugar White 1kg', qty: 30, unit_cost: 40, tax_rate: 5 },
      ],
    },
    {
      supplier_id: sunriseId,
      invoice_no: 'SUN-INV-2026-0312',
      purchase_no: 'PUR-2026-003',
      purchase_date: `${thisMonth}-08`,
      purchase_type: 'credit' as const,
      notes: 'Household & personal care category restock',
      total_amount: 9200,
      items: [
        { product: 'Surf Excel Matic Liquid 2kg', qty: 12, unit_cost: 298, tax_rate: 18 },
        { product: 'Colgate Strong Teeth 300g', qty: 24, unit_cost: 98, tax_rate: 18 },
      ],
    },
  ]

  for (const pur of purchasesData) {
    const { data: purchase, error: purErr } = await supabase
      .from('purchases')
      .insert({
        organization_id: orgId,
        supplier_id: pur.supplier_id,
        invoice_no: pur.invoice_no,
        purchase_no: pur.purchase_no,
        purchase_date: pur.purchase_date,
        purchase_type: pur.purchase_type,
        notes: pur.notes,
        total_amount: pur.total_amount,
        created_by: userId,
      })
      .select('id')
      .single()

    if (purErr || !purchase) {
      warn(`Purchase failed: ${pur.invoice_no} - ${purErr?.message}`)
      continue
    }
    log(`Purchase: ${pur.invoice_no} (${pur.items.length} items)`)

    for (const item of pur.items) {
      const productId = productMap[item.product]
      if (!productId) { warn(`Product not found for purchase item: ${item.product}`); continue }
      const lineTotal = item.qty * item.unit_cost
      const taxableAmount = lineTotal
      const gstAmount = taxableAmount * (item.tax_rate / 100)
      const cgst = gstAmount / 2
      const sgst = gstAmount / 2

      const { error: itemErr } = await supabase.from('purchase_items').insert({
        purchase_id: purchase.id,
        organization_id: orgId,
        product_id: productId,
        product_name: item.product,
        qty: item.qty,
        unit_cost: item.unit_cost,
        line_total: lineTotal + gstAmount,
        tax_rate: item.tax_rate,
        taxable_amount: taxableAmount,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: 0,
      })
      if (itemErr) warn(`Purchase item failed: ${item.product} - ${itemErr.message}`)
      else log(`  → Purchase item: ${item.product} x${item.qty}`)
    }
  }

  // ── 12. Seed Sales ───────────────────────────────────────────────────────
  console.log('\n🧾 Seeding sales transactions...')
  const walkinId = customerMap['Walk-in Customer']
  const rameshId = customerMap['Ramesh Babu Iyer']
  const kavithaId = customerMap['Kavitha Sundaram']
  const sriMuruganId = customerMap['Sri Murugan Departmental Stores']
  const anbuId = customerMap['Anbu Mani Kumar']

  // Helper: create a sale with items
  async function createSale(opts: {
    invoiceNo: string
    customerId: string | null
    paymentMode: string
    daysAgo: number
    notes?: string
    items: Array<{ product: string; qty: number }>
  }) {
    const { data: existingSale } = await supabase
      .from('sales')
      .select('id')
      .eq('organization_id', orgId)
      .eq('invoice_no', opts.invoiceNo)
      .maybeSingle()

    if (existingSale) {
      log(`Sale exists: ${opts.invoiceNo}`)
      return
    }

    let subtotal = 0
    let taxTotal = 0
    const lineItems = []

    for (const it of opts.items) {
      const productId = productMap[it.product]
      if (!productId) { warn(`Product not found for sale: ${it.product}`); continue }
      const prod = productsData.find((p) => p.name === it.product)
      if (!prod) continue
      const unitPrice = prod.price
      const lineBase = it.qty * unitPrice
      const gst = lineBase * (prod.tax_rate / 100)
      const cgst = gst / 2
      const sgst = gst / 2
      const lineTotal = lineBase + gst

      subtotal += lineBase
      taxTotal += gst

      lineItems.push({
        organization_id: orgId,
        product_id: productId,
        product_name: prod.name,
        hsn_code: prod.hsn_code,
        qty: it.qty,
        unit_price: unitPrice,
        discount_pct: 0,
        tax_rate: prod.tax_rate,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: 0,
        line_total: lineTotal,
      })
    }

    if (!lineItems.length) return

    const grandTotal = subtotal + taxTotal
    const saleDate = new Date()
    saleDate.setDate(saleDate.getDate() - opts.daysAgo)

    const payAmount: Record<string, number> = {}
    if (opts.paymentMode === 'cash') payAmount['cash_amount'] = grandTotal
    else if (opts.paymentMode === 'upi') payAmount['upi_amount'] = grandTotal
    else if (opts.paymentMode === 'card') payAmount['card_amount'] = grandTotal

    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        organization_id: orgId,
        invoice_no: opts.invoiceNo,
        customer_id: opts.customerId,
        subtotal,
        discount_total: 0,
        tax_total: taxTotal,
        grand_total: grandTotal,
        payment_mode: opts.paymentMode,
        notes: opts.notes ?? null,
        created_by: userId,
        created_at: saleDate.toISOString(),
        ...payAmount,
      })
      .select('id')
      .single()

    if (saleErr || !sale) {
      warn(`Sale failed: ${opts.invoiceNo} - ${saleErr?.message}`)
      return
    }

    const { error: itemsErr } = await supabase
      .from('sale_items')
      .insert(lineItems.map((li) => ({ ...li, sale_id: sale.id })))

    if (itemsErr) warn(`Sale items failed for ${opts.invoiceNo}: ${itemsErr.message}`)
    else log(`Sale: ${opts.invoiceNo} – ₹${grandTotal.toFixed(0)} (${opts.paymentMode})`)
  }

  await createSale({ invoiceNo: 'INV-2026-001', customerId: walkinId, paymentMode: 'cash', daysAgo: 13, items: [{ product: 'Bisleri Water 1L Bottle', qty: 6 }, { product: 'Lays Classic Salted 52g', qty: 3 }, { product: 'Parle-G Glucose Biscuits 250g', qty: 2 }] })
  await createSale({ invoiceNo: 'INV-2026-002', customerId: rameshId, paymentMode: 'upi', daysAgo: 12, items: [{ product: 'India Gate Basmati Rice 5kg', qty: 2 }, { product: 'Organic Toor Dal 1kg Premium', qty: 2 }, { product: 'Fortune Sunflower Oil 1L', qty: 2 }] })
  await createSale({ invoiceNo: 'INV-2026-003', customerId: walkinId, paymentMode: 'cash', daysAgo: 12, items: [{ product: 'Tata Tea Gold 500g', qty: 1 }, { product: 'Sugar White 1kg', qty: 2 }, { product: 'Amul Butter 500g', qty: 1 }] })
  await createSale({ invoiceNo: 'INV-2026-004', customerId: kavithaId, paymentMode: 'upi', daysAgo: 11, items: [{ product: 'Surf Excel Matic Liquid 2kg', qty: 1 }, { product: 'Colgate Strong Teeth 300g', qty: 2 }, { product: 'Nandini Full Cream Milk 500ml', qty: 4 }] })
  await createSale({ invoiceNo: 'INV-2026-005', customerId: sriMuruganId, paymentMode: 'card', daysAgo: 10, items: [{ product: 'India Gate Basmati Rice 5kg', qty: 5 }, { product: 'Aashirvaad Atta Wheat 5kg', qty: 3 }, { product: 'Fortune Sunflower Oil 1L', qty: 6 }] })
  await createSale({ invoiceNo: 'INV-2026-006', customerId: walkinId, paymentMode: 'cash', daysAgo: 10, items: [{ product: 'Cadbury Dairy Milk 150g', qty: 3 }, { product: 'Bisleri Water 1L Bottle', qty: 2 }] })
  await createSale({ invoiceNo: 'INV-2026-007', customerId: anbuId, paymentMode: 'upi', daysAgo: 9, items: [{ product: 'Amul Pure Ghee 1L Tin', qty: 1 }, { product: 'Tata Tea Gold 500g', qty: 1 }, { product: 'Bru Original Coffee 200g', qty: 1 }] })
  await createSale({ invoiceNo: 'INV-2026-008', customerId: walkinId, paymentMode: 'cash', daysAgo: 8, items: [{ product: 'Prestige Non-Stick Fry Pan 24cm', qty: 1 }, { product: 'Stainless Steel Water Bottle 1L', qty: 2 }] })
  await createSale({ invoiceNo: 'INV-2026-009', customerId: rameshId, paymentMode: 'card', daysAgo: 7, items: [{ product: 'Pure Cotton Casual Shirt (L)', qty: 2 }, { product: 'Premium Denim Jeans (32)', qty: 1 }] })
  await createSale({ invoiceNo: 'INV-2026-010', customerId: walkinId, paymentMode: 'cash', daysAgo: 7, items: [{ product: 'Sugar White 1kg', qty: 3 }, { product: 'Parle-G Glucose Biscuits 250g', qty: 4 }, { product: 'Lays Classic Salted 52g', qty: 5 }] })
  await createSale({ invoiceNo: 'INV-2026-011', customerId: kavithaId, paymentMode: 'upi', daysAgo: 6, items: [{ product: 'Nandini Full Cream Milk 500ml', qty: 6 }, { product: 'Amul Butter 500g', qty: 1 }, { product: 'Bru Original Coffee 200g', qty: 1 }] })
  await createSale({ invoiceNo: 'INV-2026-012', customerId: sriMuruganId, paymentMode: 'card', daysAgo: 5, items: [{ product: 'Surf Excel Matic Liquid 2kg', qty: 3 }, { product: 'Colgate Strong Teeth 300g', qty: 6 }] })
  await createSale({ invoiceNo: 'INV-2026-013', customerId: walkinId, paymentMode: 'cash', daysAgo: 4, items: [{ product: 'Cadbury Dairy Milk 150g', qty: 2 }, { product: 'Bisleri Water 1L Bottle', qty: 4 }, { product: 'Tata Tea Gold 500g', qty: 1 }] })
  await createSale({ invoiceNo: 'INV-2026-014', customerId: anbuId, paymentMode: 'upi', daysAgo: 3, items: [{ product: 'India Gate Basmati Rice 5kg', qty: 1 }, { product: 'Aashirvaad Atta Wheat 5kg', qty: 1 }, { product: 'Organic Toor Dal 1kg Premium', qty: 2 }] })
  await createSale({ invoiceNo: 'INV-2026-015', customerId: walkinId, paymentMode: 'cash', daysAgo: 2, items: [{ product: 'Stainless Steel Water Bottle 1L', qty: 1 }, { product: 'Lays Classic Salted 52g', qty: 2 }, { product: 'Parle-G Glucose Biscuits 250g', qty: 2 }] })
  await createSale({ invoiceNo: 'INV-2026-016', customerId: rameshId, paymentMode: 'upi', daysAgo: 1, items: [{ product: 'Pure Cotton Casual Shirt (L)', qty: 1 }, { product: 'Amul Pure Ghee 1L Tin', qty: 1 }] })
  await createSale({ invoiceNo: 'INV-2026-017', customerId: walkinId, paymentMode: 'cash', daysAgo: 0, items: [{ product: 'Sugar White 1kg', qty: 2 }, { product: 'Bisleri Water 1L Bottle', qty: 6 }, { product: 'Cadbury Dairy Milk 150g', qty: 1 }] })

  // ── 13. Seed Quotations ──────────────────────────────────────────────────
  console.log('\n📝 Seeding quotations...')
  const quotationsData = [
    {
      quote_no: 'QT-2026-001',
      customer_name: 'Sri Murugan Departmental Stores',
      customer_phone: '04422887766',
      status: 'accepted',
      valid_until: `${thisMonth}-20`,
      notes: 'Bulk supply order for festival season. 30-day credit.',
      items: [
        { product: 'India Gate Basmati Rice 5kg', qty: 20, unit_price: 365 },
        { product: 'Fortune Sunflower Oil 1L', qty: 24, unit_price: 158 },
        { product: 'Aashirvaad Atta Wheat 5kg', qty: 12, unit_price: 230 },
      ],
    },
    {
      quote_no: 'QT-2026-002',
      customer_name: 'Ramesh Babu Iyer',
      customer_phone: '9841234501',
      status: 'sent',
      valid_until: `${thisMonth}-25`,
      notes: 'Home delivery bulk order – kitchen essentials',
      items: [
        { product: 'Tata Tea Gold 500g', qty: 3, unit_price: 250 },
        { product: 'Bru Original Coffee 200g', qty: 2, unit_price: 220 },
        { product: 'Amul Pure Ghee 1L Tin', qty: 2, unit_price: 610 },
      ],
    },
    {
      quote_no: 'QT-2026-003',
      customer_name: 'Kavitha Sundaram',
      customer_phone: '9841234502',
      status: 'draft',
      valid_until: null,
      notes: 'Monthly household purchase estimate',
      items: [
        { product: 'Surf Excel Matic Liquid 2kg', qty: 2, unit_price: 375 },
        { product: 'Colgate Strong Teeth 300g', qty: 3, unit_price: 129 },
        { product: 'Nandini Full Cream Milk 500ml', qty: 8, unit_price: 28 },
      ],
    },
    {
      quote_no: 'QT-2026-004',
      customer_name: 'Anbu Mani Kumar',
      customer_phone: '9841234503',
      status: 'rejected',
      valid_until: `${thisMonth}-10`,
      notes: 'Garment order – cancelled, out of stock size',
      items: [
        { product: 'Pure Cotton Casual Shirt (L)', qty: 5, unit_price: 850 },
        { product: 'Premium Denim Jeans (32)', qty: 3, unit_price: 1400 },
      ],
    },
  ]

  for (const quot of quotationsData) {
    const { data: existingQ } = await supabase
      .from('quotations')
      .select('id')
      .eq('organization_id', orgId)
      .eq('quote_no', quot.quote_no)
      .maybeSingle()

    if (existingQ) { log(`Quotation exists: ${quot.quote_no}`); continue }

    let grandTotal = 0
    for (const qi of quot.items) grandTotal += qi.qty * qi.unit_price

    const { data: qInserted, error: qErr } = await supabase
      .from('quotations')
      .insert({
        organization_id: orgId,
        quote_no: quot.quote_no,
        customer_name: quot.customer_name,
        customer_phone: quot.customer_phone,
        status: quot.status,
        valid_until: quot.valid_until,
        notes: quot.notes,
        total_amount: grandTotal,
        created_by: userId,
      })
      .select('id')
      .single()

    if (qErr || !qInserted) { warn(`Quotation failed: ${quot.quote_no} - ${qErr?.message}`); continue }
    log(`Quotation: ${quot.quote_no} (${quot.status})`)

    for (const qi of quot.items) {
      const productId = productMap[qi.product]
      if (!productId) continue
      const prod = productsData.find((p) => p.name === qi.product)
      const lineTotal = qi.qty * qi.unit_price
      await supabase.from('quotation_items').insert({
          quotation_id: qInserted.id,
          organization_id: orgId,
          product_name: qi.product,
          qty: qi.qty,
          unit_price: qi.unit_price,
          discount_pct: 0,
          line_total: lineTotal,
        })
    }
  }

  // ── 14. Seed Promotions ──────────────────────────────────────────────────
  console.log('\n🎁 Seeding promotions...')
  const promotionsData = [
    {
      name: 'Festival Season 10% Off',
      code: 'FESTIVAL10',
      type: 'percentage',
      scope: 'order',
      value: 10,
      min_order_amount: 1000,
      max_discount_amount: 300,
      max_uses: 200,
      valid_from: `${thisMonth}-01`,
      valid_until: `${thisMonth}-31`,
      is_active: true,
      usage_count: 23,
    },
    {
      name: 'Flat ₹100 Off',
      code: 'FLAT100',
      type: 'flat',
      scope: 'order',
      value: 100,
      min_order_amount: 1500,
      max_discount_amount: null,
      max_uses: 100,
      valid_from: `${thisMonth}-01`,
      valid_until: `${thisMonth}-31`,
      is_active: true,
      usage_count: 8,
    },
    {
      name: 'New Customer Welcome',
      code: 'WELCOME50',
      type: 'flat',
      scope: 'order',
      value: 50,
      min_order_amount: 500,
      max_discount_amount: null,
      max_uses: 50,
      valid_from: null,
      valid_until: null,
      is_active: true,
      usage_count: 14,
    },
  ]

  for (const promo of promotionsData) {
    const { data: existingP } = await supabase
      .from('promotions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('code', promo.code)
      .maybeSingle()

    if (existingP) { log(`Promotion exists: ${promo.code}`); continue }

    const { error: promoErr } = await supabase.from('promotions').insert({
      organization_id: orgId,
      ...promo,
    })
    if (promoErr) warn(`Promotion failed: ${promo.code} - ${promoErr.message}`)
    else log(`Promotion: ${promo.name} (${promo.code})`)
  }

  // ── 15. Seed Routine Works ───────────────────────────────────────────────
  console.log('\n⏰ Seeding routine works...')
  const routinesData = [
    {
      name: 'Monthly Shop Rent',
      category: 'rent' as const,
      default_amount: 35000,
      due_day: 1,
      is_active: true,
    },
    {
      name: 'Staff Payroll',
      category: 'salary' as const,
      default_amount: 42000,
      due_day: 5,
      is_active: true,
    },
    {
      name: 'Electricity Bill',
      category: 'utilities' as const,
      default_amount: 6500,
      due_day: 10,
      is_active: true,
    },
    {
      name: 'Internet & Broadband',
      category: 'utilities' as const,
      default_amount: 1299,
      due_day: 15,
      is_active: true,
    },
    {
      name: 'Facility Maintenance',
      category: 'maintenance' as const,
      default_amount: 2000,
      due_day: 20,
      is_active: true,
    },
  ]

  for (const routine of routinesData) {
    const { data: existingR } = await supabase
      .from('recurring_templates')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', routine.name)
      .maybeSingle()

    if (existingR) { log(`Routine exists: ${routine.name}`); continue }

    const { error: routineErr } = await supabase.from('recurring_templates').insert({
      organization_id: orgId,
      ...routine,
    })
    if (routineErr) warn(`Routine failed: ${routine.name} - ${routineErr.message}`)
    else log(`Routine: ${routine.name} (due day ${routine.due_day})`)
  }

  console.log('\n🎉 Demo data seeding complete!')
  console.log('─'.repeat(60))
  console.log('✅ Employees: 6')
  console.log('✅ Suppliers: 6')
  console.log('✅ Customers: 8')
  console.log('✅ Categories: 9')
  console.log('✅ Products: 20')
  console.log('✅ Inventory: 20 SKUs with stock levels')
  console.log('✅ Purchases: 3 (with items)')
  console.log('✅ Sales: 17 transactions (last 14 days)')
  console.log('✅ Expenses: 15')
  console.log('✅ Quotations: 4')
  console.log('✅ Promotions: 3')
  console.log('✅ Routine Works: 5')
  console.log('\n🚀 Visit http://localhost:5173 to see your data!')
}

run().catch(console.error)
