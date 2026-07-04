/**
 * МОДУЛЬ ДАННЫХ ТАКТИЧЕСКОГО БОЯ (tactical_data.js)
 */
const TacticalDataModule = (function() {
    'use strict';

    const UNIT_TYPES = {
        SPEARMAN: {
            id: 'spearman',
            name: 'Копейщик',
            type: 'melee',      // Ближний бой
            speed: 3,
            hp: 20,
            atk: 5,
            def: 3,
            range: 1,           // <--- ВАЖНО: Атакует только вплотную
            sprite: 'g' 
        },
        CAVALRY: {
            id: 'cavalry',
            name: 'Всадник',
            type: 'melee',      // Ближний бой
            speed: 8,
            hp: 30,
            atk: 7,
            def: 2,
            range: 1,           // <--- ВАЖНО: Атакует только вплотную
            sprite: 'w' 
        },
        ARCHER: {
            id: 'archer',
            name: 'Лучник',
            type: 'range',      // Дальний бой
            speed: 5,
            hp: 15,
            atk: 6,
            def: 1,
            range: 8,           // <--- ВАЖНО: Стреляет издалека
            sprite: 's' 
        }
    };

    const FORMATION_TYPES = {
        LINE: { id: 'line', name: 'Шеренга' },
        SQUARE: { id: 'square', name: 'Квадрат' },
        SPREAD: { id: 'spread', name: 'Разреженная' }
    };

    const PLAYER_TACTICS = {
        ADVANCE: { id: 'advance', name: '⚔️ Наступать', key: '1' },
        RANGED: { id: 'ranged', name: '🏹 Дистанционная атака', key: '2' },
        RETREAT: { id: 'retreat', name: '🏃 Отступать', key: '3' },
        HOLD: { id: 'hold', name: '🛡️ Держать позиции', key: '4' },
        FLEE: { id: 'flee', name: '💨 Сбежать', key: '5' }
    };

    // === ВАЖНО: УМЕНЬШАЕМ РАЗМЕР АРЕНЫ ПОД ЭКРАН 30x20 ===
    const BATTLEFIELD_WIDTH = 28; 
    const BATTLEFIELD_HEIGHT = 18; 
    
    const MAX_UNITS_PER_ARMY = 10;
    const MAX_PLAYER_SQUADS = 5; 
    const UNIT_COST = 10000;
    
    const ARMY_STRATEGIES = {
        AGGRESSIVE: 'aggressive',
        PASSIVE: 'passive',
        FLEEING: 'fleeing'
    };

    return {
        UNIT_TYPES,
        FORMATION_TYPES,
        PLAYER_TACTICS,
        BATTLEFIELD_WIDTH,
        BATTLEFIELD_HEIGHT,
        MAX_UNITS_PER_ARMY,
        MAX_PLAYER_SQUADS, 
        UNIT_COST,
        ARMY_STRATEGIES
    };
})();

// Экспорт в глобальную область видимости
window.TacticalDataModule = TacticalDataModule;
