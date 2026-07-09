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
        ],
        // Внутри QUEST_TEMPLATES в quest_system.js
        BOSS_HUNT: [
            "Гильдия охотников объявляет чрезвычайную награду! В {location} обосновался ужасающий монстр: {enemy}. Ликвидируйте монстра, пока он не уничтожил ближайшие поселения. Награда: {gold} золотых.",
            "Старейшины в панике. {enemy} из подземелья {location} творит в округе мерзкие деяния. Только герой способен прекратить этот кошмар. Убейте чудовище, и слава (и {gold} монет) будет вашей."
        ],    
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
                    // Ищем и 'dungeon', и 'dungeon_entrance'
                    if (poi && (poi.type === 'dungeon' || poi.type === 'dungeon_entrance')) candidates.push(poi);
                }
            }
        }
        return candidates.length > 0 ? candidates : null;
    }

    function calculateTargetParams(gx, gy, type, difficultyLevel, playerLevel) {
        const seed = createSeed(gx, gy, difficultyLevel) + 777; 
        const rng = new SeededRandom(seed);
        let targetData = {};

        // 1. Определение локации (Подземелья)
        let candidates = [];
        let searchRadius = MAX_QUEST_RADIUS; // 50 по умолчанию

        // === ЛОГИКА ПОИСКА БОССОВ ===
        if (type === 'BOSS_HUNT') {
            searchRadius = 80; // Увеличиваем радиус для эпичных квестов
            
            // Ищем только подземелья типа 'boss'
            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                    if (Math.abs(dx) + Math.abs(dy) > searchRadius) continue;
                    
                    const tx = gx + dx;
                    const ty = gy + dy;
                    
                    if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getPOI) {
                        const poi = GlobalMapModule.getPOI(tx, ty);
                        // Проверяем, что это вход в подземелье И оно типа 'boss'
                        if (poi && (poi.type === 'dungeon' || poi.type === 'dungeon_entrance') && poi.dungeonType === 'boss') {
                            candidates.push(poi);
                        }
                    }
                }
            }
        } 
        // Стандартный поиск для остальных типов
        else {
            candidates = findRealPOI(gx, gy, MAX_QUEST_RADIUS, 'dungeon');
            if (!candidates || candidates.length === 0) {
                 const wideCandidates = findRealPOI(gx, gy, FALLBACK_RADIUS, 'dungeon');
                 if (wideCandidates) candidates = wideCandidates;
            }
        }

        let targetPoi = null;
        if (candidates && candidates.length > 0) {
            targetPoi = rng.choice(candidates);
        } 
        
        // Если для BOSS_HUNT ничего не нашли, меняем тип на обычный HUNT, чтобы не ломать игру
        if (!targetPoi && type === 'BOSS_HUNT') {
             type = 'HUNT';
             const fallbackPOIs = findRealPOI(gx, gy, MAX_QUEST_RADIUS, 'dungeon');
             if (fallbackPOIs) targetPoi = rng.choice(fallbackPOIs);
        }

        if (targetPoi) {
             targetData.targetX = targetPoi.x;
             targetData.targetY = targetPoi.y;
             targetData.locationName = targetPoi.name;
             targetData.dungeonType = targetPoi.dungeonType;
        } else {
             // Фолбэк координаты (если вообще ничего не нашли)
             const angle = rng.next() * Math.PI * 2;
             const r = rng.int(10, searchRadius);
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
            targetData.targetDepth = rng.int(2, 5); 
        }
        else if (type === 'COLLECT') {
            const collectibleTypes = ['potion_hp', 'book', 'food'];
            const possibleItems = DataModule.ITEM_TYPES.filter(i => collectibleTypes.includes(i.type));
            const itemTemplate = pickRandom(rng, possibleItems);
            
            targetData.itemName = itemTemplate.baseName;
            targetData.itemType = itemTemplate.type;
            targetData.count = rng.int(2, 4);
        }
        else if (type === 'BOUNTY') {
            const enemies = EntityModule.getAvailableEnemies ? EntityModule.getAvailableEnemies(difficultyLevel) : DataModule.ENEMY_TYPES;
            const enemyTemplate = pickRandom(rng, enemies);
            
            targetData.enemyName = enemyTemplate.name;
            targetData.count = rng.int(1, 3); 
        }
        else if (type === 'SCHOLAR') {
            targetData.count = rng.int(1, 3);
            targetData.locationName = "древних библиотеках";
        }
        // === НОВОЕ: ПАРАМЕТРЫ ДЛЯ БОССА ===
        else if (type === 'BOSS_HUNT') {
            // Генерируем имя босса детерминировано для этого квеста
            // Используем координаты цели как сид, чтобы имя было постоянным для этого данжа
            const bossSeed = createSeed(targetData.targetX, targetData.targetY, 999);
            const bossRng = new SeededRandom(bossSeed);
            
            // Выбираем случайную расу босса из списка
            const races = ["Древний Дракон", "Повелитель Бездны", "Каменный Голем", "Король Личей", "Матриарх Пауков", "Падший Ангел"];
            const race = bossRng.choice(races);
            
            // Генерируем уникальное имя
            const pre = bossRng.choice(["Зул", "Мор", "Гар", "Тар", "Ксар", "Вул"]);
            const root = bossRng.choice(["го", "рак", "тар", "мун", "дор"]);
            const suf = bossRng.choice(["гор", "акс", "ум", "иус", "ар"]);
            const properName = (pre + root + suf).charAt(0).toUpperCase() + (pre + root + suf).slice(1);
            
            targetData.enemyName = `${race} ${properName}`;
            targetData.count = 1; // Всегда один босс
            targetData.isBoss = true; // Флаг для системы отслеживания
        }

        return targetData;
    }

    function createQuest(gx, gy, questIndex) {
        // Добавляем новый тип BOSS_HUNT
        const types = ['FETCH', 'HUNT', 'EXPLORE', 'DIGGER', 'COLLECT', 'BOUNTY', 'SCHOLAR'];
        
        const rng = new SeededRandom(createSeed(gx, gy, questIndex));
        
        // === ЛОГИКА ВЫБОРА ТИПА С УЧЕТОМ БОССА ===
        let playerLevel = 1;
        if (typeof GameModule !== 'undefined' && GameModule.getPlayer) {
            const p = GameModule.getPlayer();
            if (p) playerLevel = p.level;
        }

        // Шанс квеста на босса: 0% на 1 ур, ~50% на 10 ур
        const bossChance = Math.min(0.5, playerLevel * 0.05); 
        let type;

        if (Math.random() < bossChance) {
            type = 'BOSS_HUNT';
        } else {
            type = pickRandom(rng, types);
        }
        // ==========================================
        
        const globalDist = Math.abs(gx) + Math.abs(gy);
        const questEnemyTier = Math.min(6, Math.floor(globalDist / 15) + playerLevel);
        
        // Передаем playerLevel в calculateTargetParams для поиска боссов
        const targetData = calculateTargetParams(gx, gy, type, questEnemyTier, playerLevel);
        
        const recommendedDepth = Math.max(1, Math.min(5, Math.floor(questEnemyTier / 1.5)));
        targetData.recommendedDepth = recommendedDepth;

        const goldBase = rng.int(50, 150);
        const goldMult = WorldCurveModule.getGoldMultiplier(globalDist, 0); 
        // Боссы дают больше золота
        const goldBonus = (type === 'BOSS_HUNT') ? 2.0 : 1.0;
        const finalGold = Math.floor(goldBase * goldMult * goldBonus) + (playerLevel * 10);
        
        const id = generateQuestId(gx, gy, type, questIndex);
        
        // Проверка наличия шаблонов (на случай если BOSS_HUNT еще не добавлен в QUEST_TEMPLATES)
        const templates = QUEST_TEMPLATES[type] || QUEST_TEMPLATES['HUNT']; 
        const template = pickRandom(rng, templates);
        
        const briefingData = {
            itemName: targetData.itemName,
            enemyName: targetData.enemyName, // Для боссов здесь будет уникальное имя
            locationName: targetData.locationName,
            count: targetData.count,
            gold: finalGold,
            depth: targetData.targetDepth || recommendedDepth
        };
        
        const briefing = formatBriefing(template, briefingData);

        let maxProg = 1;
        // Для BOSS_HUNT прогресс всегда 1 (убить одного босса)
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

        // Проверка локации
        const isInCorrectLocation = (
            !quest.target.targetX || 
            (eventData.locX !== undefined && eventData.locX === quest.target.targetX && 
             eventData.locY !== undefined && eventData.locY === quest.target.targetY)
        );

        // === DIGGER (Глубинный разведчик) ===
        if (quest.type === 'DIGGER' && eventData.type === 'depth') {
            // Проверяем, что мы в том же подземелье
            if (eventData.locX === quest.target.targetX && eventData.locY === quest.target.targetY) {
                // eventData.currentDepth приходит из game.js, он тоже начинается с 0
                if ((eventData.currentDepth + 1) >= quest.target.targetDepth) {
                    quest.progress = quest.maxProgress;
                    quest.isCompleted = true;
                    if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                        RenderModule.log(`🏆 Квест выполнен: Вы достигли глубины ${eventData.currentDepth + 1}!`, "event");
                    }
                    return true;
                }
            }
        }

        // === HUNT ===
        if (quest.type === 'HUNT' && eventData.type === 'kill') {
            if (eventData.enemyName === quest.target.enemyName && isInCorrectLocation) {
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === BOUNTY ===
        if (quest.type === 'BOUNTY' && eventData.type === 'kill') {
            if (eventData.enemyName === quest.target.enemyName) {
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: Охота на ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === FETCH ===
        if (quest.type === 'FETCH' && eventData.type === 'pickup') {
            // Проверяем тип предмета и имя (для точности)
            const isCorrectItem = (eventData.itemType === quest.target.itemType) && 
                                  (!quest.target.itemName || (eventData.itemName && eventData.itemName.includes(quest.target.itemName)));
            
            if (isCorrectItem && isInCorrectLocation) {
                quest.progress = quest.maxProgress; // Сразу ставим максимум
                quest.isCompleted = true; // Сразу завершаем
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`📦 Предмет для квеста найден!`, "info");
                }
            }
        }

        // === COLLECT ===
        if (quest.type === 'COLLECT' && eventData.type === 'pickup') {
            const isCorrectType = (eventData.itemType === quest.target.itemType);
            
            // Проверяем имя или уникальный ID
            let isCorrectIdentity = false;
            if (quest.target.uniqueId) {
                isCorrectIdentity = (eventData.uniqueId === quest.target.uniqueId);
            } else if (quest.target.itemName) {
                isCorrectIdentity = (eventData.itemName && eventData.itemName.includes(quest.target.itemName));
            } else {
                isCorrectIdentity = true; // Если ничего не указано, считаем любой предмет этого типа верным
            }
                                  
            if (isCorrectType && isCorrectIdentity && isInCorrectLocation) {
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: Сбор ${quest.target.itemName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === SCHOLAR ===
        if (quest.type === 'SCHOLAR' && eventData.type === 'read_book') {
            quest.progress++;
            updated = true;
            if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                RenderModule.log(`Квест: Прочитано книг (${quest.progress}/${quest.maxProgress})`, "info");
            }
        }

        // === EXPLORE ===
        if (quest.type === 'EXPLORE' && eventData.type === 'move') {
            const dist = Math.abs(eventData.x - quest.target.targetX) + Math.abs(eventData.y - quest.target.targetY);
            if (dist <= 1) { 
                quest.progress = quest.maxProgress;
                quest.isCompleted = true;
                return true; 
            }
        }

        // Финальная проверка завершения для накопительных квестов
        if (updated && !quest.isCompleted) {
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
        calculateTargetParams: calculateTargetParams, // Экспортируем для использования в других модулях
        MAX_RADIUS: MAX_QUEST_RADIUS
    };

})();
