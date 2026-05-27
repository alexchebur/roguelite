/**
 * МОДУЛЬ ГЕНЕРАЦИИ NPC (npc_generator.js)
 * Создает нейтральных персонажей для городов.
 */

const NpcGeneratorModule = (function() {
    'use strict';

    // Базы данных
    const NPC_DATA = {
        titles: ["Стражник", "Торговец", "Старейшина", "Пьяница", "Кузнец", "Бродяга"],
        phrases: [
            "Добро пожаловать в наш город.",
            "Осторожнее за стенами, там полно тварей.",
            "Хочешь купить чего-нибудь?",
            "Говорят, в подземельях на севере нашли золото.",
            "Я видел, как ты входил. Ты выглядишь опасно.",
            "Мирного тебе пути."
        ]
    };

    /**
     * Генерирует список NPC для города
     * @param {number} gx - глобальная X
     * @param {number} gy - глобальная Y
     * @param {Array} mapGrid - двумерный массив карты города (0 - пол, 1 - стена)
     * @returns {Array} массив объектов NPC
     */
    function generateCityNpcs(gx, gy, mapGrid, playerStart) {
        const seedVal = createSeed(gx, gy) + 555;
        const rng = new SeededRandom(seedVal);
        const npcs = [];
        const h = mapGrid.length, w = mapGrid[0].length;
        const count = rng.int(3, 6);
        let attempts = 0;

        // Возможные направления: [dx, dy]
        const directions = [
            { dx: 0, dy: -1 }, // Вверх
            { dx: 0, dy: 1 },  // Вниз
            { dx: -1, dy: 0 }, // Влево
            { dx: 1, dy: 0 }   // Вправо
        ];

        while (npcs.length < count && attempts < 200) {
            attempts++;
            const x = rng.int(1, w - 2), y = rng.int(1, h - 2);
            if (mapGrid[y][x] !== 0) continue; 
            if (Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y) < 3) continue; 
            if (npcs.some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)) continue; 

            npcs.push({
                x, y,
                name: rng.choice(NPC_DATA.titles),
                char: "☺", color: "#58a6ff",
                dialog: rng.choice(NPC_DATA.phrases),
                isNPC: true,
                // Выбираем начальное случайное направление
                direction: directions[rng.int(0, 3)] 
            });
        }
        return npcs;
    }

    return {
        generateCityNpcs: generateCityNpcs
    };
})();
