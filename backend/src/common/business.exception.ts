export class BusinessException extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly statusCode: number;

  constructor(code: string, message: string, retryable: boolean = false, statusCode: number = 409) {
    super(message);
    this.name = 'BusinessException';
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}
