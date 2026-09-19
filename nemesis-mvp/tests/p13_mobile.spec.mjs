// P13 — mobile: touch controls & responsive layout (M11, developer-
// requested). FR-11.1..11.3 (spec.md §8.9). Boots TWO contexts: a real
// mobile emulation (touch+small viewport) and a plain desktop one, to
// prove the feature is genuinely additive — desktop must come out
// byte-identical to every earlier suite.
import { boot, check, finish } from './helpers.js';

// ---- synthetic touch dispatch: real TouchEvent objects on real elements,
// not internal method calls — proves the DOM wiring itself, not just the
// Input class in isolation
const TOUCH_HELPERS = `
window.__fireTouch = (el, type, x, y, id = 0) => {
  const touch = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
  const ev = new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
};
`;

// ================= mobile context =================

const { browser, page, errors } = await boot({ width: 390, height: 844, hasTouch: true, isMobile: true });
await page.evaluate(TOUCH_HELPERS);
await page.evaluate(() => { window.__game.loop.stop(); });

// ---- AC-11.1.1: detection ----
const detect = await page.evaluate(() => ({
  mobileFlag: window.__game.mobile,
  bodyClass: document.body.classList.contains('mobile'),
  touchControlsPresent: !!window.__game.touchControls,
}));
check('AC-11.1.1 a touch+small-viewport context is detected as mobile',
  detect.mobileFlag && detect.bodyClass && detect.touchControlsPresent, JSON.stringify(detect));

// ---- AC-11.2.4: the touch DOM actually renders ----
const dom = await page.evaluate(() => ({
  stick: !!document.querySelector('.touchctl .stick'),
  buttons: [...document.querySelectorAll('.touchctl .btn[data-a]')].map(el => el.dataset.a).sort(),
  lookzone: !!document.querySelector('.touchctl .lookzone'),
  helpBtn: !!document.querySelector('body > div'),   // loose presence check refined below
}));
const EXPECTED_BUTTONS = ['light', 'heavy', 'block', 'dodge', 'special', 'ki', 'dash', 'flight', 'jump', 'descend', 'lock'].sort();
check('AC-11.2.3 every action has an on-screen button',
  JSON.stringify(dom.buttons) === JSON.stringify(EXPECTED_BUTTONS), JSON.stringify(dom.buttons));
check('AC-11.2.1/2.2 the joystick and camera drag-zone render', dom.stick && dom.lookzone, JSON.stringify(dom));

// ---- AC-11.2.1: joystick drives continuous movement via Input.touchAxes ----
await page.evaluate(() => {
  const g = window.__game;
  g.flow.enabled = false;
  g.rivalAgent.enabled = false;
  g.rival.pos.set(200, 0, 200); g.rival.prevPos.copy(g.rival.pos);
  g.player.pos.set(0, 0, 0); g.player.prevPos.copy(g.player.pos);
  g.player.yaw = 0; g.player.state = 'idle'; g.player.stateT = 0;
  g.rig.lockTarget = null;
  g.rig.yaw = 0; g.rig.pitch = 0.3;   // face a known direction
});
const joystick = await page.evaluate(() => {
  const g = window.__game;
  const stick = document.querySelector('.touchctl .stick');
  const r = stick.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  window.__fireTouch(stick, 'touchstart', cx, cy - 40, 5);   // drag UP -> forward
  const axesAtStart = { ...g.input.touchAxes };
  for (let i = 0; i < 30; i++) g.step(1);
  const posAfter = { x: g.player.pos.x, z: g.player.pos.z };
  window.__fireTouch(stick, 'touchend', cx, cy - 40, 5);
  const axesAfterRelease = g.input.touchAxes;
  return { axesAtStart, moved: Math.hypot(posAfter.x, posAfter.z) > 0.1, axesAfterRelease };
});
check('AC-11.2.1 dragging the joystick up sets a forward touchAxes (z>0)',
  joystick.axesAtStart.z > 0.5, JSON.stringify(joystick.axesAtStart));
check('AC-11.2.1 the fighter actually moves under joystick input', joystick.moved, JSON.stringify(joystick));
check('AC-11.2.1 releasing the joystick clears touchAxes (control returns to WASD)',
  joystick.axesAfterRelease === null, JSON.stringify(joystick));

// ---- AC-11.2.3: heavy button = hold-to-charge, through Input.press/release ----
await page.evaluate(() => {
  const g = window.__game;
  g.player.state = 'idle'; g.player.stateT = 0; g.player.attackType = null; g.player.phase = null;
  g.player.chargeT = 0; g.player.energy = 60;
});
const heavyBtn = await page.evaluate(async () => {
  const g = window.__game;
  const btn = document.querySelector('.touchctl .btn[data-a="heavy"]');
  const r = btn.getBoundingClientRect();
  window.__fireTouch(btn, 'touchstart', r.left + r.width / 2, r.top + r.height / 2, 6);
  const downAfterStart = !!g.input.down.heavy;
  g.step(1);
  const stateAfterConsume = g.player.state;
  for (let i = 0; i < 20; i++) g.step(1);
  const midCharge = g.player.state;
  window.__fireTouch(btn, 'touchend', r.left + r.width / 2, r.top + r.height / 2, 6);
  const downAfterEnd = !!g.input.down.heavy;
  g.step(1);
  const stateAfterRelease = g.player.state;
  return { downAfterStart, stateAfterConsume, midCharge, downAfterEnd, stateAfterRelease };
});
check('AC-11.2.3 touchstart on HEAVY presses it exactly like a keydown would',
  heavyBtn.downAfterStart, JSON.stringify(heavyBtn));
check('AC-11.2.3 holding HEAVY enters the SAME charge state the K key drives',
  heavyBtn.midCharge === 'charge', JSON.stringify(heavyBtn));
check('AC-11.2.3 releasing HEAVY releases it exactly like a keyup would',
  !heavyBtn.downAfterEnd && heavyBtn.stateAfterRelease !== 'charge', JSON.stringify(heavyBtn));

// ---- light attack via tap ----
await page.evaluate(() => {
  const g = window.__game;
  g.player.state = 'idle'; g.player.stateT = 0; g.player.attackType = null; g.player.phase = null;
});
const lightBtn = await page.evaluate(async () => {
  const g = window.__game;
  const btn = document.querySelector('.touchctl .btn[data-a="light"]');
  const r = btn.getBoundingClientRect();
  window.__fireTouch(btn, 'touchstart', r.left + r.width / 2, r.top + r.height / 2, 7);
  window.__fireTouch(btn, 'touchend', r.left + r.width / 2, r.top + r.height / 2, 7);
  for (let i = 0; i < 5; i++) g.step(1);
  return { state: g.player.state, type: g.player.attackType };
});
check('AC-11.2.3 tapping LIGHT throws a light attack', lightBtn.state === 'attack' && lightBtn.type === 'light1',
  JSON.stringify(lightBtn));

// ---- AC-11.2.2: dragging the look-zone orbits the camera ----
const look = await page.evaluate(() => {
  const g = window.__game;
  g.rig.yaw = 0;
  const zone = document.querySelector('.touchctl .lookzone');
  window.__fireTouch(zone, 'touchstart', 300, 400, 9);
  window.__fireTouch(zone, 'touchmove', 380, 400, 9);   // drag right
  const dx = g.input.mouseDX;
  window.__fireTouch(zone, 'touchend', 380, 400, 9);
  return { dx };
});
check('AC-11.2.2 dragging the look-zone feeds Input.mouseDX (the same channel mouselook uses)',
  Math.abs(look.dx) > 0, JSON.stringify(look));

// ---- AC-11.1.2: responsive HUD layout ----
const layout = await page.evaluate(() => {
  const me = document.querySelector('#hud .bars.me');
  const cs = getComputedStyle(me);
  return { top: cs.top, bottom: cs.bottom, width: cs.width };
});
check('AC-11.1.2 on mobile the player HP bar moves to the top (clear of the joystick)',
  layout.top !== 'auto' && parseFloat(layout.top) < 50, JSON.stringify(layout));

// ---- AC-11.3.1: mobile key-map content + reopen button ----
const km = await page.evaluate(() => {
  const g = window.__game;
  g.keymap.show();
  const text = document.getElementById('keymap').textContent;
  g.keymap.hide();
  return {
    mentionsStick: /stick/i.test(text),
    mentionsWASD: /W A S D/.test(text),
    helpBtnExists: !!document.querySelector('body > div[style*="border-radius: 50%"]'),
  };
});
check('AC-11.3.1 the key map shows touch instructions, not keyboard rows',
  km.mentionsStick && !km.mentionsWASD, JSON.stringify(km));

// the tutorial's OWN prompt text (core/states.js) also branches on mobile —
// a real gap caught while screenshotting the in-game layout: the flow
// module has its own device-specific strings, separate from the key map
const tutorialPrompt = await page.evaluate(() => {
  const g = window.__game;
  g.flow.enabled = true;
  g.flow.state = 'tutorial';
  g.flow.tutorial = { step: 0, moved: 0, blockHeld: 0 };
  g.flow._showTutorialPrompt();
  return document.querySelector('#prompts .sub')?.textContent ?? '';
});
check('AC-11.3.1 the tutorial\'s own MOVE prompt says "joystick", not "W A S D"',
  /joystick/i.test(tutorialPrompt) && !/W A S D/.test(tutorialPrompt), tutorialPrompt);

check('no console/page errors (mobile)', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p13-mobile.png' });
await browser.close();

// ================= desktop context: regression-proof it's inert =================

const desktop = await boot({ width: 1280, height: 800 });
const dtop = await desktop.page.evaluate(() => ({
  mobileFlag: window.__game.mobile,
  bodyClass: document.body.classList.contains('mobile'),
  touchControlsNull: window.__game.touchControls === null,
  touchDomAbsent: !document.querySelector('.touchctl'),
}));
check('AC-11.2.4 a desktop context gets NO mobile flag, NO body class, NO touch DOM at all',
  !dtop.mobileFlag && !dtop.bodyClass && dtop.touchControlsNull && dtop.touchDomAbsent,
  JSON.stringify(dtop));
const desktopKeymapText = await desktop.page.evaluate(() => {
  const g = window.__game;
  g.keymap.show();
  const text = document.getElementById('keymap').textContent;
  g.keymap.hide();
  return text;
});
check('AC-11.3.1 desktop key map is unchanged (keyboard rows, not touch rows)',
  /W A S D/.test(desktopKeymapText) && !/left joystick/i.test(desktopKeymapText),
  desktopKeymapText.slice(0, 80));
const desktopTutorialPrompt = await desktop.page.evaluate(() => {
  const g = window.__game;
  g.flow.enabled = true;
  g.flow.state = 'tutorial';
  g.flow.tutorial = { step: 0, moved: 0, blockHeld: 0 };
  g.flow._showTutorialPrompt();
  return document.querySelector('#prompts .sub')?.textContent ?? '';
});
check('AC-11.3.1 desktop tutorial prompt is unchanged ("W A S D")',
  desktopTutorialPrompt === 'W A S D', desktopTutorialPrompt);
check('no console/page errors (desktop)', desktop.errors.length === 0, desktop.errors.join(' | ').slice(0, 400));
await desktop.browser.close();

finish();
