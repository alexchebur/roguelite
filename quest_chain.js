/**
 * МОДУЛЬ СЮЖЕТНОЙ ЦЕПОЧКИ КВЕСТОВ (quest_chain.js)
 * Генерирует детерминированную сюжетную линию по миру.
 */
const QuestChainModule = (function() {
    'use strict';

    let chainCities = [];      // Массив городов цепочки
    let isInitialized = false;

    // === ШАБЛОНЫ БРИФИНГОВ (Сюжетные) ===
    const CHAIN_TEMPLATES = {
        FETCH: [
            "Хранители {city} утратили священный {item}. Разведчики донесли, что он в {location}. Найди его, и мы укажем тебе путь в {nextCity}.",
            "В {city} украден артефакт — {item}. Ищи его в {location}. Это первый шаг к тайне, что скрывает {nextCity}."
        ],
        HUNT: [
            "Торговые пути между {city} и {nextCity} перекрыты. {enemy} атакуют караваны. Убей {count} тварей, чтобы путь открылся.",
            "Жители {city} в ужасе. {enemy} спускаются с гор. Истреби {count} из них, иначе до {nextCity} не добраться."
        ],
        EXPLORE: [
            "Старцы {city} говорят о пророчестве, связанном с {location}. Спустись на глубину {depth} и узнай правду. Твой путь лежит в {nextCity}.",
            "Карта из {city} ведет в {location}. Найди там древние знаки. Только так ты узнаешь, что скрывает {nextCity}."
        ],
        DIGGER: [
            "Шахтеры {city} нашли странный тоннель, ведущий в недра. Спустись на глубину {depth} в {location}. Это ключ к {nextCity}.",
            "В {city} говорят о древних залежах в {location}. Доберись до глубины {depth}. Только так ты поймешь, куда идти дальше — в {nextCity}."
        ],
        COLLECT: [
            "Алхимики {city} готовят эликсир для защиты от тьмы {nextCity}. Собери {count} шт. '{item}' в {location}.",
            "Для ритуала в {city} нужно {count} шт. '{item}'. Ищи их в {location}. От этого зависит безопасность пути в {nextCity}."
        ],
        BOUNTY: [
            "Голова {enemy} стоит дорого. Убей {count} штук, и гильдия {city} откроет тебе тайные тропы к {nextCity}.",
            "Эти твари ({enemy}) стали слишком наглыми. Истреби {count} особей. Гильдия {city} заплатит и расскажет о {nextCity}."
        ],
        SCHOLAR: [
            "Мудрецы {city} ищут утраченные знания. Прочитай {count} древних книг, которые найдешь. Это прольет свет на тайну {nextCity}.",
            "Библиотека {city} пуста, но мир полон книг. Прочитай {count} томов. В них скрыт путь к {nextCity}."
        ]
    };
    // === ШАБЛОНЫ ТЕКСТОВ СДАЧИ КВЕСТА (Говорит NPC, когда вы вернулись) ===
    const TURN_IN_TEMPLATES = {
        FETCH: [
            "Ты нашел {item}! Жители {city} вздохнули с облегчением. Теперь иди в {nextCity}, там знают, что делать с этой находкой.",
            "Отличная работа. Артефакт в целости. Путь в {nextCity} теперь открыт для тебя."
        ],
        HUNT: [
            "Твари истреблены! Торговые пути в {nextCity} снова безопасны. Ступай туда, тебя ждут.",
            "Ты спас наши земли от {enemy}. В {nextCity} уже знают о твоей доблести. Иди же туда!"
        ],
        EXPLORE: [
            "Твои карты и заметки бесценны. Тайна {nextCity} начинает раскрываться. Спешите туда!"
        ],
        DIGGER: [
            "Шахтеры в восторге! Твои сведения о глубинах помогут нам. А теперь отправляйся в {nextCity}."
        ],
        COLLECT: [
            "Этих {item} хватит для ритуала. Спасибо, странник. Твой следующий шаг — {nextCity}."
        ],
        BOUNTY: [
            "Головы {enemy} принесли мир на наши дороги. Гильдия откроет тебе тайные тропы к {nextCity}."
        ],
        SCHOLAR: [
            "Мудрость древних теперь с тобой. Ты готов к тому, что скрывает {nextCity}. Иди же!"
        ],
        // Специальный текст для ФИНАЛЬНОГО квеста цепочки
        FINAL: [
            "Ты прошел весь путь от {city} до наших дней. Ты не просто искатель приключений, ты — легенда. Эти земли навсегда запомнят твое имя!"
        ]
    };
    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
    
    // Поиск городов в кольце (от minR до maxR)
    function findCitiesInRing(cx, cy, minR, maxR) {
        const cities = [];
        const found = new Set();
        // Ограничиваем перебор, чтобы не зависнуть
        for (let dy = -maxR; dy <= maxR; dy++) {
            for (let dx = -maxR; dx <= maxR; dx++) {
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist >= minR && dist <= maxR) {
                    if (typeof GlobalMapModule !== 'undefined') {
                        const poi = GlobalMapModule.getPOI(cx + dx, cy + dy);
                        if (poi && poi.type === 'city' && !found.has(`${poi.x},${poi.y}`)) {
                            found.add(`${poi.x},${poi.y}`);
                            cities.push(poi);
                        }
                    }
                }
            }
        }
        return cities;
    }

    // Вычисление текущего ожидаемого индекса цепочки (ДЕТЕРМИНИРОВАННО!)
    function getExpectedIndex() {
        if (typeof GameModule === 'undefined') return 0;
        const completed = GameModule.getCompletedQuestIds();
        let expected = 0;
        
        for (let i = 0; i < chainCities.length; i++) {
            const id = `chain_${chainCities[i].x}_${chainCities[i].y}`;
            if (completed.has(id)) {
                expected = i + 1; // Если квест сдан, ждем следующий
            } else {
                break; // Цепочка прервалась, это текущий квест
            }
        }
        return expected;
    }

    // === ПУБЛИЧНЫЕ МЕТОДЫ ===

    function init(startX, startY) {
        if (isInitialized) return;
        
        // 1. Ищем ближайший город к точке старта
        let startCity = null;
        for (let r = 0; r <= 50; r++) {
            const cities = findCitiesInRing(startX, startY, r, r);
            if (cities.length > 0) {
                startCity = cities[0]; 
                break;
            }
        }
        
        if (!startCity) {
            console.warn("QuestChain: Не удалось найти стартовый город.");
            return;
        }

        chainCities.push({ ...startCity, questIndex: 0, isFinal: false });

        // 2. Генерируем следующие города цепочки (от 4 до 6 звеньев)
        const rng = new SeededRandom(GLOBAL_CONFIG.WORLD_SEED + 12345);
        const chainLength = rng.int(4, 6);
        
        let currentCity = startCity;
        for (let i = 1; i < chainLength; i++) {
            // Ищем город на расстоянии от 15 до 50 клеток
            const candidates = findCitiesInRing(currentCity.x, currentCity.y, 15, 50);
            if (candidates.length === 0) break;
            
            // Детерминированный выбор следующего города
            const nextCity = candidates[Math.floor(rng.next() * candidates.length)];
            const isFinal = (i === chainLength - 1);
            chainCities.push({ ...nextCity, questIndex: i, isFinal });
            currentCity = nextCity;
        }
        // === БЛОК ОТЛАДКИ: ВЫВОД В КОНСОЛЬ ===
        console.group("🗺️ СЮЖЕТНАЯ ЦЕПОЧКА КВЕСТОВ (DEBUG)");
        console.log(`Стартовая точка игрока: X=${startX}, Y=${startY}`);
        console.table(chainCities.map((city, index) => ({
            "Этап": index + 1,
            "Город": city.name,
            "Координаты": `(${city.x}, ${city.y})`,
            "Финал": city.isFinal ? "✅ ДА" : "❌ НЕТ",
            "ID Квеста": `chain_${city.x}_${city.y}`
        })));
        console.groupEnd();
        // ======================================        
        isInitialized = true;
        console.log(`✅ Сюжетная цепочка сгенерирована (${chainCities.length} городов).`);
    }

    function isChainCity(x, y) {
        return chainCities.some(city => city.x === x && city.y === y);
    }

    function getQuestForCity(x, y) {
        const idx = chainCities.findIndex(c => c.x === x && c.y === y);
        if (idx === -1) return null;
        
        const expectedIdx = getExpectedIndex();
        // Выдаем квест только если это текущий ожидаемый город цепочки
        if (idx !== expectedIdx) return null; 

        return generateCustomQuest(chainCities[idx]);
    }

    function generateCustomQuest(cityData) {
        const idx = cityData.questIndex;
        const nextCity = chainCities[idx + 1];
        
        // Детерминированный RNG для этого конкретного квеста
        const rng = new SeededRandom(createSeed(cityData.x, cityData.y, 7777));
        
        // Выбор типа квеста
        const types = ['FETCH', 'HUNT', 'EXPLORE', 'COLLECT', 'BOUNTY', 'SCHOLAR'];
        if (idx > 0) types.push('DIGGER');
        const type = types[Math.floor(rng.next() * types.length)];
        
        // Генерация цели (переиспользуем логику из QuestSystemModule)
        let targetData = {};
        if (typeof QuestSystemModule !== 'undefined' && QuestSystemModule.calculateTargetParams) {
            targetData = QuestSystemModule.calculateTargetParams(cityData.x, cityData.y, type, idx + 1);
        } else {
            // Фолбэк, если метод не экспортирован
            targetData = { locationName: "древних руинах", targetX: cityData.x, targetY: cityData.y };
        }

        // Формируем брифинг (текст при получении)
        let templatePool = CHAIN_TEMPLATES[type] || CHAIN_TEMPLATES.FETCH;
        let template = templatePool[Math.floor(rng.next() * templatePool.length)];
        
        if (cityData.isFinal) {
            template = `Ты прошел долгий путь. Финальное испытание в ${cityData.name}: ${template}`;
        }

        const briefing = template
            .replace(/{city}/g, cityData.name)
            .replace(/{nextCity}/g, nextCity ? nextCity.name : 'дальних земель')
            .replace(/{item}/g, targetData.itemName || 'древний артефакт')
            .replace(/{enemy}/g, targetData.enemyName || 'монстров')
            .replace(/{count}/g, targetData.count || 1)
            .replace(/{location}/g, targetData.locationName || 'забытых руинах')
            .replace(/{depth}/g, targetData.targetDepth || targetData.recommendedDepth || 1);

        // === ГЕНЕРАЦИЯ ТЕКСТА СДАЧИ (НОВОЕ) ===
        let turnInPool;
        if (cityData.isFinal) {
            turnInPool = TURN_IN_TEMPLATES.FINAL;
        } else {
            turnInPool = TURN_IN_TEMPLATES[type] || TURN_IN_TEMPLATES.FETCH;
        }
        
        let turnInText = turnInPool[Math.floor(rng.next() * turnInPool.length)];
        // Заменяем переменные в тексте сдачи
        turnInText = turnInText
            .replace(/{city}/g, cityData.name)
            .replace(/{nextCity}/g, nextCity ? nextCity.name : 'дальних земель')
            .replace(/{item}/g, targetData.itemName || 'артефакт')
            .replace(/{enemy}/g, targetData.enemyName || 'тварей');

        // Награда растет с каждым этапом
        const baseGold = 100 + (idx * 50);
        const finalGold = Math.floor(baseGold * (1 + idx * 0.2));

        return {
            id: `chain_${cityData.x}_${cityData.y}`,
            type: type,
            target: targetData, 
            progress: 0,
            maxProgress: (type === 'HUNT' || type === 'COLLECT' || type === 'BOUNTY' || type === 'SCHOLAR') ? (targetData.count || 1) : 1,
            rewardGold: finalGold,
            briefing: briefing,
            turnInText: turnInText, // <--- ДОБАВЛЯЕМ ТЕКСТ СДАЧИ В ОБЪЕКТ
            isCompleted: false,
            isTurnedIn: false, 
            isActive: false,
            isChainQuest: true,
            chainIndex: idx,
            isFinal: cityData.isFinal
        };

    function getChainCities() { return chainCities; }

    // Генерация лора для книг
    function getLoreFragment() {
        if (chainCities.length < 2) return null;
        const rng = new SeededRandom(Date.now()); // Тут можно случайный, чтобы книги были разными
        const idx = Math.floor(rng.next() * (chainCities.length - 1));
        const city1 = chainCities[idx];
        const city2 = chainCities[idx + 1];
        
        const phrases = [
            `В старых хрониках упоминается тайный путь из ${city1.name} в ${city2.name}. Говорят, там спрятано нечто важное.`,
            `Странники шепчутся о связи между ${city1.name} и ${city2.name}. Будь осторожен, путник.`,
            `Печать ${city1.name} укажет тебе дорогу к тайнам ${city2.name}. Ищи хранителя в городе ${city1.name}.`
        ];
        return phrases[Math.floor(rng.next() * phrases.length)];
    }

    return {
        init,
        isChainCity,
        getQuestForCity,
        getChainCities,
        getLoreFragment,
        getExpectedIndex,
        isInitialized: () => isInitialized
    };
})();
