import type { AiMoveRequest, AiMoveResponse } from '@/lib/ai-engine-contract';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { NormalizedEngineConfig } from '@/lib/engine-config';

export async function persistAiTurn(params: {
  request: AiMoveRequest;
  normalizedConfig: NormalizedEngineConfig;
  response: AiMoveResponse;
}): Promise<void> {
  const { request, normalizedConfig, response } = params;

  await touchGameLifecycle(request, response);
  await insertInferenceLog(request, normalizedConfig, response);
  await upsertMove(request, response);
  await upsertPosition(request);
}

async function touchGameLifecycle(request: AiMoveRequest, response: AiMoveResponse) {
  const isKingCapture = response.selectedMove.capturedPieceCode === 'OU';
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (isKingCapture) {
    const actor = request.position.sideToMove;
    updatePayload.status = 'finished';
    updatePayload.result = actor === 'player' ? 'player_win' : 'enemy_win';
    updatePayload.winner_side = actor;
    updatePayload.ended_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .schema('game')
    .from('games')
    .update(updatePayload)
    .eq('game_id', request.gameId)
    .select('game_id')
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`GAME_NOT_FOUND: ${request.gameId}`);
  }
}

async function insertInferenceLog(
  request: AiMoveRequest,
  normalizedConfig: NormalizedEngineConfig,
  response: AiMoveResponse
) {
  const selectedMoveText = response.selectedMove.notation ?? formatMoveText(response.selectedMove);

  const { error } = await supabaseAdmin.schema('game').from('ai_inference_logs').insert({
    game_id: request.gameId,
    move_no: request.moveNo,
    engine_version: response.meta.engineVersion,
    engine_config: normalizedConfig,
    request_payload: request,
    response_payload: response,
    selected_move: selectedMoveText,
    eval_cp: response.meta.evalCp,
    searched_nodes: response.meta.searchedNodes,
    search_depth: response.meta.searchDepth,
    think_ms: response.meta.thinkMs,
  });

  if (error) throw error;
}

async function upsertMove(request: AiMoveRequest, response: AiMoveResponse) {
  const move = response.selectedMove;
  const { error } = await supabaseAdmin
    .schema('game')
    .from('moves')
    .upsert(
      {
        game_id: request.gameId,
        move_no: request.moveNo,
        actor_side: request.position.sideToMove,
        from_row: move.fromRow,
        from_col: move.fromCol,
        to_row: move.toRow,
        to_col: move.toCol,
        piece_code: move.pieceCode,
        promote: move.promote,
        drop_piece_code: move.dropPieceCode,
        captured_piece_code: move.capturedPieceCode,
        notation: move.notation,
        thought_ms: response.meta.thinkMs,
      },
      { onConflict: 'game_id,move_no' }
    );

  if (error) throw error;
}

async function upsertPosition(request: AiMoveRequest) {
  const nextSide = request.position.sideToMove === 'player' ? 'enemy' : 'player';
  const { error } = await supabaseAdmin
    .schema('game')
    .from('positions')
    .upsert(
      {
        game_id: request.gameId,
        board_state: request.position.boardState,
        hands: request.position.hands,
        side_to_move: nextSide,
        turn_number: request.position.turnNumber + 1,
        move_count: request.position.moveCount + 1,
        sfen: request.position.sfen ?? null,
        state_hash: request.position.stateHash ?? null,
      },
      { onConflict: 'game_id' }
    );

  if (error) throw error;
}

function formatMoveText(move: AiMoveResponse['selectedMove']): string {
  const src = move.fromRow === null || move.fromCol === null ? 'drop' : `${move.fromRow},${move.fromCol}`;
  return `${src}->${move.toRow},${move.toCol}:${move.pieceCode}`;
}
