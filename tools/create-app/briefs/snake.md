# Brief — Snake (arcade)

`node tools/create-app/index.mjs snake --kind arcade --display "Snake"
--tagline "One snake, one apple, one more try." --accent "#2b8a3e" --port 5230`

**The game.** Classic snake on a fixed grid (~21×21 world units mapped to
the arcade court): the snake advances every N ticks, arrows/swipe steer
(no reversing), eating the apple grows the snake by one and speeds the
cadence slightly (capped). Colliding with wall or self ends the run.
Score = apples; best runs local via `HighScoreStore`.

**Engine.** Pure fixed-tick fold like Bricks: state {cells: number[],
dir, pendingDir, apple, tick, cadence, score, phase}, apple placement from
the state-resident rng cursor (never on the snake). Determinism gate: same
seed + same input trace → identical end state (property + golden trace).

**Feel.** Grid-crisp rendering (rounded snake segments, the apple in the
accent), tap/swipe steering on touch, serve overlay = "tap to start".
Haptics: light on apple, success on new best. Same 4.2 defenses as Bricks.

**Out of scope.** Walls/levels/obstacles, multiple speeds as options,
sound.

**Store.** Name "Snake" is crowded — listing name candidate "Snake, plainly"
(decide at listing time, ⚑). Privacy: data-not-collected. Same $1 posture.
