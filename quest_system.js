/**
 * МОДУЛЬ СИСТЕМЫ КВЕСТОВ (quest_system.js)
 * Генерирует детерминированные квесты на основе координат и сидов.
 * Зависит от: name_generator.js, worldCurve.js, data.js, entity.js
 */

const QuestSystemModule = (function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const MAX_QUEST_RADIUS = 50; // Максимальное расстояние до цели
    const MIN_QUEST_RADIUS = 5;  // Минимальное расстояние (чтобы не отправлять за соседний дом)

    // === БАЗА ШАБЛОНОВ (Универсальные тексты с переменными) ===
    const QUEST_TEMPLATES = {
        FETCH: [
            "Мне нужен {item}. Говорят, последний раз его видели в {location}. Принеси его, и я заплачу {gold} золотых.",
            "В {location} затерялся ценный артефакт: {item}. Найди его для меня. Награда: {gold} монет.",
            "Я слышал, что в руинах {location} можно найти {item}. Это опасно, но я готов заплатить {gold} золотых."
        ],
        HUNT: [
            "{enemy} расплодились в окрестностях {location}. Убей {count} штук, и город будет в безопасности. Награда: {gold} золотых.",
            "Охотники боятся идти в {location}. Там слишком много {enemy}. Устрани {count} особей, и я дам тебе {gold} монет.",
            "Голова каждого {enemy} из {location} стоит денег. Принеси мне доказательства смерти {count} тварей. Плачу {gold}."
        ],
        EXPLORE: [
            "Разведчики пропали near {location}. Доберись туда и проверь вход. Я жду новостей. Награда за риск: {gold} золотых.",
            "На карте отмечено странное место: {location}. Сходи туда и убедись, что вход открыт. Плачу {gold} за информацию.",
            "Говорят, в {location} творится неладное. Исследуй окрестности. Если вернешься живым, получишь {gold} монет."
        ]
    };

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

    /**
     * Выбирает случайный элемент из массива через SeededRandom
     */
    function pickRandom(rng, array) {
        return array[Math.floor(rng.next() * array.length)];
    }

    /**
     * Генерирует текст квеста, подставляя переменные
     */
    function formatBriefing(template, data) {
        let text = template;
        text = text.replace(/{item}/g, data.itemName || "древний предмет");
        text = text.replace(/{enemy}/g, data.enemyName || "врагов");
        text = text.replace(/{location}/g, data.locationName || "неизвестном месте");
        text = text.replace(/{count}/g, data.count || "несколько");
        text = text.replace(/{gold}/g, data.gold || "немного");
        return text;
    }

    /**
     * Создает уникальный ID квеста, привязанный к локации и типу
     */
    function generateQuestId(gx, gy, type, index) {
        return `Q_${type}_${gx}_${gy}_${index}`;
    }

    // === ОСНОВНАЯ ЛОГИКА ГЕНЕРАЦИИ ===

    /**
     * Рассчитывает параметры цели квеста (координаты, имена, количества)
     */
    function calculateTargetParams(gx, gy, type, difficultyLevel) {
        // Сид для целей квеста отличается от сида генерации карты (+777), 
        // чтобы цели не совпадали со стенами или входами случайно
        const seed = createSeed(gx, gy, difficultyLevel) + 777; 
        const rng = new SeededRandom(seed);
        
        let targetData = {};

        // 1. Расчет координат цели (в радиусе 50)
        let tx, ty, dist;
        let attempts = 0;
        do {
            const angle = rng.next() * Math.PI * 2;
            // Распределение расстояния: чем дальше, тем реже (опционально), здесь равномерно
            const r = rng.int(MIN_QUEST_RADIUS, MAX_QUEST_RADIUS);
            
            tx = gx + Math.round(Math.cos(angle) * r);
            ty = gy + Math.round(Math.sin(angle) * r);
            
            // Манхэттенское расстояние для проверки лимита
            dist = Math.abs(tx - gx) + Math.abs(ty - gy);
            attempts++;
        } while (attempts < 50 && dist > MAX_QUEST_RADIUS);

        targetData.targetX = tx;
        targetData.targetY = ty;

        // 2. Генерация названия локации для этих координат
        // Мы генерируем имя так, как если бы там БЫЛО подземелье нужного типа
        // Это создает иллюзию, что мир уже сгенерирован
        const dungeonTypes = ['dungeon', 'cave', 'icy', 'rogue'];
        const dType = pickRandom(rng, dungeonTypes);
        
        // Используем существующий модуль имен
        const locInfo = NameGeneratorModule.generateLocationData(tx, ty, dType);
        targetData.locationName = locInfo.fullName;
        targetData.dungeonType = dType;

        // 3. Специфичные параметры по типу квеста
        if (type === 'FETCH') {
            // Выбираем предмет, который имеет смысл искать
            const possibleItems = DataModule.ITEM_TYPES.filter(i => 
                i.type !== 'gold' && 
                i.type !== 'book' && 
                i.type !== 'food' &&
                i.type !== 'potion_hp' &&
                i.type !== 'potion_str'
            );
            const itemTemplate = pickRandom(rng, possibleItems);
            targetData.itemName = itemTemplate.baseName; // Без прилагательного ("Меч", а не "Ржавый меч")
            targetData.itemType = itemTemplate.type;
        } 
        else if (type === 'HUNT') {
            // Выбираем врага, соответствующего сложности региона
            // Для простоты берем случайного из доступных, но можно фильтровать по depth
            const enemies = EntityModule.getAvailableEnemies ? EntityModule.getAvailableEnemies(difficultyLevel) : DataModule.ENEMY_TYPES;
            const enemyTemplate = pickRandom(rng, enemies);
            
            targetData.enemyName = enemyTemplate.name;
            // Количество растет с сложностью мира (WorldCurve)
            const baseCount = rng.int(3, 5);
            const multiplier = WorldCurveModule.getEnemyMultiplier(gx, gy);
            targetData.count = Math.max(1, Math.floor(baseCount * multiplier));
        }

        return targetData;
    }

    /**
     * Публичная функция: Создает объект квеста
     * @param {number} gx - Глобальная X игрока (или города)
     * @param {number} gy - Глобальная Y игрока (или города)
     * @param {number} questIndex - Индекс квеста у этого NPC/точки (0, 1, 2...)
     */
    function createQuest(gx, gy, questIndex) {
        const types = ['FETCH', 'HUNT', 'EXPLORE'];
        // Сид зависит от индекса, чтобы у одного NPC были разные квесты
        const rng = new SeededRandom(createSeed(gx, gy, questIndex));
        
        const type = pickRandom(rng, types);
        
        // Сложность региона (чем дальше от 0,0, тем сложнее)
        const difficulty = Math.abs(gx) + Math.abs(gy);
        
        // 1. Получаем параметры цели
        const targetData = calculateTargetParams(gx, gy, type, difficulty);
        
        // 2. Рассчитываем награду через WorldCurve
        const goldBase = rng.int(50, 150);
        const goldMult = WorldCurveModule.getGoldMultiplier(gx, gy);
        const finalGold = Math.floor(goldBase * goldMult);

        // 3. Формируем ID
        const id = generateQuestId(gx, gy, type, questIndex);

        // 4. Выбираем шаблон текста и заполняем его
        const templates = QUEST_TEMPLATES[type];
        const template = pickRandom(rng, templates);
        
        const briefingData = {
            itemName: targetData.itemName,
            enemyName: targetData.enemyName,
            locationName: targetData.locationName,
            count: targetData.count,
            gold: finalGold
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
     * Проверка выполнения квеста (вызывается из GameModule)
     * @param {object} quest - Объект квеста
     * @param {object} eventData - Данные события { type: 'kill'|'pickup'|'move', ... }
     * @returns {boolean} true, если квест обновлен или выполнен
     */
    function checkProgress(quest, eventData) {
        if (quest.isCompleted || !quest.isActive) return false;

        let updated = false;

        // Тип HUNT: проверка убийств
        if (quest.type === 'HUNT' && eventData.type === 'kill') {
            if (eventData.enemyName === quest.target.enemyName) {
                quest.progress++;
                updated = true;
            }
        }

        // Тип FETCH: проверка наличия предмета в инвентаре
        // Примечание: Полная проверка происходит при сдаче NPC, 
        // но здесь мы можем дать подсказку, если игрок поднял нужный тип предмета
        if (quest.type === 'FETCH' && eventData.type === 'pickup') {
            // Сравниваем базовые типы, так как имя может отличаться прилагательным
            if (eventData.itemType === quest.target.itemType) {
                // Не увеличиваем прогресс численно, просто помечаем, что предмет найден
                // Для UI можно использовать флаг, но для логики достаточно проверки инвентаря при сдаче
                updated = true; 
            }
        }

        // Тип EXPLORE: проверка координат
        if (quest.type === 'EXPLORE' && eventData.type === 'move') {
            const dist = Math.abs(eventData.x - quest.target.targetX) + Math.abs(eventData.y - quest.target.targetY);
            if (dist <= 1) { // Игрок наступил на клетку цели
                quest.progress = quest.maxProgress;
                quest.isCompleted = true;
                return true; // Квест выполнен мгновенно
            }
        }

        // Проверка завершения для HUNT
        if (quest.type === 'HUNT' && quest.progress >= quest.maxProgress) {
            quest.isCompleted = true;
        }

        return updated;
    }

    return {
        createQuest: createQuest,
        checkProgress: checkProgress,
        MAX_RADIUS: MAX_QUEST_RADIUS
    };

})();
