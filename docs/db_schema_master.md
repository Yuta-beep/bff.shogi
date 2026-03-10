# DBスキーマ設計（master）

## 概要
将棋ゲームのマスターデータを管理する `master` スキーマの現行構成です。  
以下 migration を反映した状態を基準にしています。

- `20260305052035_init_master_piece_stage.sql`
- `20260307114000_skill_structured_schema.sql`
- `20260307122000_extend_stage_tables.sql`
- `20260308230000_add_piece_image_asset_columns.sql`

## テーブル一覧
- `master.m_piece`: 駒マスター
- `master.m_move_pattern`: 移動パターンマスター
- `master.m_move_pattern_vector`: 移動相対座標
- `master.m_skill`: スキルマスター（構造化列あり）
- `master.m_skill_effect`: スキル効果明細
- `master.m_stage`: ステージマスター
- `master.m_stage_piece`: ステージ出現駒（役割・重み）
- `master.m_stage_initial_placement`: 初期配置
- `master.m_reward`: 報酬マスター
- `master.m_stage_reward`: ステージ報酬割当

## 主要テーブル定義

### `master.m_piece`
| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `piece_id` | `bigint` | Yes | PK（identity） |
| `piece_code` | `text` | Yes | 駒コード（UNIQUE） |
| `kanji` | `text` | Yes | 駒文字（`m_piece_kanji_uq`） |
| `name` | `text` | Yes | 駒名 |
| `move_pattern_id` | `bigint` | Yes | FK -> `m_move_pattern.move_pattern_id` |
| `skill_id` | `bigint` | No | FK -> `m_skill.skill_id` |
| `image_source` | `text` | Yes | 画像ソース（`supabase` / `s3`） |
| `image_bucket` | `text` | No | ストレージバケット名 |
| `image_key` | `text` | No | ストレージキー（空白のみ禁止） |
| `image_version` | `integer` | Yes | 画像版数（1以上） |
| `is_active` | `boolean` | Yes | 有効フラグ |
| `published_at` | `timestamptz` | No | 公開日時 |
| `unpublished_at` | `timestamptz` | No | 非公開日時 |
| `created_at` | `timestamptz` | Yes | 作成日時 |
| `updated_at` | `timestamptz` | Yes | 更新日時 |

主な制約・インデックス:
- `m_piece_publish_window_chk`
- `m_piece_image_source_chk`
- `m_piece_image_version_chk`
- `m_piece_image_key_format_chk`
- `m_piece_image_lookup_idx (image_source, image_bucket, image_key)`

### `master.m_move_pattern`
| カラム | 型 | 必須 |
|---|---|---|
| `move_pattern_id` | `bigint` | Yes |
| `move_code` | `text` | Yes |
| `move_name` | `text` | Yes |
| `is_repeatable` | `boolean` | Yes |
| `can_jump` | `boolean` | Yes |
| `constraints_json` | `jsonb` | No |
| `is_active` | `boolean` | Yes |
| `published_at` | `timestamptz` | No |
| `unpublished_at` | `timestamptz` | No |
| `created_at` | `timestamptz` | Yes |
| `updated_at` | `timestamptz` | Yes |

### `master.m_move_pattern_vector`
| カラム | 型 | 必須 |
|---|---|---|
| `move_pattern_id` | `bigint` | Yes |
| `dx` | `integer` | Yes |
| `dy` | `integer` | Yes |
| `max_step` | `integer` | Yes |
| `capture_only` | `boolean` | Yes |
| `move_only` | `boolean` | Yes |

主キー:
- `(move_pattern_id, dx, dy, capture_only, move_only)`

主な制約:
- `m_move_pattern_vector_max_step_chk` (`max_step >= 1`)
- `m_move_pattern_vector_not_zero_chk` (`dx <> 0 or dy <> 0`)
- `m_move_pattern_vector_mode_chk`（`capture_only` と `move_only` の同時 true 禁止）

### `master.m_skill`
| カラム | 型 | 必須 |
|---|---|---|
| `skill_id` | `bigint` | Yes |
| `skill_code` | `text` | Yes |
| `skill_name` | `text` | Yes |
| `skill_desc` | `text` | Yes |
| `trigger_timing` | `text` | No |
| `skill_type` | `text` | Yes |
| `target_rule` | `text` | Yes |
| `effect_summary_type` | `text` | Yes |
| `proc_chance` | `numeric(5,4)` | No |
| `duration_turns` | `integer` | No |
| `script_hook` | `text` | No |
| `parse_status` | `text` | Yes |
| `params_json` | `jsonb` | Yes |
| `is_active` | `boolean` | Yes |
| `published_at` | `timestamptz` | No |
| `unpublished_at` | `timestamptz` | No |
| `created_at` | `timestamptz` | Yes |
| `updated_at` | `timestamptz` | Yes |

主なインデックス:
- `m_skill_script_hook_idx`（`script_hook is not null`）

### `master.m_skill_effect`
| カラム | 型 | 必須 |
|---|---|---|
| `skill_effect_id` | `bigint` | Yes |
| `skill_id` | `bigint` | Yes |
| `effect_order` | `smallint` | Yes |
| `effect_type` | `text` | Yes |
| `target_rule` | `text` | Yes |
| `trigger_timing` | `text` | No |
| `proc_chance` | `numeric(5,4)` | No |
| `duration_turns` | `integer` | No |
| `radius` | `integer` | No |
| `value_num` | `numeric` | No |
| `value_text` | `text` | No |
| `params_json` | `jsonb` | Yes |
| `is_active` | `boolean` | Yes |
| `created_at` | `timestamptz` | Yes |
| `updated_at` | `timestamptz` | Yes |

主な制約・インデックス:
- `m_skill_effect_order_chk`
- `m_skill_effect_proc_chance_chk`
- `m_skill_effect_duration_turns_chk`
- `m_skill_effect_radius_chk`
- `m_skill_effect_skill_order_uq (skill_id, effect_order)`
- `m_skill_effect_lookup_idx (effect_type, target_rule, trigger_timing)`

### `master.m_stage`
| カラム | 型 | 必須 |
|---|---|---|
| `stage_id` | `bigint` | Yes |
| `stage_no` | `integer` | Yes |
| `stage_name` | `text` | Yes |
| `unlock_stage_no` | `integer` | No |
| `difficulty` | `integer` | No |
| `stage_category` | `text` | Yes |
| `clear_condition_type` | `text` | Yes |
| `clear_condition_params` | `jsonb` | Yes |
| `recommended_power` | `integer` | No |
| `stamina_cost` | `integer` | Yes |
| `is_active` | `boolean` | Yes |
| `published_at` | `timestamptz` | No |
| `unpublished_at` | `timestamptz` | No |
| `created_at` | `timestamptz` | Yes |
| `updated_at` | `timestamptz` | Yes |

主な制約:
- `m_stage_stage_no_chk`
- `m_stage_unlock_stage_no_chk`
- `m_stage_stage_category_chk`
- `m_stage_clear_condition_type_chk`
- `m_stage_recommended_power_chk`
- `m_stage_stamina_cost_chk`
- `m_stage_publish_window_chk`

### `master.m_stage_piece`
- 主キー: `(stage_id, piece_id, role)`
- 制約: `m_stage_piece_weight_chk`（1以上）, `m_stage_piece_role_chk`（`normal/boss/elite/support`）

### `master.m_stage_initial_placement`
- 主キー: `(stage_id, side, row_no, col_no)`
- 制約: `m_stage_initial_placement_side_chk`（`player/enemy`）
- 制約: `m_stage_initial_placement_row_chk`（0..8）
- 制約: `m_stage_initial_placement_col_chk`（0..8）

### `master.m_reward`
| カラム | 型 | 必須 |
|---|---|---|
| `reward_id` | `bigint` | Yes |
| `reward_code` | `text` | Yes |
| `reward_type` | `text` | Yes |
| `reward_name` | `text` | Yes |
| `piece_id` | `bigint` | No |
| `item_code` | `text` | No |
| `is_active` | `boolean` | Yes |
| `published_at` | `timestamptz` | No |
| `unpublished_at` | `timestamptz` | No |
| `created_at` | `timestamptz` | Yes |
| `updated_at` | `timestamptz` | Yes |

主な制約:
- `m_reward_type_chk`（`piece/item/currency/ticket`）
- `m_reward_piece_item_xor_chk`
- `m_reward_publish_window_chk`

### `master.m_stage_reward`
| カラム | 型 | 必須 |
|---|---|---|
| `stage_reward_id` | `bigint` | Yes |
| `stage_id` | `bigint` | Yes |
| `reward_id` | `bigint` | Yes |
| `reward_timing` | `text` | Yes |
| `quantity` | `integer` | Yes |
| `drop_rate` | `numeric(5,4)` | No |
| `sort_order` | `smallint` | Yes |
| `is_active` | `boolean` | Yes |
| `created_at` | `timestamptz` | Yes |
| `updated_at` | `timestamptz` | Yes |

主な制約・インデックス:
- `m_stage_reward_timing_chk`
- `m_stage_reward_quantity_chk`
- `m_stage_reward_drop_rate_chk`
- `m_stage_reward_sort_order_chk`
- `m_stage_reward_unique_row_uq (stage_id, reward_id, reward_timing, sort_order)`
- `m_stage_reward_stage_idx`
- `m_stage_reward_reward_idx`

## リレーション（主要）
- `m_piece.move_pattern_id` -> `m_move_pattern.move_pattern_id`
- `m_piece.skill_id` -> `m_skill.skill_id`
- `m_skill_effect.skill_id` -> `m_skill.skill_id`
- `m_stage_piece.stage_id` -> `m_stage.stage_id`
- `m_stage_piece.piece_id` -> `m_piece.piece_id`
- `m_stage_initial_placement.stage_id` -> `m_stage.stage_id`
- `m_stage_initial_placement.piece_id` -> `m_piece.piece_id`
- `m_reward.piece_id` -> `m_piece.piece_id`
- `m_stage_reward.stage_id` -> `m_stage.stage_id`
- `m_stage_reward.reward_id` -> `m_reward.reward_id`

## 運用メモ
- スキーマ変更は `supabase/migrations` の SQL で管理する。
- API 実装では `master.m_stage_reward` / `master.m_reward` / `master.m_piece(image_*)` を参照済み。
