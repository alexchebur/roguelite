// =========================== Модуль данных ===========================
const DataModule = (function() {
    const ITEM_ADJECTIVES = ["Ржавый", "Новый", "Тяжелый", "Острый", "Древний", "Магический"];

    const ENEMY_TYPES = [
        { name: "Гоблин", char: "g", color: "#4CAF50", hp: [10, 20], atk: [2, 4], def: [0, 1] },
        { name: "Скелет", char: "s", color: "#B0BEC5", hp: [15, 25], atk: [3, 6], def: [1, 2] },
        { name: "Орк",    char: "O", color: "#8BC34A", hp: [30, 50], atk: [6, 10], def: [2, 4] },
        { name: "Призрак",char: "G", color: "#7C4DFF", hp: [10, 15], atk: [5, 8], def: [0, 1] },
        { name: "Дракон", char: "D", color: "#FF5722", hp: [80, 120], atk: [15, 25], def: [5, 10] }
    ];

    const ITEM_TYPES = [
        { type: "weapon", char: "/", color: "#FFD700", baseName: "Меч", stat: "atk", val: [2, 5] },
        { type: "armor",  char: "]", color: "#9E9E9E", baseName: "Броня", stat: "def", val: [1, 3] },
        { type: "potion_hp", char: "!", color: "#f44336", baseName: "Зелье лечения", effect: "heal", val: [10, 20] },
        { type: "potion_str", char: "!", color: "#ff9800", baseName: "Зелье силы", effect: "buff_atk", val: [1, 2] }
    ];

    const MAP_WIDTH = 100;
    const MAP_HEIGHT = 100;

    return {
        ITEM_ADJECTIVES,
        ENEMY_TYPES,
        ITEM_TYPES,
        MAP_WIDTH,
        MAP_HEIGHT
    };
})();
