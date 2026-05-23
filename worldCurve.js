/**
 * МОДУЛЬ МИРОВОЙ КРИВОЙ (world_curve.js)
 * Зависит от: name_generator.js (SeededRandom, createSeed)
 * 
 * Отвечает за прогрессивную сложность врагов, силу предметов и статы игрока.
 * Все расчеты детерминированы координатами (x, y).
 */

if (typeof SeededRandom === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед world_curve.js");
}

const WorldCurveModule = (function() {
    'use strict';

    // Базовые константы
    const BASE_PLAYER_HP = 20;
    const BASE_PLAYER_ATK = 3;
    const BASE_PLAYER_DEF = 1;
    
    // Типы математических кривых
    const CURVES = {
        LINEAR: 'linear',       // Равномерный рост
        EXPONENTIAL: 'exp',     // Быстрый рост (для сложности врагов)
        LOGARITHMIC: 'log',     // Медленный рост (для защиты, чтобы не было неуязвимости)
        STEP: 'step'            // Ступенчатый рост (каждые N уровней)
    };

    /**
     * Внутренняя функция расчета значения по кривой
     * @param {string} type - тип кривой
     * @param {number} x - входное значение (уровень/глубина)
     * @param {object} params - параметры кривой {a, b, c}
     */
    function calculate(type, x, params) {
        const a = params.a || 1;
        const b = params.b || 1;
        const c = params.c || 0;

        switch (type) {
            case CURVES.LINEAR:
                return a * x + b;
            
            case CURVES.EXPONENTIAL:
                // a * e^(b*x) + c, но ограничиваем, чтобы не взорвалось
                return a * Math.pow(1.15, x) + c; 
            
            case CURVES.LOGARITHMIC:
                // a * ln(x + 1) + b
                return a * Math.log(x + 1) + b;
            
            case CURVES.STEP:
                // Рост каждые 'step' единиц
                const stepSize = params.step || 5;
                const steps = Math.floor(x / stepSize);
                return a * steps + b;
                
            default:
                return x;
        }
    }

    /**
     * Получение RNG для конкретной точки мира
     * Используем createSeed из name_generator.js
     */
    function getRNG(x, y) {
        // Создаем уникальный сид для мета-данных этого уровня
        // Добавляем смещение 9999, чтобы не конфликтовать с генерацией карты
        const metaSeed = createSeed(x, y) + 9999; 
        return new SeededRandom(metaSeed);
    }

    return {
        /**
         * Получить базовое HP игрока для данного уровня
         */
        getPlayerBaseHP: function(level) {
            // Линейный рост HP
            return Math.floor(calculate(CURVES.LINEAR, level, { a: 5, b: 15 }));
        },

        /**
         * Получить базовую Атаку игрока
         */
        getPlayerBaseAtk: function(level) {
            // Медленный линейный рост
            return Math.floor(calculate(CURVES.LINEAR, level, { a: 0.5, b: 2 }));
        },

        /**
         * Получить базовую Защиту игрока
         */
        getPlayerBaseDef: function(level) {
            // Логарифмический рост, чтобы защита не превышала атаку врагов слишком сильно
            return Math.floor(calculate(CURVES.LOGARITHMIC, level, { a: 1.5, b: 0 }));
        },

        /**
         * Получить множитель сложности врагов для данной глубины
         * Глубина рассчитывается как манхэттенское расстояние от центра (0,0)
         */
        getEnemyMultiplier: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            // Враги становятся сильнее экспоненциально
            // На глубине 10 множитель будет ~4.0
            return calculate(CURVES.EXPONENTIAL, depth, { a: 1.0, b: 0.15, c: 0 });
        },

        /**
         * Множитель ценности золота/лута
         */
        getGoldMultiplier: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            return calculate(CURVES.LINEAR, depth, { a: 1.2, b: 1 });
        },

        /**
         * Множитель силы предметов (качества)
         */
        getItemPowerMultiplier: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            // Предметы становятся лучше линейно, но медленно
            return calculate(CURVES.LINEAR, depth, { a: 0.1, b: 1.0 });
        },

        /**
         * Проверка: является ли этот уровень "Хабом" (безопасной зоной)
         * Хабы появляются каждые 5 шагов по глубине
         */
        isHubLevel: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            // Хаб, если глубина кратна 5, но не 0 (старт)
            return depth > 0 && depth % 5 === 0;
        },

        /**
         * Генерация параметров "тренда" мира для этого уровня
         * Например: "Уровень проклят магией" или "Уровень богат железом"
         * Возвращает объект с модификаторами
         */
        getWorldTrend: function(x, y) {
            const rng = getRNG(x, y);
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
