// =========================== Модуль игры (управление, ходы, загрузка уровней) ===========================
const GameModule = (function() {
    // === Состояние игры ===
    let player = null;
    let enemies = [];
    let items = [];
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
            RenderModule.init();
        } catch (e) {
            console.error(e);
            return;
        }

        // Запускаем в глобальном режиме
        gameMode = 'global';
        
        // Начальная позиция на глобальной карте с поиском безопасной клетки
        const startPos = GlobalMapModule.initSafeStart(1, 1, 3);
        RenderModule.log(`Стартовая позиция: ${startPos.x}, ${startPos.y}`, "info");
        
        renderGlobalMap();
        
        window.addEventListener("keydown", (e) => handleInput(e));
        addTouchControls();
        
        RenderModule.log("Игра загружена. Режим: ГЛОБАЛЬНАЯ КАРТА", "info");
        RenderModule.log("Используйте стрелки для перемещения по миру. Входите в города (C) и подземелья (D)", "info");
    }
    
    // === Обработка сенсорного управления ===
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) {
            console.warn("Canvas не найден для сенсорного управления");
            return;
        }
        
        canvas.addEventListener("touchstart", (e) => {
            e.preventDefault();
            
            if (busy || (player && player.hp <= 0)) return;
            
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            let dx = 0, dy = 0;
            const offsetX = touchX - centerX;
            const offsetY = touchY - centerY;
            
            if (Math.abs(offsetX) > Math.abs(offsetY)) {
                dx = offsetX > 0 ? 1 : -1;
            } else {
                dy = offsetY > 0 ? 1 : -1;
            }
            
            if (gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }
        });
        
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
        items = [];
        explored.clear();
       
        
        RenderModule.log("Вы вернулись на поверхность", "info");
        renderGlobalMap();
    }
    
    // Загрузка города (без врагов)
    function loadCityLevel(gx, gy, cityName) {
        enemies = [];
        items = [];
        explored.clear();
        
        const startPos = MapModule.generateCity(gx, gy, 0);
        
        if (!player) {
            player = EntityModule.createPlayer(startPos.x, startPos.y);
        } else {
            player.x = startPos.x;
            player.y = startPos.y;
        }
        
        // Город: без врагов, но с предметами
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
            description: "Город, где можно отдохнуть и пополнить запасы",
            themeName: "Город"
        };
        
        currentWorldTrend = null;
        renderFrame();
    }
    
    // Загрузка подземелья с указанным типом и глубиной
    function loadDungeonLevel(gx, gy, depth, dungeonType, dungeonName) {
        console.log("=== ЗАГРУЗКА УРОВНЯ ПОДЗЕМЕЛЬЯ ===");
        console.log("Входные параметры: gx=", gx, "gy=", gy, "depth=", depth, "dungeonType=", dungeonType);
        
        // Очищаем старые данные
        enemies = [];
        items = [];
        explored.clear();
        
        // Генерируем новую карту с заданной глубиной
        const startPos = MapModule.generateWithType(gx, gy, depth, dungeonType);
        
        // Сохраняем параметры подземелья
        dungeonX = gx;
        dungeonY = gy;
        currentDepth = depth;
        currentDungeonTypeName = dungeonType;
        currentDungeonFullName = dungeonName;
        
        console.log("Сохранённая глубина currentDepth =", currentDepth);
        console.log("Лестница вверх:", MapModule.stairsUp);
        console.log("Лестница вниз:", MapModule.stairsDown);
        
        // Создаём или перемещаем игрока
        if (!player) {
            player = EntityModule.createPlayer(startPos.x, startPos.y);
        } else {
            player.x = startPos.x;
            player.y = startPos.y;
        
            // НЕ восстанавливаем здоровье, если не хотите
            // player.hp = player.maxHp; // раскомментируйте, если нужно лечить при спуске
        }



        
        // Спавним врагов и предметы
        spawnDungeonEntities(gx, gy, depth);
        
        // Обновляем UI с явным указанием уровня
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
        
        document.getElementById("ui-loc-name").textContent = "Глобальная карта";
        document.getElementById("ui-loc-desc").textContent = "Исследуйте мир, находите города и подземелья";
        document.getElementById("ui-loc-type").textContent = `Режим: ГЛОБАЛЬНАЯ КАРТА | Координаты: ${playerPos.x}, ${playerPos.y}`;
        document.getElementById("ui-loc-coords").textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
        
        document.getElementById("ui-stats").innerHTML = "<div class='stat-row'><span>Глобальный режим</span></div>";
        document.getElementById("ui-equip").innerHTML = "<div class='equip-slot'>─</div>";
        
        const invDiv = document.getElementById("inventory-list");
        if (invDiv) invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Недоступно</div>";
        
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

    
    function processTurn(dx, dy) {
        const nx = player.x + dx;
        const ny = player.y + dy;

        if (MapModule.isWall(nx, ny)) return;

        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            CombatModule.attack(player, enemy, (m, t) => RenderModule.log(m, t));
            checkDeath();
        
            // Если игрок умер после атаки врага
            if (player.hp <= 0) {
                RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
                renderFrame();
                return;
            }
        } else {
            player.x = nx;
            player.y = ny;

            // Подбор предметов
            const idx = items.findIndex(i => i.x === nx && i.y === ny);
            if (idx !== -1) {
                const item = items[idx];
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
                items.splice(idx, 1);
            }

            // === ОТЛАДКА ЛЕСТНИЦ ===
            console.log("=== ПРОВЕРКА ЛЕСТНИЦ ===");
            console.log("Текущая глубина (currentDepth):", currentDepth);
            console.log("Координаты игрока:", nx, ny);
            console.log("stairsUp:", MapModule.stairsUp);
            console.log("stairsDown:", MapModule.stairsDown);
            
            // Проверка лестницы вниз (спуск на следующий уровень) - ПРОВЕРЯЕМ ПЕРВОЙ
            if (MapModule.stairsDown && nx === MapModule.stairsDown.x && ny === MapModule.stairsDown.y) {
                const nextDepth = currentDepth + 1;
                console.log("🔻 СПУСК! Было:", currentDepth, "станет:", nextDepth);
                RenderModule.log(`Вы спускаетесь на уровень ${nextDepth + 1}...`, "info");
                loadDungeonLevel(dungeonX, dungeonY, nextDepth, currentDungeonTypeName, currentDungeonFullName);
                return;
            }

            // Проверка лестницы вверх (выход на предыдущий уровень или глобальную карту)
            if (MapModule.stairsUp && nx === MapModule.stairsUp.x && ny === MapModule.stairsUp.y) {
                console.log("🔺 ПОДЪЁМ! Текущая глубина:", currentDepth);
                if (currentDepth === 0) {
                    RenderModule.log("Вы поднимаетесь на поверхность...", "info");
                    exitToGlobal();
                } else {
                    const prevDepth = currentDepth - 1;
                    console.log("Подъём на уровень:", prevDepth);
                    RenderModule.log(`Вы поднимаетесь на уровень ${prevDepth + 1}...`, "info");
                    loadDungeonLevel(dungeonX, dungeonY, prevDepth, currentDungeonTypeName, currentDungeonFullName);
                }
                return;
            }
        
            // Движение врагов (только если игрок жив)
            if (player.hp > 0) {
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
                                if (!enemies.some(other => other !== e && other.hp > 0 && other.x === next.x && other.y === next.y)) {
                                    e.x = next.x;
                                    e.y = next.y;
                                }
                            }
                        }
                    }
                });
            }
        }

        if (player.hp <= 0) {
            RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
        }
    
        renderFrame();
    }
    
    function checkDeath() {
        enemies = enemies.filter(e => e.hp > 0);
    }

    function renderFrame() {
        if (!player) return;
        const vis = RenderModule.draw(player, enemies, items);
        vis.forEach(k => explored.add(k));
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawMinimap(player, explored);
    }

    return {
        init
    };
})();

window.onload = () => GameModule.init();
