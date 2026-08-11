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
    let isEraWindowOpen = false;
    
    // === Подземельные координаты ===
    let dungeonX = 0;
    let dungeonY = 0;
    let currentDepth = 0;  
    let currentDungeonTypeName = null; 
    let currentDungeonFullName = null;
    let traps = []; // Массив всех ловушек на уровне
    let visibleTraps = new Set(); // Set строк "x,y" для ловушек, которые сейчас видит игрок
    
    // === Глобальные координаты и магазин ===
    let currentLocData = null;
    let currentWorldTrend = null;
    let isShopOpen = false;
    let isInnOpen = false;
    let currentMerchantInv = null;


    // Переменная состояния
    let isFullInventoryOpen = false;

    // Функции управления
    function openFullInventory() {
        if (isFullInventoryOpen) return;
        isFullInventoryOpen = true;
        busy = true; // Блокируем игру
    
        // Скрываем UI панели, но НЕ скрываем оверлей (он нужен для модалки)
        toggleUI(false); 
    
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('inventory-modal');
    
        if (overlay && modal) {
            overlay.style.display = 'flex';
            overlay.style.visibility = 'visible';
            modal.style.display = 'flex';
            modal.style.visibility = 'visible';
            modal.classList.remove('hidden');
        
            // Заполняем данными
            if (typeof RenderModule.renderFullInventory === 'function') {
                RenderModule.renderFullInventory(player);
            }
        }
    }

    function closeFullInventory() {
        if (!isFullInventoryOpen) return;
        isFullInventoryOpen = false;
        busy = false;
    
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('inventory-modal');
    
        if (overlay && modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            // Если других окон нет, скрываем оверлей
            if (!isShopOpen && !isInnOpen && !isReadingQuest && !isTwineActive && !isEraWindowOpen) {
                overlay.style.display = 'none';
            }
        }
    
        toggleUI(true);
        RenderModule.requestRedraw();
    }





    
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



    // === СИСТЕМА ФАЗ МИРА (WORLD ERAS) ===
    function changeEra(newEraId) {
        if (typeof WorldErasModule === 'undefined') return;
    
        const oldEraId = WorldErasModule.getCurrentEraId();
        if (oldEraId === newEraId) return; // Уже в этой эпохе

        // 1. Обновляем состояние
        WorldErasModule.setCurrentEraId(newEraId);
        const eraData = WorldErasModule.getCurrentEra();
    
        RenderModule.log(`🌍 МИР ИЗМЕНИЛСЯ: Наступила ${eraData.name}!`, "event");

        // 2. Открываем модальное окно
        openEraWindow(eraData);
    }

    function openEraWindow(eraData) {
        console.log("🚀 [Era] Попытка открыть окно эпохи:", eraData.name);
        
        isEraWindowOpen = true;
        busy = true; // Блокируем игровой цикл
        toggleUI(false); // Скрываем панели

        const overlay = document.getElementById('modal-overlay');
        const eraModal = document.getElementById('era-modal');
        const titleEl = document.getElementById('era-modal-title');
        const textEl = document.getElementById('era-modal-text');

        if (overlay && eraModal && titleEl && textEl) {
            console.log("✅ [Era] Элементы DOM найдены. Применяем стили...");

            // 1. Заполняем контент
            titleEl.textContent = eraData.modalTitle || eraData.name;
            textEl.textContent = eraData.modalText;

            // 2. ЖЕСТКОЕ управление стилями (в обход CSS классов)
            overlay.style.display = 'flex';
            overlay.style.visibility = 'visible';
            
            eraModal.style.display = 'flex'; 
            eraModal.style.visibility = 'visible';
            eraModal.classList.remove('hidden'); // Убираем класс, если он есть

            console.log("✅ [Era] Окно должно быть видно. Проверьте экран!");
        } else {
            console.error("❌ [Era] ОШИБКА: Не найдены элементы модального окна в HTML!");
            closeEraWindow();
        }
    }
    function closeEraWindow() {
        isEraWindowOpen = false;
        busy = false;
    
        const overlay = document.getElementById('modal-overlay');
        const eraModal = document.getElementById('era-modal');
    
        if (overlay && eraModal) {
            eraModal.classList.add('hidden');
            eraModal.style.display = 'none';
            // Если других окон нет, скрываем оверлей
            if (!isShopOpen && !isInnOpen && !isReadingQuest && !isTwineActive) {
                overlay.style.display = 'none';
            }
        }
    
        toggleUI(true);
        RenderModule.requestRedraw();
    }
    
    function openQuestWindow(quest, isCompleted) {
        console.log("🔍 [Quest] Попытка открыть окно квеста. isCompleted:", isCompleted);
        
        isReadingQuest = true;
        toggleUI(false); // Скрываем боковые панели
        
        const overlay = document.getElementById('modal-overlay');
        const questModal = document.getElementById('quest-modal');
        
        console.log("🔍 [Quest] Overlay:", overlay ? "Найден" : "НЕ НАЙДЕН");
        console.log("🔍 [Quest] Quest Modal:", questModal ? "Найден" : "НЕ НАЙДЕН");
        
        if (overlay && questModal) {
            // Прямое управление стилями, как в магазине
            overlay.style.display = 'flex';
            overlay.style.visibility = 'visible';
            
            questModal.style.display = 'block'; // Явно показываем само окно
            questModal.style.visibility = 'visible';
            questModal.classList.remove('hidden');
            
            console.log("✅ [Quest] Стили применены. Вызов RenderModule.renderQuestUI...");
            
            // Рендерим контент через RenderModule
            if (typeof RenderModule.renderQuestUI === 'function') {
                RenderModule.renderQuestUI(quest, isCompleted);
            } else {
                console.error("❌ [Quest] Функция renderQuestUI не найдена в RenderModule!");
            }
        } else {
            console.error("❌ [Quest] HTML элементы окна квеста не найдены в DOM!");
            isReadingQuest = false;
            toggleUI(true);
        }
    }
    function closeQuestWindow() {
        console.log("🔍 [Quest] Закрытие окна квеста.");
        isReadingQuest = false;
        
        const overlay = document.getElementById('modal-overlay');
        const questModal = document.getElementById('quest-modal');
        
        if (overlay && questModal) {
            questModal.classList.add('hidden');
            overlay.style.display = 'none';
        }

        toggleUI(true); // Возвращаем панели
        RenderModule.requestRedraw();
    }

    // Обработка кликов больше не нужна для HTML-окна, так как есть кнопка закрытия
    // Но оставим заглушку для безопасности
    function handleQuestClick(clientX, clientY) {
        // Ничего не делаем, клик обрабатывается HTML-кнопкой
    }

    // === ПОСТОЯЛЫЙ ДВОР (HTML Версия) ===
    function openInn() {
        console.log("🔍 [Inn] Попытка открыть постоялый двор. Текущий статус isInnOpen:", isInnOpen);
        
        if (isInnOpen) {
            console.warn("⚠️ [Inn] Окно уже открыто, выходим.");
            return;
        }
        
        isInnOpen = true;
        busy = true; // Блокируем игровой цикл
        console.log("✅ [Inn] Флаг isInnOpen установлен, busy = true");
    
        toggleUI(false); // Скрываем боковые панели
        
        const overlay = document.getElementById('modal-overlay');
        const innModal = document.getElementById('inn-modal');
        
        console.log("🔍 [Inn] Поиск элементов DOM...");
        console.log("   - Overlay:", overlay ? "Найден" : "НЕ НАЙДЕН");
        console.log("   - Inn Modal:", innModal ? "Найден" : "НЕ НАЙДЕН");
        
        if (overlay && innModal) {
            console.log("✅ [Inn] Элементы найдены. Применяем стили...");
            
            // Принудительное управление стилями для гарантии отображения
            overlay.style.display = 'flex';
            overlay.style.visibility = 'visible';
            
            innModal.style.display = 'block'; // Явно показываем само окно
            innModal.style.visibility = 'visible';
            innModal.classList.remove('hidden');
            
            console.log("✅ [Inn] Стили применены. Обновляем UI...");
            
            // Обновляем данные при открытии
            updateInnUI();
            setInnStatus("Добро пожаловать! Выберите действие.");
            
            // Проверка внутренних элементов
            const goldEl = document.getElementById('inn-gold-info');
            const staminaEl = document.getElementById('inn-stamina-info');
            
            if (!goldEl) console.error("❌ [Inn] ОШИБКА: Не найден элемент #inn-gold-info внутри модалки!");
            if (!staminaEl) console.error("❌ [Inn] ОШИБКА: Не найден элемент #inn-stamina-info внутри модалки!");
            
        } else {
            console.error("❌ [Inn] КРИТИЧЕСКАЯ ОШИБКА: HTML элементы постоялого двора не найдены в DOM!");
            console.error("   Проверьте index.html: должен быть div id='modal-overlay' и внутри него div id='inn-modal'");
            
            // Откат изменений, если ошибка
            isInnOpen = false;
            busy = false;
            toggleUI(true);
        }
    
        RenderModule.log("Вы вошли в Постоялый двор.", "info");
    }

    function closeInn() {
        if (!isInnOpen) return;
        isInnOpen = false;
        busy = false; // Разблокируем цикл
        
        const overlay = document.getElementById('modal-overlay');
        const innModal = document.getElementById('inn-modal');
        
        if (overlay && innModal) {
            innModal.classList.add('hidden');
            overlay.style.display = 'none';
        }

        toggleUI(true);
        RenderModule.requestRedraw();
        RenderModule.log("Вы покинули постоялый двор.", "info");
    }

    // Вспомогательная функция для обновления текста в окне
    function updateInnUI() {
        if (!player) return;
        const goldEl = document.getElementById('inn-gold-info');
        const staminaEl = document.getElementById('inn-stamina-info');
        const hireCostEl = document.getElementById('inn-hire-cost');
        
        if (goldEl) goldEl.textContent = player.gold;
        if (staminaEl) staminaEl.textContent = `${player.stamina}/${player.maxStamina}`;
        
        if (typeof TacticalDataModule !== 'undefined' && hireCostEl) {
            hireCostEl.textContent = TacticalDataModule.UNIT_COST;
        }
    }

    function setInnStatus(msg) {
        const statusEl = document.getElementById('inn-status-msg');
        if (statusEl) {
            statusEl.textContent = msg;
        }
    }

    function innAction(actionType) {
        if (!player) return;

        if (actionType === 'rest') {
            const cost = 20;
            if (player.gold >= cost) {
                player.gold -= cost;
                player.stamina = player.maxStamina;
                setInnStatus(`Вы сняли комнату за ${cost} золотых. Выносливость восстановлена!`);
                RenderModule.log(`Вы сняли комнату за ${cost} золотых. Выносливость восстановлена!`, "loot");
            } else {
                setInnStatus("Недостаточно золота для ночлега!");
                RenderModule.log("Недостаточно золота для ночлега!", "combat");
            }
        } 
        else if (actionType === 'rumor') {
            if (typeof LoreModule !== 'undefined' && LoreModule.getRumor) {
                const rumor = LoreModule.getRumor();
                setInnStatus(`Трактирщик шепчет: "${rumor}"`);
                RenderModule.log(`Трактирщик шепчет: "${rumor}"`, "lore");
            }
        } 
        else if (actionType === 'dice') {
            const bet = 10;
            if (player.gold >= bet) {
                player.gold -= bet;
                const roll = Math.random();
                if (roll < 0.45) {
                    setInnStatus("Вы проиграли в кости. Трактирщик забирает ваше золото.");
                    RenderModule.log("Вы проиграли в кости. Трактирщик забирает ваше золото.", "combat");
                } else if (roll < 0.90) {
                    player.gold += bet * 2;
                    setInnStatus(`Вы выиграли! Получено ${bet * 2} золотых.`);
                    RenderModule.log(`Вы выиграли! Получено ${bet * 2} золотых.`, "loot");
                } else {
                    player.gold += bet * 5;
                    setInnStatus(`ДЖЕКПОТ! Вы выиграли ${bet * 5} золотых!`);
                    RenderModule.log(`ДЖЕКПОТ! Вы выиграли ${bet * 5} золотых!`, "event");
                }
            } else {
                setInnStatus("У вас нет даже 10 золотых, чтобы поставить!");
                RenderModule.log("У вас нет даже 10 золотых, чтобы поставить!", "combat");
            }
        }
        else if (actionType === 'hire') {
            if (typeof TacticalDataModule === 'undefined') {
                setInnStatus("Система найма временно недоступна.");
                return;
            }
            const currentSquads = player.armyUnits ? player.armyUnits.length : 0;
            if (currentSquads >= TacticalDataModule.MAX_PLAYER_SQUADS) {
                setInnStatus(`Вы не можете нанять больше ${TacticalDataModule.MAX_PLAYER_SQUADS} отрядов!`);
                return;
            }
            const cost = TacticalDataModule.UNIT_COST;
            if (player.gold >= cost) {
                player.gold -= cost;
                GameModule.setGlobalFlag('player_has_squad', true);
                if (!player.hasArmy) {
                    player.hasArmy = true;
                    player.armyUnits = [];
                }
                if (typeof TacticalArmyModule !== 'undefined') {
                    const unitType = TacticalArmyModule.getRandomUnitType();
                    const count = Math.floor(5 + Math.random() * 10);
                    player.armyUnits.push({
                        type: unitType,
                        count: count,
                        hp: unitType.hp * count,
                        maxHp: unitType.hp * count
                    });
                    setInnStatus(`Вы наняли отряд "${unitType.name}" (${count} бойцов)!`);
                    RenderModule.log(`Вы наняли отряд "${unitType.name}" (${count} бойцов) за ${cost} золотых!`, "loot");
                } else {
                    player.armyUnits.push({ name: "Наемники", count: 10, hp: 200, maxHp: 200 });
                    setInnStatus(`Вы наняли отряд наемников!`);
                    RenderModule.log(`Вы наняли отряд наемников за ${cost} золотых!`, "loot");
                }
            } else {
                setInnStatus(`Недостаточно золота! Нужно ${cost} золотых.`);
                RenderModule.log(`Недостаточно золота! Нужно ${cost} золотых.`, "combat");
            }
        }
        
        // Обновляем UI после любого действия
        updateInnUI();
    }
  
    function openShop() {
        console.log("🔍 Попытка открыть магазин. isShopOpen:", isShopOpen);
        if (isShopOpen) return;
    
        const depth = currentDepth > 0 ? currentDepth : 1;
        const merchantGold = 500 + (depth * 100);
    
        currentMerchantInv = EntityModule.createMerchantInventory(depth, merchantGold);
        isShopOpen = true;
        busy = true; 
    
        toggleUI(false); 
        
        const overlay = document.getElementById('modal-overlay');
        const shopModal = document.getElementById('shop-modal');
        
        if (overlay && shopModal) {
            // Прямое управление стилями в обход классов
            overlay.style.display = 'flex'; 
            overlay.style.visibility = 'visible';
            
            shopModal.style.display = 'block';
            shopModal.style.visibility = 'visible';
            shopModal.classList.remove('hidden'); // На всякий случай
            
            window.shopPageMerchant = 0;
            window.shopPagePlayer = 0;
            
            if (typeof RenderModule.renderShopUI === 'function') {
                RenderModule.renderShopUI(currentMerchantInv, player.gold);
            }
        } else {
            console.error("Элементы магазина не найдены!");
        }

        RenderModule.log("Вы вошли в лавку. Добро пожаловать!", "info");
    }
    function closeShop() {
        if (!isShopOpen) return;
        
        isShopOpen = false;
        currentMerchantInv = null;
        busy = false; // Разблокируем игровой цикл
        
        // Скрываем HTML-модалку
        const overlay = document.getElementById('modal-overlay');
        const shopModal = document.getElementById('shop-modal');
        
        if (overlay && shopModal) {
            shopModal.classList.add('hidden');
            overlay.style.display = 'none';
        }

        toggleUI(true); // Возвращаем боковые панели
        RenderModule.requestRedraw();
        RenderModule.log("Вы покинули лавку.", "info");
    }

    function handleShopClick(clientX, clientY) {
        // В HTML-версии клики обрабатываются самим окном, 
        // но эта функция нужна для закрытия по клику на затемнение
        const target = document.elementFromPoint(clientX, clientY);
        const overlay = document.getElementById('modal-overlay');
        
        if (target && target === overlay) {
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
            
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.showShopStatus(`Куплено: ${item.name}`, 'success'); // <--- ИЗМЕНЕНО
            
            // Обновляем HTML интерфейс
            if (typeof RenderModule.renderShopUI === 'function') {
                RenderModule.renderShopUI(currentMerchantInv, player.gold);
            }
        } else {
            RenderModule.showShopStatus("Недостаточно золота!", 'error'); // <--- ИЗМЕНЕНО
        }
    }

    function sellItem(index) {
        if (!player) return;
        const item = player.inventory[index];
        if (!item) return;
        if (item.isQuestItem) {
            RenderModule.showShopStatus("Это квестовый предмет!", 'error'); // <--- ИЗМЕНЕНО
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
            
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.showShopStatus(`Продано: ${item.name} за ${sellPrice}g`, 'success'); // <--- ИЗМЕНЕНО
            
            // Обновляем HTML интерфейс
            if (typeof RenderModule.renderShopUI === 'function') {
                RenderModule.renderShopUI(currentMerchantInv, player.gold);
            }
        } else {
            RenderModule.showShopStatus("У торговца нет золота!", 'error'); // <--- ИЗМЕНЕНО
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
        // Приоритет 1: Окно квеста (Canvas)
        if (isReadingQuest) {
            handleQuestClick(clientX, clientY);
            return;
        }
        
        // Магазин и Трактир теперь в HTML, их клики обрабатываются браузером.
        // Нам нужно только убедиться, что мы не пытаемся двигать персонажа или смотреть под курсор,
        // если открыто модальное окно.
        
        if (isShopOpen || isInnOpen) {
            // Если открыто HTML-окно, игнорируем клики по канвасу полностью,
            // чтобы не было случайных движений или осмотра.
            return; 
        }

        // Приоритет 2: Осмотр карты (только в подземелье)
        if (window.gameMode === 'dungeon') {
            handleMapClick(clientX, clientY);
        }
    }

    function handleInput(e) {
        // 0. БЛОКИРОВКА ПРИ СМЕРТИ (Глобальная проверка)
        if (player && player.hp <= 0) {
             return; 
        }    
        if (isEraWindowOpen) {
            // Разрешаем только Enter или Escape для закрытия, если вдруг кнопка не сработала
            if (e.key === "Escape" || e.key === "Enter") closeEraWindow();
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
        // Добавить в handleInput проверку Escape для инвентаря
        // Вставьте перед проверкой магазина:
        if (isFullInventoryOpen) {
            if (e.key === "Escape") closeFullInventory();
            return; 
        }  
        // 3. ПРОВЕРКА МАГАЗИНА (Приоритет №2)
        if (isShopOpen) {
            if (e.key === "Escape") closeShop();
            return; 
        }

        // 4. ЧИТ-КОД: Восстановление здоровья, золота и УРОВНЯ (Enter)
        if (e.key === "Enter") {
            e.preventDefault();
            if (player && player.hp > 0) {
                const healAmount = 100;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                
                // Добавляем золото
                player.gold += 1000;

                // === НОВОЕ: Повышение уровня ===
                player.level++;
                
                // Пересчитываем характеристики на основе нового уровня
                // (используем ту же логику, что и при обычном повышении уровня)
                player.maxHp = 20 + (player.level * 10); 
                player.strength = 5 + Math.floor(player.level / 2);
                
                // Восстанавливаем HP до максимума после повышения уровня (как бонус)
                player.hp = player.maxHp;
                
                RenderModule.log(`💊 ЧИТ: Восстановлено ${healAmount} HP!`, "event");
                RenderModule.log(`💰 ЧИТ: Получено 1000 золотых!`, "loot");
                RenderModule.log(`🆙 ЧИТ: Уровень повышен до ${player.level}! Характеристики обновлены.`, "event");
                
                // Важно: обновляем интерфейс, чтобы увидеть новое золото и статы
                RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            }
            return;
        }
        // ... (код выше, заканчивающийся на return;) ...

        // === ЧИТ-КОД: СМЕНА ЭПОХИ (TAB) ===
        if (e.key === "Tab") {
            e.preventDefault(); // Чтобы фокус не улетал в браузер
            
            // Определяем текущую эпоху и выбираем следующую по кругу
            let currentEra = 'dawn';
            if (typeof WorldErasModule !== 'undefined') {
                currentEra = WorldErasModule.getCurrentEraId();
            }

            let nextEra = 'shadows'; // По умолчанию следующая - Тени
            
            if (currentEra === 'dawn') {
                nextEra = 'shadows';
            } else if (currentEra === 'shadows') {
                nextEra = 'war';
            } else if (currentEra === 'war') {
                nextEra = 'dawn'; // Возврат к началу для тестов
            }

            // Вызываем функцию смены эпохи из GameModule
            if (typeof GameModule.changeEra === 'function') {
                GameModule.changeEra(nextEra);
                RenderModule.log(`🧪 ЧИТ: Принудительная смена эры на '${nextEra}'`, "event");
            } else {
                RenderModule.log("⚠️ Ошибка: Функция changeEra не найдена!", "combat");
            }
            
            return;
        }

        // Временная клавиша для теста Twine

        // Временная клавиша для теста Twine
        if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            GameModule.openTwineQuest('Quack of Duckness.html');
            return;
        }

        // === НОВОЕ: ТАКТИЧЕСКИЙ РЕЖИМ (Полная передача управления в TacticalBattleModule) ===
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
                 // Устанавливаем тактику побега и делаем ход
                 window.currentTactic = 'flee';
                 TacticalBattleModule.processBattleTurn(0, 0, 'flee');
                 return;
            }

            // В. Обработка движения/атаки/пропуска хода
            let dx = 0, dy = 0;
            let isAction = false;
            
            if (e.key === "ArrowUp")    { dy = -1; isAction = true; }
            if (e.key === "ArrowDown")  { dy = 1;  isAction = true; }
            if (e.key === "ArrowLeft")  { dx = -1; isAction = true; }
            if (e.key === "ArrowRight") { dx = 1;  isAction = true; }
            
            // === ПРОПУСК ХОДА (SPACE) ===
            if (e.key === " ") { 
                isAction = true; 
                RenderModule.log("⏳ Вы ждете следующего хода...", "info");
            }

            if (isAction) {
                // 🚀 ГЛАВНОЕ ИЗМЕНЕНИЕ: Вызываем наш новый модуль, игнорируя старые функции
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
    // === ЛОГИКА ВЫДАЧИ КВЕСТОВ (Исправленная версия) ===
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
                            if (q.type === 'FETCH' || q.type === 'COLLECT' || q.type === 'BOSS_HUNT') {
                                player.inventory = player.inventory.filter(item => {
                                    if (!item.isQuestItem) return true;
                                    const isTypeMatch = (item.type === q.target.itemType);
                                    const isNameMatch = (!q.target.itemName || item.name.includes(q.target.itemName));
                                    const isUniqueMatch = q.target.uniqueId ? (item.uniqueId === q.target.uniqueId) : true;
                                    if (isTypeMatch && isNameMatch && isUniqueMatch) {
                                        return false; 
                                    }
                                    return true;
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
    
    // === ПРОВЕРКА: ЕСТЬ ЛИ УЖЕ АКТИВНЫЙ НЕВЫПОЛНЕННЫЙ КВЕСТ? ===
    const hasActiveUnfinishedQuest = activeQuests.some(q => !q.isCompleted);
    
    if (hasActiveUnfinishedQuest) {
        const unfinishedQuest = activeQuests.find(q => !q.isCompleted);
        RenderModule.log(`${npc.name}: "Сначала заверши предыдущее задание! Ищи ${unfinishedQuest.target.locationName}."`, "info");
        return true; // Блокируем выдачу нового квеста
    }

    // === ПРОВЕРКА: ЕСТЬ ЛИ КВЕСТ, КОТОРЫЙ ВЫПОЛНЕН, НО НЕ СДАН? ===
    const hasUnclaimedReward = activeQuests.some(q => q.isCompleted && !q.isTurnedIn);
    if (hasUnclaimedReward) {
        const rewardQuest = activeQuests.find(q => q.isCompleted && !q.isTurnedIn);
        // Если этот квест был взят в ЭТОМ же городе, то сдаем его
        if (rewardQuest.originX === cityGx && rewardQuest.originY === cityGy) {
             // Логика сдачи квеста (копия из Сценария 0 ниже)
             // ... (код сдачи квеста) ...
             // Для краткости я опущу полный код сдачи здесь, так как он ниже в Сценарии 0
             // Но важно: если мы здесь, значит мы в родном городе и можем сдать квест.
             // Лучше всего перенаправить поток вниз к "Сценарию 0", но для этого нужно правильно сгенерировать ID.
             // Поэтому проще всего оставить логику сдачи в "Сценарии 0", а здесь просто подсказать игроку.
             RenderModule.log(`${npc.name}: "Ты выполнил мое поручение! Подойди ближе, чтобы получить награду."`, "info");
             // Мы не возвращаем true, чтобы позволить коду ниже обработать клик как попытку сдачи.
        } else {
             RenderModule.log(`${npc.name}: "Ты выполнил чье-то поручение, но это не мое. Вернись туда, где брал задание."`, "info");
             return true;
        }
    }

    let npcIndex = 0;
    for(let i=0; i<npc.name.length; i++) npcIndex += npc.name.charCodeAt(i);

    const tempQuest = QuestSystemModule.createQuest(cityGx, cityGy, npcIndex % 5);
    const questId = tempQuest.id;
    
    const alreadyActive = activeQuests.some(q => q.id === questId);
    const alreadyDone = completedQuestIds.has(questId);

    // Сценарий 0: Квест выполнен, но награда еще не получена (СДАЧА КВЕСТА)
    // Этот блок сработает, если мы в том же городе, где брали квест
    if (alreadyActive) {
        const q = activeQuests.find(q => q.id === questId);
        if (q.isCompleted && !q.isTurnedIn) {
            
            // === ОЧИСТКА ИНВЕНТАРЯ ОТ КВЕСТОВЫХ ПРЕДМЕТОВ ===
            if (q.type === 'FETCH' || q.type === 'COLLECT' || q.type === 'BOSS_HUNT') {
                player.inventory = player.inventory.filter(item => {
                    if (!item.isQuestItem) return true;
                    const isTypeMatch = (item.type === q.target.itemType);
                    const isNameMatch = (!q.target.itemName || item.name.includes(q.target.itemName));
                    const isUniqueMatch = q.target.uniqueId ? (item.uniqueId === q.target.uniqueId) : true;
                    if (isTypeMatch && isNameMatch && isUniqueMatch) {
                        return false; 
                    }
                    return true;
                });
            }
            // ========================================================

            player.gold += q.rewardGold;
            q.isTurnedIn = true; 
            
            RenderModule.log(`🏆 Квест сдан! Получено: ${q.rewardGold} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            
            RenderModule.updateQuestBriefing(null); 

            activeQuests = activeQuests.filter(aq => aq.id !== questId);
            completedQuestIds.add(questId);
            updateAbandonButton(activeQuests.length > 0);
            updateQuestCompass();
            
            // === ВАЖНО: Открываем окно завершения для всех типов квестов ===
            if (typeof openQuestWindow === 'function') {
                openQuestWindow(q, true);
            }

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
        updateAbandonButton(true);
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

        // Удаляем старые слушатели
        canvas.ontouchstart = null; 
        canvas.onmousedown = null;

        // === ОБРАБОТКА КЛИКОВ МЫШЬЮ (ДЛЯ ПК) ===
        canvas.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return; // Только левая кнопка
            
            const clientX = e.clientX;
            const clientY = e.clientY;

            // Приоритет модальных окон
            if (isReadingQuest) { handleQuestClick(clientX, clientY); return; }
            if (isShopOpen || isInnOpen) return; // Блокируем клики сквозь HTML-окна
            
            // Тактический режим: осмотр юнитов
            if (window.gameMode === 'tactical') {
                inspectTacticalUnit(clientX, clientY);
                return;
            }
            
            // Подземелье: осмотр врагов/предметов/NPC
            if (window.gameMode === 'dungeon') {
                handleMapClick(clientX, clientY);
            }
        });

        // === ОБРАБОТКА ТАПОВ (ДЛЯ МОБИЛЬНЫХ) ===
        canvas.addEventListener("touchstart", (e) => {
            e.preventDefault();
            
            const touch = e.touches[0];
            const clientX = touch.clientX;
            const clientY = touch.clientY;

            // 0. ПРОВЕРКА ОКНА СЮЖЕТА
            if (isReadingQuest) {
                handleQuestClick(clientX, clientY);
                return; 
            }

            // 1. ПРОВЕРКА ПОСТОЯЛОГО ДВОРА
            if (isInnOpen) {
                handleInnClick(clientX, clientY);
                return; 
            }

            // 2. ПРОВЕРКА МАГАЗИНА
            if (isShopOpen) {
                handleShopClick(clientX, clientY);
                return; 
            }

            // === НОВОЕ: ТАКТИЧЕСКИЙ РЕЖИМ ===
            if (window.gameMode === 'tactical') {
                handleTacticalTouch(clientX, clientY);
                return;
            }

            // 3. БЛОКИРОВКА ПРИ ЗАНЯТОСТИ ИЛИ СМЕРТИ
            if (busy || (player && player.hp <= 0)) return;

            // 4. СТАНДАРТНОЕ ДВИЖЕНИЕ И ОСМОТР (Подземелье / Глобальная карта)
            const rect = canvas.getBoundingClientRect();
            const touchX = clientX - rect.left;
            const touchY = clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const offsetX = touchX - centerX;
            const offsetY = touchY - centerY;

            // === ЛОГИКА "ВИРТУАЛЬНОГО ДЖОЙСТИКА" С ОСМОТРОМ ===
            
            // А. Если тап далеко от центра -> Считаем это кликом по объекту (Осмотр)
            // Это позволяет тапать по врагам/предметам в подземелье для просмотра статов
            if (Math.abs(offsetX) > 30 || Math.abs(offsetY) > 30) {
                if (window.gameMode === 'dungeon') {
                    // Вызываем осмотр, но НЕ прерываем функцию (нет return)!
                    // Это позволит игроку одновременно осмотреть врага и сделать шаг к нему.
                    handleMapClick(clientX, clientY);
                }
            }

            // Б. Расчет направления движения (выполняется ВСЕГДА)
            let dx = 0, dy = 0;
            
            // Если тап очень близко к центру (радиус 20px), считаем это пропуском хода
            if (Math.abs(offsetX) < 20 && Math.abs(offsetY) < 20) {
                dx = 0; dy = 0;
            } else if (Math.abs(offsetX) > Math.abs(offsetY)) {
                dx = offsetX > 0 ? 1 : -1;
            } else {
                dy = offsetY > 0 ? 1 : -1;
            }
            
            // Выполняем ход
            if (window.gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }
            
        }, { passive: false });
        
        if (isMobileDevice()) {
            RenderModule.log("💡 Тапните по объекту для осмотра или по краю экрана для движения", "info");
        }
    }    

    // === ОБРАБОТКА ТАПОВ В ТАКТИЧЕСКОМ БОЮ (ИСПРАВЛЕННАЯ) ===
    // === ОБРАБОТКА ТАПОВ В ТАКТИЧЕСКОМ БОЮ (ФИНАЛЬНАЯ ВЕРСИЯ) ===
    function handleTacticalTouch(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas || !tacticalState) return;

        const rect = canvas.getBoundingClientRect();
        
        // 1. УЧИТЫВАЕМ МАСШТАБИРОВАНИЕ CANVAS (CSS Transform)
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // Переводим экранные координаты тапа во внутренние координаты канваса
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // 2. Проверяем, попал ли тап в панель Инвентаря (Меню Тактики)
        const invPanel = document.getElementById("inventory-panel");
        if (invPanel) {
            const invRect = invPanel.getBoundingClientRect();
            if (clientX >= invRect.left && clientX <= invRect.right &&
                clientY >= invRect.top && clientY <= invRect.bottom) {
                
                const panelY = clientY - invRect.top;
                const panelHeight = invRect.height;
                const sectionHeight = panelHeight / 5;
                const index = Math.floor(panelY / sectionHeight);
                const keys = ['1', '2', '3', '4', '5'];
                
                if (keys[index]) {
                    handleInput({ key: keys[index] });
                }
                return; 
            }
        }

        // 3. Тап по полю боя
        const tileW = TilesetRenderer.TILE_SIZE; 
        const tileH = TilesetRenderer.TILE_SIZE;

        // Рассчитываем смещение арены (центрование)
        const arenaPixelWidth = tacticalState.arena.width * tileW;
        const arenaPixelHeight = tacticalState.arena.height * tileH;
        
        const offsetX = Math.floor((canvas.width - arenaPixelWidth) / 2);
        const offsetY = Math.floor((canvas.height - arenaPixelHeight) / 2);

        // Вычисляем координаты тапа ВНУТРИ сетки арены (в тайлах)
        const gridX = Math.floor((clickX - offsetX) / tileW);
        const gridY = Math.floor((clickY - offsetY) / tileH);

        // Проверка: попал ли тап внутрь арены
        if (gridX >= 0 && gridX < tacticalState.arena.width && 
            gridY >= 0 && gridY < tacticalState.arena.height) {
            
            // А. ПРОВЕРКА НА ОСМОТР ЮНИТА (Враг или Союзник)
            let inspectedUnit = null;
            
            // Ищем врага в этой клетке (независимо от расстояния до игрока)
            const enemy = tacticalState.enemyUnits.find(e => e.hp > 0 && e.x === gridX && e.y === gridY);
            if (enemy) {
                inspectedUnit = { name: enemy.name, hp: enemy.hp, maxHp: enemy.maxHp, atk: enemy.atk, def: enemy.def, type: "enemy" };
            } else {
                // Ищем союзника в этой клетке
                const ally = tacticalState.playerArmy.find(a => a.hp > 0 && a.x === gridX && a.y === gridY);
                if (ally) {
                    inspectedUnit = { name: ally.name, hp: ally.hp, maxHp: ally.maxHp, atk: ally.atk, def: ally.def, type: "ally" };
                }
            }

            if (inspectedUnit) {
                // Если кликнули по юниту — показываем статы в инспекторе и НЕ двигаемся
                const details = `HP: ${inspectedUnit.hp}/${inspectedUnit.maxHp}\nATK: ${inspectedUnit.atk} | DEF: ${inspectedUnit.def}`;
                RenderModule.updateInspector(inspectedUnit.type === "enemy" ? `⚔️ ${inspectedUnit.name}` : `🛡️ ${inspectedUnit.name}`, details, inspectedUnit.type);
                return; // Прерываем функцию, чтобы не сработало движение
            }

            // Б. ДВИЖЕНИЕ В СТОРОНУ ТАПА
            // Если клетка пуста, вычисляем направление от игрока к точке тапа
            const dx = gridX - tacticalState.playerUnit.x;
            const dy = gridY - tacticalState.playerUnit.y;

            // Math.sign вернет -1, 0 или 1, определяя направление движения
            // Это позволяет тапать в любой конец карты, и герой сделает шаг в ту сторону
            TacticalBattleModule.processBattleTurn(Math.sign(dx), Math.sign(dy), window.currentTactic);
        }
    }
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }


    // === ОСМОТР ЮНИТА В ТАКТИЧЕСКОМ БОЮ ===
    function inspectTacticalUnit(clientX, clientY) {
        if (!tacticalState) return;

        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // Переводим координаты клика в пиксели канваса
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        const tileW = TilesetRenderer.TILE_SIZE;
        const tileH = TilesetRenderer.TILE_SIZE;

        // Рассчитываем смещение арены (центрование), точно как в рендере
        const arenaPixelWidth = tacticalState.arena.width * tileW;
        const arenaPixelHeight = tacticalState.arena.height * tileH;
        
        const offsetX = Math.floor((canvas.width - arenaPixelWidth) / 2);
        const offsetY = Math.floor((canvas.height - arenaPixelHeight) / 2);

        // Вычисляем координаты клетки в сетке арены
        const gridX = Math.floor((clickX - offsetX) / tileW);
        const gridY = Math.floor((clickY - offsetY) / tileH);

        // Ищем врага в этой клетке
        const enemy = tacticalState.enemyUnits.find(e => 
            e.hp > 0 && e.x === gridX && e.y === gridY
        );

        if (enemy) {
            // Формируем текст для инспектора
            const details = `HP: ${enemy.hp}/${enemy.maxHp}\nATK: ${enemy.atk} | DEF: ${enemy.def}`;
            
            // Вызываем стандартную функцию обновления инспектора
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(`⚔️ ${enemy.name}`, details, "enemy");
            }
        } else {
            // Если кликнули в пустоту, можно очистить инспектор или оставить как есть
            // RenderModule.updateInspector("Пусто", "Здесь никого нет...", "neutral");
        }
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
    function moveTacticalEnemies() {
        if (!tacticalState) return;
        
        const ENEMY_SPEED_THRESHOLD = 10; 

        tacticalState.enemyUnits.forEach(unit => {
            if (unit.hp <= 0) return;
            
            if (unit.energy === undefined) unit.energy = 0;
            unit.energy += unit.speed || 5;

            if (unit.energy >= ENEMY_SPEED_THRESHOLD) {
                unit.energy -= ENEMY_SPEED_THRESHOLD;
                
                // 1. Поиск цели (Игрок или его армия)
                let target = null;
                let minDist = Infinity;
                
                // Проверяем дистанцию до игрока
                const distToPlayer = Math.abs(unit.x - tacticalState.playerUnit.x) + Math.abs(unit.y - tacticalState.playerUnit.y);
                if (distToPlayer < minDist) {
                    minDist = distToPlayer;
                    target = tacticalState.playerUnit;
                }

                // Проверяем дистанцию до армии игрока
                if (tacticalState.playerArmy) {
                    tacticalState.playerArmy.forEach(ally => {
                        if (ally.hp > 0) {
                            const d = Math.abs(unit.x - ally.x) + Math.abs(unit.y - ally.y);
                            if (d < minDist) {
                                minDist = d;
                                target = ally;
                            }
                        }
                    });
                }

                if (target) {
                    // А. Если рядом - Атакуем
                    if (minDist === 1) {
                        const dmg = Math.max(1, unit.atk - target.def);
                        target.hp -= dmg;
                        
                        if (target === tacticalState.playerUnit) {
                            RenderModule.log(`${unit.name} наносит вам ${dmg} урона!`, "combat");
                        }
                    } 
                    // Б. Если далеко - Идем по прямой (Манхэттенское расстояние)
                    else {
                        const dx = Math.sign(target.x - unit.x);
                        const dy = Math.sign(target.y - unit.y);
                        
                        const nx = unit.x + dx;
                        const ny = unit.y + dy;

                        // Проверка коллизий (чтобы враги не слипались)
                        const isBlocked = tacticalState.enemyUnits.some(e => e !== unit && e.hp > 0 && e.x === nx && e.y === ny) ||
                                          (nx === tacticalState.playerUnit.x && ny === tacticalState.playerUnit.y && minDist > 1);

                        if (!isBlocked && nx >= 0 && nx < tacticalState.arena.width && ny >= 0 && ny < tacticalState.arena.height) {
                            unit.x = nx;
                            unit.y = ny;
                        }
                    }
                }
            }
        });
    }



    
    function initTacticalBattle(enemyArmyData) {
        console.log("🚀 [Tactical] Инициализация боя...");
        window.gameMode = 'tactical';
        busy = true; 
        
        if (typeof hideGlobalUI === 'function') hideGlobalUI();
        
        const globalPos = GlobalMapModule.getPlayerPosition();
        const terrainType = GlobalMapModule.getTileType(globalPos.x, globalPos.y);
        const arena = TacticalMapModule.generateArena(terrainType);

        // === АУРА КОМАНДИРА (Бонус от прогресса игрока) ===
        const playerLevel = player.level || 1;
        const auraHpMult = 1 + (playerLevel - 1) * 0.1;  
        const auraAtkMult = 1 + (playerLevel - 1) * 0.05; 
        const gearAtkBonus = Math.floor((player.bonusAtk || 0) * 0.2); 
        const gearDefBonus = Math.floor((player.bonusDef || 0) * 0.2);

        // 1. Создаем юнита-представителя игрока
        const playerUnit = {
            x: arena.startPosPlayer.x,
            y: arena.startPosPlayer.y,
            char: '@',
            color: '#00ff00',
            hp: player.hp,           
            maxHp: player.maxHp,     
            atk: player.atk,         
            def: player.def,         
            name: 'Герой',
            isPlayer: true
        };

        // 2. Разворачиваем армию игрока (С УЧЕТОМ ТЕКУЩЕГО СОСТОЯНИЯ)
        let playerArmyUnits = [];
        if (player.hasArmy && player.armyUnits && player.armyUnits.length > 0) {
            const squadsForBattle = player.armyUnits.slice(0, TacticalDataModule.MAX_PLAYER_SQUADS);
            
            squadsForBattle.forEach((armyUnit, squadIndex) => {
                // === ВАЖНО: Пропускаем мертвые отряды ===
                if (armyUnit.hp <= 0) return; 

                const unitCount = armyUnit.count || 1; 
                const squadStartX = arena.startPosPlayer.x + 2 + (squadIndex * 4); 
                const squadStartY = Math.floor(arena.height / 2) - Math.floor(unitCount / 2);

                for (let i = 0; i < unitCount; i++) {
                    let unitX = squadStartX;
                    let unitY = squadStartY + i;
                    
                    if (unitY < 0) unitY = 0;
                    if (unitY >= arena.height) unitY = arena.height - 1;
                    if (unitX >= arena.width) unitX = arena.width - 1;

                    // Базовые статы типа
                    const baseHp = armyUnit.type.hp;
                    const baseAtk = armyUnit.type.atk;
                    const baseDef = armyUnit.type.def;

                    // Расчет максимальных статов с учетом ауры и численности
                    const countBonusHp = Math.floor(baseHp * 0.1); 
                    const countBonusAtk = Math.floor(baseAtk * 0.05);
                    const calculatedMaxHp = Math.floor(baseHp * auraHpMult) + countBonusHp;
                    const calculatedAtk = Math.floor(baseAtk * auraAtkMult) + gearAtkBonus + countBonusAtk;   
                    const calculatedDef = Math.floor(baseDef * auraAtkMult) + gearDefBonus;   

                    // === ВАЖНО: Используем текущие HP отряда, но не больше максимума ===
                    // Если отряд был ранен, его HP будет меньше calculatedMaxHp
                    const currentHpRatio = armyUnit.hp / armyUnit.maxHp;
                    const startHp = Math.max(1, Math.floor(calculatedMaxHp * currentHpRatio));

                    playerArmyUnits.push({
                        ...armyUnit, 
                        x: unitX,
                        y: unitY,
                        hp: startHp,       // <--- Текущее здоровье
                        maxHp: calculatedMaxHp, // <--- Максимальное здоровье с баффами
                        char: armyUnit.type.sprite || '?', 
                        color: '#44ff44', 
                        sprite: armyUnit.type.sprite || '?',
                        type: armyUnit.type,       
                        isPlayerSide: true,
                        name: `${armyUnit.type.name} #${i+1}`, 
                        atk: calculatedAtk,   
                        def: calculatedDef,   
                        speed: armyUnit.type.speed || 5, 
                        energy: 0,                     
                        range: armyUnit.type.range || 1,
                        squadId: squadIndex 
                    });
                }
            });
        }

        // 3. Разворачиваем вражескую армию
        const enemyUnits = [];
        let startX = arena.startPosEnemy.x;
        let startY = arena.startPosEnemy.y;
        
        const difficultyMult = WorldCurveModule.getEnemyMultiplier(globalPos.x, globalPos.y);

        enemyArmyData.units.forEach((armyUnit, index) => {
            const xOffset = Math.floor(index / 5);
            const yOffset = (index % 2 === 0) ? 1 : -1;
            let unitX = startX - xOffset; 
            let unitY = startY + (index % 5) * yOffset;
            
            unitX = Math.max(0, Math.min(arena.width - 1, unitX));
            unitY = Math.max(0, Math.min(arena.height - 1, unitY));

            const scaledHp = Math.max(1, Math.floor(armyUnit.type.hp * difficultyMult));
            const scaledAtk = Math.max(1, Math.floor(armyUnit.type.atk * Math.sqrt(difficultyMult)));
            const scaledDef = Math.max(0, Math.floor(armyUnit.type.def * Math.pow(difficultyMult, 0.3)));

            enemyUnits.push({
                ...armyUnit,
                x: unitX,
                y: unitY,
                hp: scaledHp,      
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
    }    // === ЗАВЕРШЕНИЕ ТАКТИЧЕСКОГО БОЯ ===
    // === ПРОВЕРКА ОКОНЧАНИЯ ТАКТИЧЕСКОГО БОЯ (ЕДИНАЯ ТОЧКА) ===
    function checkBattleEnd(state) {
        if (!state) return;

        // 1. Проверка поражения:
        // А) Игрок мертв (HP <= 0)
        // Б) Игрок при смерти (HP <= 10) -> Автоматический побег по ТЗ
        const isDead = state.playerUnit.hp <= 0;
        const isCritical = state.playerUnit.hp <= 10 && state.playerUnit.hp > 0;
        
        // 2. Проверка победы: все враги мертвы
        const isVictory = state.enemyUnits.length === 0;

        if (isDead) {
            RenderModule.log("💀 Ваш отряд разбит! Вы погибли.", "combat");
            setTimeout(() => endTacticalBattle(false), 1000);
        } else if (isCritical) {
            RenderModule.log("💨 Ваши силы на исходе! Вы в панике сбегаете с поля боя!", "combat");
            setTimeout(() => endTacticalBattle(false), 800);
        } else if (isVictory) {
            RenderModule.log("🎉 ПОБЕДА! Враг повержен!", "event");
            setTimeout(() => endTacticalBattle(true), 1500);
        }
    }

    // === ЗАВЕРШЕНИЕ ТАКТИЧЕСКОГО БОЯ ===
    function endTacticalBattle(victory) {
        // 1. Синхронизация состояния игрока перед выходом
        if (tacticalState && tacticalState.playerUnit) {
            const realPlayer = GameModule.getPlayer();
            if (realPlayer) {
                // Переносим HP из тактической копии в реального игрока
                realPlayer.hp = tacticalState.playerUnit.hp;
                
                // === НОВОЕ: СПАСЕНИЕ ПРИ ОТРИЦАТЕЛЬНОМ HP ===
                // Если игрок проиграл и его HP <= 0, даем ему шанс выжить (5 HP)
                if (!victory && realPlayer.hp <= 0) {
                    realPlayer.hp = 5;
                    RenderModule.log("🚑 Вас чудом вытащили с поля боя! Вы очнулись с 5 HP.", "info");
                }

                // Если игрок все еще мертв (например, после спасения HP стало > 0, но логика выше уже сработала)
                // Блокируем управление только если HP действительно 0 или меньше (что теперь маловероятно благодаря спасению)
                if (realPlayer.hp <= 0) {
                    window.gameMode = 'global';
                    if (typeof showGlobalUI === 'function') showGlobalUI();
                    renderGlobalMap();
                    RenderModule.log("💀 Вы погибли в тактическом бою. F5 для рестарта.", "combat");
                    busy = true; // Блокируем управление навсегда
                    tacticalState = null;
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

        // === СОХРАНЕНИЕ СОСТОЯНИЯ ОТРЯДОВ ===
        if (tacticalState && tacticalState.playerArmy && player && player.armyUnits) {
            // Проходим по всем отрядам игрока (даже тем, что не влезли в бой)
            for (let i = 0; i < player.armyUnits.length; i++) {
                const globalSquad = player.armyUnits[i];
                
                // Ищем соответствующего юнита на поле боя по индексу (squadId)
                const battlefieldUnit = tacticalState.playerArmy.find(u => u.squadId === i);

                if (battlefieldUnit) {
                    // Если юнит был в бою, обновляем его статы (HP, Atk, Def)
                    globalSquad.hp = battlefieldUnit.hp;
                    globalSquad.maxHp = battlefieldUnit.maxHp;
                    globalSquad.atk = battlefieldUnit.atk;
                    globalSquad.def = battlefieldUnit.def;
                    
                    // Если юнит погиб в бою, обнуляем его HP в глобальном массиве
                    if (battlefieldUnit.hp <= 0) {
                        globalSquad.hp = 0;
                    }
                } 
            }
            
            // Проверка на полную потерю армии
            const aliveCount = player.armyUnits.filter(u => u.hp > 0).length;
            if (aliveCount === 0 && player.hasArmy) {
                RenderModule.log("💀 Ваш отряд полностью уничтожен! Придется нанимать новый.", "combat");
                player.hasArmy = false;
                player.armyUnits = []; // Полная очистка
                GameModule.setGlobalFlag('player_has_squad', false);
            } else if (aliveCount > 0) {
                RenderModule.log(`🛡️ В строю осталось ${aliveCount} отрядов.`, "info");
            }
        }

        // 5. Очищаем состояние боя
        tacticalState = null;
        busy = false;

        // 6. Перерисовываем глобальную карту
        renderGlobalMap();
    }

    // В game.js, внутри enterPOI
    function enterPOI(poi) {
        busy = true;
        entrancePos = GlobalMapModule.getPlayerPosition();
        window.gameMode = 'dungeon';
         
        if (poi.type === 'city') {
            RenderModule.log(`Вы входите в город ${poi.name}`, "info");
            loadCityLevel(poi.x, poi.y, poi.name);
        } 
        else if (poi.type === 'fortress') {
            RenderModule.log(`Вы входите в ${poi.name}... Воздух здесь тяжелый от злобы.`, "event");
            // Загружаем как подземелье, но с флагом fortress
            currentDepth = 0;
            currentDungeonTypeName = 'fortress'; // Специальный тип
            currentDungeonFullName = poi.name;
            loadDungeonLevel(poi.x, poi.y, currentDepth, 'fortress', poi.name);
        }
        else if (poi.type === 'dungeon') {
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
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    function loadDungeonLevel(gx, gy, depth, dungeonType, dungeonName, entryPoint = null) {
        // 1. Сохраняем состояние ТЕКУЩЕГО уровня перед переходом
        saveCurrentDungeonState();
        
        // Очистка текущих сущностей
        enemies = [];
        items = [];
        npcs = [];
        window.currentCityNpcs = [];
        explored.clear();
        
        // === ОЧИСТКА ЛОВУШЕК ===
        traps = [];
        if (typeof visibleTraps !== 'undefined') {
            visibleTraps.clear();
        }

        // Обновляем глобальные переменные уровня ДО генерации
        dungeonX = gx;
        dungeonY = gy;
        currentDepth = depth;
        currentDungeonTypeName = dungeonType;
        currentDungeonFullName = dungeonName;

        // 2. Генерация карты
        const startPos = MapModule.generateWithType(gx, gy, depth, dungeonType, entryPoint);
    
        // 3. === ВОССТАНОВЛЕНИЕ ЛЕСТНИЦ ИЗ СОХРАНЕНИЙ (ФИКС БАГА С ПЕРЕХОДАМИ) ===
        const cacheKey = `${gx}_${gy}_${depth}`;
        const savedState = dungeonClearState.get(cacheKey);
        
        if (savedState && savedState.stairs) {
            // Восстанавливаем старые позиции лестниц, чтобы они совпадали с предыдущими переходами
            if (savedState.stairs.up) MapModule.stairsUp = savedState.stairs.up;
            if (savedState.stairs.down) MapModule.stairsDown = savedState.stairs.down;
        }

        // 4. Установка позиции игрока
        if (!player) {
            player = EntityModule.createPlayer(startPos.x, startPos.y);
        } 
        
        // Определяем целевую точку появления
        let targetPos = startPos; // По умолчанию - то, что дал генератор

        if (entryPoint === 'down') {
            // Спустились вниз -> появляемся у лестницы ВВЕРХ
            if (MapModule.stairsUp) targetPos = MapModule.stairsUp;
        } 
        else if (entryPoint === 'up') {
            // Поднялись вверх -> появляемся у лестницы ВНИЗ
            if (MapModule.stairsDown) targetPos = MapModule.stairsDown;
        } 
        else {
            // ПЕРВЫЙ ВХОД (entryPoint === null)
            // Игрок входит с глобальной карты -> должен появиться у лестницы ВВЕРХ (выход)
            if (MapModule.stairsUp) targetPos = MapModule.stairsUp;
        }

        // Применяем позицию
        player.x = targetPos.x;
        player.y = targetPos.y;
        
        // Отодвигаем игрока на безопасную клетку рядом с лестницей, 
        // чтобы он не стоял ровно на ней и не активировал переход повторно
        const safePos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(player, 3) : player;
        player.x = safePos.x;
        player.y = safePos.y;
    
        // 5. Спавн врагов, предметов и боссов
        spawnDungeonEntities(gx, gy, depth);

        // === ГЕНЕРАЦИЯ ЛОВУШЕК ===
        const maxTraps = Math.min(15, 5 + depth/3);
        if (typeof EntityModule.spawnTraps === 'function') {
            traps = EntityModule.spawnTraps(MapModule.currentMapData, player, maxTraps, depth);
            if (traps.length > 0) {
                RenderModule.log(`⚠️ Вы чувствуете запах опасности... здесь много ловушек.`, "info");
            }
        }

        // 6. Проверка квестов и спавн квестовых предметов
        if (typeof QuestSystemModule !== 'undefined') {
            activeQuests.forEach(q => {
                if (!q.isActive || q.isCompleted) return;

                // 1. Спавн предмета для FETCH (С ПРОВЕРКОЙ ГЛУБИНЫ И ДУБЛИКАТОВ)
                if (q.type === 'FETCH' && 
                    q.target.targetX === gx && 
                    q.target.targetY === gy) {
                    
                    // Проверка глубины: спавним только если достигли нужного уровня
                    const reqDepth = q.target.recommendedDepth || q.target.targetDepth || 0;
                    const isDeepEnough = !reqDepth || ((currentDepth + 1) >= reqDepth);
                    
                    // Проверка дубликатов: если уникальный предмет уже у игрока - не спавним
                    let hasItem = false;
                    if (q.target.uniqueId) {
                        hasItem = player.inventory.some(i => i.uniqueId === q.target.uniqueId);
                    }

                    if (isDeepEnough && !hasItem) {
                        spawnQuestItem(q);
                    }
                }

                // 2. ГАРАНТИРОВАННЫЙ СПАВН КНИГ ДЛЯ SCHOLAR/COLLECT
                if ((q.type === 'SCHOLAR' || q.type === 'COLLECT') && 
                    q.target.itemType === 'book') {
                    
                    const existingBooks = items.filter(i => i.type === 'book' && i.isQuestItem).length;
                    const targetCount = Math.min(q.maxProgress, 3);
                    
                    if (existingBooks < targetCount) {
                        const booksToSpawn = targetCount - existingBooks;
                        for(let i = 0; i < booksToSpawn; i++) {
                            spawnScholarBook(q);
                        }
                    }
                }

                // 3. ПРОВЕРКА DIGGER (Глубинный разведчик)
                if (q.type === 'DIGGER') {
                    if (q.target.targetX === gx && 
                        q.target.targetY === gy && 
                        (currentDepth + 1) >= q.target.targetDepth) { 
                        
                        q.progress = q.maxProgress;
                        q.isCompleted = true;
                        
                        RenderModule.log(`🏆 Квест выполнен: Вы достигли глубины ${currentDepth + 1} в ${dungeonName}!`, "event");
                        RenderModule.updateQuestBriefing(q);
                        updateQuestCompass();
                    }
                }

                // 4. ПРОВЕРКА EXPLORE (Исследователь)
                if (q.type === 'EXPLORE') {
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
    
        // 7. Финальная настройка окружения
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
        updateTrapVisibility();
        renderFrame();
    }
    
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    function spawnDungeonEntities(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        const savedState = dungeonClearState.get(cacheKey);

        // === ЛОГИКА КОЛИЧЕСТВА ВРАГОВ ===
        let enemyCount = 8 + Math.floor(depth * 1.5);
        
        // === КРЕПОСТЬ: КИШИТ МОНСТРАМИ ===
        const isFortress = (currentDungeonTypeName === 'fortress');
        
        if (isFortress) {
            enemyCount = 50; // Фиксированное большое количество
            RenderModule.log("⚠️ Здесь невероятно много врагов! Они повсюду!", "combat");
        } else if (savedState) {
            // Если уровень уже посещался, ограничиваем спавн сохраненным числом
            enemyCount = Math.min(enemyCount, savedState.enemies);
            
            // Выводим сообщение только если враги еще остались
            if (savedState.enemies > 0) {
                RenderModule.log(`👣 Вы замечаете следы своей предыдущей битвы. Осталось врагов: ~${savedState.enemies}`, "info");
            }
        }
        
        // 2. Множитель сложности врагов
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy) * (1 + depth * 0.2);
        
        // 3. Фильтрация врагов по уровню сложности
        let availableEnemies = DataModule.ENEMY_TYPES;
        if (!isFortress) { // В крепости могут быть любые монстры
            if (depth < 3) {
                availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Гоблин", "Крыса", "Волк", "Слизень"].includes(e.name));
            } else if (depth < 7) {
                availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Бандит", "Скелет", "Орк", "Зомби"].includes(e.name));
            }
        }

        // Спавн врагов (если их больше 0)
        if (enemyCount > 0) {
            enemies = EntityModule.spawnEnemies(
                MapModule.currentMapData,
                player,
                availableEnemies,
                enemyCount,
                enemyMult,
                3, // Минимальная дистанция от игрока
                depth
            );
        } else {
            enemies = []; // Гарантируем пустой массив для зачищенного уровня
        }
        
        // === ЛОГИКА КОЛИЧЕСТВА ПРЕДМЕТОВ ===
        let itemCount = 4;
        if (isFortress) {
            itemCount = 20; // Больше лута в крепости
        }

        // 4. Спавн предметов и золота
        const itemMult = WorldCurveModule.getItemPowerMultiplier(gx, gy) * (1 + depth * 0.15);
        
        if (EntityModule.spawnItems) {
            items = EntityModule.spawnItems(
                MapModule.currentMapData,
                player,
                DataModule.ITEM_TYPES,
                itemCount,
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
        // Используем savedState, который уже объявлен в начале функции
        const bossAlreadyDefeated = savedState && savedState.bossDefeated;
        const savedBossName = savedState ? savedState.bossName : null;

        // Босс спавнится только в обычных данжах типа 'boss' или если это квестовый босс
        // В крепости босс не спавнится автоматически, если только это не специальный тип
        if ((currentDungeonTypeName === 'boss' || currentDungeonTypeName === 'fortress') && !bossAlreadyDefeated) {
            // Проверяем, жив ли уже босс на этом уровне (защита от дублей)
            const isBossAlive = enemies.some(e => e.isBoss);

            if (!isBossAlive) {
                let bossPos = null;
                let attempts = 0;
                
                // Поиск позиции подальше от игрока (>15 клеток)
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
                        let bossData;
                        let isQuestBoss = false;

                        // === 1. ПРОВЕРКА АКТИВНОГО КВЕСТА BOSS_HUNT ===
                        if (typeof QuestSystemModule !== 'undefined') {
                            const bossQuest = activeQuests.find(q => 
                                q.type === 'BOSS_HUNT' && 
                                !q.isCompleted && 
                                q.target.targetX === gx && 
                                q.target.targetY === gy
                            );

                            if (bossQuest) {
                                bossData = {
                                    fullName: bossQuest.target.enemyName,
                                    bossType: bossQuest.target.enemyName
                                };
                                isQuestBoss = true;
                            }
                        }

                        // === 2. ФОЛБЭК: СЛУЧАЙНЫЙ БОСС (если нет квеста) ===
                        if (!bossData) {
                            // Если это крепость, можно дать ей уникальное имя или использовать стандартное
                            if (isFortress) {
                                bossData = {
                                    fullName: "Страж Крепости",
                                    bossType: "Каменный Голем" // Или любой другой тип
                                };
                            } else {
                                bossData = NameGeneratorModule.generateBossName(gx, gy, depth);
                            }
                        }

                        // Создаем сущность босса
                        const bossEntity = EntityModule.createBoss(bossPos.x, bossPos.y, depth, bossData);
                        enemies.push(bossEntity);

                        // Логирование
                        if (isQuestBoss) {
                            RenderModule.log(`⚠️ ВЫ ЧУВСТВУЕТЕ ПРИСУТСТВИЕ ЦЕЛИ: ${bossEntity.name}!`, "combat");
                        } else {
                            RenderModule.log(`⚠️ Вы чувствуете присутствие: ${bossEntity.name}!`, "combat");
                        }
                    }
                }
            }
        } 
        // === ЛОГИКА ДЛЯ УЖЕ ПОБЕЖДЕННОГО БОССА ===
        else if (bossAlreadyDefeated) {
             // Если босс уже убит, мы НЕ спавним его снова.
             if (savedBossName) {
                 // RenderModule.log(`💀 Логово пусто. ${savedBossName} уже повержен.`, "info");
             }
        }
        
        const totalEnemies = enemies.length;
        console.log(`🕷️ [DEBUG] Уровень ${depth}: Создано врагов: ${totalEnemies}`, enemies.map(e => e.name));
        
        // === ОТЛАДКА ПРЕДМЕТОВ И ЗОЛОТА ===
        if (items.length > 0) {
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
                uniqueId: template.id, 
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
    // === ГАРАНТИРОВАННЫЙ СПАВН КНИГИ ДЛЯ КВЕСТА SCHOLAR ===
    function spawnScholarBook(quest) {
        const bookTemplate = DataModule.ITEM_TYPES.find(t => t.type === 'book');
        if (!bookTemplate) return;

        const questBook = EntityModule.createItem(bookTemplate, 0, 0, 1.0);
        questBook.name = `✨ ${questBook.name} (Квест)`;
        questBook.isQuestItem = true;

        let spawnPos = null;
        // Стратегия: Ищем место рядом с игроком
        if (player) {
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(player, 5) : null;
        }
        
        // Если рядом занято, ищем случайное место
        if (!spawnPos || items.some(i => i.x === spawnPos.x && i.y === spawnPos.y)) {
             spawnPos = MapModule.getRandomFloor ? MapModule.getRandomFloor(player) : null;
        }

        if (spawnPos) {
            questBook.x = spawnPos.x;
            questBook.y = spawnPos.y;
            items.push(questBook);
        }
    }

    function saveCurrentDungeonState() {
        if (window.gameMode === 'dungeon' && currentDepth >= 0) {
            const cacheKey = `${dungeonX}_${dungeonY}_${currentDepth}`;
            const aliveEnemies = enemies.filter(e => e.hp > 0);
        
            let bossDefeated = false;
            if (currentDungeonTypeName === 'boss') {
                const bossAlive = aliveEnemies.some(e => e.isBoss);
                bossDefeated = !bossAlive;
            }
        
            // === НОВОЕ: Сохраняем позиции лестниц ===
            const savedStairs = {
                up: MapModule.stairsUp ? { ...MapModule.stairsUp } : null,
                down: MapModule.stairsDown ? { ...MapModule.stairsDown } : null
            };

            dungeonClearState.set(cacheKey, {
                enemies: aliveEnemies.length,
                bossDefeated: bossDefeated,
                stairs: savedStairs // <--- ДОБАВЛЕНО
           });
        }
    }


    // === СОХРАНЕНИЕ ИМЕНИ УБИТОГО БОССА В КЭШ ===
    function saveBossNameToCache(gx, gy, depth, bossName) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        let state = dungeonClearState.get(cacheKey);
        if (!state) state = {};
        
        state.bossDefeated = true;
        state.bossName = bossName; // Запоминаем конкретное имя
        
        dungeonClearState.set(cacheKey, state);
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
        const isFortress = (currentDungeonTypeName === 'fortress');
        window._cachedPassives = null; // Сбрасываем кэш перед циклом
        // === НОВОЕ: Проверка эффекта замедления один раз за кадр ===
        let hasEnemySlow = false;
        if (typeof EffectSystemModule !== 'undefined' && typeof EffectSystemModule.getPassiveEffects === 'function') {
            const passives = EffectSystemModule.getPassiveEffects(player);
            if (passives.includes('enemy_slow')) {
                hasEnemySlow = true;
            }
        }

        enemies.forEach(e => {
            if (e.hp <= 0) return;
            
            if (e.speed === undefined) e.speed = 10; 
            if (e.energy === undefined) e.energy = Math.floor(Math.random() * e.speed);

            // === РАСЧЕТ ЭФФЕКТИВНОЙ СКОРОСТИ ===
            let effectiveSpeed = e.speed;
            if (hasEnemySlow) {
                // Уменьшаем скорость на 1, но не ниже 1 (чтобы враги не останавливались совсем)
                effectiveSpeed = Math.max(1, e.speed - 3);
            }

            // Начисляем энергию с учетом замедления
            e.energy += effectiveSpeed;

            if (e.energy >= PLAYER_SPEED_THRESHOLD) {
                e.energy -= PLAYER_SPEED_THRESHOLD;

                const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
                const aggroRange = isFortress ? 20 : (e.aggroOverride || 8);
                
                // === ПРОВЕРКА ПРОКЛЯТОГО КОЛЬЦА ===
                let isCursedAttraction = false;
                if (typeof EffectSystemModule !== 'undefined' && typeof EffectSystemModule.getPassiveEffects === 'function') {
                    // Кэшируем результат, чтобы не вызывать функцию для каждого врага отдельно
                    // (в идеале вынести проверку из цикла forEach, но для простоты оставим здесь, 
                    // т.к. getPassiveEffects очень легкая функция)
                    if (!window._cachedPassives) {
                        window._cachedPassives = EffectSystemModule.getPassiveEffects(player);
                    }
                    isCursedAttraction = window._cachedPassives.includes('cursed_attraction');
                }
                // ==================================

                // Если есть проклятие - враг видит игрока сквозь стены и на любом расстоянии
                const inSight = isCursedAttraction || (dist <= aggroRange);

                // === БОССЫ ===
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
                            // Босс атакует, если достиг игрока (учитывая размер 2x2)
                            const hitPlayer = (next.x === player.x && next.y === player.y) ||
                                              (next.x+1 === player.x && next.y === player.y) ||
                                              (next.x === player.x && next.y+1 === player.y) ||
                                              (next.x+1 === player.x && next.y+1 === player.y);
                            
                            if (hitPlayer) {
                                CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                                checkDeath();
                                return;
                            }
                            
                            // Проверка коллизий для босса (2x2)
                            const blockedByEnemy = enemies.some(other => other !== e && other.hp > 0 && (
                                (other.x === next.x && other.y === next.y) ||
                                (other.x === next.x+1 && other.y === next.y) ||
                                (other.x === next.x && other.y === next.y+1) ||
                                (other.x === next.x+1 && other.y === next.y+1)
                            ));
                            
                            if (!blockedByEnemy) {
                                nextX = next.x;
                                nextY = next.y;
                            }
                        }
                    } else {
                        // Случайное блуждание босса
                        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
                        dirs.sort(() => Math.random() - 0.5);
                        
                        for (const dir of dirs) {
                            const nx = e.x + dir.dx;
                            const ny = e.y + dir.dy;
                            
                            if (!MapModule.isWall(nx, ny) && 
                                !MapModule.isWall(nx+1, ny) && 
                                !MapModule.isWall(nx, ny+1) && 
                                !MapModule.isWall(nx+1, ny+1)) {
                                
                                // Не наступаем на игрока при блуждании
                                const hitPlayer = (nx === player.x && ny === player.y) || 
                                                  (nx+1 === player.x && ny === player.y) ||
                                                  (nx === player.x && ny+1 === player.y) ||
                                                  (nx+1 === player.x && ny+1 === player.y);
                                if (hitPlayer) continue;
                                
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

                } 
                // === ОБЫЧНЫЕ ВРАГИ ===
                else {
                    if (inSight) {
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
                                // === НОВАЯ ПРОВЕРКА: Игрок как препятствие ===
                                const isBlockedByPlayer = (next.x === player.x && next.y === player.y);
                                const isBlockedByNpc = window.currentCityNpcs && window.currentCityNpcs.some(n => n.x === next.x && n.y === next.y);
                                const isBlockedByEnemy = enemies.some(other => other !== e && other.hp > 0 && other.x === next.x && other.y === next.y);
                                
                                if (!isBlockedByNpc && !isBlockedByEnemy && !isBlockedByPlayer) {
                                    e.x = next.x;
                                    e.y = next.y;
                                } 
                                else if (isBlockedByPlayer) {
                                    // Если A* ведет прямо на игрока — атакуем вместо движения
                                    CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                                    checkDeath();
                                }
                            }
                        }
                    }
                    // Если игрок далеко (>20 в крепости или >8 в обычном данже)
                    else if (isFortress) {
                        // В крепости, если игрок далеко, враги могут стоять на страже или медленно бродить
                        if (Math.random() < 0.1) {
                             const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
                             const dir = dirs[Math.floor(Math.random() * dirs.length)];
                             const nx = e.x + dir.dx;
                             const ny = e.y + dir.dy;
                             
                             if (!MapModule.isWall(nx, ny)) {
                                 const isBlockedByNpc = window.currentCityNpcs && window.currentCityNpcs.some(n => n.x === nx && n.y === ny);
                                 const isBlockedByEnemy = enemies.some(other => other !== e && other.hp > 0 && other.x === nx && other.y === ny);
                                 if (!isBlockedByNpc && !isBlockedByEnemy) {
                                     e.x = nx;
                                     e.y = ny;
                                 }
                             }
                        }
                    }
                }
            }
        });
    }
    // === ДВИЖЕНИЕ СОЮЗНОЙ АРМИИ (НОВОЕ) ===
    function movePlayerArmy() {
        if (!tacticalState || !tacticalState.playerArmy) return;
        
        const tactic = window.currentTactic || 'hold';
        const PLAYER_SPEED_THRESHOLD = 10;

        tacticalState.playerArmy.forEach(unit => {
            if (unit.hp <= 0) return;
            
            // Инициализация энергии, если её нет
            if (unit.energy === undefined) unit.energy = 0;
            unit.energy += unit.speed || 5;

            if (unit.energy >= PLAYER_SPEED_THRESHOLD) {
                unit.energy -= PLAYER_SPEED_THRESHOLD;
                
                let targetX = unit.x;
                let targetY = unit.y;
                let actionTaken = false;

                // --- ЛОГИКА ПО ТАКТИКЕ ---
                
                // 1. ОТСТУПЛЕНИЕ (FLEE/RETREAT)
                if (tactic === 'retreat' || tactic === 'flee') {
                    // Двигаемся влево (к своему краю)
                    if (unit.x > 2) targetX = unit.x - 1;
                    actionTaken = true;
                }
                
                // 2. ДИСТАНЦИОННАЯ АТАКА (RANGED)
                else if (tactic === 'ranged' && unit.type && unit.type.range > 1) {
                    // Ищем ближайшего врага
                    let nearestEnemy = null;
                    let minDist = Infinity;
                    tacticalState.enemyUnits.forEach(e => {
                        if (e.hp > 0) {
                            const d = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y);
                            if (d < minDist) {
                                minDist = d;
                                nearestEnemy = e;
                            }
                        }
                    });

                    if (nearestEnemy) {
                        // Если враг в радиусе атаки - стреляем (пока просто урон без анимации)
                        if (minDist <= unit.type.range) {
                            const dmg = Math.max(1, unit.atk - nearestEnemy.def);
                            nearestEnemy.hp -= dmg;
                            RenderModule.log(`${unit.name} стреляет во врага на ${dmg} урона!`, "combat");
                            actionTaken = true; // Ход потрачен на выстрел
                        } else {
                            // Если далеко - идем к нему
                            targetX = unit.x + Math.sign(nearestEnemy.x - unit.x);
                            targetY = unit.y + Math.sign(nearestEnemy.y - unit.y);
                        }
                    }
                }

                // 3. НАСТУПЛЕНИЕ (ADVANCE) или УДЕРЖАНИЕ (HOLD) с поиском цели
                if (!actionTaken) {
                    let nearestEnemy = null;
                    let minDist = Infinity;
                    
                    tacticalState.enemyUnits.forEach(e => {
                        if (e.hp > 0) {
                            const d = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y);
                            if (d < minDist) {
                                minDist = d;
                                nearestEnemy = e;
                            }
                        }
                    });

                    if (nearestEnemy) {
                        // Если рядом - бьем
                        if (minDist === 1) {
                            const dmg = Math.max(1, unit.atk - nearestEnemy.def);
                            nearestEnemy.hp -= dmg;
                            RenderModule.log(`${unit.name} атакует врага на ${dmg} урона!`, "combat");
                            actionTaken = true;
                        } 
                        // Если далеко - идем к врагу (только если тактика не HOLD)
                        else if (tactic !== 'hold') {
                            targetX = unit.x + Math.sign(nearestEnemy.x - unit.x);
                            targetY = unit.y + Math.sign(nearestEnemy.y - unit.y);
                        }
                    }
                }

                // --- ПРИМЕНЕНИЕ ДВИЖЕНИЯ ---
                if (!actionTaken && (targetX !== unit.x || targetY !== unit.y)) {
                    // Простая проверка коллизий (чтобы не встать друг на друга)
                    const isBlocked = tacticalState.playerArmy.some(u => u !== unit && u.x === targetX && u.y === targetY) ||
                                      tacticalState.enemyUnits.some(e => e.x === targetX && e.y === targetY);
                    
                    if (!isBlocked && targetX >= 0 && targetX < tacticalState.arena.width && targetY >= 0 && targetY < tacticalState.arena.height) {
                        unit.x = targetX;
                        unit.y = targetY;
                    }
                }
            }
        });
    }    


    function processTacticalPlayerTurn(dx, dy) {
        if (!tacticalState || !tacticalState.playerUnit) return;
        const p = tacticalState.playerUnit;
        const nx = p.x + dx;
        const ny = p.y + dy;

        // Проверка границ арены
        if (nx < 0 || nx >= tacticalState.arena.width || ny < 0 || ny >= tacticalState.arena.height) return;

        // Проверка коллизий (враги, союзники)
        const enemy = tacticalState.enemyUnits.find(e => e.x === nx && e.y === ny && e.hp > 0);
        const ally = tacticalState.playerArmy.find(a => a.x === nx && a.y === ny && a.hp > 0);

        if (enemy) {
            // Атака врага
            const dmg = Math.max(1, p.atk - enemy.def);
            enemy.hp -= dmg;
            RenderModule.log(`⚔️ Вы нанесли ${dmg} урона!`, "combat");
        } else if (!ally) {
            // Движение
            p.x = nx;
            p.y = ny;
        }
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

    // === ПРОВЕРКА СМЕРТИ ВРАГОВ (ИСПРАВЛЕННАЯ ДЛЯ BOSS_HUNT) ===
    function checkDeath() {
        const deadEnemies = enemies.filter(e => e.hp <= 0);
        
        deadEnemies.forEach(enemy => {
            // 1. Выпадение лута
            CombatModule.dropLoot(enemy, currentDepth, items, RenderModule.log);
            
            // 2. Начисление опыта
            gainXp(10 + (currentDepth * 5));

            // 3. Проверка квестов
            if (typeof QuestSystemModule !== 'undefined') {
                [...activeQuests].forEach(q => {
                    if (q.isCompleted) return; // Пропускаем уже выполненные

                    // === СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ BOSS_HUNT ===
                    if (q.type === 'BOSS_HUNT') {
                        // Проверяем локацию
                        const isCorrectLocation = (dungeonX === q.target.targetX && dungeonY === q.target.targetY);
                        
                        if (isCorrectLocation) {
                            // Условие выполнения:
                            // 1. Либо убит именно БОСС с нужным именем
                            // 2. Либо убит ОБЫЧНЫЙ ВРАГ с нужным именем (фолбэк для квестов на мобов)
                            const isTargetBoss = enemy.isBoss && enemy.name === q.target.enemyName;
                            const isTargetMob = !enemy.isBoss && enemy.name === q.target.enemyName;

                            if (isTargetBoss || isTargetMob) {
                                q.progress++;
                                q.isCompleted = true; 
                                
                                const msgType = enemy.isBoss ? "🏆 БОСС ПОВЕРЖЕН!" : "💀 Цель ликвидирована!";
                                RenderModule.log(`${msgType} Квест "${q.target.enemyName}" выполнен!`, "event");
                                
                                RenderModule.updateQuestBriefing(q); 
                                updateQuestCompass(); 
                                
                                // Сохраняем в кэш только если это был реальный босс
                                if (enemy.isBoss) {
                                    saveBossNameToCache(dungeonX, dungeonY, currentDepth, enemy.name);
                                }
                            }
                        }
                    }
                    // >>> СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ СЮЖЕТНОГО BOUNTY <<<
                    else if (q.isChainQuest && q.type === 'BOUNTY' && !q.isCompleted) {
                        if (enemy.name === q.target.enemyName) {
                            q.progress++;
                            RenderModule.log(`🏹 Охота: ${q.target.enemyName} (${q.progress}/${q.maxProgress})`, "info");
                            
                            RenderModule.updateQuestBriefing(q); 
                            
                            if (q.progress >= q.maxProgress) {
                                q.isCompleted = true;
                                RenderModule.log(`🏆 Сюжетная охота завершена! Вернитесь в город за наградой.`, "event");
                                updateQuestCompass();
                            }
                            return; // Прерываем итерацию для этого квеста
                        }
                    }
                    // Стандартная проверка для остальных квестов (HUNT, FETCH и т.д.)
                    else {
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
    
    // === ОСНОВНОЙ ХОД ИГРЫ (ПОЛНАЯ ВЕРСИЯ С ЛОВУШКАМИ) ===
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

        // === 8.5. ПРОВЕРКА ЛОВУШЕК ===
        // Проверяем, наступил ли игрок на ловушку
        checkTrapTrigger(player.x, player.y);
        
        // Если игрок умер от ловушки, прерываем ход
        if (player.hp <= 0) {
            RenderModule.log("ВЫ ПОГИБЛИ в ловушке. F5 для рестарта.", "combat");
            busy = true;
            renderFrame();
            return;
        }

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
                    
                    // === ПРОВЕРКА КВЕСТА SCHOLAR (ЧТЕНИЕ КНИГ) ===
                    if (typeof QuestSystemModule !== 'undefined') {
                        let questUpdated = false;
                        activeQuests.forEach(q => {
                            if (!q.isCompleted && q.type === 'SCHOLAR') {
                                const wasUpdated = QuestSystemModule.checkProgress(q, { type: 'read_book' });
                                if (wasUpdated) questUpdated = true;
                            }
                        });
                        
                        // Если прогресс изменился, обновляем нижнюю панель
                        if (questUpdated) {
                            const scholarQuest = activeQuests.find(q => q.type === 'SCHOLAR' && !q.isCompleted);
                            if (scholarQuest) {
                                RenderModule.updateQuestBriefing(scholarQuest);
                            }
                            // Если квест завершился, переключаем компас на "Награда"
                            const completedScholar = activeQuests.find(q => q.type === 'SCHOLAR' && q.isCompleted);
                            if (completedScholar) {
                                updateQuestCompass();
                            }
                        }
                    }
                } else {
                     RenderModule.log(`Вы подобрали "${item.name}".`, "info ");
                }
            }  
            else {
                // Обычные предметы (оружие, броня, зелья, еда)
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot ");
            }

            // === ОБЩАЯ ПРОВЕРКА КВЕСТОВ НА ПОДБОР (FETCH / COLLECT) ===
            // Выполняется для любых подобранных предметов (кроме золота)
            if (item.type !== 'gold' && typeof QuestSystemModule !== 'undefined') {
                [...activeQuests].forEach(q => {
                    if (q.isCompleted) return; // Пропускаем выполненные
                    
                    // Проверяем только типы, требующие подбора
                    if (q.type === 'FETCH' || q.type === 'COLLECT') {
                        
                        let isItemMatch = false;
                        // 1. Проверка по уникальному ID (для сюжетных квестов)
                        if (q.target.uniqueId && item.uniqueId === q.target.uniqueId) {
                            isItemMatch = true;
                        } 
                        // 2. Проверка по типу и имени (для процедурных квестов)
                        else if ((item.type === q.target.itemType) && 
                                 (!q.target.itemName || item.name.includes(q.target.itemName))) {
                            isItemMatch = true;
                        }

                        if (isItemMatch) {
                            // Проверка локации (подземелья)
                            const isCorrectLocation = (
                                dungeonX === q.target.targetX && 
                                dungeonY === q.target.targetY
                            );

                            // Проверка глубины (если требуется)
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

                            // Помечаем предмет как квестовый (визуально или для логики сдачи)
                            item.isQuestItem = true;

                            if (q.type === 'FETCH') {
                                // FETCH завершается мгновенно при находке
                                q.progress = q.maxProgress;
                                q.isCompleted = true;
                                RenderModule.updateQuestBriefing(q);
                                RenderModule.log(`📦 Это тот самый предмет! Квест выполнен.`, "info ");
                                updateQuestCompass(); // Переключаем стрелку на "Награда"
                            } 
                            else if (q.type === 'COLLECT') {
                                // COLLECT накапливает прогресс
                                QuestSystemModule.checkProgress(q, { 
                                    type: 'pickup', 
                                    itemType: item.type,
                                    itemName: item.name,
                                    uniqueId: item.uniqueId,
                                    locX: dungeonX,
                                    locY: dungeonY,
                                    currentDepth: currentDepth 
                                });
                                
                                // Обновляем UI после каждого подбора
                                RenderModule.updateQuestBriefing(q);
                                RenderModule.log(`📦 Подобрано для квеста: ${item.name} (${q.progress}/${q.maxProgress})`, "info ");
                                
                                // Если квест только что завершился
                                if (q.isCompleted) {
                                    updateQuestCompass();
                                }
                            }
                        }
                    }
                });
             }
            
            // Удаляем предмет с карты
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
    
    // === ОБНОВЛЕНИЕ ВИДИМОСТИ ЛОВУШЕК ПЕРЕД ОТРИСОВКОЙ ===
    updateTrapVisibility();
    
    renderFrame();
}

// В game.js
function checkTrapTrigger(x, y) {
    const trapIndex = traps.findIndex(t => t.x === x && t.y === y);
    if (trapIndex !== -1) {
        const trap = traps[trapIndex];
        
        // === ПРОВЕРКА ИММУНИТЕТА К ЛОВУШКАМ ===
        let isImmune = false;
        if (typeof EffectSystemModule !== 'undefined' && typeof EffectSystemModule.getPassiveEffects === 'function') {
            const passives = EffectSystemModule.getPassiveEffects(player);
            if (passives.includes('trap_immune')) {
                isImmune = true;
            }
        }

        if (isImmune) {
            RenderModule.log(`🥾 Ваши Каменные Башмаки выдержали удар ловушки! Урона нет.`, "info");
            // Ловушку можно удалить (она сломалась об башмаки) или оставить. 
            // Давайте удалим, чтобы игрок видел, что взаимодействие произошло.
            traps.splice(trapIndex, 1);
            // Обновляем видимость, чтобы ловушка исчезла с экрана
            updateTrapVisibility(); 
        } else {
            // Стандартная логика получения урона
            player.hp -= trap.damage;
            RenderModule.log(`⚠️ Вы наступили на ловушку! Получено ${trap.damage} урона.`, "combat");
            RenderModule.addBlinkEffect(player.x, player.y, 300, "rgba(255, 0, 0, 0.5)");
            traps.splice(trapIndex, 1);
            
            if (player.hp <= 0) {
                 RenderModule.log("ВЫ ПОГИБЛИ в ловушке. F5 для рестарта.", "combat");
                 busy = true;
                 return;
            }
        }
    }
}

// В game.js

// В game.js

    // В game.js

    // В game.js

    function updateTrapVisibility() {
        visibleTraps.clear();
        
        let hasVision = false;
        
        // Спрашиваем у системы эффектов
        if (typeof EffectSystemModule !== 'undefined' && typeof EffectSystemModule.getPassiveEffects === 'function') {
            const passives = EffectSystemModule.getPassiveEffects(player);
            //console.log("[GameModule] Получены пассивные эффекты:", passives); // <--- ЛОГ
            
            if (passives.includes('trap_vision')) {
                hasVision = true;
                //console.log("[GameModule] ✅ Обнаружен эффект trap_vision!"); // <--- ЛОГ
            }
        } 
        // Fallback: проверка по старинке (если система эффектов еще не подключена)
        else if (player && player.equipment && player.equipment.armor) {
            if (player.equipment.armor.uniqueId === 'unique_helm_vision') {
                hasVision = true;
                console.log("[GameModule] Fallback: Шлем зоркости найден напрямую.");
            }
        } else {
             console.warn("[GameModule] ⚠️ EffectSystemModule.getPassiveEffects не найден или экипировка отсутствует.");
        }

        if (hasVision) {
            //console.log(`[GameModule] 🟢 Режим "Все ловушки видимы". Всего ловушек на уровне: ${traps.length}`);
            traps.forEach(trap => visibleTraps.add(`${trap.x},${trap.y}`));
        } else {
            // console.log("[GameModule] 🔴 Стандартный режим видимости ловушек (радиус 2).");
            const viewRadius = 2; 
            traps.forEach(trap => {
                const dist = Math.abs(trap.x - player.x) + Math.abs(trap.y - player.y);
                if (dist <= viewRadius) {
                    visibleTraps.add(`${trap.x},${trap.y}`);
                }
            });
        }
    }
    
    // === ОТРИСОВКА КАДРА (Обновленная) ===
    function renderFrame() {
        if (!player) return;

        // 1. ТАКТИЧЕСКИЙ РЕЖИМ
        if (window.gameMode === 'tactical' && tacticalState) {
            if (typeof TacticalRenderModule !== 'undefined') {
                const realPlayer = GameModule.getPlayer();
                if (realPlayer && tacticalState.playerUnit) {
                    realPlayer.hp = tacticalState.playerUnit.hp;
                }
                TacticalRenderModule.drawBattlefield(
                    tacticalState.arena, 
                    tacticalState.playerUnit, 
                    tacticalState.enemyUnits, 
                    tacticalState.playerArmy, 
                    window.currentTactic
                );
                if (realPlayer) {
                    RenderModule.updateUI(realPlayer, null, null); 
                }
            }
            return; 
        }

        // 2. ГЛОБАЛЬНАЯ КАРТА
        if (window.gameMode === 'global') {
            renderGlobalMap();
            return;
        }

        // 3. ОБЫЧНЫЙ РЕЖИМ (Подземелье / Город)
        if (typeof RenderModule !== 'undefined') {
            const vis = RenderModule.draw(player, enemies, items, npcs); 
            if (vis) vis.forEach(k => explored.add(k));
            
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.drawMinimap(player, explored);

            // === УДАЛЕНО: Отрисовка магазина на Canvas (теперь он в HTML) ===
            
            // Постоялый двор пока остался на Canvas (если вы его еще не перенесли)
            //if (isInnOpen && typeof RenderModule.drawInnWindow === 'function') {
                //RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
            //}
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
                    uniqueId: template.id, 
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
        getGlobalFlag: (flagName) => globalFlags[flagName] || false,
        endTacticalBattle: endTacticalBattle,
        checkBattleEnd: checkBattleEnd, 
        getTacticalState: () => tacticalState,
        getPlayerArmy: () => tacticalState ? tacticalState.playerArmy : [],
        exitToGlobal,
        getVisibleTraps: () => [...visibleTraps], // Возвращает копию массива видимых ловушек
        // Экспорт в return GameModule:
        openFullInventory,
        closeFullInventory,        
        // === ФУНКЦИИ МАГАЗИНА ===
        openShop: openShop,
        closeShop: closeShop,
        buyItem: buyItem,
        sellItem: sellItem,
        changeShopPage: function(type, dir) {
            if (type === 'm') window.shopPageMerchant += dir;
            if (type === 'p') window.shopPagePlayer += dir;
            
            if (currentMerchantInv && player) {
                RenderModule.renderShopUI(currentMerchantInv, player.gold);
            }
        },

        // === ФУНКЦИИ ПОСТОЯЛОГО ДВОРА (ДОБАВЛЕНО) ===
        openInn: openInn,
        closeInn: closeInn,
        innAction: innAction,
        openQuestWindow: openQuestWindow,
        closeQuestWindow: closeQuestWindow,
        changeEra: changeEra,
        closeEraWindow: closeEraWindow
    };
})();

window.onload = async () => {
    await GameModule.init();
};
