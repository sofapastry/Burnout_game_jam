# BURNOUT: You Are the Semester

A BrSTU game jam entry for the theme **Roles Reversed**: you are the semester, the student is the enemy.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Checks

```
npm run typecheck
npm run smoke            # every week, played by a bot (add --idle, --ru, --all, --story)
npm run smoke:arcade     # boss fights, spells and every mini-game
npm run smoke:flow       # clicks through the menus and the whole story
npm run check:maps       # every map is reachable
```

## Layout

- `src/game` — game flow, horde weeks, week rules, possession, Soul Jump, upgrades
- `src/boss` — boss fights and spells; `src/duel`, `src/arcade` — duel and mini-games
- `src/story` — campaign, cutscenes, prologue
- `src/hero`, `src/horde`, `src/maps`, `src/render`, `src/ui`, `src/core` — characters, units, maps, rendering, UI, audio
- `tools/autorig.py` — Blender script that rigs the character models
- `docs/` — project report and Q&A notes (English and Russian)

Character models: drop a T-posed GLB in `Characters/` and rig it with
`blender -b --factory-startup -P tools/autorig.py -- Characters/Name.glb public/models/name.glb 1024`.
