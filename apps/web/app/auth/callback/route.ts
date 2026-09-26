import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=missing_code`)
  }

  const supabase = await createRouteHandlerClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth?error=auth_failed`)
  }

  // Upsert the user record
  const admin = createAdminClient()
  const githubId = parseInt(data.user.user_metadata?.provider_id ?? '0', 10)
  const login = data.user.user_metadata?.user_name ?? data.user.email ?? ''
  const displayName = data.user.user_metadata?.full_name ?? login
  const avatarUrl = data.user.user_metadata?.avatar_url ?? null

  await admin.from('users').upsert(
    {
      github_user_id: githubId,
      github_login: login,
      display_name: displayName,
      avatar_url: avatarUrl,
    },
    { onConflict: 'github_user_id' },
  )

  return NextResponse.redirect(`${origin}/projects`)
}
