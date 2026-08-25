import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bzvbkscspzdschskbqtd.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmJrc2NzcHpkc2Noc2ticXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTY1OTQsImV4cCI6MjEwMDIzMjU5NH0.6wVrlIR__mVCCLyBqftUv2nLKYav9kCReg7Z3DBTkN4'

const EMAIL = 'muhammadfazilsl455@gmail.com'
const PASSWORD = 'Fazil2512@'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
  console.log('🔐 Authenticating...')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  if (authErr || !authData.user) {
    console.error('❌ Auth error:', authErr)
    return
  }

  console.log('✅ Logged in user ID:', authData.user.id)

  // Fetch current profile
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single()

  console.log('📄 Current profile:', profile, pErr)

  // Update is_super_admin to true
  const { data: updated, error: uErr } = await supabase
    .from('profiles')
    .update({ is_super_admin: true })
    .eq('id', authData.user.id)
    .select()

  console.log('🚀 Update result:', updated, uErr)
}

run()
