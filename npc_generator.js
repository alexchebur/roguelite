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
    function generateCityNpcs(gx, gy, mapGrid) {
        const seedVal = createSeed(gx, gy) + 555; // Уникальный сид для NPC в этом городе
        const rng = new SeededRandom(seedVal);
        
        const npcs = [];
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        
        // Количество NPC зависит от размера карты, но не более 5-8
        const npcCount = rng.int(3, 6); 
        let attempts = 0;

        while (npcs.length < npcCount && attempts < 100) {
            attempts++;
            
            // 1. Случайная позиция
            const x = rng.int(1, width - 2);
            const y = rng.int(1, height - 2);

            // 2. Проверка: это пол?
            if (mapGrid[y][x] !== 0) continue;

            // 3. Проверка: не слишком ли близко к другим NPC или лестнице (упрощенно)
            // Можно добавить проверку дистанции до stairsUp, если нужно
            
            // 4. Создаем NPC
            const title = rng.choice(NPC_DATA.titles);
            const phrase = rng.choice(NPC_DATA.phrases);
            
            npcs.push({
                x: x,
                y: y,
                name: title,
                char: "☺",
                color: "#58a6ff", // Синий цвет для дружественных
                dialog: phrase,
                isNPC: true,
                id: `npc_${x}_${y}` // Уникальный ID для этого NPC
            });
        }

        return npcs;
    }

    return {
        generateCityNpcs: generateCityNpcs
    };
})();
    };

})();
