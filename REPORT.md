# BURNOUT: You Are the Semester — Project Report

**Event:** BrSTU Game Jam, theme *"Roles Reversed"*
**Platform:** web browser (desktop), Windows launcher included
**Languages:** English / Russian

---

## 1. The idea

In almost every game the player is the hero and the world tries to stop them. For *Roles Reversed*
we flipped the most familiar story every student knows: **you are the semester, and the student is the
enemy.** Kirill is a first-year at BrSTU who just wants to pass. You are everything that stands in his
way: pop quizzes, deadlines, group-project partners, the PE teacher, the presentation, and finally the
Final Exam itself.

The player wins when Kirill gets a debt (*незачёт*). Kirill wins by passing.

The cast is built on people and places from our university. Each character is a "boss" with their
own personality, location, voice lines and fighting style:

| Character | Role | Where |
|---|---|---|
| Shady | exchange student who hacks the schedule | the main hall |
| Nina | the PE teacher who has never lost a race | the track |
| Pasha & Grisha | the rapper and the sleepy joker | the lecture hall |
| Romchik | the party guy who won't let you study | Computer Lab 317 |
| Masha & Sonya | the gossip and the live-streamer | the assembly hall |
| The Final Exam | the end of the semester itself | the Tree of Knowledge |
| Artem | Kirill's friend — the only one on his side | everywhere |

## 2. How it plays

The story campaign has six chapters. Each chapter is one week of the semester:

1. **A cutscene** introduces the place and the character Kirill meets there.
2. **The horde stage.** Your units (the cards in your squad) summon themselves around Kirill. You don't
   watch from above: you *possess* one of them and fight in third person. With **Soul Jump** you fly
   from body to body, and the first hit after a jump is an ambush. Every unit type has two skills of
   its own (28 in total): the Group Project Partner hugs Kirill so he can't move, the Medicine Ball
   bulldozes, the Applause Wave makes him dance, and so on.
3. **A quick cut** to what's next, then **the chapter's fight**:
   - a **boss fight** where you *are* the boss (third person, souls-like): light/heavy attacks, two
     signature moves, two aimed spells, an ultimate, and your horde fighting beside you;
   - or a different game: a **Mortal Kombat–style duel** (Romchik), the **PE norm race** against Nina,
     or **the Presentation**, where you are Masha and Sonya distracting Kirill with a camera flash and a
     laser pointer while he defends his project.
4. **An upgrade:** pick one of three boosts for your horde (spawn rate, damage, attack speed, unit
   level, health…). They stack across the semester.

Kirill fights back. In the horde stages he walks to his goal, shoots units with his highlighter,
levels up and picks upgrades. In boss fights he plays like a souls player: he circles, reads your
wind-ups, rolls through your attacks, drinks coffee to heal, and Artem runs in to help him when he is low.

Outside the story there are a **Quick game**, a **Classic** mode (the original top-down horde game),
and an **Arcade** with every mini-game, plus two **local 2-player** modes.

## 3. How the design changed (play-testing)

The game went through several big rounds, each driven by friends playing it and telling us what was
wrong. The honest feedback was the most valuable part of the jam.

| Feedback | What we changed |
|---|---|
| "It's boring, it feels like a mobile tower defense" | Moved from a top-down card game to **third person**. The player became the boss in a souls-like arena. |
| "We don't know who these people are" | Added a **prologue** and a **cutscene for every chapter** that introduces the characters. |
| "The Mortal Kombat idea would show off the models better than Shadow Fight" | Rebuilt the duel in Mortal Kombat style with a finisher. |
| "I can just spam Pop Quiz and win" | Boss-fight summons became **automatic waves** with a cap. |
| "Placing cards from above is boring" | **Soul Jump**: you live inside your units and jump between them. Summoning became automatic. |
| "Kirill is too strong, weeks are too long" | Rebalanced damage and fire rate, shortened the horde stages. |
| "Bosses need more abilities, like Elden Ring" | Every boss got 2 signature moves, 2 aimed spells and a unique ultimate with a cinematic. |
| "The lights are too bright", "emojis look cheap" | Toned down bloom and exposure; replaced every emoji with drawn line-art icons; new HUD style. |
| "Balls flicker" | Found that rolling balls rotated around the floor instead of their centre and dipped through it. |

The organizer mentioned liking *The Dark Queen of Mortholme* (you play the final boss, the hero keeps
coming back and learns). We built a version of that idea: Kirill can come back after defeat, talk to
you, and resist whatever killed him. After testing we turned it off for the main story (players wanted
one clean defeat), but it is still in the code as an option.

## 4. Technology

| Part | What we used |
|---|---|
| Language | **TypeScript** (strict mode) |
| 3D | **Three.js** (r170), WebGL |
| Build / dev server | **Vite** |
| Characters | 8 T-posed GLB models, auto-rigged with a **Blender** Python script |
| Animation | procedural, code-driven poses (no animation files) |
| Audio | 100% synthesized at runtime with the **Web Audio API** |
| Tests | headless smoke tests in Node with **happy-dom**, bundled with esbuild |

There is no game engine. Everything — the game loop, scenes, physics-lite movement, AI, UI — is our
own code on top of Three.js. That kept the build small (about 4 MB zipped), made it run in any browser,
and let us control every system.

### Architecture overview

```
main.ts            fixed 60 Hz update loop + render every frame
game/flow.ts       the game's state machine: menus, semester, chapters, which scene is running
game/week.ts       one horde stage (units, Kirill, rules, HUD, possession, Soul Jump)
game/rules.ts      each week's own rules and win/lose meter (15 weeks)
boss/arena.ts      the third-person boss fight; boss/spells.ts the spell effects
duel/, arcade/     the duel and the mini-games (race, presentation, rhythm game, runner, dungeon, versus)
story/             campaign data, cutscenes, prologue
hero/              Kirill's AI and the procedural person / animation system
horde/             units (instanced rendering), pickups, guest characters
maps/              floor plans, prop builder, navigation grid and flow fields, background life
render/            stage, toon materials + outlines, post-processing, effects
core/              audio synthesis, seeded random numbers, voice lines
ui/                HUD, icons, juice (stamps, combo call-outs)
i18n.ts            every string in English and Russian
```

### Some systems worth explaining

- **Fixed timestep.** The game logic always steps at 1/60 s, no matter the frame rate. That keeps
  physics, cooldowns and AI the same on a slow laptop and a 144 Hz monitor, and makes tests repeatable.
- **Seeded randomness.** Every semester has a seed. Map props, events and AI choices come from a
  seeded random generator, so a run can be reproduced (and shared — the end screen shows the seed).
- **Navigation.** Maps are converted to a grid. Kirill and the units move along **flow fields**
  (a breadth-first distance map from the target), which is cheap for many agents at once. Obstacles
  are "grown" by one cell so units don't get stuck in narrow gaps.
- **Rendering many units.** Units of the same type are drawn with **InstancedMesh** (one draw call per
  type), and all static map props are merged into a few batched meshes.
- **Toon look.** Cel-shaded materials, black outlines made with the inverted-hull technique, and a
  post-processing pass (bloom, contrast/saturation grade, vignette) with a low-quality toggle.
- **Characters.** The models came as unrigged T-pose GLBs. A Blender script (`tools/autorig.py`) adds a
  skeleton and skin weights automatically. In the game, one pose system drives both the procedural
  people and the rigged models, with spring-damped motion so they don't look robotic.
- **Kirill's AI (boss fight).** A small state machine (idle, slash, beam, roll, drink, stunned) with
  rules a player would use: keep distance, roll when he sees a wind-up, punish recovery, heal when low.
- **Audio.** Music is a step sequencer with moods (menu, chase, boss, duel, lament) that react to the
  tension of the fight. SFX, bells and choirs are built from oscillators, filtered noise and a
  generated reverb impulse.
- **Localization.** Every on-screen string is a key in `i18n.ts` with English and Russian text.

## 5. Testing

Besides play-testing with friends, the project has automated **headless tests** that run the real game
code in Node (with a fake DOM and canvas). They:

- play every week of the semester with a bot and with an idle player (to check Kirill can always win),
- play the whole story campaign from the main menu to the end screen by clicking the real buttons,
- run every boss fight, cast every spell and ultimate, and every mini-game,
- check that every map is fully reachable for the pathfinding.

This let us change big systems late in the jam without breaking the game.

```
npm run typecheck · npm run smoke · npm run smoke:arcade · npm run smoke:flow · npm run check:maps
```

## 6. Problems we solved

- **Rigging bought/generated models automatically.** One model failed in Blender's automatic weighting
  because of its scale and long hair touching the arms. We scaled models up before rigging, added a
  voxel-proxy fallback and kept hair out of the arm weights.
- **Elbows twisted instead of bending.** The bend axis was wrong for the model's bone orientation;
  fixed by bending about the bone's own Y axis.
- **Rolling balls flickered.** The ball mesh was offset from its pivot, so rolling swung it through the
  floor. Fixed by centring the mesh and lifting it in the renderer.
- **Everything was too bright.** Bloom picked up the projector screen and UI-white surfaces. We raised
  the bloom threshold, lowered exposure and stopped bright surfaces from bypassing tone mapping.
- **Balance.** Every play-test changed numbers: Kirill's fire rate, boss damage, wave timing, week length.

## 7. What we would do next

- A proper Kirill model in the same style as the other characters.
- Recorded voice lines for the whole cast (the system for them is already in place).
- More unique events per chapter, and gamepad support.

## 8. Credits and tools

- **Game design, story, characters and direction:** [your name]
- **Character models and portraits:** [your name / source]
- **Play-testing:** [friends' names]
- **Code:** written with **Claude (Anthropic) as an AI coding assistant**, under my direction:
  I defined the design, tested every build and decided every change; the assistant wrote and revised
  the implementation.
- **Libraries:** Three.js, Vite, TypeScript, happy-dom. **Tools:** Blender 4.3 (auto-rigging).
- All music and sound effects are generated in code; no external audio assets.
