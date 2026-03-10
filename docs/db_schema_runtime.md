# DBスキーマ設計（runtime: public/game）

## 概要
対局実行・デッキ・所持駒に関するランタイムDB構成です。  
以下 migration を反映した状態を基準にしています。

- `20260309220000_create_game_runtime_tables.sql`
- `20260309231000_create_player_deck_tables.sql`
- `20260309231001_ensure_game_schema_exists.sql`（互換目的の `if not exists`）
- `20260309235900_seed_default_shogi_pieces_on_new_user.sql`

## `public` スキーマ

### `public.player_owned_pieces`
プレイヤー所持駒（重複なし）。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `player_id` | `uuid` | Yes | FK -> `public.players(id)` |
| `piece_id` | `bigint` | Yes | FK -> `master.m_piece(piece_id)` |
| `acquired_at` | `timestamptz` | Yes | 取得日時 |
| `source` | `text` | Yes | 取得元（`gacha` / `shop` / `initial`） |

キー・制約:
- PK: `(player_id, piece_id)`
- `player_owned_pieces_source_chk`

RLS:
- `player_owned_pieces: self read`
- `player_owned_pieces: self insert`
- `player_owned_pieces: self delete`

### `public.player_decks`
プレイヤーの保存デッキ。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `deck_id` | `bigint` | Yes | PK（identity） |
| `player_id` | `uuid` | Yes | FK -> `public.players(id)` |
| `name` | `text` | Yes | デッキ名（1〜40文字） |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

制約:
- `player_decks_name_len_chk`

RLS:
- `player_decks: self read`
- `player_decks: self insert`
- `player_decks: self update`
- `player_decks: self delete`

### `public.player_deck_placements`
デッキ内の盤面配置（1マス1駒）。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `deck_id` | `bigint` | Yes | FK -> `public.player_decks(deck_id)` |
| `row_no` | `integer` | Yes | 行（0..8） |
| `col_no` | `integer` | Yes | 列（0..8） |
| `piece_id` | `bigint` | Yes | FK -> `master.m_piece(piece_id)` |

キー・制約:
- PK: `(deck_id, row_no, col_no)`
- `player_deck_placements_row_chk`
- `player_deck_placements_col_chk`

RLS:
- deck 所有者判定（`exists (select 1 from public.player_decks ...)`）で read/insert/update/delete を許可

## `game` スキーマ

### `game.games`
対局ライフサイクル。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `game_id` | `uuid` | Yes | PK, default `gen_random_uuid()` |
| `player_id` | `uuid` | Yes | FK -> `public.players(id)` |
| `stage_id` | `bigint` | No | FK -> `master.m_stage(stage_id)` |
| `status` | `text` | Yes | `in_progress` / `finished` / `aborted` |
| `result` | `text` | No | `player_win` / `enemy_win` / `draw` / `abort` |
| `winner_side` | `text` | No | `player` / `enemy` |
| `started_at` | `timestamptz` | Yes | 開始時刻 |
| `ended_at` | `timestamptz` | No | 終了時刻 |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

主な制約:
- `games_status_chk`
- `games_result_chk`
- `games_winner_side_chk`
- `games_end_time_chk`

### `game.positions`
最新局面スナップショット（1対局1行）。

| カラム | 型 | 必須 |
|---|---|---|
| `game_id` | `uuid` | Yes |
| `board_state` | `jsonb` | Yes |
| `hands` | `jsonb` | Yes |
| `side_to_move` | `text` | Yes |
| `turn_number` | `integer` | Yes |
| `move_count` | `integer` | Yes |
| `sfen` | `text` | No |
| `state_hash` | `text` | No |
| `created_at` | `timestamptz` | Yes |
| `updated_at` | `timestamptz` | Yes |

主な制約:
- `positions_side_to_move_chk`
- `positions_turn_number_chk`
- `positions_move_count_chk`

### `game.moves`
指し手履歴。

| カラム | 型 | 必須 |
|---|---|---|
| `move_id` | `bigint` | Yes |
| `game_id` | `uuid` | Yes |
| `move_no` | `integer` | Yes |
| `actor_side` | `text` | Yes |
| `from_row` | `integer` | No |
| `from_col` | `integer` | No |
| `to_row` | `integer` | Yes |
| `to_col` | `integer` | Yes |
| `piece_code` | `text` | Yes |
| `promote` | `boolean` | Yes |
| `drop_piece_code` | `text` | No |
| `captured_piece_code` | `text` | No |
| `notation` | `text` | No |
| `thought_ms` | `integer` | No |
| `created_at` | `timestamptz` | Yes |

主な制約:
- `moves_game_move_no_uq (game_id, move_no)`
- `moves_actor_side_chk`
- `moves_from_row_chk`
- `moves_from_col_chk`
- `moves_to_row_chk`
- `moves_to_col_chk`
- `moves_move_no_chk`
- `moves_thought_ms_chk`
- `moves_drop_semantics_chk`

### `game.ai_inference_logs`
AI推論ログ。

| カラム | 型 | 必須 |
|---|---|---|
| `inference_id` | `bigint` | Yes |
| `game_id` | `uuid` | Yes |
| `move_no` | `integer` | Yes |
| `engine_version` | `text` | Yes |
| `engine_config` | `jsonb` | Yes |
| `request_payload` | `jsonb` | Yes |
| `response_payload` | `jsonb` | Yes |
| `selected_move` | `text` | No |
| `eval_cp` | `integer` | No |
| `searched_nodes` | `bigint` | No |
| `search_depth` | `integer` | No |
| `think_ms` | `integer` | Yes |
| `created_at` | `timestamptz` | Yes |

主な制約:
- `inference_move_no_chk`
- `inference_nodes_chk`
- `inference_depth_chk`
- `inference_think_ms_chk`

## 実装との対応
- `src/services/deck.ts` は `public.player_owned_pieces` / `public.player_decks` / `public.player_deck_placements` を参照。
- `src/services/game-runtime.ts` は `game.games` / `game.positions` / `game.moves` / `game.ai_inference_logs` を更新。

## 運用メモ
- `game` スキーマには現時点で RLS ポリシー定義はなく、BFFの service role からアクセスする前提です。
- クライアント直アクセス前提に切り替える場合は `game.*` の RLS 設計を追加してください。
