// =========================== Модуль игры (управление, ходы, загрузка уровней) ===========================
const GameModule = (function() {
    // === Состояние игры ===
    let player = null;
    let enemies = [];
    let items = [];
    let npcs = []; 
    let explored = new Set();
    let busy = false;
    
    // === КВЕСТЫ ===
    let activeQuests = []; 
    let completedQuestIds = new Set(); 

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

    async function init() {
        try {
            if (typeof RenderModule === 'undefined') {
                throw new Error("RenderModule не загружен ");
            }
            await RenderModule.init();
            RenderModule.setRedrawCallback(renderFrame);
        } catch (e) {
            console.error("Критическая ошибка при инициализации: ", e);
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
    }

    // === ОБРАБОТКА КЛИКА/ТАПА ПО КАРТЕ (ОСМОТР И ВЗАИМОДЕЙСТВИЕ) ===
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

        // 1. Враги
        const enemy = enemies.find(en => en.hp > 0 && en.x === wx && en.y === wy);
        if (enemy) {
            const weapon = player.equipment.weapon;
            if (weapon && !weapon.meleeType) {
                const killed = CombatModule.rangedAttack(player, enemy, weapon, RenderModule.log, RenderModule.updateUI);
                if (killed) enemies = enemies.filter(e => e.hp > 0);
                moveNpcs();
                moveEnemies();
                renderFrame();
            } else {
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`⚔️ ${enemy.name}`, `HP: ${enemy.hp}/${enemy.maxHp}\nATK: ${enemy.atk} | DEF: ${enemy.def}`, "enemy");
                }
                RenderModule.log(`Осмотр: ${enemy.name} [HP:${enemy.hp} ATK:${enemy.atk}]`, "info");
            }
            return;
        }

        // 2. NPC (Диалог или Квест)
        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === wx && n.y === wy) : null;
        if (npc) {
            const questGiven = tryGiveQuest(npc);
            if (!questGiven) {
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`☺ ${npc.name}`, `"${npc.dialog}"`, "npc");
                }
                RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            }
            return;
        }

        // 3. Предметы
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

    // === ЛОГИКА ВЫДАЧИ КВЕСТОВ ===
    function tryGiveQuest(npc) {
        if (typeof QuestSystemModule === 'undefined') return false;
        if (!npc.isQuestGiver) return false;

        if (!entrancePos) return false;
        const cityGx = entrancePos.x;
        const cityGy = entrancePos.y;
        
        let npcIndex = 0;
        for(let i=0; i<npc.name.length; i++) npcIndex += npc.name.charCodeAt(i);

        const tempQuest = QuestSystemModule.createQuest(cityGx, cityGy, npcIndex % 5);
        const questId = tempQuest.id;
        
        const alreadyActive = activeQuests.some(q => q.id === questId);
        const alreadyDone = completedQuestIds.has(questId);

        if (!alreadyActive && !alreadyDone) {
            const newQuest = QuestSystemModule.createQuest(cityGx, cityGy, npcIndex % 5);
            newQuest.isActive = true;
            activeQuests.push(newQuest);
            
            RenderModule.log(`📜 НОВЫЙ КВЕСТ от ${npc.name}:`, "event");
            RenderModule.log(newQuest.briefing, "info");
            
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(`📜 Квест принят!`, newQuest.briefing, "npc");
            }
            
            // Сразу обновляем компас, так как мы еще в городе (режим dungeon), 
            // но при выходе он должен показать направление
            return true;
        } else if (alreadyActive) {
             RenderModule.log(`${npc.name}: "Ты еще не выполнил мое поручение!"`, "info");
             return true;
        } else if (alreadyDone) {
             RenderModule.log(`${npc.name}: "Спасибо за помощь, герой. Пока что дел нет."`, "info");
             return true;
        }
        
        return false;
    }

    // === НАГРАДА ЗА КВЕСТ ===
    function grantReward(quest) {
        if (!player) return;
        
        player.gold += quest.rewardGold;
        RenderModule.log(`🏆 Квест выполнен! Получено: ${quest.rewardGold} золотых.`, "loot");
        
        activeQuests = activeQuests.filter(q => q.id !== quest.id);
        completedQuestIds.add(quest.id);
        
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        updateQuestCompass(); // Обновляем компас после завершения
    }

    // === ЛОГИКА КОМПАСА (ПРОСТАЯ СТРЕЛКА) ===
    function getQuestArrow(targetX, targetY, currentX, currentY) {
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        
        if (dx === 0 && dy === 0) return '📍'; 

        let arrow = '';
        if (dy < 0) arrow += '↑'; 
        else if (dy > 0) arrow += '↓';
        
        if (dx > 0) arrow += '→'; 
        else if (dx < 0) arrow += '←';
        
        if (arrow === '↑←') arrow = '↖';
        if (arrow === '↑→') arrow = '↗';
        if (arrow === '↓←') arrow = '↙';
        if (arrow === '↓→') arrow = '↘';
        
        return arrow;
    }

    function updateQuestCompass() {
        const coordsEl = document.getElementById("ui-loc-coords");
        if (!coordsEl) return;

        // Работаем ТОЛЬКО на глобальной карте
        if (gameMode !== 'global') {
            // В подземелье/городе пусть работает старая логика из render.js (Выход: стрелка)
            // Мы просто выходим, чтобы не мешать render.js
            return;
        }

        const activeQuest = activeQuests.find(q => !q.isCompleted);
        
        if (activeQuest && activeQuest.target) {
            const playerPos = GlobalMapModule.getPlayerPosition();
            const arrow = getQuestArrow(activeQuest.target.targetX, activeQuest.target.targetY, playerPos.x, playerPos.y);
            
            // Красим стрелку в зависимости от типа квеста
            let color = "#fff";
            if (activeQuest.type === 'HUNT') color = "#ff5555";
            else if (activeQuest.type === 'FETCH') color = "#ffd700";
            else color = "#58a6ff";

            // ЗАПИСЫВАЕМ НАПРЯМУЮ В ЭЛЕМЕНТ
            coordsEl.innerHTML = `<span style="color:${color}">Квест: ${arrow}</span>`;
        } else {
            // Если квестов нет, показываем обычные координаты
            const playerPos = GlobalMapModule.getPlayerPosition();
            coordsEl.textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
        }
    }

    // === ОБРАБОТКА СЕНСОРНОГО УПРАВЛЕНИЯ ===
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) return;

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

            // Параллельная инспекция
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const clickX = (touch.clientX - rect.left) * scaleX;
            const clickY = (touch.clientY - rect.top) * scaleY;
            
            const cellW = canvas.width / RenderModule.COLS;
            const cellH = canvas.height / RenderModule.ROWS;
            
            const sx = Math.floor(clickX / cellW);
            const sy = Math.floor(clickY / cellH);
            
            const cam = RenderModule.getCameraOffset(player);
            const wx = sx + cam.x;
            const wy = sy + cam.y;

            const enemy = enemies.find(en => en.hp > 0 && en.x === wx && en.y === wy);
            if (enemy) {
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`⚔️ ${enemy.name}`, `HP: ${enemy.hp}/${enemy.maxHp}`, "enemy");
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

            // Проверка квестов типа EXPLORE/FETCH при движении
            if (typeof QuestSystemModule !== 'undefined') {
                activeQuests.forEach(q => {
                    if (QuestSystemModule.checkProgress(q, { type: 'move', x: playerPos.x, y: playerPos.y })) {
                         RenderModule.log(`📍 Квест выполнен: Вы достигли ${q.target.locationName}!`, "event");
                         grantReward(q);
                    }
                });
            }

            updateQuestCompass(); // <--- ВАЖНО: Обновляем стрелку после каждого шага
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
        
        // <--- ВАЖНО: Сразу обновляем компас при выходе
        updateQuestCompass(); 
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

        if (EntityModule.spawnItemsInCity) {
            const interior = MapModule.interiorCoords || [];
            items = EntityModule.spawnItemsInCity(interior, DataModule.ITEM_TYPES, 6, 1.0);
        } else {
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
        window.currentCityNpcs = [];
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
    
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    function spawnDungeonEntities(gx, gy, depth) {
        const enemyCount = 8 + Math.floor(depth * 1.5);
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy) * (1 + depth * 0.2);
        
        let availableEnemies = DataModule.ENEMY_TYPES;
        if (depth < 3) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Гоблин", "Крыса", "Волк", "Слизень"].includes(e.name));
        } else if (depth < 7) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Бандит", "Скелет", "Орк", "Зомби"].includes(e.name));
        }

        enemies = EntityModule.spawnEnemies(
            MapModule.currentMapData,
            player,
            availableEnemies,
            enemyCount,
            enemyMult,
            3
        );
        
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

        const goldTemplate = DataModule.ITEM_TYPES.find(item => item.type === 'gold');
        if (goldTemplate && EntityModule.spawnGold) {
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
            items.push(...goldItems);
        }

        // === СПАВН БОССА (только в подземельях типа 'boss') ===
        // Используем currentDungeonTypeName, так как он уже установлен в loadDungeonLevel
        if (currentDungeonTypeName === 'boss') {
            // Ищем безопасную позицию подальше от игрока и лестниц
            let bossPos = null;
            let attempts = 0;
            while (!bossPos && attempts < 100) {
                const rx = Math.floor(Math.random() * DataModule.MAP_WIDTH);
                const ry = Math.floor(Math.random() * DataModule.MAP_HEIGHT);
                
                // Проверяем, что это пол И что 2x2 область свободна от стен
                if (!MapModule.isWall(rx, ry) && 
                    !MapModule.isWall(rx+1, ry) && 
                    !MapModule.isWall(rx, ry+1) && 
                    !MapModule.isWall(rx+1, ry+1)) {
                    
                    const distToPlayer = Math.abs(rx - player.x) + Math.abs(ry - player.y);
                    if (distToPlayer > 15) { // Подальше от игрока
                        bossPos = { x: rx, y: ry };
                    }
                }
                attempts++;
            }

            if (bossPos) {
                // Проверяем, загружен ли модуль сущностей с функцией createBoss
                if (typeof EntityModule.createBoss === 'function') {
                    const bossNameData = NameGeneratorModule.generateBossName(gx, gy, depth);
                    const bossEntity = EntityModule.createBoss(bossPos.x, bossPos.y, depth, bossNameData);
                    enemies.push(bossEntity);
                    RenderModule.log(`⚠️ Вы чувствуете присутствие: ${bossEntity.name}!`, "combat");
                }
            }
        }
    }  

    function renderGlobalMap() {
        const playerPos = GlobalMapModule.getPlayerPosition();
        RenderModule.drawGlobalMap(playerPos.x, playerPos.y);
        
        // <--- ВАЖНО: Обновляем компас при каждой отрисовке глобальной карты
        updateQuestCompass();
        
        if (player) {
            const globalLocData = {
                fullName: "Глобальная карта",
                description: "Исследуйте мир, находите города и подземелья",
                themeName: "Поверхность"
            };
            RenderModule.updateUI(player, globalLocData, null);
        } else {
            document.getElementById("ui-loc-name").textContent = "Глобальная карта";
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
    
    // Вспомогательная функция для выбора случайного направления
    function getRandomDirection() {
        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
        return dirs[Math.floor(Math.random() * dirs.length)];
    }

    function moveNpcs() {
        if (!window.currentCityNpcs || window.currentCityNpcs.length === 0) return;
        
        const PLAYER_SPEED_THRESHOLD = 10; // Порог действия
        const width = DataModule.MAP_WIDTH;
        const height = DataModule.MAP_HEIGHT;

        window.currentCityNpcs.forEach(npc => {
            // Инициализация скорости и энергии для NPC
            if (npc.speed === undefined) npc.speed = 5; // NPC обычно медленные
            if (npc.energy === undefined) npc.energy = Math.floor(Math.random() * npc.speed);

            npc.energy += npc.speed;

            // Если энергии достаточно, NPC делает ход
            if (npc.energy >= PLAYER_SPEED_THRESHOLD) {
                npc.energy -= PLAYER_SPEED_THRESHOLD;

                if (!npc.direction) {
                    npc.direction = getRandomDirection();
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
            }
        });
    }

    function moveEnemies() {
        const PLAYER_SPEED_THRESHOLD = 10; // Порог действия (базовая скорость игрока)

        enemies.forEach(e => {
            if (e.hp <= 0) return;
            
            // 1. Инициализация скорости и энергии (если их нет у старого врага)
            if (e.speed === undefined) e.speed = 10; 
            if (e.energy === undefined) e.energy = Math.floor(Math.random() * e.speed);

            // 2. Накапливаем энергию каждый ход игрока
            e.energy += e.speed;

            // 3. Проверяем, достаточно ли энергии для совершения действия
            if (e.energy >= PLAYER_SPEED_THRESHOLD) {
                e.energy -= PLAYER_SPEED_THRESHOLD; // Тратим энергию на ход

                const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
                const inSight = dist <= 8; // Радиус обнаружения

                if (e.isBoss) {
                    // === ЛОГИКА БОССА ===
                    let nextX = e.x, nextY = e.y;

                    if (inSight) {
                        // 1. Игрок в поле зрения: Идем к игроку по A*
                        const astar = new ROT.Path.AStar(player.x, player.y, 
                            (x, y) => !MapModule.isWall(x, y), { topology: 8 });
                        
                        let next = null;
                        astar.compute(e.x, e.y, (x, y) => {
                            if (!next && (x !== e.x || y !== e.y)) next = { x, y };
                        });

                        if (next) {
                            // Проверка: не уперся ли в игрока (для атаки)
                            if (next.x === player.x && next.y === player.y) {
                                CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                                checkDeath();
                                return; // Ход сделан
                            }
                            nextX = next.x;
                            nextY = next.y;
                        }
                    } else {
                        // 2. Игрок НЕ в поле зрения: Случайное блуждание
                        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
                        // Перемешиваем направления для естественности
                        dirs.sort(() => Math.random() - 0.5);
                        
                        for (const dir of dirs) {
                            const nx = e.x + dir.dx;
                            const ny = e.y + dir.dy;
                            
                            // Проверка, что ВСЯ область 2x2 нового положения свободна
                            if (!MapModule.isWall(nx, ny) && 
                                !MapModule.isWall(nx+1, ny) && 
                                !MapModule.isWall(nx, ny+1) && 
                                !MapModule.isWall(nx+1, ny+1)) {
                                
                                // Не наступать на игрока при блуждании
                                if ((nx === player.x && ny === player.y) || 
                                    (nx+1 === player.x && ny === player.y) ||
                                    (nx === player.x && ny+1 === player.y) ||
                                    (nx+1 === player.x && ny+1 === player.y)) {
                                    continue;
                                }
                                
                                nextX = nx;
                                nextY = ny;
                                break;
                            }
                        }
                    }

                    // Применяем движение босса
                    if (nextX !== e.x || nextY !== e.y) {
                        e.x = nextX;
                        e.y = nextY;
                    }

                } else {
                    // === СТАНДАРТНАЯ ЛОГИКА ОБЫЧНЫХ ВРАГОВ ===
                    const aggroRange = e.aggroOverride || 8;
                    if (dist < aggroRange) {
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
                }
            }
        });
    }
    
    function checkDeath() {
        const deadEnemies = enemies.filter(e => e.hp <= 0);
        
        deadEnemies.forEach(enemy => {
            CombatModule.dropLoot(enemy, currentDepth, items, RenderModule.log);
   
            // ПРОВЕРКА КВЕСТОВ НА УБИЙСТВО
            if (typeof QuestSystemModule !== 'undefined') {
                activeQuests.forEach(q => {
                    if (QuestSystemModule.checkProgress(q, { type: 'kill', enemyName: enemy.name })) {
                        RenderModule.log(`Квест: Убито ${enemy.name} (${q.progress}/${q.maxProgress})`, "info");
                        if (q.isCompleted) grantReward(q);
                    }
                });
            }
        });

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
        // Проверка столкновения с боссом (учитываем его размер 2x2)
        const bossInWay = enemies.find(e => e.isBoss && e.hp > 0 && (
            (nx === e.x && ny === e.y) || 
            (nx === e.x + 1 && ny === e.y) || 
            (nx === e.x && ny === e.y + 1) || 
            (nx === e.x + 1 && ny === e.y + 1)
        ));
        if (bossInWay) {
            // Если игрок пытается войти в клетку босса, атакуем его
            CombatModule.attack(player, bossInWay, (m, t) => RenderModule.log(m, t));
            checkDeath();
            moveNpcs();
            moveEnemies();
            renderFrame();
            return;
        }

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
            } 
            else if (item.type === 'book') {
                if (typeof LoreModule !== 'undefined') {
                    const fragment = LoreModule.getNextFragment();
                    RenderModule.log(`📖 Вы нашли "${item.name}". Внутри написано:`, "info");
                    RenderModule.log(fragment, "event");
                } else {
                    RenderModule.log(`Вы нашли "${item.name}", но не можете прочитать.`, "info");
                }
            } 
            else {
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
                
                // ПРОВЕРКА КВЕСТОВ НА ПОДБОР ПРЕДМЕТА (FETCH)
                if (typeof QuestSystemModule !== 'undefined') {
                    activeQuests.forEach(q => {
                        if (QuestSystemModule.checkProgress(q, { type: 'pickup', itemType: item.type })) {
                             RenderModule.log(`📦 Это предмет для квеста!`, "info");
                        }
                    });
                }
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
    
    function getPlayer() {
        return player;
    }

    function getActiveQuests() {
        return activeQuests;
    }

    return {
        init,
        getPlayer,
        getActiveQuests
    };
})();

window.onload = async () => {
    await GameModule.init();
};
