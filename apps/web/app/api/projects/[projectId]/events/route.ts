import { NextRequest } from 'next/server'
import { apiError, apiOk, handleZodError } from '@/lib/api'
import { requireUser, requireProjectAccess } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { EventCursorQuerySchema } from '@gecko/protocol'

type Params = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error
  const { error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const { searchParams } = new URL(request.url)
  const parsed = EventCursorQuerySchema.safeParse({
    after_sequence: searchParams.get('after_sequence'),
    limit: searchParams.get('limit'),
  })
  if (!parsed.success) return handleZodError(parsed.error)

  const admin = createAdminClient()
  const { data, error: dbErr } = await admin
    .from('events')
    .select('*')
    .eq('project_id', projectId)
    .gt('sequence_number', parsed.data.after_sequence)
    .order('sequence_number', { ascending: true })
    .limit(parsed.data.limit)

  if (dbErr) return apiError('Failed to fetch events', 500)
  return apiOk(data)
}
