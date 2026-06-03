// =========================== Модуль данных ===========================
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
        // === УРОВЕНЬ 1-3 ===
        { name: "Крыса", char: getChar('ENEMY_RAT'), color: "#795548", hp: [8, 12], atk: [1, 1], def: [0, 0], lootType: "food" },
        { name: "Гоблин", char: getChar('ENEMY_GOBLIN'), color: "#4CAF50", hp: [12, 18], atk: [1, 2], def: [0, 1], lootType: "gold" },
        { name: "Волк", char: getChar('ENEMY_WOLF'), color: "#9E9E9E", hp: [15, 22], atk: [2, 3], def: [0, 1], lootType: "food" },
        
        // === УРОВЕНЬ 4-6 ===
        { name: "Бандит", char: getChar('ENEMY_BANDIT'), color: "#FF9800", hp: [25, 35], atk: [3, 5], def: [1, 2], lootType: "weapon" },
        { name: "Скелет", char: getChar('ENEMY_SKELETON'), color: "#B0BEC5", hp: [20, 30], atk: [3, 6], def: [1, 2], lootType: "gold" },
        { name: "Слизень", char: getChar('ENEMY_SLIME'), color: "#00BCD4", hp: [30, 45], atk: [2, 3], def: [3, 5], lootType: "food" },
        { name: "Орк-разведчик", char: getChar('ENEMY_ORC'), color: "#8BC34A", hp: [35, 50], atk: [4, 7], def: [2, 3], lootType: "weapon" },

        // === УРОВЕНЬ 7-9 ===
        { name: "Зомби", char: getChar('ENEMY_ZOMBIE'), color: "#607D8B", hp: [50, 70], atk: [6, 9], def: [2, 4], lootType: "gold" },
        { name: "Гарпия", char: getChar('ENEMY_HARPY'), color: "#E91E63", hp: [40, 60], atk: [8, 12], def: [1, 2], lootType: "weapon" },
        { name: "Призрак", char: getChar('ENEMY_GHOST'), color: "#7C4DFF", hp: [30, 45], atk: [7, 10], def: [0, 1], lootType: "gold" },
        { name: "Вампир", char: getChar('ENEMY_VAMPIRE'), color: "#C62828", hp: [60, 85], atk: [9, 13], def: [3, 5], lootType: "weapon" },

        // === УРОВЕНЬ 10+ ===
        { name: "Тролль", char: getChar('ENEMY_TROLL'), color: "#4CAF50", hp: [80, 120], atk: [10, 15], def: [2, 3], lootType: "gold" },
        { name: "Лич", char: getChar('ENEMY_LICH'), color: "#7B1FA2", hp: [70, 100], atk: [12, 18], def: [2, 4], lootType: "weapon" },
        { name: "Голем", char: getChar('ENEMY_GOLEM'), color: "#90A4AE", hp: [120, 180], atk: [12, 16], def: [8, 12], lootType: "gold" },
        { name: "Дракон", char: getChar('ENEMY_DRAGON'), color: "#FF5722", hp: [100, 150], atk: [15, 22], def: [5, 8], lootType: "weapon" }
    ];

    const ITEM_TYPES = [
        // === МЕЛЕЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_SWORD'), color: "#FFD700", baseName: "Меч", stat: "atk", val: [2, 5], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_AXE'), color: "#FFD700", baseName: "Топор", stat: "atk", val: [3, 7], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_MACE'), color: "#FFD700", baseName: "Булава", stat: "atk", val: [2, 6], gender: "she", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_DAGGER'), color: "#FF9800", baseName: "Кинжал", stat: "atk", val: [1, 3], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_SPEAR'), color: "#FFD700", baseName: "Копьё", stat: "atk", val: [4, 8], gender: "it", plural: false, meleeType: true, range: 1 },
        
        // === ДИСТАНЦИОННОЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_BOW'), color: "#FF9800", baseName: "Лук", stat: "atk", val: [3, 6], gender: "he", plural: false, meleeType: false, range: 6, maxAmmo: 20 },
        { type: "weapon", char: getChar('ITEM_CROSSBOW'), color: "#FF9800", baseName: "Арбалет", stat: "atk", val: [5, 9], gender: "he", plural: false, meleeType: false, range: 8, maxAmmo: 15 },
        { type: "weapon", char: getChar('ITEM_STAFF'), color: "#B39DDB", baseName: "Посох огня", stat: "atk", val: [2, 4], gender: "he", plural: false, meleeType: false, range: 5, maxAmmo: 50 },
        
        // === БРОНЯ ===
        { type: "armor", char: getChar('ITEM_ARMOR_LEATHER'), color: "#9E9E9E", baseName: "Кожаная броня", stat: "def", val: [1, 3], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_ARMOR_CHAIN'), color: "#9E9E9E", baseName: "Кольчуга", stat: "def", val: [3, 6], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_SHIELD'), color: "#795548", baseName: "Щит", stat: "def", val: [2, 4], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GREAVES'), color: "#4CAF50", baseName: "Наголенники", stat: "def", val: [1, 3], gender: "he", plural: true },
        { type: "armor", char: getChar('ITEM_CLOAK'), color: "#8D6E63", baseName: "Плащ теней", stat: "def", val: [2, 3], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_HELMET'), color: "#607D8B", baseName: "Шлем", stat: "def", val: [1, 2], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GLOVES'), color: "#8D6E63", baseName: "Перчатки", stat: "def", val: [1, 2], gender: "she", plural: true },
    

        // === КНИГИ (ЛОР) ===
        // type: 'book' - специальный тип, который не кладется в инвентарь, а читается сразу
        { 
            type: "book", 
            char: getChar('ITEM_BOOK'), 
            color: "#A67C52", // Цвет старой бумаги/кожи
            baseName: "Старая книга", 
            gender: "she", 
            plural: false 
        },

   
        // === ЗОЛОТО ===
        { type: "gold", char: getChar('ITEM_GOLD'), color: "#FFD700", baseName: "Монеты", val: [5, 15] },
        
        // === ЗЕЛЬЯ И ЕДА ===
        { type: "potion_hp", char: getChar('ITEM_POTION_HP'), color: "#f44336", baseName: "Зелье лечения", effect: "heal", val: [10, 20] },
        { type: "potion_hp", char: getChar('ITEM_ELIXIR'), color: "#f44336", baseName: "Эликсир жизни", effect: "heal", val: [25, 40] },
        { type: "food", char: getChar('ITEM_FOOD_BREAD'), color: "#8BC34A", baseName: "Хлеб и сыр", effect: "heal", val: [5, 10] },
        { type: "food", char: getChar('ITEM_FOOD_MEAT'), color: "#8BC34A", baseName: "Жареная крыса", effect: "heal", val: [8, 12] },
        { type: "potion_str", char: getChar('ITEM_POTION_STR'), color: "#ff9800", baseName: "Зелье силы", effect: "buff_atk", val: [1, 2] },
        { type: "potion_str", char: getChar('ITEM_BERSERK'), color: "#ff9800", baseName: "Настой берсерка", effect: "buff_atk", val: [3, 5] }
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
