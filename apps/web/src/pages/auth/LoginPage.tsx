import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Mail, Lock, Loader2, UserPlus, LogIn, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const signUpSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
})

const emailSchema = signInSchema

const forgotSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

type EmailValues = z.infer<typeof emailSchema>
type ForgotValues = z.infer<typeof forgotSchema>

const setPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
})
type SetPasswordValues = z.infer<typeof setPasswordSchema>

type Mode = 'signin' | 'signup' | 'forgot' | 'verify-email' | 'forgot-sent' | 'set-password'

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

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [loading, setLoading] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(mode === 'signup' ? signUpSchema : signInSchema),
  })

  const {
    register: registerForgot,
    handleSubmit: handleForgotSubmit,
    reset: resetForgot,
    formState: { errors: forgotErrors },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
  })

  const {
    register: registerSetPassword,
    handleSubmit: handleSetPasswordSubmit,
    reset: resetSetPassword,
    formState: { errors: setPasswordErrors },
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
  })

  // Detect if redirect hash contains access token for invitation / password recovery or an error
  React.useEffect(() => {
    const hash = window.location.hash
    const search = window.location.search
    
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1))
      const desc = params.get('error_description')
      if (desc) {
        toast.error('Authentication Error', desc.replace(/\+/g, ' '))
      }
      window.history.replaceState(null, '', window.location.pathname)
      return
    }

    if (hash.includes('type=invite') || hash.includes('type=recovery') || hash.includes('access_token=') || search.includes('type=invite') || search.includes('type=recovery')) {
      setMode('set-password')
    }
  }, [])



  const switchMode = (m: Mode) => {
    setMode(m)
    setShowPassword(false)
    setPasswordValue('')
    reset()
    resetForgot()
    resetSetPassword()
  }

  const onSubmit = async (values: EmailValues) => {
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
        })
        if (error) {
          const msg = error.message.toLowerCase().includes('rate limit')
            ? 'Too many signups. Please wait a few minutes and try again.'
            : error.message
          toast.error('Sign up failed', msg)
          return
        }
        if (data.user && data.user.identities?.length === 0) {
          toast.error(
            'Account already exists',
            'This email is already registered but not verified yet. Use "Resend verification email" below, or sign in if you already verified it.'
          )
          setVerifyEmail(values.email)
          setMode('verify-email')
          return
        }
        setVerifyEmail(values.email)
        setMode('verify-email')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        })
        if (error) {
          toast.error('Sign in failed', error.message)
          return
        }
        navigate('/')
      }
    } catch {
      toast.error('Unexpected error', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onResendVerification = async () => {
    if (!verifyEmail) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: verifyEmail,
      })
      if (error) {
        const msg = error.message.toLowerCase().includes('rate limit')
          ? 'Too many requests. Please wait a few minutes before resending.'
          : error.message
        toast.error('Could not resend email', msg)
        return
      }
      toast.success('Verification email resent', `Check ${verifyEmail} again, including spam.`)
    } catch {
      toast.error('Unexpected error', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onForgotSubmit = async (values: ForgotValues) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        toast.error('Failed to send reset email', error.message)
        return
      }
      setVerifyEmail(values.email)
      setMode('forgot-sent')
    } catch {
      toast.error('Unexpected error', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onSetPasswordSubmit = async (values: SetPasswordValues) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      })
      if (error) {
        toast.error('Failed to set password', error.message)
        return
      }
      toast.success('Password set successfully!')
      navigate('/')
    } catch {
      toast.error('Unexpected error', 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-zinc-950">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-900/30 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-900/20 blur-3xl animate-pulse [animation-delay:2s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-indigo-800/10 blur-3xl" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-xl shadow-2xl shadow-black/50 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-900/50 mb-3">
              <Store className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">BillScape</h1>
            <p className="text-sm text-zinc-400 mt-1">Smart billing for every shop</p>
          </div>

          {/* Email Verification Screen */}
          {mode === 'verify-email' && (
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-950 border border-indigo-800 mx-auto">
                <Mail className="h-8 w-8 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Check your email</h2>
                <p className="text-sm text-zinc-400 mt-2">
                  We sent a verification link to
                </p>
                <p className="text-sm font-medium text-indigo-300 mt-1">{verifyEmail}</p>
                <p className="text-sm text-zinc-400 mt-2">
                  Click the link in the email to verify your account and set up your shop.
                </p>
              </div>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-4 text-left space-y-2">
                <p className="text-xs text-zinc-400 font-medium">Didn't receive the email?</p>
                <ul className="space-y-1 text-xs text-zinc-500">
                  <li>• Check your spam or junk folder</li>
                  <li>• Make sure you entered the correct email</li>
                  <li>• Wait a minute and try again</li>
                </ul>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={onResendVerification}
                disabled={loading}
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resend verification email'}
              </Button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mx-auto"
              >
                <ArrowLeft className="h-3 w-3" />
                Try a different email
              </button>
            </div>
          )}

          {/* Forgot Password Sent Screen */}
          {mode === 'forgot-sent' && (
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950 border border-emerald-800 mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Reset email sent</h2>
                <p className="text-sm text-zinc-400 mt-2">
                  We sent a password reset link to
                </p>
                <p className="text-sm font-medium text-indigo-300 mt-1">{verifyEmail}</p>
                <p className="text-sm text-zinc-400 mt-2">
                  Click the link in the email to reset your password.
                </p>
              </div>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mx-auto"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Sign In
              </button>
            </div>
          )}

          {/* Forgot Password Form */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-base font-semibold text-white">Reset your password</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>
              <form onSubmit={handleForgotSubmit(onForgotSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-9"
                      autoComplete="email"
                      {...registerForgot('email')}
                    />
                  </div>
                  {forgotErrors.email && (
                    <p className="text-xs text-red-400">{forgotErrors.email.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full h-10 text-sm font-semibold" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </form>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mx-auto"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Sign In
              </button>
            </div>
          )}

          {/* Set Password Form */}
          {mode === 'set-password' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-base font-semibold text-white">Set Your Password</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Please establish a secure password to access your dashboard.
                </p>
              </div>
              <form onSubmit={handleSetPasswordSubmit(onSetPasswordSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="set-password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="set-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      autoComplete="new-password"
                      {...registerSetPassword('password', {
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
                  {setPasswordErrors.password && (
                    <p className="text-xs text-red-400">{setPasswordErrors.password.message}</p>
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
                <Button type="submit" className="w-full h-10 text-sm font-semibold" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving password...
                    </>
                  ) : (
                    'Set Password & Continue'
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* Sign In / Sign Up */}
          {(mode === 'signin' || mode === 'signup') && (
            <>
              {/* Sign in / Sign up switcher */}
              <div className="flex rounded-lg bg-zinc-800 p-1 mb-6">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all',
                    mode === 'signin'
                      ? 'bg-zinc-900 text-white shadow'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all',
                    mode === 'signup'
                      ? 'bg-zinc-900 text-white shadow'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Create Account
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {mode === 'signup' && (
                  <p className="text-xs text-zinc-400 bg-indigo-950/40 border border-indigo-900/50 rounded-lg px-3 py-2">
                    Create your BillScape account. We'll send you a verification email, then you'll set up your shop.
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-9"
                      autoComplete="email"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-400">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
                  {mode === 'signup' && passwordValue.length > 0 && (() => {
                    const { checks, score } = getPasswordStrength(passwordValue)
                    const strengthLabel = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong'
                    const strengthColor = score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-yellow-500' : score === 3 ? 'bg-blue-500' : 'bg-emerald-500'
                    const textColor = score <= 1 ? 'text-red-400' : score === 2 ? 'text-yellow-400' : score === 3 ? 'text-blue-400' : 'text-emerald-400'
                    return (
                      <div className="space-y-2 mt-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 flex gap-1">
                            {[1,2,3,4].map((i) => (
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

                <Button
                  type="submit"
                  className="w-full h-10 text-sm font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                    </>
                  ) : mode === 'signup' ? (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Create Account
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <p className="mt-6 text-center text-xs text-zinc-600">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
