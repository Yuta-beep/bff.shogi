# Backend (Next.js BFF)

TypeScript + Next.js Route Handler で構築する BFF（Backend For Frontend）です。

## Stack
- Next.js (App Router)
- TypeScript
- Supabase JS (service role)

## Setup
```bash
npm install
npm run dev
```

開発サーバー: `http://localhost:3000`

## Environment Variables
`.env`（または `.env.local`）に以下を設定してください。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_ENGINE_BASE_URL`（例: `http://127.0.0.1:8080`）
