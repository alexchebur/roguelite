/** 
 * МОДУЛЬ ФАЗ МИРА (world_eras.js)
 * Управляет глобальными состояниями мира (Эпохами), их модификаторами и триггерами.
 */
const WorldErasModule = (function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ЭПОХ ===
    const ERA_CONFIGS = {
        'dawn': {
            id: 'dawn',
            name: 'Эпоха Рассвета',
            modalTitle: '🌅 Начало Пути',
            modalText: 'Мир спокоен, но древние тени начинают шевелиться. Твое путешествие только начинается, герой. Впереди лежат неизведанные земли и первые испытания.',
            modifiers: {
                enemyHpMult: 1.0,
                enemyAtkMult: 1.0,
                shopPriceMult: 1.0,
                lootMult: 1.0
            },
            flags: {}
        },
        'shadows': {
            id: 'shadows',
            name: 'Эпоха Теней',
            modalTitle: '🌑 Сгущение Тьмы',
            modalText: 'Солнце меркнет. Монстры становятся агрессивнее, а торговцы поднимают цены, опасаясь войны. Тени в подземельях стали гуще, но и сокровища в них блестят ярче.',
            modifiers: {
                enemyHpMult: 1.2,
                enemyAtkMult: 1.3,
                shopPriceMult: 1.5,
                lootMult: 1.2
            },
            flags: { isDarknessRising: true }
        },
        'war': {
            id: 'war',
            name: 'Эпоха Войны',
            modalTitle: '⚔️ Пламя Войны',
            modalText: 'Королевства охвачены огнем. Армии маршируют по дорогам, а выживание требует невиданной силы. Враги беспощадны, но слава и золото достаются лишь самым отважным.',
            modifiers: {
                enemyHpMult: 1.5,
                enemyAtkMult: 1.6,
                shopPriceMult: 2.0,
                lootMult: 1.8
            },
            flags: { isWarActive: true }
        }
    };

    // Текущее состояние (инициализируется при старте)
    let currentEraId = 'dawn';

    /**
     * Получить объект текущей эпохи
     */
    function getCurrentEra() {
        return ERA_CONFIGS[currentEraId] || ERA_CONFIGS['dawn'];
    }

    /**
     * Получить конкретный модификатор
     */
    function getModifier(key) {
        const era = getCurrentEra();
        return (era.modifiers && era.modifiers[key]) ? era.modifiers[key] : 1.0;
    }

    /**
     * Проверить флаг эпохи
     */
    function hasFlag(flagName) {
        const era = getCurrentEra();
        return era.flags && era.flags[flagName] === true;
    }

    return {
        ERA_CONFIGS,
        getCurrentEraId: () => currentEraId,
        setCurrentEraId: (id) => { if(ERA_CONFIGS[id]) currentEraId = id; },
        getCurrentEra,
        getModifier,
        hasFlag
    };
})();
