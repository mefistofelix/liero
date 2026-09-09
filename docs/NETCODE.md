# Netcode audit and next architecture

Audited 2026-09-09 against `985cded9f3af495bf4e41e1cf121bbe8d02967f9`, protocol 5.
This document records the evaluation and the intended next revision. **Prediction,
rollback, binary event transport and mid-round checkpoints are not implemented.**
The accompanying `bun run netcode:audit` measures the current implementation.

## Current behavior

`src/browser/netgame.ts` sends tick-indexed `[buttons, angle, wheel]` commands.
It already avoids sending mouse coordinates, worm positions, velocities and
projectile states each tick. Both peers run the original engine at 70 Hz.

However, every guest sends a JSON input packet every tick, even when unchanged.
The host waits for each occupied seat's input and broadcasts another JSON packet
for every committed tick. Six ticks of buffering do not provide prediction:
clients wait for host commits before advancing. Higher latency or interrupted
delivery can therefore stall play. A spectator host has the same dependency on
its remote players.

Every 70 ticks, peers compare a hash of terrain and major worm fields. A mismatch
stops the round; it does not trigger automatic repair. This hash omits some object
and RNG state, so matching hashes are not proof of complete state equality.

A late spectator receives the initial seed, exact map bytes, initial rules and
the complete input/rule/loadout history since round start. It then replays that
history. The one-hour round bound limits memory growth but does not make joining
independent of elapsed match time. Host migration restarts the current level.

`src/browser/rooms.ts` uses one reliable, ordered WebRTC data channel for inputs,
commits, chat and bulk setup/history. D1 carries directory, membership and
signaling data; it never carries simulation frames.

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

## Reproducible baseline

Run `bun run netcode:audit` (or `.\bun.exe run netcode:audit` on Windows).
The diagnostic runs the actual compiled JS engine and `NetworkRound`, with two
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

## Decision for the next revision

Use compact changes of player intent, a host-ordered event timeline, a confirmed
simulation state and a bounded predicted view. Preserve the original C++ step,
integer arithmetic, RNG consumption, terrain, collisions, weapons and rope.
The host remains a player's browser; this requires no dedicated simulation server.

### Minimal commands

| Situation | Information that needs to change |
| --- | --- |
| Start/stop left, right, up or down; hold/release fire | New control bit mask |
| Aim enters another original direction | New 7-bit angle, including while firing/steering |
| Contextual right click pressed/released | Input edge and current angle; original adapter decides dig or rope |
| Jump/release rope; shorten/extend rope | Corresponding control transition |
| Scroll/select a weapon | One-shot slot-change action |
| Change loadout or room rules | Validated, host-ordered configuration event |

Holding a command should not resend its unchanged contents every simulation tick.
The receiver keeps the latest held state. Releases must be delivered too, including
focus loss and menu opening. Wheel pulses are one-shot events: two identical
successive scrolls must not collapse into one, and a held prediction must not
repeat a scroll or suicide every tick. Preserve the current button-edge behavior.

Do not send a separate projectile or impact message for every shot. The selected
weapon, ammunition, reload timer and deterministic RNG already tell the engine
what holding fire produces. A weapon ID is unnecessary on every shot once slot
and loadout changes are ordered. Aiming still changes between shots and may
affect guided weapons, so sending the angle only when fire starts is insufficient.

Buttons plus angle currently fit in 16 bits; a wheel pulse needs two more bits.
These are input payload sizes, **not complete packet sizes**. Round identity,
tick, sequence/acknowledgment and transport framing remain necessary. Encode
binary, coalesce commands sampled for the same tick, and bound all ranges/queues.
Do not add an extra debounce delay to input edges just to save bytes.

Send progress/acknowledgment messages at a measured lower rate, even when no
commands change. They establish the confirmed tick and that no preceding event
is missing. Silence alone cannot distinguish held input from packet loss.

### Prediction and reconciliation

The host orders and validates commands and advances its canonical simulation
without waiting for every player to send an unchanged mask. Clients predict their
own new input and retain the last known held remote input. Reconcile when an
authoritative event differs in value, tick or order from the prediction; do not
wait for a periodic hash to discover an already-known input discrepancy.

Map client-proposed ticks into a bounded host window, reject invalid actor/round
identities, and deduplicate by action sequence. A command arriving after its
requested tick takes effect at the next uncommitted host tick; return that actual
tick and order to the sender. The predicted client then reconciles its timing.
Do not retroactively rewrite host history or trust arbitrary future timestamps.

Use the latest confirmed checkpoint preceding the first affected tick, then replay
only the subsequent affected interval. If the predicted event stream matched,
promote it without unnecessary replay. Keep prediction and catch-up work bounded;
measure the engine's worst-case cost before selecting delay/window limits. Beyond
that window, temporarily wait or resynchronize instead of simulating unbounded
speculation. No physics change or lower simulation rate is justified by transport.

**A worm is not an independent rollback unit.** In
`src/game/ninjarope.cpp`, attachment to another worm modifies both the anchor's
and owner's velocity. A late movement/release can change both trajectories,
subsequent hits and terrain destruction. Explosions and shared RNG create further
dependencies. Restore the coupled game state for that short time interval;
restoring only another player's position cannot preserve original behavior.
Render smoothing can be local to a label/camera, but must not alter authoritative
collision positions.

This follows the deterministic save/restore/replay requirements described by
[GGPO](https://www.ggpo.net/) and the prediction, input-delay and CPU-budget
tradeoffs discussed by [SnapNet](https://snapnet.dev/blog/netcode-architectures-part-2-rollback/).
Tick-indexed inputs, acknowledgment and compression of repeated inputs are also
described in [Deterministic Lockstep](https://gafferongames.com/post/deterministic_lockstep/).

### Complete checkpoint adapter

Add a versioned, pointer-free serializer and exact in-memory save/restore at the
browser adapter boundary. A checkpoint must include:

- Current level pixels, materials/palette and dimensions.
- Both worms, all timers, weapon slots/ammunition/reload progress, control edges,
  rope position/velocity/length and its anchor as a stable worm index.
- Active projectiles, fragments, explosions, bonuses and allocation/iteration
  order, with ownership references remapped to restored worm/weapon objects.
- Every simulation RNG, tick counter, mode/score state and synchronized rules.
- Browser input state (`rightMode`, `rightDown`, `digPulse`), pending one-shot
  input and the confirmed event sequence.

The original `replay.cpp` game archive omits active object lists and other state
needed for arbitrary mid-round restore. `Game::postClone` copies worm objects but
leaves settings and some cross-object references shared; its existing uses are
not proof of rollback isolation. Do not reuse either unchanged as a complete
checkpoint. Handle presentation telemetry/audio separately so replay does not
duplicate beeps, shots, kills, chat or recording events.

At join, serialize a confirmed current checkpoint, including already-dug terrain,
and retain a short event tail while it transfers. Validate bounds/version before
restoring, then replay only that tail and enter live spectating. Keep a bounded
history ring rather than the whole match. Periodic complete canonical-state
hashes at the same confirmed tick should request a fresh host checkpoint on real
divergence, with retry/rate limits. Never hash raw pointers or uninitialized bytes.

### Transport

Keep reliable ordered control/setup and paced checkpoint transfer separate from
small action messages. Reliable unordered action delivery can use explicit
sequence/tick ordering, as observed in WebLiero; unreliable unordered progress
messages can be superseded. If actions themselves become unreliable, add bounded
acknowledged retransmission/redundancy first. Lost releases or missing wheel
pulses cannot simply be ignored.

Separate channels still share an SCTP association and congestion budget; they
do not remove every possible blocking effect. Prioritize/pause bulk chunks under
backpressure and bound buffered data. Account for SCTP/DTLS/IP and fan-out to all
viewers when measuring traffic, not just application bytes. See the
[WebRTC specification](https://www.w3.org/TR/webrtc/) and
[RTCDataChannel buffering](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount).

## Required validation before replacing protocol 5

1. Save/restore produces the same subsequent state as uninterrupted simulation,
   including JS/WASM comparison, digging, explosions, RNG, live rules and loadouts.
2. A rope attached to the other player preserves both velocities and its anchor
   after restoration; test release, rethrow, death and respawn during prediction.
3. Lost, duplicated, delayed and reordered events never lose releases or repeat
   one-shot actions. Include simultaneous fire/right click/scroll and held W.
4. A mid-round join with altered terrain and live projectiles converges to the
   host; transfer/replay work is bounded independently of round age.
5. Confirmed hashes match after prediction correction. Inject a real mismatch
   and verify bounded automatic checkpoint recovery.
6. Measure response latency, CPU replay budget, bytes, packet rate and buffered
   data under realistic RTT/jitter/loss, with a spectator host and late joiners.
   Require useful improvement over this baseline before claiming optimization.
