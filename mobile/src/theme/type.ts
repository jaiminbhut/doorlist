/**
 * Type, as on the web:
 * - Big Shoulders, a condensed signage face, for display type.
 * - Atkinson Hyperlegible Next, designed to stay readable in poor conditions,
 *   for text. Names and codes get read at a dark door.
 * The fonts are embedded at build time (app.config.ts), each under its
 * PostScript name, which works on both platforms.
 */
export const fonts = {
  display: 'BigShoulders-ExtraBold',
  text: 'AtkinsonHyperlegibleNext-Regular',
  textBold: 'AtkinsonHyperlegibleNext-Bold',
} as const;

/** Big Shoulders' own line, ascender to descender, in ems (hhea: 1971 and -429 of 2000). */
const DISPLAY_LINE = 1.2;

/**
 * Big Shoulders at a line height tighter than its own line, as on the web.
 * A browser lets the first line's tops overflow the line box; iOS and Android
 * clip them instead. So the text gets that much room above it, taken back by
 * the same negative margin: the tops show, and the layout doesn't move.
 */
export function displayType(fontSize: number, lineHeight: number) {
  const type = { fontFamily: fonts.display, fontSize, lineHeight };
  const room = Math.ceil(fontSize * DISPLAY_LINE - lineHeight);
  return room > 0 ? { ...type, paddingTop: room, marginTop: -room } : type;
}

/** The web's type scale (--step--1 to --step-5), in points. */
export const size = {
  small: 14,
  body: 17,
  large: 20,
  title: 26,
  display: 36,
  poster: 52,
  hero: 72,
} as const;

export const radius = {
  control: 10,
  surface: 18,
} as const;
