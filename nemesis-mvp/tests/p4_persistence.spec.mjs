// P4 — Rivalry Manager: persistence, ledger, progression, tags, debug panel
// FR-2.1 (AC-2.1.1..4), FR-2.2 (AC-2.2.1..4), FR-2.3, FR-6.1, FR-6.2
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();

// ---- AC-2.1.1/2.1.2: created on first boot with full schema ----
const created = await page.evaluate(() => {
  const g = window.__game, d = g.manager.doc;
  return {
    mode: g.bootMode,
    hasAll: ['name', 'level', 'stats', 'appearanceTags', 'emotionalState',
             'record', 'styleProfile', 'rating', 'createdAt']
      .every(k => k in d),
    name: d.name, level: d.level,
    stats: d.stats, hate: d.emotionalState,
  };
});
check('fresh boot creates rival profile with full schema',
  created.mode === 'created' && created.hasAll && created.level === 1,
  JSON.stringify(created));

// ---- FR-2.3: duel end -> record, hate, XP, ledger; level-up grows stats ----
const progression = await page.evaluate(() => {
  const g = window.__game, m = g.manager;
  // force a blocking-dominant player profile (level-ups should grow ATTACK)
  Object.assign(g.profile, { blocks: 40, dodges: 5, defChances: 50, defTaken: 30, lights: 20, heavies: 5, attacks: 25 });
  m.doc.xp = 90;                                  // one duel from level 2
  const atk0 = m.doc.stats.attack;
  const won = m.onDuelEnd({ playerHp: 42, rivalHp: 0 });   // player wins
  return {
    playerWon: won,
    losses: m.doc.record.losses,
    hate: m.doc.emotionalState,
    level: m.doc.level,
    atkGrew: m.doc.stats.attack > atk0,
    dominant: m.dominantPlayerStyle(),
    tags: [...m.doc.appearanceTags],
    ledgerEvents: m.ledger.entries.map(e => e.event),
  };
});
check('duel end records loss + hate rises', progression.playerWon &&
  progression.losses === 1 && progression.hate > 0, JSON.stringify(progression));
check('level-up triggered by XP', progression.level === 2);
check('growth counters dominant style (blocking → attack)',
  progression.dominant === 'blocking' && progression.atkGrew);
check('first defeat adds Scarred tag', progression.tags.includes('Scarred'));
check('ledger logged duel + observation + training',
  progression.ledgerEvents.includes('duel_lost') &&
  progression.ledgerEvents.includes('observation') &&
  progression.ledgerEvents.includes('rival_trained'),
  progression.ledgerEvents.join(','));

// ---- AC-2.1.3: tag visuals attach to the rival's body ----
const tagVisual = await page.evaluate(() => {
  const g = window.__game;
  const before = g.rival.mesh.children.length;
  g.manager.applyTagVisuals(g.rival);
  return { before, after: g.rival.mesh.children.length };
});
check('Scarred tag renders on the rival body', tagVisual.after > 4, JSON.stringify(tagVisual));

// ---- AC-2.2.4: ledger cap keeps genesis entry ----
const cap = await page.evaluate(() => {
  const g = window.__game, m = g.manager;
  m.ledger.add('player_fled_first_duel', 'Player cowardice: Fled the initial duel.');
  for (let i = 0; i < 130; i++) m.ledger.add('observation', `filler ${i}`);
  return {
    len: m.ledger.entries.length,
    genesisKept: m.ledger.has('player_fled_first_duel'),
    significant: m.ledger.lastSignificant()?.event,
  };
});
check('ledger caps at 100', cap.len === 100, `len ${cap.len}`);
check('genesis entry never dropped', cap.genesisKept);
check('lastSignificant ranks genesis above filler', cap.significant === 'player_fled_first_duel');

// ---- AC-6.1.2: reload restores everything ----
const before = await page.evaluate(() => {
  const g = window.__game;
  g.manager.doc.emotionalState = 77;
  g.manager.save();
  return {
    doc: JSON.parse(JSON.stringify(g.manager.doc)),
    ledgerLen: g.manager.ledger.entries.length,
    rating: +g.sync.rating.toFixed(1),
    heavyPref: +g.profile.heavyPref.toFixed(3),
  };
});
await page.reload();
await page.waitForFunction(() => window.__game != null, { timeout: 10000 });
const after = await page.evaluate(() => {
  const g = window.__game;
  return {
    mode: g.bootMode,
    doc: JSON.parse(JSON.stringify(g.manager.doc)),
    ledgerLen: g.manager.ledger.entries.length,
    rating: +g.sync.rating.toFixed(1),
    heavyPref: +g.profile.heavyPref.toFixed(3),
    rivalMaxHp: g.rival.maxHp,
    rivalAtk: g.rival.stats.attack,
    tagMeshes: g.rival.mesh.children.length,
  };
});
check('reload restores rival profile byte-identical',
  after.mode === 'restored' &&
  JSON.stringify(after.doc) === JSON.stringify(before.doc),
  `name ${after.doc.name} lvl ${after.doc.level} hate ${after.doc.emotionalState}`);
check('reload restores ledger, rating, styleProfile',
  after.ledgerLen === before.ledgerLen &&
  after.rating === before.rating &&
  after.heavyPref === before.heavyPref);
check('restored stats + tags applied to the fighter',
  after.rivalAtk === after.doc.stats.attack && after.tagMeshes > 4);

// ---- FR-6.2: debug panel opens and shows live state ----
const dbg = await page.evaluate(() => {
  const g = window.__game;
  g.debugPanel.toggle();
  const html = document.getElementById('debug');
  return {
    visible: html.style.display === 'block',
    mentionsRival: html.textContent.includes(g.manager.doc.name) || html.textContent.includes('RIVAL'),
    hasLedger: html.textContent.includes('LEDGER'),
    hasButtons: html.querySelectorAll('button').length >= 6,
  };
});
check('debug panel opens with rivalry state + forcing buttons',
  dbg.visible && dbg.mentionsRival && dbg.hasLedger && dbg.hasButtons, JSON.stringify(dbg));

// ---- reset wipes storage ----
const wiped = await page.evaluate(() => {
  const g = window.__game;
  g.manager.reset();
  return g.store.getJSON('nemesis-rival-v1') === null;
});
check('reset rivalry wipes storage', wiped);

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p4.png' });
await browser.close();
finish();
