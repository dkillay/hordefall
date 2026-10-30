# HORDEFALL

A single-player wave-survival FPS in the browser. TypeScript + Three.js + Vite, no external assets: every model, texture and sound is generated in code.

## Run it

```bash
npm install
npm run dev
```

Vite opens http://localhost:5173. Click **DEPLOY** to lock the mouse and start.

`npm run build` produces a static build in `dist/` (serve it with `npm run preview`).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Shift | Sprint |
| Space | Jump (you can hop onto crates and the center platform) |
| Left mouse | Fire |
| Right mouse | Aim down sights |
| R | Reload |
| 1 / 2 / 3, wheel, Q | Switch weapon |
| Esc | Pause |

## Weapons

- **Rifle**: full-auto, big ammo pool. Your workhorse.
- **Scatter**: 9-pellet shotgun, brutal up close, damage falls off with range. Firing interrupts a reload.
- **Rail**: slow, huge damage, pierces through every mob in a line.

Headshots do 2× damage and 1.5× score. Kills in quick succession build a combo multiplier (up to ×8).

## Mobs

- **Grunt**: the baseline shambler.
- **Runner** (wave 2+): fast and fragile; prioritise them.
- **Spitter** (wave 3+): keeps its distance, strafes, and lobs acid you can dodge.
- **Brute** (wave 4+, and every 5th wave is a surge): huge HP, huge hits. Always drops health and ammo.

Mobs get tougher and faster each wave. Clearing a wave grants bonus score and +25 health. Mobs randomly drop health (green cross) and ammo (yellow crate).

## Code map

- `src/main.ts`: game loop, player movement and collision, weapons, waves, mob AI, effects, HUD
- `src/mobs.ts`: mob stats and procedurally built, animated mob models
- `src/world.ts`: arena geometry, collision boxes, lighting, spawn gates
- `src/audio.ts`: WebAudio-synthesized sound effects
- `src/style.css`: HUD and menus

Tweak balance in `MOB_STATS` (mobs.ts), the `weapons` array, and `startWave()` (main.ts).
