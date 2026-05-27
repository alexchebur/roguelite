// =========================== Модуль данных ===========================
const DataModule = (function() {
    const ITEM_ADJECTIVES = ["Ржавый", "Новый", "Тяжелый", "Острый", "Древний", "Магический"];

    const ENEMY_TYPES = [
        // Базовые (глубина 1-3)
        { name: "Гоблин", char: "g", color: "#4CAF50", hp: [10, 20], atk: [2, 4], def: [0, 1] },
        { name: "Крыса-мутант", char: "r", color: "#795548", hp: [8, 15], atk: [1, 3], def: [0, 0] },
        { name: "Бандит", char: "b", color: "#FF9800", hp: [25, 35], atk: [4, 7], def: [1, 2] },
        { name: "Волк", char: "w", color: "#9E9E9E", hp: [12, 18], atk: [3, 5], def: [0, 1] },
        { name: "Кобольд", char: "k", color: "#FFC107", hp: [18, 28], atk: [3, 6], def: [1, 2] },
        
        // Средние (глубина 4-7)
        { name: "Скелет", char: "s", color: "#B0BEC5", hp: [15, 25], atk: [3, 6], def: [1, 2] },
        { name: "Слизень", char: "j", color: "#00BCD4", hp: [20, 30], atk: [2, 4], def: [3, 5] },
        { name: "Имп", char: "i", color: "#F44336", hp: [15, 22], atk: [6, 9], def: [1, 2] },
        { name: "Зомби", char: "z", color: "#607D8B", hp: [40, 60], atk: [4, 7], def: [2, 3] },
        { name: "Гарпия", char: "h", color: "#E91E63", hp: [28, 40], atk: [7, 11], def: [2, 3] },
        { name: "Паук-гигант", char: "S", color: "#3E2723", hp: [35, 50], atk: [5, 8], def: [2, 4] },
        { name: "Орк", char: "O", color: "#8BC34A", hp: [30, 50], atk: [6, 10], def: [2, 4] },
        { name: "Элементаль", char: "e", color: "#00E5FF", hp: [45, 70], atk: [8, 12], def: [3, 5] },
        
        // Сложные (глубина 8-12)
        { name: "Призрак", char: "G", color: "#7C4DFF", hp: [10, 15], atk: [5, 8], def: [0, 1] },
        { name: "Вампир", char: "V", color: "#C62828", hp: [55, 80], atk: [9, 14], def: [3, 5] },
        { name: "Тролль", char: "T", color: "#4CAF50", hp: [60, 90], atk: [10, 15], def: [4, 7] },
        { name: "Лич", char: "L", color: "#7B1FA2", hp: [70, 100], atk: [11, 16], def: [4, 6] },
        { name: "Голем", char: "M", color: "#90A4AE", hp: [100, 150], atk: [12, 18], def: [8, 12] },
        { name: "Демон", char: "d", color: "#D50000", hp: [90, 130], atk: [14, 20], def: [5, 8] },
        { name: "Дракон", char: "D", color: "#FF5722", hp: [80, 120], atk: [15, 25], def: [5, 10] }
    ];

    const ITEM_TYPES = [
        // ОРУЖИЕ (stat: "atk")
        { type: "weapon", char: "/", color: "#FFD700", baseName: "Меч", stat: "atk", val: [2, 5] },
        { type: "weapon", char: "^", color: "#FFD700", baseName: "Топор", stat: "atk", val: [3, 7] },
        { type: "weapon", char: ")", color: "#FFD700", baseName: "Булава", stat: "atk", val: [2, 6] },
        { type: "weapon", char: "(", color: "#FFD700", baseName: "Лук", stat: "atk", val: [3, 6] },
        { type: "weapon", char: "*", color: "#FF9800", baseName: "Кинжал", stat: "atk", val: [1, 3] },
        { type: "weapon", char: "|", color: "#B39DDB", baseName: "Посох", stat: "atk", val: [1, 4] },
        
        // БРОНЯ (stat: "def")
        { type: "armor", char: "]", color: "#9E9E9E", baseName: "Кожаная броня", stat: "def", val: [1, 3] },
        { type: "armor", char: "[", color: "#9E9E9E", baseName: "Кольчуга", stat: "def", val: [3, 6] },
        { type: "armor", char: "}", color: "#795548", baseName: "Щит", stat: "def", val: [2, 4] },
        { type: "armor", char: "o", color: "#4CAF50", baseName: "Наголенники", stat: "def", val: [1, 3] },
        { type: "armor", char: "{", color: "#8D6E63", baseName: "Плащ теней", stat: "def", val: [2, 3] },
        
        // ЗЕЛЬЯ И ЕДА (effect: "heal" или "buff_atk")
        { type: "potion_hp", char: "!", color: "#f44336", baseName: "Зелье лечения", effect: "heal", val: [10, 20] },
        { type: "potion_hp", char: "+", color: "#f44336", baseName: "Эликсир жизни", effect: "heal", val: [25, 40] },
        { type: "food", char: "%", color: "#8BC34A", baseName: "Хлеб и сыр", effect: "heal", val: [5, 10] },
        { type: "potion_str", char: "!", color: "#ff9800", baseName: "Зелье силы", effect: "buff_atk", val: [1, 2] },
        { type: "potion_str", char: "*", color: "#ff9800", baseName: "Настой берсерка", effect: "buff_atk", val: [3, 5] }
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
