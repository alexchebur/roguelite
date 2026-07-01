/**
 * МОДУЛЬ ДАННЫХ ТАКТИЧЕСКОГО БОЯ (tactical_data.js)
 * Хранит статичные данные: типы юнитов, формации, тактики, константы.
 */

const TacticalDataModule = (function() {
    'use strict';

    // === ТИПЫ ЮНИТОВ ===
    const UNIT_TYPES = {
        SPEARMAN: {
            id: 'spearman',
            name: 'Копейщик',
            type: 'melee', // ближний бой
            speed: 3, // медленный (3 клетки за ход)
            hp: 20,
            atk: 5,
            def: 3,
            range: 1, // дистанция атаки
            sprite: 'ENEMY_GOBLIN' // заглушка из creature_sprites.png
        },
        CAVALRY: {
            id: 'cavalry',
            name: 'Всадник',
            type: 'melee',
            speed: 8, // быстрый
            hp: 30,
            atk: 7,
            def: 2,
            range: 1,
            sprite: 'ENEMY_WOLF' // заглушка
        },
        ARCHER: {
            id: 'archer',
            name: 'Лучник',
            type: 'range', // дистанционный бой
            speed: 5, // средний
            hp: 15,
            atk: 6,
            def: 1,
            range: 8, // может стрелять на 8 клеток
            sprite: 'ENEMY_SKELETON' // заглушка
        }
    };

    // === ТИПЫ ФОРМАЦИЙ ===
    const FORMATION_TYPES = {
        LINE: {
            id: 'line',
            name: 'Шеренга',
            desc: 'Юниты выстраиваются в линию',
            getOffsets: function(count) {
                const offsets = [];
                for (let i = 0; i < count; i++) {
                    offsets.push({ dx: 0, dy: i });
                }
                return offsets;
            }
        },
        SQUARE: {
            id: 'square',
            name: 'Квадрат',
            desc: 'Юниты выстраиваются в квадрат',
            getOffsets: function(count) {
                const size = Math.ceil(Math.sqrt(count));
                const offsets = [];
                for (let i = 0; i < count; i++) {
                    const row = Math.floor(i / size);
                    const col = i % size;
                    offsets.push({ dx: col, dy: row });
                }
                return offsets;
            }
        },
        SPREAD: {
            id: 'spread',
            name: 'Разреженная',
            desc: 'Юниты выстраиваются с промежутками',
            getOffsets: function(count) {
                const offsets = [];
                for (let i = 0; i < count; i++) {
                    offsets.push({ dx: 0, dy: i * 2 });
                }
                return offsets;
            }
        }
    };

    // === ТАКТИКИ ИГРОКА ===
    const PLAYER_TACTICS = {
        ADVANCE: { 
            id: 'advance', 
            name: '⚔️ Наступать', 
            desc: 'Юниты ищут ближайших врагов',
            key: '1'
        },
        RANGED: { 
            id: 'ranged', 
            name: '🏹 Дистанционная атака', 
            desc: 'Лучники атакуют ближайших врагов',
            key: '2'
        },
        RETREAT: { 
            id: 'retreat', 
            name: '🏃 Отступать', 
            desc: 'Юниты отступают к левому краю',
            key: '3'
        },
        HOLD: { 
            id: 'hold', 
            name: '🛡️ Держать позиции', 
            desc: 'Юниты стоят, лучники стреляют',
            key: '4'
        },
        FLEE: { 
            id: 'flee', 
            name: '💨 Сбежать с поля боя', 
            desc: 'Поражение, но не смерть',
            key: '5'
        }
    };

    // === КОНСТАНТЫ ТАКТИЧЕСКОГО БОЯ ===
    const BATTLEFIELD_WIDTH = 40;
    const BATTLEFIELD_HEIGHT = 20;
    const MAX_UNITS_PER_ARMY = 30;
    const UNIT_COST = 10000; // Стоимость найма отряда в постоялом дворе

    // === СТРАТЕГИИ ДВИЖЕНИЯ АРМИЙ НА ГЛОБАЛЬНОЙ КАРТЕ ===
    const ARMY_STRATEGIES = {
        AGGRESSIVE: 'aggressive', // Идёт к игроку
        PASSIVE: 'passive', // Патрулирует
        FLEEING: 'fleeing' // Отступает от игрока
    };

    return {
        UNIT_TYPES,
        FORMATION_TYPES,
        PLAYER_TACTICS,
        BATTLEFIELD_WIDTH,
        BATTLEFIELD_HEIGHT,
        MAX_UNITS_PER_ARMY,
        UNIT_COST,
        ARMY_STRATEGIES
    };
})();
