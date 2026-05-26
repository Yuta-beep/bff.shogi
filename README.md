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

`app.shogi` の `.env` にある `SUPABASE_URL` / `SUPABASE_ANON_KEY` はクライアント認証用です。**マイグレーション適用には使いません**（CLI は Supabase アカウントで認証します）。

## Supabase マイグレーション（リモート DB 更新）

スキーマ・マスタデータの変更は `supabase/migrations/*.sql` に追加し、リモートへ反映します。

### 初回セットアップ（1 回だけ）

1. [Supabase CLI](https://supabase.com/docs/guides/cli) を使う（グローバル未インストールでも `npm run` 経由で `npx` 実行可）
2. ログイン（ブラウザが開きます）

```bash
cd bff.shogi
npx supabase@latest login
```

3. プロジェクトとリンク（DB パスワードを聞かれたら Dashboard → Project Settings → Database で確認）

```bash
npm run db:link
```

### 未適用 migration をリモートに反映

```bash
cd bff.shogi
npm run db:push
```

適用済みか確認:

```bash
npm run db:status
```

### 新しい migration を作る

```bash
cd bff.shogi
npm run db:migration:new -- add_my_feature
# → supabase/migrations/<timestamp>_add_my_feature.sql ができる
# SQL を書いたあと
npm run db:push
```

### 注意

- ファイル名のタイムスタンプは **重複しない** ようにする（同じ `20260519120000_...` が複数あると順序が分かりにくい）
- 本番反映前に SQL の内容を必ず確認する
- `SUPABASE_SERVICE_ROLE_KEY` は Dashboard → Project Settings → API の `service_role`（**anon とは別**）。BFF の `.env` に設定する

## 駒図鑑 → Supabase 同期（`shogi_game/piece_info.html`）

参照元: `../shogi_game/piece_info.html` の `ALL_PIECES_DATA` と `gachaPieceInfo`。

```bash
cd bff.shogi
# 1) マスタ SQL 生成 + migration 生成
npm run db:sync:piece-catalog

# 2) リモート DB（未適用 migration があれば）
npm run db:push

# または REST で直接 upsert
npm run seed:pieces:catalog:apply

# 3) 駒画像を Storage にアップロード（image_key: pieces/piece-{piece_id}.png）
npm run seed:pieces:catalog:images:apply
```

- ショップ駒の `move` は DB の `shop_*` / ガチャ駒は `move_gacha_*` にエイリアス済み
- Storage キーは ASCII のみのため日本語ファイル名は `pieces/piece-{id}.png` にマッピング
