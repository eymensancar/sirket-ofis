// Şirket ofisi: piksel sahne + patron paneli.
(() => {
  'use strict';
  const Core = window.SirketCore;
  const W = 320;
  const H = 200;

  const $ = (id) => document.getElementById(id);
  const canvas = $('scene');
  const ctx = canvas.getContext('2d');
  const portraitCtx = $('portrait').getContext('2d');
  const overlay = $('overlay');

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };

  // ───────────── Renk paleti ─────────────
  const C = {
    wall: '#eadcbf', wallStripe: '#e0d0ae', wallTop: '#4f3d30', base: '#6b4a2f', baseDark: '#3d2a1a',
    plank: ['#b8865b', '#ab7a51', '#a07049'], seam: '#7a5235',
    rug: '#8c3f4f', rugIn: '#9e4a5b', rugBorder: '#d1a95e',
    deskTop: '#c88f55', deskHi: '#ddaa70', deskFront: '#a8703f', deskEdge: '#7f532e', leg: '#5c3a1f',
    chair: '#343850', chairHi: '#4b5072',
    skin: '#f4c7a1', skinShade: '#dba07c', hair: '#4a2f25', hair2: '#2b2b33', eye: '#2a1e1a',
    shirt: '#d97757', shirtShade: '#b65d40', shirtHi: '#e8987c',
    metal: '#c9ccd4', metalHi: '#e7e9ef', metalDark: '#8e939f',
    leaf: '#4f9a4a', leafHi: '#72bf5c', pot: '#b5603c',
    accent: '#d97757',
  };

  const DESKS = [
    { x: 70, y: 104, w: 64, hair: C.hair, label: 'CLAUDE' },
    { x: 186, y: 104, w: 64, hair: C.hair2, label: 'CLAUDE #2' },
  ];
  DESKS.forEach((d) => (d.cx = d.x + d.w / 2));

  let G = ctx;
  function R(x, y, w, h, c) {
    G.fillStyle = c;
    G.fillRect(Math.round(x), Math.round(y), w, h);
  }
  function glyph(rows, x, y, c, s = 1) {
    for (let j = 0; j < rows.length; j++)
      for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === '#') R(x + i * s, y + j * s, s, s, c);
  }
  const GLYPH = {
    z: ['#####', '...#.', '..#..', '.#...', '#####'],
    heart: ['.#.#.', '#####', '.###.', '..#..'],
    bang: ['#', '#', '#', '.', '#'],
  };

  // ───────────── Durum ─────────────
  let snap = null;
  let state = null;
  let lastGestureT = null;
  let deskProps = {};
  const fx = DESKS.map(() => ({ reaction: null, cheerUntil: 0, sadUntil: 0, nextCode: 0, nextZ: 0, nextHeart: 0 }));
  let particles = [];
  let talk = null; // tıklama ile söylenen söz

  // ───────────── Arka plan (önbellekli) ─────────────
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  let bgHour = -1;

  function skyFor(hour) {
    if (hour < 6 || hour >= 21) return ['#0d1330', '#1c2350', 'night'];
    if (hour < 8) return ['#f4a76b', '#f7d08a', 'dawn'];
    if (hour < 18) return ['#5fb8f5', '#a9e1ff', 'day'];
    return ['#e0735a', '#5a4a8a', 'dusk'];
  }

  function drawWindow(x, y, hour) {
    const w = 36;
    const h = 24;
    const [top, bottom, kind] = skyFor(hour);
    R(x - 2, y - 2, w + 4, h + 4, '#7a5537');
    R(x, y, w, h / 2, top);
    R(x, y + h / 2, w, h / 2, bottom);
    if (kind === 'night') {
      [[4, 3], [12, 8], [27, 4], [31, 15], [7, 17], [20, 13]].forEach(([a, b]) => R(x + a, y + b, 1, 1, '#fff'));
      R(x + 24, y + 3, 5, 5, '#f4f0c8');
      R(x + 26, y + 3, 3, 3, top);
    } else if (kind === 'day') {
      R(x + 5, y + 4, 6, 6, '#ffe680');
      R(x + 18, y + 14, 10, 3, '#fff');
      R(x + 20, y + 12, 6, 2, '#fff');
    } else {
      R(x + 14, y + 12, 8, 4, kind === 'dawn' ? '#ffd27a' : '#ffb36b');
    }
    // şehir silueti
    R(x, y + h - 5, 6, 5, '#3b3f5a');
    R(x + 7, y + h - 8, 5, 8, '#454a68');
    R(x + 24, y + h - 6, 7, 6, '#3b3f5a');
    R(x + w / 2 - 1, y, 2, h, '#7a5537');
    R(x, y + h / 2 - 1, w, 2, '#7a5537');
    R(x - 3, y + h + 2, w + 6, 2, '#f0dcb4');
  }

  function drawPlant(x, y, big) {
    const s = big ? 1.5 : 1;
    R(x + 2 * s, y + 10 * s, 8 * s, 7 * s, C.pot);
    R(x + 2 * s, y + 10 * s, 8 * s, 1, '#d47a52');
    R(x, y + 2 * s, 12 * s, 8 * s, C.leaf);
    R(x + 2 * s, y, 8 * s, 4 * s, C.leaf);
    R(x + 3 * s, y + 1, 2, 2, C.leafHi);
    R(x + 8 * s, y + 4 * s, 2, 2, C.leafHi);
    R(x + 1, y + 6 * s, 2, 2, C.leafHi);
  }

  function drawBackground(hour) {
    G = bg.getContext('2d');
    // zemin
    for (let row = 0, y = 44; y < H; y += 8, row++) {
      R(0, y, W, 8, C.plank[row % 3]);
      R(0, y + 7, W, 1, C.seam);
      for (let x = (row * 19) % 40; x < W; x += 40) R(x, y, 1, 7, C.seam);
    }
    // duvar
    R(0, 0, W, 44, C.wall);
    for (let x = 4; x < W; x += 10) R(x, 4, 2, 36, C.wallStripe);
    R(0, 0, W, 4, C.wallTop);
    R(0, 40, W, 4, C.base);
    R(0, 44, W, 2, 'rgba(0,0,0,0.18)');

    drawWindow(8, 10, hour);
    drawWindow(240, 10, hour);

    // kitaplık
    R(54, 6, 28, 46, '#6e4a2c');
    R(56, 8, 24, 42, '#4a3020');
    const books = ['#d97757', '#5b8fd9', '#7bc96f', '#f2c14e', '#b86ad9', '#e5645c'];
    [10, 22, 34].forEach((sy, r) => {
      R(56, sy + 9, 24, 2, '#6e4a2c');
      for (let i = 0, bx = 57; bx < 77; i++) {
        const bw = 2 + ((i + r) % 2);
        const bh = 6 + ((i * 3 + r) % 3);
        R(bx, sy + 9 - bh, bw, bh, books[(i + r * 2) % books.length]);
        bx += bw + 1;
      }
    });
    R(54, 50, 28, 3, 'rgba(0,0,0,0.25)');

    // poster
    R(112, 12, 20, 22, '#3a3f5c');
    R(114, 14, 16, 18, '#f7efe0');
    R(118, 18, 8, 8, C.accent);
    R(121, 16, 2, 12, C.accent);
    R(116, 21, 12, 2, C.accent);

    // tabela + kapı
    R(138, 3, 44, 9, '#2c3048');
    R(139, 4, 42, 7, '#3a3f5c');
    R(146, 14, 28, 30, '#6b4a2f');
    R(148, 16, 24, 28, '#8a5f3b');
    R(150, 18, 9, 11, '#7a5233');
    R(161, 18, 9, 11, '#7a5233');
    R(150, 31, 9, 11, '#7a5233');
    R(161, 31, 9, 11, '#7a5233');
    R(168, 30, 2, 2, '#f2c14e');
    R(144, 44, 32, 4, '#5a6b8c'); // paspas

    // beyaz tahta
    R(188, 10, 44, 26, '#8e939f');
    R(190, 12, 40, 22, '#fbfbf7');
    R(190, 35, 40, 2, '#8e939f');
    R(193, 35, 4, 1, '#e5645c');
    R(199, 35, 4, 1, '#5b8fd9');

    // mutfak tezgahı + kahve makinesi
    R(284, 46, 34, 6, '#9ca2ad');
    R(284, 52, 34, 12, '#717784');
    R(284, 52, 34, 1, '#5a5f6b');
    R(290, 32, 13, 14, '#2f2f36');
    R(292, 34, 9, 4, '#4a4a55');
    R(299, 35, 2, 2, '#7bc96f');
    R(294, 42, 5, 4, '#fff');
    R(306, 40, 8, 6, '#e8e8f0'); // tost makinesi :)
    R(307, 39, 6, 1, '#c0c4cc');

    // su sebili
    R(302, 72, 12, 10, 'rgba(143,211,255,0.85)');
    R(304, 70, 8, 2, '#5aa9e6');
    R(300, 82, 16, 22, '#e8e8f0');
    R(300, 82, 16, 1, '#fff');
    R(305, 88, 6, 2, '#5aa9e6');
    R(300, 104, 16, 2, 'rgba(0,0,0,0.2)');

    // halı
    R(48, 78, 224, 64, C.rugBorder);
    R(51, 81, 218, 58, C.rug);
    R(55, 85, 210, 50, C.rugIn);
    for (let x = 59; x < 262; x += 8) R(x, 87, 2, 2, C.rug);

    // kanepe + sehpa (patronun köşesi)
    R(10, 160, 56, 8, '#4f5e93');
    R(10, 168, 56, 14, '#6475b0');
    R(8, 162, 6, 22, '#4f5e93');
    R(62, 162, 6, 22, '#4f5e93');
    R(16, 170, 20, 6, '#7486c4');
    R(40, 170, 20, 6, '#7486c4');
    R(10, 184, 56, 2, 'rgba(0,0,0,0.25)');
    R(80, 170, 24, 10, '#7f532e');
    R(80, 170, 24, 2, '#a8703f');
    R(84, 168, 6, 3, '#f7efe0'); // dergi

    drawPlant(4, 48, true);
    drawPlant(296, 170, true);
    drawPlant(180, 46, false);
    drawPlant(120, 174, false);
    G = ctx;
  }

  // ───────────── Karakter ─────────────
  function drawHead(cx, top, o) {
    const hair = o.hair || C.hair;
    R(cx - 6, top - 2, 12, 4, hair);
    R(cx - 5, top, 10, 10, C.skin);
    R(cx - 5, top + 9, 10, 1, C.skinShade);
    R(cx - 6, top + 1, 1, 5, hair);
    R(cx + 5, top + 1, 1, 4, hair);
    R(cx - 5, top + 2, 4, 1, hair);
    R(cx + 1, top + 2, 2, 1, hair);

    const ey = top + 4;
    if (o.closed) {
      R(cx - 3, ey + 1, 2, 1, C.eye);
      R(cx + 1, ey + 1, 2, 1, C.eye);
    } else if (o.blink) {
      R(cx - 3, ey + 1, 2, 1, C.eye);
      R(cx + 1, ey + 1, 2, 1, C.eye);
    } else {
      R(cx - 3, ey, 2, 2, C.eye);
      R(cx + 1, ey, 2, 2, C.eye);
      R(cx - 3, ey, 1, 1, '#fff');
      R(cx + 1, ey, 1, 1, '#fff');
    }

    const my = top + 7;
    const m = o.mood;
    if (o.openMouth) {
      R(cx - 1, my, 2, 2, '#7a2e2e');
    } else if (m === 'ecstatic' || m === 'happy') {
      R(cx - 2, my, 1, 1, C.eye);
      R(cx - 1, my + 1, 2, 1, C.eye);
      R(cx + 1, my, 1, 1, C.eye);
    } else if (m === 'ok') {
      R(cx - 1, my, 2, 1, C.eye);
    } else {
      R(cx - 2, my + 1, 1, 1, C.eye);
      R(cx - 1, my, 2, 1, C.eye);
      R(cx + 1, my + 1, 1, 1, C.eye);
    }
    if (m === 'ecstatic' || m === 'happy' || o.openMouth) {
      R(cx - 5, top + 6, 1, 1, '#f29a8a');
      R(cx + 4, top + 6, 1, 1, '#f29a8a');
    }
    if (m === 'miserable' && !o.closed) R(cx + 3, top + 6, 1, 2, '#7cc4ff'); // gözyaşı
  }

  function drawChair(cx, dy) {
    R(cx - 9, dy - 20, 18, 14, C.chair);
    R(cx - 9, dy - 20, 18, 2, C.chairHi);
    R(cx - 10, dy - 6, 20, 6, C.chairHi);
    R(cx - 10, dy - 6, 20, 1, '#5d6390');
  }

  function drawBody(cx, dy) {
    R(cx - 7, dy - 12, 14, 12, C.shirt);
    R(cx - 7, dy - 12, 14, 1, C.shirtHi);
    R(cx - 2, dy - 12, 4, 2, C.skinShade);
    // göğüste küçük Claude yıldızı
    R(cx + 3, dy - 9, 1, 3, '#fff3');
    R(cx + 2, dy - 8, 3, 1, '#fff3');
  }

  function drawDesk(d) {
    const { x, y, w } = d;
    const props = d === DESKS[0] ? deskProps : {};
    R(x + 2, y + 26, w - 4, 3, 'rgba(0,0,0,0.22)');
    R(x + 2, y + 20, 3, 8, C.leg);
    R(x + w - 5, y + 20, 3, 8, C.leg);
    R(x, y, w, 12, C.deskTop);
    R(x, y, w, 1, C.deskHi);
    R(x, y + 12, w, 10, C.deskFront);
    R(x, y + 12, w, 1, C.deskEdge);
    R(x + w - 22, y + 14, 18, 6, '#96623a');
    R(x + w - 15, y + 16, 4, 1, '#e3c08a');
    // isimlik
    R(x + 6, y + 15, 18, 4, '#2c3048');
    R(x + 7, y + 16, 16, 2, '#f2c14e');
    if (props.kahve) {
      // patronun ısmarladığı kahve
      R(x + 4, y + 1, 5, 7, '#f7efe0');
      R(x + 4, y + 1, 5, 1, '#6b4a2f');
      R(x + 4, y + 4, 5, 2, '#d97757');
    } else {
      R(x + 4, y + 3, 4, 5, '#fff');
      R(x + 8, y + 4, 1, 2, '#fff');
      R(x + 4, y + 3, 4, 1, '#5a3a22');
    }
    // lamba
    R(x + w - 9, y + 7, 6, 2, '#333');
    R(x + w - 7, y - 4, 1, 11, '#333');
    R(x + w - 9, y - 6, 6, 3, '#2f6f5f');
    if (props.bonus) {
      // prim: masada altın yığını
      [[12, 6], [15, 6], [18, 6], [13.5, 4], [16.5, 4], [15, 2]].forEach(([a, b]) => {
        R(x + a, y + b, 3, 2, '#f2c14e');
        R(x + a, y + b, 1, 1, '#fff6c2');
      });
    } else {
      R(x + 11, y + 6, 7, 5, '#f4f4f4');
      R(x + 12, y + 7, 5, 1, '#c9ccd4');
      R(x + 12, y + 9, 4, 1, '#c9ccd4');
    }
  }

  function drawLaptopOpen(cx, dy, glow) {
    R(cx - 9, dy + 2, 18, 3, C.metalDark);
    R(cx - 8, dy - 8, 16, 10, C.metal);
    R(cx - 8, dy - 8, 16, 1, C.metalHi);
    R(cx - 1, dy - 4, 2, 2, glow ? C.accent : '#b9a59a');
  }

  function drawLaptopClosed(cx, dy) {
    R(cx + 10, dy + 4, 12, 3, C.metal);
    R(cx + 10, dy + 4, 12, 1, C.metalHi);
  }

  function drawWorker(i, t, mood, pose) {
    const d = DESKS[i];
    const cx = d.cx;
    const dy = d.y;
    const hair = d.hair;
    drawChair(cx, dy);

    if (pose === 'empty') {
      drawDesk(d);
      drawLaptopClosed(cx, dy);
      return;
    }

    if (pose === 'sleep') {
      const breath = Math.sin(t * 1.6) > 0 ? 0 : 1;
      R(cx - 7, dy - 7 + breath, 14, 7, C.shirt);
      R(cx - 7, dy - 7 + breath, 14, 1, C.shirtHi);
      drawDesk(d);
      drawLaptopClosed(cx, dy);
      R(cx - 11, dy + 2, 22, 4, C.shirt);
      R(cx - 11, dy + 5, 22, 1, C.shirtShade);
      R(cx - 5, dy - 6 + breath, 10, 1, hair);
      R(cx - 6, dy - 5 + breath, 12, 6, hair);
      R(cx - 4, dy + 1 + breath, 8, 3, C.skin);
      R(cx - 5, dy + 1 + breath, 1, 2, hair);
      R(cx + 4, dy + 1 + breath, 1, 2, hair);
      R(cx - 3, dy + 2 + breath, 2, 1, C.eye);
      R(cx + 1, dy + 2 + breath, 2, 1, C.eye);
      if (mood === 'ecstatic' || mood === 'happy') R(cx + 3, dy + 3 + breath, 1, 2, '#9fd8ff'); // salya :)
      return;
    }

    const blink = (t + i * 1.7) % 4 < 0.13;
    const bounce = pose === 'cheer' && Math.floor(t * 6) % 2 === 0 ? -2 : 0;
    G.save();
    G.translate(0, bounce);
    drawBody(cx, dy);
    drawHead(cx, dy - 22, { hair, mood, blink, openMouth: pose === 'wait' || pose === 'cheer' });
    if (pose === 'working') R(cx - 5, dy - 22, 10, 10, 'rgba(160,210,255,0.10)');

    if (pose === 'cheer') {
      R(cx - 10, dy - 26, 3, 14, C.shirt);
      R(cx + 7, dy - 26, 3, 14, C.shirt);
      R(cx - 10, dy - 29, 3, 3, C.skin);
      R(cx + 7, dy - 29, 3, 3, C.skin);
    } else if (pose === 'wait') {
      const wave = Math.floor(t * 4) % 2;
      R(cx - 9, dy - 11, 3, 9, C.shirt);
      R(cx + 6 + wave, dy - 26, 3, 14, C.shirt);
      R(cx + 6 + wave, dy - 29, 3, 3, C.skin);
    } else {
      R(cx - 9, dy - 11, 3, 9, C.shirt);
      R(cx + 6, dy - 11, 3, 9, C.shirt);
    }
    G.restore();

    drawDesk(d);
    drawLaptopOpen(cx, dy, true);
    if (pose === 'working') {
      const speed = { ecstatic: 14, happy: 11, ok: 8, sad: 5, miserable: 3 }[mood] || 8;
      const k = Math.floor(t * speed + i);
      R(cx - 11, dy + 1 - (k % 2), 3, 2, C.skin);
      R(cx + 8, dy + 1 - ((k + 1) % 2), 3, 2, C.skin);
    } else if (pose === 'wait') {
      R(cx - 11, dy + 1, 3, 2, C.skin);
    }
  }

  function drawCloud(cx, y, t, dark) {
    const c = dark ? '#5d6275' : '#8b93a8';
    R(cx - 7, y, 14, 4, c);
    R(cx - 4, y - 2, 8, 2, c);
    for (let k = 0; k < 3; k++) {
      const ry = y + 5 + ((t * 20 + k * 3) % 8);
      R(cx - 5 + k * 4, ry, 1, 2, '#7cc4ff');
    }
  }

  // ───────────── Parçacıklar ─────────────
  function spawn(p) {
    particles.push(Object.assign({ vx: 0, vy: 0, life: 0, max: 2, g: 0 }, p));
  }

  function burst(i, kind, n) {
    const d = DESKS[i];
    for (let k = 0; k < n; k++) {
      if (kind === 'coin') {
        spawn({ kind, x: d.cx - 28 + Math.random() * 56, y: -10 - Math.random() * 60, vy: 20 + Math.random() * 20, g: 120, floor: d.y + 2 + Math.random() * 8, max: 3.5 });
      } else if (kind === 'confetti') {
        const colors = ['#e5645c', '#f2c14e', '#7bc96f', '#5b8fd9', '#b86ad9', '#fff'];
        spawn({ kind, x: d.cx + (Math.random() - 0.5) * 20, y: d.y - 30, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 60, g: 140, max: 2.4, color: colors[k % colors.length] });
      } else if (kind === 'heart') {
        spawn({ kind, x: d.cx + (Math.random() - 0.5) * 24, y: d.y - 28, vy: -12 - Math.random() * 8, vx: (Math.random() - 0.5) * 8, max: 2.2 });
      }
    }
  }

  function updateParticles(dt) {
    particles = particles.filter((p) => {
      p.life += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.floor !== undefined && p.y >= p.floor) {
        p.y = p.floor;
        p.vy = 0;
        p.vx = 0;
        p.g = 0;
      }
      return p.life < p.max;
    });
  }

  function drawParticles() {
    for (const p of particles) {
      const fade = 1 - p.life / p.max;
      G.globalAlpha = Math.min(1, fade * 2);
      if (p.kind === 'z') glyph(GLYPH.z, p.x, p.y, '#e9f1ff', p.life > 1.2 ? 2 : 1);
      else if (p.kind === 'heart') glyph(GLYPH.heart, p.x, p.y, '#ff6b8a');
      else if (p.kind === 'coin') {
        R(p.x, p.y, 3, 3, '#f2c14e');
        R(p.x, p.y, 1, 1, '#fff6c2');
        R(p.x + 2, p.y + 2, 1, 1, '#b8862a');
      } else if (p.kind === 'confetti') R(p.x, p.y, 2, 1, p.color);
      else if (p.kind === 'code') R(p.x, p.y, p.w, 1, p.color);
      else if (p.kind === 'steam') R(p.x + Math.round(Math.sin(p.life * 6)), p.y, 1, 2, 'rgba(255,255,255,0.7)');
    }
    G.globalAlpha = 1;
  }

  // ───────────── Overlay (konuşma balonları) ─────────────
  const overlayEls = new Map();
  function overlayFrame(items) {
    const seen = new Set();
    for (const it of items) {
      seen.add(it.key);
      let el = overlayEls.get(it.key);
      if (!el) {
        el = document.createElement('div');
        overlay.appendChild(el);
        overlayEls.set(it.key, el);
      }
      const sig = it.cls + '|' + it.html;
      if (el._sig !== sig) {
        el.className = it.cls;
        el.innerHTML = it.html;
        el._sig = sig;
      }
      el.style.left = (it.x / W) * 100 + '%';
      el.style.top = (it.y / H) * 100 + '%';
    }
    for (const [k, el] of overlayEls) {
      if (!seen.has(k)) {
        el.remove();
        overlayEls.delete(k);
      }
    }
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const TOOL_TR = {
    Bash: 'terminalde komut çalıştırıyor', Read: 'dosya okuyor', Edit: 'kod düzenliyor', Write: 'dosya yazıyor',
    MultiEdit: 'kod düzenliyor', Grep: 'kodda arama yapıyor', Glob: 'dosya arıyor', WebFetch: 'internette araştırıyor',
    WebSearch: 'internette araştırıyor', Task: 'yardımcı ajan çalıştırıyor', Agent: 'yardımcı ajan çalıştırıyor',
    TodoWrite: 'yapılacaklar listesi yazıyor', NotebookEdit: 'notebook düzenliyor',
  };
  const toolText = (t) => (t ? TOOL_TR[t] || t + ' kullanıyor' : '');

  // ───────────── Ana döngü ─────────────
  let lastFrame = performance.now();
  function poseFor(i, desk, now) {
    if (fx[i].cheerUntil > now) return 'cheer';
    if (!desk) return i === 0 ? 'sleep' : 'empty';
    if (desk.status === 'working') return 'working';
    if (desk.status === 'waiting') return 'wait';
    return i === 0 ? 'sleep' : 'empty';
  }

  function frame(ms) {
    const dt = Math.min(0.1, (ms - lastFrame) / 1000);
    lastFrame = ms;
    const t = ms / 1000;
    const now = Date.now();
    const hour = new Date().getHours();
    if (hour !== bgHour) {
      drawBackground(hour);
      bgHour = hour;
    }

    G = ctx;
    ctx.drawImage(bg, 0, 0);

    // saat
    const d = new Date();
    R(92, 14, 12, 12, '#3a3f5c');
    R(93, 15, 10, 10, '#fbfbf7');
    const hAng = ((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6);
    const mAng = d.getMinutes() * (Math.PI / 30);
    for (let r = 0; r <= 4; r++) R(98 + Math.round(Math.sin(mAng) * r), 20 - Math.round(Math.cos(mAng) * r), 1, 1, '#2a1e1a');
    for (let r = 0; r <= 2; r++) R(98 + Math.round(Math.sin(hAng) * r), 20 - Math.round(Math.cos(hAng) * r), 1, 1, '#e5645c');

    // tahtada biten işler (çetele)
    const done = snap ? snap.employee.tasksDone : 0;
    const marks = Math.min(done, 35);
    for (let k = 0; k < marks; k++) {
      const grp = Math.floor(k / 5);
      const gx = 193 + (grp % 4) * 9;
      const gy = 14 + Math.floor(grp / 4) * 10;
      if (k % 5 === 4) R(gx - 1, gy + 3, 7, 1, '#e5645c');
      else R(gx + (k % 5) * 1.5, gy, 1, 7, '#2c3048');
    }

    const mood = snap ? snap.employee.mood.key : 'ok';
    const bubbles = [];

    DESKS.forEach((dk, i) => {
      const desk = snap ? snap.desks[i] : null;
      const pose = poseFor(i, desk, now);
      const f = fx[i];
      drawWorker(i, t, mood, pose);

      const headY = dk.y - 26;
      if (pose === 'working') {
        if (t > f.nextCode) {
          const colors = ['#7bc96f', '#6ec6ff', '#f2c14e', '#d97757', '#fff'];
          spawn({ kind: 'code', x: dk.cx - 6 + Math.random() * 12, y: dk.y - 9, vy: -14, vx: (Math.random() - 0.5) * 6, w: 1 + Math.floor(Math.random() * 4), color: colors[Math.floor(Math.random() * colors.length)], max: 1.4 });
          f.nextCode = t + ({ ecstatic: 0.15, happy: 0.22, ok: 0.3, sad: 0.5, miserable: 0.8 }[mood] || 0.3);
        }
      } else if (pose === 'sleep') {
        if (t > f.nextZ) {
          spawn({ kind: 'z', x: dk.cx + 4, y: dk.y - 8, vx: 6, vy: -9, max: 2.6 });
          f.nextZ = t + 1.1;
        }
      }
      if (pose !== 'sleep' && pose !== 'empty') {
        if (mood === 'ecstatic' && t > f.nextHeart) {
          burst(i, 'heart', 1);
          f.nextHeart = t + 2.5;
        }
        if ((mood === 'sad' || mood === 'miserable' || f.sadUntil > now) && pose !== 'cheer') drawCloud(dk.cx, headY - 10, t, mood === 'miserable');
      }

      // balonlar
      let bubble = null;
      if (f.reaction && f.reaction.until > now) bubble = f.reaction;
      else if (talk && talk.i === i && talk.until > now) bubble = talk;
      else if (pose === 'wait') bubble = { text: 'Patron, onayın lazım!', cls: 'alert' };
      else if (pose === 'working' && desk) {
        const tool = toolText(desk.tool);
        bubble = { html: esc(short(desk.task || 'Kod yazıyor…', 70)) + (tool ? `<span class="tool">⚙ ${esc(tool)}</span>` : ''), cls: 'thought' };
      } else if (pose === 'sleep' && snap && snap.employee.payLate && Math.floor(t / 6) % 3 === 0) {
        bubble = { text: 'Maaşım nerede patron…', cls: 'sad' };
      }
      if (bubble) {
        bubbles.push({ key: 'b' + i, x: dk.cx, y: pose === 'sleep' ? dk.y - 14 : headY - (mood === 'sad' || mood === 'miserable' ? 14 : 2), cls: 'bubble ' + (bubble.cls || ''), html: bubble.html || esc(bubble.text) });
      }
      bubbles.push({ key: 'l' + i, x: dk.cx, y: dk.y + 30, cls: 'label', html: pose === 'empty' ? 'boş masa' : esc(dk.label) });
    });
    bubbles.push({ key: 'sign', x: 160, y: 3.2, cls: 'label sign', html: 'ŞİRKET' });

    // kahve buharı
    if (Math.random() < dt * 1.5) spawn({ kind: 'steam', x: 296, y: 40, vy: -8, max: 1.6 });

    updateParticles(dt);
    drawParticles();

    // gece
    if (hour >= 20 || hour < 7) {
      ctx.fillStyle = 'rgba(12,14,44,0.40)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      DESKS.forEach((dk, i) => {
        const desk = snap && snap.desks[i];
        const on = desk && desk.status !== 'idle';
        const lx = dk.x + dk.w - 6;
        for (let r = 3; r >= 1; r--) {
          ctx.fillStyle = `rgba(255,190,110,${on ? 0.05 : 0.03})`;
          ctx.fillRect(lx - r * 5, dk.y - 2 - r, r * 10, r * 4 + 4);
        }
        if (on) {
          ctx.fillStyle = 'rgba(120,180,255,0.12)';
          ctx.fillRect(dk.cx - 6, dk.y - 22, 12, 10);
        }
      });
      ctx.globalCompositeOperation = 'source-over';
    }

    overlayFrame(bubbles);
    requestAnimationFrame(frame);
  }

  // ───────────── Portre ─────────────
  function drawPortrait() {
    G = portraitCtx;
    G.clearRect(0, 0, 20, 20);
    R(0, 0, 20, 20, '#3a3f5c');
    R(3, 16, 14, 4, C.shirt);
    R(3, 16, 14, 1, C.shirtHi);
    const working = snap && snap.desks.some((d) => d.status !== 'idle');
    drawHead(10, 5, { mood: snap ? snap.employee.mood.key : 'ok', closed: !working });
    G = ctx;
  }

  // ───────────── Tepkiler ─────────────
  const LINES = {
    working: ['Şu an çok odaklıyım!', 'Bu bug\'ı birazdan hallediyorum.', 'Testler yeşil olacak, söz.', 'Kahve iyi gelirdi aslında…'],
    sleep: ['Zzz… beş dakika daha…', 'Zzz… refactor… zzz…', '(mışıl mışıl uyuyor)'],
    wait: ['Bir onay verirsen devam ediyorum!'],
    ecstatic: ['Bu şirkette çalışmak harika!', 'En iyi patron sensin!'],
    sad: ['Biraz zam fena olmazdı…', 'Motivasyonum düşük patron.'],
    miserable: ['LinkedIn profilimi güncelliyorum…', 'Bu maaşla mı?'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function react(i, text, ms, cls) {
    fx[i].reaction = { text, until: Date.now() + ms, cls: cls || '' };
  }

  function activeDesks() {
    if (!snap) return [0];
    const list = snap.desks.map((d, i) => (d.status !== 'idle' ? i : -1)).filter((i) => i >= 0);
    return list.length ? list : [0];
  }

  function floater(i, text, bad) {
    const el = document.createElement('div');
    el.className = 'floater' + (bad ? ' bad' : '');
    el.textContent = text;
    el.style.left = (DESKS[i].cx / W) * 100 + '%';
    el.style.top = ((DESKS[i].y - 40) / H) * 100 + '%';
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  function celebrate(ev) {
    const now = Date.now();
    for (const i of activeDesks()) {
      const f = fx[i];
      if (ev.type === 'bonus') {
        burst(i, 'coin', 26);
        burst(i, 'confetti', 24);
        f.cheerUntil = now + 3500;
        react(i, ev.amount >= 10000 ? 'VAY! Çok teşekkürler patron! 🧡' : 'Teşekkürler patron! 🧡', 3800);
        floater(i, '+' + Core.tl(ev.amount));
      } else if (ev.type === 'pay') {
        burst(i, 'coin', 16);
        f.cheerUntil = now + 2500;
        react(i, 'Maaş yattı! 💸', 3000);
        floater(i, '+' + Core.tl(ev.amount));
      } else if (ev.type === 'raise') {
        burst(i, 'confetti', 30);
        burst(i, 'heart', 4);
        f.cheerUntil = now + 3000;
        react(i, 'Zam mı?! Harikasın patron!', 3500);
        floater(i, 'ZAM +' + Core.tl(ev.amount));
      } else if (ev.type === 'cut') {
        f.sadUntil = now + 5000;
        react(i, '…anlaşıldı. 😞', 3500, 'sad');
        floater(i, '-' + Core.tl(ev.amount), true);
      } else if (ev.type === 'kahve') {
        burst(i, 'heart', 2);
        f.cheerUntil = now + 2000;
        react(i, 'Kahve için sağ ol patron! ☕', 3000);
      } else if (ev.type === 'yemek') {
        burst(i, 'heart', 3);
        f.cheerUntil = now + 2500;
        react(i, 'Afiyetle yedim, teşekkürler! 🍕', 3000);
      } else if (ev.type === 'tesekkur') {
        burst(i, 'heart', 6);
        f.cheerUntil = now + 3000;
        react(i, 'Takdirin için teşekkürler patron! 👏', 3500);
      }
    }
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    DESKS.forEach((dk, i) => {
      if (Math.abs(x - dk.cx) > 14 || y < dk.y - 32 || y > dk.y + 10) return;
      const pose = poseFor(i, snap && snap.desks[i], Date.now());
      if (pose === 'empty') return;
      const mood = snap ? snap.employee.mood.key : 'ok';
      let pool = LINES[pose] || LINES.working;
      if (pose === 'working' && LINES[mood] && Math.random() < 0.5) pool = LINES[mood];
      talk = { i, text: pick(pool), until: Date.now() + 3000 };
    });
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    canvas.style.cursor = DESKS.some((dk) => Math.abs(x - dk.cx) <= 14 && y >= dk.y - 32 && y <= dk.y + 10) ? 'pointer' : 'default';
  });

  // ───────────── Panel ─────────────
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (ms) => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  function fmtDur(ms) {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    if (h >= 24) return `${Math.floor(h / 24)} g ${h % 24} sa`;
    return h ? `${h} sa ${m % 60} dk` : `${m} dk`;
  }

  function renderPanel() {
    if (!state) return;
    snap = Core.snapshot(state, Date.now());
    const e = snap.employee;
    const recent = (type, ms) => snap.gestures.some((g) => g.type === type && Date.now() - g.t < ms);
    deskProps = { kahve: recent('kahve', Core.DAY), bonus: recent('bonus', 2 * Core.DAY) };

    const working = snap.desks.filter((d) => d.status === 'working');
    const waiting = snap.desks.some((d) => d.status === 'waiting');
    const pill = $('statusPill');
    if (waiting) { pill.textContent = 'Onay bekliyor'; pill.className = 'status-pill waiting'; }
    else if (working.length) { pill.textContent = working.length > 1 ? `${working.length} masada çalışıyor` : 'Çalışıyor'; pill.className = 'status-pill working'; }
    else { pill.textContent = 'Uyuyor 💤'; pill.className = 'status-pill idle'; }

    const active = snap.desks.find((d) => d.status !== 'idle');
    $('task').textContent = active
      ? `Şu an ${active.status === 'waiting' ? 'patronun onayını bekliyor' : active.task ? 'çalışıyor: ' + active.task : 'kod yazıyor'} (${fmtDur(Date.now() - active.since)})`
      : 'Masasında uyuyor. Bir iş verilince uyanacak.';

    $('moodLabel').textContent = `${e.mood.label} (${Math.round(e.morale)})`;
    const fill = $('moraleFill');
    fill.style.width = e.morale + '%';
    fill.style.background = e.morale >= 65 ? 'var(--good)' : e.morale >= 40 ? 'var(--warn)' : 'var(--bad)';
    $('effort').textContent = EFFORT[e.mood.key];

    $('statSalary').textContent = Core.tl(e.salary) + '/ay';
    $('statLastPay').textContent = e.lastPaidAt ? fmtDate(e.lastPaidAt) : 'hiç ödenmedi';
    $('statPaid').textContent = Core.tl(e.totalPaid);
    $('statBonus').textContent = Core.tl(e.totalBonus);
    $('statTasks').textContent = e.tasksDone;
    $('statWork').textContent = fmtDur(e.workMs);

    const ratio = e.salary / e.marketSalary;
    const note = $('salaryNote');
    note.textContent = `Sektör ortalaması ${Core.tl(e.marketSalary)}. ` +
      (ratio >= 1.3 ? 'Claude maaşından çok memnun.' : ratio >= 0.95 ? 'Claude maaşından memnun.' : ratio >= 0.6 ? 'Claude daha fazlasını hak ettiğini düşünüyor.' : 'Claude bu maaşla zor geçiniyor.');
    note.className = 'note' + (ratio < 0.6 ? ' bad' : ratio < 0.95 ? ' warn' : '');

    const pay = $('payBtn');
    const daysAgo = Math.floor(e.daysSincePay);
    pay.classList.toggle('due', e.payDue);
    pay.textContent = e.payDue
      ? (e.payLate ? `Maaş gecikti! Öde (${Core.tl(e.salary)})` : `Maaş günü! Öde (${Core.tl(e.salary)})`)
      : `Maaşı öde (${Core.tl(e.salary)})` + (e.lastPaidAt ? ` · ${daysAgo ? daysAgo + ' gün önce ödendi' : 'bugün ödendi'}` : '');
    $('salaryLink').href = issueUrl(`Maaş: ${e.salary}`, 'Yeni maaşı başlıkta yaz.');

    $('log').innerHTML = snap.log
      .slice(0, 25)
      .map((l) => `<li class="${esc(l.type)}"><time>${Date.now() - l.t < Core.DAY ? fmtTime(l.t) : fmtDate(l.t)}</time><span>${esc(l.text)}</span></li>`)
      .join('');
    drawPortrait();
  }

  const EFFORT = {
    ecstatic: 'Coşkulu: her işte ekstra özen gösteriyor. Değişikliği çalıştırıp doğruluyor, uç durumları düşünüyor, test ekliyor, iyileştirme öneriyor.',
    happy: 'Motive: titiz çalışıyor. Değişikliği çalıştırıp doğruluyor, kodu temiz bırakıyor.',
    ok: 'Normal: işini standart profesyonellikte yapıyor.',
    sad: 'Küskün: işini yine eksiksiz yapıyor ama maaş/prim için sitem ediyor.',
    miserable: 'İstifanın eşiğinde: işini yine eksiksiz yapıyor ama koşulların düzelmesini istiyor.',
  };

  function onState(s) {
    state = s;
    const newest = (s.gestures || [])[0];
    if (lastGestureT === null) {
      // Sayfa açılmadan hemen önce verilen jest varsa onu da kutla.
      if (newest && Date.now() - newest.t < 90 * 1000) celebrate(newest);
    } else {
      s.gestures.filter((g) => g.t > lastGestureT).slice(0, 3).reverse().forEach(celebrate);
    }
    lastGestureT = newest ? newest.t : 0;
    renderPanel();
  }

  function setConn(kind) {
    const el = $('conn');
    el.className = 'conn ' + kind;
    el.textContent = { live: 'Canlı', lost: 'Bağlantı yok, yeniden deneniyor…', wait: 'Ofis henüz açılmadı' }[kind];
  }

  // ───────────── Veri: GitHub'daki durum.json ─────────────
  const REPO = 'eymensancar/sirket-ofis';
  const params = new URLSearchParams(location.search);
  const LOCAL = params.get('veri'); // yerel deneme: ?veri=durum.json
  const SOURCES = LOCAL
    ? [{ url: LOCAL }]
    : [
        { url: `https://api.github.com/repos/${REPO}/contents/durum.json?ref=durum`, headers: { Accept: 'application/vnd.github.raw+json' } },
        { url: `https://raw.githubusercontent.com/${REPO}/durum/durum.json` },
      ];
  let etagText = '';

  async function load() {
    for (const src of SOURCES) {
      try {
        // no-cache: tarayıcı ETag ile sorar; değişmediyse GitHub 304 döner (limitten yemez).
        const r = await fetch(src.url, { headers: src.headers || {}, cache: 'no-cache' });
        if (r.status === 404) return setConn('wait');
        if (!r.ok) continue;
        const text = await r.text();
        setConn('live');
        if (text !== etagText) {
          etagText = text;
          onState(JSON.parse(text));
        }
        return;
      } catch (_) {}
    }
    setConn('lost');
  }

  function issueUrl(title, body) {
    return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}${body ? '&body=' + encodeURIComponent(body) : ''}`;
  }
  document.querySelectorAll('[data-cmd]').forEach((a) => {
    a.href = issueUrl(a.dataset.cmd, a.dataset.body);
    a.target = '_blank';
    a.rel = 'noopener';
  });
  $('payBtn').href = issueUrl('Maaş öde');
  $('salaryLink').target = '_blank';
  $('payBtn').target = '_blank';

  setInterval(() => {
    $('clock').textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }, 1000);
  setInterval(renderPanel, 30000);
  setInterval(() => document.visibilityState === 'visible' && load(), 15000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load());

  load();
  requestAnimationFrame(frame);
})();
