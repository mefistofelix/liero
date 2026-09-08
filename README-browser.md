# Liero Arena

Browser fork of [gliptic/liero](https://github.com/gliptic/liero), with the original
C++ simulation compiled to JavaScript and browser I/O adapters.

## Run locally

```sh
bun run src/main.ts
```

On Windows with Bun in the repository root:

```powershell
.\bun.exe run src/main.ts
```

Open http://localhost:3000/. `bun run dev` is the package task alias. No dependency installation,
Node.js application runtime, or separate development server is needed.
Bun 1.4.2 is the locally tested version. The generated engine and game data are
included; a compiler is only needed when changing C++.

## Play

- A/D move; W jumps or shortens an attached rope; S extends an attached rope.
- Space jumps/releases the rope. Mouse aims, left click fires, contextual right
  click digs if dirt is immediately ahead, otherwise throws/releases rope.
- Mouse wheel changes weapon. Settings supports rebinding keyboard controls.
- One full-page camera by default. Play → Local two-player keeps original split
  screen, with either shared keyboard or mouse + second keyboard player.
- Rooms supports regional quick match, public/private rooms, invite links, chat,
  measured peer RTT, two player slots and up to 14 spectators.
- Startup automatically joins the nearest reachable public room, or creates one.
- All members enter as spectators, including the host. Play claims a player seat.
- Spectate cycles players/freecam; drag right mouse to pan. Leaving a player seat
  asks for confirmation and ends that two-player round.
- Weapons uses original projectile artwork. Maps has previews, selectable
  rotation, drag/drop LEV/Powerlevel and common image imports.
- Profile, worm color, loadouts, room preferences and key bindings persist locally.
- Recordings stores MP4 video/audio in the browser, with playback and downloads
  when the browser supports MP4 recording. The install manifest supports a
  standalone app; assets already cached can support offline local play.

## Checks

```sh
bun run test
```

The optional JS/WASM comparison runs when a comparison build exists.

## Rebuild the engine

The bundled engine runs without a compiler. To rebuild changed C++:

```sh
bun run engine
bun run engine:wasm
```

These Bun tasks discover Emscripten (tested 6.0.9), its Python/Clang toolchain,
CMake and Ninja. Override with EMSDK, EMSDK_PYTHON, CMAKE and NINJA when needed.
Outputs stay under .local/build. No PowerShell wrappers are used.
The compiler uses its own Python/Node tooling, separate from the Bun application.

Asset tasks: `bun run assets:font`, `bun run assets:icons`, `bun run assets:maps`.
The maps task uses a local clone of the attributed source collection; runtime
serves all 897 levels and thumbnails locally, without third-party downloads.

See [stack and current limitations](docs/stack.md),
[porting decisions](docs/PORTING.md), [map provenance](docs/MAPS.md), and
[original native build instructions](docs/NATIVE.md).
