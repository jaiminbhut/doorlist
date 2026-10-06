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
