/** Renderer helpers that do not belong to any page. */

/**
 * Turns whatever was thrown into a sentence a person can act on.
 *
 * Electron wraps a rejected main-process handler in
 * `Error invoking remote method 'channel': Error: <the real message>`, and showing that whole
 * string is how a dialog ends up telling the user nothing.
 */
export function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const unwrapped = raw.replace(
    /^Error invoking remote method '[^']+':\s*(Error:\s*)?/,
    '',
  );
  return unwrapped || 'The application could not complete that request.';
}
