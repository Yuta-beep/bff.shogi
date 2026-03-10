export class AiEngineHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`AI engine returned HTTP ${status}`);
    this.name = 'AiEngineHttpError';
    this.status = status;
    this.body = body;
  }
}

export class AiEngineConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiEngineConnectionError';
  }
}
