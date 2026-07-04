// DATA: taunt fragment pools (FR-3.1). Keyed by trigger x hate band.
// {name} = rival's name is never inserted (it speaks), {memory} = rendered
// most-significant ledger memory, {level} = rival level.
// Bands (AC-3.1.4): low < 34 measured · mid 34-66 contemptuous · high >= 67 furious.

export const BANDS = { low: [0, 33], mid: [34, 66], high: [67, 100] };

export function bandOf(hate) {
  return hate < 34 ? 'low' : hate < 67 ? 'mid' : 'high';
}

// The canonical genesis callback (AC-3.1.2): guaranteed-quality written
// lines for the first re-encounter after the player fled the first duel —
// the PRD's pre-baked-quality principle applied to text.
export const CANONICAL_FIRST_REENCOUNTER = [
  'You ran like a coward the day we met. I have thought of little else.',
  'The coward returns. Did your legs finally stop shaking?',
  'I remember you fleeing our first duel. Show me you have grown a spine.',
];

export const CANONICAL_RIVAL_FLED = [
  'I fled from you once. That debt is why you are still breathing.',
  'You saw my back once. Never again.',
];

// trigger x band -> line templates. {memory} slots the rendered ledger entry.
export const TAUNTS = {
  encounter_start: {
    low: [
      'So we meet again. {memory}',
      'I have been studying you. {memory}',
      'Level {level} now. You should turn around.',
      'You found me. Or perhaps I let you.',
    ],
    mid: [
      '{memory} — and yet you crawl back for more.',
      'Still using the same tricks? {memory}',
      'I carry every scar you gave me. Time to return them.',
      'You again. Good. I owe you pain.',
    ],
    high: [
      'I EXIST TO END YOU. {memory}',
      'Every defeat, every scar — TODAY YOU PAY FOR ALL OF IT.',
      '{memory} — I have not forgotten. I will NEVER forget.',
      'THERE YOU ARE. No running this time.',
    ],
  },
  player_low_hp: {
    low: ['You are bleeding. Yield.', 'This is the gap between us.', 'Fall. It is arithmetic now.'],
    mid: ['Look at you stagger. Just like before.', 'Beg, and I may make it quick.', 'Your style is an open book — {memory}'],
    high: ['DIE ALREADY.', 'THIS is what your cowardice bought you!', 'I want you to remember this feeling.'],
  },
  rival_low_hp: {
    low: ['A worthy exchange. But not enough.', 'You have improved. Interesting.', 'Good. GOOD. More.'],
    mid: ['Lucky strikes. Nothing more.', 'You think this wound matters? I have worse from training.', 'I bled worse the day you ran.'],
    high: ['PAIN MEANS NOTHING TO ME.', 'You cannot kill what you created!', 'Even broken, I am MORE than you.'],
  },
  duel_end_win: {
    low: ['As expected. Train harder.', 'The ledger favors me again.', 'Return when you are worth my time.'],
    mid: ['Predictable to the last breath. {memory}', 'Another win for my collection.', 'Crawl home. Practice. Repeat.'],
    high: ['YES. Remember this ruin. I will do it again and again.', 'Your defeat feeds me.', 'THAT is what you are worth.'],
  },
  duel_end_loss: {
    low: ['Noted. It will not happen twice.', 'A lesson. I take those seriously.', 'Enjoy it. It is rented, not owned.'],
    mid: ['You will regret leaving me alive.', 'I learn faster than you win.', 'Savor this one. It is your last.'],
    high: ['THIS CHANGES NOTHING. I WILL RISE.', 'Scar me again — I grow back sharper.', 'I will train until your victories are impossible.'],
  },
  ambush_sprung: {
    low: ['You walk loudly. I merely listened.', 'Predictable path. Predictable end.', 'You always come this way.'],
    mid: ['Same route every time. {memory} — you never learn.', 'I have been waiting here for you. Comfortable, even.', 'Your habits betray you.'],
    high: ['I KNEW YOU WOULD COME THIS WAY. NOW BLEED.', 'The trap was set the moment you fled me.', 'Caught. Like the vermin you are.'],
  },
};

// how a ledger memory reads inside a taunt (significance ranked by Ledger)
export const MEMORY_LINES = {
  player_fled_first_duel: 'you fled our first duel like a coward',
  rival_fled_first_duel: 'I once showed you my back — never again',
  duel_won: 'I broke you last time',
  duel_lost: 'you cut me once',
  player_escaped_duel: 'you ran from me again',
  ambush_sprung: 'you walked into my trap',
  rival_trained: 'I have been training for you',
  observation: null,     // rendered from the observation label itself
};
