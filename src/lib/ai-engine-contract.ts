export type AiMove = {
  fromRow: number | null;
  fromCol: number | null;
  toRow: number;
  toCol: number;
  pieceCode: string;
  promote: boolean;
  dropPieceCode: string | null;
  capturedPieceCode: string | null;
  notation: string | null;
};

export type AiPosition = {
  sideToMove: 'player' | 'enemy';
  turnNumber: number;
  moveCount: number;
  sfen?: string | null;
  stateHash?: string | null;
  boardState: Record<string, unknown>;
  hands: Record<string, unknown>;
  legalMoves: AiMove[];
};

export type EngineConfig = {
  maxDepth?: number;
  maxNodes?: number;
  timeLimitMs?: number;
  quiescenceEnabled?: boolean;
  evalMaterialWeight?: number;
  evalPositionWeight?: number;
  evalKingSafetyWeight?: number;
  evalMobilityWeight?: number;
  blunderRate?: number;
  blunderMaxLossCp?: number;
  randomTopk?: number;
  temperature?: number;
  alwaysLegalMove?: boolean;
  mateAvoidance?: boolean;
  maxRepeatDrawBias?: number;
  randomSeed?: number | null;
};

export type AiMoveRequest = {
  gameId: string;
  moveNo: number;
  position: AiPosition;
  engineConfig?: EngineConfig;
};

export type AiMoveResponse = {
  selectedMove: AiMove;
  meta: {
    engineVersion: string;
    thinkMs: number;
    searchedNodes: number;
    searchDepth: number;
    evalCp: number;
    candidateCount: number;
    configApplied: Record<string, unknown>;
  };
};
