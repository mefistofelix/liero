# Liero

The original Liero game in a browser, with mouse controls, ping-based matchmaking,
WebRTC rooms and spectators. Built from [gliptic/liero](https://github.com/gliptic/liero):
the C++ simulation runs as compiled JavaScript, with adapters for browser graphics,
audio and input.

## Play

[Open the hosted game](https://liero.haxthepax.chatgpt.site/).
The hosted game is public.

The game joins the reachable public room with the lowest measured ping.
If no room is reachable, it creates one. Everyone enters as a spectator; select
**Join game** to play. Rooms support up to 16 people, including spectators, with
up to two active players to preserve the original engine. You can start alone and
play while waiting, with no inactive opponent or match completion. When a second
player joins, a synchronized round starts on the same map using the room rules.

- **Rooms:** sort by people, ping or name; filter empty/full rooms; create public/private rooms, copy invite links and chat.
- **Spectating:** follow either player or drag with the right mouse button in free camera.
- **Room settings:** choose rules, permitted weapons and map rotation. Hosts can use **Play now** in Maps to restart on a selected level for everyone.
- **Maps:** 897 bundled levels with previews, plus drag-and-drop LEV, Powerlevel
  and common image imports. Levels are served from our hosting, not third parties.
- **Profile:** save your name, worm color, five-weapon loadout and key bindings locally.
- **Local play:** practice against the bot or use the original split screen on one keyboard.
- **Recordings:** capture gameplay or live spectating, then replay/download MP4
  from the local archive where the browser supports MP4 encoding.
- **Install:** use the browser's install option; previously cached assets support local offline play.

## Controls

| Input | Action |
| --- | --- |
| A / D | Move left / right |
| W | Jump; shorten the rope when attached |
| S | Down / extend the attached rope |
| Mouse | Aim |
| Left click | Fire, including while using right click or the wheel |
| Right click | Dig when dirt is immediately ahead; otherwise throw/release rope |
| Mouse wheel | Change weapon |
| Space / middle click | Jump / release rope |
| T | Open room chat |
| Tab | Leaderboard |
| Escape | Open/close menus |

Keyboard bindings can be changed in your profile. Names have health and reload
bars; your weapon name appears briefly when changing weapons. Respawning preserves
weapon ammunition and reload state, as in the original engine.

## Run locally

Install Bun, then run from the repository root:

```sh
bun run dev
```

On Windows, a Bun executable placed in the root also works:

```text
.\bun.exe run src/main.ts
```

Open [127.0.0.1:3000](http://127.0.0.1:3000/). Direct startup with
`bun run src/main.ts` is supported. No package installation or Node.js application
runtime is needed. Bun 1.4.2 is the tested version; the compiled engine and assets
are included, so running the game does not require a compiler.

## Architecture

| Component | Location / runtime |
| --- | --- |
| Original engine | C++ under `src/game`, `src/gvl`, `src/tl` |
| Browser adapters | `src/web/bridge.cpp` and `src/browser` |
| Local app | `src/main.ts`, Bun HTTP and SQLite |
| Production APIs | `src/server/hosting.ts`, Cloudflare Worker and D1 |
| Gameplay transport | Browser-to-browser WebRTC |
| Tasks and tests | `src/tasks` and `src/tests` |

D1 stores the room directory, membership, chat and WebRTC signaling. Simulation
and per-frame inputs stay in the browsers; no dedicated game server is required.
Local SQLite implements the D1 contract for development. Profile preferences,
imported maps and recordings remain on your device.

## Build and verify

```sh
bun run test          # Gameplay, input, room, network, hosting and map checks
bun run build         # Production Worker, static assets and D1 migrations
bun run engine        # Recompile the original engine to JavaScript
bun run engine:wasm   # Optional WASM comparator for parity tests
```

Recompiling C++ requires Emscripten, Python/Clang, CMake and Ninja. Bun tasks discover
the toolchain under `.tools` or through `EMSDK`, `EMSDK_PYTHON`, `CMAKE` and `NINJA`.
The compiler's own tools are separate from the Bun application runtime. Generated
compiler output goes under `.local/build`; the hosting build goes under `dist`.

Asset tasks: `bun run assets:font`, `bun run assets:icons`, `bun run assets:maps`.

## Current limits

The host must keep its game tab active. Networking uses reliable ordered lockstep;
prediction, rollback, host migration and a TURN relay are not implemented. Some
network combinations may therefore prevent a direct WebRTC connection. Tests cover
determinism and selected original behaviors, not exhaustive 1:1 parity or every
internet network configuration. Clearing browser storage removes local preferences,
imported maps and recordings.

## Source and documentation

Development uses a single `master` branch in [mefistofelix/liero](https://github.com/mefistofelix/liero).

- [Stack and toolchain](docs/stack.md)
- [Porting decisions and fidelity limits](docs/PORTING.md)
- [Validation](docs/VALIDATION.md)
- [Map formats and provenance](docs/MAPS.md)
- [Original native build instructions](docs/NATIVE.md)

Original engine: [gliptic/liero](https://github.com/gliptic/liero).
Map collection: [webliero-maps](https://gitlab.com/webliero/webliero-maps), with
individual provenance retained in [map sources](src/browser/maps/SOURCES.md).
Original source and asset copyright/license notices remain in their respective files.

The favicon is the original icon served by [WebLiero](https://www.webliero.com/favicon.ico), bundled locally. Country flags are from [flag-icons](https://github.com/lipis/flag-icons) under the bundled MIT license.
