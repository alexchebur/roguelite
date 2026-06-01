📘 
# ТЕХНИЧЕСКИЙ БЛЮПРИНТ: Roguelike JS

## 📁 1. Структура файлов

📁 index.html          # Разметка, CSS-Grid, подключение библиотек и скриптов
📁 Сторонние либы
   ├─ rot.min.js       # FOV, A*, отрисовка символов
   └─ seedrandom.min.js# Детерминированный рандом
📁 Модули игры (JS)
   ├─ game.js          # 🎮 Контроллер: ввод, ходы, режимы, оркестрация
   ├─ globalMap.js     # 🌍 Чанковая генерация мира, движение по поверхности
   ├─ map.js           # 🗺️ Управление картой подземелья, лестницы, кеширование
   ├─ dungeon_generator.js # 🏗️ Алгоритмы генерации (rooms, cellular, arena)
   ├─ entity.js        # 👤 Создание игрока, врагов, предметов, спавн-логика
   ├─ combat.js        # ⚔️ Ближний/дальний бой, лут, использование предметов
   ├─ render.js        # 🎨 Отрисовка ROT.js, UI, лог, миникарты
   ├─ data.js          # 📊 Статика: типы врагов, предметов, размеры карты
   ├─ name_generator.js# 📛 SeededRandom, создание сидов, генерация имён
   ├─ worldCurve.js    # 📈 Кривые сложности, тренды мира, множители
   ├─ npc_generator.js # ☺️ Спавн NPC в городах
   └─ effect_system.js # 💫 Баффы/дебаффы, DoT/HOT эффекты


## 🔄 2. Основные процессы (Data Flow)

Этап
Процесс
Ответственные модули
Инициализация
Загрузка → RenderModule.init() → GlobalMapModule.initSafeStart() → отрисовка мира
game.js, render.js, globalMap.js
Глобальный режим
Ввод → processGlobalTurn() → проверка isWalkable() → tryMove() → проверка POI → enterPOI()
game.js, globalMap.js
Загрузка локации
loadCityLevel() / loadDungeonLevel() → генерация карты → расчёт лестниц → спавн сущностей
game.js, map.js, entity.js, npc_generator.js
Ход в подземелье
handleInput() → processTurn() → проверка стен/врагов/NPC → движение/бой/подбор → moveNpcs() → moveEnemies() → renderFrame()
game.js, map.js, combat.js, entity.js
Переход между уровнями
Наступление на stairsDown/stairsUp → loadDungeonLevel(depth±1) → восстановление координат из stairsCache
game.js, map.js
Выход на поверхность
exitToGlobal() → сброс подземельных массивов → очистка кеша → возврат координат входа → renderGlobalMap()
game.js, globalMap.js, map.js

## 📦 3. Ключевые переменные и состояние

### 🎮 GameModule (Центральное состояние)
// Приватные переменные (let)
player: { x, y, hp, maxHp, atk, def, level, xp, gold, inventory:[], equipment:{weapon, armor} }
enemies: [{ x, y, hp, maxHp, atk, def, name, char, color, isEnemy:true, lootType }]
items:   [{ x, y, name, char, color, type, val, effect, meleeType, range, currentAmmo, isItem:true }]
npcs:    [{ x, y, name, char, color, dialog, isNPC:true, direction:{dx,dy} }]
gameMode: 'global' | 'dungeon'
busy: boolean (блокировка ввода во время анимаций/переходов)
currentDepth: number (0 = поверхность, >0 = уровень подземелья)
dungeonX, dungeonY: number (глобальные координаты входа)
entrancePos: { x, y } (точка возврата на глобальную карту)
currentLocData, currentWorldTrend: object (данные для UI)

### 🌍 GlobalMapModule

playerGlobalX, playerGlobalY: number
chunkCache: Map<"cx,cy", { tiles: string[][], pois: [] }>
GLOBAL_CONFIG: { CHUNK_SIZE:50, CITY_DENSITY:0.02, DUNGEON_DENSITY:0.03, ... }
// API: getTileType(), isWalkable(), getPOI(), tryMove(), initSafeStart()

### 🗺️ MapModule

currentMapData: number[][] (0 = пол, 1 = стена)
currentDungeonType: { name, wallChar, floorChar, wallColor, floorColor }
stairsUp: { x, y } | null
stairsDown: { x, y } | null
stairsCache: Map<"gx_gy_depth", { stairsUp, stairsDown }>
// API: generateWithType(), generateCity(), isWall(), getRandomFloor(), clearCache()

### 🎨 RenderModule
display: ROT.Display
fov: ROT.FOV.PreciseShadowcasting
COLS: 60, ROWS: 40, FONT_SIZE: 14
// API: draw(), drawGlobalMap(), updateUI(), log(), drawMinimap(), updateInspector()
📊 DataModule (Константы)
MAP_WIDTH: 100, MAP_HEIGHT: 100
ENEMY_TYPES: [ { name, char, color, hp:[min,max], atk:[min,max], def:[min,max], lootType } ]
ITEM_TYPES:  [ { type, baseName, val:[min,max], effect, meleeType, range, maxAmmo, gender, ... } ]
ITEM_ADJECTIVES: [ { base, she, it, plural } ]
## 🔗 4. Матрица взаимодействия модулей

game.js (Controller)
  ├─ вызывает → RenderModule.init(), .draw(), .updateUI(), .log()
  ├─ вызывает → GlobalMapModule.tryMove(), .getPOI(), .initSafeStart()
  ├─ вызывает → MapModule.generateWithType(), .isWall(), .stairsUp/Down
  ├─ вызывает → EntityModule.createPlayer(), .spawnEnemies(), .spawnItems()
  ├─ вызывает → CombatModule.attack(), .rangedAttack(), .useItem()
  ├─ использует → DataModule (типы, размеры)
  └─ использует → WorldCurveModule (множители, тренды)

map.js ↔ dungeon_generator.js (генерация сетки)
map.js ↔ name_generator.js (сиды для лестниц)
combat.js ↔ data.js (лут, формулы урона)
render.js ↔ rot.js (отрисовка, FOV)
effect_system.js (опционально расширяет entity.js)

## ⚙️ 5. Ключевые архитектурные принципы

##Детерминизм: Вся генерация (мир, подземелья, имена, лестницы) привязана к createSeed(x, y, depth). Перезагрузка с теми же координатами даст идентичную карту. Предметы, золото, враги и оружие на уровне разбрасываются в случайных позициях подземелья при каждом новом посещении.
##Инкапсуляция состояния: Каждый модуль хранит своё состояние в замыкании IIFE. Публичный API экспортируется через return { ... }.
##Пошаговость (Turn-based): Ход игрока → проверка событий → ход NPC → ход врагов → перерисовка. ##Асинхронность отсутствует.
##Единый источник отрисовки: RenderModule не хранит состояние игры, только потребует данные из других модулей для отрисовки текущего кадра.
##Кеширование лестниц: MapModule.stairsCache гарантирует согласованность переходов между уровнями одного подземелья.