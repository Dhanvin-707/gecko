import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export function apiError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function handleZodError(err: ZodError) {
  return apiError('Validation error', 400, { issues: err.issues })
}

export function rateLimit(_key: string): boolean {
  // TODO: replace with Redis / Upstash rate limiting in production
  return true
}
