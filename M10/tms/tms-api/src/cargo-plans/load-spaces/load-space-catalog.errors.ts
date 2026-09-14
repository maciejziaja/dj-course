export class UnknownLoadSpaceTypeError extends Error {
  constructor(type: string, allowed: string[]) {
    super(`Unknown load space type: '${type}'. Allowed: ${allowed.join(', ')}`);
    this.name = 'UnknownLoadSpaceTypeError';
  }
}
