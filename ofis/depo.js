// Ofisin durumu (durum.json) public site reposunun `durum` dalında tutulur.
// Bu modül o dala, çalışma dizinine ve index'e hiç dokunmadan (git plumbing ile)
// commit atıp push eder. Token gerekmez: makinenin mevcut git yetkisi kullanılır.
// Not: Bu dosya sirket ve sirket-ofis repolarında birebir aynı tutulur.
const { execFileSync } = require('child_process');
const Core = require('./core.js');

const BRANCH = 'durum';
const LOCAL_REF = `refs/sirket-ofis/${BRANCH}`;
const DEFAULT_REMOTE = 'https://github.com/eymensancar/sirket-ofis.git';
const remote = () => process.env.SIRKET_REMOTE || DEFAULT_REMOTE;

function git(dir, args, input, timeout) {
  return execFileSync('git', ['-C', dir, '-c', 'commit.gpgsign=false', ...args], {
    input,
    encoding: 'utf8',
    timeout: timeout || 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Şirket Ofisi',
      GIT_AUTHOR_EMAIL: 'ofis@sirket.invalid',
      GIT_COMMITTER_NAME: 'Şirket Ofisi',
      GIT_COMMITTER_EMAIL: 'ofis@sirket.invalid',
    }),
  }).trim();
}

function fetchOfis(dir, timeout) {
  try {
    git(dir, ['fetch', '--quiet', '--no-tags', remote(), `+refs/heads/${BRANCH}:${LOCAL_REF}`], undefined, timeout);
    return true;
  } catch (_) {
    return false;
  }
}

function readState(dir, now) {
  let head = null;
  let state = null;
  try {
    head = git(dir, ['rev-parse', '--verify', '-q', LOCAL_REF]);
  } catch (_) {}
  if (head) {
    try {
      state = JSON.parse(git(dir, ['show', `${head}:durum.json`]));
    } catch (_) {}
  }
  return { head, state: Core.migrate(state, now) };
}

function commitAndPush(dir, parent, state, message) {
  const blob = git(dir, ['hash-object', '-w', '--stdin'], JSON.stringify(state, null, 2) + '\n');
  const tree = git(dir, ['mktree'], `100644 blob ${blob}\tdurum.json\n`);
  const commit = git(dir, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
  git(dir, ['push', '--quiet', remote(), `${commit}:refs/heads/${BRANCH}`]);
  try {
    git(dir, ['update-ref', LOCAL_REF, commit]);
  } catch (_) {}
  return commit;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// mutate(state, now) durumu değiştirir; false dönerse commit atılmaz.
// Aynı anda başka biri push ettiyse en güncel durumu çekip yeniden dener.
function update(dir, message, mutate) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    fetchOfis(dir);
    const now = Date.now();
    const { head, state } = readState(dir, now);
    Core.tick(state, now);
    const result = mutate(state, now);
    if (result === false) return { result, state, committed: false };
    try {
      commitAndPush(dir, head, state, message);
      return { result, state, committed: true };
    } catch (err) {
      lastErr = err;
      sleep(500 + attempt * 1000);
    }
  }
  throw lastErr || new Error('Ofis güncellenemedi');
}

module.exports = { update, fetchOfis, readState, BRANCH };
