// lib/emoji.js — single source of truth for avatar emojis + card colors.
// Used by the server (to validate a chosen avatar) and served to the client
// (GET /api/config) so the signup grid and validation never drift apart.

export const EMOJI = [
  // Animals — 🪿 the goose leads the flock (this is Gooseminton!)
  ['🪿','Animals'],['🦢','Animals'],['🦅','Animals'],['🦊','Animals'],['🐯','Animals'],
  ['🐼','Animals'],['🦉','Animals'],['🐧','Animals'],['🦁','Animals'],['🐺','Animals'],
  ['🐨','Animals'],['🐸','Animals'],['🦈','Animals'],['🐢','Animals'],['🐝','Animals'],
  ['🦄','Animals'],['🐙','Animals'],['🦋','Animals'],['🐬','Animals'],['🦔','Animals'],
  ['🐡','Animals'],['🦖','Animals'],['🐳','Animals'],['🦓','Animals'],['🐆','Animals'],
  ['🦌','Animals'],['🦂','Animals'],['🦇','Animals'],['🐉','Animals'],['🐊','Animals'],
  ['🦍','Animals'],['🦜','Animals'],['🦩','Animals'],['🐥','Animals'],['🦦','Animals'],
  ['🦫','Animals'],['🐿️','Animals'],['🦥','Animals'],['🦡','Animals'],['🐷','Animals'],
  ['🐴','Animals'],
  // Sports
  ['🏸','Sports'],['🏆','Sports'],['🥇','Sports'],['🎯','Sports'],['🔥','Sports'],
  ['⚡','Sports'],['💥','Sports'],['🚀','Sports'],['🥊','Sports'],['🎽','Sports'],
  ['🏅','Sports'],['⭐','Sports'],['💪','Sports'],['🧨','Sports'],['🎾','Sports'],
  ['🏓','Sports'],['🥏','Sports'],['🎖️','Sports'],['👑','Sports'],['💎','Sports'],
  ['🥅','Sports'],['🤸','Sports'],['🏃','Sports'],['🥋','Sports'],['🎱','Sports'],
  // Faces
  ['😎','Faces'],['🤖','Faces'],['👽','Faces'],['🤠','Faces'],['🥷','Faces'],
  ['🦸','Faces'],['🧙','Faces'],['🧛','Faces'],['🤴','Faces'],['👸','Faces'],
  ['🧑‍🚀','Faces'],['🕵️','Faces'],['😼','Faces'],['🤯','Faces'],['🥶','Faces'],
  ['😤','Faces'],['🤩','Faces'],['😈','Faces'],['💀','Faces'],['👻','Faces'],
  ['🤡','Faces'],['🎃','Faces'],['🦾','Faces'],['🧠','Faces'],['👾','Faces'],
  ['🫡','Faces'],['🤪','Faces'],['🥸','Faces'],['🤓','Faces'],['😇','Faces'],
  // Food
  ['🍜','Food'],['🍕','Food'],['🌮','Food'],['🍣','Food'],['🍔','Food'],
  ['🍩','Food'],['🧋','Food'],['🍦','Food'],['🥑','Food'],['🌶️','Food'],
  ['🍇','Food'],['🍉','Food'],['🍌','Food'],['🥥','Food'],['☕','Food'],
  ['🍺','Food'],['🥭','Food'],['🍒','Food'],['🥐','Food'],['🍟','Food'],
  ['🍿','Food'],['🍫','Food'],['🍰','Food'],['🥟','Food'],['🍱','Food'],
  ['🍤','Food'],['🧁','Food'],
];

export const CATEGORIES = ['Animals', 'Sports', 'Faces', 'Food'];

export const COLORS = [
  '#F97316', '#22C55E', '#EF4444', '#3B82F6', '#A855F7',
  '#EAB308', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6',
];

export const EMOJI_SET = new Set(EMOJI.map(e => e[0]));
export const COLOR_SET = new Set(COLORS);

export function emojiConfig() {
  return { emojis: EMOJI.map(([char, cat]) => ({ char, cat })), categories: CATEGORIES, colors: COLORS };
}
