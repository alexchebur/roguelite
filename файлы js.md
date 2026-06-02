
# ###game.js
```js

// =========================== Модуль игры (управление, ходы, загрузка уровней) ===========================
const GameModule = (function() {
    // === Состояние игры ===
    let player = null;
    let enemies = [];
    let items = [];
    let npcs = []; 
    let explored = new Set();
    let busy = false;
    
    // === Режимы: 'global' (глобальная карта) или 'dungeon' (подземелье) ===
    let gameMode = 'global';
    let entrancePos = null; 
    
    // === Подземельные координаты (для лестниц) ===
    let dungeonX = 0;
    let dungeonY = 0;
    let currentDepth = 0;  
    let currentDungeonTypeName = null; 
    let currentDungeonFullName = null; 
    
    // === Глобальные координаты ===
    let currentLocData = null;
    let currentWorldTrend = null;

    function init() {
        try {
            if (typeof RenderModule === 'undefined') {
                throw new Error("RenderModule не загружен");
            }
            RenderModule.init();
            RenderModule.setRedrawCallback(renderFrame);
        } catch (e) {
            console.error("Критическая ошибка при инициализации:", e);
            document.body.innerHTML = `<div style="color:red; padding:20px;">Ошибка загрузки игры: ${e.message}</div>`;
            return;
        }

        gameMode = 'global';
        
        if (typeof GlobalMapModule !== 'undefined') {
            const startPos = GlobalMapModule.initSafeStart(1, 1, 3);
            RenderModule.log(`Стартовая позиция: ${startPos.x}, ${startPos.y}`, "info");
        } else {
            RenderModule.log("Ошибка: GlobalMapModule не найден", "combat");
            return;
        }
        
        renderGlobalMap();
        
        window.addEventListener("keydown", (e) => handleInput(e));
        addTouchControls();

        // Обработка кликов мышью (только для ПК)
        const mapContainer = document.getElementById("map-container");
        if (mapContainer) {
            mapContainer.addEventListener("mousedown", (e) => {
                if (!isMobileDevice() && gameMode === 'dungeon') {
                    handleMapClick(e.clientX, e.clientY);
                }
            });
        }
        
        RenderModule.log("Игра загружена. Режим: ГЛОБАЛЬНАЯ КАРТА", "info");
        RenderModule.log("Используйте стрелки для перемещения. Входите в города (C) и подземелья (D).", "info");
        RenderModule.log("💡 ПК: Клик для осмотра. Мобильные: Тап для осмотра, Свайп для движения.", "info");
    }

    // === ОБРАБОТКА КЛИКА/ТАПА ПО КАРТЕ (ОСМОТР) ===
    function handleMapClick(clientX, clientY) {
        if (!player || gameMode !== 'dungeon') return;

        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        const cellW = canvas.width / RenderModule.COLS;
        const cellH = canvas.height / RenderModule.ROWS;

        const sx = Math.floor(clickX / cellW);
        const sy = Math.floor(clickY / cellH);

        const cam = RenderModule.getCameraOffset(player);
        const wx = sx + cam.x;
        const wy = sy + cam.y;

        // Враги
        const enemy = enemies.find(en => en.hp > 0 && en.x === wx && en.y === wy);
        if (enemy) {
            const weapon = player.equipment.weapon;
            
            // Если экипировано дальнее оружие, пытаемся стрелять
            if (weapon && !weapon.meleeType) {
                const killed = CombatModule.rangedAttack(player, enemy, weapon, RenderModule.log, RenderModule.updateUI);
                if (killed) {
                    enemies = enemies.filter(e => e.hp > 0); // Удаляем труп
                }
                // После выстрела ход переходит к врагам
                moveNpcs();
                moveEnemies();
                renderFrame();
            } else {
                // Иначе просто осмотр
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`⚔️ ${enemy.name}`, `HP: ${enemy.hp}/${enemy.maxHp}\nATK: ${enemy.atk} | DEF: ${enemy.def}`, "enemy");
                }
                RenderModule.log(`Осмотр: ${enemy.name} [HP:${enemy.hp} ATK:${enemy.atk}]`, "info");
            }
            return;
        }

        // NPC
        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === wx && n.y === wy) : null;
        if (npc) {
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(`☺ ${npc.name}`, `"${npc.dialog}"`, "npc");
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
                RenderModule.updateInspector(`🎒 ${item.name}`, details, "loot");
             }
            RenderModule.log(`Предмет: ${item.name}`, "loot");
            return;
        }

        if (typeof RenderModule.updateInspector === 'function') {
            RenderModule.updateInspector("Пусто", "Здесь ничего нет...", "neutral");
        }
    }

    // === ОБРАБОТКА СЕНСОРНОГО УПРАВЛЕНИЯ ===
    // === Обработка сенсорного управления (Движение по касанию) ===
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) {
            console.warn("Canvas не найден для сенсорного управления");
            return;
        }

        // Обработчик касания для движения
        canvas.addEventListener("touchstart", (e) => {
            e.preventDefault(); // Предотвращаем скролл страницы
            
            if (busy || (player && player.hp <= 0)) return;
            
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            
            // Координаты касания относительно левого верхнего угла canvas
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;
            
            // Центр экрана
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            let dx = 0, dy = 0;
            const offsetX = touchX - centerX;
            const offsetY = touchY - centerY;
            
            // Определяем направление по большей оси (горизонталь или вертикаль)
            if (Math.abs(offsetX) > Math.abs(offsetY)) {
                dx = offsetX > 0 ? 1 : -1;
            } else {
                dy = offsetY > 0 ? 1 : -1;
            }
            
            // Выполняем ход
            if (gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }

            // === ПАРАЛЛЕЛЬНАЯ ИНСПЕКЦИЯ (если попали в существо) ===
            // Так как мы уже сделали ход, игрок мог сместиться, но мы проверяем 
            // клетку, на которую только что попытались шагнуть (или где стоим, если стена)
            // Для простоты вызываем инспекцию по координатам касания на карте
            
            // Вычисляем координаты клетки, на которую нажали
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const clickX = (touch.clientX - rect.left) * scaleX;
            const clickY = (touch.clientY - rect.top) * scaleY;
            
            const cellW = canvas.width / RenderModule.COLS;
            const cellH = canvas.height / RenderModule.ROWS;
            
            const sx = Math.floor(clickX / cellW);
            const sy = Math.floor(clickY / cellH);
            
            // Важно: камера могла сместиться, если ход был успешным. 
            // Но для мгновенной реакции лучше использовать позицию игрока ДО хода или просто текущую.
            // Используем текущую камеру для точности отображения того, что под пальцем СЕЙЧАС.
            const cam = RenderModule.getCameraOffset(player);
            const wx = sx + cam.x;
            const wy = sy + cam.y;

            // Проверяем, есть ли там кто-то, и выводим инфо
            const enemy = enemies.find(en => en.hp > 0 && en.x === wx && en.y === wy);
            if (enemy) {
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`⚔️ ${enemy.name}`, `HP: ${enemy.hp}/${enemy.maxHp}\nATK: ${enemy.atk} | DEF: ${enemy.def}`, "enemy");
                }
            }

            const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === wx && n.y === wy) : null;
            if (npc) {
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`☺ ${npc.name}`, `"${npc.dialog}"`, "npc");
                }
            }
            
        }, { passive: false });
        
        if (isMobileDevice()) {
            RenderModule.log("💡 Коснитесь части экрана для движения", "info");
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
            currentDungeonTypeName = poi.dungeonType;
            currentDungeonFullName = poi.name;
            loadDungeonLevel(poi.x, poi.y, currentDepth, poi.dungeonType, poi.name);
        }
        busy = false;
    }
    
    function exitToGlobal() {
        gameMode = 'global';
        if (entrancePos) {
            GlobalMapModule.setPlayerPosition(entrancePos.x, entrancePos.y);
            entrancePos = null;
        }
        if (MapModule.clearCache) MapModule.clearCache();

        dungeonX = 0;
        dungeonY = 0;
        currentDepth = 0;
        currentDungeonTypeName = null;
        currentDungeonFullName = null;
        enemies = [];
        items = [];
        npcs = [];
        window.currentCityNpcs = [];
        explored.clear();
       
        RenderModule.log("Вы вернулись на поверхность", "info");
        renderGlobalMap();
    }
    
// В файле game.js

// ... существующий код ...

    // === ЗАГРУЗКА ГОРОДА ===
    function loadCityLevel(gx, gy, cityName) {
        enemies = []; 
        items = [];
        npcs = [];
        window.currentCityNpcs = [];
        explored.clear();
        
        const startPos = MapModule.generateCity(gx, gy, 0);
        
        if (!player) player = EntityModule.createPlayer(startPos.x, startPos.y);
        else {
            player.x = startPos.x;
            player.y = startPos.y;
        }
        
        if (typeof NpcGeneratorModule !== 'undefined' && NpcGeneratorModule.generateCityNpcs) {
            try {
                const generatedNpcs = NpcGeneratorModule.generateCityNpcs(gx, gy, MapModule.currentMapData, startPos);
                npcs = generatedNpcs;
                window.currentCityNpcs = generatedNpcs;
            } catch (e) {
                console.error("Ошибка генерации NPC:", e);
            }
        }

        // === ИЗМЕНЕНИЕ: Спавн предметов внутри зданий ===
        if (EntityModule.spawnItemsInCity) {
            // Получаем координаты внутренних помещений из MapModule
            const interior = MapModule.interiorCoords || [];
            
            items = EntityModule.spawnItemsInCity(
                interior,          // Список разрешенных клеток (внутри зданий)
                DataModule.ITEM_TYPES,
                6,                 // Количество предметов
                1.0,               // Множитель силы
                2                  // (Этот параметр не используется в новой функции, можно убрать или адаптировать)
            );
        } else {
            // Fallback: если новая функция не загружена, используем старый метод (предметы везде)
            if (EntityModule.spawnItems) {
                items = EntityModule.spawnItems(MapModule.currentMapData, player, DataModule.ITEM_TYPES, 6, 1.0, 2);
            }
        }
        
        currentLocData = {
            fullName: cityName,
            description: "Безопасное место. Здесь можно отдохнуть.",
            themeName: "Город"
        };
        currentWorldTrend = null;
        renderFrame();
    }    


    
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    function loadDungeonLevel(gx, gy, depth, dungeonType, dungeonName, entryPoint = null) {
        enemies = [];
        items = [];
        npcs = [];
        window.currentCityNpcs = []; // На всякий случай
        explored.clear();
    
        const startPos = MapModule.generateWithType(gx, gy, depth, dungeonType, entryPoint);
    
        dungeonX = gx;
        dungeonY = gy;
        currentDepth = depth;
        currentDungeonTypeName = dungeonType;
        currentDungeonFullName = dungeonName;
    
        if (!player) player = EntityModule.createPlayer(startPos.x, startPos.y);
        else {
            player.x = startPos.x;
            player.y = startPos.y;
        }
    
        spawnDungeonEntities(gx, gy, depth);
    
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
    
    // === СПАВН СУЩНОСТЕЙ С УЧЕТОМ ГЛУБИНЫ ===
    function spawnDungeonEntities(gx, gy, depth) {
        // 1. Спавн врагов
        const enemyCount = 8 + Math.floor(depth * 1.5);
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy) * (1 + depth * 0.2);
        
        // Фильтрация врагов по глубине
        let availableEnemies = DataModule.ENEMY_TYPES;
        if (depth < 3) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Гоблин", "Крыса", "Волк", "Слизень"].includes(e.name));
        } else if (depth < 7) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Бандит", "Скелет", "Орк", "Зомби"].includes(e.name));
        }
        // Если глубина >= 7, доступны все

        enemies = EntityModule.spawnEnemies(
            MapModule.currentMapData,
            player,
            availableEnemies,
            enemyCount,
            enemyMult,
            3
        );
        
        // 2. Спавн обычных предметов (оружие, броня, зелья)
        // Убран фиксированный сид: лут теперь генерируется случайно при каждом входе
        const itemMult = WorldCurveModule.getItemPowerMultiplier(gx, gy) * (1 + depth * 0.15);
        
        if (EntityModule.spawnItems) {
            items = EntityModule.spawnItems(
                MapModule.currentMapData,
                player,
                DataModule.ITEM_TYPES,
                4, // Количество обычных предметов
                itemMult,
                3
            );
        }

        // 3. Спавн золота через EntityModule (случайное распределение при каждом входе)
        const goldTemplate = DataModule.ITEM_TYPES.find(item => item.type === 'gold');
        if (goldTemplate && EntityModule.spawnGold) {
            // Количество кучек: 2 на 1-м уровне, +1 за каждые 2 уровня глубины
            const goldPilesCount = 2 + Math.floor(depth / 2);
            const worldGoldMult = WorldCurveModule.getGoldMultiplier ? WorldCurveModule.getGoldMultiplier(gx, gy) : 1;
            
            const goldItems = EntityModule.spawnGold(
                MapModule.currentMapData,
                player,
                goldTemplate,
                goldPilesCount,
                depth,
                worldGoldMult
            );
            
            // Добавляем сгенерированное золото в общий массив предметов levels
            items.push(...goldItems);
        }
    }  
    function renderGlobalMap() {
        const playerPos = GlobalMapModule.getPlayerPosition();
        RenderModule.drawGlobalMap(playerPos.x, playerPos.y);
        document.getElementById("ui-loc-coords").textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
        
        if (player) {
            const globalLocData = {
                fullName: "Глобальная карта",
                description: "Исследуйте мир, находите города и подземелья",
                themeName: "Поверхность"
            };
            RenderModule.updateUI(player, globalLocData, null);
        } else {
            document.getElementById("ui-loc-name").textContent = "Глобальная карта";
            document.getElementById("ui-loc-desc").textContent = "Исследуйте мир...";
            document.getElementById("ui-loc-type").textContent = `Режим: ГЛОБАЛЬНАЯ КАРТА`;
            document.getElementById("ui-stats").innerHTML = "<div class='stat-row'><span>Глобальный режим</span></div>";
            document.getElementById("ui-equip").innerHTML = "<div class='equip-slot'>─</div>";
            const invDiv = document.getElementById("inventory-list");
            if (invDiv) invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
        }
        RenderModule.drawGlobalMinimap(playerPos.x, playerPos.y);
    }

    function handleInput(e) {
        if (busy || (player && player.hp <= 0)) return;
        
        let dx = 0, dy = 0;
        if (e.key === "ArrowUp") dy = -1;
        if (e.key === "ArrowDown") dy = 1;
        if (e.key === "ArrowLeft") dx = -1;
        if (e.key === "ArrowRight") dx = 1;
        
        if (dx !== 0 || dy !== 0 || e.key === " ") {
            e.preventDefault();
            if (gameMode === 'global') processGlobalTurn(dx, dy);
            else processTurn(dx, dy);
        }
    }

    // === ДВИЖЕНИЕ NPC И ВРАГОВ ===
    function moveNpcs() {
        if (!window.currentCityNpcs || window.currentCityNpcs.length === 0) return;
        const width = DataModule.MAP_WIDTH;
        const height = DataModule.MAP_HEIGHT;

        window.currentCityNpcs.forEach(npc => {
            if (!npc.direction) {
                const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
                npc.direction = dirs[Math.floor(Math.random() * dirs.length)];
            }

            let moved = false;
            let attempts = 0;
            while (!moved && attempts < 4) {
                const nx = npc.x + npc.direction.dx;
                const ny = npc.y + npc.direction.dy;

                if (nx < 0 || nx >= width || ny < 0 || ny >= height || MapModule.isWall(nx, ny)) {
                    npc.direction = getRandomDirection();
                    attempts++;
                    continue;
                }

                const blockedByNpc = window.currentCityNpcs.some(other => other !== npc && other.x === nx && other.y === ny);
                const blockedByPlayer = (player.x === nx && player.y === ny);
                const blockedByEnemy = enemies.some(e => e.hp > 0 && e.x === nx && e.y === ny);

                if (blockedByNpc || blockedByPlayer || blockedByEnemy) {
                    npc.direction = getRandomDirection();
                    attempts++;
                    continue;
                }

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

    function moveEnemies() {
        enemies.forEach(e => {
            if (e.hp <= 0) return;
            const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
            
            if (dist < 8) {
                if (dist === 1) {
                    CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                    checkDeath();
                } else {
                    const astar = new ROT.Path.AStar(player.x, player.y,
                        (x, y) => !MapModule.isWall(x, y), { topology: 8 });
                    
                    let next = null;
                    astar.compute(e.x, e.y, (x, y) => {
                        if (!next && (x !== e.x || y !== e.y)) next = { x, y };
                    });

                    if (next) {
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
        const deadEnemies = enemies.filter(e => e.hp <= 0);
        
        deadEnemies.forEach(enemy => {
            // ✅ ИСПРАВЛЕНО: правильный порядок аргументов (enemy, depth, itemsArray, logFn)
            CombatModule.dropLoot(enemy, currentDepth, items, RenderModule.log);
        });

        // Удаляем мертвых из массива
        enemies = enemies.filter(e => e.hp > 0);
    }
    // === ОСНОВНОЙ ХОД ИГРЫ ===
    function processTurn(dx, dy) {
        const nx = player.x + dx;
        const ny = player.y + dy;

        if (dx === 0 && dy === 0) {
            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return;
        }

        if (MapModule.isWall(nx, ny)) return;

        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            CombatModule.attack(player, enemy, (m, t) => RenderModule.log(m, t));
            checkDeath();
            if (player.hp <= 0) {
                RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
                renderFrame();
                return;
            }
            moveNpcs();
            moveEnemies();
            renderFrame();
            return;
        }

        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === nx && n.y === ny) : null;
        if (npc) {
            RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return; 
        }

        player.x = nx;
        player.y = ny;

        const itemIdx = items.findIndex(i => i.x === nx && i.y === ny);
        if (itemIdx !== -1) {
            const item = items[itemIdx];
        
            if (item.type === 'gold') {
                player.gold += item.val;
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
            } else {
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
            }
        
            items.splice(itemIdx, 1);
        }

        if (MapModule.stairsDown && nx === MapModule.stairsDown.x && ny === MapModule.stairsDown.y) {
            const nextDepth = currentDepth + 1;
            RenderModule.log(`Вы спускаетесь на уровень ${nextDepth + 1}...`, "info");
            loadDungeonLevel(dungeonX, dungeonY, nextDepth, currentDungeonTypeName, currentDungeonFullName, 'down');
            return; 
        }

        if (MapModule.stairsUp && nx === MapModule.stairsUp.x && ny === MapModule.stairsUp.y) {
            if (currentDepth === 0) {
                RenderModule.log("Вы поднимаетесь на поверхность...", "info");
                exitToGlobal();
            } else {
                const prevDepth = currentDepth - 1;
                RenderModule.log(`Вы поднимаетесь на уровень ${prevDepth + 1}...`, "info");
                loadDungeonLevel(dungeonX, dungeonY, prevDepth, currentDungeonTypeName, currentDungeonFullName, 'up');
            }
            return; 
        }

        if (player.hp > 0) {
            moveNpcs();
            moveEnemies();
        }

        if (player.hp <= 0) {
            RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
        }
    
        renderFrame();
    }

    function renderFrame() {
        if (!player) return;
        const vis = RenderModule.draw(player, enemies, items, npcs);
        vis.forEach(k => explored.add(k));
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawMinimap(player, explored);
    }
    // ... (внутри GameModule) ...
    
    function getPlayer() {
        return player;
    }

    return {
        init,
        getPlayer // <--- ДОБАВИТЬ
    };
})();

window.onload = () => GameModule.init();
```
# dungeon_generator.js
```js


/**
 * МОДУЛЬ ГЕНЕРАЦИИ ПОДЗЕМЕЛИЙ (dungeon_generator.js)
 * Использует SeededRandom и createSeed из name_generator.js
 */

// Проверка зависимостей
if (typeof SeededRandom === 'undefined' || typeof createSeed === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед dungeon_generator.js");
}

const DUNGEON_TYPES = [
    { name: 'dungeon', weight: 30, emoji: '🟫', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#333', wallColor: '#555' }, 
    { name: 'cave', weight: 25, emoji: '🕸️', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#2a2a2a', wallColor: '#4a3b3b' },
    { name: 'icy', weight: 20, emoji: '❄️', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#aaddff', wallColor: '#ffffff' },
    { name: 'rogue', weight: 10, emoji: '🌫️', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#1a1a1a', wallColor: '#2a2a2a' },
    { name: 'cellular', weight: 10, emoji: '🧿', floorChar: getChar('FLOOR_ORGANIC'), wallChar: getChar('WALL_ORGANIC'), floorColor: '#4caf50', wallColor: '#2e7d32' },
    { name: 'arena', weight: 3, emoji: '🦴', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#5d4037', wallColor: '#3e2723' },
    { name: 'boss', weight: 2, emoji: '👑', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#b71c1c', wallColor: '#880e4f' }
];

const TOTAL_WEIGHT = DUNGEON_TYPES.reduce((sum, t) => sum + t.weight, 0);

function selectDungeonType(rand) {
    rand.next(); rand.next(); rand.next();
    const r = rand.next();
    let cumulative = 0;
    for (const type of DUNGEON_TYPES) {
        cumulative += type.weight / TOTAL_WEIGHT;
        if (r < cumulative) return type;
    }
    return DUNGEON_TYPES[DUNGEON_TYPES.length - 1];
}

function generateRoomCorridorMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const rooms = [];
    const roomCount = rand.int(10, 20);
    for (let i = 0; i < roomCount; i++) {
        const w = rand.int(4, 8);
        const h = rand.int(4, 8);
        const x = rand.int(1, width - w - 1);
        const y = rand.int(1, height - h - 1);
        let overlaps = false;
        for (const r of rooms) {
            if (x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) continue;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                grid[y + dy][x + dx] = 0;
            }
        }
        rooms.push({x, y, w, h});
    }
    if (rooms.length > 1) {
        for (let i = 0; i < rooms.length - 1; i++) {
            const r1 = rooms[i];
            const r2 = rooms[i + 1];
            const cx1 = Math.floor(r1.x + r1.w / 2);
            const cy1 = Math.floor(r1.y + r1.h / 2);
            const cx2 = Math.floor(r2.x + r2.w / 2);
            const cy2 = Math.floor(r2.y + r2.h / 2);
            const stepX = cx1 <= cx2 ? 1 : -1;
            for (let x = cx1; stepX > 0 ? x <= cx2 : x >= cx2; x += stepX) {
                if (cy1 >= 0 && cy1 < height && x >= 0 && x < width) grid[cy1][x] = 0;
            }
            const stepY = cy1 <= cy2 ? 1 : -1;
            for (let y = cy1; stepY > 0 ? y <= cy2 : y >= cy2; y += stepY) {
                if (y >= 0 && y < height && cx2 >= 0 && cx2 < width) grid[y][cx2] = 0;
            }
        }
    }
    return grid;
}

function generateCellularMap(rand, width, height) {
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = 0.45;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rand.next() < fillChance) grid[y][x] = 0;
        }
    }
    for (let iter = 0; iter < 4; iter++) {
        const newGrid = Array(height).fill().map(() => Array(width).fill(1));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    newGrid[y][x] = 1;
                    continue;
                }
                let wallCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (grid[y + dy][x + dx] === 1) wallCount++;
                    }
                }
                newGrid[y][x] = (wallCount >= 5) ? 1 : 0;
            }
        }
        grid = newGrid;
    }
    return grid;
}

function generateArenaMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const margin = 2;
    for (let y = margin; y < height - margin; y++) {
        for (let x = margin; x < width - margin; x++) {
            grid[y][x] = 0;
        }
    }
    const colCount = rand.int(5, 15);
    for (let i = 0; i < colCount; i++) {
        const cx = rand.int(margin + 2, width - margin - 3);
        const cy = rand.int(margin + 2, height - margin - 3);
        if (Math.abs(cx - width/2) < 3 && Math.abs(cy - height/2) < 3) continue;
        grid[cy][cx] = 1;
        if (rand.next() > 0.5) {
            if(cx+1 < width-margin) grid[cy][cx+1] = 1;
            if(cy+1 < height-margin) grid[cy+1][cx] = 1;
            if(cx+1 < width-margin && cy+1 < height-margin) grid[cy+1][cx+1] = 1;
        }
    }
    return grid;
}

const DungeonGeneratorModule = {
    generateLevel: function(x, y, depth, width, height) {
        const seedVal = createSeed(x, y, depth);
        const rand = new SeededRandom(seedVal);
        const dungeonType = selectDungeonType(rand);
        let mapGrid;
        if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
            mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };
        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r<Math.max(width,height); r++) {
                for(let dy=-r; dy<=r; dy++) {
                    for(let dx=-r; dx<=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny>=0 && ny<height && nx>=0 && nx<width && mapGrid[ny][nx]===0) {
                            startPos = {x: nx, y: ny};
                            found = true;
                            break;
                        }
                    }
                    if(found) break;
                }
                if(found) break;
            }
        }
        return {
            mapData: mapGrid,
            dungeonType: dungeonType,
            startPos: startPos,
            seed: seedVal
        };
    },

    generateLevelWithType: function(x, y, depth, width, height, forcedType) {
        const seedVal = createSeed(x, y, depth);
        const rand = new SeededRandom(seedVal);
        let dungeonType = DUNGEON_TYPES.find(t => t.name === forcedType);
        if (!dungeonType) {
            dungeonType = selectDungeonType(rand);
        }
        let mapGrid;
        if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
            mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };
        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r<Math.max(width,height); r++) {
                for(let dy=-r; dy<=r; dy++) {
                    for(let dx=-r; dx<=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny>=0 && ny<height && nx>=0 && nx<width && mapGrid[ny][nx]===0) {
                            startPos = {x: nx, y: ny};
                            found = true;
                            break;
                        }
                    }
                    if(found) break;
                }
                if(found) break;
            }
        }
        return {
            mapData: mapGrid,
            dungeonType: dungeonType,
            startPos: startPos,
            seed: seedVal
        };
    }
};
```
#
# ##entity.js
```js

// =========================== Модуль сущностей (игрок, враги, предметы) ===========================
const EntityModule = (function() {
    function createPlayer(x, y) {
        return {
            x: x, y: y,
            char: "@", color: "#FFF",
            hp: 100, maxHp: 100,
            atk: 5, def: 3,
            level: 1, xp: 0,
            gold: 0,
            inventory: [],
            equipment: { weapon: null, armor: null }
        };
    }

    function createEnemy(template, x, y, difficultyMult) {
        const hp = Math.floor(((template.hp[0] + template.hp[1]) / 2) * difficultyMult);
        const atk = Math.floor(((template.atk[0] + template.atk[1]) / 2) * difficultyMult);
        const def = Math.floor(((template.def[0] + template.def[1]) / 2) * difficultyMult);

        return {
            x: x, y: y, name: template.name,
            char: template.char, color: template.color,
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true
        };
    }

    // === Вспомогательная функция: выбор формы прилагательного ===
    function getAdjectiveForm(adjObj, gender, plural) {
        if (!adjObj) return "";
        if (plural) return adjObj.plural;
        if (gender === "she") return adjObj.she;
        if (gender === "it") return adjObj.it;
        return adjObj.base; 
    }

    function createItem(template, x, y, itemPowerMult) {
        let name = template.baseName;
        let finalVal = 0;

        // 1. Логика для ЗОЛОТА (отдельная обработка)
        if (template.type === 'gold') {
            const baseAmount = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
            finalVal = Math.max(1, Math.floor(baseAmount * itemPowerMult));
            name = `${finalVal} золотых`;
        } 
        // 2. Логика для ОБЫЧНЫХ ПРЕДМЕТОВ
        else {
            const adjTemplate = DataModule.ITEM_ADJECTIVES[Math.floor(Math.random() * DataModule.ITEM_ADJECTIVES.length)];
            const adj = getAdjectiveForm(adjTemplate, template.gender, template.plural);
            name = `${adj} ${template.baseName}`;
            const baseVal = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
            finalVal = Math.max(1, Math.floor(baseVal * itemPowerMult));
        }

        // 3. Создание объекта предмета
        return {
            x: x, y: y, 
            name: name,
            char: template.char, 
            color: template.color,
            type: template.type,
            stat: template.stat,
            effect: template.effect,
            val: finalVal,
            isItem: true,
            meleeType: template.meleeType !== undefined ? template.meleeType : true,
            range: template.range || 1,
            maxAmmo: template.maxAmmo || 0,
            currentAmmo: template.maxAmmo || 0
        };
    }

    // === НОВАЯ ФУНКЦИЯ: Фильтрация врагов по уровню ===
    function getAvailableEnemies(depth) {
        if (depth <= 2) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Крыса", "Гоблин", "Волк", "Слизень"].includes(e.name)
            );
        } else if (depth <= 6) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Бандит", "Скелет", "Орк-разведчик", "Зомби", "Гарпия", "Призрак"].includes(e.name)
            );
        } else {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Тролль", "Вампир", "Лич", "Голем", "Демон", "Дракон"].includes(e.name)
            );
        }
    }

    // Безопасное размещение врагов
    function spawnEnemies(mapGrid, startPos, enemyTemplates, count, difficultyMult, minDist = 3, depth = 0) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        const availableTemplates = getAvailableEnemies(depth);
        const templatesToUse = availableTemplates.length > 0 ? availableTemplates : enemyTemplates;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= 4) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        // Fisher-Yates shuffle
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedEnemies = [];
        const occupiedCoords = [];

        for (const tile of validTiles) {
            if (placedEnemies.length >= count) break;
            let tooClose = false;
            for (const occ of occupiedCoords) {
                if (Math.abs(tile.x - occ.x) + Math.abs(tile.y - occ.y) < minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                occupiedCoords.push({ x: tile.x, y: tile.y });
                const template = templatesToUse[Math.floor(Math.random() * templatesToUse.length)];
                placedEnemies.push(createEnemy(template, tile.x, tile.y, difficultyMult));
            }
        }
        return placedEnemies;
    }

    // Размещение предметов (оружие, броня, зелья)
    function spawnItems(mapGrid, startPos, itemTemplates, count, itemPowerMult, minDistFromPlayer = 3) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= minDistFromPlayer) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedItems = [];
        // Исключаем золото из обычного спавна предметов
        const nonGoldTemplates = itemTemplates.filter(t => t.type !== 'gold');
        
        for (let i = 0; i < Math.min(count, validTiles.length); i++) {
            const tile = validTiles[i];
            const template = nonGoldTemplates[Math.floor(Math.random() * nonGoldTemplates.length)];
            placedItems.push(createItem(template, tile.x, tile.y, itemPowerMult));
        }
        return placedItems;
    }

    // === НОВАЯ ФУНКЦИЯ: Случайное разбрасывание золота ===
    // Вызывается отдельно при каждом входе в подземелье для генерации нового распределения
    function spawnGold(mapGrid, startPos, goldTemplate, count, depth, worldGoldMult = 1) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        // Собираем все проходимые клетки, кроме стартовой позиции игрока
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= 3) { // Не спавним золото прямо у ног
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        // Перемешиваем клетки для случайного выбора
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const goldPiles = [];
        const placed = new Set(); // Чтобы не класть две кучки в одну клетку

        for (let i = 0; i < Math.min(count, validTiles.length); i++) {
            const tile = validTiles[i];
            const key = `${tile.x},${tile.y}`;
            if (placed.has(key)) continue;
            placed.add(key);

            // Расчёт количества золота: база × множитель глубины × множитель мира
            const depthBonus = 1 + (depth * 0.1); // +50% за каждый уровень глубины
            const baseAmount = Math.floor(goldTemplate.val[0] + Math.random() * (goldTemplate.val[1] - goldTemplate.val[0]));
            const finalAmount = Math.max(1, Math.floor(baseAmount * depthBonus * worldGoldMult));

            goldPiles.push({
                x: tile.x,
                y: tile.y,
                name: `${finalAmount} золотых`,
                char: '$',
                color: '#FFD700',
                type: 'gold',
                val: finalAmount,
                isItem: true
            });
        }
        return goldPiles;
    }




    // === НОВАЯ ФУНКЦИЯ: Спавн предметов ВНУТРИ зданий (для городов) ===
    function spawnItemsInCity(interiorCoords, itemTemplates, count, itemPowerMult) {
        if (!interiorCoords || interiorCoords.length === 0) {
            console.warn("Нет внутренних помещений для спавна предметов");
            return [];
        }

        // Перемешиваем доступные внутренние клетки
        const shuffledCoords = [...interiorCoords];
        for (let i = shuffledCoords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledCoords[i], shuffledCoords[j]] = [shuffledCoords[j], shuffledCoords[i]];
        }

        const placedItems = [];
        // Берем столько клеток, сколько нужно предметов (или сколько есть)
        const limit = Math.min(count, shuffledCoords.length);

        for (let i = 0; i < limit; i++) {
            const pos = shuffledCoords[i];
            const template = itemTemplates[Math.floor(Math.random() * itemTemplates.length)];
            // Создаем предмет на этой позиции
            placedItems.push(createItem(template, pos.x, pos.y, itemPowerMult));
        }

        return placedItems;
    }

    return {
        createPlayer,
        createEnemy,
        createItem,
        spawnEnemies,
        spawnItems,
        spawnGold,
        spawnItemsInCity // <--- ДОБАВИТЬ ЭКСПОРТ
    };
})();

```




# ###globalMap.js
```js

/**
 * МОДУЛЬ ГЛОБАЛЬНОЙ КАРТЫ (globalMap.js)
 * Бесконечная карта, разбитая на чанки.
 * Генерация ландшафта, дорог, городов и входов в подземелья.
 */

// Конфигурация
const GLOBAL_CONFIG = {
    CHUNK_SIZE: 50,          // размер чанка в клетках
    WORLD_SEED: 12345,       // общий сид мира (можно менять)
    CITY_DENSITY: 0.02,      // вероятность города на клетку
    DUNGEON_DENSITY: 0.03,   // вероятность входа в подземелье на клетку
    ROAD_CONNECT_RADIUS: 30  // радиус соединения дорогами POI
};

// Кэш чанков: ключ "cx,cy" -> { tiles, pois }
const chunkCache = new Map();

// Текущая позиция игрока (глобальные координаты)
let playerGlobalX = 0;
let playerGlobalY = 0;

// === Вспомогательные функции ===

// Детерминированный генератор случайных чисел для чанка
function getChunkRandom(cx, cy) {
    const seed = GLOBAL_CONFIG.WORLD_SEED + cx * 1000003 + cy * 1000033;
    return new SeededRandom(seed);
}

// Генерация ландшафта (типы клеток) для чанка
function generateTerrain(rand, width, height) {
    const tiles = Array(height).fill().map(() => Array(width).fill('plain'));
    
    // Горы: случайные области
    const mountainCount = rand.int(5, 15);
    for (let i = 0; i < mountainCount; i++) {
        const mx = rand.int(0, width-1);
        const my = rand.int(0, height-1);
        const radius = rand.int(1, 3);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = mx+dx, y = my+dy;
                if (x>=0 && x<width && y>=0 && y<height && Math.abs(dx)+Math.abs(dy) <= radius) {
                    if (tiles[y][x] !== 'city' && tiles[y][x] !== 'dungeon_entrance') {
                        tiles[y][x] = 'mountain';
                    }
                }
            }
        }
    }
    
    // Леса: случайные точки
    const forestCount = rand.int(10, 30);
    for (let i = 0; i < forestCount; i++) {
        const fx = rand.int(0, width-1);
        const fy = rand.int(0, height-1);
        if (tiles[fy][fx] === 'plain') tiles[fy][fx] = 'forest';
    }
    
    // Реки (линии)
    const riverCount = rand.int(1, 3);
    for (let r = 0; r < riverCount; r++) {
        let x = rand.int(0, width-1);
        let y = rand.int(0, height-1);
        for (let step = 0; step < 30; step++) {
            if (x>=0 && x<width && y>=0 && y<height && 
                tiles[y][x] !== 'mountain' && 
                tiles[y][x] !== 'city' && 
                tiles[y][x] !== 'dungeon_entrance') {
                tiles[y][x] = 'water';
            }
            const dir = rand.int(0, 3);
            if (dir === 0) x++;
            else if (dir === 1) x--;
            else if (dir === 2) y++;
            else y--;
        }
    }
    return tiles;
}

// Генерация точек интереса (города, входы в подземелья)
function generatePOIs(rand, cx, cy, tiles) {
    const pois = [];
    const width = GLOBAL_CONFIG.CHUNK_SIZE;
    const height = GLOBAL_CONFIG.CHUNK_SIZE;
    
    // Города
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if ((tiles[y][x] === 'plain' || tiles[y][x] === 'forest') && rand.next() < GLOBAL_CONFIG.CITY_DENSITY) {
                tiles[y][x] = 'city';
                const globalX = cx * width + x;
                const globalY = cy * height + y;
                const cityName = NameGeneratorModule.generateCityName(globalX, globalY);
                pois.push({ x: globalX, y: globalY, type: 'city', name: cityName });
            }
        }
    }
    
    // Входы в подземелья (чаще в горах или рядом)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isMountainArea = tiles[y][x] === 'mountain';
            const isPlainNearby = !isMountainArea && (tiles[y][x] === 'plain' || tiles[y][x] === 'forest');
            if ((isMountainArea || isPlainNearby) && rand.next() < GLOBAL_CONFIG.DUNGEON_DENSITY) {
                if (tiles[y][x] !== 'city') {
                    tiles[y][x] = 'dungeon_entrance';
                    const globalX = cx * width + x;
                    const globalY = cy * height + y;
                    const dungeonTypes = DUNGEON_TYPES.map(t => t.name);
                    const dungeonType = rand.choice(dungeonTypes);
                    const { fullName } = NameGeneratorModule.generateLocationData(globalX, globalY, dungeonType);
                    pois.push({ x: globalX, y: globalY, type: 'dungeon', dungeonType: dungeonType, name: fullName });
                }
            }
        }
    }
    return pois;
}

// Построение дорог между точками интереса
function connectPOIsWithRoads(tiles, poisLocal, rand) {
    if (poisLocal.length < 2) return;
    
    const edges = [];
    for (let i = 0; i < poisLocal.length; i++) {
        let closest = null;
        let minDist = Infinity;
        for (let j = 0; j < poisLocal.length; j++) {
            if (i === j) continue;
            const dist = Math.abs(poisLocal[i].x - poisLocal[j].x) + Math.abs(poisLocal[i].y - poisLocal[j].y);
            if (dist < minDist) {
                minDist = dist;
                closest = j;
            }
        }
        if (closest !== null) {
            edges.push([i, closest]);
        }
    }
    
    const uniqueEdges = [];
    for (const [a,b] of edges) {
        if (!uniqueEdges.some(e => (e[0]===a && e[1]===b) || (e[0]===b && e[1]===a))) {
            uniqueEdges.push([a,b]);
        }
    }
    
    for (const [i,j] of uniqueEdges) {
        const p1 = poisLocal[i];
        const p2 = poisLocal[j];
        
        const stepX = p1.x <= p2.x ? 1 : -1;
        for (let x = p1.x; stepX > 0 ? x <= p2.x : x >= p2.x; x += stepX) {
            if (x >= 0 && x < tiles[0].length && p1.y >= 0 && p1.y < tiles.length) {
                if (tiles[p1.y][x] !== 'mountain' && tiles[p1.y][x] !== 'water') {
                    tiles[p1.y][x] = 'road';
                }
            }
        }
        const stepY = p1.y <= p2.y ? 1 : -1;
        for (let y = p1.y; stepY > 0 ? y <= p2.y : y >= p2.y; y += stepY) {
            if (y >= 0 && y < tiles.length && p2.x >= 0 && p2.x < tiles[0].length) {
                if (tiles[y][p2.x] !== 'mountain' && tiles[y][p2.x] !== 'water') {
                    tiles[y][p2.x] = 'road';
                }
            }
        }
    }
}

// Генерация целого чанка
function generateChunk(cx, cy) {
    const rand = getChunkRandom(cx, cy);
    const tiles = generateTerrain(rand, GLOBAL_CONFIG.CHUNK_SIZE, GLOBAL_CONFIG.CHUNK_SIZE);
    const pois = generatePOIs(rand, cx, cy, tiles);
    
    const poisLocal = pois.map(p => ({ 
        x: p.x - cx * GLOBAL_CONFIG.CHUNK_SIZE, 
        y: p.y - cy * GLOBAL_CONFIG.CHUNK_SIZE 
    }));
    connectPOIsWithRoads(tiles, poisLocal, rand);
    
    return { tiles, pois };
}

// Получить чанк по глобальной клетке
function getChunkForCell(globalX, globalY) {
    const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
    const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
    const key = `${cx},${cy}`;
    if (!chunkCache.has(key)) {
        chunkCache.set(key, generateChunk(cx, cy));
    }
    return chunkCache.get(key);
}

// === НОВАЯ ФУНКЦИЯ: поиск безопасной стартовой позиции ===
function findSafeStartPosition(startX, startY, radius = 3) {
    // Пробуем найти проходимую клетку в радиусе radius
    for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const testX = startX + dx;
                const testY = startY + dy;
                
                // Проверяем, что клетка существует и проходима
                if (GlobalMapModule.isWalkable(testX, testY)) {
                    // Дополнительно проверяем, что вокруг не слишком много гор
                    let obstacleCount = 0;
                    for (let ny = -1; ny <= 1; ny++) {
                        for (let nx = -1; nx <= 1; nx++) {
                            if (!GlobalMapModule.isWalkable(testX + nx, testY + ny)) {
                                obstacleCount++;
                            }
                        }
                    }
                    // Если в радиусе 1 не более 3 препятствий - подходит
                    if (obstacleCount <= 4) {
                        return { x: testX, y: testY };
                    }
                }
            }
        }
    }
    // Если ничего не нашли, возвращаем исходную позицию
    return { x: startX, y: startY };
}

// === Публичный API ===

const GlobalMapModule = {
    // Получить тип тайла в глобальных координатах
    getTileType(globalX, globalY) {
        const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
        const chunk = getChunkForCell(globalX, globalY);
        const localX = globalX - cx * GLOBAL_CONFIG.CHUNK_SIZE;
        const localY = globalY - cy * GLOBAL_CONFIG.CHUNK_SIZE;
        if (localY >= 0 && localY < chunk.tiles.length && localX >= 0 && localX < chunk.tiles[0].length) {
            return chunk.tiles[localY][localX];
        }
        return 'plain';
    },

    // Получить тип тайла для отображения (учитывая POI)
    getDisplayTileType(globalX, globalY) {
        // Сначала проверяем, есть ли POI в этой точке
        const poi = this.getPOI(globalX, globalY);
        if (poi) {
            return poi.type === 'city' ? 'city' : 'dungeon_entrance';
        }
    
        // Если POI нет, возвращаем обычный тип ландшафта
        return this.getTileType(globalX, globalY);
    },
    
    // Проверка проходимости
    isWalkable(globalX, globalY) {
        const type = this.getTileType(globalX, globalY);
        return type !== 'mountain' && type !== 'water';
    },
    


    // Получить точку интереса в клетке (если есть)
    getPOI(globalX, globalY) {
        const chunk = getChunkForCell(globalX, globalY);
        if (!chunk || !chunk.pois) return null;
        return chunk.pois.find(p => p.x === globalX && p.y === globalY);
    },
    
    // Перемещение игрока (возвращает true, если удалось)
    tryMove(dx, dy) {
        const newX = playerGlobalX + dx;
        const newY = playerGlobalY + dy;
        if (this.isWalkable(newX, newY)) {
            playerGlobalX = newX;
            playerGlobalY = newY;
            return true;
        }
        return false;
    },
    
    // Текущая позиция игрока
    getPlayerPosition() {
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    // Установить позицию (при выходе из подземелья)
    setPlayerPosition(x, y) {
        playerGlobalX = x;
        playerGlobalY = y;
    },
    
    // НОВЫЙ МЕТОД: инициализация с поиском безопасной позиции
    initSafeStart(startX, startY, radius = 3) {
        const safePos = findSafeStartPosition(startX, startY, radius);
        playerGlobalX = safePos.x;
        playerGlobalY = safePos.y;
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    // Получить размер чанка
    getChunkSize() { 
        return GLOBAL_CONFIG.CHUNK_SIZE; 
    },
    
    // Получить конфигурацию
    getConfig() {
        return GLOBAL_CONFIG;
    }
};
```

# ###map.js

```js

// =========================== Модуль карты (генерация, стены, лестницы) ===========================
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;
    
    // Кеш для связанных лестниц между уровнями
    const stairsCache = new Map();

    // Вспомогательная функция поиска случайной клетки пола
    function findRandomFloor(excludePos, far = false, seed = null) {
        if (!seed) seed = `stairs_${currentDungeonType?.name || 'default'}`;
        const rng = new Math.seedrandom(seed);
        let attempts = 0;
        while (attempts < 1000) {
            const x = Math.floor(rng() * DataModule.MAP_WIDTH);
            const y = Math.floor(rng() * DataModule.MAP_HEIGHT);
            if (currentMapData && currentMapData[y][x] === 0) {
                if (excludePos && x === excludePos.x && y === excludePos.y) {
                    attempts++;
                    continue;
                }
                if (far && excludePos) {
                    const dist = Math.abs(x - excludePos.x) + Math.abs(y - excludePos.y);
                    if (dist < 10) {
                        attempts++;
                        continue;
                    }
                }
                return { x, y };
            }
            attempts++;
        }
        return excludePos || { x: 0, y: 0 };
    }
    // Вспомогательная функция: гарантирует, что позиция будет на полу, а не в стене
    function getSafePos(pos) {
        if (!pos) return { x: 2, y: 2 };
        // Если координата уже на полу, возвращаем её
        if (currentMapData[pos.y] && currentMapData[pos.y][pos.x] === 0) return pos;
        
        // Иначе ищем ближайший пол по спирали
        for (let r = 1; r < 15; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = pos.x + dx, ny = pos.y + dy;
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) return { x: nx, y: ny };
                    }
                }
            }
        }
        return pos; // fallback, если всё заполнено стенами (почти невозможно)
    }

    // Генерация или восстановление лестниц для уровня
    function generateStaircase(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        let cached = stairsCache.get(cacheKey);

        // Если есть кеш, строго проверяем валидность координат на ТЕКУЩЕЙ карте
        if (cached) {
            const upValid = cached.stairsUp && currentMapData[cached.stairsUp.y]?.[cached.stairsUp.x] === 0;
            const downValid = cached.stairsDown && currentMapData[cached.stairsDown.y]?.[cached.stairsDown.x] === 0;

            // Если обе лестницы на полу (или в городе, где down=null), используем кеш
            if (upValid && (currentDungeonType.name === 'city' || downValid)) {
                stairsUp = cached.stairsUp;
                stairsDown = cached.stairsDown;
                return;
            }
            // Кеш повреждён или карта изменилась → очищаем и генерируем заново
            stairsCache.delete(cacheKey);
        }

        // 1. Определяем stairsUp
        if (depth > 0) {
            // Связываем с лестницей вниз предыдущего уровня
            const prevKey = `${gx}_${gy}_${depth - 1}`;
            const prevCached = stairsCache.get(prevKey);
            if (prevCached?.stairsDown) {
                stairsUp = prevCached.stairsDown;
                // Проверяем, не стала ли она стеной на новом уровне
                if (currentMapData[stairsUp.y]?.[stairsUp.x] !== 0) {
                    stairsUp = findRandomFloor(null, false, `up_fb_${gx}_${gy}_${depth}`);
                }
            } else {
                stairsUp = findRandomFloor(null, false, `up_${gx}_${gy}_${depth}`);
            }
        } else {
            stairsUp = findRandomFloor(null, false, `up_${gx}_${gy}_${depth}`);
        }

        // 2. Определяем stairsDown
        if (currentDungeonType.name !== 'city') {
            stairsDown = findRandomFloor(stairsUp, true, `down_${gx}_${gy}_${depth}`);
        } else {
            stairsDown = null;
        }

        // 3. Сохраняем корректную пару в кеш
        stairsCache.set(cacheKey, { stairsUp, stairsDown });
    }

    // Основная функция генерации уровня
    function generateLevel(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        
        generateStaircase(gx, gy, depth);
        
        let startPos;
        if (entryPoint === 'down') {
            // Наступили на < (спуск) → появляемся у > (stairsUp)
            startPos = getSafePos(stairsUp);
            console.log(`✅ Спуск: появляемся у > (${startPos.x},${startPos.y})`);
        } else if (entryPoint === 'up') {
            // Наступили на > (подъём) → появляемся у < (stairsDown)
            startPos = getSafePos(stairsDown);
            console.log(`✅ Подъём: появляемся у < (${startPos.x},${startPos.y})`);
        } else {
            // Первый вход в подземелье
            startPos = getSafePos(stairsUp);
            console.log(`✅ Вход: появляемся у > (${startPos.x},${startPos.y})`);
        }
        
        return startPos;
    }
    // Публичные методы
    function generate(gx, gy, depth) {
        return generateLevel(gx, gy, depth, null);
    }

    function generateWithType(gx, gy, depth, dungeonType, entryPoint = null) {
        return generateLevel(gx, gy, depth, dungeonType, entryPoint);
    }

    // === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА ===
    // === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА (исправленный) ===
// В файле map.js

// ... существующий код ...

// === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА (с возвратом внутренних координат) ===
function generateCityLayout(rand, width, height, density = 0.7) {
    // 1. Стартуем с полной сетки стен
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const interiorCoords = []; // <--- ДОБАВИТЬ: список координат внутри зданий

    // 2. Вырезаем внутреннее пространство (улицы по всей карте)
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            grid[y][x] = 0;
        }
    }

    const STREET_W = 2; // Ширина улиц
    let y = 2; 

    // 3. Размещаем здания по упорядоченной сетке
    while (y < height - 6) {
        const bh = rand.int(4, 8); 
        let x = 2; 

        while (x < width - 6) {
            const bw = rand.int(5, 9); 
            
            // Проверка плотности
            if (rand.next() > density) {
                x += bw + STREET_W;
                continue;
            }

            if (x + bw + STREET_W >= width - 1) break;

            // Рисуем здание: стены по периметру, пол внутри
            for (let dy = 0; dy < bh; dy++) {
                for (let dx = 0; dx < bw; dx++) {
                    const isPerimeter = (dy === 0 || dy === bh - 1 || dx === 0 || dx === bw - 1);
                    const val = isPerimeter ? 1 : 0;
                    grid[y + dy][x + dx] = val;
                    
                    // Если это пол внутри здания, сохраняем координаты
                    if (val === 0) {
                        interiorCoords.push({ x: x + dx, y: y + dy });
                    }
                }
            }

            // 4. Вырезаем дверь
            const side = rand.int(0, 3); 
            let doorX = 0, doorY = 0;
             
            if (side === 0) { doorX = x + rand.int(1, bw - 2); doorY = y; }
            else if (side === 1) { doorX = x + bw - 1; doorY = y + rand.int(1, bh - 2); } 
            else if (side === 2) { doorX = x + rand.int(1, bw - 2); doorY = y + bh - 1; }
            else { doorX = x; doorY = y + rand.int(1, bh - 2); }
             
            grid[doorY][doorX] = 0; 
            // Дверь тоже считается частью интерьера для спавна? 
            // Обычно лут лежит внутри, а не на пороге. Но пусть будет внутри.
            // Дверь уже была помечена как 0 выше, если она внутри периметра, 
            // но если дверь вырезается в стене (периметре), то добавим её вручную, если хотим.
            // Для простоты оставим только то, что попало в цикл выше (пол внутри).

            x += bw + STREET_W;
        }
        y += bh + STREET_W;
    }
    
    // Возвращаем объект с сеткой и списком внутренних точек
    return { grid, interiorCoords };
}

    function generateCity(gx, gy, depth) {
        const seedVal = createSeed(gx, gy, depth);
        const rand = new SeededRandom(seedVal);
        
        // 1. Определяем тип города (плотность застройки)
        const density = rand.next() * 0.3 + 0.3; 
        
        // Генерируем планировку
        const layoutResult = generateCityLayout(rand, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, density);
        currentMapData = layoutResult.grid; // Предположим, что generateCityLayout возвращает grid
        
        currentDungeonType = { 
             name: 'city',
            wallChar: getChar('WALL_CITY'),   // '█'
            floorChar: getChar('FLOOR_CITY'), // '·'
            wallColor: '#6b7280', 
            floorColor: '#374151' 
        };
        
        // ... остальной код генерации лестниц и возврата startPos ...
    
    
    // === ЛЕСТНИЦА ">" СТРОГО У ВНЕШНЕЙ СТЕНЫ ===
    const upSeed = `up_city_${gx}_${gy}_${depth}`;
    const rng = new Math.seedrandom(upSeed);
    const w = DataModule.MAP_WIDTH;
     const h = DataModule.MAP_HEIGHT;
    
    const edgeTiles = [];
    for (let y = 1; y < h - 1; y++) {
        if (currentMapData[y][1] === 0) edgeTiles.push({x: 1, y});
        if (currentMapData[y][w-2] === 0) edgeTiles.push({x: w-2, y});
    }
     for (let x = 1; x < w - 1; x++) {
        if (currentMapData[1][x] === 0) edgeTiles.push({x, y: 1});
        if (currentMapData[h-2][x] === 0) edgeTiles.push({x, y: h-2});
    }
     
    if (edgeTiles.length > 0) {
        stairsUp = edgeTiles[Math.floor(rng() * edgeTiles.length)];
    } else {
        stairsUp = { x: 2, y: 2 };
    }
    
    stairsDown = null; 
    return { x: stairsUp.x, y: stairsUp.y };
}


    
    function clearCache() {
        stairsCache.clear();
        console.log("🗑️ Кеш лестниц очищен");
    }

    function isWall(x, y) {
        if (!currentMapData) return true;
        if (x < 0 || x >= DataModule.MAP_WIDTH || y < 0 || y >= DataModule.MAP_HEIGHT) return true;
        return currentMapData[y][x] === 1;
    }

    function getRandomFloor(excludePos) {
        return findRandomFloor(excludePos);
    }

    // Отладочная функция для просмотра кеша
    function debugCache() {
        console.log("=== Текущий кеш лестниц ===");
        for (let [key, value] of stairsCache.entries()) {
            console.log(`${key}: up=(${value.stairsUp?.x},${value.stairsUp?.y}), down=(${value.stairsDown?.x},${value.stairsDown?.y})`);
        }
    }



    // Добавляем переменную для хранения внутренних координат текущего уровня
    let currentMapInteriorCoords = [];

    return {
        get currentMapData() { return currentMapData; },
        get currentDungeonType() { return currentDungeonType; },
        get stairsUp() { return stairsUp; },
        get stairsDown() { return stairsDown; },
        // Экспортируем доступ к внутренним координатам
        get interiorCoords() { return currentMapInteriorCoords; },
        
        generate,
        generateWithType,
        generateCity,
        isWall,
        getRandomFloor,
        clearCache,
        debugCache
    };
})();
```


# ###name_generator.js
```js

/**
 * МОДУЛЬ ГЕНЕРАЦИИ НАЗВАНИЙ (name_generator.js)
 * Содержит единственный экземпляр SeededRandom и createSeed
 */

// База данных для генерации (из вашего примера)
const NAME_COMPONENTS = {
    themes: {
        dark: {
            name: 'Мрачный мир',
            prefixes: ['Нек', 'Мор', 'Тар', 'Зар', 'Дру', 'Вор', 'Кри', 'Стр', 'Бла', 'Гро', 'Шад', 'Кул', 'Вам', 'Лик', 'Рав', 'Дем', 'Фен', 'Гул', 'Хор', 'Зом'],
            roots: ['али', 'ус', 'ек', 'ит', 'ум', 'ар', 'он', 'ис', 'ат', 'ен', 'ок', 'ур', 'ил', 'аш', 'ез', 'ин', 'оп', 'ук', 'ам', 'ир'],
            suffixes: ['тус', 'ган', 'нок', 'гар', 'зор', 'мак', 'вул', 'дур', 'мор', 'зул', 'рак', 'док', 'вел', 'зар', 'ник', 'лок', 'мар', 'ток', 'рук', 'зак']
        },
        light: {
            name: 'Светлый мир',
            prefixes: ['Лум', 'Сил', 'Фен', 'Пра', 'Кри', 'Ли', 'Ари', 'Эли', 'Ори', 'Су', 'Лай', 'Сол', 'Рей', 'Аур', 'Люк', 'Ним', 'Вал', 'Сеар', 'Три', 'Кел'],
            roots: ['има', 'ан', 'ор', 'ен', 'ур', 'ол', 'ик', 'ас', 'ем', 'ир', 'ал', 'ис', 'ет', 'ун', 'ам', 'ел', 'ин', 'ос', 'ат', 'ев'],
            suffixes: ['тал', 'мир', 'лан', 'мус', 'дек', 'вел', 'рил', 'тор', 'нис', 'лис', 'ран', 'виэл', 'зар', 'нок', 'рик', 'маэр', 'веэль', 'тик', 'нуэр', 'заль']
        },
        underground: {
            name: 'Подземный мир',
            prefixes: ['Ган', 'Гро', 'Тру', 'Стр', 'Бла', 'Дур', 'Кар', 'Мар', 'Раг', 'Туг', 'Двар', 'Гном', 'Краг', 'Морг', 'Тор', 'Ург', 'Барг', 'Грак', 'Фрог', 'Мург'],
            roots: ['ог', 'ар', 'он', 'ис', 'ат', 'ук', 'ак', 'ор', 'ам', 'ад', 'уг', 'аг', 'ог', 'умм', 'йяр', 'окх', 'йюр', 'аам', 'ауг', 'од'],
            suffixes: ['зар', 'рон', 'мак', 'тор', 'кул', 'дак', 'раг', 'зуг', 'мок', 'дур', 'гар', 'дхаур', 'мук', 'тхунд', 'кхульг', 'даг', 'рьяг', 'зорг', 'миг', 'дорр']
        },
        ancient: {
            name: 'Древний мир',
            prefixes: ['Ака', 'Эло', 'Ило', 'Ура', 'Оме', 'Ха', 'Тха', 'Жа', 'Рха', 'Ша', 'Атл', 'Лем', 'Му', 'Ра', 'Сет', 'Ос', 'Ир', 'Ан', 'Ка', 'Та'],
            roots: ['тун', 'мар', 'дал', 'вор', 'кул', 'зан', 'мор', 'тал', 'рен', 'вал', 'флун', 'мер', 'дьел', 'фор', 'кхуль', 'зайн', 'мойр', 'тхайл', 'жен', 'воль'],
            suffixes: ['дор', 'мир', 'зул', 'кар', 'мал', 'нор', 'рил', 'тор', 'вак', 'зур', 'доур', 'миэр', 'цзуль', 'кайр', 'майль', 'нойд', 'рииль', 'тхойн', 'факх', 'цзур']
        }
    },
    
    locationTypes: {
        dungeon: ['Подземелья', 'Темные подземелья', 'Заброшенные катакомбы', 'Тайные подземелья', 'Проклятые подземелья', 'Затопленные катакомбы', 'Древние подземелья', 'Запечатанные подземелья', 'Зловещие катакомбы', 'Темные лабиринты', 'Зловещие казематы'],
        cave: ['Пещеры', 'Темные пещеры', 'Глубинные пещеры', 'Кристальные пещеры', 'Лавовые пещеры', 'Ледяные пещеры', 'Биолюминесцентные пещеры', 'Затопленные пещеры', 'Вулканические пещеры', 'Кварцевые пещеры'],
        icy: ['Ледяные лабиринты', 'Хрустальные коридоры', 'Ледяные тоннели', 'Морозные лабиринты', 'Снежные коридоры', 'Ледяные катакомбы', 'Хрустальные лабиринты', 'Морозные тоннели', 'Ледяные залы', 'Снежные лабиринты'],
        rogue: ['Заброшенные руины', 'Древние руины', 'Разрушенные залы', 'Покинутые руины', 'Обвалившиеся руины', 'Заросшие руины', 'Разрушенные храмы', 'Забытые дворцы', 'Обрушившиеся арки', 'Разрушенные крепости'],
        cellular: ['Органические пещеры', 'Живые пещеры', 'Пульсирующие полости', 'Биологические пещеры', 'Грибные пещеры', 'Корневые полости', 'Слизевые пещеры', 'Грибковые полости', 'Органические тоннели', 'Живые лабиринты'],
        arena: ['Арены', 'Кровавые арены', 'Боевые арены', 'Смертельные арены', 'Гладиаторские арены', 'Круговые арены', 'Подземные арены', 'Кровавые колизеи', 'Боевые круги', 'Арены смерти'],
        boss: ['Логова', 'Тронные залы', 'Святилища', 'Цитадели', 'Крепости', 'Дворцы', 'Храмы', 'Священные гроты', 'Тронные комнаты', 'Святилища владыки']
    },
    
    extras: ['ма', 'ли', 'та', 'су', 'но', 'ре', 'ки', 'до', 'ве', 'ша', 'ну', 'ра', 'се', 'ту', 'го', 'ба', 'да', 'фа', 'га', 'ха', 'йя', 'кья', 'лиа', 'нья', 'пья', 'сье', 'вье', 'зиа', 'вха', 'уа']
};

// Детерминированный генератор случайных чисел (LCG) - ЕДИНЫЙ ЭКЗЕМПЛЯР
class SeededRandom {
    constructor(seed) {
        this.seed = Math.abs(seed) || 1;
    }
    
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
    
    choice(array) {
        const index = Math.floor(this.next() * array.length);
        return array[index];
    }
    
    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

function createSeed(x, y, depth = 0) {
    const seed = (x * 73856093) ^ (y * 19349663) ^ (depth * 9999991);
    return (Math.abs(seed) % 2147483647) || 1;
}

// Генератор названий
const NameGeneratorModule = {
    
    
    
    // Добавить в NameGeneratorModule
    // === ГЕНЕРАЦИЯ НАЗВАНИЙ ГОРОДОВ (обновленная) ===
    generateCityName(x, y) {
        const seed = createSeed(x, y);
        const rng = new SeededRandom(seed);
        
        // 1. Используем слоги из "Светлого мира" для основы названия
        const lightTheme = NAME_COMPONENTS.themes.light;
        
        // Выбираем префикс и корень
        const prefix = rng.choice(lightTheme.prefixes);
        const root = rng.choice(lightTheme.roots);
        
        // Собираем основу: Префикс + Корень (иногда можно добавить еще один корень для длины)
        let baseName = prefix + root;
        
        // 2. Используем классические окончания для городов
        const citySuffixes = ['град', 'стед', 'борг', 'виль', 'хейм', 'форд', 'порт', 'полис', 'хольм', 'дол', 'фьорд', 'федль', 'карт', 'хольт', 'трис', 'трайн', 'кройн'];
        const suffix = rng.choice(citySuffixes);
        
        // 3. Формируем итоговое название с большой буквы
        // Пример: Лум + ан + град = Луманград
        return (baseName + suffix).charAt(0).toUpperCase() + (baseName + suffix).slice(1);
    },
    
    
    
    generateName(random, theme) {
        let name = '';
        const partCount = random.int(2, 5);
        name += random.choice(theme.prefixes);
        
        const middleCount = Math.max(0, partCount - 2);
        for (let i = 0; i < middleCount; i++) {
            if (random.next() > 0.5 && theme.roots.length > 0) {
                name += random.choice(theme.roots);
            } else {
                name += random.choice(NAME_COMPONENTS.extras);
            }
        }
        
        if (partCount > 1) {
            name += random.choice(theme.suffixes);
        }
        
        return name.charAt(0).toUpperCase() + name.slice(1);
    },
    
    getLocationType(random, dungeonType) {
        // Если передан конкретный тип подземелья и он существует в locationTypes
        if (dungeonType && NAME_COMPONENTS.locationTypes[dungeonType]) {
            const typeVariants = NAME_COMPONENTS.locationTypes[dungeonType];
            return random.choice(typeVariants);
        }
        // Fallback: случайный тип (на случай ошибки)
        const typeKeys = Object.keys(NAME_COMPONENTS.locationTypes);
        const randomType = random.choice(typeKeys);
        const typeVariants = NAME_COMPONENTS.locationTypes[randomType];
        return random.choice(typeVariants);
    },
    
    generateDescription(random) {
        const descriptors = [
            'проклятые', 'забытые', 'древние', 'кровавые', 'темные', 'вечные',
            'таинственные', 'опасные', 'зловещие', 'мрачные', 'заброшенные',
            'волшебные', 'священные', 'тайные', 'неприступные', 'легендарные',
            'зачарованные', 'проклятые вечностью', 'окутанные мраком', 'испещренные рунами', 'хранящие древние тайны',
            'наполненные эхом прошлого', 'пропитанные магией', 'защищенные древними заклятиями', 'резонирующие от криков ужаса', 'окутанные вечным туманом',
            'хранящие сокровища', 'полные ловушек', 'непостижимые', 'запретные', 'тающие во времени', 'нечестивые', 'колдовские', 'эпические', 'мифические', 'скрытые'
        ];
        
        const atmospheres = [
            'наполненные эхом шагов', 'освещенные тусклым светом',
            'пропитанные зловонием', 'вибрирующие от магии',
            'покрытые паутиной', 'украшенные древними рунами',
            'испещренные трещинами', 'окутанные вечным туманом',
            'резонирующие от криков прошлого', 'хранящие древние тайны',
            'полные ловушек и загадок', 'защищенные древними заклятиями',
            'эхом отзывающиеся на каждый шепот', 'мерцающие от скрытой энергии',
            'испускающие холодный ветер', 'наполненные странными звуками',
            'окрашенные в неестественные цвета', 'вибрирующие от скрытой угрозы',
            'наполненные призрачными фигурами', 'испускающие запах древности',
            'окутанные паутиной времени', 'пропитанные кровью предыдущих искателей приключений',
            'мерцающие от магических разрядов', 'наполненные странными шепотами',
            'испускающие зловещее сияние', 'вибрирующие от древней силы'
        ];
        
        const descriptor = random.choice(descriptors);
        const atmosphere = random.choice(atmospheres);
        
        return `${descriptor}, ${atmosphere}`;
    },
    
    getRandomTheme(random) {
        const themeKeys = Object.keys(NAME_COMPONENTS.themes);
        const themeKey = random.choice(themeKeys);
        return NAME_COMPONENTS.themes[themeKey];
    },

    // ИСПРАВЛЕНА: теперь принимает dungeonType
    generateLocationData(x, y, dungeonType) {
        const seed = createSeed(x, y);
        const rng = new SeededRandom(seed);
        
        const theme = this.getRandomTheme(rng);
        const namePart = this.generateName(rng, theme);
        // Передаём dungeonType в getLocationType
        const typePart = this.getLocationType(rng, dungeonType);
        const description = this.generateDescription(rng);
        
        return {
            fullName: `${typePart} ${namePart}`,
            description: description,
            themeName: theme.name,
            seed: seed
        };
    }
};
```

# ###npc_generator.js
```js
/**
 * МОДУЛЬ ГЕНЕРАЦИИ NPC (npc_generator.js)
 * Создает нейтральных персонажей для городов.
 */

const NpcGeneratorModule = (function() {
    'use strict';

    // Базы данных
    const NPC_DATA = {
        titles: [
            "Стражник", "Торговец", "Старейшина", "Пьяница", "Кузнец", "Бродяга",
            "Клирик", "Священник", "Бард", "Охотник", "Крестьянин", "Чиновник",
            "Пастух", "Знахарка", "Трактирщик", "Гонец", "Зазывала", "Странник",
            "Плотник", "Егерь", "Монах", "Рыбак", "Купец", "Бродячий философ"
        ],
        phrases: [
            "Добро пожаловать в наш город.",
            "Осторожнее за стенами, там полно тварей.",
            "Ищешь неприятностей?",
            "Я слежу за тобой, ничтожество",
            "Я видел, как ты входил. Ты выглядишь опасно.",
            "Мирного тебе пути.",
            "В последнее время ночи стали слишком тихими...",
            "Говорят, в глубинах подземелий водятся драконы.",
            "Не доверяй теням в переулке.",
            "Я слышал шёпот из глубин. Они просыпаются.",
            "Мой дед говорил, что раньше здесь процветала торговля.",
            "Нынче на дорогах небезопасно.",
            "Берегись подземных тварей.",
            "В этом городе отличный эль.",
            "Странник, ты ищешь славу или золото? Оба пути опасны.",
            "Меня тоже когда-то вела дорога приключений.",
            "Молитвы не спасут тебя от когтей, но успокоят душу.",
            "Говорят, никто не возвращался из заброшенных руин.",
            "Люди слышали стук барабанов глубоко под землей.",
            "Не спускайся глубже без хорошего клинка."
        ]
    };

    /**
     * Генерирует список NPC для города
     * @param {number} gx - глобальная X
     * @param {number} gy - глобальная Y
     * @param {Array} mapGrid - двумерный массив карты города (0 - пол, 1 - стена)
     * @returns {Array} массив объектов NPC
     */
    function generateCityNpcs(gx, gy, mapGrid, playerStart) {
        const seedVal = createSeed(gx, gy) + 555;
        const rng = new SeededRandom(seedVal);
        const npcs = [];
        const h = mapGrid.length, w = mapGrid[0].length;
        const count = rng.int(20, 60);
        let attempts = 0;

        // Возможные направления: [dx, dy]
        const directions = [
            { dx: 0, dy: -1 }, // Вверх
            { dx: 0, dy: 1 },  // Вниз
            { dx: -1, dy: 0 }, // Влево
            { dx: 1, dy: 0 }   // Вправо
        ];

        while (npcs.length < count && attempts < 200) {
            attempts++;
            const x = rng.int(1, w - 2), y = rng.int(1, h - 2);
            if (mapGrid[y][x] !== 0) continue; 
            if (Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y) < 3) continue; 
            if (npcs.some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)) continue; 

            npcs.push({
                x, y,
                name: rng.choice(NPC_DATA.titles),
                char: "☺", color: "#58a6ff",
                dialog: rng.choice(NPC_DATA.phrases),
                isNPC: true,
                // Выбираем начальное случайное направление
                direction: directions[rng.int(0, 3)] 
            });
        }
        return npcs;
    }

    return {
        generateCityNpcs: generateCityNpcs
    };
})();
```
# ###render.js

```js
// =========================== Модуль рендеринга (отрисовка, UI, лог, миникарта + ЭФФЕКТЫ) ===========================
const RenderModule = (function() {
    let display = null;
    let fov = null;
    const COLS = 60;
    const ROWS = 40;
    const FONT_SIZE = 16; 
    const TILE_SIZE = 16; 

    // === ЗАГРУЗКА СПРАЙТОВ (Для глобальной карты и fallback) ===
    const spriteImages = {};
    const TILESET_FILES = ['terrain_sprites', 'creature_sprites', 'item_sprites']; 
    
    TILESET_FILES.forEach(name => {
        const img = new Image();
        img.src = `${name}.png`; 
        spriteImages[name] = img;
    });
    
    // === СИСТЕМА ЭФФЕКТОВ ===
    let activeEffects = []; 
    let currentCameraOffset = { x: 0, y: 0 };
    let redrawCallback = null;

    function init() {
        if (typeof ROT === 'undefined') {
            alert("Ошибка: Библиотека ROT.js не загрузилась.");
            throw new Error("ROT missing");
        }

        display = new ROT.Display({
            width: COLS,
            height: ROWS,
            fontSize: FONT_SIZE,
            fontFamily: "Consolas, monospace",
            fg: "#ccc",
            bg: "#000",
            forceSquareRatio: true
        });

        const container = document.getElementById("map-container");
        container.innerHTML = "";
        const canvas = display.getContainer();
        container.appendChild(canvas);

        // ✅ СОХРАНЯЕМ КОНТЕКСТ ДЛЯ РУЧНОЙ ОТРИСОВКИ
        RenderModule._ctx = canvas.getContext('2d'); 

        fov = new ROT.FOV.PreciseShadowcasting((x, y) => !MapModule.isWall(x, y));

        const resizeGame = () => {
            if (!canvas) return;
            const fw = container.clientWidth;
            const fh = container.clientHeight;
            const cw = canvas.width;
            const ch = canvas.height;
            const scale = Math.min(fw / cw, fh / ch);
            canvas.style.transform = `scale(${scale})`;
            canvas.style.transformOrigin = "center center";
        };

        window.addEventListener("resize", resizeGame);
        setTimeout(resizeGame, 50);

        // Инициализация тайлсетов (вызывает внешний модуль TilesetRenderer)
        if (typeof TilesetRenderer !== 'undefined') {
            TilesetRenderer.init();
        } else {
            console.warn("TilesetRenderer не найден. Проверьте подключение tileset_renderer.js");
        }
        
        // Запуск цикла очистки старых эффектов (если есть модуль эффектов)
        if (typeof startEffectLoop === 'function') startEffectLoop();
    }

    // === ДОБАВЛЕНИЕ ЭФФЕКТОВ ===
    function addBlinkEffect(x, y, duration = 500, color = null) {
        activeEffects.push({
            type: 'blink',
            x: x, y: y,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            duration: duration,
            color: color || "rgba(255, 0, 0, 0.5)"
        });
    }

    function addProjectileEffect(sx, sy, tx, ty, duration = 300) {
        activeEffects.push({
            type: 'projectile',
            sx: sx, sy: sy,
            tx: tx, ty: ty,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            duration: duration
        });
    }

    // === ОТРИСОВКА ЭФФЕКТОВ (вызывается внутри draw) ===
    function drawEffects(ctx, cam) {
        const now = Date.now();
        const tileW = TILE_SIZE; 
        const tileH = TILE_SIZE;

        for (let i = activeEffects.length - 1; i >= 0; i--) {
            const effect = activeEffects[i];
            
            if (now > effect.endTime) {
                activeEffects.splice(i, 1);
                continue;
            }

            if (effect.type === 'blink') {
                const progress = (effect.endTime - now) / effect.duration;
                const alpha = Math.abs(Math.sin(now * 0.015)) * 0.6; 
                
                let baseColor = effect.color;
                if (baseColor.startsWith('rgba')) {
                    baseColor = baseColor.replace(/[\d\.]+\)$/g, `${alpha})`);
                } else {
                    baseColor = `rgba(255, 0, 0, ${alpha})`; 
                }
                
                ctx.fillStyle = baseColor;
                
                const screenX = (effect.x - cam.x) * tileW;
                const screenY = (effect.y - cam.y) * tileH;
                
                if (screenX >= -tileW && screenX < COLS * tileW && screenY >= -tileH && screenY < ROWS * tileH) {
                    ctx.fillRect(screenX, screenY, tileW, tileH);
                }
            } 
            else if (effect.type === 'projectile') {
                const totalTime = effect.duration;
                const elapsed = now - effect.startTime;
                const t = Math.min(1, elapsed / totalTime);

                const worldCurX = effect.sx + (effect.tx - effect.sx) * t;
                const worldCurY = effect.sy + (effect.ty - effect.sy) * t;

                const screenCurX = (worldCurX - cam.x) * tileW + tileW / 2;
                const screenCurY = (worldCurY - cam.y) * tileH + tileH / 2;

                ctx.save();
                ctx.fillStyle = "#FFFF00"; 
                ctx.font = `bold 12px Consolas, monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "black";
                ctx.shadowBlur = 4;
                ctx.fillText("*", screenCurX, screenCurY);
                ctx.restore();
            }
        }
    }

    // === ФУНКЦИЯ ОТРИСОВКИ СПРАЙТА (Безопасная версия) ===
    function drawSprite(ctx, id, sx, sy) {
        // Проверяем, подключен ли реестр
        if (typeof getTileData !== 'function') return false;
        
        const tileData = getTileData(id);
        if (!tileData || !spriteImages[tileData.file]) return false;
        
        const img = spriteImages[tileData.file];
        if (!img.complete || img.naturalWidth === 0) return false;

        ctx.drawImage(
            img,
            tileData.x * TILE_SIZE, tileData.y * TILE_SIZE,
            TILE_SIZE, TILE_SIZE,
            sx * TILE_SIZE, sy * TILE_SIZE,
            TILE_SIZE, TILE_SIZE
        );
        return true;
    }    
    
    function getCameraOffset(player) {
        const cam = {
            x: player.x - Math.floor(COLS / 2),
            y: player.y - Math.floor(ROWS / 2)
        };
        currentCameraOffset = cam;
        return cam;
    }

    // === ОТРИСОВКА ПОДЗЕМЕЛЬЯ (Использует TilesetRenderer) ===
    function draw(player, enemies, items, npcs = []) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        const cam = getCameraOffset(player);

        const visible = new Set();
        fov.compute(player.x, player.y, 25, (x, y, r, vis) => {
            if (vis) visible.add(`${x},${y}`);
        });

        // 1. РИСУЕМ ТАЙЛЫ
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const wx = sx + cam.x;
                const wy = sy + cam.y;
                
                if (wx < 0 || wx >= DataModule.MAP_WIDTH || wy < 0 || wy >= DataModule.MAP_HEIGHT) continue;

                const isVisible = visible.has(`${wx},${wy}`);
                let ch, fg;

                if (MapModule.isWall(wx, wy)) {
                    ch = dtype.wallChar;
                    fg = isVisible ? dtype.wallColor : '#222';
                } else {
                    ch = dtype.floorChar;
                    fg = isVisible ? dtype.floorColor : '#111';
                }

                if (MapModule.stairsUp && wx === MapModule.stairsUp.x && wy === MapModule.stairsUp.y) {
                    ch = ">"; fg = isVisible ? "#FFF" : "#333";
                }
                if (MapModule.stairsDown && wx === MapModule.stairsDown.x && wy === MapModule.stairsDown.y) {
                    ch = "<"; fg = isVisible ? "#888" : "#222";
                }

                // Используем TilesetRenderer для подземелья
                if (typeof TilesetRenderer !== 'undefined') {
                    TilesetRenderer.draw(ctx, ch, sx, sy, fg);
                } else {
                    // Fallback на ASCII, если рендерер сломался
                    ctx.fillStyle = fg;
                    ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(ch, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                }
            }
        }

        // 2. ПРЕДМЕТЫ
        if (items) {
            items.forEach(i => {
                const sx = i.x - cam.x, sy = i.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                    if (typeof TilesetRenderer !== 'undefined') {
                        TilesetRenderer.draw(ctx, i.char, sx, sy, i.color);
                    }
                }
            });
        }

        // 3. ВРАГИ
        if (enemies) {
            enemies.forEach(e => {
                if (e.hp > 0) {
                    const sx = e.x - cam.x, sy = e.y - cam.y;
                    if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${e.x},${e.y}`)) {
                        if (typeof TilesetRenderer !== 'undefined') {
                            TilesetRenderer.draw(ctx, e.char, sx, sy, e.color);
                        }
                    }
                }
            });
        }

        // 4. NPC
        if (window.currentCityNpcs) {
            window.currentCityNpcs.forEach(npc => {
                const sx = npc.x - cam.x, sy = npc.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${npc.x},${npc.y}`)) {
                    if (typeof TilesetRenderer !== 'undefined') {
                        TilesetRenderer.draw(ctx, npc.char, sx, sy, npc.color);
                    }
                }
            });
        }

        // 5. ИГРОК
        if (player) {
            const px = Math.floor(COLS / 2);
            const py = Math.floor(ROWS / 2);
            if (typeof TilesetRenderer !== 'undefined') {
                TilesetRenderer.draw(ctx, player.char, px, py, player.color);
            }
        }

        // 6. ЭФФЕКТЫ
        drawEffects(ctx, cam);

        return visible;
    }

    // === ОТРИСОВКА ГЛОБАЛЬНОЙ КАРТЫ (Использует sprite_registry.js) ===
    function drawGlobalMap(centerX, centerY) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const halfW = Math.floor(COLS / 2);
        const halfH = Math.floor(ROWS / 2);

        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const gx = centerX + sx - halfW;
                const gy = centerY + sy - halfH;

                let tileType = 'plain';
                if (typeof GlobalMapModule !== 'undefined') {
                    tileType = GlobalMapModule.getDisplayTileType ? GlobalMapModule.getDisplayTileType(gx, gy) : GlobalMapModule.getTileType(gx, gy);
                }

                const typeToId = {
                    'plain': 'TILE_PLAIN', 'forest': 'TILE_FOREST', 'mountain': 'TILE_MOUNTAIN',
                    'water': 'TILE_WATER', 'city': 'TILE_CITY', 'dungeon_entrance': 'TILE_DUNGEON_ENTRANCE',
                    'road': 'TILE_ROAD'
                };
                
                const id = typeToId[tileType] || 'TILE_PLAIN';
                
                // 1. Попытка нарисовать спрайт через реестр
                const drawn = drawSprite(ctx, id, sx, sy);
                
                // 2. Fallback на ASCII, если спрайт не загрузился или реестра нет
                if (!drawn) {
                    // Проверяем, есть ли функция getChar
                    const ch = (typeof getChar === 'function') ? getChar(id) : '?';
                    
                    const colors = {
                        'TILE_PLAIN': '#8c8c8c', 'TILE_FOREST': '#2e8b57', 'TILE_MOUNTAIN': '#a0a0a0',
                        'TILE_WATER': '#4682b4', 'TILE_CITY': '#ffd700', 'TILE_DUNGEON_ENTRANCE': '#cd5c5c', 'TILE_ROAD': '#b8860b'
                    };
                    
                    ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                    ctx.fillStyle = colors[id] || '#555';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(ch, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                }

                // 3. Игрок поверх всего
                if (gx === centerX && gy === centerY) {
                    const playerDrawn = drawSprite(ctx, 'PLAYER', sx, sy);
                    if (!playerDrawn) {
                        ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                        ctx.fillStyle = '#fff';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('@', sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                    }
                }
            }
        }
    }
     
    function drawGlobalMinimap(centerX, centerY) {
        const cvs = document.getElementById("minimap");
        if (!cvs) return;
        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        const MINIMAP_SIZE = 20;
        const cellW = cvs.width / MINIMAP_SIZE;
        const cellH = cvs.height / MINIMAP_SIZE;
        const startX = centerX - Math.floor(MINIMAP_SIZE / 2);
        const startY = centerY - Math.floor(MINIMAP_SIZE / 2);
    
        for (let dy = 0; dy < MINIMAP_SIZE; dy++) {
            for (let dx = 0; dx < MINIMAP_SIZE; dx++) {
                const gx = startX + dx;
                const gy = startY + dy;
                let displayType = 'plain';
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getDisplayTileType) {
                    displayType = GlobalMapModule.getDisplayTileType(gx, gy);
                } else if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getTileType) {
                    displayType = GlobalMapModule.getTileType(gx, gy);
                }
                let color;
                switch(displayType) {
                    case 'plain': color = '#555'; break;
                    case 'forest': color = '#2e8b57'; break;
                    case 'mountain': color = '#888'; break;
                    case 'water': color = '#4682b4'; break;
                    case 'city': color = '#ffd700'; break;
                    case 'dungeon_entrance': color = '#cd5c5c'; break;
                    case 'road': color = '#b8860b'; break;
                    default: color = '#333';
                }
                if (gx === centerX && gy === centerY) color = '#0f0';
                ctx.fillStyle = color;
                ctx.fillRect(dx * cellW, dy * cellH, cellW, cellH);
            }
        }
    }

    function updateUI(player, locData, worldTrend) {
        if (locData) {
            document.getElementById("ui-loc-name").textContent = locData.fullName;
            document.getElementById("ui-loc-desc").textContent = locData.description;
            
            let typeText = `Тип: ${locData.themeName || locData.type || '?'}`;
            if (worldTrend && worldTrend.name !== "Обычный уровень") {
                typeText += ` | ${worldTrend.name}`;
                document.getElementById("ui-loc-name").style.color = worldTrend.color;
            } else {
                document.getElementById("ui-loc-name").style.color = "var(--accent)";
            }
            document.getElementById("ui-loc-type").textContent = typeText;
        }

        const exitEl = document.getElementById("ui-loc-coords");
        if (exitEl) {
            if (!player || locData?.themeName === "Поверхность" || !MapModule.stairsUp) {
                exitEl.textContent = "Выход: —";
            } else {
                const sx = MapModule.stairsUp.x, sy = MapModule.stairsUp.y;
                const dx = sx - player.x, dy = sy - player.y;
                
                let arrow = (dx === 0 && dy === 0) ? '🏠' : '';
                if (!arrow) {
                    if (dy < 0) arrow += '↑'; 
                    else if (dy > 0) arrow += '↓';
                    if (dx > 0) arrow += '→'; 
                    else if (dx < 0) arrow += '←';
                    
                    if (arrow === '↑←') arrow = '↖';
                    if (arrow === '↑→') arrow = '↗';
                    if (arrow === '↓←') arrow = '↙';
                    if (arrow === '↓→') arrow = '↘';
                }
                exitEl.textContent = `Выход: ${arrow}`;
            }
        }
        
        if (player && player.hp !== undefined) {
            document.getElementById("ui-stats").innerHTML = `
                <div class="stat-row"><span>HP</span> <span class="val-hp">${player.hp}/${player.maxHp}</span></div>
                <div class="stat-row"><span>Атака</span> <span class="val-atk">${player.atk}</span></div>
                <div class="stat-row"><span>Защита</span> <span class="val-def">${player.def}</span></div>
                <div class="stat-row"><span>Уровень</span> <span>${player.level}</span></div>
                <div class="stat-row"><span>Золото</span> <span style="color: #FFD700">$ ${player.gold}</span></div>
            `;
            
            const w = player.equipment.weapon ? 
                (player.equipment.weapon.maxAmmo > 0 ? 
                    `${player.equipment.weapon.name} (${player.equipment.weapon.currentAmmo})` : 
                    player.equipment.weapon.name) 
                : "—";
                
            const a = player.equipment.armor ? player.equipment.armor.name : "—";
            
            document.getElementById("ui-equip").innerHTML = `
                <div class="equip-slot">Рука: <span class="equip-item">${w}</span></div>
                <div class="equip-slot">Тело: <span class="equip-item">${a}</span></div>
            `;

            const invDiv = document.getElementById("inventory-list");
            if (invDiv) {
                invDiv.innerHTML = "";
                if (player.inventory.length === 0) {
                    invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
                } else {
                    const grouped = {};
                    const order = []; 
                    player.inventory.forEach((item, originalIndex) => {
                        const key = `${item.name}_${item.type}_${item.maxAmmo || 0}`;
                        if (!grouped[key]) {
                            grouped[key] = { item: item, count: 0, indices: [] };
                            order.push(key);
                        }
                        grouped[key].count++;
                        grouped[key].indices.push(originalIndex);
                    });

                    order.forEach(key => {
                        const group = grouped[key];
                        const item = group.item;
                        const div = document.createElement("div");
                        div.className = "inv-item";
                        div.style.color = item.color;
                        let html = `${item.char} ${item.name}`;
                        if (item.val) html += ` (+${item.val})`;
                        if (group.count > 1) {
                            html += ` <span style="opacity:0.7">(${group.count})</span>`;
                        } else if (item.maxAmmo > 0) {
                            html += ` <span style="opacity:0.7">[${item.currentAmmo}]</span>`;
                        }
                        div.innerHTML = html;
                        div.onclick = () => CombatModule.useItem(player, group.indices[0], log, () => updateUI(player, locData, worldTrend));
                        invDiv.appendChild(div);
                    });
                }
            }
        }
    }

    function log(msg, type = "info") {
        const list = document.getElementById("log-list");
        const div = document.createElement("div");
        div.className = `log-msg log-${type}`;
        div.textContent = `> ${msg}`;
        list.prepend(div);
        if (list.children.length > 50) list.lastChild.remove();
    }

    function drawMinimap(player, explored) {
        const cvs = document.getElementById("minimap");
        if (!cvs || !player) return;
        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#000"; 
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        const cw = cvs.width / DataModule.MAP_WIDTH;
        const ch = cvs.height / DataModule.MAP_HEIGHT;
        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        explored.forEach(k => {
            const [x, y] = k.split(',').map(Number);
            ctx.fillStyle = MapModule.isWall(x, y) ? dtype.wallColor : dtype.floorColor;
            ctx.globalAlpha = 0.5; 
            ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
            ctx.globalAlpha = 1.0;
        });
        ctx.fillStyle = "#0F0";
        ctx.fillRect(player.x * cw, player.y * ch, cw + 1, ch + 1);
    }

    function updateInspector(title, details, type = "neutral") {
        const div = document.getElementById("ui-inspector");
        if (!div) return;
        let color = "var(--text-dim)";
        if (type === "enemy") color = "var(--danger)";
        if (type === "loot") color = "var(--gold)";
        if (type === "npc") color = "var(--accent)";
        div.innerHTML = `
            <div style="color: ${color}; font-weight: bold; margin-bottom: 4px;">${title}</div>
            <div style="white-space: pre-line;">${details}</div>
        `;
    }

    function setRedrawCallback(callback) {
        redrawCallback = callback;
    }

    function requestRedraw() {
        if (redrawCallback) {
            redrawCallback();
        }
    }

    return {
        init,
        draw,
        drawGlobalMap,
        drawGlobalMinimap,
        updateUI,
        log,
        drawMinimap,
        getCameraOffset,
        updateInspector,
        setRedrawCallback,
        requestRedraw,
        addBlinkEffect,
        addProjectileEffect,
        COLS,
        ROWS,
        _ctx: null, 
        TILE_SIZE   
    };
})();
```


# ###worldCurve.js

```js
/**
 * МОДУЛЬ МИРОВОЙ КРИВОЙ (worldCurve.js)
 * Зависит от: name_generator.js (SeededRandom, createSeed)
 * 
 * Отвечает за прогрессивную сложность врагов, силу предметов и статы игрока.
 * Все расчеты детерминированы координатами (x, y).
 */

if (typeof SeededRandom === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед worldCurve.js");
}

const WorldCurveModule = (function() {
    'use strict';

    // Типы математических кривых
    const CURVES = {
        LINEAR: 'linear',       // Равномерный рост
        EXPONENTIAL: 'exp',     // Быстрый рост (для сложности врагов)
        LOGARITHMIC: 'log'      // Медленный рост (для защиты)
    };

    /**
     * Внутренняя функция расчета значения по кривой
     */
    function calculate(type, x, params) {
        const a = params.a || 1;
        const b = params.b || 1;
        const c = params.c || 0;

        switch (type) {
            case CURVES.LINEAR:
                return a * x + b;
            
            case CURVES.EXPONENTIAL:
                // Ограниченный экспоненциальный рост
                return a * Math.pow(1.15, x) + c; 
            
            case CURVES.LOGARITHMIC:
                // Логарифмический рост (замедляется с уровнем)
                return a * Math.log(x + 1) + b;
                
            default:
                return x;
        }
    }

    return {
        /**
         * Получить базовое HP игрока для данного уровня
         */
        getPlayerBaseHP: function(level) {
            // Линейный рост: 5 * уровень + 15. На 1 ур = 20 HP.
            return Math.floor(calculate(CURVES.LINEAR, level, { a: 5, b: 15 }));
        },

        /**
         * Получить базовую Атаку игрока
         */
        getPlayerBaseAtk: function(level) {
            // Медленный линейный рост: 0.5 * уровень + 2. На 1 ур = 2.5 (округлится до 2).
            return Math.floor(calculate(CURVES.LINEAR, level, { a: 0.5, b: 2 }));
        },

        /**
         * Получить базовую Защиту игрока
         */
        getPlayerBaseDef: function(level) {
            // Логарифмический рост, чтобы защита не становилась имбой.
            return Math.floor(calculate(CURVES.LOGARITHMIC, level, { a: 1.5, b: 0 }));
        },

        /**
         * Получить множитель сложности врагов для данной глубины (координаты x, y)
         */
        /**
         * Получить множитель сложности врагов для данной глубины (координаты x, y)
         */
        getEnemyMultiplier: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            // Более плавный рост: 1.08 вместо 1.15. 
            // На глубине 0 множитель будет ~1.15, на глубине 10 ~2.5 (вместо 4.0)
            return 1.0 * Math.pow(1.02, depth) + 0.0; 
        },

    
        /**
         * Множитель силы предметов (качества) от глубины
         */
        getItemPowerMultiplier: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            // Линейный рост качества предметов
            return calculate(CURVES.LINEAR, depth, { a: 0.1, b: 1.0 });
        },

        /**
         * Множитель золота
         */
        getGoldMultiplier: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            return calculate(CURVES.LINEAR, depth, { a: 1.2, b: 1 });
        },

        /**
         * Проверка: является ли этот уровень "Хабом" (безопасной зоной)
         * Хабы появляются каждые 5 уровней глубины
         */
        isHubLevel: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            return depth > 0 && depth % 5 === 0;
        },

        /**
         * Генерация параметров "тренда" мира для этого уровня
         */
        getWorldTrend: function(x, y) {
            // Используем createSeed из name_generator.js для детерминизма
            const metaSeed = createSeed(x, y) + 9999; 
            const rng = new SeededRandom(metaSeed);
            const roll = rng.next();
            
            if (roll < 0.1) {
                return { name: "Кровавая Луна", enemyAtkMult: 1.5, enemyHpMult: 0.8, color: "#500" };
            } else if (roll < 0.2) {
                return { name: "Древние Сокровища", goldMult: 3.0, itemQualityMult: 1.5, color: "#fd0" };
            } else if (roll < 0.3) {
                return { name: "Магический Фон", magicFindMult: 2.0, color: "#a0f" };
            }
            
            return { name: "Обычный уровень", enemyAtkMult: 1.0, enemyHpMult: 1.0, goldMult: 1.0, color: "#fff" };
        }
    };
})();
```

# ###index.html

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Roguelike: Подземелье Координат</title>
    
    <!-- ROT.js v2.2.1 -->
    <script src="rot.min.js"></script>
    <!-- Seedrandom -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/seedrandom/3.0.5/seedrandom.min.js"></script>
    
    <script src="sprite_registry.js"></script>
    <script src="name_generator.js"></script>
    <script src="worldCurve.js"></script>
    <script src="dungeon_generator.js"></script>   <!-- DUNGEON_TYPES здесь -->
    <script src="data.js"></script>
    <script src="map.js"></script>
    <script src="entity.js"></script>
    <script src="combat.js"></script>
    <script src="globalMap.js"></script>   <!-- использует DUNGEON_TYPES -->
    <script src="tileset_renderer.js"></script>
    <script src="render.js"></script>
    <script src="npc_generator.js"></script>
    <script src="game.js"></script>



    
    
    <style>
        :root {
            --bg-color: #0d1117;
            --panel-bg: #161b22;
            --border-color: #30363d;
            --text-main: #c9d1d9;
            --text-dim: #8b949e;
            --accent: #58a6ff;
            --danger: #f85149;
            --gold: #d29922;
            --font-stack: 'Consolas', 'Monaco', monospace;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: var(--font-stack);
            margin: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        #game-layout {
            display: grid;
            grid-template-columns: 260px 1fr 260px;
            grid-template-rows: 100px 1fr 140px;
            height: 100%;
            gap: 4px;
            padding: 4px;
            box-sizing: border-box;
        }

        .panel {
            background: var(--panel-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 10px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        h3 {
            margin: 0 0 8px 0;
            font-size: 13px;
            text-transform: uppercase;
            color: var(--text-dim);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 4px;
            letter-spacing: 1px;
        }

        header {
            grid-column: 1 / -1;
            display: flex;
            flex-direction: column; 
            justify-content: space-between;
            align-items: center;
            text-align: center;
            padding: 10px 15px; 
        }
        .loc-info { text-align: center; width: 100% }
        .loc-name { color: var(--accent); font-weight: bold; font-size: 1.1em; }
        .loc-coords { color: var(--text-dim); font-size: 0.8em; margin-bottom: 8px; }
        .loc-desc { color: var(--text-dim); font-size: 0.8em; font-style: italic; margin-top: 2px;}
        .loc-type { color: var(--gold); font-size: 0.8em; margin-top: 1px; }
        
        #map-container {
            grid-column: 2;
            grid-row: 2;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #000;
            border: 1px solid var(--border-color);
            position: relative;
            overflow: hidden;
            width: 100%;
            height: 100%;
        }

        #map-container canvas {
            display: block;
            transform-origin: center center;
            image-rendering: pixelated;
        }

        .stat-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; }
        .val-hp { color: var(--danger); }
        .val-atk { color: var(--gold); }
        .val-def { color: var(--accent); }
        
        .equip-slot { font-size: 12px; margin-bottom: 4px; color: #aaa; }
        .equip-item { color: var(--gold); }

        #inventory-list { overflow-y: auto; flex: 0 0 auto; max-height: 30%; margin-bottom: 5px; }
        .inv-item {
            padding: 3px 5px;
            background: rgba(255,255,255,0.05);
            margin-bottom: 3px;
            cursor: pointer;
            font-size: 11px;
            border-radius: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .inv-item:hover { background: rgba(255,255,255,0.1); }

        #log-list {
            overflow-y: auto;
            flex: 1;
            font-size: 11px;
            display: flex;
            flex-direction: column-reverse;
        }
        .log-msg { margin-bottom: 2px; line-height: 1.2; word-wrap: break-word; }
        .log-combat { color: var(--danger); }
        .log-loot { color: var(--gold); }
        .log-info { color: var(--accent); }

        #minimap-panel {
            grid-column: 1;
            grid-row: 3;
            display: flex;
            flex-direction: column;
        }
        #minimap { 
            width: 100%; 
            height: 100%; 
            background: #000; 
            border-radius: 4px;
            image-rendering: pixelated;
        }

        footer {
            grid-column: 2 / 4;
            grid-row: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            font-size: 12px;
            color: var(--text-dim);
        }
        kbd { background: #333; padding: 2px 6px; border-radius: 4px; color: #fff; border: 1px solid #444; }
    </style>
</head>
<body>

<div id="game-layout">
    <header class="panel">
        <div style="font-weight:bold; font-size:16px;">👾 Roguelike JS</div>
        <div class="loc-info">
            <div id="ui-loc-name" class="loc-name">Инициализация...</div>
            <div id="ui-loc-type" class="loc-type"></div>
            <div id="ui-loc-desc" class="loc-desc"></div>
            <div id="ui-loc-coords" class="loc-coords">Выход: —</div>
        </div>
    </header>

    <div class="panel" style="grid-row: 2;">
        <h3>Персонаж</h3>
        <div id="ui-stats"></div>
        
        <h3 style="margin-top: 15px;">Экипировка</h3>
        <div id="ui-equip"></div>

        <!-- === НОВЫЙ БЛОК: ИНСПЕКТОР === -->
        <h3 style="margin-top: 15px; color: var(--accent);">👁️ Инспектор</h3>
        <div id="ui-inspector" style="font-size: 12px; color: var(--text-dim); min-height: 40px;">
            <div style="font-style: italic; opacity: 0.7;">Кликните по объекту на карте...</div>
        </div>
    </div>

    <div id="map-container"></div>

    <div class="panel" style="grid-row: 2;">
        <h3>Инвентарь</h3>
        <div id="inventory-list"></div>
        <h3 style="margin-top: 10px;">Журнал событий</h3>
        <div id="log-list"></div>
    </div>
    
    <div id="minimap-panel" class="panel">
        <h3>Карта мира</h3>
        <canvas id="minimap"></canvas>
    </div>

    <footer class="panel">
        <span><kbd>←↑↓→</kbd> Движение / Атака</span>
        <span><kbd>Space</kbd> Пропуск хода</span>
        <span><kbd>Click</kbd> Использовать предмет</span>
    </footer>
</div>

</body>
</html>
```


# ###combat.js
```js

// =========================== Модуль боя и использования предметов ===========================
const CombatModule = (function() {
    
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ АНИМАЦИИ УДАРА ===
    function triggerHitAnimation() {
        let frames = 0;
        const maxFrames = 5; // Количество кадров анимации (примерно 150-200мс)
        
        const interval = setInterval(() => {
            frames++;
            RenderModule.requestRedraw(); // Принудительно перерисовываем экран
            
            if (frames >= maxFrames) {
                clearInterval(interval);
                RenderModule.requestRedraw(); // Финальная перерисовка, чтобы вернуть обычный символ
            }
        }, 40); // Частота обновления (40мс = 25 FPS для анимации)
    }

    // === АТАКА БЛИЖНЕГО БОЯ ===
    function attack(attacker, defender, logFn) { 
        let dmg = Math.max(1, attacker.atk - defender.def);
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        defender.hp -= dmg;
        
        // === ЭФФЕКТ ВСПЫШКИ ===
        defender.flashEndTime = Date.now() + 200; // Длительность 200мс
        defender.flashChar = "*"; 
        
        // Запускаем анимацию перерисовки
        triggerHitAnimation();

        const attackerName = attacker.name || "Вы";
        const defenderName = defender.name || "враг";
        const verb = attackerName === "Вы" ? "бьете" : "бьет";
        
        logFn(`${attackerName} ${verb} ${defenderName} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (defender.hp <= 0) {
            logFn(`${defenderName} погибает!`, "info");
            return true;
        }
        return false;
    }

    // === ДИСТАНЦИОННАЯ АТАКА ===
    function rangedAttack(player, target, weapon, logFn, updateUiFn) {
        // ... (проверки без изменений) ...
        if (!weapon || weapon.meleeType !== false) return false;
        if (weapon.currentAmmo <= 0) {
            logFn(`Нет боеприпасов для ${weapon.name}!`, "combat");
            return false;
        }
        const dist = Math.abs(player.x - target.x) + Math.abs(player.y - target.y);
        if (dist > weapon.range) {
            logFn(`${target.name} слишком далеко для ${weapon.name} (макс. ${weapon.range})!`, "combat");
            return false;
        }

        weapon.currentAmmo--;
        let dmg = Math.max(1, player.atk - target.def); 
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        target.hp -= dmg;
        
        // === ЭФФЕКТ ВСПЫШКИ ===
        target.flashEndTime = Date.now() + 200;
        target.flashChar = "*";
        
        // Запускаем анимацию перерисовки
        triggerHitAnimation();

        logFn(`Вы стреляете в ${target.name} из ${weapon.name} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (updateUiFn) updateUiFn();

        if (target.hp <= 0) {
            logFn(`${target.name} погибает от выстрела!`, "info");
            return true;
        }
        return false;
    }

    // ... (остальной код combat.js без изменений) ...

    // === ВЫПАДЕНИЕ ЛУТА ===
    // Исправленная сигнатура: (enemy, player, depth, itemsArray, logFn)
    function dropLoot(enemy, player, depth, itemsArray, logFn) {
        if (!enemy.lootType) return;

        // Шанс выпадения 40% (если random > 0.4, то выходим)
        if (Math.random() > 0.4) return;

        let droppedItem = null;
        // Используем seedrandom для разнообразия, но можно и Math.random
        const rng = new Math.seedrandom(`loot_${enemy.x}_${enemy.y}_${Date.now()}`);

        if (enemy.lootType === 'gold') {
            // Золото: количество растет с глубиной
            const baseGold = 5 + Math.floor(depth * 2.5);
            const amount = Math.floor(baseGold * (0.8 + Math.random() * 0.4)); 
            
            droppedItem = {
                x: enemy.x, y: enemy.y,
                name: `${amount} золотых`,
                char: '$', color: '#FFD700',
                type: 'gold',
                val: amount,
                isItem: true
            };
        } 
        else if (enemy.lootType === 'food') {
            // Еда
            const foods = DataModule.ITEM_TYPES.filter(i => i.type === 'food');
            if (foods.length > 0) {
                const template = rng.choice(foods);
                // createItem принимает: (template, x, y, itemPowerMult)
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, 1.0);
            }
        } 
        else if (enemy.lootType === 'weapon') {
            // Оружие/Броня
            const equips = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
            if (equips.length > 0) {
                const template = rng.choice(equips);
                // Множитель силы зависит от глубины
                const powerMult = 1.0 + (depth * 0.15); 
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, powerMult);
            }
        }

        if (droppedItem) {
            itemsArray.push(droppedItem);
            logFn(`${enemy.name} оставил после себя: ${droppedItem.name}`, "loot");
        }
    }

    function useItem(player, index, logFn, updateUiFn) {
        const item = player.inventory[index];
        if (!item) return;

        let used = false;

        if (item.effect === "heal") {
            player.hp = Math.min(player.maxHp, player.hp + item.val);
            logFn(`Вы использовали ${item.name}. HP +${item.val}.`, "loot");
            used = true;
        } 
        else if (item.effect === "buff_atk") {
            player.atk += item.val;
            logFn(`Вы выпили ${item.name}. Сила +${item.val}.`, "loot");
            used = true;
        }
        else if (item.type === "weapon") {
            if (player.equipment.weapon) {
                player.atk -= player.equipment.weapon.val;
                player.inventory.push(player.equipment.weapon);
            }
            player.equipment.weapon = item;
            player.atk += item.val;
            if (item.maxAmmo > 0 && item.currentAmmo === 0) {
                item.currentAmmo = item.maxAmmo;
            }
            logFn(`Вы взяли в руки ${item.name}. Атака +${item.val}.`, "loot");
            used = true;
        } 
        else if (item.type === "armor") {
            if (player.equipment.armor) {
                player.def -= player.equipment.armor.val;
                player.inventory.push(player.equipment.armor);
            }
            player.equipment.armor = item;
            player.def += item.val;
            logFn(`Вы надели ${item.name}. Защита +${item.val}.`, "loot");
            used = true;
        }

        if (used) {
            player.inventory.splice(index, 1);
            updateUiFn();
        }
    }

    return {
        attack,
        rangedAttack,
        dropLoot,
        useItem
    };
})();
```

# ###data.js
```js
// =========================== Модуль данных ===========================
// =========================== Модуль данных ===========================
const DataModule = (function() {
    // Расширенные прилагательные с формами для согласования
    const ITEM_ADJECTIVES = [
        { base: "Ржавый", she: "Ржавая", it: "Ржавое", plural: "Ржавые" },
        { base: "Новый", she: "Новая", it: "Новое", plural: "Новые" },
        { base: "Тяжелый", she: "Тяжелая", it: "Тяжелое", plural: "Тяжелые" },
        { base: "Острый", she: "Острая", it: "Острое", plural: "Острые" },
        { base: "Древний", she: "Древняя", it: "Древнее", plural: "Древние" },
        { base: "Магический", she: "Магическая", it: "Магическое", plural: "Магические" },
        { base: "Проклятый", she: "Проклятая", it: "Проклятое", plural: "Проклятые" },
        { base: "Святой", she: "Святая", it: "Святое", plural: "Святые" }
    ];

    const ENEMY_TYPES = [
        // === УРОВЕНЬ 1-3 ===
        { name: "Крыса", char: getChar('ENEMY_RAT'), color: "#795548", hp: [8, 12], atk: [1, 1], def: [0, 0], lootType: "food" },
        { name: "Гоблин", char: getChar('ENEMY_GOBLIN'), color: "#4CAF50", hp: [12, 18], atk: [1, 2], def: [0, 1], lootType: "gold" },
        { name: "Волк", char: getChar('ENEMY_WOLF'), color: "#9E9E9E", hp: [15, 22], atk: [2, 3], def: [0, 1], lootType: "food" },
        
        // === УРОВЕНЬ 4-6 ===
        { name: "Бандит", char: getChar('ENEMY_BANDIT'), color: "#FF9800", hp: [25, 35], atk: [3, 5], def: [1, 2], lootType: "weapon" },
        { name: "Скелет", char: getChar('ENEMY_SKELETON'), color: "#B0BEC5", hp: [20, 30], atk: [3, 6], def: [1, 2], lootType: "gold" },
        { name: "Слизень", char: getChar('ENEMY_SLIME'), color: "#00BCD4", hp: [30, 45], atk: [2, 3], def: [3, 5], lootType: "food" },
        { name: "Орк-разведчик", char: getChar('ENEMY_ORC'), color: "#8BC34A", hp: [35, 50], atk: [4, 7], def: [2, 3], lootType: "weapon" },

        // === УРОВЕНЬ 7-9 ===
        { name: "Зомби", char: getChar('ENEMY_ZOMBIE'), color: "#607D8B", hp: [50, 70], atk: [6, 9], def: [2, 4], lootType: "gold" },
        { name: "Гарпия", char: getChar('ENEMY_HARPY'), color: "#E91E63", hp: [40, 60], atk: [8, 12], def: [1, 2], lootType: "weapon" },
        { name: "Призрак", char: getChar('ENEMY_GHOST'), color: "#7C4DFF", hp: [30, 45], atk: [7, 10], def: [0, 1], lootType: "gold" },
        { name: "Вампир", char: getChar('ENEMY_VAMPIRE'), color: "#C62828", hp: [60, 85], atk: [9, 13], def: [3, 5], lootType: "weapon" },

        // === УРОВЕНЬ 10+ ===
        { name: "Тролль", char: getChar('ENEMY_TROLL'), color: "#4CAF50", hp: [80, 120], atk: [10, 15], def: [2, 3], lootType: "gold" },
        { name: "Лич", char: getChar('ENEMY_LICH'), color: "#7B1FA2", hp: [70, 100], atk: [12, 18], def: [2, 4], lootType: "weapon" },
        { name: "Голем", char: getChar('ENEMY_GOLEM'), color: "#90A4AE", hp: [120, 180], atk: [12, 16], def: [8, 12], lootType: "gold" },
        { name: "Дракон", char: getChar('ENEMY_DRAGON'), color: "#FF5722", hp: [100, 150], atk: [15, 22], def: [5, 8], lootType: "weapon" }
    ];

    const ITEM_TYPES = [
        // === МЕЛЕЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_SWORD'), color: "#FFD700", baseName: "Меч", stat: "atk", val: [2, 5], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_AXE'), color: "#FFD700", baseName: "Топор", stat: "atk", val: [3, 7], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_MACE'), color: "#FFD700", baseName: "Булава", stat: "atk", val: [2, 6], gender: "she", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_DAGGER'), color: "#FF9800", baseName: "Кинжал", stat: "atk", val: [1, 3], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_SPEAR'), color: "#FFD700", baseName: "Копьё", stat: "atk", val: [4, 8], gender: "it", plural: false, meleeType: true, range: 1 },
        
        // === ДИСТАНЦИОННОЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_BOW'), color: "#FF9800", baseName: "Лук", stat: "atk", val: [3, 6], gender: "he", plural: false, meleeType: false, range: 6, maxAmmo: 20 },
        { type: "weapon", char: getChar('ITEM_CROSSBOW'), color: "#FF9800", baseName: "Арбалет", stat: "atk", val: [5, 9], gender: "he", plural: false, meleeType: false, range: 8, maxAmmo: 15 },
        { type: "weapon", char: getChar('ITEM_STAFF'), color: "#B39DDB", baseName: "Посох огня", stat: "atk", val: [2, 4], gender: "he", plural: false, meleeType: false, range: 5, maxAmmo: 50 },
        
        // === БРОНЯ ===
        { type: "armor", char: getChar('ITEM_ARMOR_LEATHER'), color: "#9E9E9E", baseName: "Кожаная броня", stat: "def", val: [1, 3], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_ARMOR_CHAIN'), color: "#9E9E9E", baseName: "Кольчуга", stat: "def", val: [3, 6], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_SHIELD'), color: "#795548", baseName: "Щит", stat: "def", val: [2, 4], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GREAVES'), color: "#4CAF50", baseName: "Наголенники", stat: "def", val: [1, 3], gender: "he", plural: true },
        { type: "armor", char: getChar('ITEM_CLOAK'), color: "#8D6E63", baseName: "Плащ теней", stat: "def", val: [2, 3], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_HELMET'), color: "#607D8B", baseName: "Шлем", stat: "def", val: [1, 2], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GLOVES'), color: "#8D6E63", baseName: "Перчатки", stat: "def", val: [1, 2], gender: "she", plural: true },

        // === ЗОЛОТО ===
        { type: "gold", char: getChar('ITEM_GOLD'), color: "#FFD700", baseName: "Монеты", val: [5, 15] },
        
        // === ЗЕЛЬЯ И ЕДА ===
        { type: "potion_hp", char: getChar('ITEM_POTION_HP'), color: "#f44336", baseName: "Зелье лечения", effect: "heal", val: [10, 20] },
        { type: "potion_hp", char: getChar('ITEM_ELIXIR'), color: "#f44336", baseName: "Эликсир жизни", effect: "heal", val: [25, 40] },
        { type: "food", char: getChar('ITEM_FOOD_BREAD'), color: "#8BC34A", baseName: "Хлеб и сыр", effect: "heal", val: [5, 10] },
        { type: "food", char: getChar('ITEM_FOOD_MEAT'), color: "#8BC34A", baseName: "Жареная крыса", effect: "heal", val: [8, 12] },
        { type: "potion_str", char: getChar('ITEM_POTION_STR'), color: "#ff9800", baseName: "Зелье силы", effect: "buff_atk", val: [1, 2] },
        { type: "potion_str", char: getChar('ITEM_BERSERK'), color: "#ff9800", baseName: "Настой берсерка", effect: "buff_atk", val: [3, 5] }
    ];

    const MAP_WIDTH = 100;
    const MAP_HEIGHT = 100;

    return {
        ITEM_ADJECTIVES,
        ENEMY_TYPES,
        ITEM_TYPES,
        MAP_WIDTH,
        MAP_HEIGHT
    };
})();
```

# ###effect_system.js
```js
/**
 * МОДУЛЬ СИСТЕМЫ ЭФФЕКТОВ (effect_system.js)
 * Управляет временными состояниями существ (баффы, дебаффы, DoT).
 */

const EffectSystemModule = (function() {
    'use strict';

    // Типы эффектов
    const EFFECT_TYPES = {
        BUFF: 'buff',       // Усиление
        DEBUFF: 'debuff',   // Ослабление
        DOT: 'dot',         // Урон со временем
        HOT: 'hot'          // Лечение со временем
    };

    /**
     * Фабрика создания эффекта
     */
    function createEffect(id, name, type, duration, data, color) {
        return {
            id: id,
            name: name,
            type: type,
            duration: duration,
            data: data || {},
            color: color || '#fff'
        };
    }

    /**
     * Добавляет эффект к существу
     */
    function addEffect(entity, effect) {
        if (!entity.effects) entity.effects = [];

        const existing = entity.effects.find(e => e.id === effect.id);
        
        if (existing) {
            // Обновляем длительность (берем максимум)
            existing.duration = Math.max(existing.duration, effect.duration);
            // Если новый эффект сильнее, обновляем данные
            if (effect.data.power > existing.data.power) {
                existing.data = effect.data;
            }
        } else {
            entity.effects.push(effect);
        }
    }

    /**
     * Удаляет эффект по ID
     */
    function removeEffect(entity, effectId) {
        if (!entity.effects) return;
        entity.effects = entity.effects.filter(e => e.id !== effectId);
    }

    /**
     * Обрабатывает тики эффектов (урон/лечение) и уменьшает длительность
     */
    function processEffects(entity, logFn) {
        if (!entity.effects || entity.effects.length === 0) return;

        // Проходим по копии массива, чтобы безопасно удалять элементы
        [...entity.effects].forEach(effect => {
            // 1. Применяем мгновенный эффект (урон или лечение)
            if (effect.type === EFFECT_TYPES.DOT) {
                const dmg = effect.data.power || 1;
                entity.hp -= dmg;
                if (logFn) logFn(`${entity.name} получает ${dmg} урона от ${effect.name}.`, "combat");
            } 
            else if (effect.type === EFFECT_TYPES.HOT) {
                const heal = effect.data.power || 1;
                const oldHp = entity.hp;
                entity.hp = Math.min(entity.maxHp, entity.hp + heal);
                if (logFn && (entity.hp - oldHp) > 0) logFn(`${entity.name} восстанавливает ${heal} HP.`, "info");
            }

            // 2. Уменьшаем длительность
            effect.duration--;

            // 3. Удаляем, если время вышло
            if (effect.duration <= 0) {
                removeEffect(entity, effect.id);
                if (logFn) logFn(`Действие ${effect.name} на ${entity.name} закончилось.`, "info");
            }
        });
    }

    /**
     * Получает суммарный бонус к стату от баффов/дебаффов
     */
    function getStatModifier(entity, statName) {
        if (!entity.effects) return 0;
        let mod = 0;
        entity.effects.forEach(e => {
            if ((e.type === EFFECT_TYPES.BUFF || e.type === EFFECT_TYPES.DEBUFF) && e.data.stats) {
                mod += (e.data.stats[statName] || 0);
            }
        });
        return mod;
    }

    // --- Функции-конструкторы стандартных эффектов ---

    function createBurn(duration, power) {
        return createEffect('burn', 'Горение', EFFECT_TYPES.DOT, duration, { power: power }, '#ff5500');
    }

    function createPoison(duration, power) {
        return createEffect('poison', 'Яд', EFFECT_TYPES.DOT, duration, { power: power }, '#00ff00');
    }

    function createHaste(duration, speedBonus) {
        return createEffect('haste', 'Спешка', EFFECT_TYPES.BUFF, duration, { stats: { speed: speedBonus } }, '#ffff00');
    }

    function createWeakness(duration, atkPenalty) {
        return createEffect('weakness', 'Слабость', EFFECT_TYPES.DEBUFF, duration, { stats: { atk: -atkPenalty } }, '#888888');
    }

    function createRegen(duration, power) {
        return createEffect('regen', 'Регенерация', EFFECT_TYPES.HOT, duration, { power: power }, '#00ffaa');
    }

    // === ПУБЛИЧНЫЙ ИНТЕРФЕЙС ===
    return {
        addEffect: addEffect,
        removeEffect: removeEffect,
        processEffects: processEffects,
        getStatModifier: getStatModifier,
        
        // Группируем конструкторы в объекте Effects
        Effects: {
            createBurn: createBurn,
            createPoison: createPoison,
            createHaste: createHaste,
            createWeakness: createWeakness,
            createRegen: createRegen
        }
    };

})();
```
# ###sprite_registry.js
```js
/**
 * ЕДИНЫЙ РЕЕСТР СПРАЙТОВ И СИМВОЛОВ (sprite_registry.js)
 * Подключать ПЕРВЫМ среди пользовательских скриптов.
 */

const SPRITE_REGISTRY = {
    // ==========================================
    // 1. ГЛОБАЛЬНАЯ КАРТА (Ландшафт)
    // ==========================================
    'TILE_PLAIN':            { char: '.',   tile: { file: 'terrain_sprites', x: 0, y: 1 }, desc: 'Равнина' },
    'TILE_FOREST':           { char: 'T',   tile: { file: 'terrain_sprites', x: 8, y: 2 }, desc: 'Лес' },
    'TILE_MOUNTAIN':         { char: '^',   tile: { file: 'terrain_sprites', x: 5, y: 2 }, desc: 'Горы' },
    'TILE_WATER':            { char: '≈',   tile: { file: 'terrain_sprites', x: 7, y: 2 }, desc: 'Вода' },
    'TILE_CITY':             { char: 'C',   tile: { file: 'terrain_sprites', x: 9, y: 2 }, desc: 'Город' },
    'TILE_DUNGEON_ENTRANCE': { char: 'D',   tile: { file: 'terrain_sprites', x: 6, y: 0 }, desc: 'Вход в подземелье' },
    'TILE_ROAD':             { char: '█',   tile: { file: 'terrain_sprites', x: 11, y: 2 }, desc: 'Дорога' },

    // ==========================================
    // 2. ПОДЗЕМЕЛЬЕ (Стены и Пол)
    // ==========================================
    'FLOOR_DEFAULT':         { char: '.',   tile: { file: 'terrain_sprites', x: 0, y: 1 }, desc: 'Обычный пол' },
    'WALL_DEFAULT':          { char: '#',   tile: { file: 'terrain_sprites', x: 1, y: 2 }, desc: 'Обычная стена' },
    
    // Специфичные тайлы (для пещер, городов и т.д.)
    'FLOOR_ORGANIC':         { char: 'o',   tile: { file: 'terrain_sprites', x: 3, y: 2 }, desc: 'Органический пол' },
    'WALL_ORGANIC':          { char: 'O',   tile: { file: 'terrain_sprites', x: 4, y: 2 }, desc: 'Органическая стена' },
    'FLOOR_CITY':            { char: '·',   tile: { file: 'terrain_sprites', x: 0, y: 1 }, desc: 'Пол города' }, // Используем тот же спрайт пола или свой
    'WALL_CITY':             { char: '█',   tile: { file: 'terrain_sprites', x: 11, y: 2 }, desc: 'Стена города' },

    // Лестницы
    'STAIRS_DOWN':           { char: '<',   tile: { file: 'terrain_sprites', x: 2, y: 0 }, desc: 'Лестница вниз' },
    'STAIRS_UP':             { char: '>',   tile: { file: 'terrain_sprites', x: 3, y: 0 }, desc: 'Лестница вверх' },

    // ==========================================
    // 3. СУЩНОСТИ (Игрок и NPC)
    // ==========================================
    'PLAYER':                { char: '@',   tile: { file: 'creature_sprites', x: 2, y: 0 }, desc: 'Игрок' },
    'NPC':                   { char: '☺',   tile: { file: 'creature_sprites', x: 8, y: 3 }, desc: 'NPC' },

    // ==========================================
    // 4. ВРАГИ (ENEMY_TYPES)
    // ==========================================
    'ENEMY_RAT':             { char: 'r',   tile: { file: 'creature_sprites', x: 8, y: 9 }, desc: 'Крыса' },
    'ENEMY_GOBLIN':          { char: 'g',   tile: { file: 'creature_sprites', x: 12, y: 3 }, desc: 'Гоблин' },
    'ENEMY_WOLF':            { char: 'w',   tile: { file: 'creature_sprites', x: 1, y: 9 }, desc: 'Волк' },
    'ENEMY_BANDIT':          { char: 'b',   tile: { file: 'creature_sprites', x: 5, y: 0 }, desc: 'Бандит' },
    'ENEMY_SKELETON':        { char: 's',   tile: { file: 'creature_sprites', x: 6, y: 0 }, desc: 'Скелет' },
    'ENEMY_SLIME':           { char: 'j',   tile: { file: 'creature_sprites', x: 3, y: 15 }, desc: 'Слизень' },
    'ENEMY_ORC':             { char: 'k',   tile: { file: 'creature_sprites', x: 7, y: 0 }, desc: 'Орк' }, // Внимание: символ совпадает с WALL_ORGANIC
    'ENEMY_ZOMBIE':          { char: 'z',   tile: { file: 'creature_sprites', x: 8, y: 0 }, desc: 'Зомби' },
    'ENEMY_HARPY':           { char: 'h',   tile: { file: 'creature_sprites', x: 9, y: 0 }, desc: 'Гарпия' },
    'ENEMY_GHOST':           { char: 'G',   tile: { file: 'creature_sprites', x: 10, y: 0 }, desc: 'Призрак' }, // Совпадает с ITEM_GLOVES
    'ENEMY_VAMPIRE':         { char: 'V',   tile: { file: 'creature_sprites', x: 11, y: 0 }, desc: 'Вампир' },
    'ENEMY_TROLL':           { char: 't',   tile: { file: 'creature_sprites', x: 12, y: 0 }, desc: 'Тролль' }, // Совпадает с TILE_FOREST
    'ENEMY_LICH':            { char: 'L',   tile: { file: 'creature_sprites', x: 13, y: 0 }, desc: 'Лич' },
    'ENEMY_GOLEM':           { char: 'M',   tile: { file: 'creature_sprites', x: 14, y: 0 }, desc: 'Голем' },
    'ENEMY_DRAGON':          { char: 'q',   tile: { file: 'creature_sprites', x: 15, y: 0 }, desc: 'Дракон' },

    // ==========================================
    // 5. ПРЕДМЕТЫ (ITEM_TYPES)
    // ==========================================
    
    // Оружие ближнего боя
    'ITEM_SWORD':            { char: '/',   tile: { file: 'item_sprites', x: 0, y: 0 }, desc: 'Меч' },
    'ITEM_AXE':              { char: 'P',   tile: { file: 'item_sprites', x: 1, y: 0 }, desc: 'Топор' }, // Совпадает с TILE_MOUNTAIN
    'ITEM_MACE':             { char: ')',   tile: { file: 'item_sprites', x: 2, y: 0 }, desc: 'Булава' },
    'ITEM_DAGGER':           { char: '*',   tile: { file: 'item_sprites', x: 3, y: 0 }, desc: 'Кинжал' }, // Совпадает с ITEM_BERSERK
    'ITEM_SPEAR':            { char: 'Y',   tile: { file: 'item_sprites', x: 4, y: 0 }, desc: 'Копье' },

    // Оружие дальнего боя
    'ITEM_BOW':              { char: '(',   tile: { file: 'item_sprites', x: 5, y: 0 }, desc: 'Лук' },
    'ITEM_CROSSBOW':         { char: '=',   tile: { file: 'item_sprites', x: 6, y: 0 }, desc: 'Арбалет' },
    'ITEM_STAFF':            { char: '|',   tile: { file: 'item_sprites', x: 7, y: 0 }, desc: 'Посох' },

    // Броня
    'ITEM_ARMOR_LEATHER':    { char: ']',   tile: { file: 'item_sprites', x: 8, y: 0 }, desc: 'Кожаная броня' },
    'ITEM_ARMOR_CHAIN':      { char: '[',   tile: { file: 'item_sprites', x: 9, y: 0 }, desc: 'Кольчуга' },
    'ITEM_SHIELD':           { char: '}',   tile: { file: 'item_sprites', x: 10, y: 0 }, desc: 'Щит' },
    'ITEM_GREAVES':          { char: '"',   tile: { file: 'item_sprites', x: 11, y: 0 }, desc: 'Наголенники' }, // Совпадает с FLOOR_ORGANIC
    'ITEM_CLOAK':            { char: '{',   tile: { file: 'item_sprites', x: 12, y: 0 }, desc: 'Плащ' },
    'ITEM_HELMET':           { char: 'H',   tile: { file: 'item_sprites', x: 13, y: 0 }, desc: 'Шлем' },
    'ITEM_GLOVES':           { char: ',',   tile: { file: 'item_sprites', x: 14, y: 0 }, desc: 'Перчатки' }, // Совпадает с ENEMY_GHOST

    // Ресурсы и прочее
    'ITEM_GOLD':             { char: '$',   tile: { file: 'item_sprites', x: 18, y: 0 }, desc: 'Золото' },
    
    // Зелья и еда
    'ITEM_POTION_HP':        { char: '!',   tile: { file: 'item_sprites', x: 14, y: 0 }, desc: 'Зелье лечения' }, // Совпадает с ITEM_POTION_STR
    'ITEM_ELIXIR':           { char: '+',   tile: { file: 'item_sprites', x: 15, y: 0 }, desc: 'Эликсир' },
    'ITEM_FOOD_BREAD':       { char: '%',   tile: { file: 'item_sprites', x: 16, y: 0 }, desc: 'Еда' },
    'ITEM_FOOD_MEAT':        { char: '~',   tile: { file: 'item_sprites', x: 17, y: 0 }, desc: 'Мясо' },
    'ITEM_POTION_STR':       { char: '!',   tile: { file: 'item_sprites', x: 14, y: 0 }, desc: 'Зелье силы' },
    'ITEM_BERSERK':          { char: '*',   tile: { file: 'item_sprites', x: 3, y: 0 }, desc: 'Настой берсерка' } // Совпадает с ITEM_DAGGER
};

/**
 * Получает символ (char) по ID из реестра.
 * Используется в data.js, dungeon_generator.js и map.js.
 */
function getChar(id) {
    return SPRITE_REGISTRY[id] ? SPRITE_REGISTRY[id].char : '?';
}

/**
 * Получает данные тайлсета (file, x, y) по ID.
 * Используется в спрайтовом рендерере.
 */
function getTileData(id) {
    return SPRITE_REGISTRY[id] ? SPRITE_REGISTRY[id].tile : null;
}
```
# ###tileset_renderer.js
```js


// tileset_renderer.js
const TilesetRenderer = (function() {
    const TILE_SIZE = 16;
    const spriteSheets = {};
    let isReady = false;
    let debugMode = false;

    // === МАППИНГ: символ → (файл, колонка, строка) ===
    // Убедитесь, что координаты x,y соответствуют вашему PNG!
    const TILE_MAP = {
        // Terrain
        '.': { file: 'terrain_sprites', x: 0, y: 1 }, // FLOOR_DEFAULT, TILE_PLAIN
        '#': { file: 'terrain_sprites', x: 1, y: 2 }, // WALL_DEFAULT
        '>': { file: 'terrain_sprites', x: 3, y: 0 }, // STAIRS_UP
        '<': { file: 'terrain_sprites', x: 2, y: 0 }, // STAIRS_DOWN
        'T': { file: 'terrain_sprites', x: 8, y: 2 }, // TILE_FOREST (и ENEMY_TROLL, но спрайт врага берется из файла creature)
        '^': { file: 'terrain_sprites', x: 5, y: 2 }, // TILE_MOUNTAIN (и ITEM_AXE)
        '≈': { file: 'terrain_sprites', x: 7, y: 2 }, // TILE_WATER
        'C': { file: 'terrain_sprites', x: 9, y: 2 }, // TILE_CITY
        'D': { file: 'terrain_sprites', x: 6, y: 0 }, // TILE_DUNGEON_ENTRANCE
        '█': { file: 'terrain_sprites', x: 11, y: 2 }, // TILE_ROAD, WALL_CITY
        'o': { file: 'terrain_sprites', x: 3, y: 2 }, // FLOOR_ORGANIC (и ITEM_GREAVES)
        'O': { file: 'terrain_sprites', x: 4, y: 2 }, // WALL_ORGANIC (и ENEMY_ORC - тут нужен отдельный спрайт для Орка в creature!)
        
        // Creatures & NPCs
        '@': { file: 'creature_sprites', x: 2, y: 0 }, // PLAYER
        'r': { file: 'creature_sprites', x: 8, y: 9 }, // ENEMY_RAT
        'g': { file: 'creature_sprites', x: 12, y: 3 }, // ENEMY_GOBLIN
        'w': { file: 'creature_sprites', x: 1, y: 9 }, // ENEMY_WOLF
        'j': { file: 'creature_sprites', x: 3, y: 15 }, // ENEMY_SLIME
        'b': { file: 'creature_sprites', x: 5, y: 0 }, // ENEMY_BANDIT
        's': { file: 'creature_sprites', x: 6, y: 0 }, // ENEMY_SKELETON
        'O': { file: 'creature_sprites', x: 7, y: 0 }, // ENEMY_ORC (Внимание: тот же ключ 'O', что и у стены! 
                                                // ВАШ РЕНДЕРЕР ДОЛЖЕН ПРИОРИТЕЗИРОВАТЬ СУЩНОСТИ НАД ТАЙЛАМИ.
                                                // Если ключи в объекте совпадают, одно перезапишет другое.
                                                // Решение: В TILE_MAP ключи должны быть уникальными. 
                                                // Но так как и стена, и орк используют символ 'O', 
                                                // вам нужно проверять контекст при отрисовке.
                                                // Обычно спрайтовый рендерер принимает (char, layer).
                                                // Если у вас один общий TILE_MAP, то 'O' будет последним записанным.
                                                // Исправьте ключи, если рендерер не поддерживает слои.
                                                // Например, используйте разные символы для Орка и Стены, если это возможно.
                                                // Или убедитесь, что при отрисовке врага вы обращаетесь к 'creature' файлу напрямую.
                                               //),
        'z': { file: 'creature_sprites', x: 8, y: 0 }, // ENEMY_ZOMBIE
        'h': { file: 'creature_sprites', x: 9, y: 0 }, // ENEMY_HARPY
        'G': { file: 'creature_sprites', x: 10, y: 0 }, // ENEMY_GHOST (и ITEM_GLOVES)
        'V': { file: 'creature_sprites', x: 11, y: 0 }, // ENEMY_VAMPIRE
        'T': { file: 'creature_sprites', x: 12, y: 0 }, // ENEMY_TROLL (и TILE_FOREST)
        'L': { file: 'creature_sprites', x: 13, y: 0 }, // ENEMY_LICH
        'M': { file: 'creature_sprites', x: 14, y: 0 }, // ENEMY_GOLEM
        'q': { file: 'creature_sprites', x: 15, y: 0 }, // ENEMY_DRAGON
        '☺': { file: 'creature_sprites', x: 8, y: 3 }, // NPC

        // Items
        '/': { file: 'item_sprites', x: 0, y: 0 },
        '^': { file: 'item_sprites', x: 1, y: 0 },
        ')': { file: 'item_sprites', x: 2, y: 0 },
        '*': { file: 'item_sprites', x: 3, y: 0 },
        'Y': { file: 'item_sprites', x: 4, y: 0 },
        '(': { file: 'item_sprites', x: 5, y: 0 },
        '=': { file: 'item_sprites', x: 6, y: 0 },
        '|': { file: 'item_sprites', x: 7, y: 0 },
        ']': { file: 'item_sprites', x: 8, y: 0 },
        '[': { file: 'item_sprites', x: 9, y: 0 },
        '}': { file: 'item_sprites', x: 10, y: 0 },
        '{': { file: 'item_sprites', x: 11, y: 0 },
        'H': { file: 'item_sprites', x: 12, y: 0 },
        '!': { file: 'item_sprites', x: 14, y: 0 },
        '+': { file: 'item_sprites', x: 15, y: 0 },
        '%': { file: 'item_sprites', x: 16, y: 0 },
        '~': { file: 'item_sprites', x: 17, y: 0 },
        '$': { file: 'item_sprites', x: 18, y: 0 }
    };
    async function init() {
        const files = [
            { src: 'terrain_sprites.png', key: 'terrain_sprites' },
            { src: 'creature_sprites.png', key: 'creature_sprites' },
            { src: 'item_sprites.png', key: 'item_sprites' }
        ];
        
        // Исправленный Promise.all с правильными скобками
        await Promise.all(files.map(({src, key}) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                spriteSheets[key] = img;
                console.log(`✅ Загружен тайлсет: ${key} (${img.width}x${img.height})`);
                resolve();
            };
            img.onerror = () => {
                console.error(`❌ Ошибка загрузки: ${src}`);
                reject();
            };
            img.src = src;
        })));
        
        isReady = true;
    }

    function draw(ctx, ch, sx, sy, color) {
        if (!ctx) return;

        const destX = sx * TILE_SIZE;
        const destY = sy * TILE_SIZE;

        const tile = TILE_MAP[ch];
        
        // Fallback на текст, если спрайт не найден
        if (!tile) {
            ctx.fillStyle = color || '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, destX + TILE_SIZE/2, destY + TILE_SIZE/2);
            return;
        }

        const img = spriteSheets[tile.file];
        
        if (!img || !isReady) {
            // Если картинка не загрузилась, рисуем красный квадрат
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tile.x * TILE_SIZE;
        const srcY = tile.y * TILE_SIZE;

        // Проверка границ спрайт-листа
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        ctx.save();

        // 1. Рисуем базовый белый спрайт
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // 2. Накладываем цвет
        const fillColor = color || '#ffffff';
        
        // Пропускаем окраску, если цвет черный (чтобы не скрыть спрайт) или если цвет не задан
        if (fillColor && fillColor !== '#000' && fillColor !== '#000000') {
            // source-atop: рисует новое только там, где уже есть контент (спрайт)
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = fillColor;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }

        ctx.restore();
    }

    return { 
        init, 
        draw, 
        TILE_SIZE,
        setDebug: (v) => debugMode = v,
        isReady: () => isReady
    };
})();
```






