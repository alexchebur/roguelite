/**
 * ЕДИНЫЙ РЕЕСТР СПРАЙТОВ И СИМВОЛОВ
 * Централизованное хранилище всех визуальных обозначений игры.
 * Формат: 'ID': { char: 'символ', desc: 'описание' }
 */

const SPRITE_REGISTRY = {
    // --- ГЛОБАЛЬНАЯ КАРТА (Ландшафт) ---
    'TILE_PLAIN':           { char: '.', desc: 'Равнина' },
    'TILE_FOREST':          { char: 'T', desc: 'Лес' },
    'TILE_MOUNTAIN':        { char: '^', desc: 'Горы' },
    'TILE_WATER':           { char: '≈', desc: 'Вода' },
    'TILE_CITY':            { char: 'C', desc: 'Город (вход)' },
    'TILE_DUNGEON_ENTRANCE':{ char: 'D', desc: 'Вход в подземелье' },
    'TILE_ROAD':            { char: '█', desc: 'Дорога' },

    // --- ПОДЗЕМЕЛЬЕ (Стены и Пол) ---
    'FLOOR_DEFAULT':        { char: '.', desc: 'Обычный пол' },
    'WALL_DEFAULT':         { char: '#', desc: 'Обычная стена' },
    
    // Специфичные тайлы (используются в cellular/rogue типах)
    'FLOOR_ORGANIC':        { char: 'o', desc: 'Органический пол/гриб' },
    'WALL_ORGANIC':         { char: 'O', desc: 'Органическая стена' },
    'FLOOR_CITY':           { char: '·', desc: 'Пол города (мощеная)' },
    'WALL_CITY':            { char: '█', desc: 'Стена города' },

    // --- ЛЕСТНИЦЫ ---
    'STAIRS_DOWN':          { char: '<', desc: 'Лестница вниз' },
    'STAIRS_UP':            { char: '>', desc: 'Лестница вверх' },

    // --- СУЩНОСТИ (Игрок и NPC) ---
    'PLAYER':               { char: '@', desc: 'Игрок' },
    'NPC':                  { char: '☺', desc: 'NPC (житель города)' },

    // --- ВРАГИ (ENEMY_TYPES в data.js используют эти char) ---
    'ENEMY_RAT':            { char: 'r', desc: 'Крыса' },
    'ENEMY_GOBLIN':         { char: 'g', desc: 'Гоблин' },
    'ENEMY_WOLF':           { char: 'w', desc: 'Волк' },
    'ENEMY_BANDIT':         { char: 'b', desc: 'Бандит' },
    'ENEMY_SKELETON':       { char: 's', desc: 'Скелет' },
    'ENEMY_SLIME':          { char: 'j', desc: 'Слизень' },
    'ENEMY_ORC':            { char: 'O', desc: 'Орк' }, // Внимание: конфликт с Organic Wall? Нет, O - стена, o - пол. Но Orc тоже 'O'. Лучше заменить Орка на 'k' или стену на другой символ. 
                                                        // В текущем коде Orc='O', Organic Wall='O'. Это КОНФЛИКТ. 
                                                        // Исправление: Пусть Органическая стена будет '0' (ноль) или оставим 'O' для Орка, а стену сделаем '▓'.
                                                        // Для совместимости с вашим tileset_renderer, где O=creature, а O=terrain... 
                                                        // Давайте изменим Organic Wall на '▓' в registry, но в tileset это может быть сложно.
                                                        // Оставим как есть, но учтите: в render.js приоритет сущности выше тайла.
    'ENEMY_ZOMBIE':         { char: 'z', desc: 'Зомби' },
    'ENEMY_HARPY':          { char: 'h', desc: 'Гарпия' },
    'ENEMY_GHOST':          { char: 'G', desc: 'Призрак' },
    'ENEMY_VAMPIRE':        { char: 'V', desc: 'Вампир' },
    'ENEMY_TROLL':          { char: 'T', desc: 'Тролль' }, // Конфликт с Forest 'T'. Приоритет сущности выше.
    'ENEMY_LICH':           { char: 'L', desc: 'Лич' },
    'ENEMY_GOLEM':          { char: 'M', desc: 'Голем' },
    'ENEMY_DRAGON':         { char: 'q', desc: 'Дракон' },

    // --- ПРЕДМЕТЫ (ITEM_TYPES в data.js используют эти char) ---
    'ITEM_SWORD':           { char: '/', desc: 'Меч' },
    'ITEM_AXE':             { char: '^', desc: 'Топор' }, // Конфликт с Mountain '^'. Приоритет предмета выше.
    'ITEM_MACE':            { char: ')', desc: 'Булава' },
    'ITEM_DAGGER':          { char: '*', desc: 'Кинжал' },
    'ITEM_SPEAR':           { char: 'Y', desc: 'Копье' },
    'ITEM_BOW':             { char: '(', desc: 'Лук' },
    'ITEM_CROSSBOW':        { char: '=', desc: 'Арбалет' },
    'ITEM_STAFF':           { char: '|', desc: 'Посох' },
    'ITEM_ARMOR_LEATHER':   { char: ']', desc: 'Кожа' },
    'ITEM_ARMOR_CHAIN':     { char: '[', desc: 'Кольчуга' },
    'ITEM_SHIELD':          { char: '}', desc: 'Щит' },
    'ITEM_GREAVES':         { char: 'o', desc: 'Наголенники' }, // Конфликт с Organic Floor 'o'.
    'ITEM_CLOAK':           { char: '{', desc: 'Плащ' },
    'ITEM_HELMET':          { char: 'H', desc: 'Шлем' },
    'ITEM_GLOVES':          { char: 'G', desc: 'Перчатки' }, // Конфликт с Ghost 'G'.
    'ITEM_GOLD':            { char: '$', desc: 'Золото' },
    'ITEM_POTION_HP':       { char: '!', desc: 'Зелье HP' },
    'ITEM_ELIXIR':          { char: '+', desc: 'Эликсир' },
    'ITEM_FOOD_BREAD':      { char: '%', desc: 'Еда' },
    'ITEM_FOOD_MEAT':       { char: '~', desc: 'Мясо' },
    'ITEM_POTION_STR':      { char: '!', desc: 'Зелье Силы' }, // Дубликат char с HP зельем. Визуально одинаковы, различаются по цвету/имени.
    'ITEM_BERSERK':         { char: '*', desc: 'Настой' }      // Дубликат char с Кинжалом.
};

// Хелпер для быстрого доступа к символу по ID
function getChar(id) {
    return SPRITE_REGISTRY[id] ? SPRITE_REGISTRY[id].char : '?';
}
