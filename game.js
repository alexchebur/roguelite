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
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(`⚔️ ${enemy.name}`, `HP: ${enemy.hp}/${enemy.maxHp}\nATK: ${enemy.atk} | DEF: ${enemy.def}`, "enemy");
            }
            RenderModule.log(`Осмотр: ${enemy.name} [HP:${enemy.hp} ATK:${enemy.atk}]`, "info");
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

        if (EntityModule.spawnItems) {
            items = EntityModule.spawnItems(MapModule.currentMapData, player, DataModule.ITEM_TYPES, 6, 1.0, 2);
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
        const enemyCount = 8 + Math.floor(depth * 1.5);
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy) * (1 + depth * 0.2);
        
        // Фильтрация врагов по глубине
        let availableEnemies = DataModule.ENEMY_TYPES;
        if (depth < 3) {
            // Только слабые
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Гоблин", "Крыса", "Волк", "Слизень"].includes(e.name));
        } else if (depth < 7) {
            // Средние
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Бандит", "Скелет", "Орк", "Зомби"].includes(e.name));
        }
        // Если глубина >= 7, доступны все (включая драконов)

        enemies = EntityModule.spawnEnemies(
            MapModule.currentMapData,
            player,
            availableEnemies, // Передаем отфильтрованный список
            enemyCount,
            enemyMult,
            3
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
        }
        
        Math.random = oldRand;
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
            player.inventory.push(item);
            RenderModule.log(`Подобрано: ${item.name}`, "loot");
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

    return {
        init
    };
})();

window.onload = () => GameModule.init();
