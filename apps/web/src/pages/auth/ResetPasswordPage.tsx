import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Lock, Loader2, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetValues = z.infer<typeof resetSchema>

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

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [done, setDone] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(!!data.session)
      setCheckingSession(false)
    })
  }, [])

  const onSubmit = async (values: ResetValues) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password })
      if (error) {
        toast.error('Could not reset password', error.message)
        return
      }
      setDone(true)
    } catch {
      toast.error('Unexpected error', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-zinc-950">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-900/30 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-900/20 blur-3xl animate-pulse [animation-delay:2s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-indigo-800/10 blur-3xl" />
      </div>

      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-xl shadow-2xl shadow-black/50 p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-900/50 mb-3">
              <Store className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">BillScape</h1>
            <p className="text-sm text-zinc-400 mt-1">Smart billing for every shop</p>
          </div>

          {checkingSession ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950 border border-emerald-800 mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Password updated</h2>
                <p className="text-sm text-zinc-400 mt-2">
                  Your password has been reset successfully. You can now sign in with your new password.
                </p>
              </div>
              <Button
                type="button"
                className="w-full h-10 text-sm font-semibold"
                onClick={async () => {
                  await supabase.auth.signOut()
                  navigate('/login', { replace: true })
                }}
              >
                Go to Sign In
              </Button>
            </div>
          ) : !hasRecoverySession ? (
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-950 border border-red-800 mx-auto">
                <KeyRound className="h-8 w-8 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Reset link expired</h2>
                <p className="text-sm text-zinc-400 mt-2">
                  This password reset link is invalid or has expired. Please request a new one.
                </p>
              </div>
              <Button
                type="button"
                className="w-full h-10 text-sm font-semibold"
                onClick={() => navigate('/login', { replace: true })}
              >
                Back to Sign In
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-base font-semibold text-white">Set a new password</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Enter and confirm your new password below.
                </p>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      autoComplete="new-password"
                      {...register('password', {
                        onChange: (e) => setPasswordValue(e.target.value),
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-400">{errors.password.message}</p>
                  )}
                  {passwordValue.length > 0 && (() => {
                    const { checks, score } = getPasswordStrength(passwordValue)
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
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      autoComplete="new-password"
                      {...register('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full h-10 text-sm font-semibold" disabled={loading}>
                  {loading ? (
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
          )}
        </div>
      </div>
    </div>
  )
}
