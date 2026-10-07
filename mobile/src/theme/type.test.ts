import { displayType, fonts } from './type';

describe('displayType', () => {
  it('gives a line tighter than the font room above it, and takes it back', () => {
    // Big Shoulders' own line at 36 pt is 43.2 pt; the headings use 34.2.
    expect(displayType(36, 34.2)).toEqual({
      fontFamily: fonts.display,
      fontSize: 36,
      lineHeight: 34.2,
      paddingTop: 9,
      marginTop: -9,
    });
  });

  it('adds nothing when the line already fits the font', () => {
    expect(displayType(20, 24)).toEqual({
      fontFamily: fonts.display,
      fontSize: 20,
      lineHeight: 24,
    });
    expect(displayType(20, 30)).toEqual({
      fontFamily: fonts.display,
      fontSize: 20,
      lineHeight: 30,
    });
  });
});
