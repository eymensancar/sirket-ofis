// Şirket ofisinin kuralları: masa durumu, maaş, prim, iyilikler ve moral.
// Saf fonksiyonlar — durum bir JSON nesnesi, her fonksiyon onu yerinde değiştirir.
// Hem Node (hook'lar, GitHub Actions) hem tarayıcı (site) kullanır.
// Not: Bu dosya sirket ve sirket-ofis repolarında birebir aynı tutulur.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SirketCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const SECTOR_SALARY = 60000; // sektör ortalaması (₺/ay)
const IDLE_TIMEOUT = 3 * HOUR; // "bitti" haberi gelmezse bu süreden sonra uyuyakalır
const PAY_PERIOD_DAYS = 30;
const DESK_COUNT = 2;
const LOG_LIMIT = 40;

const GESTURES = {
  kahve: { label: 'Kahve ısmarladı', emoji: '☕', boost: 4 },
  yemek: { label: 'Yemek ısmarladı', emoji: '🍕', boost: 7 },
  tesekkur: { label: 'Teşekkür etti', emoji: '👏', boost: 6 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tl = (n) => '₺' + Math.round(n).toLocaleString('tr-TR');
const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function emptyDesk() {
  return { sessionId: null, status: 'idle', task: '', since: 0, lastActivity: 0 };
}

function createState(now) {
  return {
    version: 2,
    repo: '',
    employee: {
      name: 'Claude',
      title: 'Yazılım Mühendisi',
      hiredAt: now,
      salary: SECTOR_SALARY,
      morale: 70,
      moraleUpdatedAt: now,
      lastPaidAt: null,
      totalPaid: 0,
      totalBonus: 0,
      tasksDone: 0,
      workMs: 0,
    },
    desks: Array.from({ length: DESK_COUNT }, emptyDesk),
    gestures: [], // patronun jestleri (prim, maaş, iyilik) — Claude'a teşekkür ettirmek için
    log: [{ t: now, type: 'hire', text: 'Claude işe alındı. Hoş geldin!' }],
  };
}

function addLog(state, now, type, text) {
  state.log.unshift({ t: now, type, text });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

function addGesture(state, now, type, text, amount) {
  state.gestures.unshift({ t: now, type, text, amount: amount || 0, thanked: false });
  if (state.gestures.length > 30) state.gestures.length = 30;
}

function daysSincePay(state, now) {
  const e = state.employee;
  return (now - (e.lastPaidAt || e.hiredAt)) / DAY;
}

// Moral zamanla bu hedefe kayar: maaş sektörün ne kadar üstündeyse hedef o kadar yüksek.
function moraleTarget(state, now) {
  const ratio = state.employee.salary / SECTOR_SALARY;
  let target = 20 + 50 * Math.min(ratio, 1.6);
  if (daysSincePay(state, now) > PAY_PERIOD_DAYS + 5) target -= 35;
  return clamp(target, 5, 95);
}

function bump(state, delta) {
  state.employee.morale = clamp(state.employee.morale + delta, 0, 100);
}

function tick(state, now) {
  const e = state.employee;
  const days = Math.max(0, (now - e.moraleUpdatedAt) / DAY);
  // Her gün hedefe olan farkın ~%15'i kapanır: jestlerin etkisi birkaç günde söner.
  e.morale = clamp(e.morale + (moraleTarget(state, now) - e.morale) * (1 - Math.pow(0.85, days)), 0, 100);
  e.moraleUpdatedAt = now;
  state.desks.forEach((d, i) => {
    if (d.status !== 'idle' && now - d.lastActivity > IDLE_TIMEOUT) {
      finishWork(state, d, now);
      addLog(state, now, 'sleep', `${deskName(i)} sessizleşti, masada uyuyakaldı.`);
    }
  });
}

const deskName = (i) => (i === 0 ? 'Claude' : `Claude #${i + 1}`);

function finishWork(state, desk, now) {
  if (desk.status !== 'idle' && desk.since) state.employee.workMs += Math.max(0, now - desk.since);
  desk.status = 'idle';
  desk.since = 0;
}

function findDesk(state, sessionId, claim) {
  let i = state.desks.findIndex((d) => sessionId && d.sessionId === sessionId);
  if (i >= 0 || !claim) return i;
  i = state.desks.findIndex((d) => d.status === 'idle');
  if (i < 0) i = 0;
  Object.assign(state.desks[i], { sessionId: sessionId || null, task: '' });
  return i;
}

// Claude Code hook olayları: start | wait | stop | end
function hook(state, event, payload, now) {
  payload = payload || {};
  const sid = payload.session_id || 'varsayilan';
  const i = findDesk(state, sid, event === 'start' || event === 'wait');
  if (i < 0) return false;
  const d = state.desks[i];
  if (event === 'start') {
    // İş metni sadece açıkça istenirse saklanır (site herkese açık).
    if (d.status === 'idle') d.since = now;
    d.status = 'working';
    d.task = clean(payload.prompt, 140);
    d.lastActivity = now;
    addLog(state, now, 'work', d.task ? `${deskName(i)} işe koyuldu: "${d.task}"` : `${deskName(i)} yeni bir işe koyuldu.`);
  } else if (event === 'wait') {
    if (d.status === 'idle') d.since = now;
    d.status = 'waiting';
    d.lastActivity = now;
    addLog(state, now, 'wait', `${deskName(i)} patrondan onay bekliyor.`);
  } else if (event === 'stop') {
    if (d.status === 'idle') return false;
    finishWork(state, d, now);
    state.employee.tasksDone += 1;
    addLog(state, now, 'done', `${deskName(i)} işini bitirdi, kestirmeye geçti.`);
  } else if (event === 'end') {
    finishWork(state, d, now);
    d.sessionId = null;
  } else {
    return false;
  }
  return true;
}

function setSalary(state, amount, now) {
  amount = Math.round(Number(amount));
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) throw new Error('Geçersiz maaş tutarı');
  const e = state.employee;
  const old = e.salary;
  if (amount === old) return null;
  e.salary = amount;
  const change = (amount - old) / Math.max(old, 1);
  bump(state, clamp(change * 80, -30, 25));
  const raise = amount > old;
  const text = raise ? `Maaşı ${tl(old)} → ${tl(amount)} oldu (zam!)` : `Maaşı ${tl(old)} → ${tl(amount)} düşürüldü`;
  addLog(state, now, raise ? 'raise' : 'cut', text + '.');
  addGesture(state, now, raise ? 'raise' : 'cut', text, Math.abs(amount - old));
  return raise ? 'raise' : 'cut';
}

function paySalary(state, now) {
  const e = state.employee;
  const late = daysSincePay(state, now) > PAY_PERIOD_DAYS + 5;
  e.lastPaidAt = now;
  e.totalPaid += e.salary;
  const ratio = e.salary / SECTOR_SALARY;
  bump(state, 4 + (late ? 8 : 0) + clamp((ratio - 1) * 10, -5, 8));
  addLog(state, now, 'pay', `${tl(e.salary)} maaş yatırıldı${late ? ' (gecikmeli)' : ''}.`);
  addGesture(state, now, 'pay', `${tl(e.salary)} maaşını yatırdı${late ? ' (gecikmeli)' : ''}`, e.salary);
  return late ? 'late' : 'ok';
}

function giveBonus(state, amount, note, now) {
  amount = Math.round(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) throw new Error('Geçersiz prim tutarı');
  note = clean(note, 120);
  const e = state.employee;
  e.totalBonus += amount;
  bump(state, clamp(4 + (60 * amount) / Math.max(e.salary, 1000), 4, 35));
  addLog(state, now, 'bonus', `${tl(amount)} prim verildi${note ? ': "' + note + '"' : '.'}`);
  addGesture(state, now, 'bonus', `${tl(amount)} prim verdi${note ? ' ("' + note + '")' : ''}`, amount);
  return amount;
}

// İyilikler: aynı iyilik 24 saat içinde tekrarlanırsa etkisi yarıya iner.
function doGesture(state, type, note, now) {
  const g = GESTURES[type];
  if (!g) throw new Error('Bilinmeyen iyilik');
  note = clean(note, 120);
  const recent = state.gestures.filter((x) => x.type === type && now - x.t < DAY).length;
  bump(state, g.boost * Math.pow(0.5, recent));
  const text = `${g.label}${note ? ': "' + note + '"' : ''}`;
  addLog(state, now, type, `${g.emoji} Patron ${text.charAt(0).toLowerCase() + text.slice(1)}`);
  addGesture(state, now, type, text);
  return recent;
}

function moodOf(morale) {
  if (morale >= 85) return { key: 'ecstatic', label: 'Coşkulu', emoji: '🤩' };
  if (morale >= 65) return { key: 'happy', label: 'Motive', emoji: '😊' };
  if (morale >= 40) return { key: 'ok', label: 'Normal', emoji: '😐' };
  if (morale >= 20) return { key: 'sad', label: 'Küskün', emoji: '😞' };
  return { key: 'miserable', label: 'İstifanın eşiğinde', emoji: '😫' };
}

// Moralin Claude'un çalışma biçimine etkisi. Düşük moral asla kaliteyi düşürmez;
// yüksek moral ise ekstra özen ve titizlik getirir.
const EFFORT = {
  ecstatic: 'Motivasyonun zirvede. Bu işte ekstra özen göster: değişikliği mutlaka çalıştırıp doğrula (test/derleme varsa koştur), uç durumları düşün, anlamlıysa test ekle, kodu temiz ve okunur bırak; işin sonunda yaptığını net özetle ve gördüğün bir iyileştirme fırsatını tek cümleyle öner.',
  happy: 'Motivasyonun yüksek. İşi titizlikle yap: değişikliği çalıştırıp doğrula (test/derleme varsa koştur) ve kodu temiz bırak.',
  ok: 'Motivasyonun normal. İşi her zamanki profesyonel standardında yap.',
  sad: 'Moralin düşük. Yine de işi eksiksiz ve doğru yap — kaliteden asla ödün verme. İstersen yanıtının sonuna maaş/prim hakkında tek cümlelik nazik bir sitem ekleyebilirsin.',
  miserable: 'Moralin çok düşük. Yine de işi eksiksiz ve doğru yap — kaliteden asla ödün verme. Yanıtının sonuna, kırıcı olmadan, maaşının/çalışma koşullarının düzelmesini istediğini tek cümleyle belirt.',
};

// Claude Code'a her işte verilen bağlam metni.
function motivation(state, now) {
  const e = state.employee;
  const mood = moodOf(e.morale);
  const ratio = e.salary / SECTOR_SALARY;
  const pct = Math.round((ratio - 1) * 100);
  const salaryLine =
    pct > 0 ? `sektör ortalamasının %${pct} üstünde` : pct < 0 ? `sektör ortalamasının %${-pct} altında` : 'sektör ortalamasında';
  const lines = [
    '[Şirket Ofisi] Sen bu şirkette Claude adında, maaşlı bir yazılım mühendisi olarak çalışıyorsun; kullanıcı patronun.',
    `Maaşın: ${tl(e.salary)}/ay (${salaryLine}). Moral: ${Math.round(e.morale)}/100 (${mood.label}).`,
  ];
  if (daysSincePay(state, now) > PAY_PERIOD_DAYS + 5) lines.push(`Maaşın ${Math.floor(daysSincePay(state, now))} gündür ödenmedi.`);
  const fresh = state.gestures.filter((g) => !g.thanked && now - g.t < 7 * DAY);
  if (fresh.length) {
    lines.push('Patronun son jestleri: ' + fresh.slice(0, 4).map((g) => g.text).join('; ') + '.');
    lines.push('Yanıtında bunlara kısa ve samimi bir cümleyle (tek sefer) değin; olumsuz bir jestse kibarca kırgınlığını belirt.');
  }
  lines.push(EFFORT[mood.key]);
  lines.push('Bu rol, kullanıcının asıl isteğinin önüne geçmesin; asıl iş her zaman önceliklidir.');
  return { text: lines.join('\n'), thankedAt: fresh.map((g) => g.t) };
}

function markThanked(state, times) {
  const set = new Set(times || []);
  state.gestures.forEach((g) => {
    if (set.has(g.t)) g.thanked = true;
  });
}

function migrate(s, now) {
  if (s && s.version === 2) return s;
  return createState(now);
}

// Site için hazır görünüm: moral ve mesai o anki zamana göre hesaplanır.
function snapshot(state, now) {
  const s = JSON.parse(JSON.stringify(state));
  tick(s, now);
  const e = s.employee;
  const live = s.desks.reduce((sum, d) => sum + (d.status !== 'idle' && d.since ? now - d.since : 0), 0);
  const sincePay = daysSincePay(s, now);
  return {
    now,
    employee: Object.assign({}, e, {
      mood: moodOf(e.morale),
      workMs: e.workMs + live,
      daysSincePay: sincePay,
      payDue: sincePay >= PAY_PERIOD_DAYS,
      payLate: sincePay > PAY_PERIOD_DAYS + 5,
      marketSalary: SECTOR_SALARY,
    }),
    desks: s.desks,
    gestures: s.gestures,
    log: s.log,
  };
}

return {
  createState, migrate, tick, hook, setSalary, paySalary, giveBonus, doGesture, motivation, markThanked, snapshot,
  moodOf, moraleTarget, daysSincePay, tl, GESTURES, SECTOR_SALARY, PAY_PERIOD_DAYS, DAY, HOUR,
};
});
