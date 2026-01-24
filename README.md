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

## RTTTL support
The UI accepts RTTTL strings like `Super Mario:d=4,o=5,b=100:16e6,16e6,32p,8e6,...` and maps the defaults (`d`, `o`, `b`)
to the Nokia Composer format.

## Credits

This is based on [zserge's js code](https://github.com/zserge/nokia-composer),
and [eddmann's js code](https://github.com/eddmann/nokia-composer-web/).
