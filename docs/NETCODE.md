# Netcode architecture and measurements

Protocol 6, implemented 2026-09-09. The earlier audit used protocol 5 at
`985cded9f3af495bf4e41e1cf121bbe8d02967f9`. Its measurements are retained below.
The alpha does not support older clients: everyone must reload after this update.

## Current implementation

The host orders changes of player input and advances the original C++ simulation
at 70 Hz without waiting for an unchanged input packet from every occupied seat.
Each guest keeps a confirmed world and a bounded predicted view. Joining and
resynchronizing use the current world, including destroyed terrain and active
objects. D1 carries directory, membership, chat and signaling; game data stays
on WebRTC between browsers. There is no dedicated simulation server.

This follows the architecture observed in WebLiero, not a translation of its
proprietary engine. No `src/game` physics source changed for protocol 6.

### Input and ordering

`src/browser/netgame.ts` sends `[buttons, angle, wheel]` only when the held mask
or original 7-bit aim direction changes, or a wheel/suicide pulse occurs.
A fixed held command costs no repeated input packets. Mouse coordinates, worm
positions, velocities, shots and impacts are not streamed. Holding fire already
determines shots through the native weapon, ammunition, reload and RNG state.
Aim changes still matter while firing or steering guided weapons.

The contextual right-click adapter decides digging or rope from the terrain.
Press/release edges, simultaneous mouse buttons, shortening/extension and wheel
pulses remain distinct. Wheel and suicide are consumed once, not held during
prediction. Menu opening and focus loss release held input.

Each player proposes a tick and monotonically increasing sequence. The host
validates membership/seat, round identity, ranges and sequence, reorders reliable
messages, then assigns its global event serial. Late input starts at the next
uncommitted host tick; future input is bounded to 120 ticks. Consecutive events
for a seat get distinct ticks, preserving rapid scrolls and button edges. The
host never rolls its own timeline backward to accept a late command.
Rules/loadout changes use the same authoritative event ordering.

### Confirmation and prediction

- Input delay: 2 ticks (about 29 ms).
- Progress: every 7 ticks (10 Hz), containing confirmed tick and event serial.
- Canonical checkpoint hash: every 70 ticks (1 Hz), plus final progress.
- Predicted view: at most 14 ticks (200 ms) beyond the confirmed baseline.
- Catch-up per confirmation: at most 140 ticks; a larger gap requests a checkpoint.
- Pending event/reordering limits: 2,048 entries, with tighter per-seat sequence
  and future-tick bounds. Round duration remains capped at 252,000 ticks (one hour).

A progress message is usable only after all referenced action serials have
arrived. Clients restore the confirmed baseline, apply the newly confirmed
interval, check its hash when present, and save that baseline. They then replay
the bounded prediction using known authoritative actions, held remote inputs
and their own unacknowledged actions. Prediction advances incrementally between
confirmations; an authoritative event that changes an already predicted interval
also rebuilds that view. This is a confirmed-world/predicted-world design,
rather than a checkpoint for every elapsed tick or independent entity correction.

A worm is not an independent rollback unit. In `src/game/ninjarope.cpp`, a rope
attached to another worm changes both worms' velocities. Explosions, terrain and
shared RNG introduce additional dependencies. Restoring only a remote position
would corrupt the original behavior. Restore the coupled world for the bounded
interval; do not alter collision positions to smooth a correction.

Audio runs only during confirmed simulation. Speculative stepping uses
`NullSoundPlayer`; kill/death telemetry also remains confirmed, so replay does
not repeat sounds or feed entries. This trades some audible delay for correct
one-shot effects. No visual interpolation of corrections is implemented.

The save/restore/replay requirements are consistent with
[GGPO](https://www.ggpo.net/) and the prediction, input-delay and CPU tradeoffs
described by [SnapNet](https://snapnet.dev/blog/netcode-architectures-part-2-rollback/).
See also [Deterministic Lockstep](https://gafferongames.com/post/deterministic_lockstep/)
for tick-indexed input and reducing redundant transmissions.

### Complete current-world checkpoint

`src/web/netstate.hpp`, included by the browser bridge, serializes explicit
little-endian fields without raw pointers or struct padding:

- Exact current indexed terrain, materials, palette and dimensions.
- Both worms, positions/velocities, respawn and weapon timers, ammunition,
  control edges, aim, rope position/velocity/length and anchor worm index.
- Active weapon, particle, explosion and bonus object lists, including slot
  occupancy and allocation/iteration order. Owner/weapon references are remapped.
- Simulation RNGs, canonical viewports and their RNGs, mode state, settings,
  input-adapter edges and confirmed death telemetry.

Names, colors and the user's presentation camera stay local. Online play has no
AI; the adapter skips the original stats recorder's unbounded heatmaps/history
while retaining the counters needed by the interface. Inactive uninitialized
startup storage is canonicalized, never included as random padding in a hash.

The original replay archive omits live object lists and other required fields;
`Game::postClone` also leaves shared references. Neither is reused as a complete
checkpoint. A malformed incoming checkpoint is bounded and rejected, restoring
the prior world atomically. The canonical hash covers these serialized fields,
not raw engine memory; it is a consistency check, not an anti-cheat proof.

A join receives the compressed original map (retained for round restarts/host
succession), then a compressed current-world checkpoint and pending future
actions. Actions arriving during transfer are buffered and merged by serial.
There is no replay from the beginning of the match. Checkpoints are bounded to
2 MiB before decompression and after inflation; map inputs remain bounded to
1 MiB. Native `CompressionStream('deflate')` and `DecompressionStream` require
no extra compression dependency. Transfers use binary chunks of at most 8 KiB.

A confirmed-state mismatch requests a new host checkpoint, with per-peer rate
limiting, incomplete-transfer timeout and a six-attempt recovery limit.
Successful recovery clears the failure count. The retry limit produces a visible
rejoin message if recovery cannot complete; it does not loop without a bound.

### WebRTC transport

`src/browser/rooms.ts` negotiates three channels on both peers:

| ID | Data | Delivery |
| --- | --- | --- |
| 0 | Setup, maps, checkpoints, chat, final progress | Reliable ordered |
| 1 | Player proposals and host-assigned actions/configuration | Reliable unordered |
| 2 | Supersedable tick/event-count progress | Unreliable unordered, maxRetransmits 0 |

Actions have explicit sequence ordering; releases and wheel pulses retain WebRTC
reliability. Ordinary progress can be dropped/replaced because later progress
supersedes it. Round-ending progress uses the reliable channel.

`net-packets.ts` encodes input proposals in 28 bytes, host input events in
33 bytes and progress in 30 bytes, including the round UUID and sequencing.
Map/checkpoint chunks have a 25-byte header. Infrequent configuration/metadata
uses bounded JSON. There is no protocol-5 fallback or legacy history transfer.

All channels share SCTP congestion control. The sender prioritizes actions and
progress, checks `bufferedAmount`, limits bulk work per flush and caps queued
data at 8 MiB. It does not imply independent bandwidth for each channel.
See the [WebRTC specification](https://www.w3.org/TR/webrtc/) and
[RTCDataChannel buffering](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount).

## Protocol-6 measurements

Run `bun run netcode:audit` (or `.\\bun.exe run netcode:audit` on Windows).
It runs the actual compiled JS engine, `NetworkRound`, binary codec and native
compression for 2,100 wall ticks (30 seconds). The movement scenarios alternate
horizontal direction with fixed aim and no firing. The combat scenario changes
aim every tick while holding fire, using rope/W and periodically scrolling.

| Synthetic scenario | Host ticks | Guest confirmed / predicted | Host bytes/s per guest | Guest bytes/s | Join checkpoint bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| No added delay | 2,100 | 2,093 / 2,100 | 379 | 39 | 62,027 |
| 86 ms RTT | 2,100 | 2,093 / 2,101 | 379 | 39 | 62,028 |
| 200 ms RTT | 2,100 | 2,093 / 2,101 | 379 | 39 | 62,028 |
| 400 ms RTT | 2,100 | 2,086 / 2,094 | 379 | 39 | 62,027 |
| 86 ms + 143 ms action delay | 2,100 | 2,093 / 2,101 | 379 | 39 | 62,028 |
| 200 ms + continuous aim/fire/rope | 2,100 | 2,093 / 2,101 | 4,912 | 1,960 | 68,315 |

All scenarios completed without resyncs or reported errors. Movement-only guests
send 42 packets for 42 changes, versus 2,099 packets in the earlier baseline.
Continuously changing aim correctly still sends 70 input proposals per second.
The displayed prediction can lead or lag the host; it is not a confirmed result.

On this Windows/Bun run, guest advance p99 was 0.76–0.82 ms for movement and
2.21 ms for combat (maximum 3.80 ms). These numbers include replay/checkpoint
work, but not rendering. The 200 ms combat scenario executed 23,024 predicted
ticks, including 20,923 replayed ticks: prediction is bounded, not free.

Payload measurements include our binary framing and, in the join column,
compressed checkpoint metadata/chunks. They exclude SCTP/DTLS/IP overhead, D1,
original map transfer, fan-out to other viewers and real congestion control.
No-added-delay messages arrive no earlier than the next diagnostic iteration.
These are synthetic measurements, not an internet or browser/device guarantee.
A complete checkpoint may be larger than the old history of a very short round;
its size and recovery work do not grow with the elapsed round duration.

## Validation and remaining limits

`bun run test`: 67 passing tests on this revision, including:

- 1,400 native ticks with repeated complete restore between fresh engines,
  live rules/loadouts, active objects and exact subsequent byte equality.
- A rope anchored to the other worm, followed by pulling, release, rethrow and death.
- Checkpoint exchange between compiled JS and WASM with continuing simulation.
- Delayed, reordered and duplicated actions, dropped progress, one-shot inputs,
  spectator hosts and a temporarily stalled guest.
- Mid-round snapshot joins, confirmed-hash comparison, deliberately injected
  divergence and automatic checkpoint recovery.
- Negotiated channel configuration, binary encoding, queue priority/backpressure,
  progress supersession, reliable final progress and idempotent connection close.

Real browser checks on the public deployment of `93e7cd9` used a private room,
two playing tabs and a spectator, with actual WebRTC connections. Shots in both
directions produced matching health bars; a lethal Gauss Gun hit produced the
same kill/death counts and weapon attribution, followed by respawn at full health.
A rope attached to the other worm pulled both worms together in both views.
Right-click digging and a Chiquita Bomb changed the terrain identically for the
connected viewer. A reloaded spectator received the dug opening; a fresh tab
joining after the explosion received the existing crater and current health/K/D.
No player seat changed during those terrain-join checks, so the round did not
restart. Guest reload/re-entry and a spectator host were also exercised.
See [VALIDATION.md](VALIDATION.md) for the procedure and observed values.

These browser checks compare rendered gameplay and DOM health/reload/score
indicators, not hidden engine state. They ran in the same desktop browser on one
machine, without network impairment, and logged no console errors or warnings.
They establish real multi-tab WebRTC behavior, not cross-device/WAN reliability.
The automated transport tests still use a fake RTCPeerConnection; the separate
simulation/serialization tests use real compiled engines and exact state equality.

The host must remain active; browser background throttling still applies.
No TURN, headless host, cheat-resistant server or visual correction smoothing
is included. Host succession preserves the room but restarts the current level.
High latency can exceed the prediction window and cause waiting or corrections.
These tests do not establish exhaustive original-game parity.

## What is verifiable in WebLiero

Reference: [public v20 bundle](https://www.webliero.com/v/20/game-min.js), retrieved
2026-09-09, 237,247 bytes, SHA-256
`b3c7b33c36510d7ede42f93911a26600a9a5b252ee8670afe384d18017f9a06c`.
Symbols below identify this build; minified names are not a stable API.

| Observation | Trace in bundle |
| --- | --- |
| Input mask sent only when changed; separate weapon and rope/jump actions | `Kc.ea`, `Kc.Jh`, `Kc.ti` |
| Host assigns action ticks/order and bounds incoming action times | `Ec.ua`, `Ec.it` |
| Confirmed state plus a cloned, resimulated predicted view | `Ya.jk`, `fc.On`, `sa.ik` |
| Compressed current-state join, followed by pending actions | `Ec.Lt`, `Ya.$s` |
| Join includes current terrain pixels and dynamic world objects | `sa.Ud`, `Pa.D`, `Z.D` |
| Binary reliable ordered, reliable unordered and unreliable unordered channels | `Dc.channels`, `cr` |
| Tick/event-count progress messages, plus periodic checksums | `Ec.Uk`, `Ec.Kt` |

This supports event-driven host authority with client prediction. It does **not**
establish automatic per-entity repair on checksum mismatch. Terrain prediction
copies its pixel buffer (`Z.Of`). Keep our original 70 Hz; do not copy its 60 Hz.
The proprietary bundle remains an external research reference, not vendored code.

## Previous protocol-5 baseline

Captured at commit `581660f`; that revision of `bun run netcode:audit` runs the actual compiled JS engine and `NetworkRound`, with two
players and synthetic ordered delivery for 2,100 wall ticks (30 seconds). Players
alternate horizontal movement, with fixed aim and no firing. It counts UTF-8 JSON
payload bytes before transport.

| Simulated RTT / interruption | Host ticks | Guest ticks | Host stalled attempts | Host bytes/s per guest | Guest bytes/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| No added delay | 2,100 | 2,099 | 0 | 7,042 | 6,471 |
| 86 ms | 2,100 | 2,097 | 0 | 7,042 | 6,464 |
| 200 ms | 980 | 980 | 1,120 | 3,267 | 3,002 |
| 400 ms | 510 | 504 | 1,590 | 1,699 | 1,545 |
| 86 ms + 143 ms delivery stalls | 1,950 | 1,947 | 150 | 6,536 | 5,999 |

Lower traffic in the last rows results from stalled simulation, not better
compression. The no-added-delay guest sends 2,099 packets for just 42 input
changes. This measures redundant sampling, not a promised 98% reduction in total
network traffic: sequence/progress messages and transport overhead remain.
In that case, history alone reaches 39,649 JSON bytes
after 30 seconds, excluding setup/map bytes. A classic map has 176,400 indexed
pixels before palette/metadata; base64 adds another third to those bytes.

This is a diagnostic, **not an internet benchmark**. It permits at most one
advance per peer per wall tick, delivers packets no earlier than the next loop,
and introduces a delivery interruption every 140 ticks in the last scenario.
It does not model the browser render loop's catch-up, WebRTC congestion control,
packet loss/retransmission overhead, encryption, D1 traffic or CPU contention.
Real latency/bandwidth claims require browser measurements under controlled
network impairment. No hash errors occurred in these runs, subject to the hash's
coverage limits above.
