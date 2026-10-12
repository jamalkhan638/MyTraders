/** The server answered with an error status. `details` are per-field messages (422). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** No answer at all: offline, DNS / TLS failure or timeout. Always safe to retry later. */
export class NetworkError extends Error {
  constructor(message = 'No internet connection') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * The session cannot continue (expired / reused refresh token, account disabled, organization
 * suspended). The user must sign in again; orders stay safely on the phone.
 */
export class SessionEndedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionEndedError';
  }
}
