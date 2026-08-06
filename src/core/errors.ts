export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Marks failures that have already been persisted and counted in the event log. */
export class LoggedCommandError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LoggedCommandError";
  }
}

export function isLoggedCommandError(error: unknown): error is LoggedCommandError {
  return error instanceof LoggedCommandError;
}
