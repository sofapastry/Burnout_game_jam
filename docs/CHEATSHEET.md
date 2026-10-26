# BURNOUT — Q&A Cheat Sheet

Short answers for questions the judges are likely to ask. Each one says *what* and *why*.
Where it helps, there's a file you can open to show it.

---

## The stack in one breath

TypeScript + Three.js (WebGL), built with Vite. No game engine. Characters are GLB models auto-rigged in
Blender with a Python script; all animation is procedural; all audio is synthesized with the Web Audio
API. Headless tests run the real game in Node with happy-dom.

---

## Design questions

**How does the game fit "Roles Reversed"?**
Normally the student is the hero fighting the semester. Here you *are* the semester: every unit, boss
and mini-game is something that makes student life hard, and the student, Kirill, is the AI opponent
trying to pass. You win when he gets a debt.

**Why a student and a university?**
It's the most relatable "hero's journey" for a BrSTU jam: everyone in the room has lived through
quizzes, deadlines, the PE norm and the exam. The characters are based on people and places at our
university, so it's personal and funny for the audience.

**Why did you move from top-down to third person?**
Play-testers found the top-down card game boring: it felt like a mobile tower defense. Being *inside*
the fight (possessing a unit, playing the boss in third person) made it feel active and showed off the
character models.

**What is Soul Jump and why?**
In the horde stages you're always inside one of your units and press C/Tab to fly into another.
Your squad summons itself, so instead of placing cards you move through the fight. It keeps the
player in the action and makes the horde feel like *one* entity, the semester, moving from body to body.

**Why are summons automatic?**
Testers could spam the cheapest unit to win, and placing cards from above pulled them out of the
action. Auto-summon from the squad you picked before the week keeps the choice meaningful (your
loadout and upgrades) without the spam.

**Where did the boss-fight ideas come from?**
Souls-like boss fights (Elden Ring): readable wind-ups, rolls, a phase 2 at half health, big
telegraphed spells with a rune circle on the floor, an ultimate with a cinematic. The twist is that the
player is the boss.

**What did you take from The Dark Queen of Mortholme?**
That game makes you the final boss and the hero keeps coming back and learning. We built a version:
Kirill could return, talk to you and resist what killed him. Play-testers preferred one clean defeat
in the story, so it's off by default but still in the code (`tries` in the boss setup).

**Why so many mini-games?**
Each chapter has a different kind of fight so the semester doesn't repeat: a boss fight, a fighting-game
duel, a race, a presentation. Variety was the main fix for "it gets boring".

**How do you keep it balanced?**
Numbers live in `src/data/balance.json` and the boss/spell tables, so tuning didn't need code
changes. The tests check that an idle player still lets Kirill pass (so weeks are winnable for him) and
that a bot player can beat him.

---

## Technical questions

**Why Three.js and not Unity/Godot?**
It runs in any browser with no install — easy for judges and friends to try. The build is about 4 MB.
And with no engine we control every system and understand all of it.

**Why TypeScript?**
The game is ~22,000 lines. Strict types catch mistakes before running (a wrong key, a missing field),
and the editor knows every object's shape. We also turned on "no unused locals/parameters" to keep it clean.

**How does the game loop work?** (`src/main.ts`)
Fixed timestep: logic updates exactly every 1/60 s using an accumulator; rendering happens every
frame. So the game plays the same on a slow laptop and a fast monitor, and tests are repeatable.

**How is the game organized?** (`src/game/flow.ts`)
A state machine. `Game` knows which "scene" is running (menu, cutscene, horde week, boss arena, duel,
mini-game). Each scene has `update(dt)`, `render()` and `dispose()`. When one ends it calls back and
`flow.ts` decides what comes next (cutscene → horde → quick cut → fight → upgrade → next chapter).

**How do units and Kirill find their way?** (`src/maps/grid.ts`)
The map becomes a grid. A **flow field** is a breadth-first search from the target that gives every
cell a direction. Hundreds of units read their direction from it in O(1), much cheaper than running
A* for each unit. Obstacles are grown by one cell so units don't get stuck between desks.

**How do you draw so many units?** (`src/horde/units.ts`)
Each unit type is one **InstancedMesh**: one draw call for all Pop Quizzes, one for all Deadlines,
etc. Their positions, rotation, squash-and-stretch and hit flash are written into the instance buffers
each frame. Static map props are merged into a few meshes.

**How did you animate the characters without animation files?** (`src/hero/person.ts`, `src/assets.ts`)
Poses are described in code (`poseTargets`): angles for each limb per pose (run, sit, cheer, punch…).
A damped spring moves each joint toward its target, so motion overshoots slightly and feels weighty.
The same pose data drives both the simple procedural people and the rigged GLB models (`BoneRig`
converts the angles into bone rotations).

**How were the models rigged?** (`tools/autorig.py`)
The models were T-pose meshes without skeletons. The Blender script builds a humanoid skeleton from
the mesh's proportions and uses Blender's automatic (bone heat) weights. Problem cases (a tiny model,
hair touching the arms) are handled by scaling up first, a voxel-proxy fallback and removing hair
from the arm weights.

**How does Kirill's AI work in the boss fight?** (`src/boss/arena.ts`, `kirillAI`)
A state machine: idle / slash / beam / roll / drink / stunned. Every few tenths of a second he decides
like a player would: roll sideways when he sees your wind-up, punish you while you recover, keep his
distance and use his beam at range, drink coffee when hurt, step out of spell circles. Difficulty
scales with his level (roll skill, damage, health).

**How do the spells work?** (`src/boss/spells.ts`)
Each spell is a short-lived object with `update(dt)`. They're built from shared pieces: a rune circle
telegraph, meteors falling on spots, eruptions along a line, things that drop from the sky, chasers.
A spell reports its danger zones, which is how Kirill knows where not to stand.

**How does the sound work without audio files?** (`src/core/audio.ts`)
Web Audio oscillators and filtered noise. A step sequencer schedules notes slightly ahead of time.
The music has moods (menu, chase, boss, duel, lament) and an intensity value that adds layers as the
fight heats up. A reverb impulse is generated in code, which gives the "stone hall" sound. Zero audio
assets means a tiny download and no licensing questions.

**Why the toon look?** (`src/render/toon.ts`, `src/render/post.ts`)
Cel shading plus inverted-hull outlines make simple and detailed models look like one style.
Post-processing adds bloom, a colour grade and a vignette, and can be turned off for weak PCs.

**How are the UI icons made?** (`src/ui/icons.ts`)
Hand-drawn line icons as SVG paths on a 24×24 grid. The same paths are drawn into canvas textures
for 3D (Kirill's mood badge, slides).

**Localization?** (`src/i18n.ts`)
Every string is a key with English and Russian text; `t('key')` picks the current language.

**How did you test it?** (`scripts/`)
Headless tests run the real game in Node with a fake DOM: a bot plays every week, the whole story is
clicked through from the menu to the end screen, every spell and mini-game runs, and every map is
checked for reachability. That's what let us make big changes on the last day safely.

**What was the hardest bug?**
Pick one you can tell well:
- The rolling balls flickered because the mesh was offset from its pivot, so rolling swung it through
  the floor. Fix: centre the mesh, lift it in the renderer.
- A rigged model's elbows twisted instead of bending: the bend axis didn't match the bone's
  orientation.
- One model wouldn't auto-rig because of its tiny scale and hair touching the arms.

**What would you improve with more time?**
A proper Kirill model in the same style as the others, recorded voice lines, gamepad support, more
unique events per chapter.

---

## About AI assistance (answer this one plainly)

**Did you use AI?**
Yes. The models are generated by Meshy.ai and Claude 