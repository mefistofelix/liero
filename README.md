# Liero Arena

A browser fork of [gliptic/liero](https://github.com/gliptic/liero): original game
simulation, full-page mouse controls, configurable keys, regional peer-to-peer
rooms, spectators, custom maps and local MP4 recordings.

```sh
bun run dev
```

Windows with Bun in the root: `./bun.exe run dev`.
Direct startup with `bun run src/main.ts` remains supported.
Open http://localhost:3000/. No package installation or Node.js app runtime.

See [run, controls and build instructions](README-browser.md),
[current limitations](docs/stack.md), and [porting details](docs/PORTING.md).

Local preview: two players plus spectators. Hosting and internet NAT/TURN
validation are still pending. Preserve the original source and asset notices.
