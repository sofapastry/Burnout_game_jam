# BURNOUT — playtest guide

Run it: `npm run dev`, then open http://localhost:5173/ (test in **Opera GX**).
To play from scratch (tutorial, guest intros, a clean save), clear the site data for localhost.

## The story campaign (Enroll) — the main game

Prologue (first time) → six chapters, each with its own cutscene in the real location:

| # | Chapter | Horde week (top-down) | Then |
|---|---|---|---|
| 1 | Enrollment (main hall) | Foyer | boss fight as **Shady**, the international student coder, in the Foyer |
| 2 | The Track (sports complex) | Gym | **PE race** with Nina (no boss fight) |
| 3 | The Classroom | Lecture hall | duo boss fight: you are **Pasha** (raps), **Grisha** (jokes) fights beside you |
| 4 | The Lab (317) | Computer lab, Romchik's party | **Mortal Kombat** duel as Romchik |
| 5 | The Presentation | Assembly hall | the **laser & camera** mini-game, then duo boss fight: **Sonya** with **Masha** |
| 6 | The Final Exam | Exam hall | **THE FINAL EXAM**, a colossus under the Tree of Knowledge |

**Artem** is Kirill's friend: he helps in the horde weeks and runs in once per boss fight when Kirill is low.
Every chapter plays; the debts Kirill collects decide the ending after the Final Exam.

## NEW for the final build

- **Soul Jump (story horde stages):** you play from *inside* your units now, not from the top view. You start
  inside one; **C / Tab** (or the glowing button) sends your soul flying into the marked body (the one
  you're looking at, else the one nearest Kirill). The first hit after a jump is an **AMBUSH ×2**. When your
  body is destroyed your soul escapes into the nearest one. Your deck keeps spawning for free, so there's
  always another body. WASD, mouse, J/click combo, Space dash, Shift sprint, V camera.
- **Upgrades:** before each chapter you pick 1 of 3 horde upgrades (stacking): Faster Waves, Sharper Teeth,
  Frenzy (attack speed), Promotion (unit level), Thick Skin, Bigger Horde, Restless Soul, Dull Highlighter, Boss Mode.
- **Unit skills (F while possessing):** small units call 2 more of themselves, the Partner hugs Kirill (holds him),
  heavy units bulldoze, Drawings spin a paper storm, a Deadline leaps at him and goes off, others stomp a shockwave.
- **Balance:** Kirill's beam is slower in the story's horde stages, bosses hit ~55% harder, horde stages run
  about as long as the base weeks again (20–60 s when you play actively).
- **Story horde = auto-summon:** your squad (your loadout + this week's unit cards) summons itself; you never
  place cards, you just jump between bodies. The week's guest joins on their own a third of the way in.
- **Every unit has a skill set (F and G):** 14 unit types × 2 skills each (Pop Quiz: *Pop Pop Pop!* / *Surprise
  Question*; Medicine Ball: *Bulldoze* / *Slam Dunk*; Applause Wave: *Standing Ovation* / *Encore*; …).
- **The Lab now ends with a Romchik boss fight** after the Mortal Kombat duel.
- **Boss fights:** your horde arrives every ~7 s (5 s in phase 2), up to 6 at a time, to fight beside you.
- **Pasha is a boss only:** removed from the deck, the draft and the weekly guests (Partner is a starter card now).
- **Living maps:** students sit in the lecture rows and waiting seats (they chat, raise hands), dust drifts in the light.
- **He Returns** (inspired by *The Dark Queen of Mortholme*) is switched **off** for now: Kirill has one life
  in boss fights (beat him once and the story goes on). With `tries: 3` in a BossSetup it comes back:
  Kirill would have **3 attempts**.
  When he falls the world slows, he talks to you, and you answer (**1** cruel / **2** kind). He gets back
  up remembering what hurt him most: that attack now does half damage and he rolls away from it.
  Cruel answers make him hit harder; kind ones give him an extra coffee. Your answers across the
  campaign decide its ending: *Tyrant*, *Mentor* or *Indifferent Semester*.
- **Sound:** everything rings out in a stone-hall reverb. New music: the horde stages' dark chase (war
  drums, a string ostinato, a bell line), boss fights with strings and a tolling bell, and a piano
  lament while Kirill is down. New SFX: soul whoosh, ambush crack, sword swooshes, great bell, the hero rising.

## What to try (about 30 minutes)

0. **NEW — You are the Boss** (the main mode now: *Enroll* or *Quick game*). Each week you are that
   location's boss in third person; Kirill is a souls-style AI hero. Arcade → 👑 Boss Rush lets you pick any boss.
   Keys: WASD · mouse/←→ camera (F frees it) · J/click light combo · K heavy · Space roll · Shift sprint ·
   **1–4 spells** (1/2 = signature moves, also Q/E; 3/4 = aimed spells: a rune circle appears, aim with mouse/WASD,
   click or J to cast, K cancels) · **R ultimate** once its bar is full (it fills over time and with every hit) · Esc pause.
   Your deck's horde **summons itself** every ~10 s (faster in phase 2, at most 4 on the floor).
   | Boss | 3 | 4 | R — ultimate |
   |---|---|---|---|
   | Shady | Byte Meteors | Firewall | Blue Screen of Death |
   | Nina | Final Lap | Hurdle Line | Marathon |
   | Pasha | Subwoofer Drop | Equalizer | Mic Drop |
   | Grisha | Snooze Cloud | Pillow Fort | The Endless Lecture |
   | Romchik | Disco Inferno | Champagne Geysers | Afterparty |
   | Masha | Rumor Mill | Hot Take | Viral Scandal |
   | Sonya | Paparazzi Ring | Ring Light | Live Stream |
   | Final Exam | Red Pen Judgement | Ticket Draw | The Session |
   Duo partners cast their own spells on Kirill.
   Story horde stages run about twice as long, in **3 waves**, and Kirill gets one **SECOND WIND** if you break him early.
   The old horde game is still there: **Classic semester**.
   Duels (Dean, Final Exam, Arcade fights) are now Mortal Kombat-style, with **FINISH HIM → ОТЧИСЛЕНИЕ**.
   If the new glow/colour effects look wrong or run slowly: pause menu → untick *High-quality effects*.

1. **Quick game** (⚡ in the main menu, ~6 min): weeks 1 → 3 → 11, with the Corridor Chase after week 1.
   - Week 1 shows the 3-step guide the very first time.
   - Watch for: the opening camera sweep, events every ~18 s (banner at the top), the
     **FINAL 10 SECONDS** countdown, Kirill's mood emoji and taunts, the НЕЗАЧЁТ stamp.
   - Week 3 (PE) ends with Nina's norm race; week 11 ends with the Presentation (if he's still in the hall at 22:00).
2. **Pause menu**: Esc or Space during a week → Resume / Restart week / volume / music / fullscreen / Quit.
3. **Enroll** (the full 7-week semester), with mini-games after weeks 1, 8, 10, 13. Week 15 ends in the Final Exam duel.
4. **Arcade** → every card, including the new **🎵 The Lecture Drone** (a rhythm game: D F J K).
5. **2 players** (Arcade, bottom row): Versus duel and Versus Presentation, two people on one keyboard.
6. **Dean's Office**: perks bought with stamps (you earn stamps by finishing semesters).

## Controls cheat sheet

| Where | Keys |
|---|---|
| Weeks | 1–6 pick a card · click to place · Q W E skills · R rotate (parking) · F possess a unit (then WASD, click, G to place a card) · Esc/Space pause |
| Duels | A/D move (double-tap dash) · W jump · S crouch · J punch · K kick · L block · Space special — or the on-screen pad |
| PE race | Space jump · Q sprint · W whistle · E taunt |
| Corridor Chase | A/D lanes · W jump · S slide · J/K/L traps · Shift boost · E email |
| Dorm dungeon | WASD · Q/E turn the camera · J slash · F lock on · K dash · Space alarm |
| Presentation | mouse aims · click/Q flash · E laser on/off · R meme slide · Space ringtone |
| Lecture Drone | D F J K on the beat · hold long notes · never hit ✋ |
| 2-player P2 | arrows + `,` `.` `/` Enter |

Every on-screen skill button can also be clicked.

## Voice lines (optional, fun with friends)

Record short lines on a phone and drop them in `public/voice/` as `kirill_hurt_1.mp3`, `kirill_hurt_2.mp3`, …
The full list of names is in `public/voice/README.txt`. The game picks them up on reload.

## Reporting a bug

Copy this for each bug:

```
Where:        (menu / week N / mini-game name / arcade mode)
What I did:   (the steps, as exactly as you can)
What happened:
What I expected:
How often:    (always / sometimes / once)
Screenshot or the browser console (F12 → Console) if anything red shows up
Language:     EN / RU
```

The **seed** (shown when you enroll, and on the end screen) replays the same semester, so include it when you can.

## Automated checks (for the developer)

`npm run typecheck` · `npm run build` · `npm run check:maps` · `npm run smoke` (+ `--idle`, `--ru`, `--all`) ·
`npm run smoke:arcade` (+ `--idle`, `--story`) · `npm run smoke:flow` (clicks through every menu).
