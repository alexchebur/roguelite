/**
 * МОДУЛЬ ГЕНЕРАЦИИ NPC (npc_generator.js)
 * Создает нейтральных персонажей для городов.
 */

const NpcGeneratorModule = (function() {
    'use strict';

    // Базы данных
    const NPC_DATA = {
        titles: [
            "Стражник", "Торговец", "Старейшина", "Пьяница", "Кузнец", "Бродяга",
            "Клирик", "Священник", "Бард", "Охотник", "Крестьянин", "Чиновник",
            "Пастух", "Знахарка", "Трактирщик", "Гонец", "Зазывала", "Странник",
            "Плотник", "Егерь", "Монах", "Рыбак", "Купец", "Бродячий философ"
        ],
        phrases: [
            "Добро пожаловать в наш город.",
            "Осторожнее за стенами, там полно тварей.",
            "Ищешь неприятностей?",
            "Я слежу за тобой, ничтожество",
            "Я видел, как ты входил. Ты выглядишь опасно.",
            "Мирного тебе пути.",
            "В последнее время ночи стали слишком тихими...",
            "Говорят, в глубинах подземелий водятся драконы.",
            "Не доверяй теням в переулке.",
            "Я слышал шёпот из глубин. Они просыпаются.",
            "Мой дед говорил, что раньше здесь процветала торговля.",
            "Нынче на дорогах небезопасно.",
            "Берегись подземных тварей.",
            "В этом городе отличный эль.",
            "Странник, ты ищешь славу или золото? Оба пути опасны.",
            "Меня тоже когда-то вела дорога приключений.",
            "Молитвы не спасут тебя от когтей, но успокоят душу.",
            "Говорят, никто не возвращался из заброшенных руин.",
            "Люди слышали стук барабанов глубоко под землей.",
            "Не спускайся глубже без хорошего клинка."
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
        const count = rng.int(20, 60);
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
