import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Store, Loader2, Lock, ArrowRight, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const { session, refreshOrg, loading: authLoading } = useAuth()
  const [initWait, setInitWait] = useState(true)
  const [saving, setSaving] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setInitWait(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!initWait && !authLoading && !session) {
      toast.error('You must be logged in via your invitation link.')
      navigate('/login')
    }
  }, [initWait, authLoading, session, navigate])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setSaving(true)
    try {
      // 1. Set the password permanently
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // 2. Accept the invite (creates membership and links assigned_branch_id)
      const { error: rpcError } = await supabase.rpc('accept_invite_by_email')
      if (rpcError) {
        console.error("Accept invite RPC error:", rpcError)
        throw new Error(`Activation error: ${rpcError.message}`)
      }

      // 3. Refresh user organization state
      await refreshOrg()

      // 4. Verify if membership was successfully linked
      const { data: mems } = await supabase
        .from('memberships')
        .select('organization_id')
        .eq('user_id', session?.user?.id || '')

      if (!mems || mems.length === 0) {
        toast.error('Invitation record not found for this email. Please ask store owner to resend invite.')
        setSaving(false)
        return
      }

      toast.success('Password set successfully! Welcome to Billscape.')
      
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 500)

    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to set password.')
    } finally {
      setSaving(false)
    }

  }


  if (authLoading || initWait) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    )
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30">
            <Store className="w-8 h-8 text-indigo-400" />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Welcome to Billscape</h1>
            <p className="text-zinc-400 text-sm">
              Please set a permanent password for your account before accessing the dashboard.
            </p>
          </div>

          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-zinc-950 border-zinc-800"
                  placeholder="At least 8 characters"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 bg-zinc-950 border-zinc-800"
                  placeholder="Type your password again"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Save Password & Continue
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
