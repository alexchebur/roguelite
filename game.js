
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
    let isShopOpen = false;
    let currentMerchantInv = null;

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

            // >>> ИНИЦИАЛИЗАЦИЯ СЮЖЕТНОЙ ЦЕПОЧКИ <<<
            if (typeof QuestChainModule !== 'undefined') {
                QuestChainModule.init(startPos.x, startPos.y);
                RenderModule.log("📜 Сюжетная линия мира сгенерирована.", "info");
            }
            // >>> КОНЕЦ БЛОКА <<<

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
        updateAbandonButton(false); // <--- ДОБАВИТЬ
    }

    // === ОБРАБОТКА КЛИКА/ТАПА ПО КАРТЕ (ОСМОТР И ВЗАИМОДЕЙСТВИЕ) ===
    function handleMapClick(clientX, clientY) {
        // 1. Если открыт магазин, обрабатываем клик по товарам
        if (isShopOpen) {
            handleShopClick(clientX, clientY);
            return;
        }

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

        // 2. Враги
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

        // 3. NPC (Диалог или Квест)
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

        // 4. Предметы
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

    // === ЛОГИКА МАГАЗИНА ===

    // === ОТКРЫТИЕ МАГАЗИНА ===
    function openShop() {
        if (isShopOpen) return;
        
        // Генерируем инвентарь торговца на основе текущей глубины/уровня мира
        // Если мы в городе (depth 0), используем 1 для баланса, иначе текущую глубину
        const depth = currentDepth > 0 ? currentDepth : 1;
        const merchantGold = 500 + (depth * 100);
        
        currentMerchantInv = EntityModule.createMerchantInventory(depth, merchantGold);
        isShopOpen = true;
        
        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        RenderModule.log("Вы вошли в лавку. Добро пожаловать!", "info");
    }

    // === ОБРАБОТКА КЛИКА ПО ОКНУ МАГАЗИНА ===
    // === ОБРАБОТКА КЛИКА/ТАПА ПО ОКНУ МАГАЗИНА ===
    function handleShopClick(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // 1. ПРОВЕРКА КНОПКИ "ВЫЙТИ"
        if (window.shopExitButton) {
            const btn = window.shopExitButton;
            if (clickX >= btn.x && clickX <= btn.x + btn.w && 
                clickY >= btn.y && clickY <= btn.y + btn.h) {
                closeShop();
                return;
            }
        }

        // 2. ПРОВЕРКА НАВИГАЦИИ (СТРЕЛКИ)
        if (window.shopClickAreas) {
            for (const area of window.shopClickAreas) {
                if (clickX >= area.x && clickX <= area.x + area.w &&
                    clickY >= area.y && clickY <= area.y + area.h) {
                    
                    // Обработка переключения страниц
                    if (area.action === 'prev_m') {
                        window.shopPageMerchant--;
                        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
                        return;
                    }
                    if (area.action === 'next_m') {
                        window.shopPageMerchant++;
                        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
                        return;
                    }
                    if (area.action === 'prev_p') {
                        window.shopPagePlayer--;
                        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
                        return;
                    }
                    if (area.action === 'next_p') {
                        window.shopPagePlayer++;
                        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
                        return;
                    }
                    
                    // Обработка покупки/продажи
                    if (area.action === 'buy') {
                        buyItem(area.index);
                        return;
                    }
                    if (area.action === 'sell') {
                        sellItem(area.index);
                        return;
                    }
                }
            }
        }

        // 3. Если клик вне окна — закрываем магазин
        const winW = canvas.width * 0.95;
        const winH = canvas.height * 0.9;
        const winX = (canvas.width - winW) / 2;
        const winY = (canvas.height - winH) / 2;

        if (clickX < winX || clickX > winX + winW || clickY < winY || clickY > winY + winH) {
            closeShop();
        }
    }
    // === ПОКУПКА ПРЕДМЕТА ===
    function buyItem(index) {
        if (!currentMerchantInv || !player) return;
        const item = currentMerchantInv.items[index];
        
        if (!item) {
            RenderModule.log("Этот слот пуст.", "info");
            return;
        }

        if (player.gold >= item.price) {
            player.gold -= item.price;
            currentMerchantInv.gold += item.price;
            
            currentMerchantInv.items.splice(index, 1);
            player.inventory.push(item);
            
            // === СБРОС СТРАНИЦ ПРИ ИЗМЕНЕНИИ СПИСКА ===
            window.shopPageMerchant = 0;
            window.shopPagePlayer = 0;
            
            RenderModule.log(`Куплено: ${item.name} за ${item.price} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        } else {
            RenderModule.log("Недостаточно золота!", "combat");
        }
    }

    // === ПРОДАЖА ПРЕДМЕТА ===
    // === ПРОДАЖА ПРЕДМЕТА ===
    function sellItem(index) {
        if (!player) return;
        const item = player.inventory[index];
        
        if (!item) {
            RenderModule.log("Этот слот пуст.", "info");
            return;
        }

        if (item.isQuestItem) {
            RenderModule.log("Это квестовый предмет, его нельзя продать!", "combat");
            return;
        }

        const sellPrice = Math.floor(item.price ? item.price * 0.5 : item.val * 2);

        if (currentMerchantInv.gold >= sellPrice) {
            player.gold += sellPrice;
            currentMerchantInv.gold -= sellPrice;
            
            player.inventory.splice(index, 1);
            
            // Добавляем предмет торговцу
            const buyBackPrice = Math.floor(sellPrice * 1.2); 
            item.price = buyBackPrice;
            currentMerchantInv.items.unshift(item);
            
            // === СБРОС СТРАНИЦ ===
            window.shopPageMerchant = 0;
            window.shopPagePlayer = 0;
            
            RenderModule.log(`Продано: ${item.name} за ${sellPrice} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        } else {
            RenderModule.log("У торговца недостаточно золота!", "combat");
        }
    }
    // === ЗАКРЫТИЕ МАГАЗИНА ===
    function closeShop() {
        isShopOpen = false;
        currentMerchantInv = null;
        RenderModule.requestRedraw(); // Вернуть обычную отрисовку карты
        RenderModule.log("Вы покинули лавку.", "info");
    }    
// === ЛОГИКА ВЫДАЧИ КВЕСТОВ (Интеграция с QuestChainModule) ===
function tryGiveQuest(npc) {
    if (typeof QuestSystemModule === 'undefined') return false;
    if (!npc.isQuestGiver) return false;

    if (!entrancePos) return false;
    const cityGx = entrancePos.x;
    const cityGy = entrancePos.y;

    // ==========================================
    // 1. ПРОВЕРКА СЮЖЕТНОЙ ЦЕПОЧКИ (Приоритет №1)
    // ==========================================
    if (typeof QuestChainModule !== 'undefined' && QuestChainModule.isInitialized()) {
        if (QuestChainModule.isChainCity(cityGx, cityGy)) {
            const chainQuest = QuestChainModule.getQuestForCity(cityGx, cityGy);
            
            if (chainQuest) {
                const questId = chainQuest.id;
                const alreadyActive = activeQuests.some(q => q.id === questId);
                const alreadyDone = completedQuestIds.has(questId);

                // Сценарий А: Сюжетный квест выполнен, сдаем награду
                if (alreadyActive) {
                    const q = activeQuests.find(q => q.id === questId);
                    if (q.isCompleted && !q.isTurnedIn) {
                        player.gold += q.rewardGold;
                        q.isTurnedIn = true; 
                        
                        RenderModule.log(`🏆 СЮЖЕТНЫЙ КВЕСТ СДАН! Получено: ${q.rewardGold} золотых.`, "loot");
                        
                        // >>> КАСТОМНЫЙ ТЕКСТ СДАЧИ <<<
                        if (q.turnInText) {
                            RenderModule.log(`🗣️ ${npc.name}: "${q.turnInText}"`, "event");
                        } else {
                            RenderModule.log(`${npc.name}: "Отличная работа. Вот твоя награда."`, "info");
                        }

                        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
                        RenderModule.updateQuestBriefing(null); 

                        activeQuests = activeQuests.filter(aq => aq.id !== questId);
                        completedQuestIds.add(questId);
                        updateAbandonButton(activeQuests.length > 0);
                        // Обновляем прогресс цепочки (для внутреннего состояния модуля, если нужно)
                        QuestChainModule.completeCurrentQuest();
                        updateQuestCompass();
                        
                        if (typeof RenderModule.updateInspector === 'function') {
                            RenderModule.updateInspector(`📜 Квест сдан!`, `Награда: ${q.rewardGold} золотых.`, "npc");
                        }
                        return true;
                    } else {
                        // Квест активен, но не выполнен
                        RenderModule.log(`${npc.name}: "Ты еще не выполнил мое поручение. Ищи ${q.target.locationName}."`, "info");
                        return true;
                    }
                } 
                // Сценарий Б: Выдача нового сюжетного квеста
                else if (!alreadyDone) {
                    chainQuest.isActive = true;
                    chainQuest.originX = cityGx;
                    chainQuest.originY = cityGy;
                    activeQuests.push(chainQuest);
                    updateAbandonButton(true); // <--- ДОБАВИТЬ
                    RenderModule.log(`📜 СЮЖЕТНЫЙ КВЕСТ от ${npc.name}:`, "event");
                    RenderModule.log(chainQuest.briefing, "info");
                    
                    RenderModule.updateQuestBriefing(chainQuest);
                    
                    if (typeof RenderModule.updateInspector === 'function') {
                        RenderModule.updateInspector(`📜 Квест принят!`, chainQuest.briefing, "npc");
                    }
                    return true; 
                }
            } else {
                // Город из цепочки, но квест для него уже сдан или еще не время
                // Проверяем, был ли это предыдущий город цепочки (чтобы дать подсказку)
                const expectedIdx = QuestChainModule.getExpectedIndex();
                const cityIdx = QuestChainModule.getChainCities().findIndex(c => c.x === cityGx && c.y === cityGy);
                
                if (cityIdx < expectedIdx) {
                     RenderModule.log(`${npc.name}: "Спасибо за помощь, герой. Твой путь лежит дальше."`, "info");
                } else {
                     RenderModule.log(`${npc.name}: "Я чувствую, ты еще не готов к моей просьбе. Сначала заверши дела в других землях."`, "info");
                }
                return true; // Блокируем выдачу случайного квеста
            }
        }
    }

    // ==========================================
    // 2. СТАНДАРТНЫЕ СЛУЧАЙНЫЕ КВЕСТЫ (Fallback)
    // ==========================================
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
            updateAbandonButton(activeQuests.length > 0);
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
        updateAbandonButton(true); // <--- ДОБАВИТЬ
        RenderModule.log(`📜 НОВЫЙ КВЕСТ от ${npc.name}:`, "event");
        RenderModule.log(newQuest.briefing, "info");
        
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
    let isGlobalQuest = false; // Флаг для квестов без конкретной локации (BOUNTY/SCHOLAR)

    if (turnInQuest) {
        // Цель: Город, где взят квест
        if (turnInQuest.originX !== undefined && turnInQuest.originY !== undefined) {
            targetX = turnInQuest.originX;
            targetY = turnInQuest.originY;
            color = "#00ff00"; // Зеленый для награды
        } else {
            coordsEl.textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
            return;
        }
    } else if (activeQuest && activeQuest.target) {
        // Цель: Подземелье или локация квеста
        targetX = activeQuest.target.targetX;
        targetY = activeQuest.target.targetY;
        
        // Проверка: если это квест типа BOUNTY или SCHOLAR (координат нет)
        if (targetX === null || targetY === null) {
            isGlobalQuest = true;
        } else {
            // Обычные квесты с локацией
            if (activeQuest.type === 'HUNT') color = "#ff5555";
            else if (activeQuest.type === 'FETCH') color = "#ffd700";
            else color = "#58a6ff";
        }
    }

    if (isGlobalQuest) {
        // Для BOUNTY/SCHOLAR показываем статус выполнения вместо стрелки
        const label = activeQuest.type === 'BOUNTY' ? "🏹 Охота" : "📚 Чтение";
        coordsEl.innerHTML = `<span style="color:#58a6ff">${label}: ${activeQuest.progress}/${activeQuest.maxProgress}</span>`;
    } 
    else if (targetX !== undefined && targetY !== undefined) {
        // Для квестов с локацией рисуем стрелку
        const arrow = getQuestArrow(targetX, targetY, playerPos.x, playerPos.y);
        const label = turnInQuest ? "🏆 Награда" : "📜 Квест";
        
        coordsEl.innerHTML = `<span style="color:${color}">${label}: ${arrow}</span>`;
    } else {
        // Если квестов нет
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
            
            // 1. БЛОКИРОВКА ПРИ ЗАНЯТОСТИ ИЛИ СМЕРТИ
            if (busy || (player && player.hp <= 0)) return;

            // 2. 🎯 ПРОВЕРКА МАГАЗИНА (ПРИОРИТЕТ №1)
            // Если открыт магазин, любой тап по экрану обрабатывается как клик по интерфейсу магазина
            if (isShopOpen) {
                const touch = e.touches[0];
                handleShopClick(touch.clientX, touch.clientY);
                return; // Прерываем выполнение, чтобы не сработала логика движения
            }

            // 3. ЛОГИКА ДВИЖЕНИЯ (если магазин закрыт)
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            let dx = 0, dy = 0;
            const offsetX = touchX - centerX;
            const offsetY = touchY - centerY;
            
            // Определяем направление тапа относительно центра экрана
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
        isShopOpen = false;
        currentMerchantInv = null;
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
    // === ЗАГРУЗКА ГОРОДА ===
    function loadCityLevel(gx, gy, cityName) {
        enemies = []; 
        items = [];
        npcs = [];
        window.currentCityNpcs = [];
        explored.clear();
        isShopOpen = false; 
        currentMerchantInv = null;
        
        // 1. Генерируем город
        const startPos = MapModule.generateCity(gx, gy, 0);
        
        // 2. === ВАЖНОЕ ИСПРАВЛЕНИЕ: Сохраняем координаты магазина ===
        // MapModule.generateCity уже записывает их в window.currentShopCoords внутри себя,
        // но для надежности продублируем или убедимся, что они доступны.
        // Если в map.js вы используете window.currentShopCoords, то здесь все ок.
        // Но давайте сбросим флаг магазина, чтобы он точно открылся при входе.
        //isShopOpen = false; 
        //currentMerchantInv = null;

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

                // 2. ГАРАНТИРОВАННЫЙ СПАВН КНИГ ДЛЯ SCHOLAR/COLLECT
                if (q.isActive && !q.isCompleted && 
                   (q.type === 'SCHOLAR' || q.type === 'COLLECT') && 
                    q.target.itemType === 'book') {
                    const booksToSpawn = Math.min(q.maxProgress, 3); 
                    for(let i=0; i<booksToSpawn; i++) {
                        spawnScholarBook(q);
                    }
                }

                // 3. ПРОВЕРКА DIGGER (Глубинный разведчик)
                if (q.isActive && !q.isCompleted && q.type === 'DIGGER') {
                    // Проверяем координаты подземелья и глубину
                    // ВАЖНО: currentDepth начинается с 0, а targetDepth - это "Уровень" (с 1)
                    // Поэтому сравниваем (currentDepth + 1)
                    if (q.target.targetX === gx && 
                        q.target.targetY === gy && 
                        (currentDepth + 1) >= q.target.targetDepth) { 
                        
                        // Завершаем квест
                        q.progress = q.maxProgress;
                        q.isCompleted = true;
                        
                        RenderModule.log(`🏆 Квест выполнен: Вы достигли глубины ${currentDepth + 1} в ${dungeonName}!`, "event");
                        RenderModule.updateQuestBriefing(q); // Обновляем футер
                        updateQuestCompass(); // Переключаем стрелку на "Награда"
                    }
                }

                // 4. ПРОВЕРКА EXPLORE (Исследователь)
                // Для EXPLORE цель - просто добраться до определенного подземелья (любой глубины)
                if (q.isActive && !q.isCompleted && q.type === 'EXPLORE') {
                     if (q.target.targetX === gx && q.target.targetY === gy) {
                        q.progress = q.maxProgress;
                        q.isCompleted = true;
                        
                        RenderModule.log(`🏆 Квест выполнен: Вы исследовали ${dungeonName}!`, "event");
                        RenderModule.updateQuestBriefing(q);
                        updateQuestCompass();
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
                3,
                depth
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
        // === НОВОЕ: ОТЛАДКА ПРЕДМЕТОВ И ЗОЛОТА ===
        if (items.length > 0) {
            // Группируем предметы по типам для компактного вывода
            const itemSummary = items.reduce((acc, item) => {
                acc[item.name] = (acc[item.name] || 0) + 1;
                return acc;
            }, {});
            
            console.log(`🎒 [DEBUG] Уровень ${depth}: Сгенерировано предметов: ${items.length}`, itemSummary);
        } else {
            console.log(`🎒 [DEBUG] Уровень ${depth}: Предметы не сгенерированы.`);
        }
        
    }
     

    // === ГАРАНТИРОВАННЫЙ СПАВН КВЕСТОВОГО ПРЕДМЕТА ===
    // === ГАРАНТИРОВАННЫЙ СПАВН КВЕСТОВОГО ПРЕДМЕТА ===
// В game.js, замените функцию spawnQuestItem на эту обновленную версию:

    function spawnQuestItem(quest) {
        if (!quest || (quest.type !== 'FETCH' && quest.type !== 'COLLECT')) return;
        
        let template = null;
        let isUnique = false;

        // 1. ПРОВЕРКА НА УНИКАЛЬНЫЙ ПРЕДМЕТ (Приоритет №1)
        if (quest.target.uniqueId && typeof DataModule.UNIQUE_ITEM_TEMPLATES !== 'undefined') {
            template = DataModule.UNIQUE_ITEM_TEMPLATES.find(t => t.id === quest.target.uniqueId);
            if (template) isUnique = true;
        }
        
        // 2. ФОЛБЭК: Обычные предметы (если uniqueId нет или не найден)
        if (!template) {
            if (quest.target.itemName) {
                template = DataModule.ITEM_TYPES.find(t => t.baseName === quest.target.itemName);
            }
            if (!template && quest.target.itemType) {
                template = DataModule.ITEM_TYPES.find(t => t.type === quest.target.itemType);
            }
        }

        if (!template) {
            console.warn(`⚠️ Не удалось найти шаблон для квестового предмета: ${quest.target.itemName}`);
            return;
        }

        // 3. СОЗДАНИЕ ОБЪЕКТА ПРЕДМЕТА
        let questItem;
        if (isUnique) {
            // Ручное создание для сохранения уникальных статов и имени
            const baseTemplate = DataModule.ITEM_TYPES.find(t => t.type === template.baseType);
            const char = template.char || (baseTemplate ? baseTemplate.char : '?');
            
            // Вычисляем среднее значение стата для совместимости с UI
            const statVal = template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 
                            (template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0);

            questItem = {
                x: 0, y: 0,
                name: `${template.uniquePrefix} ${template.baseName}`,
                char: char,
                color: template.color || '#FFD700',
                type: template.baseType,
                val: statVal,
                isItem: true,
                isQuestItem: true,
                isUnique: true, // Флаг для рендера и логики
                uniqueAtk: template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0,
                uniqueDef: template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 0,
                desc: template.desc || ""
            };
        } else {
            // Стандартная процедурная генерация
            questItem = EntityModule.createItem(template, 0, 0, 1.0);
            questItem.name = `✨ ${questItem.name} (Квест)`;
            questItem.isQuestItem = true;
        }

        // 4. ПОИСК МЕСТА ДЛЯ СПАВНА (без изменений)
        let spawnPos = null;
        if (MapModule.stairsUp) {
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(MapModule.stairsUp, 5) : null;
        }
        if (!spawnPos && player) {
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(player, 3) : null;
        }
        if (!spawnPos) {
            spawnPos = MapModule.getRandomFloor ? MapModule.getRandomFloor(player) : {x: player.x+1, y: player.y};
        }

        if (spawnPos) {
            questItem.x = spawnPos.x;
            questItem.y = spawnPos.y;
            items.push(questItem);
            RenderModule.log(`🔮 Вы чувствуете присутствие артефакта "${questItem.name}" где-то рядом...`, "event");
        }
    }
    // === ГАРАНТИРОВАННЫЙ СПАВН КНИГИ ДЛЯ КВЕСТА SCHOLAR ===
    // === ГАРАНТИРОВАННЫЙ СПАВН КНИГИ ДЛЯ КВЕСТА SCHOLAR/COLLECT ===
    function spawnScholarBook(quest) {
        const bookTemplate = DataModule.ITEM_TYPES.find(t => t.type === 'book');
        if (!bookTemplate) return;

        const questBook = EntityModule.createItem(bookTemplate, 0, 0, 1.0);
        questBook.name = `✨ ${questBook.name} (Квест)`;
        questBook.isQuestItem = true;

        let spawnPos = null;
        
        // Стратегия: Ищем место рядом с игроком, но с небольшим случайным смещением,
        // чтобы несколько книг не спаунились в одной точке
        if (player) {
            // Пробуем найти место в радиусе 5 клеток от игрока
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(player, 5) : null;
            
            // Если не вышло или занято, пробуем чуть дальше
            if (!spawnPos || items.some(i => i.x === spawnPos.x && i.y === spawnPos.y)) {
                 spawnPos = MapModule.getRandomFloor ? MapModule.getRandomFloor(player) : null;
            }
        }

        if (spawnPos) {
            questBook.x = spawnPos.x;
            questBook.y = spawnPos.y;
            items.push(questBook);
            // Не спамим логом каждую книгу, иначе будет много текста при входе
            // RenderModule.log(`📚 Вы замечаете древний фолиант...`, "event");
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
        // === БЛОКИРОВКА ДВИЖЕНИЯ ПРИ ОТКРЫТОМ МАГАЗИНЕ ===
        if (isShopOpen) {
            // Если нажат Escape - закрываем магазин
            if (e.key === "Escape") {
                closeShop();
                return;
            }
            // Игнорируем все остальные клавиши (стрелки, пробел и т.д.)
            // Чтобы закрыть магазин, нужно кликнуть мышкой/тапом по кнопке "Выйти" или вне окна
            return; 
        }
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
        player.xp += amount;
        const xpNeeded = player.level * 50;
        if (player.xp >= xpNeeded) {
            player.level++;
            player.xp -= xpNeeded;
            player.maxHp = WorldCurveModule.getPlayerBaseHP(player.level);
            player.hp = player.maxHp;
        
            // Пересчёт с учётом бонусов
            const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
            const baseDef = WorldCurveModule.getPlayerBaseDef(player.level);
            player.atk = baseAtk + player.bonusAtk;
            player.def = baseDef + player.bonusDef;
        
            // Защита от отрицательных (на всякий случай)
            if (player.atk < 1) player.atk = 1;
            if (player.def < 0) player.def = 0;
        
            RenderModule.log(`🎉 УРОВЕНЬ ПОВЫШЕН!`, "event");
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
            // 3. Проверка квестов
            if (typeof QuestSystemModule !== 'undefined') {
                [...activeQuests].forEach(q => {
                    
                    // >>> СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ СЮЖЕТНОГО BOUNTY <<<
                    if (q.isChainQuest && q.type === 'BOUNTY' && !q.isCompleted) {
                        if (enemy.name === q.target.enemyName) {
                            q.progress++;
                            RenderModule.log(`🏹 Охота: ${q.target.enemyName} (${q.progress}/${q.maxProgress})`, "info");
                            
                            // >>> ДОБАВИТЬ ЭТУ СТРОКУ ДЛЯ ОБНОВЛЕНИЯ ФУТЕРА <<<
                            RenderModule.updateQuestBriefing(q); 
                            
                            if (q.progress >= q.maxProgress) {
                                q.isCompleted = true;
                                RenderModule.log(`🏆 Сюжетная охота завершена! Вернитесь в город за наградой.`, "event");
                                updateQuestCompass();
                            }
                            return; // Прерываем итерацию для этого квеста
                        }
                    }

                    // Стандартная проверка для остальных квестов
                    const eventData = {
                        type: 'kill',
                        enemyName: enemy.name,
                        locX: dungeonX,
                        locY: dungeonY
                    };

                    const progressUpdated = QuestSystemModule.checkProgress(q, eventData);

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

        // === ИСПРАВЛЕННАЯ ПРОВЕРКА ВХОДА В МАГАЗИН ===
        // Логика: Если ЦЕЛЕВАЯ клетка (куда мы хотим шагнуть) является магазином
        // И окно магазина сейчас ЗАКРЫТО -> Открываем окно и прерываем ход.
        // Игрок не двигается, так как мы делаем return.
        if (window.currentShopCoords && window.currentShopCoords.length > 0) {
            const isTargetShop = window.currentShopCoords.some(pos => pos.x === nx && pos.y === ny);
            
            if (isTargetShop && !isShopOpen) {
                openShop();
                return; 
            }
        }
        
        // ... далее стандартная проверка врагов и движение
        
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
            // ... (предыдущий код подбора)
            else {
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
                
                // === ИСПРАВЛЕНИЕ 1: ПОМЕТКА УНИКАЛЬНЫХ ПРЕДМЕТОВ ===
                if (typeof QuestSystemModule !== 'undefined') {
                    [...activeQuests].forEach(q => {
                        if (q.isCompleted) return;

                        // Проверка для FETCH и COLLECT
                        if (q.type === 'FETCH' || q.type === 'COLLECT') {
                            let isMatch = false;

                            // 1. Проверка по уникальному ID (для цепочных квестов)
                            if (q.target.uniqueId && item.uniqueId === q.target.uniqueId) {
                                isMatch = true;
                            } 
                            // 2. Стандартная проверка по типу и имени
                            else if ((item.type === q.target.itemType) && 
                                     (!q.target.itemName || item.name.includes(q.target.itemName))) {
                                isMatch = true;
                            }

                            if (isMatch) {
                                item.isQuestItem = true; // Помечаем предмет как квестовый
                                
                                if (q.type === 'FETCH') {
                                    q.progress = q.maxProgress;
                                    q.isCompleted = true;
                                    RenderModule.updateQuestBriefing(q);
                                    RenderModule.log(`📦 Это тот самый уникальный предмет!`, "info");
                                } else if (q.type === 'COLLECT') {
                                    // Для COLLECT используем стандартный checkProgress
                                    QuestSystemModule.checkProgress(q, { 
                                        type: 'pickup', 
                                        itemType: item.type,
                                        itemName: item.name,
                                        uniqueId: item.uniqueId, // Передаем ID
                                        locX: dungeonX,
                                        locY: dungeonY
                                    });
                                    RenderModule.log(`📦 Подобрано для квеста: ${item.name} (${q.progress}/${q.maxProgress})`, "info");
                                }
                                updateQuestCompass();
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

    // >>> ДОБАВИТЬ ЭТУ ФУНКЦИЮ <<<
    function getCompletedQuestIds() {
        return completedQuestIds;
    }

    // === ОТКАЗ ОТ КВЕСТА ===
    // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ КНОПКИ ОТКАЗА ===
    function updateAbandonButton(hasActiveQuest) {
        const btn = document.getElementById("btn-abandon-quest");
        if (btn) {
            btn.style.display = hasActiveQuest ? "block" : "none";
        }
    }

    // === ОТКАЗ ОТ КВЕСТА ===
    function abandonCurrentQuest() {
        if (activeQuests.length === 0) return;

        const quest = activeQuests[0];
        
        RenderModule.log("После долгих раздумий герой отрекся от задания.", "info");
        
        activeQuests = []; 
        
        RenderModule.updateQuestBriefing(null);
        updateQuestCompass();
        updateAbandonButton(false); // Скрываем кнопку
        
        if (typeof RenderModule.updateInspector === 'function') {
            RenderModule.updateInspector("Квест отменен", "Герой сменил свои планы.", "neutral");
        }
    }   
    return {
        init,
        getPlayer,
        getActiveQuests,
        getCompletedQuestIds,
        abandonCurrentQuest,
        exitToGlobal // >>> И ДОБАВИТЬ ЕЁ СЮДА <<<
    };
})();

window.onload = async () => {
    await GameModule.init();
};

