import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Mail, Lock, Phone, Loader2, UserPlus, LogIn } from 'lucide-react'
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

type EmailValues = z.infer<typeof emailSchema>

type Mode = 'signin' | 'signup'
type Tab = 'email' | 'phone'

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [activeTab, setActiveTab] = useState<Tab>('email')
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
  })

  const switchMode = (m: Mode) => {
    setMode(m)
    reset()
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
        toast.success('Account created! Setting up your shop...')
        navigate('/onboarding')
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

          {/* Input method tabs (only for sign in) */}
          {mode === 'signin' && (
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab('email')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border',
                  activeTab === 'email'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-950/50'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300',
                )}
              >
                <Mail className="h-3 w-3" />
                Email
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('phone')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border',
                  activeTab === 'phone'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-950/50'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300',
                )}
              >
                <Phone className="h-3 w-3" />
                Phone OTP
              </button>
            </div>
          )}

          {/* Email form (sign in or sign up) */}
          {(mode === 'signup' || activeTab === 'email') && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {mode === 'signup' && (
                <p className="text-xs text-zinc-400 bg-indigo-950/40 border border-indigo-900/50 rounded-lg px-3 py-2">
                  Create your BillScape account. You'll set up your shop details next.
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
                <Label htmlFor="password">Password</Label>
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
                    Create Account & Set Up Shop
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          )}

          {/* Phone OTP (sign in only) */}
          {mode === 'signin' && activeTab === 'phone' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="9876543210"
                    className="pl-12"
                  />
                </div>
              </div>
              <Button className="w-full h-10" disabled>
                Send OTP (Coming soon)
              </Button>
              <p className="text-center text-xs text-zinc-500">
                Phone OTP login will be available soon
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-zinc-600">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}
