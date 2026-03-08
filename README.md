# Backend (Initial Skeleton)

This directory is intentionally minimal.

## Current Scope
- Manage database schema with Supabase migrations
- Keep server-only environment variables here
- Prepare a reusable Supabase server client under `lib/supabase`

## Directory
- `supabase/` : Supabase CLI config, migrations, seed
- `lib/supabase/` : server-side Supabase client
- `.env.example` : environment variable template

## Prerequisites
- Node.js 20+ (recommended)
- Supabase CLI (`npx supabase`)
- Docker Desktop (required for local `supabase start`)

## Migrations
Apply migrations to linked/remote project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Local development (optional):

```bash
npx supabase start
npx supabase db reset
```

## Notes
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to mobile/web clients.
- Mobile app should use `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` only.
# backend-
