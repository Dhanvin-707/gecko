# Gecko Web — Deployment Guide

## Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase project (free tier works)
- Vercel account
- GitHub OAuth App

## Local Development

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
pnpm install
pnpm dev
```

## Database Setup

Apply migrations to your Supabase project in order:

```bash
# Via Supabase CLI (recommended)
supabase db push

# Or manually in Supabase SQL editor, run each file in order:
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_event_sequence.sql
# supabase/migrations/003_claim_task_rpc.sql
# supabase/migrations/004_requeue_task_rpc.sql
# supabase/migrations/005_rls.sql
```

## Supabase Auth

1. Go to Supabase dashboard → Authentication → Providers
2. Enable GitHub provider
3. Create a GitHub OAuth App at https://github.com/settings/applications/new
4. Set callback URL: `https://your-project.supabase.co/auth/v1/callback`
5. Copy Client ID and Secret into Supabase

## Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from apps/web
cd apps/web
vercel --prod
```

Set these environment variables in Vercel:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GECKO_PUBLIC_URL=https://your-app.vercel.app
```

## GitHub OAuth Redirect URLs

Add to your GitHub OAuth App:
- `http://localhost:3000/auth/callback` (development)
- `https://your-project.supabase.co/auth/v1/callback` (production)

## Running Tests

```bash
# Unit tests
pnpm test

# TypeScript check
cd apps/web && npx tsc --noEmit

# E2E tests (requires running server)
cd apps/web && pnpm run test:e2e
```
