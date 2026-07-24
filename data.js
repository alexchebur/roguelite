// =========================== Модуль данных =========================== 
const DataModule = (function() {
    
    // === СИСТЕМА ТИРОВ ПРИЛАГАТЕЛЬНЫХ (РАЗДЕЛЬНАЯ) ===
    const ADJECTIVE_TIERS = {
        // Общие пороги силы (val) для определения тира
        thresholds: {
            trash: 3,    // val <= 3
            common: 8,   // val <= 8
            rare: 15,    // val <= 15
            epic: 25,    // val <= 25
            legendary: Infinity // val > 25
        },

        // Списки слов для ОРУЖИЯ
        weapon: {
            trash: [
                { base: "Ветхий", she: "Ветхая", it: "Ветхое", plural: "Ветхие" },
                { base: "Погнутый", she: "Погнутая", it: "Погнутое", plural: "Погнутые" },
                { base: "Тупой", she: "Тупая", it: "Тупое", plural: "Тупые" }
            ],
            common: [
                { base: "Кованый", she: "Кованая", it: "Кованое", plural: "Кованые" },
                { base: "Стальной", she: "Стальная", it: "Стальное", plural: "Стальные" },
                { base: "Боевой", she: "Боевая", it: "Боевое", plural: "Боевые" }
            ],
            rare: [
                { base: "Острый", she: "Острая", it: "Острое", plural: "Острые" },
                { base: "Закаленный", she: "Закаленная", it: "Закаленное", plural: "Закаленные" },
                { base: "Тяжелый", she: "Тяжелая", it: "Тяжелое", plural: "Тяжелые" }
            ],
            epic: [
                { base: "Мифриловый", she: "Мифриловая", it: "Мифриловое", plural: "Мифриловые" },
                { base: "Зачарованный", she: "Зачарованная", it: "Зачарованное", plural: "Зачарованные" },
                { base: "Рунический", she: "Руническая", it: "Руническое", plural: "Рунические" }
            ],
            legendary: [
                { base: "Легендарный", she: "Легендарная", it: "Легендарное", plural: "Легендарные" },
                { base: "Божественный", she: "Божественная", it: "Божественное", plural: "Божественные" },
                { base: "Убийца богов", she: "Убийца богов", it: "Убийца богов", plural: "Убийцы богов" }
            ]
        },

        // Списки слов для БРОНИ
        armor: {
            trash: [
                { base: "Дырявый", she: "Дырявая", it: "Дырявое", plural: "Дырявые" },
                { base: "Грязный", she: "Грязная", it: "Грязное", plural: "Грязные" },
                { base: "Ветхий", she: "Ветхая", it: "Ветхое", plural: "Ветхие" }
            ],
            common: [
                { base: "Прочный", she: "Прочная", it: "Прочное", plural: "Прочные" },
                { base: "Крепкий", she: "Крепкая", it: "Крепкое", plural: "Крепкие" },
                { base: "Кожаный", she: "Кожаная", it: "Кожаное", plural: "Кожаные" }
            ],
            rare: [
                { base: "Укрепленный", she: "Укрепленная", it: "Укрепленное", plural: "Укрепленные" },
                { base: "Латный", she: "Латная", it: "Латное", plural: "Латные" },
                { base: "Массивный", she: "Массивная", it: "Массивное", plural: "Массивные" }
            ],
            epic: [
                { base: "Адамантиновый", she: "Адамантиновая", it: "Адамантиновое", plural: "Адамантиновые" },
                { base: "Зерцальный", she: "Зерцальная", it: "Зерцальное", plural: "Зерцальные" },
                { base: "Эфирный", she: "Эфирная", it: "Эфирное", plural: "Эфирные" }
            ],
            legendary: [
                { base: "Непробиваемый", she: "Непробиваемая", it: "Непробиваемое", plural: "Непробиваемые" },
                { base: "Благословенный", she: "Благословенная", it: "Благословенное", plural: "Благословенные" },
                { base: "Доспех титана", she: "Доспех титана", it: "Доспех титана", plural: "Доспехи титанов" }
            ]
        },

        // Списки слов для ОБЫЧНЫХ ПРЕДМЕТОВ (зелья, еда, свитки)
        consumable: {
            trash: [
                { base: "Старый", she: "Старая", it: "Старое", plural: "Старые" },
                { base: "Вонючий", she: "Вонючая", it: "Вонючее", plural: "Вонючие" }
            ],
            common: [
                { base: "Обычный", she: "Обычная", it: "Обычное", plural: "Обычные" },
                { base: "Свежий", she: "Свежая", it: "Свежее", plural: "Свежие" }
            ],
            rare: [
                { base: "Качественный", she: "Качественная", it: "Качественное", plural: "Качественные" },
                { base: "Ароматный", she: "Ароматная", it: "Ароматное", plural: "Ароматные" }
            ],
            epic: [
                { base: "Магический", she: "Магическая", it: "Магическое", plural: "Магические" },
                { base: "Редкий", she: "Редкая", it: "Редкое", plural: "Редкие" }
            ],
            legendary: [
                { base: "Артефактный", she: "Артефактная", it: "Артефактное", plural: "Артефактные" },
                { base: "Бесконечный", she: "Бесконечная", it: "Бесконечное", plural: "Бесконечные" }
            ]
        }
    };

    const ENEMY_TYPES = [
        // === УРОВЕНЬ 1-3 ===
        { name: "Крыса", char: getChar('ENEMY_RAT'), color: "#795548", hp: [8, 12], atk: [1, 1], def: [0, 0], lootType: "food", speed: 10 },
        { name: "Гоблин", char: getChar('ENEMY_GOBLIN'), color: "#4CAF50", hp: [12, 18], atk: [1, 2], def: [0, 1], lootType: "gold", speed: 10 },
        { name: "Волк", char: getChar('ENEMY_WOLF'), color: "#9E9E9E", hp: [15, 22], atk: [2, 3], def: [0, 1], lootType: "food", speed: 10 },
        
        // === УРОВЕНЬ 4-6 (СНИЖЕНЫ ПОКАЗАТЕЛИ) ===
        { name: "Бандит", char: getChar('ENEMY_BANDIT'), color: "#FF9800", hp: [18, 25], atk: [2, 4], def: [0, 1], lootType: "weapon", speed: 10 },
        { name: "Скелет", char: getChar('ENEMY_SKELETON'), color: "#B0BEC5", hp: [15, 22], atk: [2, 4], def: [1, 2], lootType: "gold", speed: 8},
        { name: "Слизень", char: getChar('ENEMY_SLIME'), color: "#00BCD4", hp: [20, 30], atk: [1, 1], def: [1, 2], lootType: "food", speed: 3 },
        { name: "Орк-разведчик", char: getChar('ENEMY_ORC'), color: "#8BC34A", hp: [25, 35], atk: [3, 4], def: [1, 2], lootType: "weapon", speed: 9 },

        // === УРОВЕНЬ 7-9 ===
        { name: "Зомби", char: getChar('ENEMY_ZOMBIE'), color: "#607D8B", hp: [40, 55], atk: [4, 7], def: [1, 3], lootType: "gold", speed: 3 },
        { name: "Гарпия", char: getChar('ENEMY_HARPY'), color: "#E91E63", hp: [30, 45], atk: [6, 9], def: [0, 1], lootType: "weapon", speed: 12 },
        { name: "Призрак", char: getChar('ENEMY_GHOST'), color: "#7C4DFF", hp: [25, 35], atk: [5, 8], def: [0, 1], lootType: "gold", speed: 8 },
        { name: "Вампир", char: getChar('ENEMY_VAMPIRE'), color: "#C62828", hp: [50, 70], atk: [7, 10], def: [2, 4], lootType: "weapon", speed: 8 },

        // === УРОВЕНЬ 10+ ===
        { name: "Тролль", char: getChar('ENEMY_TROLL'), color: "#4CAF50", hp: [70, 100], atk: [8, 12], def: [2, 3], lootType: "gold", speed: 9 },
        { name: "Лич", char: getChar('ENEMY_LICH'), color: "#7B1FA2", hp: [60, 85], atk: [10, 15], def: [2, 3], lootType: "weapon", speed: 10 },
        { name: "Голем", char: getChar('ENEMY_GOLEM'), color: "#90A4AE", hp: [100, 150], atk: [10, 14], def: [6, 10], lootType: "gold", speed: 8 },
        { name: "Дракон", char: getChar('ENEMY_DRAGON'), color: "#FF5722", hp: [90, 130], atk: [12, 18], def: [4, 7], lootType: "weapon", speed: 10 }
    ];

    const ITEM_TYPES = [
        // === МЕЛЕЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_SWORD'), color: "#FFD700", baseName: "Меч", stat: "atk", val: [2, 5], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_AXE'), color: "#FFD700", baseName: "Топор", stat: "atk", val: [3, 7], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_MACE'), color: "#FFD700", baseName: "Булава", stat: "atk", val: [2, 6], gender: "she", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_DAGGER'), color: "#FF9800", baseName: "Кинжал", stat: "atk", val: [1, 3], gender: "he", plural: false, meleeType: true, range: 1 },
        { type: "weapon", char: getChar('ITEM_SPEAR'), color: "#FFD700", baseName: "Копьё", stat: "atk", val: [4, 8], gender: "it", plural: false, meleeType: true, range: 1 },
        
        // === ДИСТАНЦИОННОЕ ОРУЖИЕ ===
        { type: "weapon", char: getChar('ITEM_BOW'), color: "#FF9800", baseName: "Лук", stat: "atk", val: [3, 6], gender: "he", plural: false, meleeType: false, range: 15, maxAmmo: 20 },
        { type: "weapon", char: getChar('ITEM_CROSSBOW'), color: "#FF9800", baseName: "Арбалет", stat: "atk", val: [5, 9], gender: "he", plural: false, meleeType: false, range: 10, maxAmmo: 15 },
        { type: "weapon", char: getChar('ITEM_STAFF'), color: "#B39DDB", baseName: "Посох огня", stat: "atk", val: [2, 4], gender: "he", plural: false, meleeType: false, range: 16, maxAmmo: 50 },
        
        // === БРОНЯ ===
        { type: "armor", char: getChar('ITEM_ARMOR_LEATHER'), color: "#9E9E9E", baseName: "Кожаная броня", stat: "def", val: [1, 3], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_ARMOR_CHAIN'), color: "#9E9E9E", baseName: "Кольчуга", stat: "def", val: [3, 6], gender: "she", plural: false },
        { type: "armor", char: getChar('ITEM_SHIELD'), color: "#795548", baseName: "Щит", stat: "def", val: [2, 4], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GREAVES'), color: "#4CAF50", baseName: "Наголенники", stat: "def", val: [1, 3], gender: "he", plural: true },
        { type: "armor", char: getChar('ITEM_CLOAK'), color: "#8D6E63", baseName: "Плащ теней", stat: "def", val: [2, 3], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_HELMET'), color: "#607D8B", baseName: "Шлем", stat: "def", val: [1, 2], gender: "he", plural: false },
        { type: "armor", char: getChar('ITEM_GLOVES'), color: "#8D6E63", baseName: "Перчатки", stat: "def", val: [1, 2], gender: "she", plural: true },
    

        // === КНИГИ (ЛОР) ===
        { 
            type: "book", 
            char: getChar('ITEM_BOOK'), 
            color: "#A67C52", 
            baseName: "Старая книга", 
            gender: "she", 
            plural: false,
            val: [0, 0] 
        },

        // === СВИТОК ТЕЛЕПОРТАЦИИ ===
        { 
            type: "scroll_teleport", 
            char: getChar('ITEM_SCROLL'), 
            color: "#E0FFFF", 
            baseName: "Свиток телепортации", 
            effect: "teleport_exit", 
            val: [0, 0], 
            gender: "he", 
            plural: false 
        },

        // === ЗОЛОТО ===
        { type: "gold", char: getChar('ITEM_GOLD'), color: "#FFD700", baseName: "Монеты", val: [5, 15] },
        
        // === ЗЕЛЬЯ И ЕДА ===
        { 
            type: "potion_hp", 
            char: getChar('ITEM_POTION_HP'), 
            color: "#f44336", 
            baseName: "Зелье лечения", 
            effect: "heal", 
            val: [10, 20],
            gender: "it",   // Оно (зелье)
            plural: false
        },
        { 
            type: "potion_hp", 
            char: getChar('ITEM_ELIXIR'), 
            color: "#f44336", 
            baseName: "Эликсир жизни", 
            effect: "heal", 
            val: [25, 40],
            gender: "he",   // Он (эликсир)
            plural: false
        },
        { 
            type: "food", 
            char: getChar('ITEM_FOOD_BREAD'), 
            color: "#8BC34A", 
            baseName: "Хлеб и сыр", 
            effect: "heal", 
            val: [5, 10],
            gender: "he",   // Он (хлеб)
            plural: false
        },
        { 
            type: "food", 
            char: getChar('ITEM_FOOD_MEAT'), 
            color: "#8BC34A", 
            baseName: "Жареная крыса", 
            effect: "heal", 
            val: [8, 12],
            gender: "she",  // Она (крыса)
            plural: false
        },

        // === СИЛОВЫЕ ЗЕЛЬЯ ===
        { 
            type: "potion_str", 
            char: getChar('ITEM_POTION_STR'), 
            color: "#ff9800", 
            baseName: "Зелье силы", 
            effect: "buff_atk", 
            val: [1, 2],
            duration: 100, 
            gender: "it",   // Оно (зелье)
            plural: false
        },
        { 
            type: "potion_str", 
            char: getChar('ITEM_BERSERK'), 
            color: "#ff9800", 
            baseName: "Настой берсерка", 
            effect: "buff_atk", 
            val: [3, 5],
            duration: 100, 
            gender: "he",   // Он (настой)
            plural: false
        },
        
        // === ЗЕЛЬЕ ЗАЩИТЫ ===
        { 
            type: "potion_def", 
            char: '!', 
            color: "#00bcd4", 
            baseName: "Зелье защиты", 
            effect: "buff_def", 
            val: [2, 4],
            duration: 100,
            gender: "it",   // Оно (зелье)
            plural: false
        },

        // === ЗЕЛЬЕ ВЫНОСЛИВОСТИ ===
        { 
            type: "potion_stamina", 
            char: getChar('ITEM_POTION_HP'), 
            color: "#4CAF50",                
            baseName: "Зелье отдыха", 
            effect: "restore_stamina",       
            val: [100, 100],                 
            gender: "it",   // Оно (зелье)
            plural: false
        },
        
    ];
// В data.js, после ADJECTIVE_TIERS и ITEM_TYPES

    const UNIQUE_ITEM_TEMPLATES = [
        {
            id: "unique_armor_dark_lord",
            baseType: "armor",
            baseName: "Броня Повелителя Тьмы",
            uniquePrefix: "Сверхредкая Ультрадревняя",
            def: [15, 20], // Значительно выше обычных значений
            color: "#9b59b6", // Фиолетовый (эпический)
            desc: "Излучает холодную ауру власти."
        },
        {
            id: "unique_weapon_excalibur",
            baseType: "weapon",
            baseName: "Святой Меч",
            uniquePrefix: "Благословенный Светом",
            atk: [18, 25],
            color: "#f1c40f", // Золотой
            desc: "Клинок, рассекающий тьму."
        },
        {
            id: "unique_item_ring_power",
            baseType: "armor", // Кольца часто идут как броня/аксессуар
            baseName: "Кольцо Всевластия",
            uniquePrefix: "Проклятое",
            def: [2, 2],
            color: "#e74c3c", // Красный
            desc: "Дает силу, но требует жертв."
        },
        {
            id: "unique_scroll_teleport_ancient",
            baseType: "scroll_teleport",
            baseName: "Свиток Возврата",
            uniquePrefix: "Изначальный",
            color: "#00ffff", // Циан
            desc: "Пахнет озоном и древней магией."
        }
    ];

    // Не забудьте добавить UNIQUE_ITEM_TEMPLATES в return модуля DataModule:
    // return { ADJECTIVE_TIERS, ENEMY_TYPES, ITEM_TYPES, UNIQUE_ITEM_TEMPLATES, MAP_WIDTH, MAP_HEIGHT };

    
    const MAP_WIDTH = 100;
    const MAP_HEIGHT = 100;

    return {
        ADJECTIVE_TIERS, // <--- ВАЖНО: Экспортируем новый объект
        ENEMY_TYPES,
        ITEM_TYPES,
        UNIQUE_ITEM_TEMPLATES,
        MAP_WIDTH,
        MAP_HEIGHT
    };
})();
