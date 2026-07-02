/**
 * МОДУЛЬ ГЕНЕРАЦИИ ТАКТИЧЕСКОЙ АРЕНЫ (tactical_map.js)
 * Создает поле боя на основе ландшафта глобальной карты.
 */

const TacticalMapModule = (function() {
    'use strict';

    // Маппинг типов ландшафта на цвета/символы для тактической карты
    const TERRAIN_MAP = {
        'plain': { char: '.', color: '#3e4a3e', name: 'Равнина' },
        'forest': { char: '"', color: '#2e5a2e', name: 'Лес' },
        'road': { char: ',', color: '#5c4d3c', name: 'Дорога' },
        'water': { char: '~', color: '#2e4a6e', name: 'Болото' }, // Если армия у воды
        'mountain': { char: '^', color: '#4a4a4a', name: 'Предгорье' } // Если армия в горах
    };

    /**
     * Генерирует тактическую арену
     * @param {string} terrainType - тип ландшафта глобальной карты
     * @returns {Object} - объект арены { width, height, mapData, startPosPlayer, startPosEnemy }
     */
    function generateArena(terrainType) {
        const width = TacticalDataModule.BATTLEFIELD_WIDTH;
        const height = TacticalDataModule.BATTLEFIELD_HEIGHT;
        
        // Создаем пустую карту (все клетки проходимы)
        const mapData = Array(height).fill().map(() => Array(width).fill(0));
        
        // Определяем визуальный стиль пола
        const style = TERRAIN_MAP[terrainType] || TERRAIN_MAP['plain'];

        return {
            width: width,
            height: height,
            mapData: mapData,
            floorChar: style.char,
            floorColor: style.color,
            wallColor: '#000', // Стен нет, но цвет нужен для рендера
            // Точки спавна: Игрок слева, Враг справа
            startPosPlayer: { x: 2, y: Math.floor(height / 2) },
            startPosEnemy: { x: width - 5, y: Math.floor(height / 2) }
        };
    }

    return {
        generateArena: generateArena
    };
})();
