
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
    // === ПАМЯТЬ ПОДЗЕМЕЛИЙ ===
    // Хранит количество живых врагов для каждого уровня: "gx_gy_depth" -> count
    let dungeonClearState = new Map(); 
    
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
            
            // Логика дистанционной атаки
            if (weapon && !weapon.meleeType) {
                const killed = CombatModule.rangedAttack(player, enemy, weapon, RenderModule.log, RenderModule.updateUI);
                
                if (killed) {
                    // ВАЖНО: Не фильтруем массив вручную! checkDeath() сделает это сам,
                    // предварительно выдав лут, опыт и проверив квесты.
                    checkDeath(); 
                }
                
                moveNpcs();
                moveEnemies();
                renderFrame();
            } 
            // Логика осмотра (если оружие ближнего боя или его нет)
            else {
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
            if (npc.isQuestGiver) {
                tryGiveQuest(npc);
            } else {
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
             let details = " ";
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

    // Сценарий 0: Квест выполнен, но награда еще не получена (СДАЧА КВЕСТА)
    if (alreadyActive) {
        const q = activeQuests.find(q => q.id === questId);
        if (q.isCompleted && !q.isTurnedIn) {
            player.gold += q.rewardGold;
            q.isTurnedIn = true; 
            
            RenderModule.log(`🏆 Квест сдан! Получено: ${q.rewardGold} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            
            // Очищаем футер, так как квест сдан
            RenderModule.updateQuestBriefing(null); 

            activeQuests = activeQuests.filter(aq => aq.id !== questId);
            completedQuestIds.add(questId);
            updateQuestCompass();
            
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(`📜 Квест сдан!`, `Награда: ${q.rewardGold} золотых.`, "npc");
            }
            return true;
        }
    }


    // Сценарий 1: Новый квест
    if (!alreadyActive && !alreadyDone) {
        const newQuest = QuestSystemModule.createQuest(cityGx, cityGy, npcIndex % 5);
        newQuest.isActive = true;
        newQuest.originX = cityGx;
        newQuest.originY = cityGy;
        activeQuests.push(newQuest);
        
        RenderModule.log(`📜 НОВЫЙ КВЕСТ от ${npc.name}:`, "event");
        RenderModule.log(newQuest.briefing, "info");
        
        // >>> ЗАМЕНИТЬ НА ЭТО <<<
        RenderModule.updateQuestBriefing(newQuest);
        
        if (typeof RenderModule.updateInspector === 'function') {
            RenderModule.updateInspector(`📜 Квест принят!`, newQuest.briefing, "npc");
        }
        return true; 
    }
    // Сценарий 2: Квест активен, но цель еще не достигнута
    else if (alreadyActive) {
         const q = activeQuests.find(q => q.id === questId);
         const statusMsg = `Статус: В процессе (${q.progress}/${q.maxProgress})`;
         
         RenderModule.log(`${npc.name}: "Ты еще не выполнил мое поручение! Ищи ${q.target.locationName}."`, "info");
         
         if (typeof RenderModule.updateInspector === 'function') {
             RenderModule.updateInspector(`📜 ${npc.name}`, statusMsg, "npc");
         }
         return true; 
    } 
    // Сценарий 3: Квест полностью завершен (сдан)
    else if (alreadyDone) {
         RenderModule.log(`${npc.name}: "Спасибо за помощь, герой. Пока что дел нет."`, "info");
         
         if (typeof RenderModule.updateInspector === 'function') {
             RenderModule.updateInspector(`📜 ${npc.name}`, "Задание выполнено. Спасибо!", "npc");
         }
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

    // === ЛОГИКА КОМПАСА (ПРОСТАЯ СТРЕЛКА) ==// === ЛОГИКА КОМПАСА (ПРОСТАЯ СТРЕЛКА) ===
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
        return;
    }

    const playerPos = GlobalMapModule.getPlayerPosition();
    
    // 1. Ищем квест, который выполнен, но награда еще не сдана
    const turnInQuest = activeQuests.find(q => q.isCompleted && !q.isTurnedIn);
    
    // 2. Если таких нет, ищем обычный активный квест
    const activeQuest = !turnInQuest ? activeQuests.find(q => !q.isCompleted) : null;

    let targetX, targetY, color;

    if (turnInQuest) {
        // Цель: Город, где взят квест (используем originX/originY из объекта квеста)
        if (turnInQuest.originX !== undefined && turnInQuest.originY !== undefined) {
            targetX = turnInQuest.originX;
            targetY = turnInQuest.originY;
            color = "#00ff00"; // Зеленый для награды
        } else {
            console.warn("⚠️ Ошибка: Квест на сдачу есть, но originX/originY отсутствуют!");
            // Показываем обычные координаты, чтобы интерфейс не ломался
            coordsEl.textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
            return;
        }
    } else if (activeQuest && activeQuest.target) {
        // Цель: Подземелье или локация квеста
        targetX = activeQuest.target.targetX;
        targetY = activeQuest.target.targetY;
        
        if (activeQuest.type === 'HUNT') color = "#ff5555";
        else if (activeQuest.type === 'FETCH') color = "#ffd700";
        else color = "#58a6ff";
    }

    if (targetX !== undefined && targetY !== undefined) {
        const arrow = getQuestArrow(targetX, targetY, playerPos.x, playerPos.y);
        const label = turnInQuest ? "🏆 Награда" : "📜 Квест";
        
        coordsEl.innerHTML = `<span style="color:${color}">${label}: ${arrow}</span>`;
    } else {
        // Если квестов нет или ошибка данных, показываем координаты
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
                         
                         // >>> ЗАМЕНИТЬ ЭТУ СТРОКУ <<<
                         // grantReward(q); 
                         
                         // >>> НА ЭТИ ДВЕ СТРОКИ <<<
                         q.isTurnedIn = false; // Явно указываем, что награда еще не получена
                         RenderModule.updateQuestBriefing(q);
                        
                         updateQuestCompass(); // Обновляем стрелку на "Награда"
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
        saveCurrentDungeonState();
        gameMode = 'global';
        updateQuestCompass(); 
        renderGlobalMap();
        if (entrancePos) {
            GlobalMapModule.setPlayerPosition(entrancePos.x, entrancePos.y);
            //entrancePos = null;
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
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    function loadDungeonLevel(gx, gy, depth, dungeonType, dungeonName, entryPoint = null) {
        saveCurrentDungeonState();
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

        // >>> ВСТАВЛЕННЫЙ БЛОК: ПРОВЕРКА И СПАВН КВЕСТОВЫХ ПРЕДМЕТОВ <<<
        if (typeof QuestSystemModule !== 'undefined') {
            activeQuests.forEach(q => {
                // 1. Спавн предмета для FETCH
                if (q.isActive && !q.isCompleted && 
                    q.type === 'FETCH' && 
                    q.target.targetX === gx && 
                    q.target.targetY === gy) {
                    
                    spawnQuestItem(q);
                }

                // 2. Проверка прогресса для DIGGER (Глубинный разведчик)
                if (q.isActive && !q.isCompleted && q.type === 'DIGGER') {
                    // Проверяем координаты подземелья и глубину
                    if (q.target.targetX === gx && 
                        q.target.targetY === gy && 
                        depth >= q.target.targetDepth) {
                        
                        // Завершаем квест
                        q.progress = q.maxProgress;
                        q.isCompleted = true;
                        
                        RenderModule.log(`🏆 Квест выполнен: Вы достигли глубины ${depth} в ${dungeonName}!`, "event");
                        RenderModule.updateQuestBriefing(q);
                        updateQuestCompass(); // Переключаем стрелку на "Награда"
                    }
                }
            });
        }
        // >>> КОНЕЦ ВСТАВКИ <<<
    
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
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    function spawnDungeonEntities(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        const savedState = dungeonClearState.get(cacheKey);

        // 1. Количество врагов: база 8 + 1.5 за каждый этаж
        let enemyCount = 8 + Math.floor(depth * 1.5);
        
        // Если уровень уже посещался, ограничиваем спавн сохраненным числом
        if (savedState) {
            // Используем savedState.enemies, так как именно так мы сохраняли значение
            enemyCount = Math.min(enemyCount, savedState.enemies);
            
            // Выводим сообщение только если враги еще остались
            if (savedState.enemies > 0) {
                RenderModule.log(`👣 Вы замечаете следы своей предыдущей битвы. Осталось врагов: ~${savedState.enemies}`, "info");
            } else {
                // Опционально: можно вывести тихое сообщение или вообще ничего
                // RenderModule.log("🕸️ Это место кажется подозрительно тихим... (зачищено)", "info");
            }
        }
        
        // 2. Множитель сложности врагов
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy) * (1 + depth * 0.2);
        
        // 3. Фильтрация врагов по уровню сложности
        let availableEnemies = DataModule.ENEMY_TYPES;
        if (depth < 3) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Гоблин", "Крыса", "Волк", "Слизень"].includes(e.name));
        } else if (depth < 7) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Бандит", "Скелет", "Орк", "Зомби"].includes(e.name));
        }

        // Спавн врагов (если их больше 0)
        if (enemyCount > 0) {
            enemies = EntityModule.spawnEnemies(
                MapModule.currentMapData,
                player,
                availableEnemies,
                enemyCount,
                enemyMult,
                3
            );
        } else {
            enemies = []; // Гарантируем пустой массив для зачищенного уровня
        }
        
        // 4. Спавн предметов и золота (без изменений)
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

        // === СПАВН БОССА ===
        const bossAlreadyDefeated = savedState && savedState.bossDefeated;

        if (currentDungeonTypeName === 'boss' && !bossAlreadyDefeated) {
            let bossPos = null;
            let attempts = 0;
            while (!bossPos && attempts < 100) {
                const rx = Math.floor(Math.random() * DataModule.MAP_WIDTH);
                const ry = Math.floor(Math.random() * DataModule.MAP_HEIGHT);
                
                if (!MapModule.isWall(rx, ry) && 
                    !MapModule.isWall(rx+1, ry) && 
                    !MapModule.isWall(rx, ry+1) && 
                    !MapModule.isWall(rx+1, ry+1)) {
                    
                    const distToPlayer = Math.abs(rx - player.x) + Math.abs(ry - player.y);
                    if (distToPlayer > 15) {
                        bossPos = { x: rx, y: ry };
                    }
                }
                attempts++;
            }

            if (bossPos) {
                if (typeof EntityModule.createBoss === 'function') {
                    const bossNameData = NameGeneratorModule.generateBossName(gx, gy, depth);
                    const bossEntity = EntityModule.createBoss(bossPos.x, bossPos.y, depth, bossNameData);
                    enemies.push(bossEntity);
                    RenderModule.log(`⚠️ Вы чувствуете присутствие: ${bossEntity.name}!`, "combat");
                }
            }
        } else if (bossAlreadyDefeated) {
            // Сообщение о боссе тоже можно скрыть, если оно мешает
            // RenderModule.log("💀 Логово босса пусто. Хозяин повержен навсегда.", "info");
        }
        const totalEnemies = enemies.length;
        console.log(`🕷️ [DEBUG] Уровень ${depth}: Создано врагов: ${totalEnemies}`, enemies.map(e => e.name));
    }
     

    // === ГАРАНТИРОВАННЫЙ СПАВН КВЕСТОВОГО ПРЕДМЕТА ===
    function spawnQuestItem(quest) {
        if (!quest || quest.type !== 'FETCH') return;
        
        // Ищем шаблон предмета в data.js по типу
        const template = DataModule.ITEM_TYPES.find(t => t.type === quest.target.itemType);
        if (!template) return;

        // Создаем уникальный объект предмета
        const questItem = EntityModule.createItem(template, 0, 0, 1.0);
        
        // Делаем его уникальным (добавляем пометку в имя)
        questItem.name = `✨ ${questItem.name} (Квест)`;
        questItem.isQuestItem = true; // Флаг, чтобы случайно не продать/выкинуть (опционально)

        // Ищем безопасное место для спавна (рядом со стартом или лестницей)
        let spawnPos = null;
        
        // Пробуем найти место рядом с лестницей вверх (входом)
        if (MapModule.stairsUp) {
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(MapModule.stairsUp, 5) : null;
        }
        
        // Если не вышло, ищем рядом с игроком
        if (!spawnPos && player) {
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(player, 3) : null;
        }

        // Если совсем беда, берем случайную свободную клетку
        if (!spawnPos) {
            spawnPos = MapModule.getRandomFloor ? MapModule.getRandomFloor(player) : {x: player.x+1, y: player.y};
        }

        if (spawnPos) {
            questItem.x = spawnPos.x;
            questItem.y = spawnPos.y;
            items.push(questItem);
            
            RenderModule.log(`🔮 Вы чувствуете присутствие нужного артефакта где-то рядом...`, "event");
        }
    }

    // === СОХРАНЕНИЕ СОСТОЯНИЯ ПРИ ПОКИДАНИИ УРОВНЯ ===
    function saveCurrentDungeonState() {
        if (gameMode === 'dungeon' && currentDepth >= 0) {
            const cacheKey = `${dungeonX}_${dungeonY}_${currentDepth}`;
            const aliveEnemies = enemies.filter(e => e.hp > 0);
            
            let bossDefeated = false;
            if (currentDungeonTypeName === 'boss') {
                const bossAlive = aliveEnemies.some(e => e.isBoss);
                bossDefeated = !bossAlive;
            }
            
            dungeonClearState.set(cacheKey, {
                enemies: aliveEnemies.length,
                bossDefeated: bossDefeated
            });
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
        // === ЧИТ-КОД: ENTER для восстановления HP ===
        if (e.key === "Enter") {
            e.preventDefault();
            if (player && player.hp > 0) {
                const healAmount = 100;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                RenderModule.log(`💊 ЧИТ: Восстановлено ${healAmount} HP!`, "event");
                RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            }
            return;
        }

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
    function getRandomDirection() {
        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
        return dirs[Math.floor(Math.random() * dirs.length)];
    }

    function moveNpcs() {
        if (!window.currentCityNpcs || window.currentCityNpcs.length === 0) return;
        
        const PLAYER_SPEED_THRESHOLD = 10;
        const width = DataModule.MAP_WIDTH;
        const height = DataModule.MAP_HEIGHT;

        window.currentCityNpcs.forEach(npc => {
            if (npc.speed === undefined) npc.speed = 5;
            if (npc.energy === undefined) npc.energy = Math.floor(Math.random() * npc.speed);

            npc.energy += npc.speed;

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
        const PLAYER_SPEED_THRESHOLD = 10;

        enemies.forEach(e => {
            if (e.hp <= 0) return;
            
            if (e.speed === undefined) e.speed = 10; 
            if (e.energy === undefined) e.energy = Math.floor(Math.random() * e.speed);

            e.energy += e.speed;

            if (e.energy >= PLAYER_SPEED_THRESHOLD) {
                e.energy -= PLAYER_SPEED_THRESHOLD;

                const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
                const inSight = dist <= 8;

                if (e.isBoss) {
                    let nextX = e.x, nextY = e.y;

                    if (inSight) {
                        const astar = new ROT.Path.AStar(player.x, player.y, 
                            (x, y) => !MapModule.isWall(x, y), { topology: 8 });
                        
                        let next = null;
                        astar.compute(e.x, e.y, (x, y) => {
                            if (!next && (x !== e.x || y !== e.y)) next = { x, y };
                        });

                        if (next) {
                            if (next.x === player.x && next.y === player.y) {
                                CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                                checkDeath();
                                return;
                            }
                            nextX = next.x;
                            nextY = next.y;
                        }
                    } else {
                        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
                        dirs.sort(() => Math.random() - 0.5);
                        
                        for (const dir of dirs) {
                            const nx = e.x + dir.dx;
                            const ny = e.y + dir.dy;
                            
                            if (!MapModule.isWall(nx, ny) && 
                                !MapModule.isWall(nx+1, ny) && 
                                !MapModule.isWall(nx, ny+1) && 
                                !MapModule.isWall(nx+1, ny+1)) {
                                
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

                    if (nextX !== e.x || nextY !== e.y) {
                        e.x = nextX;
                        e.y = nextY;
                    }

                } else {
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
    
    // === СИСТЕМА ПРОКАЧКИ ===
    function gainXp(amount) {
        if (!player) return;
        player.xp += amount;
        
        const xpNeeded = player.level * 50;
        
        if (player.xp >= xpNeeded) {
            player.level++;
            player.xp -= xpNeeded;
            
            player.maxHp = WorldCurveModule.getPlayerBaseHP(player.level);
            player.hp = player.maxHp;
            player.atk = WorldCurveModule.getPlayerBaseAtk(player.level);
            player.def = WorldCurveModule.getPlayerBaseDef(player.level);
            
            RenderModule.log(`🎉 УРОВЕНЬ ПОВЫШЕН! Теперь вы ${player.level} уровня!`, "event");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        }
    }

    // === ПРОВЕРКА СМЕРТИ ВРАГОВ (Финальная версия) ===
    // === ПРОВЕРКА СМЕРТИ ВРАГОВ (Финальная версия) ===
    // === ПРОВЕРКА СМЕРТИ ВРАГОВ (Финальная версия) ===
    function checkDeath() {
        const deadEnemies = enemies.filter(e => e.hp <= 0);
        
        deadEnemies.forEach(enemy => {
            // 1. Выпадение лута
            CombatModule.dropLoot(enemy, currentDepth, items, RenderModule.log);
            
            // 2. Начисление опыта
            gainXp(10 + (currentDepth * 5));

            // 3. Проверка квестов
            if (typeof QuestSystemModule !== 'undefined') {
                // Используем копию массива, так как grantReward может изменить activeQuests
                [...activeQuests].forEach(q => {
                    const eventData = {
                        type: 'kill',
                        enemyName: enemy.name,
                        locX: dungeonX,
                        locY: dungeonY
                    };

                    const progressUpdated = QuestSystemModule.checkProgress(q, eventData);

                    // Если квест только что завершился, обновляем данные компаса
                    // (Само сообщение уже выведено внутри quest_system.js)
                    if (progressUpdated && q.isCompleted) {
                        updateQuestCompass(); 
                    }
                });
            }
        });

        // Удаляем мертвых врагов из основного массива
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
            let questHandled = false;
            if (npc.isQuestGiver) {
                questHandled = tryGiveQuest(npc);
            }

            if (!questHandled) {
                RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            }
            
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
                    
                    // === ТРИГГЕР ДЛЯ КВЕСТА SCHOLAR ===
                    if (typeof QuestSystemModule !== 'undefined') {
                        activeQuests.forEach(q => {
                            QuestSystemModule.checkProgress(q, { type: 'read_book' });
                        });
                    }
                } else {
                    RenderModule.log(`Вы нашли "${item.name}", но не можете прочитать.`, "info");
                }
            }  
            else {
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
                
                // ПРОВЕРКА КВЕСТОВ НА ПОДБОР ПРЕДМЕТА (FETCH) - ОБНОВЛЕННАЯ
                // ПРОВЕРКА КВЕСТОВ НА ПОДБОР ПРЕДМЕТА (FETCH и COLLECT)
                if (typeof QuestSystemModule !== 'undefined') {
                    [...activeQuests].forEach(q => {
                        if (q.isCompleted) return; // Пропускаем уже выполненные

                        // === ЛОГИКА ДЛЯ FETCH (Найти 1 предмет) ===
                        if (q.type === 'FETCH') {
                            if (item.type === q.target.itemType) {
                                RenderModule.log(`📦 Это тот самый предмет для квеста!`, "info");
                                
                                q.progress = q.maxProgress;
                                q.isCompleted = true;
                                
                                RenderModule.updateQuestBriefing(q);
                                RenderModule.log(`Теперь нужно вернуться к заказчику за наградой.`, "event");
                                updateQuestCompass();
                            }
                        }
                        
                        // === ЛОГИКА ДЛЯ COLLECT (Собрать N предметов) ===
                        else if (q.type === 'COLLECT') {
                            // Проверяем тип предмета и локацию (если квест привязан к подземелью)
                            const isInLocation = (!q.target.targetX || 
                                                 (dungeonX === q.target.targetX && dungeonY === q.target.targetY));
                            
                            if (item.type === q.target.itemType && isInLocation) {
                                // Используем checkProgress для увеличения счетчика
                                QuestSystemModule.checkProgress(q, { 
                                    type: 'pickup', 
                                    itemType: item.type,
                                    locX: dungeonX,
                                    locY: dungeonY
                                });

                                // Если после подбора квест завершился
                                if (q.isCompleted) {
                                    RenderModule.log(`🏆 Вы собрали все ${q.target.itemName}!`, "event");
                                    RenderModule.updateQuestBriefing(q);
                                    updateQuestCompass();
                                } else {
                                    RenderModule.log(`📦 Подобрано для квеста: ${q.target.itemName} (${q.progress}/${q.maxProgress})`, "info");
                                }
                            }
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


```
# dungeon_generator.js
```js

/**
 * МОДУЛЬ ГЕНЕРАЦИИ ПОДЗЕМЕЛИЙ (dungeon_generator.js)
 */

// Проверка зависимостей
if (typeof SeededRandom === 'undefined' || typeof createSeed === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед dungeon_generator.js");
}

// Определяем типы здесь, чтобы они были доступны и в этом файле, и могли быть экспортированы
const DUNGEON_TYPES = [
    { name: 'dungeon', weight: 30, emoji: '🟫', floorChar: '.', wallChar: '#', floorColor: '#333', wallColor: '#555' }, 
    { name: 'cave', weight: 15, emoji: '🕸️', floorChar: 'o', wallChar: 'O', floorColor: '#2a2a2a', wallColor: '#4a3b3b' },
    { name: 'icy', weight: 20, emoji: '❄️', floorChar: '.', wallChar: '#', floorColor: '#aaddff', wallColor: '#ffffff' },
    { name: 'rogue', weight: 20, emoji: '🌫️', floorChar: '.', wallChar: '#', floorColor: '#781a6f', wallColor: '#995792' },
    { name: 'cellular', weight: 10, emoji: '🧿', floorChar: 'o', wallChar: 'O', floorColor: '#2e7d32', wallColor: '#4caf50' },
    { name: 'arena', weight: 3, emoji: '🦴', floorChar: '.', wallChar: '#', floorColor: '#962e1b', wallColor: '#cf2f13' },
    { name: 'boss', weight: 2, emoji: '👑', floorChar: '.', wallChar: '#', floorColor: '#b71c1c', wallColor: '#880e4f' }
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

// === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: УТОЛЩЕНИЕ СТЕН (FIX DIAGONALS) ===
function thickenWalls(grid, width, height) {
    const changes = []; 
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            if (grid[y][x] === 1) {
                const horizontalGap = (grid[y][x-1] === 0 && grid[y][x+1] === 0);
                const verticalGap = (grid[y-1][x] === 0 && grid[y+1][x] === 0);
                if (horizontalGap || verticalGap) {
                    changes.push({x, y});
                }
            }
        }
    }
    for (const pos of changes) {
        grid[pos.y][pos.x] = 0;
    }
    return grid;
}

// === СТАНДАРТНАЯ ГЕНЕРАЦИЯ (КОМНАТЫ) ===
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
                if (cy1 >= 0 && cy1 < height && x >= 0 && x < width) {
                    grid[cy1][x] = 0;
                    if(cy1+1 < height) grid[cy1+1][x] = 0;
                }
            }
            const stepY = cy1 <= cy2 ? 1 : -1;
            for (let y = cy1; stepY > 0 ? y <= cy2 : y >= cy2; y += stepY) {
                if (y >= 0 && y < height && cx2 >= 0 && cx2 < width) {
                    grid[y][cx2] = 0;
                    if(cx2+1 < width) grid[y][cx2+1] = 0;
                }
            }
        }
    }
    return grid;
}

// === ГЕНЕРАЦИЯ ПЕЩЕР (CAVE) ===
function generateCaveMap(rand, width, height) {
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = 0.45;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                grid[y][x] = 1;
            } else {
                grid[y][x] = rand.next() < fillChance ? 1 : 0;
            }
        }
    }

    for (let i = 0; i < 5; i++) {
        grid = smoothMap(grid, width, height);
    }

    grid = thickenWalls(grid, width, height);
    grid = thickenWalls(grid, width, height);

    const regions = findRegions(grid, width, height);
    regions.sort((a, b) => b.cells.length - a.cells.length);

    if (regions.length < 2 || regions[0].cells.length < (width * height * 0.15)) {
        return generateCaveMap(rand, width, height);
    }

    const mainRegion = regions[0];
    const targets = regions.slice(1, 6); 
    
    for (const target of targets) {
        connectRegions(grid, mainRegion, target, width, height, rand);
    }

    grid = thickenWalls(grid, width, height);

    // Гарантированный поиск старта
    let startX = Math.floor(width / 2);
    let startY = Math.floor(height / 2);
    
    if (grid[startY][startX] === 1) {
        let minDist = Infinity;
        for (const cell of mainRegion.cells) {
            const dist = Math.abs(cell.x - startX) + Math.abs(cell.y - startY);
            if (dist < minDist) {
                minDist = dist;
                startX = cell.x;
                startY = cell.y;
            }
        }
    }

    return { grid, startPos: { x: startX, y: startY } };
}

// === CELLULAR MAP (ИСПРАВЛЕННЫЙ) ===
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
    
    grid = thickenWalls(grid, width, height);
    grid = thickenWalls(grid, width, height);
    
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

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ CAVE ===
function smoothMap(grid, width, height) {
    const newGrid = Array(height).fill().map(() => Array(width).fill(1));
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let wallCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (grid[y + dy][x + dx] === 1) wallCount++;
                }
            }
            if (wallCount > 4) newGrid[y][x] = 1;
            else if (wallCount < 4) newGrid[y][x] = 0;
            else newGrid[y][x] = grid[y][x];
        }
    }
    return newGrid;
}

function findRegions(grid, width, height) {
    const visited = Array(height).fill().map(() => Array(width).fill(false));
    const regions = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] === 0 && !visited[y][x]) {
                const region = { id: regions.length, cells: [] };
                const stack = [{x, y}];
                visited[y][x] = true;
                while (stack.length > 0) {
                    const curr = stack.pop();
                    region.cells.push(curr);
                    const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                    for (const [dx, dy] of dirs) {
                        const nx = curr.x + dx;
                        const ny = curr.y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (grid[ny][nx] === 0 && !visited[ny][nx]) {
                                visited[ny][nx] = true;
                                stack.push({x: nx, y: ny});
                            }
                        }
                    }
                }
                if (region.cells.length > 10) regions.push(region);
            }
        }
    }
    return regions;
}

function connectRegions(grid, regA, regB, width, height, rand) {
    const start = regA.cells[Math.floor(rand.next() * regA.cells.length)];
    const end = regB.cells[Math.floor(rand.next() * regB.cells.length)];
    let currX = start.x;
    let currY = start.y;
    const steps = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    
    for (let i = 0; i < steps * 1.5; i++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ty = currY + dy;
                const tx = currX + dx;
                if (ty > 0 && ty < height - 1 && tx > 0 && tx < width - 1) {
                    grid[ty][tx] = 0;
                }
            }
        }
        const dx = end.x - currX;
        const dy = end.y - currY;
        if (Math.abs(dx) > Math.abs(dy)) {
            currX += Math.sign(dx);
            if (rand.next() < 0.2) currY += (rand.next() < 0.5 ? 1 : -1);
        } else {
            currY += Math.sign(dy);
            if (rand.next() < 0.2) currX += (rand.next() < 0.5 ? 1 : -1);
        }
        currX = Math.max(1, Math.min(width - 2, currX));
        currY = Math.max(1, Math.min(height - 2, currY));
        if (Math.abs(currX - end.x) < 2 && Math.abs(currY - end.y) < 2) break;
    }
}

// === МОДУЛЬ ЭКСПОРТА ===
// === МОДУЛЬ ЭКСПОРТА ===
const DungeonGeneratorModule = {
    generateLevel: function(x, y, depth, width, height) {
        const seedVal = createSeed(x, y, depth);
        const rand = new SeededRandom(seedVal);
        const dungeonType = selectDungeonType(rand);
        
        let mapGrid;
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };

        if (dungeonType.name === 'cave') {
            const caveResult = generateCaveMap(rand, width, height);
            mapGrid = caveResult.grid;
            startPos = caveResult.startPos;
        } else if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
             mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }

        // Финальная проверка старта для всех типов
        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r < Math.max(width,height); r++) {
                for(let dy=-r; dy <=r; dy++) {
                    for(let dx=-r; dx <=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny >=0 && ny <height && nx >=0 && nx <width && mapGrid[ny][nx]===0) {
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
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };

        if (dungeonType.name === 'cave') {
            const caveResult = generateCaveMap(rand, width, height);
            mapGrid = caveResult.grid;
            startPos = caveResult.startPos;
        } else if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
            mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }

        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r < Math.max(width,height); r++) {
                for(let dy=-r; dy <=r; dy++) {
                    for(let dx=-r; dx <=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny >=0 && ny <height && nx >=0 && nx <width && mapGrid[ny][nx]===0) {
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
    
    // ✅ НОВЫЙ МЕТОД - ДОБАВЬТЕ ЭТОТ БЛОК
    getRandomDungeonType: function(rand) {
        return selectDungeonType(rand);
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
            hp: 20, maxHp: 20,
            atk: 2, def: 1,
            level: 1, xp: 0,
            gold: 0,
            inventory: [],
            equipment: { weapon: null, armor: null }
        };
    }

    // В файле entity.js, функция createEnemy

    function createEnemy(template, x, y, difficultyMult) {
        // 1. Расчет базовых средних значений из шаблона
        const baseHp = (template.hp[0] + template.hp[1]) / 2;
        const baseAtk = (template.atk[0] + template.atk[1]) / 2;
        const baseDef = (template.def[0] + template.def[1]) / 2;

        // 2. Применение множителя сложности с разными кривыми роста
        // HP растет пропорционально сложности (линейно)
        const hp = Math.max(1, Math.floor(baseHp * difficultyMult));
        
        // Атака растет медленнее (квадратный корень), чтобы бой длился дольше
        const atk = Math.max(1, Math.floor(baseAtk * Math.sqrt(difficultyMult)));
        
        // Защита растет очень медленно, чтобы игрок всегда мог нанести хотя бы 1 урон
        const def = Math.max(0, Math.floor(baseDef * Math.pow(difficultyMult, 0.3)));

        // 3. Параметры скорости (для системы энергии)
        const speed = template.speed || 10; 
        // Начальная энергия случайна от 0 до speed, чтобы рассинхронизировать толпу врагов
        const startEnergy = Math.floor(Math.random() * speed); 

        return {
            x: x, y: y, name: template.name,
            char: template.char, color: template.color,
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true,
            lootType: template.lootType,
            
            // Новые поля для механики ходов:
            speed: speed,      
            energy: startEnergy 
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
            // === ИЗМЕНЕНИЕ: Если это книга, прилагательное не добавляем ===
            if (template.type !== 'book') {
                const adjTemplate = DataModule.ITEM_ADJECTIVES[Math.floor(Math.random() * DataModule.ITEM_ADJECTIVES.length)];
                const adj = getAdjectiveForm(adjTemplate, template.gender, template.plural);
                name = `${adj} ${template.baseName}`;
            } else {
                // Для книг имя остается как baseName (например, "Старая книга")
                name = template.baseName;
            }

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
    // === СОЗДАНИЕ БОССА ===
    function createBoss(x, y, depth, bossData) {
        // Базовые статы босса сильно масштабируются от глубины
        const hp = Math.floor(150 * (1 + depth * 0.4));
        const atk = Math.floor(15 * (1 + depth * 0.3));
        const def = Math.floor(8 * (1 + depth * 0.3));

        return {
            x: x, y: y,
            name: bossData.fullName,
            char: 'B', // Символ-заглушка, рендерер использует isBoss
            color: '#ff0000',
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true,
            isBoss: true,          // ФЛАГ: это босс
            bossType: bossData.bossType, // Для выбора спрайтов
            lootType: 'boss_loot'
        };
    }
    return {
        createPlayer,
        createEnemy,
        createItem,
        spawnEnemies,
        spawnItems,
        spawnGold,
        spawnItemsInCity,
        createBoss// <--- ДОБАВИТЬ ЭКСПОРТ
    };
})();




```




# ###globalMap.js
```js

/**
 * МОДУЛЬ ГЛОБАЛЬНОЙ КАРТЫ (globalMap.js)
 * Бесконечная карта, разбитая на чанки.
 */

// === ВАЖНО: ОЧИСТКА КЭША ПРИ ПЕРЕЗАГРУЗКЕ СКРИПТА ===
// Это гарантирует, что старые "багованные" чанки не будут использоваться
const chunkCache = new Map(); 

// Конфигурация
const GLOBAL_CONFIG = {
    CHUNK_SIZE: 50,          
    WORLD_SEED: 193460752,       
    CITY_DENSITY: 0.010,      
    DUNGEON_DENSITY: 0.01,   
    ROAD_CONNECT_RADIUS: 40  
};

// Текущая позиция игрока
let playerGlobalX = 0;
let playerGlobalY = 0;

// === Вспомогательные функции ===

function getChunkRandom(cx, cy) {
    const seed = GLOBAL_CONFIG.WORLD_SEED + cx * 1000003 + cy * 1000033;
    return new SeededRandom(seed);
}

// Генерация ландшафта
function generateTerrain(rand, width, height) {
    const tiles = Array(height).fill().map(() => Array(width).fill('plain'));
    
    // 1. Горы
    const mountainCount = rand.int(5, 15);
    for (let i = 0; i < mountainCount; i++) {
        const mx = rand.int(0, width-1);
        const my = rand.int(0, height-1);
        const radius = rand.int(1, 3);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = mx+dx, y = my+dy;
                if (x >= 0 && x < width && y >= 0 && y < height && Math.abs(dx)+Math.abs(dy) <= radius) {
                    // Горы не стирают города, но города еще не созданы, так что это просто земля
                    tiles[y][x] = 'mountain';
                }
            }
        }
    }
    
    // 2. Леса (кластерами)
    const forestClusterCount = rand.int(20, 40); 
    for (let i = 0; i < forestClusterCount; i++) {
        const fx = rand.int(0, width-1);
        const fy = rand.int(0, height-1);
        const radius = rand.int(1, 3); 

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = fx + dx;
                const y = fy + dy;
                
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    // Лес растет только на равнинах (не на горах)
                    if (tiles[y][x] === 'plain') {
                        if (rand.next() < 0.8) {
                            tiles[y][x] = 'forest';
                        }
                    }
                }
            }
        }
    }
     
    // 3. Реки
    const riverCount = rand.int(1, 3);
    for (let r = 0; r < riverCount; r++) {
        let x = rand.int(0, width-1);
        let y = rand.int(0, height-1);
        for (let step = 0; step < 30; step++) {
            if (x >= 0 && x < width && y >= 0 && y < height) {
                // Река НЕ может быть там, где уже есть горы
                if (tiles[y][x] !== 'mountain') {
                    tiles[y][x] = 'water';
                }
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

// Генерация точек интереса (ИСПРАВЛЕННАЯ ВЕРСИЯ)
function generatePOIs(rand, cx, cy, tiles) {
    const pois = [];
    const width = GLOBAL_CONFIG.CHUNK_SIZE;
    const height = GLOBAL_CONFIG.CHUNK_SIZE;
    
    const MIN_POI_DISTANCE = 7; 

    const isTooClose = (localX, localY) => {
        const globalX = cx * width + localX;
        const globalY = cy * height + localY;
        for (const p of pois) {
            const dist = Math.abs(p.x - globalX) + Math.abs(p.y - globalY);
            if (dist < MIN_POI_DISTANCE) return true;
        }
        return false;
    };
    
    // 1. Города
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentTile = tiles[y][x];
            
            // 🛠️ ЖЕСТКАЯ ПРОВЕРКА: Только равнина или лес. Никакой воды, гор или дорог.
            const isValidCityTerrain = (currentTile === 'plain' || currentTile === 'forest');

            if (isValidCityTerrain && rand.next() < GLOBAL_CONFIG.CITY_DENSITY) {
                
                if (isTooClose(x, y)) continue;

                // Ставим город
                tiles[y][x] = 'city';
                const globalX = cx * width + x;
                const globalY = cy * height + y;
                const cityName = NameGeneratorModule.generateCityName(globalX, globalY);
                
                pois.push({ x: globalX, y: globalY, type: 'city', name: cityName });
            }
        }
    }
    
    // 2. Входы в подземелья
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentTile = tiles[y][x];
            
            // 🛠️ ПРОВЕРКА: Равнина, лес или дорога. Не вода, не горы, не город.
            const isValidTerrain = (currentTile === 'plain' || currentTile === 'forest' || currentTile === 'road');
            
            if (isValidTerrain && rand.next() < GLOBAL_CONFIG.DUNGEON_DENSITY) {
                if (currentTile !== 'city') {
                    
                    if (isTooClose(x, y)) continue;

                    tiles[y][x] = 'dungeon_entrance';
                    const globalX = cx * width + x;
                    const globalY = cy * height + y;
                    
                    const dungeonType = DungeonGeneratorModule.getRandomDungeonType(rand).name;
                    const { fullName } = NameGeneratorModule.generateLocationData(globalX, globalY, dungeonType);
                    pois.push({ x: globalX, y: globalY, type: 'dungeon', dungeonType: dungeonType, name: fullName });
                }
            }
        }
    }
    return pois;
}

// Построение дорог
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
                // Дороги не строятся через горы и воду
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
    // 1. Сначала ландшафт (горы, леса, реки)
    const tiles = generateTerrain(rand, GLOBAL_CONFIG.CHUNK_SIZE, GLOBAL_CONFIG.CHUNK_SIZE);
    // 2. Потом POI (города, подземелья) - они видят готовый ландшафт
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
    
    // Если чанка нет в кэше, генерируем новый
    if (!chunkCache.has(key)) {
        chunkCache.set(key, generateChunk(cx, cy));
    }
    return chunkCache.get(key);
}

// === НОВАЯ ФУНКЦИЯ: поиск безопасной стартовой позиции ===
function findSafeStartPosition(startX, startY, radius = 3) {
    for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const testX = startX + dx;
                const testY = startY + dy;
                
                if (GlobalMapModule.isWalkable(testX, testY)) {
                    let obstacleCount = 0;
                    for (let ny = -1; ny <= 1; ny++) {
                        for (let nx = -1; nx <= 1; nx++) {
                            if (!GlobalMapModule.isWalkable(testX + nx, testY + ny)) {
                                obstacleCount++;
                            }
                        }
                    }
                    if (obstacleCount <= 4) {
                        return { x: testX, y: testY };
                    }
                }
            }
        }
    }
    return { x: startX, y: startY };
}

// === Публичный API ===

const GlobalMapModule = {
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

    getDisplayTileType(globalX, globalY) {
        const poi = this.getPOI(globalX, globalY);
        if (poi) {
            return poi.type === 'city' ? 'city' : 'dungeon_entrance';
        }
        return this.getTileType(globalX, globalY);
    },
    
    isWalkable(globalX, globalY) {
        const type = this.getTileType(globalX, globalY);
        return type !== 'mountain' && type !== 'water';
    },

    getPOI(globalX, globalY) {
        const chunk = getChunkForCell(globalX, globalY);
        if (!chunk || !chunk.pois) return null;
        return chunk.pois.find(p => p.x === globalX && p.y === globalY);
    },
    
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
    
    getPlayerPosition() {
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    setPlayerPosition(x, y) {
        playerGlobalX = x;
        playerGlobalY = y;
    },
    
    initSafeStart(startX, startY, radius = 3) {
        const safePos = findSafeStartPosition(startX, startY, radius);
        playerGlobalX = safePos.x;
        playerGlobalY = safePos.y;
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    getChunkSize() { 
        return GLOBAL_CONFIG.CHUNK_SIZE; 
    },
    
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

    // Вспомогательная функция поиска случайной клетки пола (для спавна врагов/предметов)
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

    // === НОВАЯ ФУНКЦИЯ: Поиск безопасного места РЯДОМ с точкой ===
    function getSafePosNearby(targetPos, maxRadius = 5) {
        if (!targetPos) return { x: 2, y: 2 };
        
        // 1. Проверяем саму точку
        if (currentMapData[targetPos.y] && currentMapData[targetPos.y][targetPos.x] === 0) {
            return targetPos;
        }

        // 2. Ищем по спирали вокруг точки в заданном радиусе
        for (let r = 1; r <= maxRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    // Пропускаем углы квадрата, чтобы сохранить форму круга/ромба (опционально)
                    // if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; 
                    
                    const nx = targetPos.x + dx;
                    const ny = targetPos.y + dy;
                    
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) {
                            return { x: nx, y: ny };
                        }
                    }
                }
            }
        }
        
        // 3. Если совсем рядом нет места (редкий случай в пещерах), ищем глобально
        console.warn("⚠️ Не удалось найти место рядом с целью, ищу глобально...");
        return getSafePosGlobal(targetPos);
    }

    // Старая функция глобального поиска (как запасной вариант)
    function getSafePosGlobal(pos) {
        if (!pos) return { x: 2, y: 2 };
        if (currentMapData[pos.y] && currentMapData[pos.y][pos.x] === 0) return pos;
        
        for (let r = 1; r < 20; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = pos.x + dx, ny = pos.y + dy;
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) return { x: nx, y: ny };
                    }
                }
            }
        }
        return pos;
    }

    // Генерация или восстановление лестниц для уровня
    function generateStaircase(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        let cached = stairsCache.get(cacheKey);

        if (cached) {
            const upValid = cached.stairsUp && currentMapData[cached.stairsUp.y]?.[cached.stairsUp.x] === 0;
            const downValid = cached.stairsDown && currentMapData[cached.stairsDown.y]?.[cached.stairsDown.x] === 0;

            if (upValid && (currentDungeonType.name === 'city' || downValid)) {
                stairsUp = cached.stairsUp;
                stairsDown = cached.stairsDown;
                return;
            }
            stairsCache.delete(cacheKey);
        }

        // 1. Определяем stairsUp
        if (depth > 0) {
            const prevKey = `${gx}_${gy}_${depth - 1}`;
            const prevCached = stairsCache.get(prevKey); 
            if (prevCached?.stairsDown) {
                stairsUp = prevCached.stairsDown;
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

        stairsCache.set(cacheKey, { stairsUp, stairsDown });
    }

    // Основная функция генерации уровня (в map.js)
    function generateLevel(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        
        generateStaircase(gx, gy, depth);
        
        let startPos;
        
        // ЛОГИКА ВЫБОРА СТАРТОВОЙ ПОЗИЦИИ
        if (entryPoint === 'down') {
            startPos = getSafePosNearby(stairsUp, 5);
        } else if (entryPoint === 'up') {
            startPos = getSafePosNearby(stairsDown, 5);
        } else {
            const genStart = result.startPos;
            if (genStart && currentMapData[genStart.y]?.[genStart.x] === 0) {
                 startPos = getSafePosNearby(stairsUp, 5);
            } else {
                 startPos = getSafePosNearby(stairsUp, 5);
            }
        }

        // ==========================================================
        // 🛠️ НОВОЕ: ГАРАНТИЯ СВЯЗНОСТИ (FIX ЗАМКНУТЫХ ПОЛОСТЕЙ)
        // ==========================================================
        if (stairsDown && startPos) {
            // Проверяем, существует ли путь от старта до лестницы вниз
            const astar = new ROT.Path.AStar(stairsDown.x, stairsDown.y,
                (x, y) => !isWall(x, y), { topology: 8 });
            
            let isReachable = false;
            astar.compute(startPos.x, startPos.y, (x, y) => {
                if (x === stairsDown.x && y === stairsDown.y) {
                    isReachable = true;
                }
            });

            // Если путь не найден (изолированная полость), принудительно прокладываем коридор
            if (!isReachable) {
                console.warn(`⚠️ [MapModule] Обнаружена изолированная полость на уровне ${depth}! Прокладываем аварийный коридор.`);
                let cx = startPos.x;
                let cy = startPos.y;
                
                // Двигаемся по оси X
                while (cx !== stairsDown.x) {
                    cx += (cx < stairsDown.x) ? 1 : -1;
                    if (cy >= 0 && cy < currentMapData.length && cx >= 0 && cx < currentMapData[0].length) {
                        currentMapData[cy][cx] = 0;
                        // Делаем коридор чуть шире (2x2) для надежности и эстетики
                        if (cy + 1 < currentMapData.length) currentMapData[cy + 1][cx] = 0;
                        if (cx + 1 < currentMapData[0].length) currentMapData[cy][cx + 1] = 0;
                        if (cy + 1 < currentMapData.length && cx + 1 < currentMapData[0].length) currentMapData[cy + 1][cx + 1] = 0;
                    }
                }
                // Двигаемся по оси Y
                while (cy !== stairsDown.y) {
                    cy += (cy < stairsDown.y) ? 1 : -1;
                    if (cy >= 0 && cy < currentMapData.length && cx >= 0 && cx < currentMapData[0].length) {
                        currentMapData[cy][cx] = 0;
                        if (cy + 1 < currentMapData.length) currentMapData[cy + 1][cx] = 0;
                        if (cx + 1 < currentMapData[0].length) currentMapData[cy][cx + 1] = 0;
                        if (cy + 1 < currentMapData.length && cx + 1 < currentMapData[0].length) currentMapData[cy + 1][cx + 1] = 0;
                    }
                }
            }
        }
        // ==========================================================
        
        return startPos;
    }

    function generate(gx, gy, depth) {
        return generateLevel(gx, gy, depth, null);
    }

    function generateWithType(gx, gy, depth, dungeonType, entryPoint = null) {
        return generateLevel(gx, gy, depth, dungeonType, entryPoint);
    } 

    // === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА ===
    let currentMapInteriorCoords = [];

    function generateCityLayout(rand, width, height, density = 0.7) {
        const grid = Array(height).fill().map(() => Array(width).fill(1));
        const interiorCoords = []; 

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                grid[y][x] = 0;
            }
        }

        const STREET_W = 2;
        let y = 2; 

        while (y < height - 6) {
            const bh = rand.int(4, 8); 
            if (y + bh > height) break;

            let x = 2; 
            while (x < width - 6) {
                const bw = rand.int(5, 9); 
                if (rand.next() > density) {
                    x += bw + STREET_W;
                    continue;
                }
                if (x + bw + STREET_W >= width - 1) break;

                for (let dy = 0; dy < bh; dy++) {
                    for (let dx = 0; dx < bw; dx++) {
                        const isPerimeter = (dy === 0 || dy === bh - 1 || dx === 0 || dx === bw - 1);
                        const val = isPerimeter ? 1 : 0;
                        grid[y + dy][x + dx] = val;
                        if (val === 0) {
                            interiorCoords.push({ x: x + dx, y: y + dy });
                        }
                    }
                }

                const side = rand.int(0, 3); 
                let doorX = 0, doorY = 0;
                if (side === 0) { doorX = x + rand.int(1, bw - 2); doorY = y; }
                else if (side === 1) { doorX = x + bw - 1; doorY = y + rand.int(1, bh - 2); }
                else if (side === 2) { doorX = x + rand.int(1, bw - 2); doorY = y + bh - 1; }
                else { doorX = x; doorY = y + rand.int(1, bh - 2); }
                
                grid[doorY][doorX] = 0; 
                x += bw + STREET_W;
            }
            y += bh + STREET_W;
        }
        
        return { grid, interiorCoords };
    }

    function generateCity(gx, gy, depth) {
        const seedVal = createSeed(gx, gy, depth);
        const rand = new SeededRandom(seedVal);
        const density = rand.next() * 0.3 + 0.3; 
        
        const layoutResult = generateCityLayout(rand, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, density);
        
        currentMapData = layoutResult.grid;
        currentMapInteriorCoords = layoutResult.interiorCoords || [];
        
        currentDungeonType = { 
            name: 'city',
            wallChar: getChar('WALL_CITY'),
            floorChar: getChar('FLOOR_CITY'),
            wallColor: '#6b7280', 
            floorColor: '#374151' 
        };
    
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
        currentMapInteriorCoords = [];
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

    function debugCache() {
        console.log("=== Текущий кеш лестниц ===");
        for (let [key, value] of stairsCache.entries()) {
            console.log(`${key}: up=(${value.stairsUp?.x},${value.stairsUp?.y}), down=(${value.stairsDown?.x},${value.stairsDown?.y})`);
        }
    }

    return {
        get currentMapData() { return currentMapData; },
        get currentDungeonType() { return currentDungeonType; },
        get stairsUp() { return stairsUp; },
        get stairsDown() { return stairsDown; },
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
        cave: ['Пещеры', 'Темные пещеры', 'Глубинные пещеры', 'Зловещие пещеры', 'Сталагмитовые пещеры', 'Угольные пещеры', 'Доисторические пещеры', 'Зловонные пещеры', 'Заброшенные шахты', 'Кварцевые пещеры'],
        icy: ['Ледяные лабиринты', 'Хрустальные коридоры', 'Ледяные тоннели', 'Морозные лабиринты', 'Снежные коридоры', 'Ледяные катакомбы', 'Хрустальные лабиринты', 'Морозные тоннели', 'Ледяные залы', 'Снежные лабиринты'],
        rogue: ['Заброшенные руины', 'Древние руины', 'Разрушенные залы', 'Покинутые руины', 'Обвалившиеся руины', 'Заросшие руины', 'Разрушенные храмы', 'Забытые дворцы', 'Обрушившиеся арки', 'Разрушенные крепости'],
        cellular: ['Органические пещеры', 'Живые пещеры', 'Пульсирующие полости', 'Биологические пещеры', 'Грибные пещеры', 'Корневые полости', 'Слизевые пещеры', 'Грибковые полости', 'Органические тоннели', 'Живые лабиринты'],
        arena: ['Арены', 'Кровавые арены', 'Боевые арены', 'Смертельные арены', 'Гладиаторские арены', 'Круговые арены', 'Подземные арены', 'Кровавые колизеи', 'Боевые круги', 'Арены смерти'],
        boss: ['Логова', 'Тронные залы', 'Святилища', 'Цитадели', 'Крепости', 'Дворцы', 'Храмы', 'Священные соборы', 'Тронные палаты', 'Святилища владык']
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
     * @param {Array} mapGrid  - двумерный массив карты города (0 - пол, 1 - стена)
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
            
            // Проверки валидности позиции
            if (mapGrid[y][x] !== 0) continue; // Не стена
            if (Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y) < 3) continue; // Не рядом со входом
            if (npcs.some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)) continue; // Не слишком близко к другим NPC

            npcs.push({
                x, y,
                name: rng.choice(NPC_DATA.titles),
                char: "☺", 
                color: "#58a6ff",
                dialog: rng.choice(NPC_DATA.phrases),
                isNPC: true,
                direction: directions[rng.int(0, 3)] 
            });
        }

        // === ЛОГИКА КВЕСТОДАТЕЛЯ ===
        if (npcs.length > 0) {
            // Делаем первого NPC квестодателем
            const giver = npcs[0];
            giver.isQuestGiver = true;
            giver.color = "#FFD700"; // Золотой цвет для выделения
            giver.name = "Капитан стражи"; // Уникальное имя
            giver.dialog = "Город нуждается в твоей помощи.";
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
    const COLS = 30;
    const ROWS = 20;
    const FONT_SIZE = 16; 
    const TILE_SIZE = 32; 

    // === СИСТЕМА ЭФФЕКТОВ ===
    let activeEffects = []; 
    let currentCameraOffset = { x: 0, y: 0 };
    let redrawCallback = null;

    // === АСИНХРОННАЯ ИНИЦИАЛИЗАЦИЯ ===
    async function init() {
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

        console.log("🔄 Загрузка тайлсетов...");
        
        // 1. Ждем загрузки TilesetRenderer (подземелье)
        if (typeof TilesetRenderer !== 'undefined') {
            await TilesetRenderer.init();
            console.log("✅ TilesetRenderer готов!");
        } else {
            console.warn("TilesetRenderer не найден.");
        }

        // Запуск цикла очистки старых эффектов (если есть модуль эффектов)
        if (typeof startEffectLoop === 'function') startEffectLoop();
        
        console.log("🚀 RenderModule полностью инициализирован.");
    }
    // === ОБНОВЛЕНИЕ ТЕКУЩЕГО КВЕСТА В ФУТЕРЕ ===
    function updateQuestBriefing(quest) {
        const el = document.getElementById("ui-quest-briefing");
        if (!el) return;

        if (!quest) {
            el.textContent = "";
            return;
        }

        let statusIcon = "📜";
        if (quest.isCompleted && !quest.isTurnedIn) statusIcon = "🏆";
        
        // Формируем краткое описание цели
        let goalText = "";
        if (quest.type === 'FETCH') goalText = `Найти: ${quest.target.itemName}`;
        else if (quest.type === 'HUNT') goalText = `Убить: ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`;
        else if (quest.type === 'EXPLORE') goalText = `Исследовать: ${quest.target.locationName}`;

        el.innerHTML = `<span style="color:${statusIcon === '🏆' ? '#00ff00' : 'var(--gold)'}">${statusIcon} ${goalText}</span>`;
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

    function getCameraOffset(player) {
        const cam = {
            x: player.x - Math.floor(COLS / 2),
            y: player.y - Math.floor(ROWS / 2)
        };
        currentCameraOffset = cam;
        return cam;
    }
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ОТРИСОВКА БОССА 2x2 ===
    function drawBoss(ctx, bossType, sx, sy, color) {
        let prefix = 'BOSS_DRAGON'; 
        if (bossType.includes('Голем')) prefix = 'BOSS_GOLEM';
        else if (bossType.includes('Лич')) prefix = 'BOSS_LICH';
        else if (bossType.includes('Паук')) prefix = 'BOSS_DRAGON'; // Заглушка, добавьте свои ключи

        const parts = [
            { key: `${prefix}_TL`, dx: 0, dy: 0 },
            { key: `${prefix}_TR`, dx: 1, dy: 0 },
            { key: `${prefix}_BL`, dx: 0, dy: 1 },
            { key: `${prefix}_BR`, dx: 1, dy: 1 }
        ];

        parts.forEach(part => {
            const drawX = sx + part.dx;
            const drawY = sy + part.dy;
            if (drawX >= 0 && drawX < COLS && drawY >= 0 && drawY < ROWS) {
                // Вызываем новый метод, который мы добавили в TilesetRenderer
                if (typeof TilesetRenderer.drawByKey === 'function') {
                    TilesetRenderer.drawByKey(ctx, part.key, drawX, drawY, color);
                }
            }
        });
    }
    // === ОТРИСОВКА ПОДЗЕМЕЛЬЯ (Использует TilesetRenderer) ===
    function draw(player, enemies, items, npcs = []) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Проверка готовности рендерера
        if (typeof TilesetRenderer === 'undefined' || !TilesetRenderer.isReady()) {
            ctx.fillStyle = '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Loading...", ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

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
                TilesetRenderer.draw(ctx, ch, sx, sy, fg);
            }
        }

        // 2. ПРЕДМЕТЫ
        if (items) {
            items.forEach(i => {
                const sx = i.x - cam.x, sy = i.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                    TilesetRenderer.draw(ctx, i.char, sx, sy, i.color);
                }
            });
        }

        // 3. ВРАГИ (включая боссов 2x2)
        if (enemies) {
            enemies.forEach(e => {
                if (e.hp > 0) {
                    const sx = e.x - cam.x, sy = e.y - cam.y;
                    
                    // Проверяем видимость хотя бы одной части босса
                    const isVisible = visible.has(`${e.x},${e.y}`);
                    
                    if (sx >= -2 && sx < COLS && sy >= -2 && sy < ROWS && isVisible) {
                        if (e.isBoss) {
                            // === ОТРИСОВКА БОССА 2x2 ИЗ 4 ЧАСТЕЙ ===
                            // Определяем префикс ключей в зависимости от типа босса
                            let prefix = 'BOSS_DRAGON'; 
                            if (e.bossType.includes('Голем')) prefix = 'BOSS_GOLEM';
                            else if (e.bossType.includes('Лич')) prefix = 'BOSS_LICH';
                            
                            // Рисуем 4 тайла: TL (Top-Left), TR, BL, BR
                            TilesetRenderer.drawByKey(ctx, `${prefix}_TL`, sx, sy, e.color);       // Верх-Лево
                            TilesetRenderer.drawByKey(ctx, `${prefix}_TR`, sx + 1, sy, e.color);   // Верх-Право
                            TilesetRenderer.drawByKey(ctx, `${prefix}_BL`, sx, sy + 1, e.color);   // Низ-Лево
                            TilesetRenderer.drawByKey(ctx, `${prefix}_BR`, sx + 1, sy + 1, e.color); // Низ-Право
                        } else {
                            // Обычный враг
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
                    TilesetRenderer.draw(ctx, npc.char, sx, sy, npc.color);
                }
            });
        }

        // 5. ИГРОК
        if (player) {
            const px = Math.floor(COLS / 2);
            const py = Math.floor(ROWS / 2);
            TilesetRenderer.draw(ctx, player.char, px, py, player.color);
        }

        // 6. ЭФФЕКТЫ
        drawEffects(ctx, cam);

        return visible;
    }

    // === ОТРИСОВКА ГЛОБАЛЬНОЙ КАРТЫ (Использует TilesetRenderer) ===
    function drawGlobalMap(centerX, centerY) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Проверка готовности
        if (typeof TilesetRenderer === 'undefined' || !TilesetRenderer.isReady()) {
            ctx.fillStyle = '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Loading World...", ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

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

                let ch, fg;
                switch(tileType) {
                    case 'plain': ch = '░'; fg = '#2e8b57'; break;
                    case 'forest': ch = 'T'; fg = '#336649'; break;
                    case 'mountain': ch = '^'; fg = '#a0a0a0'; break;
                    case 'water': ch = '≈'; fg = '#4682b4'; break;
                    case 'city': ch = 'C'; fg = '#ffd700'; break;
                    case 'dungeon_entrance': ch = 'D'; fg = '#cd5c5c'; break;
                    case 'road': ch = '─'; fg = '#b8860b'; break;
                    default: ch = '·'; fg = '#555';
                }

                // Игрок
                if (gx === centerX && gy === centerY) {
                    ch = '@'; fg = '#fff';
                }

                // Используем TilesetRenderer для глобальной карты
                TilesetRenderer.draw(ctx, ch, sx, sy, fg);
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
        
        const MINIMAP_SIZE = 50; 
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
                
                if (gx === centerX && gy === centerY) color = '#0f0'; // Игрок
                
                ctx.fillStyle = color;
                ctx.fillRect(dx * cellW, dy * cellH, cellW + 0.5, cellH + 0.5);
            }
        }
    }

    // === ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (UI) ===
    function updateUI(player, locData, worldTrend) {
        if (locData) {
            document.getElementById("ui-loc-name").textContent = locData.fullName;
            
            if (worldTrend && worldTrend.name !== "Обычный уровень") {
                document.getElementById("ui-loc-name").style.color = worldTrend.color;
            } else {
                document.getElementById("ui-loc-name").style.color = "var(--accent)";
            }
        }

        // === ЛОГИКА КОМПАСА / ВЫХОДА ===
        const exitEl = document.getElementById("ui-loc-coords");
        if (exitEl) {
            // Проверяем, находимся ли мы в подземелье (не на поверхности)
            const isDungeon = locData && locData.themeName !== "Поверхность";
            
            if (isDungeon && MapModule.stairsUp) {
                // МЫ В ПОДЗЕМЕЛЬЕ: Показываем стрелку к выходу (стандартная логика)
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
            // ЕСЛИ МЫ НА ПОВЕРХНОСТИ (ГЛОБАЛЬНАЯ КАРТА):
            // Мы НИЧЕГО не пишем сюда. 
            // Элемент остается как есть, а GameModule.updateQuestCompass() заполнит его стрелкой квеста или координатами.
        }
        
        // === СТАТИСТИКА И ИНВЕНТАРЬ ===
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
        updateQuestBriefing,
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
    
    <!-- ... ваши скрипты ... -->
    <script src="rot.min.js"></script>
    <script src="seedrandom.min.js"></script>
    <script src="sprite_registry.js"></script>
    <script src="name_generator.js"></script>
    <script src="worldCurve.js"></script>
    <script src="dungeon_generator.js"></script>
    <script src="data.js"></script>
    <script src="map.js"></script>
    <script src="entity.js"></script>
    <script src="combat.js"></script>
    <script src="globalMap.js"></script>
    <script src="tileset_renderer.js"></script> 
    <script src="render.js"></script>
    <script src="npc_generator.js"></script>
    <script src="effect_system.js"></script>
    <script src="lore.js"></script>
    <script src="quest_system.js"></script>
    <script src="game.js"></script>

    <style>
        /* ... ваши стили ... */
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
            grid-template-rows: 100px 1fr 140px; /* Вернул стандартную высоту */
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
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 5px 15px; 
        }
        .loc-info { 
            text-align: center; 
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }
        .loc-name { 
            color: var(--accent); 
            font-weight: bold; 
            font-size: 1.1em; 
            line-height: 1.2;
        }
        .loc-coords { 
            color: var(--text-dim); 
            font-size: 0.9em; 
            min-height: 1.2em; /* Чтобы текст не прыгал */
        }
        
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
        .log-lore { 
            color: #d2b48c;
            font-style: italic;
            border-left: 3px solid #8b7355;
            padding-left: 8px;
            background: rgba(139, 115, 85, 0.1);
            margin-top: 4px;
            margin-bottom: 4px;
            font-family: 'Georgia', serif;
            font-size: 12px;
            line-height: 1.4;
        }
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
            <!-- ОДИН ЭЛЕМЕНТ ДЛЯ ВСЕГО -->
            <div id="ui-loc-coords" class="loc-coords">Выход: —</div>
        </div>
    </header>

    <div class="panel" style="grid-row: 2;">
        <h3>Персонаж</h3>
        <div id="ui-stats"></div>
        <h3 style="margin-top: 15px;">Экипировка</h3>
        <div id="ui-equip"></div>
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

    <!-- В index.html -->
    <footer class="panel" style="grid-column: 2 / 4; grid-row: 3; display: flex; align-items: center; justify-content: center; text-align: center;">
        <div id="ui-quest-briefing" style="color: var(--gold); font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
            <!-- Сюда будет выводиться суть квеста -->
        </div>
    </footer>
</div>

</body>
</html>
```


# ###combat.js
```js

// =========================== Модуль боя и использования предметов ===========================
// =========================== Модуль боя и использования предметов ===========================
const CombatModule = (function() {
    
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ПРОВЕРКА ЛИНИИ ВИДИМОСТИ (LOS) ===
    // Проверяет, есть ли прямая видимость между (x1,y1) и (x2,y2) без стен
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ПРОВЕРКА ЛИНИИ ВИДИМОСТИ (LOS) ===
    // Проверяет, есть ли прямая видимость между (x1,y1) и (x2,y2) без стен
    function hasLineOfSight(x1, y1, x2, y2) {
        // Если точка совпадает с целью - видим
        if (x1 === x2 && y1 === y2) return true;

        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = (x1 < x2) ? 1 : -1;
        const sy = (y1 < y2) ? 1 : -1;
        let err = dx - dy;

        let cx = x1;
        let cy = y1;

        while (true) {
            // Если дошли до цели - путь чист
            if (cx === x2 && cy === y2) return true;

            // Если наткнулись на стену - путь заблокирован
            if (MapModule.isWall(cx, cy)) return false;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }
            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
    }

    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ АНИМАЦИИ УДАРА ===
    function triggerHitAnimation() {
        let frames = 0;
        const maxFrames = 5; 
        
        const interval = setInterval(() => {
            frames++;
            RenderModule.requestRedraw(); 
            
            if (frames >= maxFrames) {
                clearInterval(interval);
                RenderModule.requestRedraw(); 
            }
        }, 40); 
    }

    // === АТАКА БЛИЖНЕГО БОЯ ===
    function attack(attacker, defender, logFn) { 
        let dmg = Math.max(1, attacker.atk - defender.def);
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        defender.hp -= dmg;
        
        defender.flashEndTime = Date.now() + 200; 
        defender.flashChar = "*"; 
        
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

    // === ДИСТАНЦИОННАЯ АТАКА (ОБНОВЛЕННАЯ) ===
    function rangedAttack(player, target, weapon, logFn, updateUiFn) {
        // 1. Проверка наличия оружия и типа
        if (!weapon || weapon.meleeType !== false) return false;
        
        // 2. Проверка боеприпасов
        if (weapon.currentAmmo <= 0) {
            logFn(`Нет боеприпасов для ${weapon.name}!`, "combat");
            return false;
        }

        // 3. Расчет дистанции
        const dist = Math.abs(player.x - target.x) + Math.abs(player.y - target.y);

        // 4. ЛОГИКА "В УПОР" (Требование 1)
        // Если враг вплотную (дистанция 1), стрелять нельзя/неэффективно. 
        // Игрок атакует базовой силой (как кулаками или рукояткой), бонус оружия не применяется.
        if (dist === 1) {
            logFn(`${target.name} слишком близко! Вы бьете прикладом.`, "combat");
            // Вызываем обычную атаку с базовыми статами игрока (без бонуса оружия)
            // Для этого временно убираем бонус оружия, если он экипирован
            const savedAtk = player.atk;
            if (player.equipment.weapon === weapon) {
                player.atk -= weapon.val; // Убираем бонус оружия
            }
            
            const killed = attack(player, target, logFn);
            
            // Возвращаем бонус
            if (player.equipment.weapon === weapon) {
                player.atk = savedAtk;
            }
            
            if (updateUiFn) updateUiFn();
            return killed;
        }

        // 5. Проверка максимальной дальности (Требование 2: теперь проверяется против нового range из data.js)
        if (dist > weapon.range) {
            logFn(`${target.name} слишком далеко для ${weapon.name} (макс. ${weapon.range})!`, "combat");
            return false;
        }

        // 6. Проверка препятствий (Требование 3)
        if (!hasLineOfSight(player.x, player.y, target.x, target.y)) {
            logFn(`Препятствие мешает выстрелу в ${target.name}!`, "combat");
            return false;
        }

        // --- ЕСЛИ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: СТРЕЛЬБА ---
        
        weapon.currentAmmo--;
        
        // Расчет урона: База игрока + Сила оружия - Защита врага
        // Важно: здесь мы используем полный ATK игрока, который уже включает weapon.val
        let dmg = Math.max(1, player.atk - target.def); 
        
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        target.hp -= dmg;
        
        // Эффекты
        target.flashEndTime = Date.now() + 200;
        target.flashChar = "*";
        triggerHitAnimation();

        logFn(`Вы стреляете в ${target.name} из ${weapon.name} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (updateUiFn) updateUiFn();

        // 7. АГРО (Требование 2)
        // При попадании враг "видит" игрока независимо от расстояния.
        // В текущей архитектуре moveEnemies проверяет dist < 8. 
        // Чтобы враг побежал за игроком после выстрела с 15 клеток, нам нужно 
        // либо увеличить глобальный радиус агро, либо пометить врага как "разбуженного".
        // Самый простой способ без переписывания AI - временно увеличить его радиус восприятия
        // или просто надеяться, что игрок подойдет ближе, пока враг идет.
        // Но чтобы выполнить требование "начинает двигаться", добавим флаг или просто увеличим радиус в game.js.
        // Пока оставим логику здесь, но учтем, что в game.js радиус жестко задан.
        // *Хак*: Можно добавить свойство target.aggroRange = 20, и проверить его в moveEnemies.
        target.aggroOverride = 20; // Помечаем врага, что он разозлен

        if (target.hp <= 0) {
            logFn(`${target.name} погибает от выстрела!`, "info");
            return true;
        }
        return false;
    }

    // ... (остальной код dropLoot и useItem остается без изменений) ...

    // ... (остальной код combat.js без изменений) ...

    // === ВЫПАДЕНИЕ ЛУТА ===
    // Исправленная сигнатура: (enemy, player, depth, itemsArray, logFn)
    // === ВЫПАДЕНИЕ ЛУТА ===
    // Сигнатура: (enemy, depth, itemsArray, logFn)
    function dropLoot(enemy, depth, itemsArray, logFn) {
        if (!enemy.lootType) return;

        // Шанс выпадения 40%
        if (Math.random() > 0.4) return;

        let droppedItem = null;
        
        // Инициализируем генератор
        const rng = new Math.seedrandom(`loot_${enemy.x}_${enemy.y}_${Date.now()}`);
        
        // ✅ ИСПРАВЛЕНИЕ: создаем свою функцию выбора из массива, 
        // так как seedrandom не имеет встроенного .choice()
        const choice = (array) => array[Math.floor(rng() * array.length)];

        if (enemy.lootType === 'gold') {
            // Золото: количество растет с глубиной
            const baseGold = 5 + Math.floor(depth * 2.5);
            // Используем rng() вместо Math.random() для консистентности
            const amount = Math.floor(baseGold * (0.8 + rng() * 0.4)); 
            
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
                const template = choice(foods); // ✅ Теперь работает корректно
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, 1.0);
            }
        } 
        else if (enemy.lootType === 'weapon') {
            // Оружие/Броня
            const equips = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
            if (equips.length > 0) {
                const template = choice(equips); // ✅ Теперь работает корректно
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
            // Зелья дают временный бонус, который накапливается в текущем значении
            player.atk += item.val;
            logFn(`Вы выпили ${item.name}. Сила +${item.val}.`, "loot");
            used = true;
        }
        else if (item.type === "weapon") {
            // 1. Снимаем старое оружие, если оно есть
            if (player.equipment.weapon) {
                // Важно: вычитаем именно то значение, которое было прибавлено
                player.atk -= player.equipment.weapon.val;
                // Возвращаем старое оружие в инвентарь
                player.inventory.push(player.equipment.weapon);
            }
            
            // 2. Надеваем новое оружие
            player.equipment.weapon = item;
            player.atk += item.val;
            
            // Логика боеприпасов
            if (item.maxAmmo > 0 && item.currentAmmo === 0) {
                item.currentAmmo = item.maxAmmo;
            }
            
            logFn(`Вы взяли в руки ${item.name}. Атака +${item.val}.`, "loot");
            used = true;
        } 
        else if (item.type === "armor") {
            // 1. Снимаем старую броню
            if (player.equipment.armor) {
                player.def -= player.equipment.armor.val;
                player.inventory.push(player.equipment.armor);
            }
            
            // 2. Надеваем новую броню
            player.equipment.armor = item;
            player.def += item.val;
            
            logFn(`Вы надели ${item.name}. Защита +${item.val}.`, "loot");
            used = true;
        }

        if (used) {
            // Удаляем использованный/экипированный предмет из инвентаря
            player.inventory.splice(index, 1);
            
            // === ЗАЩИТА ОТ ОТРИЦАТЕЛЬНЫХ СТАТОВ ===
            // Минимальная атака и защита не могут быть меньше 0 (или 1 для атаки)
            if (player.atk < 1) player.atk = 1;
            if (player.def < 0) player.def = 0;
            
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
        { name: "Крыса", char: getChar('ENEMY_RAT'), color: "#795548", hp: [8, 12], atk: [1, 1], def: [0, 0], lootType: "food", speed: 10 },
        { name: "Гоблин", char: getChar('ENEMY_GOBLIN'), color: "#4CAF50", hp: [12, 18], atk: [1, 2], def: [0, 1], lootType: "gold", speed: 10 },
        { name: "Волк", char: getChar('ENEMY_WOLF'), color: "#9E9E9E", hp: [15, 22], atk: [2, 3], def: [0, 1], lootType: "food", speed: 10 },
        
        // === УРОВЕНЬ 4-6 (СНИЖЕНЫ ПОКАЗАТЕЛИ) ===
        { name: "Бандит", char: getChar('ENEMY_BANDIT'), color: "#FF9800", hp: [18, 25], atk: [2, 4], def: [0, 1], lootType: "weapon", speed: 10 },
        { name: "Скелет", char: getChar('ENEMY_SKELETON'), color: "#B0BEC5", hp: [15, 22], atk: [2, 4], def: [1, 2], lootType: "gold", speed: 8},
        { name: "Слизень", char: getChar('ENEMY_SLIME'), color: "#00BCD4", hp: [20, 30], atk: [1, 2], def: [1, 2], lootType: "food", speed: 3 },
        { name: "Орк-разведчик", char: getChar('ENEMY_ORC'), color: "#8BC34A", hp: [25, 35], atk: [3, 4], def: [1, 2], lootType: "weapon", speed: 9 },

        // === УРОВЕНЬ 7-9 ===
        { name: "Зомби", char: getChar('ENEMY_ZOMBIE'), color: "#607D8B", hp: [40, 55], atk: [4, 7], def: [1, 3], lootType: "gold", speed: 3 },
        { name: "Гарпия", char: getChar('ENEMY_HARPY'), color: "#E91E63", hp: [30, 45], atk: [6, 9], def: [0, 1], lootType: "weapon", speed: 12 },
        { name: "Призрак", char: getChar('ENEMY_GHOST'), color: "#7C4DFF", hp: [25, 35], atk: [5, 8], def: [0, 1], lootType: "gold", speed: 8 },
        { name: "Вампир", char: getChar('ENEMY_VAMPIRE'), color: "#C62828", hp: [50, 70], atk: [7, 10], def: [2, 4], lootType: "weapon", speed: 8 },

        // === УРОВЕНЬ 10+ ===
        { name: "Тролль", char: getChar('ENEMY_TROLL'), color: "#4CAF50", hp: [70, 100], atk: [8, 12], def: [2, 3], lootType: "gold", speed: 9 },
        { name: "Лич", char: getChar('ENEMY_LICH'), color: "#7B1FA2", hp: [60, 85], atk: [10, 15], def: [2, 3], lootType: "weapon", speed: 10 },
        { name: "Голем", char: getChar('ENEMY_GOLEM'), color: "#90A4AE", hp: [100, 150], atk: [10, 14], def: [6, 10], lootType: "gold", speed: 8 },
        { name: "Дракон", char: getChar('ENEMY_DRAGON'), color: "#FF5722", hp: [90, 130], atk: [12, 18], def: [4, 7], lootType: "weapon", speed: 10 }
    ];

    const ITEM_TYPES = [
        // === МЕЛЕЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_SWORD'), color: "#FFD700", baseName: "Меч", stat: "atk", val: [2, 5], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_AXE'), color: "#FFD700", baseName: "Топор", stat: "atk", val: [3, 7], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_MACE'), color: "#FFD700", baseName: "Булава", stat: "atk", val: [2, 6], gender: "she", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_DAGGER'), color: "#FF9800", baseName: "Кинжал", stat: "atk", val: [1, 3], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_SPEAR'), color: "#FFD700", baseName: "Копьё", stat: "atk", val: [4, 8], gender: "it", plural: false, meleeType: true, range: 1 },
        
        // === ДИСТАНЦИОННОЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_BOW'), color: "#FF9800", baseName: "Лук", stat: "atk", val: [3, 6], gender: "he", plural: false, meleeType: false, range: 15, maxAmmo: 20 },
        { type: "weapon", char: getChar('ITEM_CROSSBOW'), color: "#FF9800", baseName: "Арбалет", stat: "atk", val: [5, 9], gender: "he", plural: false, meleeType: false, range: 10, maxAmmo: 15 },
        { type: "weapon", char: getChar('ITEM_STAFF'), color: "#B39DDB", baseName: "Посох огня", stat: "atk", val: [2, 4], gender: "he", plural: false, meleeType: false, range: 16, maxAmmo: 50 },
        
        // ... остальные предметы ...
        
        // === БРОНЯ ===
        { type: "armor", char: getChar('ITEM_ARMOR_LEATHER'), color: "#9E9E9E", baseName: "Кожаная броня", stat: "def", val: [1, 3], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_ARMOR_CHAIN'), color: "#9E9E9E", baseName: "Кольчуга", stat: "def", val: [3, 6], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_SHIELD'), color: "#795548", baseName: "Щит", stat: "def", val: [2, 4], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GREAVES'), color: "#4CAF50", baseName: "Наголенники", stat: "def", val: [1, 3], gender: "he", plural: true },
        { type: "armor", char: getChar('ITEM_CLOAK'), color: "#8D6E63", baseName: "Плащ теней", stat: "def", val: [2, 3], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_HELMET'), color: "#607D8B", baseName: "Шлем", stat: "def", val: [1, 2], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GLOVES'), color: "#8D6E63", baseName: "Перчатки", stat: "def", val: [1, 2], gender: "she", plural: true },
    

        // === КНИГИ (ЛОР) ===
        // type: 'book' - специальный тип, который не кладется в инвентарь, а читается сразу
        { 
            type: "book", 
            char: getChar('ITEM_BOOK'), 
            color: "#A67C52", // Цвет старой бумаги/кожи
            baseName: "Старая книга", 
            gender: "she", 
            plural: false,
            val: [0, 0] 
        },

   
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
    // === 1. ГЛОБАЛЬНАЯ КАРТА (уникальные символы) ===
    'TILE_PLAIN':            { char: '░',   tile: { file: 'terrain_sprites', x: 10, y: 2 }, desc: 'Равнина' }, // Было: '.'
    'TILE_FOREST':           { char: 'T',   tile: { file: 'terrain_sprites', x: 8, y: 2 }, desc: 'Лес' },
    'TILE_MOUNTAIN':         { char: '^',   tile: { file: 'terrain_sprites', x: 5, y: 2 }, desc: 'Горы' },
    'TILE_WATER':            { char: '≈',   tile: { file: 'terrain_sprites', x: 7, y: 2 }, desc: 'Вода' },
    'TILE_CITY':             { char: 'C',   tile: { file: 'terrain_sprites', x: 9, y: 2 }, desc: 'Город' },
    'TILE_DUNGEON_ENTRANCE': { char: 'D',   tile: { file: 'terrain_sprites', x: 6, y: 0 }, desc: 'Вход' },
    'TILE_ROAD':             { char: '─',   tile: { file: 'terrain_sprites', x: 1, y: 2 }, desc: 'Дорога' }, // Было: '█'

    // === 2. ПОДЗЕМЕЛЬЕ (стандартные символы, без изменений) ===
    'FLOOR_DEFAULT':         { char: '.',   tile: { file: 'terrain_sprites', x: 0, y: 0 }, desc: 'Пол' },
    'WALL_DEFAULT':          { char: '#',   tile: { file: 'terrain_sprites', x: 12, y: 2 }, desc: 'Стена' },
    'FLOOR_ORGANIC':         { char: 'o',   tile: { file: 'terrain_sprites', x: 3, y: 2 }, desc: 'Орг. пол' },
    'WALL_ORGANIC':          { char: 'O',   tile: { file: 'terrain_sprites', x: 4, y: 2 }, desc: 'Орг. стена' },
    'FLOOR_CITY':            { char: '·',   tile: { file: 'terrain_sprites', x: 0, y: 0 }, desc: 'Пол города' },
    'WALL_CITY':             { char: '█',   tile: { file: 'terrain_sprites', x: 11, y: 2 }, desc: 'Стена города' },
    'STAIRS_UP':             { char: '>',  tile: { file: 'terrain_sprites', x: 3, y: 0 }, desc: 'Лестница ↑' },
    'STAIRS_DOWN':           { char: '<',  tile: { file: 'terrain_sprites', x: 2, y: 0 }, desc: 'Лестница ↓' },
    

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
    'ITEM_GLOVES':           { char: 'v',   tile: { file: 'item_sprites', x: 14, y: 0 }, desc: 'Перчатки' }, // Совпадает с ENEMY_GHOST

    // Ресурсы и прочее
    'ITEM_GOLD':             { char: '$',   tile: { file: 'item_sprites', x: 13, y: 3 }, desc: 'Золото' },
    'ITEM_BOOK':             { char: '?',   tile: { file: 'item_sprites', x: 3, y: 4 }, desc: 'Книга' }, 
    
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
/**
 * МОДУЛЬ ОТРИСОВКИ СПРАЙТОВ (TilesetRenderer)
 * Отвечает за загрузку PNG-тайлсетов и их отрисовку с программной окраской.
 */
const TilesetRenderer = (function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const TILE_SIZE = 16;
    const SPRITE_FILES = [
        { src: 'terrain_sprites.png', key: 'terrain_sprites' },
        { src: 'creature_sprites.png', key: 'creature_sprites' },
        { src: 'item_sprites.png',   key: 'item_sprites' }
    ];

    // === СОСТОЯНИЕ ===
    const spriteSheets = {};
    let isReady = false;

    // === МАППИНГ СИМВОЛОВ
    // Формат: 'символ': { file: 'ключ_картинки', x: колонка, y: ряд }
    const TILE_MAP = {
        // === ПОДЗЕМЕЛЬЕ (стандартные, без изменений) ===
        '.':  { file: 'terrain_sprites', x: 0, y: 0 },  // FLOOR_DEFAULT
        '#':  { file: 'terrain_sprites', x: 12, y: 2 },  // WALL_DEFAULT
        'o':  { file: 'terrain_sprites', x: 3, y: 2 },  // FLOOR_ORGANIC
        'O':  { file: 'terrain_sprites', x: 4, y: 2 },  // WALL_ORGANIC
        '·':  { file: 'terrain_sprites', x: 0, y: 0 },  // FLOOR_CITY
        '█':  { file: 'terrain_sprites', x: 11, y: 2 }, // WALL_CITY
        '>': { file: 'terrain_sprites', x: 3, y: 0 },  // STAIRS_UP
        '<': { file: 'terrain_sprites', x: 2, y: 0 },  // STAIRS_DOWN

        // === ГЛОБАЛЬНАЯ КАРТА (новые уникальные символы) ===
        '░':  { file: 'terrain_sprites', x: 10, y: 2 }, // TILE_PLAIN
        '─':  { file: 'terrain_sprites', x: 1, y: 2 }, // TILE_ROAD
        'T':  { file: 'terrain_sprites', x: 8, y: 2 },  // TILE_FOREST
        '^':  { file: 'terrain_sprites', x: 5, y: 2 },  // TILE_MOUNTAIN
        '≈':  { file: 'terrain_sprites', x: 7, y: 2 },  // TILE_WATER
        'C':  { file: 'terrain_sprites', x: 9, y: 2 },  // TILE_CITY
        'D':  { file: 'terrain_sprites', x: 6, y: 0 },  // TILE_DUNGEON_ENTRANCE


        // --- СУЩЕСТВА ---
        '@': { file: 'creature_sprites', x: 2,  y: 0 },  // Игрок
        'r': { file: 'creature_sprites', x: 8,  y: 9 },  // Крыса
        'g': { file: 'creature_sprites', x: 12, y: 3 },  // Гоблин
        'w': { file: 'creature_sprites', x: 1,  y: 9 },  // Волк
        'j': { file: 'creature_sprites', x: 3,  y: 15 }, // Слизень
        'b': { file: 'creature_sprites', x: 5,  y: 0 },  // Бандит
        's': { file: 'creature_sprites', x: 6,  y: 0 },  // Скелет
        'k': { file: 'creature_sprites', x: 7,  y: 0 },  // Орк
        'z': { file: 'creature_sprites', x: 8,  y: 0 },  // Зомби
        'h': { file: 'creature_sprites', x: 9,  y: 0 },  // Гарпия
        'G': { file: 'creature_sprites', x: 10, y: 0 },  // Призрак
        'V': { file: 'creature_sprites', x: 11, y: 0 },  // Вампир
        't': { file: 'creature_sprites', x: 12, y: 0 },  // Тролль
        'L': { file: 'creature_sprites', x: 13, y: 0 },  // Лич
        'M': { file: 'creature_sprites', x: 14, y: 0 },  // Голем
        'q': { file: 'creature_sprites', x: 15, y: 0 },  // Дракон
        '☺': { file: 'creature_sprites', x: 8,  y: 3 },  // NPC

        // --- ПРЕДМЕТЫ ---
        '/': { file: 'item_sprites', x: 0,  y: 0 }, // Меч
        'P': { file: 'item_sprites', x: 1,  y: 0 }, // Топор
        ')': { file: 'item_sprites', x: 2,  y: 0 }, // Булава
        '*': { file: 'item_sprites', x: 3,  y: 0 }, // Кинжал
        'Y': { file: 'item_sprites', x: 4,  y: 0 }, // Копье
        '(': { file: 'item_sprites', x: 5,  y: 0 }, // Лук
        '=': { file: 'item_sprites', x: 6,  y: 0 }, // Арбалет
        '|': { file: 'item_sprites', x: 7,  y: 0 }, // Посох
        ']': { file: 'item_sprites', x: 8,  y: 0 }, // Кожа
        '[': { file: 'item_sprites', x: 9,  y: 0 }, // Кольчуга
        '}': { file: 'item_sprites', x: 10, y: 0 }, // Щит
        '"': { file: 'item_sprites', x: 11, y: 0 }, // Наголенники
        '{': { file: 'item_sprites', x: 12, y: 0 }, // Плащ
        'H': { file: 'item_sprites', x: 13, y: 0 }, // Шлем
        'v': { file: 'item_sprites', x: 14, y: 0 }, // Перчатки
        '!': { file: 'item_sprites', x: 15, y: 0 }, // Зелье
        '+': { file: 'item_sprites', x: 16, y: 0 }, // Эликсир
        '%': { file: 'item_sprites', x: 17, y: 0 }, // Еда
        '~': { file: 'item_sprites', x: 18, y: 0 }, // Мясо
        '?': { file: 'item_sprites', x: 3, y: 4 }, // ITEM_BOOK
        '$': { file: 'item_sprites', x: 13, y: 3 }  // Золото
    };

    // === ИНИЦИАЛИЗАЦИЯ (Загрузка изображений) ===
    async function init() {
        try {
            await Promise.all(SPRITE_FILES.map(({ src, key }) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        spriteSheets[key] = img;
                        resolve();
                    };
                    img.onerror = () => {
                        console.error(`❌ Не удалось загрузить тайлсет: ${src}`);
                        reject(new Error(`Failed to load ${src}`));
                    };
                    img.src = src;
                });
            }));
            isReady = true;
            console.log("✅ TilesetRenderer: Все спрайты загружены.");
        } catch (error) {
            console.error("❌ Критическая ошибка загрузки спрайтов:", error);
        }
    }

    // === ОТРИСОВКА ===
    function draw(ctx, char, screenX, screenY, color) {
        if (!ctx) return;

        const destX = screenX * TILE_SIZE;
        const destY = screenY * TILE_SIZE;
        const tileData = TILE_MAP[char];

        // 1. Fallback: Если символ не найден в маппинге -> рисуем текст
        if (!tileData) {
            ctx.fillStyle = color || '#fff';
            ctx.font = `${TILE_SIZE}px Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, destX + TILE_SIZE / 2, destY + TILE_SIZE / 2);
            return;
        }

        const img = spriteSheets[tileData.file];

        // 2. Ошибка: Картинка не загружена
        if (!img || !isReady) {
            ctx.fillStyle = '#ff0000'; // Красный квадрат
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tileData.x * TILE_SIZE;
        const srcY = tileData.y * TILE_SIZE;

        // 3. Ошибка: Координаты вне границ картинки
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00'; // Желтый квадрат
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            console.warn(`⚠️ OOB: Спрайт '${char}' (${tileData.file}) за пределами изображения`);
            return;
        }

        // 4. Отрисовка спрайта
        ctx.save();
        
        // Очищаем ячейку (на случай, если там был мусор)
        ctx.clearRect(destX, destY, TILE_SIZE, TILE_SIZE);
        
        // Рисуем сам спрайт
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // 5. Программная окраска (если цвет не белый/черный)
        if (color && color !== '#fff' && color !== '#ffffff' && color !== '#000' && color !== '#000000') {
            // source-atop: рисует новый цвет ТОЛЬКО там, где уже есть непрозрачные пиксели (спрайт)
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }

        ctx.restore();
    }

    // === ПУБЛИЧНЫЙ ИНТЕРФЕЙС ===
    return {
        init,
        draw,
        TILE_SIZE,
        isReady: () => isReady
    };
})();
```
# ###lore.js
```js

/**
 * МОДУЛЬ ЛОРА (lore.js)
 * Управляет выдачей текстовых фрагментов из книг.
 */

const LoreModule = (function() {
    'use strict';

    // База текстов. Можно расширять бесконечно.
    const BOOK_FRAGMENTS = [
        "Дневник неизвестного путника: 'День 4. Запасы еды на исходе. В темноте я слышу шорох крыс, но они кажутся мне сейчас друзьями.'",
        "Выдержка из трактата 'Основы некромантии': 'Жизнь — это лишь искра. Смерть — это океан. Не бойтесь утонуть, бойтесь высохнуть.'",
        "Старая карта с пометками: 'Здесь был вход... или выход? Стрелки указывают в разные стороны. Камень теплый на ощупь.'",
        "Записка, найденная в склепе: 'Они не мертвы. Они просто ждут. Не буди тех, кто спит под фундаментом.'",
        "Фрагмент королевского указа: '...в связи с эпидемией чумы, въезд в столицу закрыт. Всем нарушителям — отрубать головы без суда.'",
        "Молитва забытому богу: 'О, Хранитель Порога, дай мне сил пройти сквозь тьму, или дай тьме сил поглотить меня.'",
        "Нацарапано на стене: 'НЕ ДОВЕРЯЙ ТЕНЯМ. ОНИ ЖИВЫЕ.'",
        "Рецепт зелья: 'Взять корень мандрагоры, высушить на солнце... стоп, какое солнце? Мы же под землей.'",
        "Письмо домой: 'Мама, я стал героем. Или монстром. Я уже не различаю отражения в воде.'",
        "Торговый договор: '50 мечей за 100 золотых. Доставка в Северные Врата. Опасность пути оценивается как высокая.'",
        "Легенда о первом короле: 'Он нашел корону в пещере. Говорят, корона нашла его сама.'",
        "Наблюдения алхимика: 'Слизь зеленого цвета реагирует на железо. При контакте выделяется ядовитый газ.'",
        "Последняя запись в журнале стражи: 'Они идут снизу. Барабаны... я слышу барабаны.'",
        "Детский рисунок на клочке бумаги: 'Папа ушел в пещеру и не вернулся. Я нарисовал ему фонарь, чтобы он не заблудился.'",
        "Философский трактат: 'Если дерево падает в лесу, а рядом нет никого, кто это услышит, издает ли оно звук? А если это падает человек?'",
        "Инструкция к механизму: 'Не нажимать красную кнопку. Серьезно. Мы потеряли трех лучших инженеров.'",
        "Отрывок из поэмы: 'Под камнем спит древнее зло, / Оно видит сны про тепло. / Но стоит лучу пробиться сквозь мрак, / Как мир охватит вечный мрак.'",
        "Запись в судовом журнале (странно для подземелья): 'Шторм усиливается. Компас сошел с ума. Мы плывем в никуда.'",
        "Предсказание гадалки: 'Ты найдешь то, что ищешь, но потеряешь то, что любишь.'",
        "Надпись на могильной плите: 'Здесь лежит тот, кто слишком много знал.'",
        "Черновик письма: 'Дорогой брат, прости меня за то, что я сделал с нашим отцом. Это было необходимо.'",
        "Отчет разведчика: 'Вход в логово дракона охраняют два голема. Уязвимое место — суставы.'",
        "Рецепт пирога: '3 стакана муки, 2 яйца, щепотка соли... и немного любви.'",
        "Запись в дневнике сумасшедшего: 'Стены дышат. Пол пульсирует. Я часть этого места.'",
        "Указ императора: 'Всем магам зарегистрироваться в гильдии. Незаконное использование магии карается смертью.'"
    ];

    let currentIndex = 0;

    /**
     * Получить следующую фразу из списка (циклически)
     */
    function getNextFragment() {
        const text = BOOK_FRAGMENTS[currentIndex];
        
        // Увеличиваем индекс, если дошли до конца - сбрасываем в 0
        currentIndex = (currentIndex + 1) % BOOK_FRAGMENTS.length;
        
        return text;
    }

    return {
        getNextFragment: getNextFragment
    };
})();
```

# ###quest_system.js
```js
/**
 * МОДУЛЬ СИСТЕМЫ КВЕСТОВ (quest_system.js)
 */
const QuestSystemModule = (function() {
    'use strict';

    const MAX_QUEST_RADIUS = 50;
    const FALLBACK_RADIUS = 100;

    const QUEST_TEMPLATES = {
        FETCH: [
            "Мне нужен предмет: {item}. Говорят, последний раз его видели здесь: {location} (глубина {depth}+). Принеси его, и я заплачу {gold} золотых.",
            "В {location} (не ниже {depth} уровня) затерялся ценный артефакт: {item}. Найди его для меня. Награда: {gold} монет."
        ],
        HUNT: [
            "{enemy} расплодились на нижних уровнях подземелья {location} (глубина {depth}+). Убей {count} штук, и город будет в безопасности. Награда: {gold} золотых.",
            "Охотники боятся спускаться в {location} ниже {depth} уровня. Там слишком много {enemy}. Устрани {count} особей, и я дам тебе {gold} монет."
        ],
        EXPLORE: [
            "Разведчики пропали рядом с подземельем {location}. Доберись до глубины {depth} и проверь, что там происходит. Награда за риск: {gold} золотых.",
            "На карте отмечено странное место: {location}. Спустись хотя бы на {depth} уровень и убедись, что путь открыт. Плачу {gold} за информацию."
        ],
        DIGGER: [
            "Шахтерская гильдия ищет смельчаков. Спустись в {location} хотя бы на {depth} уровень. Награда за риск: {gold} золотых.",
            "Говорят, на {depth} уровне в {location} есть древние залежи. Доберись туда и проверь. Плачу {gold} монет."
        ],
        COLLECT: [
            "Мне нужно {count} шт. '{item}' для экспериментов. Ищи в подземелье {location} (глубина {depth}+). Награда: {gold} золотых.",
            "Собери {count} экземпляров '{item}' в подземелье {location}. Заплату {gold} монет."
        ],
        BOUNTY: [
            "Голова {enemy} стоит дорого. Убей {count} штук в любом подземелье. Награда: {gold} золотых.",
            "Эти твари ({enemy}) стали слишком наглыми. Истреби {count} особей где бы ты их ни нашел. Плачу {gold}."
        ],
        SCHOLAR: [
            "Библиотекарь просит принести знания. Прочитай {count} древних книг, которые найдешь. Награда: {gold} золотых."
        ]
    };

    function pickRandom(rng, array) { return array[Math.floor(rng.next() * array.length)]; }

    function formatBriefing(template, data) {
        let text = template;
        text = text.replace(/{item}/g, data.itemName || "древний предмет");
        text = text.replace(/{enemy}/g, data.enemyName || "врагов");
        text = text.replace(/{location}/g, data.locationName || "неизвестном месте");
        text = text.replace(/{count}/g, data.count || "несколько");
        text = text.replace(/{gold}/g, data.gold || "немного");
        text = text.replace(/{depth}/g, data.depth || "1");
        return text;
    }

    function generateQuestId(gx, gy, type, index) { return `Q_${type}_${gx}_${gy}_${index}`; }

    function findRealPOI(gx, gy, radius, poiType) {
        const candidates = [];
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > radius) continue;
                const tx = gx + dx;
                const ty = gy + dy;
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getPOI) {
                    const poi = GlobalMapModule.getPOI(tx, ty);
                    if (poi && poi.type === poiType) candidates.push(poi);
                }
            }
        }
        return candidates.length > 0 ? candidates : null;
    }

    function calculateTargetParams(gx, gy, type, difficultyLevel) {
        const seed = createSeed(gx, gy, difficultyLevel) + 777; 
        const rng = new SeededRandom(seed);
        let targetData = {};

        // 1. Определение локации (Подземелья)
        // Для большинства квестов нужна конкретная локация. 
        // Для BOUNTY и SCHOLAR локация может быть не так важна, но мы её зададим для единообразия UI.
        const candidates = findRealPOI(gx, gy, MAX_QUEST_RADIUS, 'dungeon');
        let targetPoi = null;
        
        if (candidates && candidates.length > 0) {
            targetPoi = rng.choice(candidates);
        } else {
            const wideCandidates = findRealPOI(gx, gy, FALLBACK_RADIUS, 'dungeon');
            if (wideCandidates && wideCandidates.length > 0) {
                targetPoi = rng.choice(wideCandidates);
            }
        }

        if (targetPoi) {
            targetData.targetX = targetPoi.x;
            targetData.targetY = targetPoi.y;
            targetData.locationName = targetPoi.name;
            targetData.dungeonType = targetPoi.dungeonType;
        } else {
            // Фолбэк: случайные координаты
            const angle = rng.next() * Math.PI * 2;
            const r = rng.int(10, MAX_QUEST_RADIUS);
            targetData.targetX = gx + Math.round(Math.cos(angle) * r);
            targetData.targetY = gy + Math.round(Math.sin(angle) * r);
            targetData.locationName = "Забытых руинах";
            targetData.dungeonType = 'rogue';
        }

        // 2. Специфичные параметры для типов квестов
        if (type === 'FETCH') {
            const possibleItems = DataModule.ITEM_TYPES.filter(i => 
                i.type !== 'gold' && i.type !== 'book' && i.type !== 'food' && 
                i.type !== 'potion_hp' && i.type !== 'potion_str'
            );
            const itemTemplate = pickRandom(rng, possibleItems);
            targetData.itemName = itemTemplate.baseName;
            targetData.itemType = itemTemplate.type;
        } 
        else if (type === 'HUNT') {
            const enemies = EntityModule.getAvailableEnemies ? EntityModule.getAvailableEnemies(difficultyLevel) : DataModule.ENEMY_TYPES;
            const enemyTemplate = pickRandom(rng, enemies);
            
            targetData.enemyName = enemyTemplate.name;
            const baseCount = rng.int(3, 5);
            const multiplier = WorldCurveModule.getEnemyMultiplier(gx, gy);
            targetData.count = Math.max(1, Math.floor(baseCount * Math.sqrt(multiplier)));
        }
        else if (type === 'DIGGER') {
            // Цель: добраться до определенной глубины
            // Глубина зависит от сложности/уровня игрока, но не слишком высокая
            targetData.targetDepth = rng.int(2, 5); 
        }
        else if (type === 'COLLECT') {
            // Цель: собрать предметы (зелья, книги, еда)
            const collectibleTypes = ['potion_hp', 'book', 'food'];
            // Фильтруем типы предметов, которые существуют в игре
            const possibleItems = DataModule.ITEM_TYPES.filter(i => collectibleTypes.includes(i.type));
            const itemTemplate = pickRandom(rng, possibleItems);
            
            targetData.itemName = itemTemplate.baseName;
            targetData.itemType = itemTemplate.type;
            targetData.count = rng.int(2, 4); // Нужно собрать 2-4 шт.
        }
        else if (type === 'BOUNTY') {
            // Цель: убить конкретных врагов (в любом месте или в указанном подземелье)
            const enemies = EntityModule.getAvailableEnemies ? EntityModule.getAvailableEnemies(difficultyLevel) : DataModule.ENEMY_TYPES;
            const enemyTemplate = pickRandom(rng, enemies);
            
            targetData.enemyName = enemyTemplate.name;
            // Для Bounty количество обычно меньше, чем для Hunt, так как это "элитная" цель
            targetData.count = rng.int(1, 3); 
        }
        else if (type === 'SCHOLAR') {
            // Цель: прочитать книги
            targetData.count = rng.int(1, 3);
            // Локация не важна, но оставим для отображения в UI
            targetData.locationName = "древних библиотеках";
        }

        return targetData;
    }

    function createQuest(gx, gy, questIndex) {
        // Добавляем новые типы квестов
        const types = ['FETCH', 'HUNT', 'EXPLORE', 'DIGGER', 'COLLECT', 'BOUNTY', 'SCHOLAR'];
        const rng = new SeededRandom(createSeed(gx, gy, questIndex));
        const type = pickRandom(rng, types);
        
        const globalDist = Math.abs(gx) + Math.abs(gy);
        let playerLevel = 1;
        if (typeof GameModule !== 'undefined' && GameModule.getPlayer) {
            const p = GameModule.getPlayer();
            if (p) playerLevel = p.level;
        }

        const questEnemyTier = Math.min(6, Math.floor(globalDist / 15) + playerLevel);
        const targetData = calculateTargetParams(gx, gy, type, questEnemyTier);
        
        const recommendedDepth = Math.max(1, Math.min(5, Math.floor(questEnemyTier / 1.5)));
        targetData.recommendedDepth = recommendedDepth;

        const goldBase = rng.int(50, 150);
        const goldMult = WorldCurveModule.getGoldMultiplier(globalDist, 0); 
        const finalGold = Math.floor(goldBase * goldMult) + (playerLevel * 10);
        
        const id = generateQuestId(gx, gy, type, questIndex);
        const templates = QUEST_TEMPLATES[type];
        const template = pickRandom(rng, templates);
        
        const briefingData = {
            itemName: targetData.itemName,
            enemyName: targetData.enemyName,
            locationName: targetData.locationName,
            count: targetData.count,
            gold: finalGold,
            depth: targetData.targetDepth || recommendedDepth // Используем targetDepth для DIGGER, если он есть
        };
        
        const briefing = formatBriefing(template, briefingData);

        // Определяем максимальный прогресс в зависимости от типа квеста
        let maxProg = 1;
        if (type === 'HUNT' || type === 'COLLECT' || type === 'BOUNTY' || type === 'SCHOLAR') {
            maxProg = targetData.count || 1;
        }

        return {
            id: id,
            type: type,
            target: targetData, 
            progress: 0,
            maxProgress: maxProg,
            rewardGold: finalGold,
            briefing: briefing,
            isCompleted: false,
            isTurnedIn: false,
            isActive: false
        };
    }

    function checkProgress(quest, eventData) {
        if (!quest || quest.isCompleted || !quest.isActive) return false;
        if (!eventData) return false;

        let updated = false;

        // Проверка локации (для DIGGER, COLLECT, HUNT с привязкой)
        const isInCorrectLocation = (
            !quest.target.targetX || // Если targetX нет (BOUNTY), считаем что мы "везде"
            (eventData.locX !== undefined && eventData.locX === quest.target.targetX && 
             eventData.locY !== undefined && eventData.locY === quest.target.targetY)
        );

        // === DIGGER (Глубинный разведчик) ===
        if (quest.type === 'DIGGER' && eventData.type === 'depth') {
            // Проверяем, что мы в том же подземелье
            if (eventData.locX === quest.target.targetX && eventData.locY === quest.target.targetY) {
                if (eventData.currentDepth >= quest.target.targetDepth) {
                    quest.progress = quest.maxProgress;
                    quest.isCompleted = true;
                    if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                        RenderModule.log(`🏆 Квест выполнен: Вы достигли глубины ${quest.target.targetDepth}!`, "event");
                    }
                    return true;
                }
            }
        }

        // === HUNT (Охота в конкретной локации) ===
        if (quest.type === 'HUNT' && eventData.type === 'kill') {
            if (eventData.enemyName === quest.target.enemyName) {
                if (isInCorrectLocation) {
                    quest.progress++;
                    updated = true;
                    if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                        RenderModule.log(`Квест: ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`, "info");
                    }
                }
            }
        }

        // === BOUNTY (Охота за головами - в любом месте) ===
        if (quest.type === 'BOUNTY' && eventData.type === 'kill') {
            if (eventData.enemyName === quest.target.enemyName) {
                // Для BOUNTY локация не важна, убиваем где нашли
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: Охота на ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === FETCH (Найти один предмет) ===
        if (quest.type === 'FETCH' && eventData.type === 'pickup') {
            if (eventData.itemType === quest.target.itemType && isInCorrectLocation) {
                updated = true; 
            }
        }

        // === COLLECT (Собрать N предметов) ===
        if (quest.type === 'COLLECT' && eventData.type === 'pickup') {
            if (eventData.itemType === quest.target.itemType && isInCorrectLocation) {
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: Сбор ${quest.target.itemName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === SCHOLAR (Прочитать книги) ===
        if (quest.type === 'SCHOLAR' && eventData.type === 'read_book') {
            quest.progress++;
            updated = true;
            if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                RenderModule.log(`Квест: Прочитано книг (${quest.progress}/${quest.maxProgress})`, "info");
            }
        }

        // === EXPLORE (Исследование локации) ===
        if (quest.type === 'EXPLORE' && eventData.type === 'move') {
            const dist = Math.abs(eventData.x - quest.target.targetX) + Math.abs(eventData.y - quest.target.targetY);
            if (dist <= 1) { 
                quest.progress = quest.maxProgress;
                quest.isCompleted = true;
                return true; 
            }
        }

        // Финальная проверка завершения для типов с накопительным прогрессом
        if ((quest.type === 'HUNT' || quest.type === 'FETCH' || quest.type === 'COLLECT' || quest.type === 'BOUNTY' || quest.type === 'SCHOLAR') && updated) {
            if (quest.progress >= quest.maxProgress) {
                quest.isCompleted = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`🏆 Квест "${quest.target.locationName}" выполнен! Вернитесь за наградой.`, "event");
                }
            }
        }

        return updated;
    }

    return {
        createQuest: createQuest,
        checkProgress: checkProgress,
        MAX_RADIUS: MAX_QUEST_RADIUS
    };

})();
```

