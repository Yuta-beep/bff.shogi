# API v1 Contract (Fixed)

## Common Envelope

- Success: `{ "ok": true, "data": <payload> }`
- Error: `{ "ok": false, "error": { "code": string, "message": string } }`

## Endpoints

### `POST /api/v1/games`
- Success `200`: `data = { gameId: string, status: string, startedAt: string }`
- Errors:
  - `400 INVALID_JSON`
  - `400 INVALID_PLAYER_ID`
  - `500 CREATE_GAME_FAILED | CREATE_POSITION_FAILED | INTERNAL_ERROR`

### `POST /api/v1/ai/move`
- Success `200`:
  - `data = { selectedMove, meta, position, game }`
  - `position` は selected move 適用後に保存された canonical next position
- Errors:
  - `400 INVALID_JSON`
  - `400 INVALID_REQUEST`
  - `404 GAME_NOT_FOUND`
  - `409 MOVE_NO_MISMATCH | TURN_MISMATCH | STALE_POSITION`
  - `4xx AI_ENGINE_BAD_REQUEST`
  - `502 AI_ENGINE_UPSTREAM | AI_ENGINE_UNREACHABLE`
  - `500 ENGINE_INTERNAL`

### `POST /api/v1/games/:gameId/moves`
- Success `200`:
  - `data = { moveNo, actorSide, move, position, game }`
  - `position` は player/AI 共通 apply service で生成された canonical next position
- Errors:
  - `400 INVALID_JSON`
  - `400 INVALID_REQUEST | INVALID_POSITION`
  - `404 GAME_NOT_FOUND`
  - `409 MOVE_NO_MISMATCH | TURN_MISMATCH | STALE_POSITION`
  - `500 INTERNAL_ERROR`

### `GET /api/v1/stages`
- Success `200`: `data = { stages: StageSummary[], note: string }`
- Errors:
  - `500 INTERNAL_ERROR`

### `GET /api/v1/stages/progress`
- Success `200`: `data = { clearedStageNos: number[] }`
- Errors:
  - `401 UNAUTHORIZED`
  - `500 INTERNAL_ERROR`

### `POST /api/v1/stages/:stageNo/select`
- Success `200`:
  - `{ canStart: true, note: "NO_USER_PROGRESS_TABLE_YET" }`
  - `{ canStart: false, reason: "NOT_FOUND" | "LOCKED" }`
- Errors:
  - `400 INVALID_STAGE_NO`
  - `500 INTERNAL_ERROR`

### `GET /api/v1/stages/:stageNo/battle-setup`
- Success `200`: `data = { stage, labels, board, enemyRoster, rewards }`
- Errors:
  - `400 INVALID_STAGE_NO`
  - `403 LOCKED`
  - `404 NOT_FOUND`
  - `500 INTERNAL_ERROR`

### `GET /api/v1/pieces/catalog`
- Success `200`: `data = { items: PieceCatalogItem[] }`
- `PieceCatalogItem` 主要フィールド:
  - `pieceId`, `pieceCode`, `moveCode`
  - `char`, `name`, `unlock`
  - `desc`, `skill`
  - `move` (人間向け移動説明)
  - `moveVectors: [{ dx, dy, maxStep }]`
  - `isRepeatable`, `canJump`
  - `moveConstraints` (JSON)
  - `moveRules: [{ ruleType, priority, params }]`
- Errors:
  - `500 INTERNAL_ERROR`

### `GET /api/v1/deck`
- Success `200`: `data = DeckSnapshot`
- Errors:
  - `401 UNAUTHORIZED`
  - `500 INTERNAL_ERROR`

### `POST /api/v1/deck`
- Success `200`: `data = { deckId: number }`
- Errors:
  - `401 UNAUTHORIZED`
  - `400 INVALID_JSON | INVALID_INPUT`
  - `500 INTERNAL_ERROR`

### `DELETE /api/v1/deck?deckId=<id>`
- Success `200`: `data = { deleted: true }`
- Errors:
  - `401 UNAUTHORIZED`
  - `400 INVALID_INPUT`
  - `500 INTERNAL_ERROR`

### `GET /api/v1/me/snapshot`
- Success `200`: `data = { playerName, rating, pawnCurrency, goldCurrency, playerRank, playerExp }`
- Errors:
  - `401 UNAUTHORIZED`
  - `404 PLAYER_NOT_FOUND`
  - `500 INTERNAL_ERROR`

### `GET /api/v1/shops/piece/catalog`
- Success `200`: `data = { items, pawnCurrency, goldCurrency, owned, note }`

### `POST /api/v1/shops/piece/purchase`
- Success `200`: `data = { success: false, reason: "UI_ONLY", note }`
- Errors:
  - `400 INVALID_JSON | INVALID_ITEM_KEY`
  - `404 ITEM_NOT_FOUND`

### `POST /api/v1/stages/:stageNo/clear`
- Success `200`: `data = { stageNo, firstClear, clearCount, granted: { pawn, gold, pieces }, wallet: { pawnCurrency, goldCurrency } }`
- Reward source:
  - master definition: `master.m_stage_reward` (`first_clear` / `clear`) + `master.m_reward` (`currency` / `piece`)
  - player progress: `public.player_stage_clears` (`clear_count`)
- Errors:
  - `400 INVALID_STAGE_NO`
  - `401 UNAUTHORIZED`
  - `403 LOCKED`
  - `404 NOT_FOUND`
  - `500 INTERNAL_ERROR`
