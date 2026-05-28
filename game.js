// =========================== Модуль игры (управление, ходы, загрузка уровней) ===========================
const GameModule = (function() {
    // === Состояние игры ===
    let player = null;
    let enemies = [];
    let items = [];
    let npcs = []; // <--- ДОБАВИТЬ СЮДА
    let explored = new Set();
    let busy = false;
    
    // === Режимы: 'global' (глобальная карта) или 'dungeon' (подземелье) ===
    let gameMode = 'global';
    let entrancePos = null; // { x, y } - позиция на глобальной карте, откуда вошли
    
    // === Подземельные координаты (для лестниц) ===
    let dungeonX = 0;
    let dungeonY = 0;
    let currentDepth = 0;  // глубина текущего подземелья (0 – первый уровень)
    let currentDungeonTypeName = null; // тип текущего подземелья
    let currentDungeonFullName = null; // полное название подземелья для UI
    
    // === Глобальные координаты (для глобальной карты) ===
    let currentLocData = null;
    let currentWorldTrend = null;

    function init() {
        try {
            // 1. Инициализация рендеринга
            if (typeof RenderModule === 'undefined') {
                throw new Error("RenderModule не загружен");
            }
            RenderModule.init();
        } catch (e) {
            console.error("Критическая ошибка при инициализации:", e);
            document.body.innerHTML = `<div style="color:red; padding:20px;">Ошибка загрузки игры: ${e.message}</div>`;
            return;
        }

        // 2. Установка начального режима
        gameMode = 'global';
        
        // 3. Поиск безопасной стартовой позиции на глобальной карте
        if (typeof GlobalMapModule !== 'undefined') {
            const startPos = GlobalMapModule.initSafeStart(1, 1, 3);
            RenderModule.log(`Стартовая позиция: ${startPos.x}, ${startPos.y}`, "info");
        } else {
            RenderModule.log("Ошибка: GlobalMapModule не найден", "combat");
            return;
        }
        
        // 4. Первая отрисовка глобальной карты
        renderGlobalMap();
        
        // 5. Подключение управления клавиатурой
        window.addEventListener("keydown", (e) => handleInput(e));
        
        // 6. Подключение сенсорного управления (для мобильных)
        addTouchControls();

        // 7. Подключение обработки кликов мышью (для осмотра врагов/NPC/предметов)
        const mapContainer = document.getElementById("map-container");
        if (mapContainer) {
            // Используем mousedown, так как он срабатывает быстрее click на canvas
            mapContainer.addEventListener("mousedown", (e) => {
                if (gameMode === 'dungeon') {
                    handleMapClick(e);
                }
            });
        }
        
        // 8. Приветственные сообщения
        RenderModule.log("Игра загружена. Режим: ГЛОБАЛЬНАЯ КАРТА", "info");
        RenderModule.log("Используйте стрелки для перемещения. Входите в города (C) и подземелья (D).", "info");
        RenderModule.log("💡 Кликайте по врагам и предметам в подземелье, чтобы осмотреть их.", "info");
    }
    
    // === Обработка сенсорного управления ===
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) {
            console.warn("Canvas не найден для сенсорного управления");
            return;
        }
    // === ОБРАБОТКА КЛИКА МЫШЬЮ ПО КАРТЕ (ОСМОТР) ===
    // === ОБРАБОТКА КЛИКА/ТАПА ПО КАРТЕ (ОСМОТР) ===
    function handleMapClick(clientX, clientY) {
        if (!player || gameMode !== 'dungeon') return;

        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        
        // 1. Учитываем масштабирование CSS
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // 2. Координаты внутри Canvas
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // 3. Размер клетки
        const cellW = canvas.width / RenderModule.COLS;
        const cellH = canvas.height / RenderModule.ROWS;

        // 4. Индекс клетки на экране
        const sx = Math.floor(clickX / cellW);
        const sy = Math.floor(clickY / cellH);

        // 5. Глобальные координаты карты
        const cam = RenderModule.getCameraOffset(player);
        const wx = sx + cam.x;
        const wy = sy + cam.y;

        // 6. Поиск сущности
        
        // Враги
        const enemy = enemies.find(en => en.hp > 0 && en.x === wx && en.y === wy);
        if (enemy) {
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(
                    `⚔️ ${enemy.name}`, 
                    `HP: ${enemy.hp}/${enemy.maxHp}\nATK: ${enemy.atk} | DEF: ${enemy.def}`, 
                    "enemy"
                );
            }
            RenderModule.log(`Осмотр: ${enemy.name} [HP:${enemy.hp} ATK:${enemy.atk}]`, "info");
            return;
        }

        // NPC
        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === wx && n.y === wy) : null;
        if (npc) {
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(
                    `☺ ${npc.name}`, 
                    `"${npc.dialog}"`, 
                    "npc"
                );
            }
            RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            return;
        }

        // Предметы
        const item = items.find(i => i.x === wx && i.y === wy);
        if (item) {
             let details = "";
             if (item.stat) details += `Характеристика: ${item.stat.toUpperCase()} +${item.val}\n`;
             if (item.effect) details += `Эффект: ${item.effect} (${item.val})`;
             
             if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(
                    `🎒 ${item.name}`, 
                    details, 
                    "loot"
                );
             }
            RenderModule.log(`Предмет: ${item.name}`, "loot");
            return;
        }

        // Пусто
        if (typeof RenderModule.updateInspector === 'function') {
            RenderModule.updateInspector("Пусто", "Здесь ничего нет...", "neutral");
        }
    }

    // === ОБРАБОТКА СЕНСОРНОГО УПРАВЛЕНИЯ (СВАЙПЫ И ТАПЫ) ===
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) {
            console.warn("Canvas не найден для сенсорного управления");
            return;
        }

        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;

        // Начало касания
        canvas.addEventListener("touchstart", (e) => {
            if (busy || (player && player.hp <= 0)) return;
            
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
        }, { passive: false });

        // Конец касания
        canvas.addEventListener("touchend", (e) => {
            if (busy || (player && player.hp <= 0)) return;
            e.preventDefault();

            const touch = e.changedTouches[0];
            const touchEndX = touch.clientX;
            const touchEndY = touch.clientY;
            const timeDiff = Date.now() - touchStartTime;

            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;

            // Если касание короткое (< 200мс) и палец почти не двигался (< 15px)
            // Считаем это КЛИКОМ для осмотра
            if (timeDiff < 200 && Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15) {
                handleMapClick(touchEndX, touchEndY);
                return;
            }

            // Иначе считаем это СВАЙПОМ для движения
            if (Math.abs(deltaX) > 20 || Math.abs(deltaY) > 20) {
                let dx = 0, dy = 0;
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    dx = deltaX > 0 ? 1 : -1;
                } else {
                    dy = deltaY > 0 ? 1 : -1;
                }
                
                if (gameMode === 'global') {
                    processGlobalTurn(dx, dy);
                } else {
                    processTurn(dx, dy);
                }
            }
        }, { passive: false });
        
        if (isMobileDevice()) {
            RenderModule.log("💡 Тап для осмотра, Свайп для движения", "info");
        }
    }
    
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // === ГЛОБАЛЬНЫЙ РЕЖИМ ===
    function processGlobalTurn(dx, dy) {
        if (busy) return;
        
        if (dx === 0 && dy === 0) return;
        
        if (GlobalMapModule.tryMove(dx, dy)) {
            const playerPos = GlobalMapModule.getPlayerPosition();
            const poi = GlobalMapModule.getPOI(playerPos.x, playerPos.y);
            if (poi) {
                enterPOI(poi);
                return;
            }
            renderGlobalMap();
        } else {
            RenderModule.log("Путь преграждают горы или вода!", "combat");
        }
    }
    
    // Вход в точку интереса (город или подземелье)
    function enterPOI(poi) {
        busy = true;
        entrancePos = GlobalMapModule.getPlayerPosition();
        gameMode = 'dungeon';
        
        if (poi.type === 'city') {
            RenderModule.log(`Вы входите в город ${poi.name}`, "info");
            loadCityLevel(poi.x, poi.y, poi.name);
        } else if (poi.type === 'dungeon') {
            RenderModule.log(`Вы входите в подземелье ${poi.name}`, "info");
            currentDepth = 0;
            console.log("=== ВХОД В ПОДЗЕМЕЛЬЕ ===");
            console.log("Установлена глубина:", currentDepth);
            currentDungeonTypeName = poi.dungeonType;
            currentDungeonFullName = poi.name;
            loadDungeonLevel(poi.x, poi.y, currentDepth, poi.dungeonType, poi.name);
        }
        
        busy = false;
    }
    
    // Выход из подземелья/города на глобальную карту
    function exitToGlobal() {
        gameMode = 'global';
        
        if (entrancePos) {
            GlobalMapModule.setPlayerPosition(entrancePos.x, entrancePos.y);
            entrancePos = null;
        }
        // Очищаем кеш лестниц
        if (MapModule.clearCache) {
            MapModule.clearCache();
        }


        
        // Сбрасываем подземельные данные
        dungeonX = 0;
        dungeonY = 0;
        currentDepth = 0;
        currentDungeonTypeName = null;
        currentDungeonFullName = null;
        enemies = [];
        npcs = [];             // <--- ДОБАВИТЬ
        window.currentCityNpcs = []; // <--- ДОБАВИТЬ
        items = [];
        explored.clear();
       
        
        RenderModule.log("Вы вернулись на поверхность", "info");
        renderGlobalMap();
    }
    
    // Загрузка города (без врагов)
    // Загрузка города (с NPC)
    function loadCityLevel(gx, gy, cityName) {
        enemies = []; 
        items = [];
        npcs = []; // Очищаем локальный массив NPC
        window.currentCityNpcs = []; // Очищаем глобальный (для безопасности)
        explored.clear();
        
        // 1. Генерируем карту города
        const startPos = MapModule.generateCity(gx, gy, 0);
        
        // 2. Создаем или перемещаем игрока
        if (!player) {
            player = EntityModule.createPlayer(startPos.x, startPos.y);
        } else {
            player.x = startPos.x;
            player.y = startPos.y;
        }
        
        // 3. Генерируем NPC
        if (typeof NpcGeneratorModule !== 'undefined' && NpcGeneratorModule.generateCityNpcs) {
            try {
                // Генерируем NPC и сохраняем И в npcs, И в window.currentCityNpcs
                const generatedNpcs = NpcGeneratorModule.generateCityNpcs(gx, gy, MapModule.currentMapData, startPos);
                npcs = generatedNpcs;
                window.currentCityNpcs = generatedNpcs;
            } catch (e) {
                console.error("Ошибка генерации NPC:", e);
                npcs = [];
                window.currentCityNpcs = [];
            }
        }

        // 4. Спавним предметы
        if (EntityModule.spawnItems) {
            items = EntityModule.spawnItems(
                MapModule.currentMapData,
                player,
                DataModule.ITEM_TYPES,
                6,
                1.0,
                2
            );
        }
        
        currentLocData = {
            fullName: cityName,
            description: "Безопасное место. Здесь можно отдохнуть.",
            themeName: "Город"
        };
        
        currentWorldTrend = null;
        renderFrame(); // Теперь здесь npcs уже заполнен
    }    
    // Загрузка подземелья с указанным типом и глубиной
    // В loadDungeonLevel добавьте параметр entryPoint
    function loadDungeonLevel(gx, gy, depth, dungeonType, dungeonName, entryPoint = null) {
        console.log("=== ЗАГРУЗКА УРОВНЯ ПОДЗЕМЕЛЬЯ ===");
        console.log("Входные параметры: gx=", gx, "gy=", gy, "depth=", depth, "entryPoint=", entryPoint);
    
        // Очищаем старые данные
        enemies = [];
        items = [];
        npcs = [];
        explored.clear();
    
        // Генерируем новую карту с указанием точки входа
        const startPos = MapModule.generateWithType(gx, gy, depth, dungeonType, entryPoint);
    
        // Сохраняем параметры подземелья
        dungeonX = gx;
        dungeonY = gy;
        currentDepth = depth;
        currentDungeonTypeName = dungeonType;
        currentDungeonFullName = dungeonName;
    
        console.log("Стартовая позиция игрока:", startPos);
    
        // Перемещаем игрока
        if (!player) {
            player = EntityModule.createPlayer(startPos.x, startPos.y);
        } else {
            player.x = startPos.x;
            player.y = startPos.y;
        }
    
        // Спавним врагов и предметы
        spawnDungeonEntities(gx, gy, depth);
    
        // Обновляем UI
        currentLocData = {
            fullName: `${dungeonName} [Уровень ${depth + 1}]`,
            description: `Подземелье типа ${dungeonType}, уровень ${depth + 1}`,
            themeName: MapModule.currentDungeonType ? MapModule.currentDungeonType.name : dungeonType
        };
    
        currentWorldTrend = WorldCurveModule.getWorldTrend(gx, gy);
    
        if (currentWorldTrend.name !== "Обычный уровень") {
            RenderModule.log(`Тренд мира: ${currentWorldTrend.name}`, "event");
        }
    
        RenderModule.log(`=== УРОВЕНЬ ${depth + 1} подземелья "${dungeonName}" ===`, "info");
    
        renderFrame();
    }    
    // Спавн врагов и предметов в подземелье
    function spawnDungeonEntities(gx, gy, depth) {
        const enemyCount = 8 + Math.floor(depth * 1.5);
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy) * (1 + depth * 0.2);
        
        enemies = EntityModule.spawnEnemies(
            MapModule.currentMapData,
            player,
            DataModule.ENEMY_TYPES,
            enemyCount,
            enemyMult,
            3,
            depth
        );
        
        const rng = new Math.seedrandom(`ent_${gx}_${gy}_${depth}`);
        const oldRand = Math.random;
        Math.random = rng;
        
        const itemMult = WorldCurveModule.getItemPowerMultiplier(gx, gy) * (1 + depth * 0.15);
        if (EntityModule.spawnItems) {
            items = EntityModule.spawnItems(
                MapModule.currentMapData,
                player,
                DataModule.ITEM_TYPES,
                4,
                itemMult,
                3
            );
        } else {
            for (let i = 0; i < 4; i++) {
                const pos = MapModule.getRandomFloor(player);
                const type = DataModule.ITEM_TYPES[Math.floor(Math.random() * DataModule.ITEM_TYPES.length)];
                items.push(EntityModule.createItem(type, pos.x, pos.y, itemMult));
            }
        }
        
        Math.random = oldRand;
    }
    
    // Отрисовка глобальной карты

    function renderGlobalMap() {
        const playerPos = GlobalMapModule.getPlayerPosition();
        RenderModule.drawGlobalMap(playerPos.x, playerPos.y);
        
        // Обновляем координаты вручную
        document.getElementById("ui-loc-coords").textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
        
        // Если игрок уже создан (вышел из подземелья или только начал), обновляем UI штатным методом
        if (player) {
            const globalLocData = {
                fullName: "Глобальная карта",
                description: "Исследуйте мир, находите города и подземелья",
                themeName: "Поверхность"
            };
            // updateUI автоматически отрисует HP, атаку, защиту, экипировку и инвентарь
            RenderModule.updateUI(player, globalLocData, null);
        } else {
            // Для самого первого запуска (когда player ещё null) оставляем заглушки
            document.getElementById("ui-loc-name").textContent = "Глобальная карта";
            document.getElementById("ui-loc-desc").textContent = "Исследуйте мир, находите города и подземелья";
            document.getElementById("ui-loc-type").textContent = `Режим: ГЛОБАЛЬНАЯ КАРТА | Координаты: ${playerPos.x}, ${playerPos.y}`;
            document.getElementById("ui-stats").innerHTML = "<div class='stat-row'><span>Глобальный режим</span></div>";
            document.getElementById("ui-equip").innerHTML = "<div class='equip-slot'>─</div>";
            const invDiv = document.getElementById("inventory-list");
            if (invDiv) invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
        }
        
        RenderModule.drawGlobalMinimap(playerPos.x, playerPos.y);
    }

    // === ПОДЗЕМЕЛЬНЫЙ РЕЖИМ ===
    function handleInput(e) {
        if (busy || (player && player.hp <= 0)) return;
        
        let dx = 0, dy = 0;
        if (e.key === "ArrowUp") dy = -1;
        if (e.key === "ArrowDown") dy = 1;
        if (e.key === "ArrowLeft") dx = -1;
        if (e.key === "ArrowRight") dx = 1;
        
        if (dx !== 0 || dy !== 0 || e.key === " ") {
            e.preventDefault();
            if (gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }
        }
    }


    // === ЛОГИКА ДВИЖЕНИЯ NPC ===
    function moveNpcs() {
        if (!window.currentCityNpcs || window.currentCityNpcs.length === 0) return;

        const width = MapModule.currentMapData[0].length;
        const height = MapModule.currentMapData.length;

        window.currentCityNpcs.forEach(npc => {
            let moved = false;
            let attempts = 0;

            // Пытаемся двигаться в текущем направлении
            while (!moved && attempts < 4) {
                const nx = npc.x + npc.direction.dx;
                const ny = npc.y + npc.direction.dy;

                // Проверка границ карты
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    // Уперлись в край мира -> меняем направление
                    npc.direction = getRandomDirection();
                    attempts++;
                    continue;
                }

                // Проверка стен
                if (MapModule.isWall(nx, ny)) {
                    // Уперлись в стену -> меняем направление
                    npc.direction = getRandomDirection();
                    attempts++;
                    continue;
                }

                // Проверка других NPC (чтобы не накладывались друг на друга)
                const blockedByNpc = window.currentCityNpcs.some(other => 
                    other !== npc && other.x === nx && other.y === ny
                );
                
                // Проверка игрока (NPC не должен наступать на игрока)
                const blockedByPlayer = (player.x === nx && player.y === ny);

                if (blockedByNpc || blockedByPlayer) {
                    // Уперлись в существо -> меняем направление
                    npc.direction = getRandomDirection();
                    attempts++;
                    continue;
                }

                // Путь свободен -> двигаемся
                npc.x = nx;
                npc.y = ny;
                moved = true;
            }
        });
    }

    function getRandomDirection() {
        const dirs = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, 
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
        ];
        return dirs[Math.floor(Math.random() * dirs.length)];
    }
    
    
    function processTurn(dx, dy) {
        // 1. Вычисляем целевую клетку
        const nx = player.x + dx;
        const ny = player.y + dy;

        // Если не двигаемся (например, пробел), просто пропускаем ход
        if (dx === 0 && dy === 0) {
            // Пропуск хода: двигаем NPC и врагов, но игрок стоит
            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return;
        }

        // 2. Проверка стен
        if (MapModule.isWall(nx, ny)) return;

        // 3. Проверка врагов (Атака)
        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            CombatModule.attack(player, enemy, (m, t) => RenderModule.log(m, t));
            checkDeath();
            
            if (player.hp <= 0) {
                RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
                renderFrame();
                return;
            }
            // После атаки ход переходит к другим существам
            moveNpcs();
            moveEnemies();
            renderFrame();
            return;
        }

        // 4. Проверка NPC (Взаимодействие)
        // Если на целевой клетке стоит NPC, мы говорим с ним, но НЕ двигаемся
        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === nx && n.y === ny) : null;
        if (npc) {
            RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            // NPC тоже могут немного подвинуться или просто постоять, пока мы говорим
            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return; 
        }

        // 5. Движение игрока (если путь свободен от стен, врагов и NPC)
        player.x = nx;
        player.y = ny;

        // 6. Подбор предметов
        const itemIdx = items.findIndex(i => i.x === nx && i.y === ny);
        if (itemIdx !== -1) {
            const item = items[itemIdx];
            player.inventory.push(item);
            RenderModule.log(`Подобрано: ${item.name}`, "loot");
            items.splice(itemIdx, 1);
        }

        // 7. Проверка лестниц
        // Спуск вниз
        if (MapModule.stairsDown && nx === MapModule.stairsDown.x && ny === MapModule.stairsDown.y) {
            const nextDepth = currentDepth + 1;
            RenderModule.log(`Вы спускаетесь на уровень ${nextDepth + 1}...`, "info");
            loadDungeonLevel(dungeonX, dungeonY, nextDepth, currentDungeonTypeName, currentDungeonFullName, 'down');
            return; // Загружаем новый уровень, дальнейшая логика не нужна
        }

        // Подъем вверх
        if (MapModule.stairsUp && nx === MapModule.stairsUp.x && ny === MapModule.stairsUp.y) {
            if (currentDepth === 0) {
                RenderModule.log("Вы поднимаетесь на поверхность...", "info");
                exitToGlobal();
            } else {
                const prevDepth = currentDepth - 1;
                RenderModule.log(`Вы поднимаетесь на уровень ${prevDepth + 1}...`, "info");
                loadDungeonLevel(dungeonX, dungeonY, prevDepth, currentDungeonTypeName, currentDungeonFullName, 'up');
            }
            return; // Загружаем уровень/карту
        }

        // 8. Ход других существ (только если игрок жив)
        if (player.hp > 0) {
            moveNpcs();
            moveEnemies();
        }

        if (player.hp <= 0) {
            RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
        }
    
        renderFrame();
    }

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДВИЖЕНИЯ ===
    
    // Движение NPC (стратегия: прямо до препятствия, затем смена направления)
    function moveNpcs() {
        if (!window.currentCityNpcs || window.currentCityNpcs.length === 0) return;

        const width = DataModule.MAP_WIDTH;
        const height = DataModule.MAP_HEIGHT;

        window.currentCityNpcs.forEach(npc => {
            // Если направления нет, задаем случайное
            if (!npc.direction) {
                const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
                npc.direction = dirs[Math.floor(Math.random() * dirs.length)];
            }

            let moved = false;
            let attempts = 0;

            // Пытаемся двигаться в текущем направлении
            while (!moved && attempts < 4) {
                const nx = npc.x + npc.direction.dx;
                const ny = npc.y + npc.direction.dy;

                // Проверка границ и стен
                if (nx < 0 || nx >= width || ny < 0 || ny >= height || MapModule.isWall(nx, ny)) {
                    npc.direction = getRandomDirection();
                    attempts++;
                    continue;
                }

                // Проверка коллизий с другими NPC и игроком
                const blockedByNpc = window.currentCityNpcs.some(other => other !== npc && other.x === nx && other.y === ny);
                const blockedByPlayer = (player.x === nx && player.y === ny);
                // Враги тоже препятствие для NPC
                const blockedByEnemy = enemies.some(e => e.hp > 0 && e.x === nx && e.y === ny);

                if (blockedByNpc || blockedByPlayer || blockedByEnemy) {
                    npc.direction = getRandomDirection();
                    attempts++;
                    continue;
                }

                // Путь свободен
                npc.x = nx;
                npc.y = ny;
                moved = true;
            }
        });
    }

    function getRandomDirection() {
        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
        return dirs[Math.floor(Math.random() * dirs.length)];
    }

    // Движение врагов (вынесено в отдельную функцию для чистоты кода)
    function moveEnemies() {
        enemies.forEach(e => {
            if (e.hp <= 0) return;
            const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
            
            // Агро-радиус 8 клеток
            if (dist < 8) {
                if (dist === 1) {
                    // Атака, если рядом
                    CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                    checkDeath();
                } else {
                    // Преследование по кратчайшему пути (A*)
                    const astar = new ROT.Path.AStar(player.x, player.y,
                        (x, y) => !MapModule.isWall(x, y), { topology: 8 });
                    
                    let next = null;
                    astar.compute(e.x, e.y, (x, y) => {
                        if (!next && (x !== e.x || y !== e.y)) next = { x, y };
                    });

                    if (next) {
                        // Не наступать на других врагов и NPC
                        const isBlockedByNpc = window.currentCityNpcs && window.currentCityNpcs.some(n => n.x === next.x && n.y === next.y);
                        const isBlockedByEnemy = enemies.some(other => other !== e && other.hp > 0 && other.x === next.x && other.y === next.y);
                        
                        if (!isBlockedByNpc && !isBlockedByEnemy) {
                            e.x = next.x;
                            e.y = next.y;
                        }
                    }
                }
            }
        });
    }
    
    function checkDeath() {
        enemies = enemies.filter(e => e.hp > 0);
    }
    // === ФУНКЦИЯ ОТРИСОВКИ КАДРА ===
    function renderFrame() {
        if (!player) return;
        
        // Передаем локальный массив npcs
        const vis = RenderModule.draw(player, enemies, items, npcs);
        
        vis.forEach(k => explored.add(k));
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawMinimap(player, explored);
    }
    return {
        init
    };
})();

window.onload = () => GameModule.init();
