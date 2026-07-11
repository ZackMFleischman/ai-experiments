# Brief — Breathe (utility)

`node tools/create-app/index.mjs breathe --kind utility --display "Breathe"
--tagline "Box breathing, nothing else." --accent "#7048a8" --port 5250`

**The app.** A breathing pacer: box (4-4-4-4), relaxing 4-7-8, and coherent
5.5 patterns. One animated ring expands/holds/contracts with the phase
(pure CSS/canvas driven by the same clock-injected machine discipline as
Stillness's timer — remaining time is arithmetic over an injected now).
Sessions of 1/3/5 minutes or open-ended; day-streak stats via
`@parlor/solo`.

**Native (the reason it costs a dollar).** Haptic pulse on each phase
transition (inhale/hold/exhale feel different — impact light/medium),
keep-awake during a session, optional end-bell as a scheduled local
notification when backgrounded — exactly Stillness's plugin trio, second
consumer.

**Feel.** The quietest app in the family: one screen, the ring, the
pattern picker, nothing else. Reduced-motion users get a text-phase
fallback (a11y gate in the visual checks).

**Out of scope.** Audio coaching, HRV/health integrations, accounts (never).

**Store.** Privacy data-not-collected; $1; category HEALTH_AND_FITNESS
(check 4.2 posture: motion + haptics must feel native).
