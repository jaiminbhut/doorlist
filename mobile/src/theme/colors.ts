/**
 * Doorlist's colours: the same tokens as the web (web/src/styles.css).
 * Violet hand-stamp ink is the one brand colour, on a lavender ground. Green,
 * red and amber are kept for the door's verdicts. The door console is dark in
 * both themes, like the venues it works in.
 */
export interface Palette {
  ground: string;
  paper: string;
  ink: string;
  inkSoft: string;
  line: string;
  stamp: string;
  onStamp: string;
  stampWash: string;
  ok: string;
  danger: string;
  noticeBg: string;
  noticeInk: string;

  console: string;
  consoleRaised: string;
  consoleInk: string;
  consoleSoft: string;
  consoleLine: string;
  consoleStamp: string;
  onConsoleStamp: string;
  admit: string;
  refuse: string;
  hold: string;
  onHold: string;
}

export const light: Palette = {
  ground: '#efedf6',
  paper: '#ffffff',
  ink: '#221a3d',
  inkSoft: '#5b5476',
  line: '#d8d3ea',
  stamp: '#5b2bd0',
  onStamp: '#ffffff',
  stampWash: '#e5ddfb',
  ok: '#0b7a47',
  danger: '#b3202c',
  noticeBg: '#fbefd2',
  noticeInk: '#664400',

  console: '#160f27',
  consoleRaised: '#241b3d',
  consoleInk: '#f3effc',
  consoleSoft: '#aea6cb',
  consoleLine: '#3d3360',
  consoleStamp: '#b39bff',
  onConsoleStamp: '#170d33',
  admit: '#0e8a50',
  refuse: '#c8202f',
  hold: '#f2b200',
  onHold: '#221a3d',
};

export const dark: Palette = {
  ...light,
  ground: '#120e1c',
  paper: '#1d1730',
  ink: '#eeeaf8',
  inkSoft: '#a69ec2',
  line: '#352d4e',
  stamp: '#b39bff',
  onStamp: '#170d33',
  stampWash: '#2c2352',
  ok: '#6fdba4',
  danger: '#ff8e96',
  noticeBg: '#3a2c0e',
  noticeInk: '#f5cf7a',
  console: '#0c0817',
  consoleRaised: '#1d1631',
};
