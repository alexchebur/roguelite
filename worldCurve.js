/**
 * WorldCurve Module
 * Централизованная система прогрессии сложности для roguelite
 * Все значения генерируются детерминировано из seed
 */

var WorldCurveModule = (function() {
    'use strict';
    
    // Внутреннее состояние
    var _seededRandom = null;
    var _config = null;
    var _initialized = false;
    
    // Типы кривых прогрессии
    var CURVE_TYPES = {
        LINEAR: 'linear',           // f(x) = a*x + b
        EXPONENTIAL: 'exponential', // f(x) = a * exp(b*x)
        LOGARITHMIC: 'logarithmic', // f(x) = a * log(b*x + c) + d
        POWER: 'power'              // f(x) = a * x^b + c
    };
    
    // Конфигурация по умолчанию (будет перезаписана при init)
    var DEFAULT_CONFIG = {
        basePlayerStats: {
            hp: 20,
            atk: 3,
            def: 1,
            speed: 10,
            critChance: 0.05,
            critDamage: 1.5
        },
        // Типы кривых для разных параметров
        curves: {
            playerHp: CURVE_TYPES.LINEAR,
            playerAtk: CURVE_TYPES.LINEAR,
            playerDef: CURVE_TYPES.LOGARITHMIC,
            enemyMultiplier: CURVE_TYPES.EXPONENTIAL,
            itemPower: CURVE_TYPES.POWER,
            expRequired: CURVE_TYPES.EXPONENTIAL,
            goldMultiplier: CURVE_TYPES.LINEAR
        },
        // Глобальные тренды мира (влияют на генерацию)
        worldTrends: {
            magicInfluence: 0.3,    // 0..1 — влияет на шансы магических эффектов
            ironAge: 0.5,           // 0..1 — влияет на качество снаряжения
            bloodMoon: 0.0          // 0..1 — влияет на агрессивность врагов
        },
        // Интервал появления хабов (городов) по глубине
        hubInterval: 5,
        // Параметры для генерации коэффициентов кривых
        curveParamRanges: {
            a: { min: 0.1, max: 2.0 },
            b: { min: 0.01, max: 0.5 },
            c: { min: 0, max: 10 },
            d: { min: 0, max: 5 }
        }
    };
    
    // Сгенерированные параметры кривых (заполняются при init)
    var _curveParams = {};
    
    /**
     * Инициализация модуля
     * @param {number} globalSeed - глобальный сид мира
     */
    function init(globalSeed) {
        // Создаём детерминированный генератор для этого модуля
        // ДОБАВЬТЕ СВОИ ЗНАЧЕНИЯ: можно добавить соль для уникальности
        var moduleSeed = globalSeed + 0x576F726C; // "Worl" в hex
        _seededRandom = new SeededRandom(moduleSeed);
        
        // Клонируем конфиг по умолчанию
        _config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        
        // Генерируем параметры кривых из seed
        _generateCurveParams();
        
        // Генерируем мировые тренды
        _generateWorldTrends();
        
        _initialized = true;
        console.log('[WorldCurve] Initialized with seed:', globalSeed);
    }
    
    /**
     * Генерация параметров для всех типов кривых
     */
    function _generateCurveParams() {
        var curves = Object.keys(_config.curves);
        
        for (var i = 0; i < curves.length; i++) {
            var curveName = curves[i];
            var curveType = _config.curves[curveName];
            var params = {};
            
            // Генерируем коэффициенты в заданных диапазонах
            params.a = _randRange(_config.curveParamRanges.a.min, _config.curveParamRanges.a.max);
            params.b = _randRange(_config.curveParamRanges.b.min, _config.curveParamRanges.b.max);
            params.c = _randRange(_config.curveParamRanges.c.min, _config.curveParamRanges.c.max);
            params.d = _randRange(_config.curveParamRanges.d.min, _config.curveParamRanges.d.max);
            
            // Специфичные настройки для типов кривых
            if (curveType === CURVE_TYPES.LINEAR) {
                // Для линейной: используем только a и b
                params.c = 0; params.d = 0;
            } else if (curveType === CURVE_TYPES.LOGARITHMIC) {
                // Для логарифмической гарантируем положительный аргумент
                if (params.b < 0.1) params.b = 0.1;
            }
            
            _curveParams[curveName] = { type: curveType, params: params };
        }
    }
    
    /**
     * Генерация мировых трендов
     */
    function _generateWorldTrends() {
        _config.worldTrends.magicInfluence = _seededRandom.next();
        _config.worldTrends.ironAge = _seededRandom.next();
        _config.worldTrends.bloodMoon = _seededRandom.next() * 0.3; // редко бывает высоким
    }
    
    /**
     * Вспомогательная: случайное число в диапазоне через seededRandom
     */
    function _randRange(min, max) {
        return min + _seededRandom.next() * (max - min);
    }
    
    /**
     * Вычисление значения кривой
     * @param {string} curveName - имя кривой из config.curves
     * @param {number} x - входное значение (уровень/глубина)
     * @returns {number} вычисленное значение
     */
    function _computeCurve(curveName, x) {
        var entry = _curveParams[curveName];
        if (!entry) return 1.0;
        
        var p = entry.params;
        var type = entry.type;
        
        switch (type) {
            case CURVE_TYPES.LINEAR:
                // f(x) = a*x + b, нормализуем к множителю ~1.0 при x=1
                return p.a * x + p.b;
                
            case CURVE_TYPES.EXPONENTIAL:
                // f(x) = a * exp(b*x), ограничиваем рост
                var val = p.a * Math.exp(p.b * x);
                return Math.min(val, 10.0); // кап на 10x множитель
                
            case CURVE_TYPES.LOGARITHMIC:
                // f(x) = a * log(b*x + c) + d
                var arg = p.b * x + p.c;
                if (arg <= 0) arg = 0.1;
                return p.a * Math.log(arg) + p.d;
                
            case CURVE_TYPES.POWER:
                // f(x) = a * x^b + c
                return p.a * Math.pow(x, p.b) + p.c;
                
            default:
                return 1.0;
        }
    }
    
    // ==================== ПУБЛИЧНЫЙ API ====================
    
    /**
     * Получить базовый стат игрока с учётом прогрессии
     * @param {number} level - уровень игрока
     * @param {string} stat - имя стата ('hp', 'atk', 'def', 'speed', 'critChance', 'critDamage')
     * @returns {number} значение стата
     */
    function getPlayerStat(level, stat) {
        if (!_initialized) throw new Error('WorldCurve not initialized');
        
        var base = _config.basePlayerStats[stat];
        if (base === undefined) return 0;
        
        // Для hp/atk/def применяем кривые, для остальных — базовое значение
        var curveMap = {
            'hp': 'playerHp',
            'atk': 'playerAtk', 
            'def': 'playerDef'
        };
        
        var curveName = curveMap[stat];
        if (curveName) {
            var multiplier = _computeCurve(curveName, level);
            // ДОБАВЬТЕ СВОИ ЗНАЧЕНИЯ: можно добавить нелинейную коррекцию
            return Math.round(base * multiplier);
        }
        
        // Для speed, critChance, critDamage — возврат базового или линейный бонус
        if (stat === 'critChance') {
            return Math.min(0.5, base + level * 0.01); // кап 50%
        }
        if (stat === 'critDamage') {
            return Math.min(3.0, base + level * 0.05); // кап 300%
        }
        
        return base;
    }
    
    /**
     * Множитель сложности для врагов на глубине
     * @param {number} depth - глубина подземелья (|globalX|+|globalY|)
     * @returns {number} множитель (1.0 = базовая сложность)
     */
    function getEnemyMultiplier(depth) {
        if (!_initialized) return 1.0;
        var mult = _computeCurve('enemyMultiplier', depth);
        // ДОБАВЬТЕ СВОИ ЗНАЧЕНИЯ: можно добавить случайный разброс ±10%
        return Math.max(1.0, mult);
    }
    
    /**
     * Множитель силы предметов на глубине
     * @param {number} depth - глубина
     * @returns {number} множитель качества предмета
     */
    function getItemPowerMultiplier(depth) {
        if (!_initialized) return 1.0;
        return _computeCurve('itemPower', depth);
    }
    
    /**
     * Опыт, необходимый для следующего уровня
     * @param {number} level - текущий уровень
     * @returns {number} требуемый опыт
     */
    function getExpForLevel(level) {
        if (!_initialized) return 10;
        // Базовая формула: 10 * кривая
        var base = 10;
        var mult = _computeCurve('expRequired', level);
        return Math.round(base * mult);
    }
    
    /**
     * Множитель золота, выпадающего с врагов
     * @param {number} depth - глубина
     * @returns {number} множитель золота
     */
    function getGoldMultiplier(depth) {
        if (!_initialized) return 1.0;
        return _computeCurve('goldMultiplier', depth);
    }
    
    /**
     * Проверка: должен ли на этой глубине быть хаб (город)
     * @param {number} depth - глубина
     * @returns {boolean}
     */
    function shouldGenerateHub(depth) {
        if (!_initialized) return false;
        // Хабы на глубинах, кратных hubInterval (5, 10, 15...)
        return depth > 0 && depth % _config.hubInterval === 0;
    }
    
    /**
     * Получить текущие мировые тренды (для влияния на генерацию)
     * @returns {object} копия объекта трендов
     */
    function getWorldTrends() {
        if (!_initialized) return JSON.parse(JSON.stringify(DEFAULT_CONFIG.worldTrends));
        return JSON.parse(JSON.stringify(_config.worldTrends));
    }
    
    /**
     * Получить конфиг для отладки/расширения
     * @returns {object} копия конфига
     */
    function getConfig() {
        return _config ? JSON.parse(JSON.stringify(_config)) : null;
    }
    
    // Публичный интерфейс модуля
    return {
        init: init,
        getPlayerStat: getPlayerStat,
        getEnemyMultiplier: getEnemyMultiplier,
        getItemPowerMultiplier: getItemPowerMultiplier,
        getExpForLevel: getExpForLevel,
        getGoldMultiplier: getGoldMultiplier,
        shouldGenerateHub: shouldGenerateHub,
        getWorldTrends: getWorldTrends,
        getConfig: getConfig,
        // Для отладки
        _curveParams: _curveParams,
        _config: _config
    };
    
})();
