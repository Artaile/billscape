import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, User, Mail, Shield, CheckCircle2 } from 'lucide-react'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
})

type ProfileValues = z.infer<typeof profileSchema>

export function ProfilePage() {
  const { user, role, org } = useAuth()
  const queryClient = useQueryClient()
  const isOwner = role === 'owner'
  const orgId = org?.id

  // Fetch user's profile and membership details
  const { data: profileData, isLoading } = useQuery({
    queryKey: ['my-profile', user?.id, orgId],
    enabled: !!user?.id && !!orgId,
    queryFn: async () => {
      // Fetch profile
      const { data: profile, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single()
      
      if (profError) throw profError

      // Fetch membership for current org to get role & status
      const { data: membership, error: memError } = await supabase
        .from('memberships')
        .select(`
          role,
          is_active,
          custom_role_id,
          roles(name)
        `)
        .eq('user_id', user!.id)
        .eq('organization_id', orgId!)
        .single()
      
      if (memError && memError.code !== 'PGRST116') throw memError

      return { profile, membership }
    }
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty }
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: ''
    }
  })

  // Reset form when data loads
  React.useEffect(() => {
    if (profileData?.profile) {
      reset({ full_name: profileData.profile.full_name || '' })
    }
  }, [profileData, reset])

  const updateProfileMutation = useMutation({
    mutationFn: async (values: ProfileValues) => {
      if (!user) throw new Error('Not logged in')
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: values.full_name })
        .eq('id', user.id)
      
      if (error) throw error

      // Update auth user metadata so the AppShell header updates instantly
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: values.full_name }
      })
      if (authError) throw authError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile', user?.id, orgId] })
      toast.success('Profile updated successfully')
    },
    onError: (err: Error) => {
      toast.error('Failed to update profile', err.message)
    }
  })

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const email = user?.email || ''
  const avatarUrl = profileData?.profile?.avatar_url
  const membership = profileData?.membership
  
  // Format role label
  const sysRole = membership?.role || role || 'User'
  const customRoleName = (membership as any)?.roles?.name
  const roleDisplay = customRoleName 
    ? `${sysRole.charAt(0).toUpperCase() + sysRole.slice(1)} (${customRoleName})` 
    : sysRole.charAt(0).toUpperCase() + sysRole.slice(1)
    
  const isActive = membership?.is_active ?? true

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          View your personal information and access level.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        {/* Main Profile Info */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-6">Personal Details</h2>
            
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center mb-8">
              <div className="h-24 w-24 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-10 w-10 text-zinc-400" />
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{profileData?.profile?.full_name || 'No name set'}</p>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit((v) => updateProfileMutation.mutate(v))} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input 
                  id="full_name" 
                  {...register('full_name')} 
                  disabled={updateProfileMutation.isPending}
                  className="bg-zinc-900/50"
                />
                {errors.full_name && (
                  <p className="text-xs text-red-400">{errors.full_name.message}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input 
                    id="email" 
                    value={email}
                    disabled
                    className="pl-9 bg-zinc-900/50 text-muted-foreground"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Email addresses cannot be changed.</p>
              </div>

              <div className="pt-4 flex justify-end">
                <Button 
                  type="submit" 
                  disabled={!isDirty || updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-indigo-400" />
              <h2 className="text-base font-semibold text-foreground">Access Level</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">System Role</p>
                <p className="text-sm font-medium text-foreground">{roleDisplay}</p>
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground mb-1">Account Status</p>
                <div className="flex items-center gap-1.5">
                  {isActive ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-500">Active</span>
                    </>
                  ) : (
                    <>
                      <div className="h-2 w-2 rounded-full bg-red-500 ml-1" />
                      <span className="text-sm font-medium text-red-500">Disabled</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
