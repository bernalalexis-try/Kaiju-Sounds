(function () {
  const USER_COLORS = ['#FF8A65', '#6E97FF', '#FFC94A', '#3FD0A0', '#C08BFF', '#FF7FA8'];
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4l14 8-14 8z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  const ICON_ALL = '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>';
  const ALL = 'todos';
  const OTHERS = 'otros';

  const $ = (id) => document.getElementById(id);
  const listEl = $('list');
  const pickerEl = $('picker');

  const builtIn = KAIJUS.map((k) => ({
    key: k.id,
    name: k.name,
    era: k.era,
    img: 'img/' + k.id + '.webp',
    clips: k.durations.map((d, i) => ({
      id: k.id + '-' + (i + 1),
      name: k.name + ' ' + (i + 1),
      color: k.color,
      src: 'audio/' + k.id + '/' + k.id + '-' + (i + 1) + '.mp3',
      duration: d
    }))
  }));

  let userClips = [];
  let db = null;
  let selected = readSetting('kaiju-selected') || ALL;
  const players = new Map();

  function readSetting(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function writeSetting(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function sections() {
    const list = builtIn.slice();
    if (userClips.length) {
      list.push({ key: OTHERS, name: 'Otros audios', era: '', img: null, clips: userClips });
    }
    return list;
  }

  function allClips() {
    return sections().flatMap((s) => s.clips);
  }

  function findClip(id) {
    return allClips().find((c) => c.id === id);
  }

  function formatTime(s) {
    if (!isFinite(s) || s < 0) return '–:––';
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('kaiju-audios', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('clips', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function saveUserClip(clip) {
    if (!db) return Promise.resolve();
    return new Promise((resolve) => {
      const t = db.transaction('clips', 'readwrite');
      t.objectStore('clips').put({
        id: clip.id, name: clip.name, color: clip.color,
        blob: clip.blob, duration: clip.duration, created: clip.created
      });
      t.oncomplete = resolve;
      t.onerror = resolve;
    });
  }

  function loadUserClips() {
    return new Promise((resolve) => {
      const r = db.transaction('clips', 'readonly').objectStore('clips').getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    });
  }

  function getDuration(blob) {
    return new Promise((resolve) => {
      const a = new Audio();
      const url = URL.createObjectURL(blob);
      const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => done(-1);
      setTimeout(() => done(0), 6000);
      a.src = url;
    });
  }

  function getPlayer(clip) {
    let audio = players.get(clip.id);
    if (!audio) {
      audio = new Audio(clip.src || URL.createObjectURL(clip.blob));
      audio.preload = 'auto';
      audio.addEventListener('ended', () => { audio.currentTime = 0; updatePad(clip.id); });
      audio.addEventListener('pause', () => { updatePad(clip.id); });
      audio.addEventListener('play', () => { updatePad(clip.id); startTicker(); });
      players.set(clip.id, audio);
    }
    return audio;
  }

  function isPlaying(id) {
    const a = players.get(id);
    return !!(a && !a.paused);
  }

  function toggle(id) {
    const clip = findClip(id);
    if (!clip) return;
    const audio = getPlayer(clip);
    if (!audio.paused) {
      audio.pause();
      return;
    }
    players.forEach((a, otherId) => {
      if (otherId !== id && !a.paused) {
        a.pause();
        a.currentTime = 0;
        updatePad(otherId);
      }
    });
    audio.play().catch(() => toast('Este audio no se puede reproducir.'));
  }

  let ticking = false;
  function startTicker() {
    if (ticking) return;
    ticking = true;
    const step = () => {
      let any = false;
      players.forEach((a, id) => {
        if (!a.paused) {
          any = true;
          updateProgress(id);
        }
      });
      if (any) requestAnimationFrame(step);
      else ticking = false;
    };
    requestAnimationFrame(step);
  }

  function padEl(id) {
    return listEl.querySelector('[data-id="' + id + '"]');
  }

  function updateProgress(id) {
    const el = padEl(id);
    const clip = findClip(id);
    if (!el || !clip) return;
    const a = players.get(id);
    const dur = (a && isFinite(a.duration) && a.duration) || clip.duration || 0;
    const cur = a ? a.currentTime : 0;
    el.querySelector('.fill').style.transform = 'scaleX(' + (dur ? Math.min(cur / dur, 1) : 0) + ')';
    el.querySelector('.meta').textContent = cur > 0 && dur ? formatTime(cur) + ' / ' + formatTime(dur) : formatTime(dur);
  }

  function updatePad(id) {
    const el = padEl(id);
    const clip = findClip(id);
    if (!el || !clip) return;
    const playing = isPlaying(id);
    el.classList.toggle('playing', playing);
    const btn = el.querySelector('.play');
    btn.setAttribute('aria-pressed', playing);
    btn.setAttribute('aria-label', (playing ? 'Pausar ' : 'Reproducir ') + clip.name);
    el.querySelector('.icon').innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    updateProgress(id);
  }

  function makePad(clip) {
    const pad = document.createElement('div');
    pad.className = 'pad';
    pad.dataset.id = clip.id;
    pad.style.setProperty('--c', clip.color);
    pad.innerHTML =
      '<div class="fill"></div>' +
      '<button class="play" aria-pressed="false">' +
      '<span class="icon"></span><span class="name"></span><span class="meta"></span>' +
      '</button>';
    pad.querySelector('.name').textContent = clip.name;
    pad.querySelector('.play').addEventListener('click', () => toggle(clip.id));
    return pad;
  }

  function makeHeader(section) {
    const head = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = section.name;
    if (section.era) {
      const small = document.createElement('small');
      small.textContent = '(' + section.era + ')';
      h.appendChild(small);
    }
    if (section.img) {
      head.className = 'sec-head';
      const img = document.createElement('img');
      img.className = 'sec-art';
      img.src = section.img;
      img.alt = '';
      const title = document.createElement('div');
      title.className = 'sec-title';
      title.appendChild(h);
      head.append(img, title);
    } else {
      head.className = 'sec-plain';
      head.appendChild(h);
    }
    return head;
  }

  function renderPicker(secs) {
    const keep = pickerEl.scrollLeft;
    pickerEl.innerHTML = '';
    const items = [{ key: ALL, name: 'Todos', era: '', img: null }].concat(secs);
    items.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'pick';
      b.setAttribute('aria-pressed', s.key === selected);

      const th = document.createElement('span');
      th.className = 'th';
      if (s.key === ALL) {
        th.innerHTML = ICON_ALL;
      } else if (s.img) {
        const img = document.createElement('img');
        img.src = s.img;
        img.alt = '';
        th.appendChild(img);
      } else {
        const ini = document.createElement('span');
        ini.className = 'ini';
        ini.textContent = s.name.charAt(0).toUpperCase();
        th.style.background = s.clips[0] ? s.clips[0].color : 'var(--surface)';
        th.appendChild(ini);
      }

      const lb = document.createElement('span');
      lb.className = 'lb';
      lb.textContent = s.name;
      if (s.era) {
        const small = document.createElement('small');
        small.textContent = s.era;
        lb.appendChild(small);
      }

      b.append(th, lb);
      b.addEventListener('click', () => {
        selected = s.key;
        writeSetting('kaiju-selected', selected);
        render();
        window.scrollTo({ top: 0 });
      });
      pickerEl.appendChild(b);
    });
    pickerEl.scrollLeft = keep;
  }

  function render() {
    const secs = sections();
    if (selected !== ALL && !secs.some((s) => s.key === selected)) selected = ALL;
    renderPicker(secs);

    const visible = selected === ALL ? secs : secs.filter((s) => s.key === selected);
    const wrap = document.createElement('div');
    wrap.className = 'sections';
    visible.forEach((s) => {
      const sec = document.createElement('section');
      sec.setAttribute('aria-label', s.name);
      const grid = document.createElement('div');
      grid.className = 'grid';
      s.clips.forEach((c) => grid.appendChild(makePad(c)));
      sec.append(makeHeader(s), grid);
      wrap.appendChild(sec);
    });
    listEl.replaceChildren(wrap);
    visible.forEach((s) => s.clips.forEach((c) => updatePad(c.id)));
  }

  async function addFiles(files) {
    let added = 0;
    let skipped = 0;
    for (const f of files) {
      const isAudio = (f.type && f.type.startsWith('audio/')) ||
        /\.(mp3|m4a|wav|ogg|oga|aac|opus|flac|webm)$/i.test(f.name);
      if (!isAudio) { skipped++; continue; }
      const duration = await getDuration(f);
      if (duration < 0) { skipped++; continue; }
      const clip = {
        id: 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Audio',
        color: USER_COLORS[userClips.length % USER_COLORS.length],
        blob: f,
        duration: duration,
        created: Date.now()
      };
      userClips.push(clip);
      await saveUserClip(clip);
      added++;
    }
    render();
    if (added) toast(added === 1 ? 'Audio agregado' : added + ' audios agregados');
    if (skipped) toast(skipped === 1 ? 'Un archivo no es un audio compatible' : skipped + ' archivos no son audios compatibles');
  }

  $('addBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    addFiles(files);
  });

  render();

  openDB()
    .then(async (database) => {
      db = database;
      userClips = (await loadUserClips()).sort((a, b) => a.created - b.created);
      if (userClips.length) render();
    })
    .catch(() => {
      const n = $('notice');
      n.textContent = 'Este navegador no permite guardar audios. Los que agregues se pierden al cerrar la página.';
      n.hidden = false;
    });
})();
