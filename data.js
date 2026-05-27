// =========================== Модуль данных ===========================
const DataModule = (function() {
    // Расширенные прилагательные с формами для согласования
    const ITEM_ADJECTIVES = [
        { base: "Ржавый", she: "Ржавая", it: "Ржавое", plural: "Ржавые" },
        { base: "Новый", she: "Новая", it: "Новое", plural: "Новые" },
        { base: "Тяжелый", she: "Тяжелая", it: "Тяжелое", plural: "Тяжелые" },
        { base: "Острый", she: "Острая", it: "Острое", plural: "Острые" },
        { base: "Древний", she: "Древняя", it: "Древнее", plural: "Древние" },
        { base: "Магический", she: "Магическая", it: "Магическое", plural: "Магические" },
        { base: "Проклятый", she: "Проклятая", it: "Проклятое", plural: "Проклятые" },
        { base: "Святой", she: "Святая", it: "Святое", plural: "Святые" }
    ];

    const ENEMY_TYPES = [
        // === УРОВЕНЬ 1-3: Обучение и разминка ===
        // Игрок (HP 100, Def 3) должен чувствовать себя уверенно.
        { name: "Крыса", char: "r", color: "#795548", hp: [8, 12], atk: [1, 2], def: [0, 0] },      // Урон 0-1 (безопасно)
        { name: "Гоблин", char: "g", color: "#4CAF50", hp: [12, 18], atk: [2, 4], def: [0, 1] },    // Урон 1-3 (легко)
        { name: "Волк", char: "w", color: "#9E9E9E", hp: [15, 22], atk: [3, 5], def: [0, 1] },      // Урон 2-4 (средне)
        
        // === УРОВЕНЬ 4-6: Первая опасность ===
        // Появляются враги с защитой или высоким уроном.
        { name: "Бандит", char: "b", color: "#FF9800", hp: [25, 35], atk: [4, 6], def: [1, 2] },    // Танкует немного
        { name: "Скелет", char: "s", color: "#B0BEC5", hp: [20, 30], atk: [4, 7], def: [1, 2] },    // Бьет больнее
        { name: "Слизень", char: "j", color: "#00BCD4", hp: [30, 45], atk: [2, 3], def: [3, 5] },   // Почти не получает урон без хорошего оружия
        { name: "Орк-разведчик", char: "O", color: "#8BC34A", hp: [35, 50], atk: [5, 8], def: [2, 3] }, // Опасен в группе

        // === УРОВЕНЬ 7-9: Серьезные противники ===
        // Требуют зелий и хорошей экипировки.
        { name: "Зомби", char: "z", color: "#607D8B", hp: [50, 70], atk: [6, 9], def: [2, 4] },     // Медленный, но живой
        { name: "Гарпия", char: "h", color: "#E91E63", hp: [40, 60], atk: [8, 12], def: [1, 2] },   // Высокий урон, мало HP
        { name: "Призрак", char: "G", color: "#7C4DFF", hp: [30, 45], atk: [7, 10], def: [0, 1] },  // Бьет больно, но хрупкий
        { name: "Вампир", char: "V", color: "#C62828", hp: [60, 85], atk: [9, 13], def: [3, 5] },   // Универсальный боец

        // === УРОВЕНЬ 10+: Боссы и элита ===
        // Без полного сета брони и оружия лучше не лезть.
        { name: "Тролль", char: "T", color: "#4CAF50", hp: [80, 120], atk: [10, 15], def: [4, 7] }, // Регенерация (в будущем), сейчас просто танк
        { name: "Лич", char: "L", color: "#7B1FA2", hp: [70, 100], atk: [12, 18], def: [2, 4] },    // Магический урон
        { name: "Голем", char: "M", color: "#90A4AE", hp: [120, 180], atk: [12, 16], def: [8, 12] }, // Стена. Нужен пробив брони.
        { name: "Дракон", char: "D", color: "#FF5722", hp: [100, 150], atk: [15, 22], def: [5, 8] } // Финальный босс
    ];
    const ITEM_TYPES = [
        // === ОРУЖИЕ (stat: "atk") ===
        { type: "weapon", char: "/", color: "#FFD700", baseName: "Меч", stat: "atk", val: [2, 5], gender: "he", plural: false },
        { type: "weapon", char: "^", color: "#FFD700", baseName: "Топор", stat: "atk", val: [3, 7], gender: "he", plural: false },
        { type: "weapon", char: ")", color: "#FFD700", baseName: "Булава", stat: "atk", val: [2, 6], gender: "she", plural: false },
        { type: "weapon", char: "(", color: "#FFD700", baseName: "Лук", stat: "atk", val: [3, 6], gender: "he", plural: false },
        { type: "weapon", char: "*", color: "#FF9800", baseName: "Кинжал", stat: "atk", val: [1, 3], gender: "he", plural: false },
        { type: "weapon", char: "|", color: "#B39DDB", baseName: "Посох", stat: "atk", val: [1, 4], gender: "he", plural: false },
        { type: "weapon", char: "Y", color: "#FFD700", baseName: "Копьё", stat: "atk", val: [4, 8], gender: "it", plural: false },
        { type: "weapon", char: "=", color: "#FF9800", baseName: "Арбалет", stat: "atk", val: [5, 9], gender: "he", plural: false },
        
        // === БРОНЯ (stat: "def") ===
        { type: "armor", char: "]", color: "#9E9E9E", baseName: "Кожаная броня", stat: "def", val: [1, 3], gender: "she", plural: false },
        { type: "armor", char: "[", color: "#9E9E9E", baseName: "Кольчуга", stat: "def", val: [3, 6], gender: "she", plural: false },
        { type: "armor", char: "}", color: "#795548", baseName: "Щит", stat: "def", val: [2, 4], gender: "he", plural: false },
        { type: "armor", char: "o", color: "#4CAF50", baseName: "Наголенники", stat: "def", val: [1, 3], gender: "he", plural: true },
        { type: "armor", char: "{", color: "#8D6E63", baseName: "Плащ теней", stat: "def", val: [2, 3], gender: "he", plural: false },
        { type: "armor", char: "H", color: "#607D8B", baseName: "Шлем", stat: "def", val: [1, 2], gender: "he", plural: false },
        { type: "armor", char: "G", color: "#8D6E63", baseName: "Перчатки", stat: "def", val: [1, 2], gender: "she", plural: true },
        
        // === ЗЕЛЬЯ И ЕДА (effect: "heal" или "buff_atk") ===
        { type: "potion_hp", char: "!", color: "#f44336", baseName: "Зелье лечения", effect: "heal", val: [10, 20] },
        { type: "potion_hp", char: "+", color: "#f44336", baseName: "Эликсир жизни", effect: "heal", val: [25, 40] },
        { type: "food", char: "%", color: "#8BC34A", baseName: "Хлеб и сыр", effect: "heal", val: [5, 10] },
        { type: "food", char: "~", color: "#8BC34A", baseName: "Жареная крыса", effect: "heal", val: [8, 12] },
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
