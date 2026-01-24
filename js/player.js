const defaultContextFactory = () =>
  new (window.AudioContext || window.webkitAudioContext)();

async function instantiateWasm(url, imports) {
  const response = await fetch(url);
  if (WebAssembly.instantiateStreaming) {
    const clone = response.clone();
    try {
      const {instance} = await WebAssembly.instantiateStreaming(response, imports);
      return instance;
    } catch (err) {
      const bytes = await clone.arrayBuffer();
      const {instance} = await WebAssembly.instantiate(bytes, imports);
      return instance;
    }
  }
  const bytes = await response.arrayBuffer();
  const {instance} = await WebAssembly.instantiate(bytes, imports);
  return instance;
}

export async function loadWasmPlayer(url, imports = {}) {
  const odinEnv = {
    memory: null,
    write(fd, ptr, len) {
      if (!odinEnv.memory) {
        return 0;
      }
      const bytes = new Uint8Array(odinEnv.memory.buffer, ptr, len);
      let text = '';
      for (let i = 0; i < bytes.length; i += 1) {
        text += String.fromCharCode(bytes[i]);
      }
      if (fd === 2) {
        console.error(text);
      } else {
        console.log(text);
      }
      return len;
    },
    rand_bytes(ptr, len) {
      if (!odinEnv.memory) {
        return 0;
      }
      const bytes = new Uint8Array(odinEnv.memory.buffer, ptr, len);
      if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = (Math.random() * 256) | 0;
        }
      }
      return len;
    },
    pow(base, exp) {
      return Math.pow(base, exp);
    },
  };

  const mergedImports = {...imports};
  if (!mergedImports.env) {
    mergedImports.env = {};
  }
  mergedImports.odin_env = {...odinEnv, ...(mergedImports.odin_env || {})};

  const instance = await instantiateWasm(url, mergedImports);
  if (instance.exports && instance.exports.memory) {
    mergedImports.odin_env.memory = instance.exports.memory;
  }
  return instance;
}

export function createPlayer(exports, options = {}) {
  if (!exports || !exports.memory) {
    throw new Error('WASM exports must include memory.');
  }

  const encoder = new TextEncoder();
  const memory = exports.memory;
  const inputPtr = exports.input_ptr();
  const inputCap = exports.input_capacity();
  const eventsPtr = exports.events_ptr();
  const eventsCap = exports.events_capacity();
  const createContext = options.createContext || defaultContextFactory;
  const onEnded = options.onEnded;

  let ctx = null;
  let osc = null;
  let gain = null;
  let rafId = null;

  function closeContext() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (!ctx) {
      return;
    }
    try {
      ctx.close();
    } catch (ignored) {
      // Ignore if context is already closed.
    }
    ctx = null;
    osc = null;
    gain = null;
  }

  function stop() {
    if (!ctx) {
      return;
    }
    try {
      osc.stop();
    } catch (ignored) {
      // Ignore if oscillator already stopped.
    }
    closeContext();
  }

  function parse(song, bpm) {
    const text = song == null ? '' : String(song);
    const bytes = encoder.encode(text);
    if (bytes.length > inputCap) {
      throw new Error(`Song exceeds input buffer (${bytes.length} > ${inputCap}).`);
    }

    new Uint8Array(memory.buffer, inputPtr, bytes.length).set(bytes);

    const count = exports.parse(bpm | 0, bytes.length | 0);
    if (count < 0) {
      throw new Error(`WASM parse failed (${count}).`);
    }
    if (count > eventsCap) {
      throw new Error(`WASM returned too many events (${count} > ${eventsCap}).`);
    }

    const events = new Float32Array(memory.buffer, eventsPtr, count * 3);
    return {count, events};
  }

  function play(song, bpm, onNote) {
    stop();

    ctx = createContext();
    osc = ctx.createOscillator();
    gain = ctx.createGain();
    osc.type = 'square';
    osc.connect(gain).connect(ctx.destination);
    osc.start();

    const localOsc = osc;
    osc.onended = () => {
      if (osc !== localOsc) {
        return;
      }
      closeContext();
      if (typeof onEnded === 'function') {
        onEnded();
      }
    };

    const {count, events} = parse(song, bpm);
    const eventTimes = new Float32Array(count);
    let t = ctx.currentTime;
    const startT = t;

    for (let i = 0; i < count; i += 1) {
      const idx = i * 3;
      const freq = events[idx];
      const level = events[idx + 1];
      const duration = events[idx + 2];
      
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(level, t);

      eventTimes[i] = t;
      t += duration;
    }

    gain.gain.setValueAtTime(0, t);
    osc.stop(t);

    if (typeof onNote === 'function') {
      let nextEvent = 0;
      const localCtx = ctx;
      const tick = () => {
        if (ctx !== localCtx) {
          return;
        }
        const now = localCtx.currentTime;
        while (nextEvent < count && eventTimes[nextEvent] <= now) {
          if ((nextEvent & 1) === 0) {
            onNote(nextEvent);
          }
          nextEvent += 1;
        }
        if (nextEvent < count) {
          rafId = requestAnimationFrame(tick);
        }
      };
      rafId = requestAnimationFrame(tick);
    }
  }

  return {play, stop, parse};
}
