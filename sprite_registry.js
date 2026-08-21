/**
 * ЕДИНЫЙ РЕЕСТР СПРАЙТОВ И СИМВОЛОВ (sprite_registry.js)
 * Подключать ПЕРВЫМ среди пользовательских скриптов.
 */

const SPRITE_REGISTRY = {
    // === 1. ГЛОБАЛЬНАЯ КАРТА (уникальные символы) ===
    'TILE_PLAIN':            { char: '░',   tile: { file: 'terrain_sprites', x: 10, y: 2 }, desc: 'Равнина' }, 
    'TILE_FOREST':           { char: 'T',   tile: { file: 'terrain_sprites', x: 8, y: 2 }, desc: 'Лес' },
    'TILE_MOUNTAIN':         { char: '^',   tile: { file: 'terrain_sprites', x: 5, y: 2 }, desc: 'Горы' },
    'TILE_WATER':            { char: '≈',   tile: { file: 'terrain_sprites', x: 7, y: 2 }, desc: 'Вода' },
    'TILE_CITY':             { char: 'C',   tile: { file: 'terrain_sprites', x: 9, y: 2 }, desc: 'Город' },
    'TILE_DUNGEON_ENTRANCE': { char: 'D',   tile: { file: 'terrain_sprites', x: 6, y: 0 }, desc: 'Вход' },
    'TILE_ROAD':             { char: '─',   tile: { file: 'terrain_sprites', x: 1, y: 2 }, desc: 'Дорога' }, 
    
    // === НОВОЕ: КРЕПОСТЬ ===
    'TILE_FORTRESS':         { char: 'f',   tile: { file: 'terrain_sprites', x: 9, y: 2 }, desc: 'Крепость' }, // <--- ЗАПЯТАЯ ЗДЕСЬ ОБЯЗАТЕЛЬНА

    // === 2. ПОДЗЕМЕЛЬЕ (стандартные символы, без изменений) ===
    'FLOOR_DEFAULT':         { char: '.',   tile: { file: 'terrain_sprites', x: 0, y: 0 }, desc: 'Пол' },
    'WALL_DEFAULT':          { char: '#',   tile: { file: 'terrain_sprites', x: 12, y: 2 }, desc: 'Стена' },
    'FLOOR_ORGANIC':         { char: 'o',   tile: { file: 'terrain_sprites', x: 3, y: 2 }, desc: 'Орг. пол' },
    'WALL_ORGANIC':          { char: 'O',   tile: { file: 'terrain_sprites', x: 4, y: 2 }, desc: 'Орг. стена' },
    'FLOOR_CITY':            { char: '·',   tile: { file: 'terrain_sprites', x: 0, y: 0 }, desc: 'Пол города' },
    'WALL_CITY':             { char: '█',   tile: { file: 'terrain_sprites', x: 11, y: 2 }, desc: 'Стена города' },
    'STAIRS_UP':             { char: '>',  tile: { file: 'terrain_sprites', x: 3, y: 0 }, desc: 'Лестница ↑' },
    'STAIRS_DOWN':           { char: '<',  tile: { file: 'terrain_sprites', x: 2, y: 0 }, desc: 'Лестница ↓' },
    // В файле sprite_registry.js, внутри объекта SPRITE_REGISTRY

    // ... существующие записи ...

    // === ЛОВУШКИ ===
    'TRAP_SPIKES': { 
        char: '9', // Символ-заглушка, рендерер использует tile
        tile: { file: 'terrain_sprites', x: 26, y: 1 }, 
        desc: 'Ловушка' 
    },    
  

    // ==========================================
    // 3. СУЩНОСТИ (Игрок и NPC)
    // ==========================================
    'PLAYER':                { char: '@',   tile: { file: 'creature_sprites', x: 2, y: 0 }, desc: 'Игрок' },
    'NPC':                   { char: '☺',   tile: { file: 'creature_sprites', x: 8, y: 3 }, desc: 'NPC' },

    'PLAYER_GLOBAL_SMALL': { char: 'p', tile: { file: 'creature_sprites', x: 12, y: 1 }, desc: 'Игрок (маленький)' },
    
    // Отряд (например, тайл 4,0)
    'PLAYER_GLOBAL_SQUAD': { char: 'S', tile: { file: 'creature_sprites', x: 13, y: 1 }, desc: 'Отряд' },    

    // ==========================================
    // 4. ВРАГИ (ENEMY_TYPES)
    // ==========================================
    
    // === ОБЩИЕ МОНСТРЫ ===
    'ENEMY_RAT':             { char: 'r',   tile: { file: 'creature_sprites', x: 8, y: 9 }, desc: 'Крыса' },
    'ENEMY_GOBLIN':          { char: 'g',   tile: { file: 'creature_sprites', x: 12, y: 3 }, desc: 'Гоблин' },
    'ENEMY_WOLF':            { char: 'w',   tile: { file: 'creature_sprites', x: 1, y: 9 }, desc: 'Волк' },
    'ENEMY_BANDIT':          { char: 'b',   tile: { file: 'creature_sprites', x: 7, y: 0 }, desc: 'Бандит' },
    'ENEMY_SKELETON':        { char: 's',   tile: { file: 'creature_sprites', x: 4, y: 3 }, desc: 'Скелет' },
    'ENEMY_SLIME':           { char: 'j',   tile: { file: 'creature_sprites', x: 3, y: 15 }, desc: 'Слизень' },
    'ENEMY_ORC':             { char: 'k',   tile: { file: 'creature_sprites', x: 14, y: 3 }, desc: 'Орк' },
    'ENEMY_ZOMBIE':          { char: 'z',   tile: { file: 'creature_sprites', x: 1, y: 6 }, desc: 'Зомби' },
    'ENEMY_HARPY':           { char: 'h',   tile: { file: 'creature_sprites', x: 15, y: 6 }, desc: 'Гарпия' },
    'ENEMY_GHOST':           { char: 'G',   tile: { file: 'creature_sprites', x: 4, y: 6 }, desc: 'Призрак' },
    'ENEMY_VAMPIRE':         { char: 'V',   tile: { file: 'creature_sprites', x: 6, y: 7 }, desc: 'Вампир' },
    'ENEMY_TROLL':           { char: 't',   tile: { file: 'creature_sprites', x: 1, y: 4 }, desc: 'Тролль' },
    'ENEMY_LICH':            { char: 'L',   tile: { file: 'creature_sprites', x: 5, y: 7 }, desc: 'Лич' },
    'ENEMY_GOLEM':           { char: 'M',   tile: { file: 'creature_sprites', x: 3, y: 4 }, desc: 'Голем' },
    'ENEMY_DRAGON':          { char: 'q',   tile: { file: 'creature_sprites', x: 0, y: 15 }, desc: 'Дракон' },

    // === ❄️ ICY (Ледяные пещеры) ===
    // TODO: Замените координаты на реальные спрайты льда/холода
    'ENEMY_SPIDER':          { char: '1',   tile: { file: 'creature_sprites', x: 7, y: 9 }, desc: 'Ледяной паук' },
    'ENEMY_YETI':            { char: 'Y',   tile: { file: 'creature_sprites', x: 10, y: 10 }, desc: 'Снежный Йети' },
    'ENEMY_ICE_ELEM':        { char: 'i',   tile: { file: 'creature_sprites', x: 11, y: 10 }, desc: 'Ледяной Элементаль' },
    'ENEMY_WYVERN':          { char: 'W',   tile: { file: 'creature_sprites', x: 12, y: 10 }, desc: 'Морозный Виверн' },

    // === 🕸️ CAVE (Обычные пещеры) ===
    // TODO: Замените координаты на спрайты насекомых/животных
    'ENEMY_CENTIPEDE':       { char: 'с',   tile: { file: 'creature_sprites', x: 10, y: 11 }, desc: 'Гигантская Сороконожка' },
    'ENEMY_CRAB':            { char: 'С',   tile: { file: 'creature_sprites', x: 11, y: 11 }, desc: 'Каменный Краб' },
    'ENEMY_BEAR':            { char: 'М',   tile: { file: 'creature_sprites', x: 12, y: 11 }, desc: 'Пещерный Медведь' },
    'ENEMY_SPIDER_QUEEN':    { char: 'Q',   tile: { file: 'creature_sprites', x: 13, y: 11 }, desc: 'Королева Пауков' },

    // === 🌫️ ROGUE (Руины/Заброшенные места) ===
    // TODO: Замените координаты на спрайты людей в доспехах/теней
    'ENEMY_BANDIT_ARCHER':   { char: 'а',   tile: { file: 'creature_sprites', x: 10, y: 12 }, desc: 'Разбойник с Арбалетом' },
    'ENEMY_CURSED_KNIGHT':   { char: 'к',   tile: { file: 'creature_sprites', x: 11, y: 12 }, desc: 'Проклятый Рыцарь' },
    'ENEMY_ASSASSIN':        { char: 'А',   tile: { file: 'creature_sprites', x: 12, y: 12 }, desc: 'Теневой Убийца' },
    'ENEMY_ANCIENT_GUARD':   { char: 'Д',   tile: { file: 'creature_sprites', x: 13, y: 12 }, desc: 'Древний Страж' },

    // === 🧿 CELLULAR (Органические/Живые пещеры) ===
    // TODO: Замените координаты на спрайты слизи/грибов/мутантов
    'ENEMY_MOLD':            { char: 'м',   tile: { file: 'creature_sprites', x: 10, y: 13 }, desc: 'Живая Плесень' },
    'ENEMY_WORM':            { char: 'ч',   tile: { file: 'creature_sprites', x: 11, y: 13 }, desc: 'Кислотный Червь' },
    'ENEMY_MUTANT_SHROOM':   { char: 'Ф',   tile: { file: 'creature_sprites', x: 12, y: 13 }, desc: 'Мутировавший Гриб' },
    'ENEMY_FLESH_EATER':     { char: 'П',   tile: { file: 'creature_sprites', x: 13, y: 13 }, desc: 'Пожиратель Плоти' },

    // === 🦴 ARENA (Арены/Гладиаторские залы) ===
    // TODO: Замените координаты на спрайты гладиаторов/зверей
    'ENEMY_GLADIATOR':       { char: 'г',   tile: { file: 'creature_sprites', x: 10, y: 14 }, desc: 'Раб-Гладиатор' },
    'ENEMY_BOAR':            { char: 'К',   tile: { file: 'creature_sprites', x: 11, y: 14 }, desc: 'Боевой Кабан' },
    'ENEMY_CHAMPION':        { char: 'х',   tile: { file: 'creature_sprites', x: 12, y: 14 }, desc: 'Чемпион Арены' },
    'ENEMY_CERBERUS':        { char: 'Ц',   tile: { file: 'creature_sprites', x: 13, y: 14 }, desc: 'Цербер' },

    // === 👑 BOSS (Логова боссов) ===
    // TODO: Замените координаты на спрайты магов/демонов
    'ENEMY_CULTIST':         { char: 'У',   tile: { file: 'creature_sprites', x: 10, y: 15 }, desc: 'Культист Тьмы' },
    'ENEMY_FALLEN_PALADIN':  { char: 'О',   tile: { file: 'creature_sprites', x: 11, y: 15 }, desc: 'Оскверненный Паладин' },
    'ENEMY_DEMON':           { char: 'Х',   tile: { file: 'creature_sprites', x: 12, y: 15 }, desc: 'Демон-Хранитель' },
    'ENEMY_AVATAR':          { char: 'В',   tile: { file: 'creature_sprites', x: 13, y: 15 }, desc: 'Аватар Хаоса' },

    // ==========================================
    // 5. ПРЕДМЕТЫ (ITEM_TYPES)
    // ==========================================
    
    // Оружие ближнего боя
    'ITEM_SWORD':            { char: '/',   tile: { file: 'item_sprites', x: 0, y: 0 }, desc: 'Меч' },
    'ITEM_AXE':              { char: 'P',   tile: { file: 'item_sprites', x: 5, y: 1 }, desc: 'Топор' }, // Совпадает с TILE_MOUNTAIN
    'ITEM_MACE':             { char: ')',   tile: { file: 'item_sprites', x: 8, y: 1 }, desc: 'Булава' },
    'ITEM_DAGGER':           { char: '*',   tile: { file: 'item_sprites', x: 0, y: 1 }, desc: 'Кинжал' }, // Совпадает с ITEM_BERSERK
    'ITEM_SPEAR':            { char: 'Y',   tile: { file: 'item_sprites', x: 7, y: 1 }, desc: 'Копье' },

    // Оружие дальнего боя
    'ITEM_BOW':              { char: '(',   tile: { file: 'item_sprites', x: 9, y: 0 }, desc: 'Лук' },
    'ITEM_CROSSBOW':         { char: '=',   tile: { file: 'item_sprites', x: 9, y: 1 }, desc: 'Арбалет' },
    'ITEM_STAFF':            { char: '|',   tile: { file: 'item_sprites', x: 2, y: 3 }, desc: 'Посох' },
    

    // Броня
    'ITEM_ARMOR_LEATHER':    { char: ']',   tile: { file: 'item_sprites', x: 0, y: 2 }, desc: 'Кожаная броня' },
    'ITEM_ARMOR_CHAIN':      { char: '[',   tile: { file: 'item_sprites', x: 1, y: 2 }, desc: 'Кольчуга' },
    'ITEM_SHIELD':           { char: '}',   tile: { file: 'item_sprites', x: 8, y: 2 }, desc: 'Щит' },
    'ITEM_GREAVES':          { char: '"',   tile: { file: 'item_sprites', x: 3, y: 2 }, desc: 'Наголенники' }, // Совпадает с FLOOR_ORGANIC
    'ITEM_CLOAK':            { char: '{',   tile: { file: 'item_sprites', x: 12, y: 3 }, desc: 'Плащ' },
    'ITEM_HELMET':           { char: 'H',   tile: { file: 'item_sprites', x: 5, y: 2 }, desc: 'Шлем' },
    'ITEM_GLOVES':           { char: 'v',   tile: { file: 'item_sprites', x: 10, y: 2 }, desc: 'Перчатки' }, // Совпадает с ENEMY_GHOST

    // Ресурсы и прочее
    'ITEM_GOLD':             { char: '$',   tile: { file: 'item_sprites', x: 13, y: 3 }, desc: 'Золото' },
    'ITEM_BOOK':             { char: '?',   tile: { file: 'item_sprites', x: 3, y: 4 }, desc: 'Книга' },
    'ITEM_SCROLL':          { char: '&',   tile: { file: 'item_sprites', x: 0, y: 4 }, desc: 'Свиток' },
    'ITEM_BED':            { char: '8',   tile: { file: 'terrain_sprites', x: 18, y: 0 }, desc: 'Кровать' }, // Если x:19 нет в вашем PNG, поменяйте на любую свободную клетку
    // === СНАРЯД (для анимации выстрелов) ===
    'ITEM_PROJECTILE': { char: '§', tile: { file: 'terrain_sprites', x: 1, y: 0 }, desc: 'Снаряд' },

    // === БОССЫ (2x2 спрайта) ===
    // Древний Дракон (начинается с x:0, y:18)
    'BOSS_DRAGON_TL': { char: 'B', tile: { file: 'creature_sprites', x: 0, y: 18 }, desc: 'Дракон (TL)' },
    'BOSS_DRAGON_TR': { char: 'B', tile: { file: 'creature_sprites', x: 1, y: 18 }, desc: 'Дракон (TR)' },
    'BOSS_DRAGON_BL': { char: 'B', tile: { file: 'creature_sprites', x: 0, y: 19 }, desc: 'Дракон (BL)' },
    'BOSS_DRAGON_BR': { char: 'B', tile: { file: 'creature_sprites', x: 1, y: 19 }, desc: 'Дракон (BR)' },
    
    // Каменный Голем (например, начинается с x:2, y:18)
    'BOSS_GOLEM_TL': { char: 'B', tile: { file: 'creature_sprites', x: 2, y: 18 }, desc: 'Голем (TL)' },
    'BOSS_GOLEM_TR': { char: 'B', tile: { file: 'creature_sprites', x: 3, y: 18 }, desc: 'Голем (TR)' },
    'BOSS_GOLEM_BL': { char: 'B', tile: { file: 'creature_sprites', x: 2, y: 19 }, desc: 'Голем (BL)' },
    'BOSS_GOLEM_BR': { char: 'B', tile: { file: 'creature_sprites', x: 3, y: 19 }, desc: 'Голем (BR)' },

    // Король Личей (например, начинается с x:4, y:18)
    'BOSS_LICH_TL': { char: 'B', tile: { file: 'creature_sprites', x: 4, y: 18 }, desc: 'Лич (TL)' },
    'BOSS_LICH_TR': { char: 'B', tile: { file: 'creature_sprites', x: 5, y: 18 }, desc: 'Лич (TR)' },
    'BOSS_LICH_BL': { char: 'B', tile: { file: 'creature_sprites', x: 4, y: 19 }, desc: 'Лич (BL)' },
    'BOSS_LICH_BR': { char: 'B', tile: { file: 'creature_sprites', x: 5, y: 19 }, desc: 'Лич (BR)' },

    // (Для остальных рас можно добавить аналогичные блоки или использовать дефолтные)
    
    // Зелья и еда
    'ITEM_POTION_HP':        { char: '!',   tile: { file: 'item_sprites', x: 1, y: 4 }, desc: 'Зелье лечения' }, // Совпадает с ITEM_POTION_STR
    'ITEM_ELIXIR':           { char: '+',   tile: { file: 'item_sprites', x: 16, y: 4 }, desc: 'Эликсир' },
    'ITEM_FOOD_BREAD':       { char: '%',   tile: { file: 'item_sprites', x: 6, y: 3 }, desc: 'Еда' },
    'ITEM_FOOD_MEAT':        { char: '~',   tile: { file: 'item_sprites', x: 7, y: 3 }, desc: 'Мясо' },
    'ITEM_POTION_STR':       { char: '!',   tile: { file: 'item_sprites', x: 1, y: 4 }, desc: 'Зелье силы' },
    'ITEM_BERSERK':          { char: '*',   tile: { file: 'item_sprites', x: 1, y: 4 }, desc: 'Настой берсерка' },
    // В sprite_registry.js добавьте в конец объекта SPRITE_REGISTRY:

    // === АРМИИ НА ГЛОБАЛЬНОЙ КАРТЕ ===
    'ARMY_ENEMY': { 
        char: 'A',   
        tile: { file: 'creature_sprites', x: 13, y: 1 }, // УКАЖИТЕ РЕАЛЬНЫЕ КООРДИНАТЫ СПРАЙТА АРМИИ
        desc: 'Вражеская армия' 
    }
};

/**
 * Получает символ (char) по ID из реестра.
 * Используется в data.js, dungeon_generator.js и map.js.
 */
function getChar(id) {
    return SPRITE_REGISTRY[id] ? SPRITE_REGISTRY[id].char : '?';
}

/**
 * Получает данные тайлсета (file, x, y) по ID.
 * Используется в спрайтовом рендерере.
 */
function getTileData(id) {
    return SPRITE_REGISTRY[id] ? SPRITE_REGISTRY[id].tile : null;
}
