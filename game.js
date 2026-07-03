// =========================== Модуль игры (управление, ходы, загрузка уровней) ===========================
const GameModule = (function() {
    // === Состояние игры ===
    let player = null;
    let enemies = [];
    let items = [];
    let npcs = []; 
    let explored = new Set();
    let busy = false;
    let isReadingQuest = false; // Флаг: открыто ли окно сюжета
    let isTwineActive = false; // Флаг активности Twine-окна
    let globalFlags = {}; // <--- ДОБАВИТЬ ЭТУ СТРОКУ
    let tacticalState = null; // Хранит данные текущего боя { arena, playerUnit, enemyUnits, ... }
    window.currentTactic = 'hold'; // Текущая выбранная тактика игрока
    


    // === ПАМЯТЬ ПОДЗЕМЕЛИЙ ===
    let dungeonClearState = new Map(); 
    
    // === КВЕСТЫ ===
    let activeQuests = []; 
    let completedQuestIds = new Set();
    // === ПАМЯТЬ ГОРОДОВ, ВЫДАВШИХ ТЕКСТОВЫЕ КВЕСТЫ ===
    // Хранит ключи городов вида "gx_gy", чтобы не спавнить квестодателя повторно
    let textQuestCities = new Set(); 
    // В game.js, внутри GameModule, рядом с let activeQuests = [];
    let completedTextQuests = new Set(); // Храним имена файлов, которые игрок уже завершил

    // === Режимы ===
    window.gameMode = 'global';
    let entrancePos = null; 
    
    // === Подземельные координаты ===
    let dungeonX = 0;
    let dungeonY = 0;
    let currentDepth = 0;  
    let currentDungeonTypeName = null; 
    let currentDungeonFullName = null; 
    
    // === Глобальные координаты и магазин ===
    let currentLocData = null;
    let currentWorldTrend = null;
    let isShopOpen = false;
    let isInnOpen = false;
    let currentMerchantInv = null;

    // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ UI ===
    function toggleUI(isVisible) {
        const panels = document.querySelectorAll('.ui-panel');
        panels.forEach(panel => {
            if (isVisible) {
                panel.classList.remove('hidden-ui');
            } else {
                panel.classList.add('hidden-ui');
            }
        });
    }
    // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ ПАНЕЛЕЙ ПРИ ТАКТИЧЕСКОМ БОЮ ===
    function hideGlobalUI() {
        document.getElementById("header-panel").classList.add("hidden-ui");
        document.getElementById("minimap-panel").classList.add("hidden-ui");
        document.getElementById("quest-bar").classList.add("hidden-ui");
    }

    function showGlobalUI() {
        document.getElementById("header-panel").classList.remove("hidden-ui");
        document.getElementById("minimap-panel").classList.remove("hidden-ui");
        document.getElementById("quest-bar").classList.remove("hidden-ui");
    }
    // === ОКНО СЮЖЕТНОГО КВЕСТА ===
    // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ UI ===
    function toggleUI(isVisible) {
        // Находим все элементы с классом ui-panel
        const panels = document.querySelectorAll('.ui-panel');
        panels.forEach(panel => {
            if (isVisible) {
                panel.classList.remove('hidden-ui');
            } else {
                panel.classList.add('hidden-ui');
            }
        });
    }

    // === ОКНО СЮЖЕТНОГО КВЕСТА ===
    function openQuestWindow(quest, isCompleted) {
        isReadingQuest = true;
        toggleUI(false); // <--- СКРЫВАЕМ ПАНЕЛИ
    
        if (typeof RenderModule.drawQuestWindow === 'function') {
            RenderModule.drawQuestWindow(quest, isCompleted);
        } else {
            console.error("RenderModule.drawQuestWindow не найден!");
            closeQuestWindow();
        }
    }

    function closeQuestWindow() {
        isReadingQuest = false;
        window.questCloseButton = null;
        window.questClickAreas = null; // Очистка зон клика для пагинации
        toggleUI(true); // <--- ВОЗВРАЩАЕМ ПАНЕЛИ
        RenderModule.requestRedraw();
    }

    // === ОБРАБОТКА КЛИКА В ОКНЕ КВЕСТА ===
    function handleQuestClick(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // Проверка зон клика (кнопки пагинации и закрытия)
        if (window.questClickAreas) {
            for (const area of window.questClickAreas) {
                if (clickX >= area.x && clickX <= area.x + area.w && 
                    clickY >= area.y && clickY <= area.y + area.h) {
                    
                    if (area.action === 'close') {
                        closeQuestWindow();
                        return;
                    }
                    if (area.action === 'prev_q' || area.action === 'next_q') {
                        // Перерисовка окна с новой страницей
                        // Данные берутся из глобальной переменной, сохраненной при открытии
                        if (window.currentQuestWindowData) {
                            RenderModule.drawQuestWindow(window.currentQuestWindowData.quest, window.currentQuestWindowData.isCompleted);
                        }
                        return;
                    }
                }
            }
        }
        
        // Клик вне активных зон закрывает окно
        closeQuestWindow();
    }

    // === ПОСТОЯЛЫЙ ДВОР ===
    function openInn() {
        if (isInnOpen) return;
        isInnOpen = true;
        toggleUI(false);
        RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
        innLog("Вы вошли в Постоялый двор. Добро пожаловать!", "info");
    }

    function closeInn() {
        isInnOpen = false;
        window.innStatusMessage = "";
        toggleUI(true);
        RenderModule.requestRedraw();
    }

    function handleInnClick(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        if (window.innClickAreas) {
            for (const area of window.innClickAreas) {
                if (clickX >= area.x && clickX <= area.x + area.w && 
                    clickY >= area.y && clickY <= area.y + area.h) {
                    
                    if (area.action === 'exit') { closeInn(); return; }
                    if (area.action === 'rest') { innAction('rest'); return; }
                    if (area.action === 'rumor') { innAction('rumor'); return; }
                    if (area.action === 'dice') { innAction('dice'); return; }
                }
            }
        }
    }

    function innLog(msg, type) {
        RenderModule.log(msg, type);
        window.innStatusMessage = msg;
        if (player) RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
    }

    function innAction(actionType) {
        if (!player) return;
        
        if (actionType === 'rest') {
            const cost = 20;
            if (player.gold >= cost) {
                player.gold -= cost;
                player.stamina = player.maxStamina;
                innLog(`Вы сняли комнату за ${cost} золотых. Выносливость восстановлена!`, "loot");
            } else {
                innLog("Недостаточно золота для ночлега!", "combat");
            }
        } 
        else if (actionType === 'rumor') {
            if (typeof LoreModule !== 'undefined' && LoreModule.getRumor) {
                const rumor = LoreModule.getRumor();
                innLog(`Трактирщик шепчет: "${rumor}"`, "lore");
            }
        } 
        else if (actionType === 'dice') {
            const bet = 10;
            if (player.gold >= bet) {
                player.gold -= bet;
                const roll = Math.random();
                if (roll < 0.45) {
                    innLog("Вы проиграли в кости. Трактирщик забирает ваше золото.", "combat");
                } else if (roll < 0.90) {
                    player.gold += bet * 2;
                    innLog(`Вы выиграли! Получено ${bet * 2} золотых.`, "loot");
                } else {
                    player.gold += bet * 5;
                    innLog(`ДЖЕКПОТ! Вы выиграли ${bet * 5} золотых!`, "event");
                }
            } else {
                innLog("У вас нет даже 10 золотых, чтобы поставить!", "combat");
            }
        }

        // В функции innAction добавьте новый блок:

        else if (actionType === 'hire') {
            const cost = TacticalDataModule.UNIT_COST;
            if (player.gold >= cost) {
                player.gold -= cost;
        
                // === НОВОЕ: Добавляем флаг наличия армии ===
                if (!player.hasArmy) {
                    player.hasArmy = true;
                    player.armyUnits = [];
                }
        
                // Добавляем случайный отряд
                const unitType = TacticalArmyModule.getRandomUnitType();
                const count = Math.floor(5 + Math.random() * 10);
                player.armyUnits.push({
                    type: unitType,
                    count: count,
                    hp: unitType.hp * count,
                    maxHp: unitType.hp * count
                });
        
                innLog(`Вы наняли отряд "${unitType.name}" (${count} юнитов) за ${cost} золотых!`, "loot");
            } else {
                innLog(`Недостаточно золота! Нужно ${cost} золотых.`, "combat");
            }
        }
        
        RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
    }
    
    // === МАГАЗИН ===
    // === МАГАЗИН ===
    function openShop() {
        if (isShopOpen) return;
    
        const depth = currentDepth > 0 ? currentDepth : 1;
        const merchantGold = 500 + (depth * 100);
    
        currentMerchantInv = EntityModule.createMerchantInventory(depth, merchantGold);
        isShopOpen = true;
    
        toggleUI(false); // <--- СКРЫВАЕМ ПАНЕЛИ
    
        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        RenderModule.log("Вы вошли в лавку. Добро пожаловать!", "info");
    }

    function closeShop() {
        isShopOpen = false;
        currentMerchantInv = null;
        toggleUI(true); // <--- ВОЗВРАЩАЕМ ПАНЕЛИ
        RenderModule.requestRedraw();
        RenderModule.log("Вы покинули лавку.", "info");
    }

    function handleShopClick(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // 1. Кнопка выхода
        if (window.shopExitButton) {
            const btn = window.shopExitButton;
            if (clickX >= btn.x && clickX <= btn.x + btn.w && 
                clickY >= btn.y && clickY <= btn.y + btn.h) {
                closeShop();
                return;
            }
        }

        // 2. Навигация и товары
        if (window.shopClickAreas) {
            for (const area of window.shopClickAreas) {
                if (clickX >= area.x && clickX <= area.x + area.w &&
                    clickY >= area.y && clickY <= area.y + area.h) {
                    
                    if (area.action.startsWith('prev_') || area.action.startsWith('next_')) {
                        if (area.action === 'prev_m') window.shopPageMerchant--;
                        if (area.action === 'next_m') window.shopPageMerchant++;
                        if (area.action === 'prev_p') window.shopPagePlayer--;
                        if (area.action === 'next_p') window.shopPagePlayer++;
                        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
                        return;
                    }
                    
                    if (area.action === 'buy') { buyItem(area.index); return; }
                    if (area.action === 'sell') { sellItem(area.index); return; }
                }
            }
        }

        // 3. Клик вне окна
        const winW = canvas.width * 0.65; // Соответствует новому размеру в render.js
        const winH = canvas.height * 0.60;
        const winX = (canvas.width - winW) / 2;
        const winY = (canvas.height - winH) / 2;

        if (clickX < winX || clickX > winX + winW || clickY < winY || clickY > winY + winH) {
            closeShop();
        }
    }

    function buyItem(index) {
        if (!currentMerchantInv || !player) return;
        const item = currentMerchantInv.items[index];
        if (!item) return;

        if (player.gold >= item.price) {
            player.gold -= item.price;
            currentMerchantInv.gold += item.price;
            currentMerchantInv.items.splice(index, 1);
            player.inventory.push(item);
            
            window.shopPageMerchant = 0;
            window.shopPagePlayer = 0;
            
            RenderModule.log(`Куплено: ${item.name} за ${item.price} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        } else {
            RenderModule.log("Недостаточно золота!", "combat");
        }
    }

    function sellItem(index) {
        if (!player) return;
        const item = player.inventory[index];
        if (!item) return;
        if (item.isQuestItem) {
            RenderModule.log("Это квестовый предмет, его нельзя продать!", "combat");
            return;
        }

        const sellPrice = Math.floor(item.price ? item.price * 0.5 : item.val * 2);
        if (currentMerchantInv.gold >= sellPrice) {
            player.gold += sellPrice;
            currentMerchantInv.gold -= sellPrice;
            player.inventory.splice(index, 1);
            
            const buyBackPrice = Math.floor(sellPrice * 1.2); 
            item.price = buyBackPrice;
            currentMerchantInv.items.unshift(item);
            
            window.shopPageMerchant = 0;
            window.shopPagePlayer = 0;
            
            RenderModule.log(`Продано: ${item.name} за ${sellPrice} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        } else {
            RenderModule.log("У торговца недостаточно золота!", "combat");
        }
    }

    // === ИНИЦИАЛИЗАЦИЯ ===
    async function init() {
        try {
            if (typeof RenderModule === 'undefined') throw new Error("RenderModule не загружен");
            await RenderModule.init();
            RenderModule.setRedrawCallback(renderFrame);
        } catch (e) {
            console.error("Критическая ошибка при инициализации: ", e);
            document.body.innerHTML = `<div style="color:red; padding:20px;">Ошибка загрузки игры: ${e.message}</div>`;
            return;
        }

        window.gameMode = 'global';
        
        // === ИСПРАВЛЕНИЕ: Объявляем переменную здесь, чтобы она была видна ниже ===
        let startPos = null; 

        if (typeof GlobalMapModule !== 'undefined') {
            // Теперь мы просто присваиваем значение существующей переменной
            startPos = GlobalMapModule.initSafeStart(1, 1, 3);
            console.log("[SYSTEM]Стартовая позиция: ${startPos.x}, ${startPos.y}", "info");

            if (typeof QuestChainModule !== 'undefined') {
                QuestChainModule.init(startPos.x, startPos.y);
                console.log("[SYSTEM]📜 Сюжетная линия мира сгенерирована.", "info");
            }
        } else {
            RenderModule.log("Ошибка: GlobalMapModule не найден", "combat");
            return;
        }

        // === ИСПРАВЛЕНИЕ 1: Создаем игрока здесь, если он еще не создан ===
        if (!player && startPos) {
            player = EntityModule.createPlayer(startPos.x, startPos.y);
            globalFlags['player_global_scale'] = true;
            // Обновляем UI сразу после создания, чтобы статы появились
            RenderModule.updateUI(player, { fullName: "Глобальная карта", themeName: "Поверхность" }, null);
        }        
        
        renderGlobalMap();
        
        window.addEventListener("keydown", (e) => handleInput(e));
        addTouchControls();

        const mapContainer = document.getElementById("map-container");
        if (mapContainer) {
            mapContainer.addEventListener("mousedown", (e) => {
                if (!isMobileDevice()) {
                    handleCanvasClick(e.clientX, e.clientY);
                }
            });
        }
        
        RenderModule.log("Игра загружена. Режим: ГЛОБАЛЬНАЯ КАРТА", "info");
        updateAbandonButton(false);
    }

    // === ОБРАБОТКА ВВОДА (КЛИКИ И КЛАВИШИ) ===
    function handleCanvasClick(clientX, clientY) {
        // Приоритет 1: Окно квеста
        if (isReadingQuest) {
            handleQuestClick(clientX, clientY);
            return;
        }
        // Приоритет 2: Магазин
        if (isShopOpen) {
            handleShopClick(clientX, clientY);
            return;
        }
        if (isInnOpen) { handleInnClick(clientX, clientY); return; }
        
        // Приоритет 3: Осмотр карты (только в подземелье)
        if (window.gameMode === 'dungeon') {
            handleMapClick(clientX, clientY);
        }
    }

    // === ОБРАБОТКА ВВОДА (КЛИКИ И КЛАВИШИ) ===
    function handleInput(e) {
        // 0. БЛОКИРОВКА ПРИ СМЕРТИ (Глобальная проверка)
        if (player && player.hp <= 0) {
             return; 
        }    

        // 1. ПРОВЕРКА ОКНА СЮЖЕТА (Приоритет №0)
        if (isReadingQuest) {
            if (e.key === "Escape") closeQuestWindow();
            return; 
        }

        // 2. ПРОВЕРКА ПОСТОЯЛОГО ДВОРА (Приоритет №1)
        if (isInnOpen) {
            if (e.key === "Escape") closeInn();
            return; 
        }

        // 3. ПРОВЕРКА МАГАЗИНА (Приоритет №2)
        if (isShopOpen) {
            if (e.key === "Escape") closeShop();
            return; 
        }

        // 4. ЧИТ-КОД: Восстановление здоровья (Enter)
        if (e.key === "Enter") {
            e.preventDefault();
            if (player && player.hp > 0) {
                const healAmount = 100;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                player.gold += 1000;
                RenderModule.log(`💊 ЧИТ: Восстановлено ${healAmount} HP!`, "event");
                RenderModule.log(`💰 ЧИТ: Получено 1000 золотых!`, "loot");
                RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            }
            return;
        }

        // Временная клавиша для теста Twine
        if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            GameModule.openTwineQuest('Quack of Duckness.html');
            return;
        }

        // === НОВОЕ: ТАКТИЧЕСКИЙ РЕЖИМ (Этап 3: Управление, ИИ и Боевка) ===
        if (window.gameMode === 'tactical') {
            e.preventDefault(); // Блокируем скролл страницы стрелками

            // А. Обработка выбора тактики клавишами 1-5
            if (e.key >= '1' && e.key <= '5') {
                const tacticKey = e.key;
                const tactics = Object.values(TacticalDataModule.PLAYER_TACTICS);
                const selected = tactics.find(t => t.key === tacticKey);
                
                if (selected) {
                    window.currentTactic = selected.id;
                    RenderModule.log(`Тактика изменена: ${selected.name}`, "info");
                    
                    // Перерисовываем поле боя, чтобы обновить меню
                    renderFrame(); 
                }
                return; // Завершаем обработку, так как это не ход
            }

            // Б. Обработка побега (клавиша F или 0)
            if (e.key === 'f' || e.key === 'F' || e.key === '0') {
                 // Меняем тактику на побег и сразу делаем ход
                 window.currentTactic = 'flee';
                 TacticalBattleModule.processBattleTurn(0, 0, 'flee');
                 return;
            }

            // В. Обработка движения/атаки/пропуска хода
            let dx = 0, dy = 0;
            let isAction = false;

            if (e.key === "ArrowUp") { dy = -1; isAction = true; }
            if (e.key === "ArrowDown") { dy = 1; isAction = true; }
            if (e.key === "ArrowLeft") { dx = -1; isAction = true; }
            if (e.key === "ArrowRight") { dx = 1; isAction = true; }
            if (e.key === " ") { isAction = true; } // Пропуск хода / Стоять на месте

            if (isAction) {
                // Передаем управление в модуль тактического боя
                TacticalBattleModule.processBattleTurn(dx, dy, window.currentTactic);
            }
            
            return; 
        }

        // 5. БЛОКИРОВКА ПРИ ЗАНЯТОСТИ ИЛИ СМЕРТИ (для обычных режимов)
        if (busy || (player && player.hp <= 0)) return;
        
        let dx = 0, dy = 0;
        
        // Определение направления
        if (e.key === "ArrowUp") dy = -1;
        if (e.key === "ArrowDown") dy = 1;
        if (e.key === "ArrowLeft") dx = -1;
        if (e.key === "ArrowRight") dx = 1;
        
        // Обработка движения или пропуска хода (Space)
        if (dx !== 0 || dy !== 0 || e.key === " ") {
            e.preventDefault();
            
            if (window.gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }
        }
    }



    // === ЛОГИКА ВЫДАЧИ КВЕСТОВ (Интеграция с QuestChainModule и Окном Сюжета) ===
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

                    // --- СЦЕНАРИЙ А: СДАЧА СЮЖЕТНОГО КВЕСТА ---
                    if (alreadyActive) {
                        const q = activeQuests.find(q => q.id === questId);
                        
                        if (q.isCompleted && !q.isTurnedIn) {
                            // 1. Очистка инвентаря от квестовых предметов
                            if (q.type === 'FETCH' || q.type === 'COLLECT') {
                                player.inventory = player.inventory.filter(item => {
                                    // Удаляем предмет, если он помечен как квестовый И совпадает с целью
                                    if (item.isQuestItem) {
                                        const isTypeMatch = (item.type === q.target.itemType);
                                        const isNameMatch = (!q.target.itemName || item.name.includes(q.target.itemName));
                                        
                                        // Для COLLECT можно добавить проверку uniqueId, если она есть
                                        const isUniqueMatch = q.target.uniqueId ? (item.uniqueId === q.target.uniqueId) : true;

                                        // Если это нужный предмет - удаляем его (возвращаем false)
                                        if (isTypeMatch && isNameMatch && isUniqueMatch) {
                                            return false; 
                                        }
                                    }
                                    return true; // Оставляем остальные предметы
                                });
                            }

                            // 2. Выдача награды
                            player.gold += q.rewardGold;
                            q.isTurnedIn = true; 

                            // 3. Обновление UI и логов
                            RenderModule.log(`🏆 СЮЖЕТНЫЙ КВЕСТ СДАН! Получено: ${q.rewardGold} золотых.`, "loot");
                            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
                            RenderModule.updateQuestBriefing(null); 

                            // 4. Удаление из активных и добавление в выполненные
                            activeQuests = activeQuests.filter(aq => aq.id !== questId);
                            completedQuestIds.add(questId);
                            updateAbandonButton(activeQuests.length > 0);
                            
                            // 5. Прогресс цепочки
                            QuestChainModule.completeCurrentQuest();
                            updateQuestCompass();

                            // 6. ОТКРЫТИЕ ОКНА СЮЖЕТА (Сдача)
                            if (typeof openQuestWindow === 'function') {
                                openQuestWindow(q, true);
                            } else {
                                // Фолбэк, если окно еще не подключено
                                if (q.turnInText) {
                                    RenderModule.log(`🗣️ ${npc.name}: "${q.turnInText}"`, "event");
                                }
                            }
                            
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
                    
                    // --- СЦЕНАРИЙ Б: ВЫДАЧА НОВОГО СЮЖЕТНОГО КВЕСТА ---
                    else if (!alreadyDone) {
                        chainQuest.isActive = true;
                        chainQuest.originX = cityGx;
                        chainQuest.originY = cityGy;
                        activeQuests.push(chainQuest);
                        updateAbandonButton(true);
                        
                        RenderModule.log(`📜 СЮЖЕТНЫЙ КВЕСТ от ${npc.name}:`, "event");
                        RenderModule.log(chainQuest.briefing, "info");
                        RenderModule.updateQuestBriefing(chainQuest);
                        
                        if (typeof RenderModule.updateInspector === 'function') {
                            RenderModule.updateInspector(`📜 Квест принят!`, chainQuest.briefing, "npc");
                        }

                        // ОТКРЫТИЕ ОКНА СЮЖЕТА (Взятие)
                        if (typeof openQuestWindow === 'function') {
                            openQuestWindow(chainQuest, false);
                        }
                        
                        return true; 
                    }
                } else {
                    // Город из цепочки, но квест для него уже сдан или еще не время
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
    if (window.gameMode !== 'global') {
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
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) return;

        // Удаляем старый слушатель, если он был, чтобы не дублировать события
        canvas.ontouchstart = null; 

        canvas.addEventListener("touchstart", (e) => {
            e.preventDefault();
            
            // Получаем координаты тапа один раз для всех проверок
            const touch = e.touches[0];
            const clientX = touch.clientX;
            const clientY = touch.clientY;

            // 0. ПРОВЕРКА ОКНА СЮЖЕТА (Приоритет №0)
            if (isReadingQuest) {
                handleQuestClick(clientX, clientY);
                return; 
            }

            // 1. ПРОВЕРКА ПОСТОЯЛОГО ДВОРА (Приоритет №1)
            if (isInnOpen) {
                handleInnClick(clientX, clientY);
                return; 
            }

            // 2. ПРОВЕРКА МАГАЗИНА (Приоритет №2)
            if (isShopOpen) {
                handleShopClick(clientX, clientY);
                return; 
            }

            // === НОВОЕ: ТАКТИЧЕСКИЙ РЕЖИМ (Приоритет №3) ===
            if (window.gameMode === 'tactical') {
                handleTacticalTouch(clientX, clientY);
                return;
            }

            // 3. БЛОКИРОВКА ПРИ ЗАНЯТОСТИ ИЛИ СМЕРТИ (для обычных режимов)
            if (busy || (player && player.hp <= 0)) return;

            // 4. СТАНДАРТНОЕ ДВИЖЕНИЕ (Подземелье / Глобальная карта)
            const rect = canvas.getBoundingClientRect();
            const touchX = clientX - rect.left;
            const touchY = clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            let dx = 0, dy = 0;
            const offsetX = touchX - centerX;
            const offsetY = touchY - centerY;
            
            // Если тап очень близко к центру (радиус 20px), считаем это пропуском хода
            if (Math.abs(offsetX) < 20 && Math.abs(offsetY) < 20) {
                dx = 0; dy = 0;
            } else if (Math.abs(offsetX) > Math.abs(offsetY)) {
                dx = offsetX > 0 ? 1 : -1;
            } else {
                dy = offsetY > 0 ? 1 : -1;
            }
            
            if (window.gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }
            
        }, { passive: false });
        
        if (isMobileDevice()) {
            RenderModule.log("💡 Коснитесь части экрана для движения", "info");
        }
    }    

    // === ОБРАБОТКА ТАПОВ В ТАКТИЧЕСКОМ БОЮ (ОБНОВЛЕННАЯ) ===
    function handleTacticalTouch(clientX, clientY) {
         const canvas = document.querySelector("#map-container canvas");
         if (!canvas) return;
         
         const rect = canvas.getBoundingClientRect();
         
         // 1. Проверяем, попал ли тап в панель Инвентаря (теперь это Меню Тактики)
         // Находим элемент инвентаря в DOM
         const invPanel = document.getElementById("inventory-panel");
         if (invPanel) {
             const invRect = invPanel.getBoundingClientRect();
             
             // Если тап внутри прямоугольника панели инвентаря
             if (clientX >= invRect.left && clientX <= invRect.right &&
                 clientY >= invRect.top && clientY <= invRect.bottom) {
                 
                 // Вычисляем относительные координаты внутри панели
                 const panelY = clientY - invRect.top;
                 const panelHeight = invRect.height;
                 
                 // Панель делится на 5 зон по вертикали (или можно по клику на конкретный div)
                 // Но проще всего эмулировать нажатие клавиш 1-5 в зависимости от высоты тапа
                 const sectionHeight = panelHeight / 5;
                 const index = Math.floor(panelY / sectionHeight);
                 
                 const keys = ['1', '2', '3', '4', '5'];
                 if (keys[index]) {
                     handleInput({ key: keys[index] });
                 }
                 return; // Тап обработан как смена тактики
             }
         }

         // 2. Тап по полю боя -> Движение/Атака героя
         // Координаты относительно Canvas
         const clickX = (clientX - rect.left);
         const clickY = (clientY - rect.top);

         // Вычисляем смещение камеры
         const cam = RenderModule.getCameraOffset(tacticalState.playerUnit);
         const tileW = TilesetRenderer.TILE_SIZE; // 16px
         const tileH = TilesetRenderer.TILE_SIZE;
         
         // Учитываем центрирование арены (из tactical_render.js)
         const arenaPixelWidth = tacticalState.arena.width * tileW;
         const arenaPixelHeight = tacticalState.arena.height * tileH;
         const offsetX = Math.floor((rect.width - arenaPixelWidth) / 2);
         const offsetY = Math.floor((rect.height - arenaPixelHeight) / 2);
         
         // Координаты внутри арены (в тайлах)
         const arenaX = Math.floor((clickX - offsetX) / tileW);
         const arenaY = Math.floor((clickY - offsetY) / tileH);
         
         // Разница между позицией игрока и тапом
         const dx = arenaX - tacticalState.playerUnit.x;
         const dy = arenaY - tacticalState.playerUnit.y;
         
         // Разрешаем движение только на 1 клетку (или атаку, если враг рядом)
         if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
              TacticalBattleModule.processBattleTurn(Math.sign(dx), Math.sign(dy), window.currentTactic);
         }
    }

    
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // === ГЛОБАЛЬНЫЙ РЕЖИМ ===
    // === ГЛОБАЛЬНЫЙ РЕЖИМ ===
    function processGlobalTurn(dx, dy) {
        if (busy) return;
        if (dx === 0 && dy === 0) return;
        
        // === Проверка выносливости ПЕРЕД движением ===
        if (player && player.stamina <= 0) {
            RenderModule.log("Вы умерли от усталости. Нажмите F5 чтобы начать сначала.", "combat");
            busy = true;
            return;
        }

        if (GlobalMapModule.tryMove(dx, dy)) {
            // === Уменьшаем выносливость при успешном шаге ===
            if (player) {
                const oldStamina = player.stamina;
                player.stamina = Math.max(0, player.stamina - 1);
                
                // Предупреждение при достижении 20/100
                if (oldStamina > 20 && player.stamina === 20) {
                    RenderModule.log("У вас иссякают силы, немедленно найдите постоялый двор или зелье отдыха!", "combat");
                }
                
                // Проверка смерти ПОСЛЕ шага
                if (player.stamina <= 0) {
                    RenderModule.log("Вы сделали последний шаг... Вы умерли от усталости. Нажмите F5 чтобы начать сначала.", "combat");
                    busy = true;
                    renderGlobalMap();
                    return;
                }
            }
            
            const playerPos = GlobalMapModule.getPlayerPosition();
            const poi = GlobalMapModule.getPOI(playerPos.x, playerPos.y);
            
            if (poi) {
                // === НОВАЯ ЛОГИКА ДЛЯ ГЛОБАЛЬНЫХ СВИТКОВ ===
                if (poi.type === 'global_scroll') {
                    // Проверяем, не пройден ли уже этот квест
                    if (GameModule.isTextQuestCompleted(poi.questFile)) {
                        // Если да, то удаляем "мусорный" POI из кэша и идем дальше
                        GlobalMapModule.removePOI(playerPos.x, playerPos.y);
                        RenderModule.log("📜 Здесь больше нет ничего интересного.", "info");
                        renderGlobalMap(); // Перерисовываем, чтобы свиток исчез
                    } else {
                        // Запускаем Twine-квест (флаг true означает, что это глобальный квест)
                        GameModule.openTwineQuest(poi.questFile, true);
                    }
                    return; // Прерываем ход, чтобы не двигаться дальше и не вызывать enterPOI
                }
                
                // Стандартный вход в город или подземелье
                enterPOI(poi);
                return;
            }
            // В функции processGlobalTurn добавьте после проверки POI:

            // Внутри processGlobalTurn, после проверки POI:

            // === ПРОВЕРКА СТОЛКНОВЕНИЯ С ВРАЖЕСКОЙ АРМИЕЙ ===
            if (typeof GlobalMapModule.getArmyAt === 'function') {
                const enemyArmy = GlobalMapModule.getArmyAt(playerPos.x, playerPos.y);
                if (enemyArmy) {
                    RenderModule.log(`⚔️ Вы столкнулись с вражеской армией!`, "combat");
        
                    // ЗАПУСК ТАКТИЧЕСКОГО БОЯ
                    initTacticalBattle(enemyArmy);
        
                    return; // Прерываем глобальный ход
                }
            }

            // === ОБНОВЛЕНИЕ ПОЗИЦИЙ АРМИЙ ===
            if (typeof GlobalMapModule.updateAllArmies === 'function') {
                GlobalMapModule.updateAllArmies(playerPos.x, playerPos.y);
            }
            // Проверка квестов типа EXPLORE/FETCH при движении
            if (typeof QuestSystemModule !== 'undefined') {
                activeQuests.forEach(q => {
                    if (QuestSystemModule.checkProgress(q, { type: 'move', x: playerPos.x, y: playerPos.y })) {
                         RenderModule.log(`📍 Квест выполнен: Вы достигли ${q.target.locationName}!`, "event");
                         
                         q.isTurnedIn = false; 
                         RenderModule.updateQuestBriefing(q);
                        
                         updateQuestCompass();
                    }
                });
            }

            updateQuestCompass();
            renderGlobalMap();
        } else {
            RenderModule.log("Путь преграждают горы или вода!", "combat");
        }
    }

    function initTacticalBattle(enemyArmyData) {
        console.log("🚀 [Tactical] Инициализация боя...");
        window.gameMode = 'tactical';
        busy = true; 
        
        if (typeof hideGlobalUI === 'function') hideGlobalUI();
        
        const globalPos = GlobalMapModule.getPlayerPosition();
        const terrainType = GlobalMapModule.getTileType(globalPos.x, globalPos.y);
        const arena = TacticalMapModule.generateArena(terrainType);

        // 1. Создаем юнита-представителя игрока (используем реальные статы из player)
        const playerUnit = {
            x: arena.startPosPlayer.x,
            y: arena.startPosPlayer.y,
            char: '@',
            color: '#00ff00',
            hp: player.hp,           // Текущее HP
            maxHp: player.maxHp,     // Максимальное HP
            atk: player.atk,         // Атака с учетом экипировки и баффов
            def: player.def,         // Защита с учетом экипировки и баффов
            name: 'Герой',
            isPlayer: true
        };

        // 2. Разворачиваем армию игрока (если есть)
        let playerArmyUnits = [];
        if (player.hasArmy && player.armyUnits && player.armyUnits.length > 0) {
            player.armyUnits.forEach((armyUnit, index) => {
                const xOffset = 1 + Math.floor(index / 5);
                const yOffset = (index % 2 === 0) ? 1 : -1;
                let unitX = arena.startPosPlayer.x + xOffset;
                let unitY = arena.startPosPlayer.y + (index % 5) * yOffset;
                
                unitX = Math.max(0, Math.min(arena.width - 1, unitX));
                unitY = Math.max(0, Math.min(arena.height - 1, unitY));

                playerArmyUnits.push({
                    ...armyUnit,
                    x: unitX,
                    y: unitY,
                    maxHp: armyUnit.hp,
                    char: armyUnit.type.sprite || '?', 
                    color: '#44ff44',
                    sprite: armyUnit.type.sprite || '?',
                    type: armyUnit.type.type || 'melee',
                    isPlayerSide: true,
                    atk: armyUnit.type.atk,
                    def: armyUnit.type.def,
                    range: armyUnit.type.range || 1,
                    name: armyUnit.type.name
                });
            });
        }

        // 3. Разворачиваем вражескую армию (ИСПРАВЛЕННАЯ ЛОГИКА HP)
        const enemyUnits = [];
        let startX = arena.startPosEnemy.x;
        let startY = arena.startPosEnemy.y;
        
        // Получаем множитель сложности для текущих координат
        const difficultyMult = WorldCurveModule.getEnemyMultiplier(globalPos.x, globalPos.y);

        enemyArmyData.units.forEach((armyUnit, index) => {
            const xOffset = Math.floor(index / 5);
            const yOffset = (index % 2 === 0) ? 1 : -1;
            let unitX = startX - xOffset; 
            let unitY = startY + (index % 5) * yOffset;
            
            unitX = Math.max(0, Math.min(arena.width - 1, unitX));
            unitY = Math.max(0, Math.min(arena.height - 1, unitY));

            // ВАЖНО: Берем базовые статы из типа юнита, а не из armyUnit (где hp умножено на count)
            const baseHp = armyUnit.type.hp; 
            const baseAtk = armyUnit.type.atk;
            const baseDef = armyUnit.type.def;

            // Масштабируем под уровень мира
            const scaledHp = Math.max(1, Math.floor(baseHp * difficultyMult));
            const scaledAtk = Math.max(1, Math.floor(baseAtk * Math.sqrt(difficultyMult)));
            const scaledDef = Math.max(0, Math.floor(baseDef * Math.pow(difficultyMult, 0.3)));

            enemyUnits.push({
                ...armyUnit, // Копируем остальные поля
                x: unitX,
                y: unitY,
                hp: scaledHp,      // Теперь HP будет около 20-40, а не 200
                maxHp: scaledHp,
                atk: scaledAtk,
                def: scaledDef,
                char: armyUnit.type.sprite || '?', 
                color: '#ff5555',
                sprite: armyUnit.type.sprite || '?',
                type: armyUnit.type.type || 'melee',
                isPlayerSide: false,
                name: armyUnit.type.name || 'Враг',
                range: armyUnit.type.range || 1
            });
        });

        // 4. Сохраняем состояние боя
        tacticalState = {
            arena: arena,
            playerUnit: playerUnit,
            playerArmy: playerArmyUnits,
            enemyUnits: enemyUnits,
            originalGlobalPos: { ...globalPos },
            enemyArmyId: enemyArmyData.id,
            turnCount: 0
        };
        
        window.currentTactic = 'hold';
        busy = false; 
        
        RenderModule.log(`⚔️ ТАКТИЧЕСКИЙ БОЙ НАЧАЛСЯ!`, "combat");
        RenderModule.updateUI(player, null, null); 
        renderFrame();
    }
    // === ЗАВЕРШЕНИЕ ТАКТИЧЕСКОГО БОЯ ===
    function endTacticalBattle(victory) {
        // 1. Синхронизация состояния игрока перед выходом
        if (tacticalState && tacticalState.playerUnit) {
            const realPlayer = GameModule.getPlayer();
            if (realPlayer) {
                // Переносим HP из тактической копии в реального игрока
                realPlayer.hp = tacticalState.playerUnit.hp;
                
                // Если игрок умер в бою — конец игры
                if (realPlayer.hp <= 0) {
                    window.gameMode = 'global';
                    if (typeof showGlobalUI === 'function') showGlobalUI();
                    renderGlobalMap();
                    RenderModule.log("💀 Вы погибли в тактическом бою. F5 для рестарта.", "combat");
                    busy = true; // Блокируем управление навсегда
                    return;
                }
            }
        }

        // 2. Возвращаем режим игры
        window.gameMode = 'global';
        
        // 3. Показываем скрытые UI-панели
        if (typeof showGlobalUI === 'function') {
            showGlobalUI();
        } else {
            document.getElementById("header-panel").classList.remove("hidden-ui");
            document.getElementById("minimap-panel").classList.remove("hidden-ui");
            document.getElementById("quest-bar").classList.remove("hidden-ui");
        }

        // 4. Награды и удаление армии
        if (victory && tacticalState && tacticalState.enemyArmyId) {
            // Удаляем армию с карты
            if (typeof GlobalMapModule.removeArmy === 'function') {
                GlobalMapModule.removeArmy(tacticalState.enemyArmyId);
            }
            
            // Начисляем золото за победу
            const rewardGold = 50 + (tacticalState.enemyUnits.length * 10);
            const realPlayer = GameModule.getPlayer();
            if (realPlayer) {
                realPlayer.gold += rewardGold;
                RenderModule.log(`🏆 Победа! Получено ${rewardGold} золотых.`, "loot");
            }
        } else if (!victory) {
             RenderModule.log("💨 Вы сбежали с поля боя, сохранив жизнь.", "info");
        }

        // 5. Очищаем состояние боя
        tacticalState = null;
        busy = false;

        // 6. Перерисовываем глобальную карту (это также вызовет updateUI и обновит статы/компас)
        renderGlobalMap();
    }
    
    function enterPOI(poi) {
        busy = true;
        entrancePos = GlobalMapModule.getPlayerPosition();
        window.gameMode = 'dungeon';
        
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
        window.gameMode = 'global';
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
        if (window.gameMode === 'dungeon' && currentDepth >= 0) {
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
            // Инициализация скорости, энергии и счетчика шагов
            if (npc.speed === undefined) npc.speed = 5; 
            if (npc.energy === undefined) npc.energy = Math.floor(Math.random() * npc.speed);
            if (npc.stepsSinceTurn === undefined) npc.stepsSinceTurn = 0; // <--- НОВОЕ

            npc.energy += npc.speed;

            // Если энергии достаточно, NPC делает ход
            if (npc.energy >= PLAYER_SPEED_THRESHOLD) {
                npc.energy -= PLAYER_SPEED_THRESHOLD;

                // --- ЛОГИКА СЛУЧАЙНОЙ СМЕНЫ НАПРАВЛЕНИЯ ---
                
                // 1. Проверяем, пора ли менять направление (каждые 5 шагов + небольшой рандом)
                // Добавляем случайность, чтобы они меняли направление не синхронно
                const turnThreshold = 5 + Math.floor(Math.random() * 3); 

                if (npc.stepsSinceTurn >= turnThreshold) {
                    npc.direction = getRandomDirection();
                    npc.stepsSinceTurn = 0; // Сбрасываем счетчик
                }

                if (!npc.direction) {
                    npc.direction = getRandomDirection();
                }

                let moved = false;
                let attempts = 0;
                
                // Пытаемся сделать шаг в текущем направлении
                while (!moved && attempts < 4) {
                    const nx = npc.x + npc.direction.dx;
                    const ny = npc.y + npc.direction.dy;

                    // Проверка границ и стен
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height || MapModule.isWall(nx, ny)) {
                        npc.direction = getRandomDirection();
                        npc.stepsSinceTurn = 0; // При смене направления из-за стены тоже сбрасываем
                        attempts++;
                        continue;
                    }

                    // Проверка коллизий с другими сущностями
                    const blockedByNpc = window.currentCityNpcs.some(other => other !== npc && other.x === nx && other.y === ny);
                    const blockedByPlayer = (player.x === nx && player.y === ny);
                    const blockedByEnemy = enemies.some(e => e.hp > 0 && e.x === nx && e.y === ny);

                    if (blockedByNpc || blockedByPlayer || blockedByEnemy) {
                        npc.direction = getRandomDirection();
                        npc.stepsSinceTurn = 0; // При смене направления из-за препятствия тоже сбрасываем
                        attempts++;
                        continue;
                    }

                    // Успешное движение
                    npc.x = nx;
                    npc.y = ny;
                    npc.stepsSinceTurn++; // <--- УВЕЛИЧИВАЕМ СЧЕТЧИК ШАГОВ
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

    // === ОБРАБОТКА КЛИКА ПО КАРТЕ (ОСМОТР И ВЗАИМОДЕЙСТВИЕ) ===
    function handleMapClick(clientX, clientY) {
        // 1. Если открыт магазин, обрабатываем клик по товарам
        if (isShopOpen) {
            handleShopClick(clientX, clientY);
            return;
        }

        if (!player || window.gameMode !== 'dungeon') return;

        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // Используем размеры сетки из RenderModule для точного попадания
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
    
    // === ОСНОВНОЙ ХОД ИГРЫ (ПОЛНАЯ ВЕРСИЯ) ===
    function processTurn(dx, dy) {
        // 0. ГЛОБАЛЬНЫЕ ПРОВЕРКИ
        if (player.hp <= 0) return; 
        if (window.gameMode === 'tactical') return; // Защита: тактика обрабатывается отдельно

        const nx = player.x + dx;
        const ny = player.y + dy;

        // 1. Пропуск хода
        if (dx === 0 && dy === 0) {
            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return;
        }

        // 2. Проверка стен
        if (MapModule.isWall(nx, ny)) return;

        // 3. Взаимодействие со зданиями (Магазин / Постоялый двор)
        if (window.currentShopCoords && window.currentShopCoords.length > 0) {
            const isTargetShop = window.currentShopCoords.some(pos => pos.x === nx && pos.y === ny);
            if (isTargetShop && !isShopOpen) {
                openShop();
                return; 
            }
        }

        if (window.currentInnCoords && window.currentInnCoords.length > 0) {
            const isTargetInn = window.currentInnCoords.some(pos => pos.x === nx && pos.y === ny);
            if (isTargetInn && !isInnOpen) {
                openInn();
                return; 
            }
        }
        
        // 4. Столкновение с Боссом (2x2)
        const bossInWay = enemies.find(e => e.isBoss && e.hp > 0 && (
            (nx === e.x && ny === e.y) || 
            (nx === e.x + 1 && ny === e.y) || 
            (nx === e.x && ny === e.y + 1) || 
            (nx === e.x + 1 && ny === e.y + 1)
        ));
        
        if (bossInWay) {
            CombatModule.attack(player, bossInWay, (m, t) => RenderModule.log(m, t));
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

        // 5. Атака обычного врага
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

        // 6. Взаимодействие с NPC
        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === nx && n.y === ny) : null;
        if (npc) {
            if (npc.action) {
                npc.action(); 
                return;       
            }

            let questHandled = false;
            if (npc.isQuestGiver) {
                questHandled = tryGiveQuest(npc);
            }

             if (!questHandled) {
                RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            }
            
            if (isReadingQuest) {
                return; 
            }

            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return; 
        }

        // 7. Движение игрока
        player.x = nx;
        player.y = ny;

        // 8. Подбор предметов
        const itemIdx = items.findIndex(i => i.x === nx && i.y === ny);
        if (itemIdx !== -1) {
            const item = items[itemIdx];
        
            if (item.type === 'gold') {
                player.gold += item.val;
                 RenderModule.log(`Подобрано: ${item.name}`, "loot ");
            } 
            else if (item.type === 'book') {
                player.inventory.push(item);
                
                if (typeof LoreModule !== 'undefined') {
                    const fragment = LoreModule.getNextFragment();
                    RenderModule.log(`📖 Вы подобрали "${item.name}". Внутри написано:`, "info ");
                    RenderModule.log(fragment, "event ");
                    
                    if (typeof QuestSystemModule !== 'undefined') {
                        activeQuests.forEach(q => {
                            QuestSystemModule.checkProgress(q, { type: 'read_book' });
                        });
                    }
                } else {
                     RenderModule.log(`Вы подобрали "${item.name}".`, "info ");
                }
            }  
            else {
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot ");
                
            // Проверка квестов на подбор (FETCH/COLLECT)
            if (typeof QuestSystemModule !== 'undefined') {
                [...activeQuests].forEach(q => {
                    if (q.isCompleted) return;
                    
                    if (q.type === 'FETCH' || q.type === 'COLLECT') {
                        
                        let isItemMatch = false;
                        if (q.target.uniqueId && item.uniqueId === q.target.uniqueId) {
                            isItemMatch = true;
                        } else if ((item.type === q.target.itemType) && 
                                 (!q.target.itemName || item.name.includes(q.target.itemName))) {
                            isItemMatch = true;
                        }

                        if (isItemMatch) {
                            const isCorrectLocation = (
                                dungeonX === q.target.targetX && 
                                dungeonY === q.target.targetY
                            );

                            const requiredDepth = q.target.recommendedDepth || q.target.targetDepth;
                            const isCorrectDepth = !requiredDepth || ((currentDepth + 1) >= requiredDepth);

                            if (!isCorrectLocation) {
                                RenderModule.log(`📦 Это ${item.name}, но не тот. Ищите в ${q.target.locationName}.`, "info ");
                                return; 
                            }

                            if (!isCorrectDepth) {
                                RenderModule.log(`📦 Это ${item.name}, но вы на недостаточной глубине. Нужно хотя бы ур. ${requiredDepth}.`, "info ");
                                return; 
                            }

                            item.isQuestItem = true;

                            if (q.type === 'FETCH') {
                                q.progress = q.maxProgress;
                                q.isCompleted = true;
                                RenderModule.updateQuestBriefing(q);
                                RenderModule.log(`📦 Это тот самый предмет! Квест выполнен.`, "info ");
                            } else if (q.type === 'COLLECT') {
                                QuestSystemModule.checkProgress(q, { 
                                    type: 'pickup', 
                                    itemType: item.type,
                                    itemName: item.name,
                                    uniqueId: item.uniqueId,
                                    locX: dungeonX,
                                    locY: dungeonY,
                                    currentDepth: currentDepth 
                                });
                                RenderModule.log(`📦 Подобрано для квеста: ${item.name} (${q.progress}/${q.maxProgress})`, "info ");
                            }
                            updateQuestCompass();
                        }
                    }
                });
             }
        }
        items.splice(itemIdx, 1);
    }

    // 9. Лестницы
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

    // 10. Ход врагов и NPC
    if (player.hp > 0) {
        moveNpcs();
        moveEnemies();
    }

    // 11. Обработка временных эффектов
    if (player.hp > 0) {
        EffectSystemModule.processEffects(player, RenderModule.log);
        EffectSystemModule.recalculateStats(player);
    }

    // 12. Финальная проверка смерти
    if (player.hp <= 0) {
        RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
        busy = true; 
    }
    
    renderFrame();
}

    // === ОТРИСОВКА КАДРА (Обновленная с тактическим боем) ===
    function renderFrame() {
        if (!player) return;

        // 1. ТАКТИЧЕСКИЙ РЕЖИМ
        if (window.gameMode === 'tactical' && tacticalState) {
            if (typeof TacticalRenderModule !== 'undefined') {
                TacticalRenderModule.drawBattlefield(
                    tacticalState.arena, 
                    tacticalState.playerUnit, 
                    tacticalState.enemyUnits, 
                    tacticalState.playerArmy, // <--- ИСПОЛЬЗУЕМ ДАННЫЕ ИЗ СОСТОЯНИЯ БОЯ
                    window.currentTactic
                );
            } else {
                console.error("❌ TacticalRenderModule не найден!");
            }
            return; 
        }

        // 2. ГЛОБАЛЬНАЯ КАРТА
        if (window.gameMode === 'global') {
            renderGlobalMap(); // Эта функция уже содержит отрисовку карты, миникарты и UI
            return;
        }

        // 3. ОБЫЧНЫЙ РЕЖИМ (Подземелье / Город)
        // Стандартная отрисовка подземелья/города
        const vis = RenderModule.draw(player, enemies, items, npcs); 
        vis.forEach(k => explored.add(k));
        
        // Обновление UI панелей
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawMinimap(player, explored);

        // === НОВОЕ: Если открыт постоялый двор, рисуем его поверх всего ===
        if (isInnOpen && typeof RenderModule.drawInnWindow === 'function') {
            RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
        }
        
        // === НОВОЕ: Если открыт магазин, рисуем его поверх всего ===
        if (isShopOpen && typeof RenderModule.drawShopWindow === 'function') {
             RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        }
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

    // === ПАМЯТЬ ТЕКСТОВЫХ КВЕСТОВ ===
    // Хранит имена файлов (например, 'Quack of Duckness.html'), которые игрок уже завершил
    //let completedTextQuests = []; 

    // === СИСТЕМА TWINE КВЕСТОВ ===

    // === СИСТЕМА TWINE КВЕСТОВ ===

    function openTwineQuest(url) {
        if (isTwineActive) return;
        // === ОЧИСТКА СОСТОЯНИЯ TWINE ===
        // Twine (Harlowe) сохраняет прогресс в sessionStorage браузера.
        // Ключ "Saved Session" используется всеми квестами на одном домене.
        // Очищаем его, чтобы квест ВСЕГДА начинался с самого начала.
        try {
            sessionStorage.removeItem("Saved Session");
        } catch(e) {
            console.warn("Не удалось очистить sessionStorage Twine");
        }    
        isTwineActive = true;
    
        // 1. Создаем контейнер-затемнение
        const overlay = document.createElement('div');
        overlay.id = 'twine-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        `;

        // 2. Создаем Iframe с уникальным параметром времени
        const iframe = document.createElement('iframe');
        
        // === ИСПРАВЛЕНИЕ: Добавляем ?t=... чтобы сбросить кэш ===
        const timestamp = new Date().getTime();
        const separator = url.includes('?') ? '&' : '?';
        iframe.src = `${url}${separator}t=${timestamp}`;
        
        iframe.style.cssText = `
            width: 90%; height: 90%; border: 2px solid #58a6ff;
            background: #fff; border-radius: 8px;
        `;
    
        // 3. Кнопка принудительного выхода (крестик)
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&#10006;'; // Символ крестика
        closeBtn.style.cssText = `
            position: absolute; top: 20px; right: 20px;
            background: #da3633; color: white; border: none;
            width: 40px; height: 40px; border-radius: 50%;
            font-size: 20px; cursor: pointer; z-index: 10001;
        `;
    
        // Обработчик закрытия без награды
        closeBtn.onclick = () => closeTwineQuest(false, url);
    
        overlay.appendChild(iframe);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        // 4. Слушатель сообщений от Iframe
        const messageHandler = (event) => {
            // Проверка типа сообщения
            if (event.data && event.data.type === 'TWINE_QUEST_COMPLETE') {
                console.log("Квест завершен! Данные:", event.data.payload);
                applyTwineReward(event.data.payload);
                closeTwineQuest(true, url); // Передаем URL для запоминания
            }
        };
    
        window.addEventListener('message', messageHandler);
        // Сохраняем ссылку на обработчик, чтобы удалить его потом
        overlay._msgHandler = messageHandler;
    }

    function closeTwineQuest(success, url, isGlobal = false) {
        const overlay = document.getElementById('twine-overlay');
        if (!overlay) return;

        if (overlay._msgHandler) {
            window.removeEventListener('message', overlay._msgHandler);
        }

        overlay.remove();
        isTwineActive = false;

        if (success && url) {
            completedTextQuests.add(url); 
            
            if (!isGlobal) {
                removeSpecialNpcFromCity(); 
            } else {
                const playerPos = GlobalMapModule.getPlayerPosition();
                GlobalMapModule.removePOI(playerPos.x, playerPos.y);
                RenderModule.log("📜 Свиток рассыпается в прах...", "info");
            }
        } else {
            if (!isGlobal) {
                removeSpecialNpcFromCity(); 
            } else {
                const playerPos = GlobalMapModule.getPlayerPosition();
                GlobalMapModule.removePOI(playerPos.x, playerPos.y);
                RenderModule.log("📜 Вы оставили свиток в покое... но он исчез.", "info");
            }
        }

        // === ИСПРАВЛЕНИЕ ОТРИСОВКИ ===
        if (typeof RenderModule !== 'undefined') {
            if (window.gameMode === 'global') {
                renderGlobalMap(); // Принудительно рисуем глобальную карту
            } else {
                RenderModule.requestRedraw(); // Для обычных квестов в городах
            }
        }
    }

    function applyTwineReward(data) {
        if (!player || !data) return;
    
        // 1. ЗОЛОТО (Gold)
        if (data.gold !== undefined) {
            const amount = parseInt(data.gold);
            if (!isNaN(amount) && amount !== 0) {
                player.gold += amount;
                RenderModule.log(amount > 0 ? `💰 Получено золото: ${amount}` : `💸 Потеряно золото: ${Math.abs(amount)}`, "loot");
            }
        }
    
        // 2. ОПЫТ (XP) - Требует наличия функции gainXp в GameModule
        if (data.xp !== undefined) {
            const xpAmount = parseInt(data.xp);
            if (!isNaN(xpAmount) && xpAmount > 0) {
                // Проверяем, существует ли функция прокачки (она есть в game.js)
                if (typeof gainXp === 'function') {
                    gainXp(xpAmount);
                    RenderModule.log(`✨ Получено опыта: ${xpAmount}`, "info");
                } else {
                    console.warn("Функция gainXp не найдена.");
                }
            }
        }
    
        // 3. ЛЕЧЕНИЕ (Heal Percent)
        if (data.healPercent !== undefined) {
            const percent = parseFloat(data.healPercent);
            if (!isNaN(percent) && percent > 0) {
                const healAmount = Math.floor(player.maxHp * percent);
                const oldHp = player.hp;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                if (player.hp > oldHp) {
                    RenderModule.log(`❤️ Восстановлено ${player.hp - oldHp} HP (${Math.round(percent * 100)}%)`, "info");
                }
            }
        }
    
        // 4. ВЫНОСЛИВОСТЬ (Stamina)
        if (data.stamina !== undefined) {
            const staminaAmount = parseInt(data.stamina);
            if (!isNaN(staminaAmount)) {
                // Если число положительное - добавляем, если отрицательное - отнимаем
                // Но обычно восстанавливают до максимума или добавляют фиксированное значение
                if (staminaAmount > 0) {
                     // Если передали просто число, считаем это добавлением
                     // Если хотите восстановление до максимума, можно передать 9999 или отдельный флаг
                     const oldStamina = player.stamina;
                     player.stamina = Math.min(player.maxStamina, player.stamina + staminaAmount);
                     if (player.stamina > oldStamina) {
                         RenderModule.log(`⚡ Выносливость восстановлена на ${player.stamina - oldStamina}`, "info");
                     }
                } else if (staminaAmount === -1) { 
                    // Специальный кейс: полное восстановление
                    player.stamina = player.maxStamina;
                    RenderModule.log(`⚡ Выносливость полностью восстановлена!`, "info");
                }
            }
        }
    
        // 5. УНИКАЛЬНЫЕ ПРЕДМЕТЫ (Add Item by ID)
        if (data.itemId) {
            const template = DataModule.UNIQUE_ITEM_TEMPLATES.find(t => t.id === data.itemId);
            if (template) {
                const baseTemplate = DataModule.ITEM_TYPES.find(t => t.type === template.baseType);
                const char = template.char || (baseTemplate ? baseTemplate.char : '?');
                const statVal = template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 
                                (template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0);

                const newItem = {
                    x: 0, y: 0,
                    name: `${template.uniquePrefix} ${template.baseName}`,
                    char: char,
                    color: template.color || '#FFD700',
                    type: template.baseType,
                    val: statVal,
                    isItem: true,
                    isQuestItem: false,
                    isUnique: true,
                    uniqueAtk: template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0,
                    uniqueDef: template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 0,
                    desc: template.desc || ""
                };
                
                player.inventory.push(newItem);
                RenderModule.log(`🎁 Получен уникальный предмет: ${newItem.name}`, "loot");
            } else {
                RenderModule.log(`⚠️ Ошибка: предмет с ID "${data.itemId}" не найден в базе.`, "combat");
            }
        }
    
        // 6. УДАЛЕНИЕ ПРЕДМЕТА (Remove Item)
        if (data.removeItem) {
            const itemNameToRemove = data.removeItem;
            // Ищем индекс первого подходящего предмета
            const itemIndex = player.inventory.findIndex(item => 
                item.name === itemNameToRemove || item.name.includes(itemNameToRemove)
            );

            if (itemIndex !== -1) {
                const removedItem = player.inventory.splice(itemIndex, 1)[0];
                RenderModule.log(`🗑️ Предмет удален из инвентаря: ${removedItem.name}`, "info");
            } else {
                // Не выдаем ошибку игроку, просто логируем в консоль для отладки
                console.log(`⚠️ Попытка удалить "${itemNameToRemove}", но предмета нет в инвентаре.`);
            }
        }
    
        // 7. ГЛОБАЛЬНЫЙ ФЛАГ (Quest Flag)
        // Для этого нам нужно место для хранения флагов. 
        // Можно добавить объект globalFlags в GameModule, если его еще нет.
        if (data.questFlag) {
            // Инициализируем хранилище флагов, если его нет (добавьте let globalFlags = {}; в начало GameModule)
            if (typeof globalFlags === 'undefined') window.globalFlags = {}; 
            
            window.globalFlags[data.questFlag] = true;
            RenderModule.log(`🚩 Установлен флаг сюжета: ${data.questFlag}`, "event");
        }
    
        // 8. КАСТОМНОЕ СООБЩЕНИЕ (Message)
        if (data.message) {
            RenderModule.log(data.message, "event");
        }
    
        // Обновление интерфейса после всех изменений
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
    }

    // === ПРОВЕРКА: БЫЛ ЛИ КВЕСТ УЖЕ ПРОЙДЕН? ===
    function isTextQuestCompleted(filename) {
        // Используем .has() для Set вместо .includes() для Array
        return completedTextQuests.has(filename);
    }
    // === УПРАВЛЕНИЕ ПАМЯТЬЮ ГОРОДОВ ===
    function markCityTextQuestTaken(gx, gy) {
        textQuestCities.add(`${gx}_${gy}`);
        console.log(`🏙️ Город (${gx}, ${gy}) больше не выдает текстовые квесты.`);
    }

    function hasCityTakenTextQuest(gx, gy) {
        return textQuestCities.has(`${gx}_${gy}`);
    }
    // === УДАЛЕНИЕ ОСОБОГО NPC ПОСЛЕ КВЕСТА ===
    function removeSpecialNpcFromCity() {
        if (!window.currentCityNpcs || window.currentCityNpcs.length === 0) return;
        
        // Ищем NPC, у которого есть поле isSpecial или action (на всякий случай)
        // Но лучше всего ориентироваться на цвет или имя, если мы их задали жестко.
        // В нашем случае мы помечали их как isSpecial: true и цветом #ff00ff
        
        const index = window.currentCityNpcs.findIndex(npc => npc.isSpecial);
        
        if (index !== -1) {
            const removedNpc = window.currentCityNpcs[index];
            window.currentCityNpcs.splice(index, 1);
            
            // Также удаляем его из общего массива npcs, если он там дублируется
            // (в loadCityLevel мы обычно используем window.currentCityNpcs как основной источник для рендера)
            
            RenderModule.log(`👻 ${removedNpc.name} исчезает в толпе...`, "info");
            
            // Запрашиваем перерисовку, чтобы персонаж пропал с экрана
            RenderModule.requestRedraw();
        }
    }    
    return {
        init,
        getPlayer,
        getActiveQuests,
        getCompletedQuestIds,
        abandonCurrentQuest,
        openTwineQuest, 
        isTextQuestCompleted,
        markCityTextQuestTaken,
        hasCityTakenTextQuest,
        setGlobalFlag: (flagName, value) => { globalFlags[flagName] = value; },
        // Используем локальную переменную globalFlags через замыкание
        getGlobalFlag: (flagName) => globalFlags[flagName] || false,
        endTacticalBattle: endTacticalBattle,
        getTacticalState: () => tacticalState,
        getPlayerArmy: () => tacticalState ? tacticalState.playerArmy : [],

        
        exitToGlobal 
    };
})();

window.onload = async () => {
    await GameModule.init();
};
