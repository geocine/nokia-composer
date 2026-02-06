import { loadWasmPlayer, createPlayer } from './player.js';

const DEFAULT_BPM = 120;
const DEFAULT_DURATION = 4;
const DEFAULT_OCTAVE = 5;

const isDigit = (char) => char >= '0' && char <= '9';

function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function normalizeDuration(value, fallback = DEFAULT_DURATION) {
  return clampInt(value, 1, 64, fallback);
}

function normalizeOctave(value, fallback = DEFAULT_OCTAVE) {
  return clampInt(value, 4, 7, fallback);
}

function mapRtttlOctaveToComposer(value) {
  return clampInt(value - 4, 1, 3, 1);
}

function normalizeComposerOctave(value, fallback) {
  const raw = clampInt(value, 1, 9, fallback);
  if (raw >= 4) {
    return mapRtttlOctaveToComposer(raw);
  }
  return clampInt(raw, 1, 3, fallback);
}

function buildComposerToken(duration, dotted, sharp, note, octave) {
  const dur = normalizeDuration(duration);
  let token = `${dur}`;
  if (dotted) {
    token += '.';
  }
  if (note === '-') {
    return `${token}-`;
  }
  if (sharp) {
    token += '#';
  }
  token += note;
  if (octave != null) {
    token += `${octave}`;
  }
  return token;
}

function parseRtttlDefaults(defaultsText) {
  const defaults = {};
  if (!defaultsText) return defaults;
  defaultsText.split(',').forEach((rawPair) => {
    const [key, rawValue] = rawPair.split('=').map((part) => part.trim().toLowerCase());
    if (!key || !rawValue) return;
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return;
    if (key === 'd') defaults.d = parsed;
    if (key === 'o') defaults.o = parsed;
    if (key === 'b') defaults.b = parsed;
  });
  return defaults;
}

function parseRtttlInput(text) {
  const input = String(text || '');
  if (!input.includes(':')) return null;
  const parts = input.split(':');
  if (parts.length < 2) return null;

  const notes = parts.pop().trim();
  if (!notes) return null;

  let name = '';
  let defaultsText = '';
  if (parts.length >= 2) {
    defaultsText = parts.pop().trim();
    name = parts.join(':').trim();
  } else {
    const head = parts[0].trim();
    if (head) {
      if (/[dob]\s*=/.test(head.toLowerCase())) {
        defaultsText = head;
      } else {
        name = head;
      }
    }
  }

  return {
    name,
    defaults: parseRtttlDefaults(defaultsText),
    notes,
  };
}

function normalizeRtttlNotes(notes, defaults) {
  const tokens = [];
  const defaultDuration = normalizeDuration(defaults.d);
  const defaultOctave = normalizeOctave(defaults.o);

  notes.split(',').forEach((rawToken) => {
    const token = rawToken.trim().toLowerCase();
    if (!token) return;
    let i = 0;
    let durationText = '';
    while (i < token.length && isDigit(token[i])) {
      durationText += token[i];
      i += 1;
    }
    const duration = durationText ? Number.parseInt(durationText, 10) : defaultDuration;
    const noteChar = token[i];
    if (!noteChar) return;
    i += 1;

    let note = noteChar;
    if (note === 'h') note = 'b';
    if (note === 'p') note = '-';
    if (!((note >= 'a' && note <= 'g') || note === '-')) {
      return;
    }

    let sharp = false;
    if (token[i] === '#') {
      sharp = true;
      i += 1;
    }

    let dotted = false;
    let octaveText = '';
    for (; i < token.length; i += 1) {
      const ch = token[i];
      if (ch === '.') {
        dotted = true;
      } else if (ch === '#') {
        sharp = true;
      } else if (isDigit(ch)) {
        octaveText += ch;
      }
    }

    if (note === '-') {
      tokens.push(buildComposerToken(duration, dotted, false, note, null));
      return;
    }

    const octaveRaw = octaveText ? Number.parseInt(octaveText, 10) : defaultOctave;
    const octave = mapRtttlOctaveToComposer(normalizeOctave(octaveRaw, defaultOctave));
    tokens.push(buildComposerToken(duration, dotted, sharp, note, octave));
  });

  return tokens;
}

function normalizeComposerTokens(text, defaults) {
  const tokens = [];
  const defaultDuration = normalizeDuration(defaults.d);
  const defaultOctave = normalizeOctave(defaults.o);
  const defaultComposerOctave = mapRtttlOctaveToComposer(defaultOctave);
  const rawTokens = String(text || '').replace(/,/g, ' ').split(/\s+/);

  rawTokens.forEach((rawToken) => {
    const token = rawToken.trim().toLowerCase();
    if (!token) return;
    let i = 0;
    let durationText = '';
    while (i < token.length && isDigit(token[i])) {
      durationText += token[i];
      i += 1;
    }
    const duration = durationText ? Number.parseInt(durationText, 10) : defaultDuration;

    let dotted = false;
    if (token[i] === '.') {
      dotted = true;
      i += 1;
    }

    let sharp = false;
    if (token[i] === '#') {
      sharp = true;
      i += 1;
    }

    const noteChar = token[i];
    if (!noteChar) return;
    i += 1;

    let note = noteChar;
    if (note === 'h') note = 'b';
    if (note === 'p') note = '-';
    if (!((note >= 'a' && note <= 'g') || note === '-')) {
      return;
    }

    let octaveText = '';
    for (; i < token.length; i += 1) {
      const ch = token[i];
      if (ch === '.') {
        dotted = true;
      } else if (ch === '#') {
        sharp = true;
      } else if (isDigit(ch)) {
        octaveText += ch;
      }
    }

    if (note === '-') {
      tokens.push(buildComposerToken(duration, dotted, false, note, null));
      return;
    }

    const octaveRaw = octaveText ? Number.parseInt(octaveText, 10) : null;
    const octave = octaveRaw == null
      ? defaultComposerOctave
      : normalizeComposerOctave(octaveRaw, defaultComposerOctave);
    tokens.push(buildComposerToken(duration, dotted, sharp, note, octave));
  });

  return tokens;
}

class NokiaComposer {
  constructor() {
    this.bpmInput = document.getElementById('bpm');
    this.defaultDurationInput = document.getElementById('default-duration');
    this.defaultOctaveInput = document.getElementById('default-octave');
    this.songEditor = document.getElementById('song');
    this.playBtn = document.getElementById('play-btn');
    this.songSelect = document.getElementById('song-select');
    this.helpBtn = document.getElementById('help-btn');
    this.closeHelpBtn = document.getElementById('close-help-btn');
    this.helpModal = document.getElementById('help-modal');
    
    this.player = null;
    this.playing = false;
    this.playbackRestoreText = null;
    this.playbackSession = 0;
    this.songs = [];
    this.defaultSong = '16e2 16d2 8#f 8#g 16#c2 16b 8d 8e 16b 16a 8#c 8e 2a 2-';

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadSongs();
    this.handleHash();
    await this.initPlayer();
  }

  bindEvents() {
    this.songEditor.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.keyCode === 13) {
        e.preventDefault();
        this.togglePlayback();
      }
    });

    const syncFromEditor = () => {
      this.songSelect.value = '';
      this.applyRtttlDefaultsFromText(this.songEditor.innerText);
      this.updateHash();
    };

    const syncFromDefaults = () => {
      this.songSelect.value = '';
      this.updateHash();
    };

    this.songEditor.addEventListener('input', syncFromEditor);
    this.bpmInput.addEventListener('input', syncFromDefaults);
    if (this.defaultDurationInput) {
      this.defaultDurationInput.addEventListener('input', syncFromDefaults);
    }
    if (this.defaultOctaveInput) {
      this.defaultOctaveInput.addEventListener('input', syncFromDefaults);
    }

    this.songEditor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData('text/plain');
      
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      selection.deleteFromDocument();
      selection.getRangeAt(0).insertNode(document.createTextNode(text));
      
      syncFromEditor();
    });

    this.playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.togglePlayback();
    });

    this.songSelect.addEventListener('change', () => {
      const idx = Number(this.songSelect.value);
      if (!Number.isInteger(idx) || !this.songs[idx]) return;
      if (this.playing) {
        this.togglePlayback();
      }
      this.applySong(this.songs[idx]);
    });

    // Modal events
    this.helpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.helpModal.classList.remove('hidden');
    });

    this.closeHelpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.helpModal.classList.add('hidden');
    });

    // Close on click outside
    this.helpModal.addEventListener('click', (e) => {
      if (e.target === this.helpModal) {
        this.helpModal.classList.add('hidden');
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.helpModal.classList.contains('hidden')) {
        this.helpModal.classList.add('hidden');
      }
    });

    // Code snippet click events
    document.querySelectorAll('.code-snippet.clickable').forEach(snippet => {
      snippet.addEventListener('click', () => {
        const song = snippet.getAttribute('data-song');
        const bpm = snippet.getAttribute('data-bpm');
        
        if (song) {
          this.songEditor.innerText = song;
        }
        if (bpm) {
          this.bpmInput.value = bpm;
        }
        
        this.applyRtttlDefaultsFromText(this.songEditor.innerText);
        this.updateHash();
        this.setSelectToSong();
        this.helpModal.classList.add('hidden');
      });
    });
  }

  clamp(value, min, max) {
    const num = Number(value);
    if (Number.isNaN(num)) return min;
    if (num < min) return min;
    if (num > max) return max;
    return num;
  }

  clearHighlight() {
    const active = this.songEditor.querySelector('.note-active');
    if (active) {
      active.classList.remove('note-active');
    }
  }

  getDefaultDuration() {
    if (!this.defaultDurationInput) {
      return DEFAULT_DURATION;
    }
    return normalizeDuration(this.defaultDurationInput.value, DEFAULT_DURATION);
  }

  getDefaultOctave() {
    if (!this.defaultOctaveInput) {
      return DEFAULT_OCTAVE;
    }
    return normalizeOctave(this.defaultOctaveInput.value, DEFAULT_OCTAVE);
  }

  applyRtttlDefaultsFromText(text) {
    const parsed = parseRtttlInput(text);
    if (!parsed) return false;
    const defaults = parsed.defaults || {};
    if (defaults.d != null && this.defaultDurationInput) {
      this.defaultDurationInput.value = String(normalizeDuration(defaults.d, DEFAULT_DURATION));
    }
    if (defaults.o != null && this.defaultOctaveInput) {
      this.defaultOctaveInput.value = String(normalizeOctave(defaults.o, DEFAULT_OCTAVE));
    }
    if (defaults.b != null) {
      this.bpmInput.value = String(this.clamp(defaults.b, 40, 400));
    }
    return true;
  }

  parseSongInput(text) {
    const currentDefaults = {
      d: this.getDefaultDuration(),
      o: this.getDefaultOctave(),
    };
    const rtttl = parseRtttlInput(text);
    if (rtttl) {
      const duration = currentDefaults.d;
      const octave = currentDefaults.o;
      const bpm = this.clamp(this.bpmInput.value, 40, 400);
      return {
        tokens: normalizeRtttlNotes(rtttl.notes, { d: duration, o: octave }),
        bpm,
        defaults: { d: duration, o: octave },
        type: 'rtttl',
        name: rtttl.name,
      };
    }

    return {
      tokens: normalizeComposerTokens(text, currentDefaults),
      bpm: this.clamp(this.bpmInput.value, 40, 400),
      defaults: currentDefaults,
      type: 'composer',
    };
  }

  updateHash() {
    location.hash = btoa(JSON.stringify({
      bpm: this.bpmInput.value,
      d: this.getDefaultDuration(),
      o: this.getDefaultOctave(),
      song: this.songEditor.innerText
    }));
  }

  setReady(ready) {
    this.playBtn.disabled = !ready;
    this.playBtn.textContent = ready ? 'PLAY' : 'LOADING...';
    if (ready) {
        this.playBtn.removeAttribute('aria-disabled');
    } else {
        this.playBtn.setAttribute('aria-disabled', 'true');
    }
  }

  setSelectToSong() {
    const current = this.songEditor.innerText;
    const idx = this.songs.findIndex(entry => entry.song === current);
    this.songSelect.value = idx >= 0 ? String(idx) : '';
  }

  applySong(entry) {
    if (!entry) return;
    this.playbackSession += 1;
    this.clearHighlight();
    this.bpmInput.value = entry.bpm;
    if (this.defaultDurationInput) {
      this.defaultDurationInput.value = String(DEFAULT_DURATION);
    }
    if (this.defaultOctaveInput) {
      this.defaultOctaveInput.value = String(DEFAULT_OCTAVE);
    }
    this.songEditor.innerText = entry.song;
    this.updateHash();
  }

  handleHash() {
    try {
      const data = JSON.parse(atob(location.hash.slice(1)));
      this.bpmInput.value = data.bpm ?? String(DEFAULT_BPM);
      if (this.defaultDurationInput) {
        this.defaultDurationInput.value = data.d ?? String(DEFAULT_DURATION);
      }
      if (this.defaultOctaveInput) {
        this.defaultOctaveInput.value = data.o ?? String(DEFAULT_OCTAVE);
      }
      this.songEditor.innerText = data.song ?? this.defaultSong;
      this.applyRtttlDefaultsFromText(this.songEditor.innerText);
    } catch (ignored) {
      this.bpmInput.value = String(DEFAULT_BPM);
      if (this.defaultDurationInput) {
        this.defaultDurationInput.value = String(DEFAULT_DURATION);
      }
      if (this.defaultOctaveInput) {
        this.defaultOctaveInput.value = String(DEFAULT_OCTAVE);
      }
      this.songEditor.innerText = this.defaultSong;
    }
  }

  togglePlayback() {
    if (!this.player) return;

    if (this.playing) {
      this.player.stop();
      this.playing = false;
      this.playbackSession += 1;
      this.playBtn.textContent = 'PLAY';
      this.songEditor.contentEditable = 'true';
      
      // Restore clean text
      const cleanText = this.playbackRestoreText ?? this.songEditor.innerText;
      this.playbackRestoreText = null;
      this.clearHighlight();
      this.songEditor.innerHTML = '';
      this.songEditor.innerText = cleanText;
      return;
    }

    this.playing = true;
    this.playbackSession += 1;
    const sessionId = this.playbackSession;
    this.playBtn.textContent = 'STOP';
    this.songEditor.contentEditable = 'false';

    // Prepare spans for highlighting
    const originalText = this.songEditor.innerText;
    const parsed = this.parseSongInput(originalText);
    const tokens = parsed.tokens;
    if (!tokens.length) {
      this.playing = false;
      this.playBtn.textContent = 'PLAY';
      this.songEditor.contentEditable = 'true';
      alert('No valid notes found.');
      return;
    }

    if (parsed.type === 'rtttl') {
      this.bpmInput.value = String(parsed.bpm);
      if (this.defaultDurationInput) {
        this.defaultDurationInput.value = String(parsed.defaults.d);
      }
      if (this.defaultOctaveInput) {
        this.defaultOctaveInput.value = String(parsed.defaults.o);
      }
      this.updateHash();
    }

    const playbackText = tokens.join(' ');
    this.playbackRestoreText = originalText;

    this.songEditor.innerHTML = '';
    let noteIndex = 0;
    
    tokens.forEach((token, index) => {
      if (index > 0) {
        this.songEditor.appendChild(document.createTextNode(' '));
      }
      const span = document.createElement('span');
      span.textContent = token;
      span.id = `note-${noteIndex}`;
      this.songEditor.appendChild(span);
      noteIndex++;
    });
    
    try {
      this.player.play(playbackText, parsed.bpm, (index) => {
         if (!this.playing || this.playbackSession !== sessionId) {
           return;
         }
         // Player emits note events at tone start indices.
         const tokenIndex = Math.floor(index / 2);
         // Remove previous highlights
         const active = this.songEditor.querySelector('.note-active');
         if (active) active.classList.remove('note-active');
         
         // Highlight current
         const current = document.getElementById(`note-${tokenIndex}`);
         if (current) {
           current.classList.add('note-active');
           // Basic scroll into view
           if (current.offsetTop > this.songEditor.scrollTop + this.songEditor.clientHeight - 40 ||
               current.offsetTop < this.songEditor.scrollTop) {
             current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
           }
         }
      });
    } catch (err) {
      this.playing = false;
      this.playBtn.textContent = 'PLAY';
      this.songEditor.contentEditable = 'true';
      this.songEditor.innerText = originalText;
      this.playbackRestoreText = null;
      console.error(err);
      alert('Error playing song: ' + err.message);
    }
  }

  async loadSongs() {
    this.songSelect.innerHTML = '<option value="">Custom</option>';
    this.songSelect.disabled = true;

    try {
      const response = await fetch('assets/rtttl-songs.json');
      const data = await response.json();
      this.songs = Array.isArray(data) ? data : [];
      
      const fragment = document.createDocumentFragment();
      const custom = document.createElement('option');
      custom.value = '';
      custom.textContent = 'Custom';
      fragment.append(custom);

      this.songs.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = entry.title || `Song ${index + 1}`;
        fragment.append(option);
      });

      this.songSelect.innerHTML = '';
      this.songSelect.append(fragment);
      this.songSelect.disabled = false;
      this.setSelectToSong();

    } catch (err) {
      console.error(err);
      this.songSelect.disabled = true;
    }
  }

  async initPlayer() {
    this.setReady(false);
    try {
      // Assuming player.wasm is served at the site root
      const instance = await loadWasmPlayer('player.wasm');
      
      this.player = createPlayer(instance.exports, {
        onEnded: () => {
          if (!this.playing) return;
          this.playing = false;
          this.playbackSession += 1;
          this.playBtn.textContent = 'PLAY';
          this.songEditor.contentEditable = 'true';
          const cleanText = this.playbackRestoreText ?? this.songEditor.innerText;
          this.playbackRestoreText = null;
          this.clearHighlight();
          this.songEditor.innerHTML = '';
          this.songEditor.innerText = cleanText;
        },
      });
      this.setReady(true);
    } catch (err) {
      this.playBtn.textContent = 'WASM ERROR';
      console.error(err);
    }
  }
}

function updateVerticalLayout() {
  const container = document.querySelector('.app-container');
  if (!container) return;

  // If the app card is taller than the viewport, don't vertically center;
  // top-align so the user can scroll from the top.
  const rect = container.getBoundingClientRect();
  const paddingSlack = 16; // matches our body padding
  const isOverflowing = rect.height + paddingSlack * 2 > window.innerHeight;
  document.body.classList.toggle('is-overflowing', isOverflowing);
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  new NokiaComposer();
  updateVerticalLayout();

  // Recompute on resize/orientation change.
  window.addEventListener('resize', () => {
    // Avoid thrash when the address bar collapses/expands on mobile.
    window.requestAnimationFrame(updateVerticalLayout);
  });
});
