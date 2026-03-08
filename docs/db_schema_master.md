# DBスキーマ設計（master）

## 概要
このドキュメントは、将棋ゲームのマスターデータを管理する `master` スキーマの現行構成をまとめたものです。
対象は以下の migration に基づきます。

- `20260305052035_init_master_piece_stage.sql`
- `20260307114000_skill_structured_schema.sql`

## スキーマ
- スキーマ名: `master`
- 用途: 駒、移動パターン、スキル、ステージ、および関連中間データの管理

## テーブル一覧
- `master.m_piece`: 駒マスター
- `master.m_move_pattern`: 移動パターンマスター
- `master.m_move_pattern_vector`: 移動相対座標
- `master.m_skill`: スキルマスター（構造化列あり）
- `master.m_skill_effect`: スキル効果明細（1スキル複数効果）
- `master.m_stage`: ステージマスター
- `master.m_stage_piece`: ステージ出現駒（役割・重み）
- `master.m_stage_initial_placement`: 初期配置

## テーブル定義

### 1. `master.m_piece`
駒の基本情報を保持します。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `piece_id` | `bigint` | Yes | PK（identity） |
| `piece_code` | `text` | Yes | 駒コード（一意） |
| `kanji` | `text` | Yes | 駒の漢字（`UNIQUE INDEX`） |
| `name` | `text` | Yes | 駒名 |
| `move_pattern_id` | `bigint` | Yes | FK -> `m_move_pattern.move_pattern_id` |
| `skill_id` | `bigint` | No | FK -> `m_skill.skill_id` |
| `is_active` | `boolean` | Yes | 有効フラグ |
| `published_at` | `timestamptz` | No | 公開日時 |
| `unpublished_at` | `timestamptz` | No | 非公開日時 |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

主な制約:
- `piece_code` 一意
- `kanji` 一意インデックス
- 公開期間整合チェック（`unpublished_at > published_at`）

### 2. `master.m_move_pattern`
移動タイプの定義（歩、飛車、カスタムなど）を保持します。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `move_pattern_id` | `bigint` | Yes | PK（identity） |
| `move_code` | `text` | Yes | 移動コード（一意） |
| `move_name` | `text` | Yes | 表示名 |
| `is_repeatable` | `boolean` | Yes | 連続移動可否 |
| `can_jump` | `boolean` | Yes | ジャンプ可否 |
| `constraints_json` | `jsonb` | No | 補助制約情報 |
| `is_active` | `boolean` | Yes | 有効フラグ |
| `published_at` | `timestamptz` | No | 公開日時 |
| `unpublished_at` | `timestamptz` | No | 非公開日時 |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

### 3. `master.m_move_pattern_vector`
相対座標ベースの移動可能範囲を保持します。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `move_pattern_id` | `bigint` | Yes | FK -> `m_move_pattern` |
| `dx` | `integer` | Yes | 列方向相対移動 |
| `dy` | `integer` | Yes | 行方向相対移動 |
| `max_step` | `integer` | Yes | 最大ステップ数 |
| `capture_only` | `boolean` | Yes | 取り時のみ有効 |
| `move_only` | `boolean` | Yes | 非取り時のみ有効 |

主キー:
- `(move_pattern_id, dx, dy, capture_only, move_only)`

主な制約:
- `max_step >= 1`
- `(dx, dy)` が `(0, 0)` でない
- `capture_only` と `move_only` の同時 true 禁止

### 4. `master.m_skill`
スキル本体情報を保持します。自然文と構造化情報の両方を持ちます。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `skill_id` | `bigint` | Yes | PK（identity） |
| `skill_code` | `text` | Yes | スキルコード（一意） |
| `skill_name` | `text` | Yes | スキル名 |
| `skill_desc` | `text` | Yes | スキル説明（自然文） |
| `trigger_timing` | `text` | No | 基本トリガー |
| `skill_type` | `text` | Yes | 例: `passive`, `active_or_triggered` |
| `target_rule` | `text` | Yes | 対象ルール |
| `effect_summary_type` | `text` | Yes | 効果サマリ種別 |
| `proc_chance` | `numeric(5,4)` | No | 発動確率（0.0〜1.0） |
| `duration_turns` | `integer` | No | 継続ターン |
| `script_hook` | `text` | No | 拡張フック名（現運用では null） |
| `parse_status` | `text` | Yes | 構造化状態 |
| `params_json` | `jsonb` | Yes | 補助パラメータ |
| `is_active` | `boolean` | Yes | 有効フラグ |
| `published_at` | `timestamptz` | No | 公開日時 |
| `unpublished_at` | `timestamptz` | No | 非公開日時 |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

### 5. `master.m_skill_effect`
スキルの効果を正規化して保持します（1スキルに複数効果可）。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `skill_effect_id` | `bigint` | Yes | PK（identity） |
| `skill_id` | `bigint` | Yes | FK -> `m_skill.skill_id` |
| `effect_order` | `smallint` | Yes | 効果適用順 |
| `effect_type` | `text` | Yes | 効果種別 |
| `target_rule` | `text` | Yes | 対象ルール |
| `trigger_timing` | `text` | No | 効果ごとの発動条件 |
| `proc_chance` | `numeric(5,4)` | No | 効果発動確率 |
| `duration_turns` | `integer` | No | 継続ターン |
| `radius` | `integer` | No | 範囲半径など |
| `value_num` | `numeric` | No | 数値パラメータ |
| `value_text` | `text` | No | 文字列パラメータ |
| `params_json` | `jsonb` | Yes | 詳細パラメータ |
| `is_active` | `boolean` | Yes | 有効フラグ |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

主な制約:
- `m_skill_effect_skill_order_uq`: `(skill_id, effect_order)` 一意
- `proc_chance` は 0〜1
- `duration_turns`, `radius` は 0以上

### 6. `master.m_stage`
ステージの基本情報を保持します。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `stage_id` | `bigint` | Yes | PK（identity） |
| `stage_no` | `integer` | Yes | ステージ番号（一意） |
| `stage_name` | `text` | Yes | ステージ名 |
| `unlock_stage_no` | `integer` | No | 解放条件ステージ番号 |
| `difficulty` | `integer` | No | 難易度 |
| `is_active` | `boolean` | Yes | 有効フラグ |
| `published_at` | `timestamptz` | No | 公開日時 |
| `unpublished_at` | `timestamptz` | No | 非公開日時 |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

主な制約:
- `stage_no >= 1`
- `unlock_stage_no < stage_no`

### 7. `master.m_stage_piece`
ステージに出現する駒を保持します（ボス判定をここで管理）。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `stage_id` | `bigint` | Yes | FK -> `m_stage` |
| `piece_id` | `bigint` | Yes | FK -> `m_piece` |
| `role` | `text` | Yes | `normal` / `boss` / `elite` / `support` |
| `weight` | `integer` | Yes | 出現重み |

主キー:
- `(stage_id, piece_id, role)`

### 8. `master.m_stage_initial_placement`
初期盤面配置を保持します。

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `stage_id` | `bigint` | Yes | FK -> `m_stage` |
| `side` | `text` | Yes | `player` / `enemy` |
| `row_no` | `integer` | Yes | 行（0〜8） |
| `col_no` | `integer` | Yes | 列（0〜8） |
| `piece_id` | `bigint` | Yes | FK -> `m_piece` |

主キー:
- `(stage_id, side, row_no, col_no)`

## リレーション
- `m_piece.move_pattern_id` -> `m_move_pattern.move_pattern_id`（N:1）
- `m_piece.skill_id` -> `m_skill.skill_id`（N:1）
- `m_move_pattern_vector.move_pattern_id` -> `m_move_pattern.move_pattern_id`（N:1）
- `m_skill_effect.skill_id` -> `m_skill.skill_id`（N:1）
- `m_stage_piece.stage_id` -> `m_stage.stage_id`（N:1）
- `m_stage_piece.piece_id` -> `m_piece.piece_id`（N:1）
- `m_stage_initial_placement.stage_id` -> `m_stage.stage_id`（N:1）
- `m_stage_initial_placement.piece_id` -> `m_piece.piece_id`（N:1）

## 運用ルール
- スキーマ変更は必ず `supabase/migrations` に SQL を追加して管理する。
- シードやデータ再構成は `scripts/` で実行する（スキーマ変更なし）。
- AI実行時は `m_skill` の概要列と `m_skill_effect` の明細をセットで解釈する。
