# Nokia Composer
Tiny Nokia-style ringtone composer.

## WASM player
Build the standalone player module:

```sh
odin build . -target:js_wasm32 -out:player.wasm
```

Minimal usage (UI not included):

```js
import {loadWasmPlayer, createPlayer} from './js/player.js';

const wasm = await loadWasmPlayer('player.wasm');
const player = createPlayer(wasm.exports);

player.play('16e2 16d2 8#f 8#g 16#c2 16b 8d 8e 16b 16a 8#c 8e 2a 2-', 120);
```

## Credits

This is based on [zserge's js code](https://github.com/zserge/nokia-composer).
