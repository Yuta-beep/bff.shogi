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

export type CanonicalPosition = {
  sideToMove: 'player' | 'enemy';
  turnNumber: number;
  moveCount: number;
  sfen?: string | null;
  stateHash?: string | null;
  boardState: Record<string, unknown>;
  hands: Record<string, unknown>;
};

export type AiPosition = CanonicalPosition & {
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

export type AiMoveMeta = {
  engineVersion: string;
  thinkMs: number;
  searchedNodes: number;
  searchDepth: number;
  evalCp: number;
  candidateCount: number;
  configApplied: Record<string, unknown>;
};

export type AiMoveResponse =
  | { isCheckmate: true }
  | { isCheckmate: false; selectedMove: AiMove; meta: AiMoveMeta };

export type ApplyMoveRequest = {
  position: AiPosition;
  selectedMove: AiMove;
};

export type ApplyMoveResponse = {
  position: CanonicalPosition;
};

export type LegalMovesRequest = {
  position: AiPosition;
};

export type LegalMovesResponse = {
  legalMoves: AiMove[];
};

export type GameStatusSnapshot = {
  status: 'in_progress' | 'finished' | 'aborted';
  result: 'player_win' | 'enemy_win' | 'draw' | 'abort' | null;
  winnerSide: 'player' | 'enemy' | null;
};

export type CommittedMoveResponse = {
  moveNo: number;
  actorSide: 'player' | 'enemy';
  clientMoveId?: string | null;
  move: AiMove;
  skillTriggered: boolean;
  serverAppliedAt?: string;
  position: CanonicalPosition;
  game: GameStatusSnapshot;
};

export type AiTurnResult = {
  selectedMove: AiMove | null;
  skillTriggered: boolean;
  meta: AiMoveMeta | null;
  position: CanonicalPosition;
  game: GameStatusSnapshot;
};
