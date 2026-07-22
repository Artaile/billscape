import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Mail, Lock, Loader2, UserPlus, LogIn, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const emailSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const forgotSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

type EmailValues = z.infer<typeof emailSchema>
type ForgotValues = z.infer<typeof forgotSchema>

type Mode = 'signin' | 'signup' | 'forgot' | 'verify-email' | 'forgot-sent'

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [loading, setLoading] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
  })

  const {
    register: registerForgot,
    handleSubmit: handleForgotSubmit,
    reset: resetForgot,
    formState: { errors: forgotErrors },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
  })

  const switchMode = (m: Mode) => {
    setMode(m)
    reset()
    resetForgot()
  }

  const onSubmit = async (values: EmailValues) => {
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
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
                      type="password"
                      placeholder="••••••••"
                      className="pl-9"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      {...register('password')}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-400">{errors.password.message}</p>
                  )}
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
