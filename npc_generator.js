/** npc_generator.js */
const NpcGeneratorModule = (function() {
    'use strict';
    const NPC_DATA = {
        titles: ["Стражник", "Торговец", "Старейшина", "Пьяница", "Кузнец", "Бродяга"],
        phrases: [
            "Добро пожаловать в наш город.", "Осторожнее за стенами, там полно тварей.",
            "Хочешь купить чего-нибудь?", "Говорят, в подземельях на севере нашли золото.",
            "Я видел, как ты входил. Ты выглядишь опасно.", "Мирного тебе пути."
        ]
    };

    function generateCityNpcs(gx, gy, mapGrid, playerStart) {
        const seedVal = createSeed(gx, gy) + 555;
        const rng = new SeededRandom(seedVal);
        const npcs = [];
        const h = mapGrid.length, w = mapGrid[0].length;
        const count = rng.int(3, 6);
        let attempts = 0;

        while (npcs.length < count && attempts < 200) {
            attempts++;
            const x = rng.int(1, w - 2), y = rng.int(1, h - 2);
            if (mapGrid[y][x] !== 0) continue; // Только пол
            if (Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y) < 3) continue; // Не рядом со стартом
            if (npcs.some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)) continue; // Не рядом с другими

            npcs.push({
                x, y,
                name: rng.choice(NPC_DATA.titles),
                char: "☺", color: "#58a6ff",
                dialog: rng.choice(NPC_DATA.phrases),
                isNPC: true
            });
        }
        return npcs;
    }
    return { generateCityNpcs };
})();
