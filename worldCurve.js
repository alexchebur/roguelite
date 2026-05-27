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
