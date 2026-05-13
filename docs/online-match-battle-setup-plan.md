# Online Match Battle Setup Plan

## Goal
- オンライン対戦の開始前に、ユーザーが所持している駒を使って初期盤面を編集できるようにする
- 編集内容の検証と保存は `bff.shogi` が担当する
- 実際の対局開始時に `matching_server.shogi` が参照できるよう、サーバ検証済みの battle setup を提供する

## Responsibility Split
- `app.shogi`
  - 盤面編集 UI
  - ユーザー入力
  - 下書き編集
- `bff.shogi`
  - 所持駒と編成ルールの検証
  - battle setup の保存
  - `matching_server.shogi` 向けの取得 API 提供
- `matching_server.shogi`
  - match 確定後に battle setup を取得
  - piece catalog / skill definitions と合わせて rule snapshot を作成
  - 対局開始時の最終採用と対局管理

## Why BFF Owns Battle Setup
- 所持駒やデッキ情報は既存のプレイヤーデータと近い
- ユーザーの所有状態を `matching_server.shogi` に複製したくない
- 編集段階ではリアルタイム通信より API の方が扱いやすい
- 対局管理サーバは match 開始後の権威に集中させたい

## Proposed Data Shape

### `battle_setups`
- `battle_setup_id`
- `owner_user_id`
- `status`
- `name` nullable
- `board_layout`
- `hands_layout`
- `selected_piece_ids`
- `validation_summary`
- `created_at`
- `updated_at`

Expected statuses:
- `draft`
- `validated`
- `locked`
- `consumed`

## Validation Scope in BFF
- ユーザーが実際に所持している駒だけを使っているか
- 駒数制限に収まっているか
- 禁止マスや初期配置制約に違反していないか
- 重複配置や不正座標がないか
- 持ち駒初期状態の制約に違反していないか

`bff.shogi` では battle setup 自体の妥当性を検証するが、対局開始可否の最終確定は `matching_server.shogi` が行う。

## Proposed API Flow

### 1. Create / update draft
- `POST /api/v1/online-match/battle-setup`
- purpose:
  - 下書き作成または保存

### 2. Validate draft
- `POST /api/v1/online-match/battle-setup/:battleSetupId/validate`
- purpose:
  - 所持駒や配置制約をサーバで検証する

### 3. Get validated setup
- `GET /api/v1/online-match/battle-setup/:battleSetupId`
- purpose:
  - `matching_server.shogi` が match 開始時に取得する

### 4. Lock for match start
- `POST /api/v1/online-match/battle-setup/:battleSetupId/lock`
- purpose:
  - match 開始前に編集を凍結する

## Matching Server Integration
- マッチ成立後に `matching_server.shogi` は battle setup ID を元に `bff.shogi` へ取得を行う
- `bff.shogi` は `validated` または `locked` の setup だけを返す
- `matching_server.shogi` 側で piece catalog と合わせて final snapshot を生成する

## Security Notes
- `app.shogi` から送られた盤面は信用しない
- battle setup の保存時と取得時に owner / access 制御を入れる
- match 開始後に同じ setup が再編集されないよう lock 状態を持つ
- 対局中の盤面正本は `matching_server.shogi` のみが持つ

## Open Questions
- battle setup は 1 ユーザー複数保存可能にするか
- 対局相手に開始前プレビューを見せるか
- 対局確定時に setup を `consumed` へ進めるか、再利用可能にするか
