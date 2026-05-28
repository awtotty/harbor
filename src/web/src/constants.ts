import type { Theme } from './types';

export const promptSuggestions = [
  'Review the current workspace and tell me what you find.',
  'Summarize recent changes in this repo.',
  'Create a TODO.md for the next implementation steps.',
];

export const themes: Array<{ id: Theme; name: string; note: string }> = [
  { id: 'harbor', name: 'Harbor', note: 'deep water console' },
  { id: 'folio', name: 'Folio', note: 'editorial paper' },
  { id: 'terminal', name: 'Terminal', note: 'phosphor shell' },
  { id: 'atelier', name: 'Atelier', note: 'warm studio' },
  { id: 'brutal', name: 'Brutal', note: 'raw control room' },
];
