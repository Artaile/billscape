import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Store, Loader2, CheckCircle2, Lock, ArrowRight } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const inviteId = searchParams.get('invite')
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [step, setStep] = useState<1 | 2>(1)
  const [inviteData, setInviteData] = useState<any>(null)
  
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    if (!inviteId) {
      setError('Invalid or missing invitation link.')
      setLoading(false)
      return
    }

    async function checkInvite() {
      const { data, error } = await supabase.rpc('get_user_invitation', { p_invite_id: inviteId })
      
      if (error || !data || data.length === 0) {
        setError('Invitation not found or has been revoked.')
        setLoading(false)
        return
      }

      const invite = data[0]

      if (new Date(invite.expires_at).getTime() < Date.now()) {
        setError('This invitation link has expired. Please ask your administrator for a new one.')
        setLoading(false)
        return
      }

      setInviteData(invite)
      setLoading(false)
    }

    checkInvite()
  }, [inviteId])

  const verifyOtp = async () => {
    const { data: isValid, error } = await supabase.rpc('verify_invite_otp', { 
      p_invite_id: inviteId, 
      p_otp: otp 
    })
    
    if (error || !isValid) {
      toast.error('Invalid OTP. Please check the code provided by your administrator.')
      return
    }
    setStep(2)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      // 1. Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: inviteData.email,
        password: password,
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('User creation failed')

      // 2. Call secure RPC to link employee and create membership
      const { error: rpcError } = await supabase.rpc('accept_dashboard_invite', {
        p_invite_id: inviteId,
        p_user_id: authData.user.id,
        p_otp: otp
      })

      if (rpcError) {
        console.error("RPC Error:", rpcError)
        throw new Error(rpcError.message || 'Failed to link account')
      }

      toast.success('Registration successful! Welcome to Billscape.')
      
      // Give a tiny delay for auth state to propagate, then redirect
      setTimeout(() => {
        navigate('/dashboard')
      }, 1000)

    } catch (err: any) {
      toast.error('Registration failed', err.message)
      setLoading(false)
    }
  }

  if (loading && !inviteData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => navigate('/login')} className="mt-4 w-full">Go to Login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
            <Store className="h-5 w-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-zinc-100 tracking-tight">Billscape</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-xl relative overflow-hidden">
          
          <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
            <div 
              className="h-full bg-indigo-500 transition-all duration-500 ease-out" 
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>

          {step === 1 ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-foreground">You're Invited!</h2>
                <p className="text-sm text-muted-foreground">
                  You have been invited to join as a <span className="font-semibold text-emerald-400 capitalize">{inviteData?.role}</span>.
                  <br/>Please enter the 6-digit OTP provided by your administrator.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>6-Digit Code</Label>
                  <Input 
                    value={otp} 
                    onChange={e => setOtp(e.target.value)} 
                    placeholder="123456" 
                    maxLength={6}
                    className="text-center tracking-widest text-lg font-mono"
                  />
                </div>
                <Button className="w-full" size="lg" onClick={verifyOtp} disabled={otp.length !== 6}>
                  Verify & Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="text-center space-y-2">
                <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Code Verified</h2>
                <p className="text-sm text-muted-foreground">
                  Set a secure password for your account.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={inviteData?.email} disabled className="bg-zinc-900/50 text-zinc-500" />
                </div>
                
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="••••••••"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input 
                    type="password" 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    placeholder="••••••••"
                  />
                </div>
                
                <Button type="submit" className="w-full" size="lg" disabled={loading || !password || !confirmPassword}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {loading ? 'Creating Account...' : 'Complete Registration'}
                </Button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
