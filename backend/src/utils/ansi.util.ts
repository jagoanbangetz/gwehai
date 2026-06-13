/**
 * ANSI escape code stripper.
 *
 * Removes all ANSI CSI sequences (colors, cursor movement, erase, etc.)
 * from terminal tool output so it can be stored and displayed cleanly.
 *
 * Covers:
 *   - CSI sequences:   ESC[ ... letter   (colors, bold, cursor, erase, etc.)
 *   - OSC sequences:   ESC ] ... BEL/ST  (window titles, hyperlinks)
 *   - Fe sequences:    ESC [> , ESC [? , ESC ( , ESC ) , etc.
 *   - Single-char:     ESC c (reset), ESC 7/8 (save/restore)
 *   - Bare ESC at end: leftover ESC byte at end of string
 */

const ANSI_REGEX = new RegExp(
  // CSI sequences (most common — colors, bold, underline, cursor movement)
  '(?:\\x1b\\[[0-9;]*[A-Za-z])'
  // OSC sequences: ESC ] ... BEL  or  ESC ] ... ESC backslash
  + '|(?:\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\))'
  // Fe sequences: ESC [> or ESC [? followed by params and letter
  + '|(?:\\x1b\\[[>?][0-9;]*[A-Za-z])'
  // Charset sequences: ESC ( X, ESC ) X
  + '|(?:\\x1b[()][A-Za-z])'
  // Single-char escapes: ESC c (reset), ESC 7/8 (save/restore cursor)
  + '|(?:\\x1b[78c])'
  // Catch bare ESC at end of string
  + '|(?:\\x1b$)',
  'g',
);

export function stripAnsi(text: string): string {
  if (!text) return text;
  return text.replace(ANSI_REGEX, '');
}
