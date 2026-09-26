import { NextRequest } from 'next/server'
import { apiOk, handleZodError } from '@/lib/api'
import { requireUser, requireProjectAccess } from '@/lib/auth-helpers'
import { AckEventRequestSchema } from '@gecko/protocol'

type Params = { params: Promise<{ projectId: string }> }

/** CLI calls this after it has written events to its local GECKOLOG copy */
export async function POST(request: NextRequest, { params }: Params) {
  const { projectId } = await params
  const { userId, error } = await requireUser(request)
  if (error) return error
  const { error: projErr } = await requireProjectAccess(userId!, projectId)
  if (projErr) return projErr

  const body = await request.json().catch(() => null)
  const parsed = AckEventRequestSchema.safeParse(body)
  if (!parsed.success) return handleZodError(parsed.error)

  // Acknowledgment is informational in MVP (no persistent ack table yet)
  return apiOk({ acknowledged: true, last_sequence: parsed.data.last_sequence })
}
