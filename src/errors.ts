export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Cross-tenant and nonexistent resources deliberately share one error type and
// one body: the API must not become an existence oracle. See docs/design.md §8.
export class NotFoundError extends HttpError {
  constructor() {
    super(404, 'not_found');
  }
}
