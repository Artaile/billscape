import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bzvbkscspzdschskbqtd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmJrc2NzcHpkc2Noc2ticXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTY1OTQsImV4cCI6MjEwMDIzMjU5NH0.6wVrlIR__mVCCLyBqftUv2nLKYav9kCReg7Z3DBTkN4'

const EMAIL = 'muhammadfazilsl455@gmail.com'
const PASSWORD = 'Fazil2512@'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function check() {
  await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  
  const pRes = await supabase.from('plans').select('*')
  console.log('plans:', pRes.data, pRes.error)

  const opRes = await supabase.from('org_plans').select('*')
  console.log('org_plans:', opRes.data, opRes.error)

  const oRes = await supabase.from('organizations').select('id, name, plan_id, plan').limit(5)
  console.log('organizations sample:', oRes.data, oRes.error)

  const osRes = await supabase.from('org_settings').select('organization_id, feature_flags').limit(5)
  console.log('org_settings sample:', osRes.data, osRes.error)
}

check()
