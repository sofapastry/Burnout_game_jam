# BURNOUT — ассеты и лицензии

**English version:** [assets.en.md](assets.en.md)

**Игра:** BURNOUT: You Are the Semester  
**Платформа:** веб (HTML5 / WebGL)  
**Репозиторий:** исходники + каталоги `public/`, `Characters/`

Документ для жюри: какие ресурсы использованы, на каких условиях, и что сделано командой с нуля.

---

## 1. Сделано командой (своё)

Всё перечисленное ниже создано участниками проекта в рамках геймджема (код, данные, процедурная графика). В сборку **не** входят сторонние готовые спрайт-паки, тайлсеты, аудиобиблиотеки или движок.

| Категория | Где в проекте | Описание |
|-----------|---------------|----------|
| **Исходный код игры** | `src/` | Логика, UI, ИИ, камера, режимы (история, аркада, боссы, дuel), локализация EN/RU |
| **Данные и баланс** | `src/data/` | Недели семестра, карты, реплики, тексты, `balance.json` |
| **Кирилл (герой)** | `src/hero/person.ts`, `look.ts`, `kirill.ts` | Процедурная low-poly модель и анимация позами в коде; **отдельного GLB у Кирилла нет** |
| **Юниты орды** | `src/horde/unitModels.ts` | Все «карточки» (контрольная, дедлайн, мяч, таракан и т.д.) — примитивы Three.js, собранные в коде |
| **Карта и реквизит** | `src/maps/` | Планировки недель, сетка pathfinding, мебель и декор (`props.ts`), «жизнь» фона |
| **Текстуры полов и вывесок** | `src/render/textures.ts` | Рисуются на `<canvas>` в рантайме (плитка, асфальт, таблички «317», «Деканат» и т.п.) |
| **UI-иконки** | `src/ui/icons.ts` | SVG-контуры (кофе, колокол, молния, глаз…) — без emoji-ассетов |
| **Шейдеры и постобработка** | `src/render/toon.ts`, `post.ts`, `fx.ts` | Cel-shading, outline, bloom, vignette |
| **Музыка и звук** | `src/core/audio.ts` | **100% синтез Web Audio API** (осцилляторы, шум, реverb); **файлов .mp3/.wav в игре нет** |
| **Голос (опционально)** | `public/voice/` | Система поддерживает свои записи; в репозитории только `README.txt`, **записей нет** |
| **Скрипт рига** | `tools/autorig.py` | Авто-скелет и веса в Blender для T-pose GLB → `public/models/*.glb` |
| **Портреты в HUD** | `public/portraits/*-face.jpg`, `*-body.jpg` | 2D-портреты персонажей для интерфейса; подготовлены командой под cast игры |
| **Исходные меши (T-pose)** | `Characters/*.glb` | Исходники до рига (те же персонажи, что в `public/models/`) |
| **Тесты** | `scripts/*-smoke.ts` | Headless-проверки (не входят в игровую сборку) |

**Сюжет, имена, локации БрГТУ, тексты шуток** — авторские, команда.

---

## 2. Сторонние ресурсы (ассеты и сервисы)

### 2.1. 3D-персонажи (GLB)

| Файлы | Источник | Лицензия / права |
|-------|----------|------------------|
| `public/models/nina.glb`, `pasha.glb`, `artem.glb`, `shady.glb`, `sonya.glb`, `romchik.glb`, `masha.glb`, `grisha.glb` | Базовые меши сгенерированы в **[Meshy.ai](https://www.meshy.ai)** (AI 3D), затем обработаны командой | Права на сгенерированные модели — по **[Terms of Service Meshy](https://www.meshy.ai/terms)** (аккаунт команды). После экспорта: масштаб, **авторский риг** (`tools/autorig.py`), оптимизация под игру |
| `Characters/*.glb` | Те же исходные меши (T-pose до рига) | То же |

**Важно:** анимационных клипов в GLB **нет** — движение задаётся процедурными позами в коде (`src/assets.ts`, `src/hero/person.ts`). Если GLB не загрузится, игра подставляет процедурную заглушку в том же стиле.

### 2.2. Шрифты (Google Fonts)

Подключаются из CDN в `index.html` (нужен интернет при первом запуске):

| Шрифт | Использование | Лицензия |
|-------|---------------|----------|
| [Nunito](https://fonts.google.com/specimen/Nunito) | UI, подписи | [SIL Open Font License 1.1](https://openfontlicense.org/) |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | Моноширинный UI, кодовые штуки | SIL OFL 1.1 |
| [Russo One](https://fonts.google.com/specimen/Russo+One) | Заголовки, «НЕЗАЧЁТ», боссы | SIL OFL 1.1 |
| [Cormorant SC](https://fonts.google.com/specimen/Cormorant+SC) | Акценты (арены, спells) | SIL OFL 1.1 |

### 2.3. Программные библиотеки (не медиа, но зависимости)

Используются как npm-пакеты; в `dist/` попадает бандл Vite.

| Пакет | Назначение | Лицензия |
|-------|------------|----------|
| [three](https://github.com/mrdoob/three.js) r170 | WebGL, загрузка GLB | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) |
| [vite](https://github.com/vitejs/vite) | Сборка и dev-сервер | MIT |
| [typescript](https://www.typescriptlang.org/) | Язык разработки | [Apache-2.0](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) |
| happy-dom | Только dev-тесты | MIT |

Примеры кода Three.js (GLTFLoader, MeshoptDecoder, SkeletonUtils) — часть three.js, MIT.

### 2.4. Инструменты (не в дистрибутиве игры)

| Инструмент | Назначение |
|------------|------------|
| [Blender](https://www.blender.org/) 4.x | Headless-риг через `tools/autorig.py` (GPL — инструмент; **в игру не включается**) |
| Node.js | Сборка и тесты |

---

## 3. Чего в проекте нет

- Готовых **аудиотреков** или **SFX-паков** (всё синтезируется в коде).
- **Спрайтов** / **texture pack** из Asset Store, itch.io packs и т.п.
- **Unity / Unreal** ассетов (игра на Three.js).
- **Видео** / **motion capture**.
- Записанных **голосовых файлов** в репозитории (слот optional, см. `public/voice/README.txt`).
- Логотипов или товарных знаков **сторонних компаний** (кроме упоминания тематики вуза в сюжете; merch «60 лет БрГТУ» — вымышленный дизайн худи в игре).

---

## 4. Emoji в данных

В `src/data/cards.ts` в полях `icon` для части карт указаны символы Unicode (📝, ⏰…). В **интерфейсе игры** они заменяются на **собственные SVG** (`installIcons()` в `src/ui/icons.ts`). Emoji не являются загружаемыми файлами-ассетами.

---

## 5. Сборка для проверки

```bash
npm install
npm run build    # каталог dist/ — то, что отдаётся игроку
```

В `dist/` лежат: `index.html`, JS/CSS-бандл, `models/`, `portraits/`, `voice/README.txt`.

---

