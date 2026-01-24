import { loadWasmPlayer, createPlayer } from './player.js';

class NokiaComposer {
  constructor() {
    this.bpmInput = document.getElementById('bpm');
    this.songEditor = document.getElementById('song');
    this.playBtn = document.getElementById('play-btn');
    this.songSelect = document.getElementById('song-select');
    this.helpBtn = document.getElementById('help-btn');
    this.closeHelpBtn = document.getElementById('close-help-btn');
    this.helpModal = document.getElementById('help-modal');
    
    this.player = null;
    this.playing = false;
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

    const updateHandler = () => {
      this.songSelect.value = '';
      this.updateHash();
    };

    this.songEditor.addEventListener('input', updateHandler);
    this.bpmInput.addEventListener('input', updateHandler);

    this.playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.togglePlayback();
    });

    this.songSelect.addEventListener('change', () => {
      const idx = Number(this.songSelect.value);
      if (!Number.isInteger(idx) || !this.songs[idx]) return;
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

  updateHash() {
    location.hash = btoa(JSON.stringify({
      bpm: this.bpmInput.value,
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
    this.bpmInput.value = entry.bpm;
    this.songEditor.innerText = entry.song;
    this.updateHash();
  }

  handleHash() {
    try {
      const data = JSON.parse(atob(location.hash.slice(1)));
      this.bpmInput.value = data.bpm;
      this.songEditor.innerText = data.song;
    } catch (ignored) {
      this.bpmInput.value = '120';
      this.songEditor.innerText = this.defaultSong;
    }
  }

  togglePlayback() {
    if (!this.player) return;

    if (this.playing) {
      this.player.stop();
      this.playing = false;
      this.playBtn.textContent = 'PLAY';
      return;
    }

    this.playing = true;
    this.playBtn.textContent = 'STOP';
    
    try {
      this.player.play(this.songEditor.innerText, this.clamp(this.bpmInput.value, 40, 400));
    } catch (err) {
      this.playing = false;
      this.playBtn.textContent = 'PLAY';
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
          this.playBtn.textContent = 'PLAY';
        },
      });
      this.setReady(true);
    } catch (err) {
      this.playBtn.textContent = 'WASM ERROR';
      console.error(err);
    }
  }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  new NokiaComposer();
});
