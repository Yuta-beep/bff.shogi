# DBスキーマ設計（public.players）

## 概要
`public.players` は認証ユーザーのゲーム内プロフィールを保持するテーブルです。  
以下 migration を反映した状態を基準にしています。

- `20260308235900_create_players_table.sql`
- `20260309000001_make_display_name_nullable.sql`
- `20260309235900_seed_default_shogi_pieces_on_new_user.sql`
- `20260310001000_add_players_self_insert_policy.sql`

## テーブル定義

### `public.players`
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | `uuid` | PK, FK -> `auth.users(id)` ON DELETE CASCADE | AuthユーザーID |
| `display_name` | `text` | NULL許容 | プレイヤー表示名 |
| `rating` | `int` | NOT NULL, DEFAULT 1500 | レーティング |
| `pawn_currency` | `int` | NOT NULL, DEFAULT 0 | 歩通貨 |
| `gold_currency` | `int` | NOT NULL, DEFAULT 0 | 金通貨 |
| `is_anonymous` | `boolean` | NOT NULL, DEFAULT true | 匿名ユーザー状態 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | 作成日時 |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | 更新日時 |

補足:
- `display_name` は `20260309000001` で `NOT NULL` と `DEFAULT` が削除され、NULL許容になっています。
- `username` カラムは存在しません。

## RLS
`public.players` は RLS 有効です。

| ポリシー名 | 操作 | 条件 |
|---|---|---|
| `players: self read` | SELECT | `auth.uid() = id` |
| `players: self update` | UPDATE | `auth.uid() = id` |
| `players: self insert` | INSERT | `auth.uid() = id` |

## トリガー
`auth.users` への INSERT 時に `public.handle_new_user()` が実行されます。  
最終定義（`20260309235900` 反映後）は以下です。

- `public.players` に `(id)` を INSERT（`on conflict do nothing`）
- `public.player_owned_pieces` に初期駒（歩/香/桂/銀/金/角/飛/王/玉）を付与

トリガー名:
- `on_auth_user_created`

## 関連テーブルとの関係
- `game.games.player_id` は `public.players(id)` を参照
- `public.player_owned_pieces.player_id` は `public.players(id)` を参照
- `public.player_decks.player_id` は `public.players(id)` を参照

## 運用メモ
- `players` 行は trigger で作成される前提ですが、欠損時の自己補完用に `players: self insert` が追加されています。
- デッキ・所持駒・対局実行系テーブルは別ドキュメント `docs/db_schema_runtime.md` を参照してください。
