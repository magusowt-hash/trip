export function onRequestError(error: unknown): never {
  if (error instanceof Error) {
    throw new Error(`Network error: ${error.message}`);
  }

  throw new Error('Unknown network error');
}
