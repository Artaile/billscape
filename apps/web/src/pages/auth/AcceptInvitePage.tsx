import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Loader2, LogOut, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character')
})

type SetPasswordValues = z.infer<typeof setPasswordSchema>

export function AcceptInvitePage() {
  const { session, loading: authLoading, signOut } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
  })

  const passwordValue = watch('password', '')

  // Redirect to login if no session is active (meaning they didn't arrive via a valid link)
  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/login', { replace: true })
    }
  }, [session, authLoading, navigate])

  const onSubmit = async (values: SetPasswordValues) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      })
      if (error) {
        toast.error('Failed to set password', error.message)
        return
      }
      
      setSuccess(true)
      toast.success('Password set successfully!')
      
      // Briefly show success state then redirect to dashboard
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch {
      toast.error('Unexpected error', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    sessionStorage.removeItem('pending_invite_redirect')
    navigate('/login')
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-900/30 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-900/20 blur-3xl animate-pulse [animation-delay:2s]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 bg-indigo-500 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
              <Store className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Accept Invitation</h1>
            <p className="text-zinc-400 text-center text-sm">
              Welcome to BillScape! Please set a secure password for your account to accept the invitation and continue.
            </p>
            <div className="mt-4 px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-300">
              Invited as: <span className="font-semibold text-white">{session.user.email}</span>
            </div>
          </div>

          {success ? (
            <div className="flex flex-col items-center py-6 text-center animate-in fade-in zoom-in duration-300">
              <div className="h-16 w-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">You're all set!</h2>
              <p className="text-zinc-400">Taking you to your dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password">Set Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter a secure password"
                  {...register('password')}
                  className="bg-zinc-800/50 border-zinc-700 h-11"
                />
                
                {/* Password Strength Indicator */}
                {passwordValue.length > 0 && (
                  <div className="mt-3 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'length', label: '8+ characters', pass: passwordValue.length >= 8 },
                        { key: 'upper', label: 'Uppercase (A-Z)', pass: /[A-Z]/.test(passwordValue) },
                        { key: 'lower', label: 'Lowercase (a-z)', pass: /[a-z]/.test(passwordValue) },
                        { key: 'special', label: 'Special char', pass: /[^A-Za-z0-9]/.test(passwordValue) },
                      ].map(({ key, label, pass }) => (
                        <div key={key} className={cn('flex items-center gap-1.5 text-xs', pass ? 'text-emerald-400' : 'text-zinc-500')}>
                          <div className={cn('h-1.5 w-1.5 rounded-full', pass ? 'bg-emerald-400' : 'bg-zinc-700')} />
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {errors.password && (
                  <p className="text-sm text-red-400 mt-1">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-3 pt-2">
                <Button type="submit" className="w-full h-11 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving password...
                    </>
                  ) : (
                    'Set Password & Accept'
                  )}
                </Button>
                
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={handleSignOut}
                  className="w-full h-11 text-sm text-zinc-400 hover:text-zinc-200"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out / Cancel
                </Button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
