/**
 * МОДУЛЬ СИСТЕМЫ КВЕСТОВ (quest_system.js)
 * Генерирует детерминированные квесты, привязанные к РЕАЛЬНЫМ точкам интереса (POI) на глобальной карте.
 * Зависит от: name_generator.js, worldCurve.js, data.js, entity.js, globalMap.js
 */

const QuestSystemModule = (function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const MAX_QUEST_RADIUS = 50; // Основной радиус поиска цели
    const FALLBACK_RADIUS = 100; // Расширенный радиус, если в 50 клетках нет подземелий

    // === БАЗА ШАБЛОНОВ (Универсальные тексты с переменными) ===
    const QUEST_TEMPLATES = {
        FETCH: [
            "Мне нужен {item}. Говорят, последний раз его видели в {location} (глубина {depth}+). Принеси его, и я заплачу {gold} золотых.",
            "В {location} (не ниже {depth} уровня) затерялся ценный артефакт: {item}. Найди его для меня. Награда: {gold} монет."
        ],
        HUNT: [
            "{enemy} расплодились на нижних уровнях {location} (глубина {depth}+). Убей {count} штук, и город будет в безопасности. Награда: {gold} золотых.",
            "Охотники боятся спускаться в {location} ниже {depth} уровня. Там слишком много {enemy}. Устрани {count} особей, и я дам тебе {gold} монет."
        ],
        EXPLORE: [
            "Разведчики пропали near {location}. Доберись до глубины {depth} и проверь, что там происходит. Награда за риск: {gold} золотых.",
            "На карте отмечено странное место: {location}. Спустись хотя бы на {depth} уровень и убедись, что путь открыт. Плачу {gold} за информацию."
        ]
    };

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

    function pickRandom(rng, array) {
        return array[Math.floor(rng.next() * array.length)];
    }

    function formatBriefing(template, data) {
        let text = template;
        text = text.replace(/{item}/g, data.itemName || "древний предмет");
        text = text.replace(/{enemy}/g, data.enemyName || "врагов");
        text = text.replace(/{location}/g, data.locationName || "неизвестном месте");
        text = text.replace(/{count}/g, data.count || "несколько");
        text = text.replace(/{gold}/g, data.gold || "немного");
        return text;
    }

    function generateQuestId(gx, gy, type, index) {
        return `Q_${type}_${gx}_${gy}_${index}`;
    }

    /**
     * НОВАЯ ФУНКЦИЯ: Поиск реального POI (подземелья) в заданном радиусе
     */
    function findRealPOI(gx, gy, radius, poiType) {
        const candidates = [];
        
        // Проходим по квадрату, но фильтруем по кругу (манхэттенское расстояние)
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > radius) continue;
                
                const tx = gx + dx;
                const ty = gy + dy;
                
                // Спрашиваем у GlobalMapModule, есть ли здесь точка интереса
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getPOI) {
                    const poi = GlobalMapModule.getPOI(tx, ty);
                    if (poi && poi.type === poiType) {
                        candidates.push(poi);
                    }
                }
            }
        }
        return candidates.length > 0 ? candidates : null;
    }

    /**
     * Рассчитывает параметры цели квеста, привязываясь к РЕАЛЬНЫМ координатам карты
     */
    function calculateTargetParams(gx, gy, type, difficultyLevel) {
        const seed = createSeed(gx, gy, difficultyLevel) + 777; 
        const rng = new SeededRandom(seed);
        let targetData = {};

        // Для всех основных типов квестов нам нужна реальная локация (подземелье)
        const candidates = findRealPOI(gx, gy, MAX_QUEST_RADIUS, 'dungeon');
        
        let targetPoi = null;
        if (candidates && candidates.length > 0) {
            // Выбираем случайное подземелье из найденных детерминированно
            targetPoi = rng.choice(candidates);
        } else {
            // FALLBACK: Если в радиусе 50 клеток генерация не создала ни одного подземелья
            const wideCandidates = findRealPOI(gx, gy, FALLBACK_RADIUS, 'dungeon');
            if (wideCandidates && wideCandidates.length > 0) {
                targetPoi = rng.choice(wideCandidates);
            }
        }

        if (targetPoi) {
            // Успех: мы нашли реальное подземелье!
            targetData.targetX = targetPoi.x;
            targetData.targetY = targetPoi.y;
            targetData.locationName = targetPoi.name;
            targetData.dungeonType = targetPoi.dungeonType;
        } else {
            // КРАЙНИЙ СЛУЧАЙ: Подземелий нет вообще нигде рядом. 
            const angle = rng.next() * Math.PI * 2;
            const r = rng.int(10, MAX_QUEST_RADIUS);
            targetData.targetX = gx + Math.round(Math.cos(angle) * r);
            targetData.targetY = gy + Math.round(Math.sin(angle) * r);
            targetData.locationName = "Забытых руинах";
            targetData.dungeonType = 'rogue';
        }

        // Специфичные параметры по типу квеста
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
            // Используем множитель мира для количества врагов, но без учета глубины (так как квест на поверхности)
            const multiplier = WorldCurveModule.getEnemyMultiplier(gx, gy);
            targetData.count = Math.max(1, Math.floor(baseCount * Math.sqrt(multiplier)));
        }

        return targetData;
    }

    /**
     * Публичная функция: Создает объект квеста
     */
    function createQuest(gx, gy, questIndex) {
        const types = ['FETCH', 'HUNT', 'EXPLORE'];
        const rng = new SeededRandom(createSeed(gx, gy, questIndex));
        
        const type = pickRandom(rng, types);
        
        // === НОВАЯ ЛОГИКА РАСЧЕТА СЛОЖНОСТИ ===
        const globalDist = Math.abs(gx) + Math.abs(gy);
        
        // Получаем текущий уровень игрока
        let playerLevel = 1;
        if (typeof GameModule !== 'undefined' && GameModule.getPlayer) {
            const p = GameModule.getPlayer();
            if (p) playerLevel = p.level;
        }

        // Формула: 1 тир сложности за каждые 15 клеток пути + уровень игрока.
        const questEnemyTier = Math.min(6, Math.floor(globalDist / 15) + playerLevel);
        
        const targetData = calculateTargetParams(gx, gy, type, questEnemyTier);
        
        // Рекомендуемая глубина для квеста
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
            depth: recommendedDepth
        };
        
        const briefing = formatBriefing(template, briefingData);

        return {
            id: id,
            type: type,
            target: targetData, 
            progress: 0,
            maxProgress: (type === 'HUNT') ? targetData.count : 1,
            rewardGold: finalGold,
            briefing: briefing,
            isCompleted: false,
            isActive: false
        };
    }

    /**
     * Проверка выполнения квеста с учетом ЛОКАЦИИ
     */
    function checkProgress(quest, eventData) {
        if (quest.isCompleted || !quest.isActive) return false;

        let updated = false;

        // Проверка локации: если у квеста есть целевые координаты (targetX/Y), 
        // мы проверяем, совпадают ли они с текущими координатами игрока (eventData.locX/Y)
        const isInCorrectLocation = (
            !quest.target.targetX || 
            (eventData.locX === quest.target.targetX && eventData.locY === quest.target.targetY)
        );

        if (quest.type === 'HUNT' && eventData.type === 'kill') {
            // Засчитываем убийство только если имя врага совпадает И игрок в правильной локации
            if (eventData.enemyName === quest.target.enemyName && isInCorrectLocation) {
                quest.progress++;
                updated = true;
            }
        }

        if (quest.type === 'FETCH' && eventData.type === 'pickup') {
            if (eventData.itemType === quest.target.itemType && isInCorrectLocation) {
                updated = true; 
            }
        }

        if (quest.type === 'EXPLORE' && eventData.type === 'move') {
            const dist = Math.abs(eventData.x - quest.target.targetX) + Math.abs(eventData.y - quest.target.targetY);
            if (dist <= 1) { 
                quest.progress = quest.maxProgress;
                quest.isCompleted = true;
                return true; 
            }
        }

        // Проверка завершения для HUNT и FETCH
        if ((quest.type === 'HUNT' || quest.type === 'FETCH') && updated) {
            if (quest.progress >= quest.maxProgress) {
                quest.isCompleted = true;
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
