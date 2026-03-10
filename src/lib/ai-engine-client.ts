import { AiEngineConnectionError, AiEngineHttpError } from '@/lib/ai-engine-errors';
import type { AiMoveRequest, AiMoveResponse } from '@/lib/ai-engine-contract';
import type { NormalizedEngineConfig } from '@/lib/engine-config';

export async function requestAiMove(
  input: AiMoveRequest & { engineConfig: NormalizedEngineConfig },
): Promise<AiMoveResponse> {
  const baseUrl = (process.env.AI_ENGINE_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/ai/move`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toEngineRequest(input)),
    });
  } catch (error: any) {
    throw new AiEngineConnectionError(error?.message ?? 'failed to connect to ai engine');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new AiEngineHttpError(response.status, text);
  }

  const json = (await response.json()) as {
    selected_move: {
      from_row: number | null;
      from_col: number | null;
      to_row: number;
      to_col: number;
      piece_code: string;
      promote: boolean;
      drop_piece_code: string | null;
      captured_piece_code: string | null;
      notation: string | null;
    };
    meta: {
      engine_version: string;
      think_ms: number;
      searched_nodes: number;
      search_depth: number;
      eval_cp: number;
      candidate_count: number;
      config_applied: Record<string, unknown>;
    };
  };

  return {
    selectedMove: {
      fromRow: json.selected_move.from_row,
      fromCol: json.selected_move.from_col,
      toRow: json.selected_move.to_row,
      toCol: json.selected_move.to_col,
      pieceCode: json.selected_move.piece_code,
      promote: json.selected_move.promote,
      dropPieceCode: json.selected_move.drop_piece_code,
      capturedPieceCode: json.selected_move.captured_piece_code,
      notation: json.selected_move.notation,
    },
    meta: {
      engineVersion: json.meta.engine_version,
      thinkMs: json.meta.think_ms,
      searchedNodes: json.meta.searched_nodes,
      searchDepth: json.meta.search_depth,
      evalCp: json.meta.eval_cp,
      candidateCount: json.meta.candidate_count,
      configApplied: json.meta.config_applied,
    },
  };
}

function toEngineRequest(input: AiMoveRequest & { engineConfig: NormalizedEngineConfig }) {
  return {
    game_id: input.gameId,
    move_no: input.moveNo,
    position: {
      side_to_move: input.position.sideToMove,
      turn_number: input.position.turnNumber,
      move_count: input.position.moveCount,
      sfen: input.position.sfen ?? null,
      state_hash: input.position.stateHash ?? null,
      board_state: input.position.boardState,
      hands: input.position.hands,
      legal_moves: input.position.legalMoves.map((move) => ({
        from_row: move.fromRow,
        from_col: move.fromCol,
        to_row: move.toRow,
        to_col: move.toCol,
        piece_code: move.pieceCode,
        promote: move.promote,
        drop_piece_code: move.dropPieceCode,
        captured_piece_code: move.capturedPieceCode,
        notation: move.notation,
      })),
    },
    engine_config: {
      max_depth: input.engineConfig.maxDepth,
      max_nodes: input.engineConfig.maxNodes,
      time_limit_ms: input.engineConfig.timeLimitMs,
      quiescence_enabled: input.engineConfig.quiescenceEnabled,
      eval_material_weight: input.engineConfig.evalMaterialWeight,
      eval_position_weight: input.engineConfig.evalPositionWeight,
      eval_king_safety_weight: input.engineConfig.evalKingSafetyWeight,
      eval_mobility_weight: input.engineConfig.evalMobilityWeight,
      blunder_rate: input.engineConfig.blunderRate,
      blunder_max_loss_cp: input.engineConfig.blunderMaxLossCp,
      random_topk: input.engineConfig.randomTopk,
      temperature: input.engineConfig.temperature,
      always_legal_move: input.engineConfig.alwaysLegalMove,
      mate_avoidance: input.engineConfig.mateAvoidance,
      max_repeat_draw_bias: input.engineConfig.maxRepeatDrawBias,
      random_seed: input.engineConfig.randomSeed,
    },
  };
}
