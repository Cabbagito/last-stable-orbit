// Bot bay racing: the drawing, kept as plain JS so it stays the prototype's, line for line (the canvas
// LSO — Bot bay racing, https://claude.ai/artifact/5r9V3M158fam1CqMDdEKgn: botart.js, and race.js's drawing). The
// simulation it draws is sim.ts. Changes from the prototype: exports, the track's chalk is drawn here from sim.ts's
// track (chalkOf), and a bot's frames are made the first time it's drawn (framesOf) instead of in newRace.
/* eslint-disable */
// ---- the bots, drawn in pixels: a big side view for the prep screen, small ones for the race ----
const PAL = { w0: '#ffffff', w1: '#e6e8f0', w2: '#b9bccb', w3: '#8f93a6', dk: '#23242e', dk2: '#3a3d4a', ink: '#101018', eye: '#d9d2ff', red: '#ff4a5a', yel: '#ffd84a', cream: '#efe4c8', wood: '#8a6a4a' };
const SPOILERS = ['NONE', 'LIP', 'WING', 'TWIN WING', 'THE MOP'];
const STRIPES = ['NONE', 'SINGLE', 'TWIN', 'CHECKER', 'FLAMES'];
const WHEELS = ['STOCK', 'CHUNKY', 'SLICKS', 'SPIKED'];
const TOPPERS = ['BALL', 'FLAG', 'STAR', 'CHOPSTICKS'];
const FACES = ['HAPPY', 'MEAN', 'SLEEPY', 'WINK', 'RED DOT'];
const PAINTS = ['WHITE', 'CREAM', 'GUNMETAL', 'BLACK'];
const LIGHTS = ['NONE', 'UNDERGLOW', 'BEACON'];
const SHELL = [['#ffffff', '#e6e8f0', '#b9bccb', '#8f93a6'], ['#fff6dc', '#f0e2bc', '#cdbb90', '#a8966c'], ['#c0c6d8', '#8a90a4', '#666c80', '#4a4f60'], ['#6a6e80', '#3c3f4e', '#2a2c38', '#1c1d26']];
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function ell(c, cx, cy, rx, ry, col) {
  c.fillStyle = col;
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.3)))); c.fillRect(cx - w, cy + y, 2 * w + 1, 1); }
}
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = function (v) { return Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)); };
  return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
}
function digits(c, x, y, str, col) {
  for (let i = 0; i < str.length; i++) { const m = DIGITS[str[i]]; if (!m) continue; for (let k = 0; k < 15; k++) if (m[k] === '1') R(c, x + i * 4 + (k % 3), y + ((k / 3) | 0), 1, 1, col); }
}
// a 1px dark line round everything drawn so far
function outline(cv, col) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height, d = c.getImageData(0, 0, w, h), a = d.data, hit = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a[(y * w + x) * 4 + 3] > 0) continue;
    if ((x > 0 && a[(y * w + x - 1) * 4 + 3] > 0) || (x < w - 1 && a[(y * w + x + 1) * 4 + 3] > 0) || (y > 0 && a[((y - 1) * w + x) * 4 + 3] > 0) || (y < h - 1 && a[((y + 1) * w + x) * 4 + 3] > 0)) hit.push(x, y);
  }
  c.fillStyle = col || PAL.ink;
  for (let i = 0; i < hit.length; i += 2) c.fillRect(hit[i], hit[i + 1], 1, 1);
}

// The big one: 160 x 112, facing right. look = {spoiler, stripes, wheels, topper} as indexes, num = its cradle number.
function drawBig(cv, look, color, num, t, rev) {
  const tmp = drawBig.tmp || (drawBig.tmp = mk(160, 112)), c = tmp.getContext('2d');
  c.clearRect(0, 0, 160, 112);
  const bob = rev > 0 ? 0 : (Math.sin(t * 2.2) > 0.6 ? -1 : 0);
  const sx = rev > 0 ? Math.round(Math.sin(t * 55) * (rev > 0.6 ? 1.4 : 0.8)) : 0, sy = bob + (rev > 0.6 ? Math.round(Math.cos(t * 47) * 0.8) : 0);
  c.save(); c.translate(sx, sy);
  const CX = 80, CY = 76, RX = 50, RY = 38, sh = SHELL[look.paint || 0], face = look.face || 0, lights = look.lights || 0;
  const span = function (y) { const w = Math.round(RX * Math.sqrt(Math.max(0, 1 - ((y - CY) * (y - CY)) / (RY * RY)))); return [CX - w, CX + w]; };
  // the spoiler, behind the body
  const sp = look.spoiler;
  if (sp === 1) { R(c, 22, 70, 14, 4, PAL.dk2); R(c, 22, 70, 14, 1, PAL.w3); R(c, 19, 66, 5, 6, color); }
  if (sp === 2 || sp === 3) {
    R(c, 36, 50, 3, 24, PAL.dk2); R(c, 18, 46, 28, 5, PAL.dk); R(c, 18, 46, 28, 1, PAL.dk2); R(c, 15, 42, 4, 13, color);
    if (sp === 3) { R(c, 20, 58, 24, 4, PAL.dk); R(c, 20, 58, 24, 1, PAL.dk2); R(c, 15, 42, 4, 22, color); }
  }
  if (sp === 4) {
    for (let i = 0; i < 26; i++) R(c, 42 - i * 0.7, 72 - i * 1.3, 2, 2, PAL.wood);
    for (let k = 0; k < 9; k++) { const x = 12 + k * 2.6, len = 12 + ((k * 7) % 5); R(c, x, 34, 2, len, k % 2 ? PAL.cream : '#d8ccae'); R(c, x, 34 + len - 2, 2, 2, '#b9ad90'); }
    R(c, 11, 32, 25, 4, '#6c7080');
  }
  // the wheels
  const wh = look.wheels;
  [[50, 90], [112, 90]].forEach(function (p) {
    const x = p[0], y = p[1];
    if (wh === 1) { ell(c, x, y - 2, 12, 12, PAL.dk); for (let a = 0; a < 8; a++) R(c, x + Math.round(12 * Math.cos(a * 0.785)) - 1, y - 2 + Math.round(12 * Math.sin(a * 0.785)) - 1, 2, 2, PAL.dk2); ell(c, x, y - 2, 4, 4, PAL.w3); R(c, x, y - 2, 1, 1, PAL.dk); }
    else if (wh === 2) { ell(c, x, y + 1, 12, 8, PAL.dk); ell(c, x, y + 1, 5, 3, color); R(c, x - 8, y + 6, 17, 1, PAL.dk2); }
    else {
      ell(c, x, y, 9, 9, PAL.dk); ell(c, x, y, 3, 3, PAL.w3);
      if (wh === 3) for (let a = 0; a < 8; a++) R(c, x + Math.round(11 * Math.cos(a * 0.785 + 0.39)), y + Math.round(11 * Math.sin(a * 0.785 + 0.39)), 2, 2, '#c9ccd8');
    }
  });
  // the dome
  for (let y = CY - RY; y <= CY; y++) {
    const s = span(y), w = s[1] - s[0] + 1;
    R(c, s[0], y, w, 1, sh[1]);
    R(c, s[1] - Math.round(w * 0.16), y, Math.round(w * 0.16) + 1, 1, sh[2]);
    R(c, s[1] - Math.round(w * 0.05), y, Math.round(w * 0.05) + 1, 1, sh[3]);
  }
  ell(c, 58, 50, 10, 3, sh[0]); R(c, 46, 56, 3, 2, sh[0]);
  // the stripes
  const st = look.stripes, band = function (y0, y1, fn) { for (let y = y0; y <= y1; y++) { const s = span(y); fn(s[0] + 1, s[1] - 1, y); } };
  if (st === 1) band(67, 71, function (a, b, y) { R(c, a, y, b - a + 1, 1, color); });
  if (st === 2) { band(63, 65, function (a, b, y) { R(c, a, y, b - a + 1, 1, color); }); band(69, 71, function (a, b, y) { R(c, a, y, b - a + 1, 1, color); }); }
  if (st === 3) band(64, 71, function (a, b, y) { for (let x = a; x <= b; x++) R(c, x, y, 1, 1, (((x >> 2) + ((y - 64) >> 2)) & 1) ? color : PAL.dk); });
  if (st === 4) band(52, 74, function (a, b, y) {
    const len = Math.round(26 + 16 * Math.sin((y - 52) * 0.95) + 8 * Math.sin((y - 52) * 2.3));
    const x0 = Math.max(a, b - len); R(c, x0, y, b - x0 + 1, 1, color); R(c, x0, y, Math.min(5, b - x0 + 1), 1, lighten(color, 0.55));
  });
  // skirt and bumper
  R(c, 31, CY + 1, 99, 7, PAL.dk2); R(c, 33, CY + 8, 95, 2, PAL.dk); R(c, 31, CY + 1, 99, 1, PAL.w3); R(c, 127, 72, 6, 9, PAL.w3); R(c, 127, 72, 6, 2, PAL.w1);
  // the plate
  R(c, 50, 55, 17, 11, PAL.ink); R(c, 51, 56, 15, 9, PAL.w0);
  digits(c, 59 - num.length * 2, 58, num, PAL.ink);
  // the visor and the face
  R(c, 98, 51, 24, 17, PAL.ink); R(c, 96, 53, 28, 13, PAL.ink); R(c, 98, 52, 22, 1, '#2c2c40');
  const E = PAL.eye;
  if (face === 0) { R(c, 103, 57, 3, 5, E); R(c, 113, 57, 3, 5, E); R(c, 106, 64, 6, 1, E); R(c, 105, 63, 1, 1, E); R(c, 112, 63, 1, 1, E); }
  if (face === 1) { R(c, 103, 59, 3, 3, E); R(c, 113, 59, 3, 3, E); for (let i = 0; i < 5; i++) { R(c, 101 + i, 55 + (i >> 1), 2, 1, E); R(c, 116 - i, 55 + (i >> 1), 2, 1, E); } R(c, 106, 65, 7, 1, E); }
  if (face === 2) { R(c, 102, 60, 5, 1, E); R(c, 112, 60, 5, 1, E); R(c, 108, 64, 3, 1, E); }
  if (face === 3) { R(c, 103, 57, 3, 5, E); R(c, 112, 59, 5, 1, E); R(c, 106, 64, 6, 1, E); R(c, 105, 63, 1, 1, E); R(c, 112, 63, 1, 1, E); }
  if (face === 4) { ell(c, 110, 59, 4, 4, '#7a1420'); ell(c, 110, 59, 3, 3, '#ff3b4a'); R(c, 109, 57, 1, 1, '#ffc0c8'); }
  if (lights === 2) { R(c, 54, 37, 11, 2, PAL.dk); R(c, 56, 32, 7, 5, Math.floor(t * 4) % 2 ? '#ff3b4a' : '#4f8cff'); R(c, 57, 33, 2, 1, '#ffffff'); }
  // the antenna and what's on it
  const tp = look.topper;
  if (tp === 3) { for (let i = 0; i < 26; i++) { R(c, 72 - i * 0.25, 38 - i, 1, 1, PAL.cream); R(c, 80 + i * 0.2, 38 - i, 1, 1, PAL.cream); } }
  else {
    const top = tp === 1 ? 12 : 20;
    R(c, 76, top, 1, 38 - top, PAL.w3);
    if (tp === 0) { ell(c, 76, 18, 3, 3, PAL.red); R(c, 75, 16, 1, 1, '#ffb0b8'); }
    if (tp === 1) for (let y = 0; y < 9; y++) { const w = Math.round(13 - Math.abs(y - 4) * 3), wob = Math.round(Math.sin(t * 6 + y * 0.6)); if (w > 0) R(c, 76 - w + (w > 6 ? wob : 0), 12 + y, w, 1, y < 4 ? color : lighten(color, -0.25)); }
    if (tp === 2) { R(c, 73, 16, 7, 3, PAL.yel); R(c, 75, 13, 3, 9, PAL.yel); R(c, 74, 15, 5, 5, PAL.yel); R(c, 76, 16, 1, 1, '#fff6c8'); }
  }
  c.restore();
  outline(tmp);
  const m = cv.getContext('2d');
  m.clearRect(0, 0, 160, 112);
  R(m, 0, 0, 160, 96, '#161a26'); R(m, 0, 96, 160, 16, '#2b3040'); R(m, 0, 95, 160, 1, '#3d4152'); R(m, 0, 7, 160, 2, '#f0c060'); R(m, 0, 9, 160, 1, '#6a5a3a');   // the bay wall, its light strip, the floor
  ell(m, 80, 103, 66, 5, '#2a2c36'); ell(m, 80, 102, 64, 4, '#c9ccd8'); ell(m, 80, 102, 56, 3, '#e6e8f0');   // its cradle pad
  ell(m, 80 + sx, 101, 50, 2, '#8f93a6');
  if (lights === 1) { ell(m, 80 + sx, 100, 58, 5, rgba(color, 0.35)); ell(m, 80 + sx, 100, 48, 3, rgba(color, 0.8)); }
  if (rev > 0) for (let k = 0; k < 3; k++) { const a = (t * 3 + k * 0.33) % 1, r = Math.round(2 + a * 5 * (0.5 + rev)); ell(m, Math.round(20 - a * 18), Math.round(84 - a * 14 - k * 2), r, r, a < 0.5 ? '#6c7080' : '#3a3d4a'); }
  m.drawImage(tmp, 0, 0);
}

// The small ones: 24 x 26 each, seen from the map's angle. Facings: dl, dr (toward the camera), ul, ur (away), plus flip.
function racerFrame(look, color, facing) {
  const cv = mk(24, 26), c = cv.getContext('2d');
  const toward = facing[0] === 'd', left = facing[1] === 'l', flip = facing === 'flip', sh = SHELL[look.paint || 0], face = look.face || 0;
  if (flip) {
    R(c, 6, 9, 4, 3, PAL.dk); R(c, 14, 9, 4, 3, PAL.dk);
    R(c, 5, 12, 14, 3, PAL.dk2); ell(c, 12, 18, 7, 4, sh[1]); R(c, 5, 15, 15, 3, sh[1]); R(c, 14, 16, 5, 4, sh[2]); R(c, 6, 17, 13, 1, color);
    outline(cv); return cv;
  }
  const wide = look.wheels === 1 || look.wheels === 2;
  // spoiler on the far side when it comes at us
  const spx = (toward ? !left : left) ? 3 : 12, sp = look.spoiler;
  const spoiler = function (y) {
    if (!sp) return;
    if (sp === 4) { R(c, spx + 1, y - 2, 7, 4, PAL.cream); R(c, spx + 2, y + 2, 1, 2, PAL.cream); R(c, spx + 5, y + 2, 1, 2, PAL.cream); return; }
    R(c, spx, y, 9, 2, PAL.dk); R(c, spx, y - 1, 2, 4, color); R(c, spx + 7, y - 1, 2, 4, color);
    if (sp === 3) R(c, spx + 1, y - 3, 7, 1, PAL.dk);
    if (sp === 1) R(c, spx + 2, y, 5, 1, PAL.dk2);
  };
  if (toward) spoiler(9);
  R(c, 5, 21, wide ? 4 : 3, 3, PAL.dk); R(c, wide ? 15 : 16, 21, wide ? 4 : 3, 3, PAL.dk);
  if (look.wheels === 3) { R(c, 4, 22, 1, 1, '#c9ccd8'); R(c, 19, 22, 1, 1, '#c9ccd8'); }
  R(c, 5, 18, 14, 4, PAL.dk2);
  ell(c, 12, 14, 7, 6, sh[1]); R(c, 5, 14, 15, 5, sh[1]);
  R(c, 16, 12, 3, 7, sh[2]); R(c, 18, 14, 2, 5, sh[3]); R(c, 8, 9, 3, 1, sh[0]);
  const st = look.stripes;
  if (st === 1) R(c, 5, 16, 15, 2, color);
  if (st === 2) { R(c, 5, 15, 15, 1, color); R(c, 5, 17, 15, 1, color); }
  if (st === 3) for (let x = 5; x < 20; x++) for (let y = 15; y < 19; y++) R(c, x, y, 1, 1, (((x >> 1) + (y >> 1)) & 1) ? color : PAL.dk);
  if (st === 4) { R(c, 5, 16, 15, 3, color); for (let x = 6; x < 19; x += 3) R(c, x, 14 + (x % 2), 2, 2, color); }
  if (st === 0) R(c, 5, 18, 15, 1, color);   // everyone carries their colour somewhere
  if (toward) {
    const vx = left ? 5 : 11;
    R(c, vx, 10, 8, 5, PAL.ink);
    if (face === 4) R(c, vx + 3, 11, 2, 2, '#ff3b4a');
    else if (face === 2) { R(c, vx + 1, 12, 2, 1, PAL.eye); R(c, vx + 5, 12, 2, 1, PAL.eye); }
    else if (face === 1) { R(c, vx + 1, 12, 2, 2, PAL.eye); R(c, vx + 5, 12, 2, 2, PAL.eye); R(c, vx + 1, 11, 1, 1, PAL.eye); R(c, vx + 6, 11, 1, 1, PAL.eye); }
    else if (face === 3) { R(c, vx + 1, 11, 2, 2, PAL.eye); R(c, vx + 5, 12, 2, 1, PAL.eye); }
    else { R(c, vx + 1, 11, 2, 2, PAL.eye); R(c, vx + 5, 11, 2, 2, PAL.eye); }
  } else spoiler(11);
  const tp = look.topper;
  if (tp === 3) { for (let i = 0; i < 6; i++) { R(c, 11 - (i > 2 ? 1 : 0), 7 - i, 1, 1, PAL.cream); R(c, 13 + (i > 2 ? 1 : 0), 7 - i, 1, 1, PAL.cream); } }
  else {
    R(c, 12, 2, 1, 6, PAL.w3);
    if (tp === 0) R(c, 11, 1, 3, 3, PAL.red);
    if (tp === 1) { R(c, left ? 13 : 8, 1, 4, 2, color); R(c, left ? 13 : 10, 3, 2, 1, color); }
    if (tp === 2) { R(c, 11, 1, 3, 3, PAL.yel); R(c, 12, 0, 1, 5, PAL.yel); R(c, 10, 2, 5, 1, PAL.yel); }
  }
  outline(cv);
  return cv;
}
// CSAT-1, the champion: a survey droid on one wheel. patched = the crew broke him earlier and somebody taped him up.
function csatFrame(patched, facing) {
  const cv = mk(24, 26), c = cv.getContext('2d');
  const toward = facing[0] === 'd', left = facing[1] === 'l';
  if (facing === 'flip') { R(c, 10, 8, 4, 4, PAL.dk); ell(c, 12, 18, 6, 6, '#e9dfc4'); R(c, 8, 20, 9, 1, '#b8a888'); outline(cv); return cv; }
  R(c, 10, 21, 5, 4, PAL.dk); R(c, 11, 22, 3, 2, PAL.w3);
  R(c, 11, 18, 3, 3, PAL.dk2);
  ell(c, 12, 11, 6, 8, '#e9dfc4'); R(c, 15, 6, 3, 11, '#cfc3a4'); R(c, 8, 4, 3, 1, '#fff9e6');
  if (toward) { const fx = left ? 6 : 9; R(c, fx, 7, 9, 7, '#f4ecd4'); R(c, fx, 7, 9, 1, '#b8a888'); R(c, fx + 2, 9, 1, 2, PAL.ink); R(c, fx + 6, 9, 1, 2, PAL.ink); R(c, fx + 3, 12, 3, 1, PAL.ink); }
  R(c, 9, 15, 1, 1, '#8a5a3a'); R(c, 15, 9, 1, 1, '#8a5a3a'); R(c, 13, 17, 1, 1, '#5a3a2a');   // the cigar burns
  R(c, left ? 18 : 4, 10, 2, 1, PAL.w3); R(c, left ? 19 : 4, 7, 1, 3, PAL.w3);                    // one arm, waving
  if (patched) { for (let i = 0; i < 9; i++) { R(c, 7 + i, 16 - i, 2, 2, '#aeb2bd'); } R(c, 7, 13, 11, 2, '#aeb2bd'); R(c, 9, 13, 1, 2, '#8f93a6'); R(c, 14, 13, 1, 2, '#8f93a6'); }
  R(c, 12, 0, 1, 3, PAL.w3); R(c, 11, 0, 3, 1, PAL.red);
  outline(cv);
  return cv;
}
function racerSet(bot) {
  const f = {};
  ['dl', 'dr', 'ul', 'ur', 'flip'].forEach(function (k) { f[k] = bot.csat ? csatFrame(bot.patched, k) : racerFrame(bot.look, bot.color, k); });
  return f;
}

// ---- the race, drawn: a lap round the dispatch desk in the Bot bays, on a slice of the map art shown at 2x ----
const VW = 800, VH = 450, OX = 150, OY = 215;
function wp(X, Y) { return [(X - Y) * 30 + 460 - OX, (X + Y) * 15 + 150 - OY]; }
const CROWD = [[11.6, 9.6, 0], [12.3, 10.3, 1], [12.9, 9.5, 2], [13.5, 10.4, 3], [14.1, 9.7, 4], [13.2, 10.9, 5], [11.9, 10.8, 6],
  [7.2, 5.4, 2], [7.9, 5.2, 0], [8.6, 5.5, 5], [9.3, 5.2, 3], [10.0, 5.5, 1], [5.5, 7.4, 4], [5.3, 8.1, 6], [16.2, 9.8, 1], [16.6, 10.5, 3], [16.3, 11.3, 0], [5.6, 10.6, 2], [5.4, 11.4, 5]];
const SHIRTS = ['#7a6cc0', '#c05a6a', '#4f8a8a', '#b8894a', '#5a78b8', '#8a8f9c', '#a05a9a'];
const SKINS = ['#e8b890', '#c68a5c', '#f0c8a8', '#9a6a48'];

// the chalk: dotted edges and the line, drawn once per track
function chalkOf(tr) {
  if (tr.chalk) return tr.chalk;
  const L = tr.L, at = tr.at;
  const chalk = mk(VW, VH), c = chalk.getContext('2d');
  for (let s = 0; s < L; s += 0.09) {
    [-0.62, 0.62].forEach(function (off) { const q = at(s, off), xy = wp(q.X, q.Y); if (Math.round(s / 0.09) % 3 !== 2) R(c, xy[0], xy[1], 1, 1, 'rgba(236,238,246,0.42)'); });
  }
  for (let k = 0; k < 12; k++) { const q = at(0, -0.6 + k * 0.1), q2 = at(0.12, -0.6 + k * 0.1), a = wp(q.X, q.Y), b = wp(q2.X, q2.Y); R(c, a[0], a[1], 2, 1, k % 2 ? '#ecEEf6' : '#15161c'); R(c, b[0], b[1], 2, 1, k % 2 ? '#15161c' : '#ecEEf6'); }
  tr.chalk = chalk;
  return chalk;
}
function framesOf(b) { return b.frames || (b.frames = racerSet(b)); }

function figure(c, x, y, k, up, kind) {
  x = Math.round(x); y = Math.round(y);
  const skin = SKINS[k % SKINS.length], shirt = kind === 'guard' ? '#28345a' : SHIRTS[k % SHIRTS.length];
  R(c, x - 4, y - 12, 8, 9, PAL.ink); R(c, x - 3, y - 17, 6, 6, PAL.ink); R(c, x - 3, y - 4, 6, 5, PAL.ink);
  R(c, x - 3, y - 11, 6, 7, shirt); R(c, x - 2, y - 16, 4, 4, skin); R(c, x - 2, y - 4, 2, 4, '#2a2c38'); R(c, x, y - 4, 2, 4, '#3a3d4a');
  if (kind === 'guard') { R(c, x - 3, y - 17, 6, 2, '#1a2242'); R(c, x + 2, y - 9, 2, 1, PAL.yel); }
  if (kind === 'caller') { R(c, x + 3, y - 15, 4, 3, PAL.yel); R(c, x + 6, y - 16, 1, 5, PAL.yel); R(c, x + 2, y - 12, 2, 2, skin); }
  if (up) { R(c, x - 5, y - 15, 1, 4, skin); R(c, x + 4, y - 15, 1, 4, skin); }
  else { R(c, x - 4, y - 10, 1, 4, shirt); R(c, x + 3, y - 10, 1, 4, shirt); }
}

// cv: the 800 x 450 pixel layer over the map. ui: a 1600 x 900 layer for the names. time: seconds, for the wobble.
function drawRace(cv, ui, r, time) {
  const c = cv.getContext('2d'), u = ui.getContext('2d'), tr = r.track;
  c.clearRect(0, 0, VW, VH); u.clearRect(0, 0, VW * 2, VH * 2);
  c.drawImage(chalkOf(tr), 0, 0);
  r.puddles.forEach(function (pd) { const q = tr.at(pd.p, pd.lane), xy = wp(q.X, q.Y); ell(c, Math.round(xy[0]), Math.round(xy[1]), 7, 3, 'rgba(150,96,50,0.75)'); ell(c, Math.round(xy[0]) - 1, Math.round(xy[1]), 4, 1, 'rgba(214,160,90,0.8)'); });
  r.hazards.forEach(function (h) { if (!h.live) return; const q = tr.at(h.s, h.lane), xy = wp(q.X, q.Y), x = Math.round(xy[0]), y = Math.round(xy[1]); R(c, x - 3, y - 3, 6, 4, PAL.ink); R(c, x - 2, y - 2, 4, 2, '#4fae6a'); R(c, x + 2, y - 2, 2, 1, '#8fe0a0'); });
  const frozen = !!r.guard, things = [];
  const hype = r.t > 0 && !frozen;
  CROWD.forEach(function (f, i) { things.push({ d: f[0] + f[1], draw: function () { const xy = wp(f[0], f[1]), up = hype && Math.sin(time * 5 + i * 1.9) > 0.55; figure(c, xy[0], xy[1] - (up ? 1 : 0), f[2] + i, up); } }); });
  things.push({ d: 9 + 9.4 + 0.01, draw: function () { const xy = wp(9.0, 9.2); figure(c, xy[0], xy[1] - 21 - (hype && Math.sin(time * 7) > 0 ? 1 : 0), 1, false, 'caller'); } });
  if (r.guard) { const k = 1 - r.guard.t / r.guard.dur, X = 10.7 + 1.9 * Math.sin(k * Math.PI); things.push({ d: X + 0.7, draw: function () { const xy = wp(X, 0.7); figure(c, xy[0], xy[1], 3, false, 'guard'); } }); }
  if (r.cleaner) {
    const k = r.cleaner.t / r.cleaner.dur, q = tr.at(r.cleaner.p, 1.1 - 2.2 * Math.sin(k * Math.PI));
    if (!r.cleanerFrames) r.cleanerFrames = racerSet({ look: { spoiler: 4, stripes: 0, wheels: 0, topper: 0 }, color: '#c9ccd8' });
    things.push({ d: q.X + q.Y, draw: function () { const xy = wp(q.X, q.Y); c.drawImage(r.cleanerFrames[k < 0.5 ? 'ul' : 'dr'], Math.round(xy[0]) - 12, Math.round(xy[1]) - 24); } });
  }
  r.bots.forEach(function (b, i) {
    const q = tr.at(b.s, b.lane), xy = wp(q.X, q.Y);
    things.push({ d: q.X + q.Y, draw: function () {
      let x = Math.round(xy[0]), y = Math.round(xy[1]);
      const sx = q.tx - q.ty, sy = q.tx + q.ty;
      let face = (sy >= 0 ? 'd' : 'u') + (sx < 0 ? 'l' : 'r');
      if (b.st === 'spin') face = ['dl', 'ul', 'ur', 'dr'][Math.floor(time * 11) % 4];
      if (b.st === 'flip') face = 'flip';
      if (frozen) { face = 'dl'; x += Math.round(Math.sin(time * 9 + i) * 1.5); }      // "cleaning"
      if (r.t < 0 && b.launch !== 0) x += Math.round(Math.sin(time * 50 + i) * 0.7);
      if (b.patched && Math.sin(time * 13) > 0.3) x += 1;
      ell(c, x, y - 1, 9, 3, 'rgba(8,8,16,0.5)');
      if (b.look && b.look.lights === 1) { ell(c, x, y - 1, 11, 4, rgba(b.color, 0.45)); ell(c, x, y - 1, 7, 2, rgba(b.color, 0.9)); }
      if (b.boost > 0) for (let k = 1; k <= 4; k++) { const z = tr.at(b.s - k * 0.22, b.lane), zz = wp(z.X, z.Y); R(c, zz[0] - 1, zz[1] - 8 - (k % 2) * 3, 2, 2, k % 2 ? PAL.yel : '#8ef6ff'); }
      if (b.slip) { const z = tr.at(b.s - 0.3, b.lane), zz = wp(z.X, z.Y); R(c, zz[0], zz[1] - 10, 3, 1, 'rgba(255,255,255,0.5)'); R(c, zz[0], zz[1] - 6, 3, 1, 'rgba(255,255,255,0.5)'); }
      c.drawImage(framesOf(b)[face], x - 12, y - 24);
      if (b.look && b.look.lights === 2 && face !== 'flip') R(c, x - 6, y - 19, 3, 2, Math.floor(time * 4) % 2 ? '#ff3b4a' : '#4f8cff');
      if (b.heatT > 0 || b.st === 'stall') for (let k = 0; k < 3; k++) { const a = (time * 1.4 + k * 0.33) % 1, rr = Math.round(1 + a * 3); ell(c, x - 2 + k * 2, Math.round(y - 22 - a * 14), rr, rr, a < 0.5 ? 'rgba(90,92,104,0.9)' : 'rgba(60,62,74,0.7)'); }
      if (frozen) { R(c, x + 9, y - 8 + Math.round(Math.sin(time * 9 + i) * 2), 1, 7, PAL.wood); R(c, x + 7, y - 2, 5, 2, PAL.cream); }
      if (b.st === 'survey') { R(c, x + 10, y - 20, 7, 9, PAL.ink); R(c, x + 11, y - 19, 5, 7, '#f4ecd4'); R(c, x + 12, y - 17, 3, 1, PAL.ink); R(c, x + 12, y - 15, 3, 1, PAL.ink); }
      // its name, on the sharp layer
      u.font = "22px VT323, 'Courier New', monospace"; u.textAlign = 'center';
      u.lineWidth = 4; u.strokeStyle = '#05050a'; const ly = (y - 30 - (i % 2) * 8) * 2; u.strokeText(b.name, x * 2, ly); u.fillStyle = b.color; u.fillText(b.name, x * 2, ly);
    } });
  });
  things.sort(function (a, b) { return a.d - b.d; }).forEach(function (th) { th.draw(); });
  r.pops = r.pops.filter(function (p) { return r.t - p.t < 1.3; });
  r.pops.forEach(function (p) {
    const q = tr.at(p.b.s, p.b.lane), xy = wp(q.X, q.Y), a = (r.t - p.t) / 1.3;
    u.font = "30px VT323, 'Courier New', monospace"; u.textAlign = 'center'; u.globalAlpha = 1 - a * a;
    u.lineWidth = 5; u.strokeStyle = '#05050a'; u.strokeText(p.word, xy[0] * 2, (xy[1] - 42 - a * 12) * 2); u.fillStyle = '#ffffff'; u.fillText(p.word, xy[0] * 2, (xy[1] - 42 - a * 12) * 2);
    u.globalAlpha = 1;
  });
  if (frozen) { c.fillStyle = 'rgba(4,6,20,0.38)'; c.fillRect(0, 0, VW, VH); }
}

export { PAL, SPOILERS, STRIPES, WHEELS, TOPPERS, FACES, PAINTS, LIGHTS, VW, VH, OX, OY, wp, drawBig, racerSet, drawRace };
