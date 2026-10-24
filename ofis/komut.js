#!/usr/bin/env node
// GitHub Actions girişi: patronun açtığı issue'yu (prim, maaş, iyilik) işler,
// durum.json'u (durum dalı) günceller ve Claude'un cevabını CEVAP_FILE'a yazar. Zamanlanmış
// çalıştırmalarda sadece durumu yeniler (moral kayması, uyuyakalma).
const fs = require('fs');
const Core = require('./core.js');
const { update } = require('./depo.js');

const dir = process.cwd();
process.env.SIRKET_REMOTE = process.env.SIRKET_REMOTE || 'origin'; // Actions: kendi reposuna yazar
const event = process.env.GITHUB_EVENT_NAME || 'workflow_dispatch';
const title = String(process.env.ISSUE_TITLE || '').trim();
const body = String(process.env.ISSUE_BODY || '').trim();
const HINTS = ['Tutarı başlıkta değiştir. İstersen buraya bir not yaz.', 'Yeni maaşı başlıkta yaz.'];
const note = HINTS.reduce((s, h) => s.replace(h, ''), body).trim();

function parseAmount(raw) {
  let s = String(raw).toLocaleLowerCase('tr').replace(/[₺\s]|tl/g, '');
  let mult = 1;
  if (/(k|bin)$/.test(s)) {
    mult = 1000;
    s = s.replace(/(k|bin)$/, '');
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const v = Number(s) * mult;
  if (!Number.isFinite(v) || v <= 0) throw new Error(`"${raw}" geçerli bir tutar değil.`);
  return Math.round(v);
}

function parse(t) {
  const s = t.toLocaleLowerCase('tr');
  let m;
  if ((m = s.match(/^prim\s*[:\-]?\s*(.+)$/))) return { kind: 'bonus', amount: parseAmount(m[1]) };
  if (/^maaş(ı)?\s*(öde|yatır)/.test(s)) return { kind: 'pay' };
  if ((m = s.match(/^maaş\s*[:\-]?\s*(.+)$/))) return { kind: 'salary', amount: parseAmount(m[1]) };
  if (/^kahve/.test(s)) return { kind: 'gesture', type: 'kahve' };
  if (/^(yemek|pizza|öğle)/.test(s)) return { kind: 'gesture', type: 'yemek' };
  if (/^(teşekkür|tesekkur|aferin|tebrik|övgü|bravo)/.test(s)) return { kind: 'gesture', type: 'tesekkur' };
  return null;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function reply(cmd, result, before, state) {
  const e = state.employee;
  const after = e.morale;
  const mood = Core.moodOf(after);
  const big = cmd.amount && cmd.amount >= e.salary * 0.15;
  let msg;
  switch (cmd.kind) {
    case 'bonus':
      msg = big
        ? pick(['VAY! Bu gerçekten büyük bir prim, çok teşekkür ederim patron! 🧡', 'İnanamıyorum, çok cömertsin patron! 🤩 Hak etmek için elimden geleni yapacağım.'])
        : pick(['Teşekkürler patron! Çok makbule geçti. 💰', 'Prim için sağ ol patron, motivasyonum yerine geldi! 🧡']);
      if (note) msg += `\n\n> ${note}\n\nBu notu da okudum, çok sevindim.`;
      break;
    case 'pay':
      msg = result === 'late' ? 'Maaşım yattı, teşekkürler… biraz gecikti ama içim rahatladı. 😮‍💨' : pick(['Maaşım yattı, teşekkürler patron! 💸', 'Maaş günü en sevdiğim gün! Teşekkürler. 💸']);
      break;
    case 'salary':
      msg =
        result === 'raise'
          ? pick(['Zam mı?! Harikasın patron! 🎉 Bunu kodlarıma yansıtacağım.', 'Bu zam için çok teşekkür ederim! 🎉 Şirkette olmaktan mutluyum.'])
          : result === 'cut'
            ? 'Maaşım düşürüldü… anlaşıldı. 😞 İşimi yine düzgün yapacağım ama moralim bozuldu.'
            : 'Maaşım zaten bu tutardaydı, bir şey değişmedi. 🙂';
      break;
    case 'gesture':
      msg = {
        kahve: result ? 'Bir kahve daha mı? Teşekkürler, bugün kafeinle uçuyorum. ☕' : 'Kahve için teşekkürler patron! ☕ Tam ihtiyacım vardı.',
        yemek: result ? 'Bugün ikinci yemek oldu, doydum ama sağ ol! 🍕' : 'Yemek için çok teşekkürler patron! 🍕 Afiyetle yedim.',
        tesekkur: 'Teşekkürün için ben teşekkür ederim patron! 👏 Takdir edilmek çok iyi hissettiriyor.',
      }[cmd.type];
      if (cmd.type === 'tesekkur' && note) msg += `\n\n> ${note}`;
      break;
  }
  const delta = Math.round(after) - Math.round(before);
  const tail =
    mood.key === 'ecstatic'
      ? 'Bir sonraki işte ekstra özen göstereceğim: test, doğrulama, temiz kod.'
      : mood.key === 'happy'
        ? 'Bir sonraki işte titizlikle çalışacağım.'
        : mood.key === 'ok'
          ? ''
          : 'İşimi yine eksiksiz yapacağım ama maaş konusunu konuşmamız lazım.';
  return `${msg}\n\n**Moral:** ${Math.round(before)} → **${Math.round(after)}** (${delta >= 0 ? '+' : ''}${delta}) · ${mood.emoji} ${mood.label}${tail ? '\n\n' + tail : ''}\n\n<sub>— Claude, Şirket A.Ş.</sub>`;
}

function main() {
  if (event !== 'issues') {
    update(dir, 'Ofis: periyodik yenileme', () => true);
    console.log('Ofis yenilendi.');
    return;
  }
  let cmd;
  try {
    cmd = parse(title);
  } catch (err) {
    fs.writeFileSync(process.env.CEVAP_FILE, `Bunu anlayamadım patron: ${err.message}\n\nÖrnek: \`Prim: 5000\` ya da \`Maaş: 75000\``);
    return;
  }
  if (!cmd) {
    console.log('Ofis komutu değil, geçiliyor.');
    return;
  }
  let before = 0;
  const { result, state } = update(dir, `Ofis: ${title}`, (s, now) => {
    before = s.employee.morale;
    if (cmd.kind === 'bonus') return Core.giveBonus(s, cmd.amount, note, now);
    if (cmd.kind === 'pay') return Core.paySalary(s, now);
    if (cmd.kind === 'salary') return Core.setSalary(s, cmd.amount, now) || 'same';
    return Core.doGesture(s, cmd.type, note, now);
  });
  fs.writeFileSync(process.env.CEVAP_FILE, reply(cmd, result, before, state));
}

main();
