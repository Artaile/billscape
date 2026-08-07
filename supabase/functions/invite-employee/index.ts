import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  const { method } = req
  if (method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Initialize supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get current user auth info
    const { data: { user: currentUser }, error: userError } = await userClient.auth.getUser()
    if (userError || !currentUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized user verification failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const { employeeId, email, role, customRoleId, organizationId, employeeName } = await req.json()
    if (!email || !role || !organizationId) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Verify owner permissions of the current user in this organization
    const { data: membership, error: memError } = await adminClient
      .from('memberships')
      .select('role')
      .eq('user_id', currentUser.id)
      .eq('organization_id', organizationId)
      .single()

    if (memError || !membership || membership.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only the dashboard Owner can invite users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Check if employee is already invited or has dashboard access
    if (employeeId) {
      const { data: existingLink } = await adminClient
        .from('memberships')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('employee_id', employeeId)
        .limit(1)
        .maybeSingle()

      if (existingLink) {
        return new Response(JSON.stringify({ error: 'This employee is already a dashboard user or has a pending invitation' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // 3. Send Supabase invitation email
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${req.headers.get('origin') || 'http://localhost:5174'}/login`,
        data: {
          organization_id: organizationId,
          invited_role: role
        }
      }
    )

    if (inviteError || !inviteData?.user) {
      return new Response(JSON.stringify({ error: inviteError?.message ?? 'Failed to send invitation' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const invitedUser = inviteData.user

    // 4. Create membership entry with is_active = true
    const { error: insertMemError } = await adminClient
      .from('memberships')
      .insert({
        user_id: invitedUser.id,
        organization_id: organizationId,
        role: role,
        employee_id: employeeId || null,
        custom_role_id: customRoleId || null,
        is_active: true
      })

    if (insertMemError) {
      // Cleanup the invited user if membership fails to keep database state consistent
      await adminClient.auth.admin.deleteUser(invitedUser.id)
      return new Response(JSON.stringify({ error: 'Failed to create user membership: ' + insertMemError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 5. Update employee's email if it was modified/added during invitation
    if (employeeId) {
      await adminClient
        .from('employees')
        .update({ email: email })
        .eq('id', employeeId)
    }

    // 6. Log to activity log
    await adminClient
      .from('activity_log')
      .insert({
        organization_id: organizationId,
        actor_id: currentUser.id,
        actor_name: currentUser.user_metadata?.full_name ?? currentUser.email ?? 'Owner',
        action: 'DashboardUser_invited',
        entity: 'Memberships',
        entity_id: invitedUser.id,
        metadata: {
          employee_name: employeeName ?? email,
          email,
          role
        }
      })

    return new Response(JSON.stringify({ message: 'User invited successfully', user: invitedUser }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
