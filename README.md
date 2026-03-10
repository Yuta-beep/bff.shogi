# Backend (Next.js BFF)

TypeScript + Next.js Route Handler で構築する BFF（Backend For Frontend）です。

## Purpose
- Mobile/Web クライアントから DB 直接接続させず、HTTP API 経由で `master` スキーマを提供する
- UI向けDTO整形・公開判定をサーバー側で一元化する

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

※ `EXPO_PUBLIC_SUPABASE_URL` が入っていても動作しますが、BFF用途では `SUPABASE_URL` を推奨。

## API (v1)

### Health
- `GET /api/health`

### 1) Me snapshot（仮実装）
- `GET /api/v1/me/snapshot`

### 2) Stage list（実実装）
- `GET /api/v1/stages`

### 3) Stage select（実装）
- `POST /api/v1/stages/:stageNo/select`

### 4) Battle setup（実装）
- `GET /api/v1/stages/:stageNo/battle-setup`

### 5) Piece catalog（実装）
- `GET /api/v1/pieces/catalog`

### 6) Piece shop catalog（仮実装）
- `GET /api/v1/shops/piece/catalog`

### 7) Piece shop purchase（仮実装）
- `POST /api/v1/shops/piece/purchase`

### 8) AI move（Phase1）
- `POST /api/v1/ai/move`

## Notes
- 現時点でユーザー進行/通貨/所持テーブルは未導入のため、該当APIはモックまたは暫定判定です。
- スキーマ変更は `supabase/migrations` で管理してください。
