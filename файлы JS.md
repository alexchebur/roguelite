# Собранные файлы с кодом 
 
### combat.js 
 
```js 
 
// =========================== Модуль боя и использования предметов ===========================
const CombatModule = (function() {
    
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ПРОВЕРКА ЛИНИИ ВИДИМОСТИ (LOS) ===
    // Проверяет, есть ли прямая видимость между (x1,y1) и (x2,y2) без стен
    function hasLineOfSight(x1, y1, x2, y2) {
        // Если точка совпадает с целью - видим
        if (x1 === x2 && y1 === y2) return true;

        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = (x1 < x2) ? 1 : -1;
        const sy = (y1 < y2) ? 1 : -1;
        let err = dx - dy;

        let cx = x1;
        let cy = y1;

        while (true) {
            // Если дошли до цели - путь чист
            if (cx === x2 && cy === y2) return true;

            // Если наткнулись на стену - путь заблокирован
            if (MapModule.isWall(cx, cy)) return false;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }
            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
    }

    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ АНИМАЦИИ УДАРА ===
    function triggerHitAnimation() {
        let frames = 0;
        const maxFrames = 5; 
        
        const interval = setInterval(() => {
            frames++;
            RenderModule.requestRedraw(); 
            
            if (frames >= maxFrames) {
                clearInterval(interval);
                RenderModule.requestRedraw(); 
            }
        }, 40); 
    }

    // === АТАКА БЛИЖНЕГО БОЯ ===
    function attack(attacker, defender, logFn) { 
        let dmg = Math.max(1, attacker.atk - defender.def);
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        defender.hp -= dmg;
        
        defender.flashEndTime = Date.now() + 200; 
        defender.flashChar = "*"; 
        
        triggerHitAnimation();

        const attackerName = attacker.name || "Вы";
        const defenderName = defender.name || "враг";
        const verb = attackerName === "Вы" ? "бьете" : "бьет";
        
        logFn(`${attackerName} ${verb} ${defenderName} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (defender.hp <= 0) {
            logFn(`${defenderName} погибает!`, "info");
            return true;
        }
        return false;
    }

    // === ДИСТАНЦИОННАЯ АТАКА (ОБНОВЛЕННАЯ С УЧЕТОМ БОНУСОВ) ===
    function rangedAttack(player, target, weapon, logFn, updateUiFn) {
        // 1. Проверка наличия оружия и типа
        if (!weapon || weapon.meleeType !== false) return false;
        
        // 2. Проверка боеприпасов
        if (weapon.currentAmmo <= 0) {
            logFn(`Нет боеприпасов для ${weapon.name}!`, "combat");
            return false;
        }

        // 3. Расчет дистанции
        const dist = Math.abs(player.x - target.x) + Math.abs(player.y - target.y);

        // 4. ЛОГИКА "В УПОР" (Требование 1)
        // Если враг вплотную (дистанция 1), стрелять нельзя/неэффективно. 
        // Игрок атакует базовой силой (как кулаками или рукояткой), бонус оружия не применяется.
        if (dist === 1) {
            logFn(`${target.name} слишком близко! Вы бьете прикладом.`, "combat");
            
            // Временно убираем бонус текущего оружия из bonusAtk
            const savedBonus = player.bonusAtk;
            if (player.equipment.weapon === weapon) {
                player.bonusAtk -= weapon.val;
            }
            
            // Пересчитываем итоговую атаку
            const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
            player.atk = baseAtk + player.bonusAtk;
            if (player.atk < 1) player.atk = 1;

            // Атакуем
            const killed = attack(player, target, logFn);
            
            // Возвращаем бонус на место
            if (player.equipment.weapon === weapon) {
                player.bonusAtk = savedBonus;
            }
            // Снова пересчитываем итоговую атаку
            player.atk = baseAtk + player.bonusAtk;
            if (player.atk < 1) player.atk = 1;
            
            if (updateUiFn) updateUiFn();
            return killed;
        }

        // 5. Проверка максимальной дальности
        if (dist > weapon.range) {
            logFn(`${target.name} слишком далеко для ${weapon.name} (макс. ${weapon.range})!`, "combat");
            return false;
        }

        // 6. Проверка препятствий
        if (!hasLineOfSight(player.x, player.y, target.x, target.y)) {
            logFn(`Препятствие мешает выстрелу в ${target.name}!`, "combat");
            return false;
        }

        // --- ЕСЛИ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: СТРЕЛЬБА ---
        
        weapon.currentAmmo--;
        
        // Расчет урона: База игрока + Бонусы (включая оружие) - Защита врага
        // player.atk уже содержит все бонусы, так как мы их поддерживаем актуальными
        let dmg = Math.max(1, player.atk - target.def); 
         
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        target.hp -= dmg;
        
        // Эффекты
        target.flashEndTime = Date.now() + 200;
        target.flashChar = "*";
        triggerHitAnimation();

        logFn(`Вы стреляете в ${target.name} из ${weapon.name} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (updateUiFn) updateUiFn();

        // 7. АГРО
        target.aggroOverride = 20; 

        if (target.hp <= 0) {
            logFn(`${target.name} погибает от выстрела!`, "info");
            return true;
        }
        return false;
    }

    // === ВЫПАДЕНИЕ ЛУТА ===
    function dropLoot(enemy, depth, itemsArray, logFn) {
        if (!enemy.lootType) return;

        // Шанс выпадения 40%
        if (Math.random() > 0.4) return;

        let droppedItem = null;
        
        // Инициализируем генератор
        const rng = new Math.seedrandom(`loot_${enemy.x}_${enemy.y}_${Date.now()}`);
        const choice = (array) => array[Math.floor(rng() * array.length)];

        if (enemy.lootType === 'gold') {
            const baseGold = 5 + Math.floor(depth * 2.5);
            const amount = Math.floor(baseGold * (0.8 + rng() * 0.4)); 
            
            droppedItem = {
                x: enemy.x, y: enemy.y,
                name: `${amount} золотых`,
                char: '$', color: '#FFD700',
                type: 'gold',
                val: amount,
                isItem: true
            };
        } 
        else if (enemy.lootType === 'food') {
            const foods = DataModule.ITEM_TYPES.filter(i => i.type === 'food');
            if (foods.length > 0) {
                const template = choice(foods);
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, 1.0);
            }
        } 
        else if (enemy.lootType === 'weapon') {
            const equips = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
            if (equips.length > 0) {
                const template = choice(equips);
                const powerMult = 1.0 + (depth * 0.15); 
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, powerMult);
            }
        }

        if (droppedItem) {
            itemsArray.push(droppedItem);
            logFn(`${enemy.name} оставил после себя: ${droppedItem.name}`, "loot");
        }
    }

    // === ИСПОЛЬЗОВАНИЕ ПРЕДМЕТА (ОБНОВЛЕННОЕ С УЧЕТОМ ВРЕМЕННЫХ ЭФФЕКТОВ) ===
    function useItem(player, index, logFn, updateUiFn) {
        const item = player.inventory[index];
        if (!item) return;

        let used = false;

        // 1. Лечение (мгновенное)
        if (item.effect === "heal") {
            player.hp = Math.min(player.maxHp, player.hp + item.val);
            logFn(`Вы использовали ${item.name}. HP +${item.val}.`, "loot");
            used = true;
        } 
        // === НОВОЕ: Восстановление выносливости ===
        else if (item.effect === "restore_stamina") {
            player.stamina = player.maxStamina;
            logFn(`Вы выпили ${item.name}. Выносливость восстановлена!`, "loot");
            used = true;
        }        
        // 2. Временный бафф Атаки
        else if (item.effect === "buff_atk") {
            if (item.duration && typeof EffectSystemModule !== 'undefined') {
                const effect = EffectSystemModule.Effects.createBuffAtk(item.duration, item.val);
                EffectSystemModule.addEffect(player, effect);
                EffectSystemModule.recalculateStats(player);
                logFn(`Вы выпили ${item.name}. Атака +${item.val} на ${item.duration} ходов!`, "loot");
            } else {
                // Фолбэк для старых зелий без duration
                player.bonusAtk += item.val;
                const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
                player.atk = baseAtk + player.bonusAtk;
                logFn(`Вы выпили ${item.name}. Сила +${item.val} (навсегда).`, "loot");
            }
            used = true;
        }

        // 3. Временный бафф Защиты
        else if (item.effect === "buff_def") {
            if (item.duration && typeof EffectSystemModule !== 'undefined') {
                const effect = EffectSystemModule.Effects.createBuffDef(item.duration, item.val);
                EffectSystemModule.addEffect(player, effect);
                EffectSystemModule.recalculateStats(player);
                logFn(`Вы выпили ${item.name}. Защита +${item.val} на ${item.duration} ходов!`, "loot");
            } else {
                 player.bonusDef += item.val;
                 const baseDef = WorldCurveModule.getPlayerBaseDef(player.level);
                 player.def = baseDef + player.bonusDef;
                 logFn(`Вы выпили ${item.name}. Защита +${item.val} (навсегда).`, "loot");
            }
            used = true;
        }

        // 4. Экипировка Оружия
        else if (item.type === "weapon") {
            if (player.equipment.weapon) {
                player.bonusAtk -= player.equipment.weapon.isUnique ? player.equipment.weapon.uniqueAtk : player.equipment.weapon.val;
                player.inventory.push(player.equipment.weapon); 
            }
            
            player.equipment.weapon = item;
            const atkBonus = item.isUnique ? item.uniqueAtk : item.val;
            player.bonusAtk += atkBonus;
            
            if (item.maxAmmo > 0 && item.currentAmmo === 0) {
                item.currentAmmo = item.maxAmmo;
            }
            
            if (typeof EffectSystemModule !== 'undefined') {
                EffectSystemModule.recalculateStats(player);
            } else {
                const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level); 
                player.atk = baseAtk + player.bonusAtk;
            }
            
            logFn(`Вы взяли в руки ${item.name}. Атака +${atkBonus}.`, "loot");
            used = true;
        } 
        
        // 5. Экипировка Брони
        else if (item.type === "armor") {
            if (player.equipment.armor) {
                player.bonusDef -= player.equipment.armor.isUnique ? player.equipment.armor.uniqueDef : player.equipment.armor.val;
                player.inventory.push(player.equipment.armor);
            }
            
            player.equipment.armor = item;
            const defBonus = item.isUnique ? item.uniqueDef : item.val;
            player.bonusDef += defBonus;
            
            if (typeof EffectSystemModule !== 'undefined') {
                EffectSystemModule.recalculateStats(player);
            } else {
                const baseDef = WorldCurveModule.getPlayerBaseDef(player.level);
                player.def = baseDef + player.bonusDef;
            }
             
            logFn(`Вы надели ${item.name}. Защита +${defBonus}.`, "loot");
            used = true;
        }
        
        // 6. Свиток телепортации
        else if (item.effect === "teleport_exit") {
            if (typeof GameModule !== 'undefined' && typeof GameModule.exitToGlobal === 'function') {
                logFn(`Вы разломали ${item.name} и вспышка света перенесла вас на поверхность!`, "event");
                used = true;
                GameModule.exitToGlobal();
            } else {
                logFn(`Здесь нельзя использовать свиток телепортации.`, "info");
            }
        }

        if (used) {
            player.inventory.splice(index, 1);
            updateUiFn();
        }
    }

    return {
        attack,
        rangedAttack,
        dropLoot,
        useItem
    };
})();
 
``` 
 
### data.js 
 
```js 
 
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
                { base: "Ржавый", she: "Ржавая", it: "Ржавое", plural: "Ржавые" },
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
                { base: "Выцветший", she: "Выцветшая", it: "Выцветшее", plural: "Выцветшие" }
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
        { name: "Слизень", char: getChar('ENEMY_SLIME'), color: "#00BCD4", hp: [20, 30], atk: [1, 2], def: [1, 2], lootType: "food", speed: 3 },
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
            gender: "it",
            plural: false
        },
        { 
            type: "potion_hp", 
            char: getChar('ITEM_ELIXIR'), 
            color: "#f44336", 
            baseName: "Эликсир жизни", 
            effect: "heal", 
            val: [25, 40],
            gender: "he",
            plural: false
        },
        { 
            type: "food", 
            char: getChar('ITEM_FOOD_BREAD'), 
            color: "#8BC34A", 
            baseName: "Хлеб и сыр", 
            effect: "heal", 
            val: [5, 10],
            gender: "he",
            plural: false
        },
        { 
            type: "food", 
            char: getChar('ITEM_FOOD_MEAT'), 
            color: "#8BC34A", 
            baseName: "Жареная крыса", 
            effect: "heal", 
            val: [8, 12],
            gender: "she",
            plural: false
        },
    // ... внутри ITEM_TYPES ...

        { 
            type:  "potion_str", 
            char: getChar('ITEM_POTION_STR'), 
            color:  "#ff9800 ", 
            baseName:  "Зелье силы ", 
            effect:  "buff_atk", 
            val: [1, 2],
            duration: 100, // <--- ДОБАВИТЬ: Длительность эффекта в ходах (например, 10 ходов)
            gender:  "it ",
            plural: false
        },
        { 
            type:  "potion_str", 
            char: getChar('ITEM_BERSERK'), 
            color:  "#ff9800 ", 
            baseName:  "Настой берсерка ", 
            effect:  "buff_atk", 
            val: [3, 5],
            duration: 100, // <--- ДОБАВИТЬ: Более сильный эффект, но короче (5 ходов)
            gender:  "he ",
            plural: false
        },
        
        // Если захотите добавить зелье защиты:
      
        { 
            type:  "potion_def", 
            char: '!', // Выберите свой символ
            color:  "#00bcd4 ", 
            baseName:  "Зелье защиты ", 
            effect:  "buff_def", 
            val: [2, 4],
            duration: 100,
            gender:  "it ",
            plural: false
        },

        { 
            type: "potion_stamina", 
            char: getChar('ITEM_POTION_HP'), // Используем существующий спрайт зелья
            color: "#4CAF50",                // Зеленый цвет для отличия
            baseName: "Зелье отдыха", 
            effect: "restore_stamina",       // Уникальный эффект
            val: [100, 100],                 // Восстанавливает полностью
            gender: "it",
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
 
``` 
 
### dungeon_generator.js 
 
```js 
 
/**
 * МОДУЛЬ ГЕНЕРАЦИИ ПОДЗЕМЕЛИЙ (dungeon_generator.js)
 */

// Проверка зависимостей
if (typeof SeededRandom === 'undefined' || typeof createSeed === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед dungeon_generator.js");
}

// Определяем типы здесь, чтобы они были доступны и в этом файле, и могли быть экспортированы
const DUNGEON_TYPES = [
    { name: 'dungeon', weight: 30, emoji: '🟫', floorChar: '.', wallChar: '#', floorColor: '#333', wallColor: '#555' }, 
    { name: 'cave', weight: 15, emoji: '🕸️', floorChar: 'o', wallChar: 'O', floorColor: '#2a2a2a', wallColor: '#4a3b3b' },
    { name: 'icy', weight: 20, emoji: '❄️', floorChar: '.', wallChar: '#', floorColor: '#aaddff', wallColor: '#ffffff' },
    { name: 'rogue', weight: 20, emoji: '🌫️', floorChar: '.', wallChar: '#', floorColor: '#781a6f', wallColor: '#995792' },
    { name: 'cellular', weight: 10, emoji: '🧿', floorChar: 'o', wallChar: 'O', floorColor: '#0b4217', wallColor: '#4caf50' },
    { name: 'arena', weight: 3, emoji: '🦴', floorChar: '.', wallChar: '#', floorColor: '#962e1b', wallColor: '#cf2f13' },
    { name: 'boss', weight: 2, emoji: '👑', floorChar: '.', wallChar: '#', floorColor: '#b71c1c', wallColor: '#880e4f' }
];

const TOTAL_WEIGHT = DUNGEON_TYPES.reduce((sum, t) => sum + t.weight, 0);

function selectDungeonType(rand) {
    rand.next(); rand.next(); rand.next();
    const r = rand.next();
    let cumulative = 0;
    for (const type of DUNGEON_TYPES) {
        cumulative += type.weight / TOTAL_WEIGHT;
        if (r < cumulative) return type;
    }
    return DUNGEON_TYPES[DUNGEON_TYPES.length - 1];
}

// === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: УТОЛЩЕНИЕ СТЕН (FIX DIAGONALS) ===
function thickenWalls(grid, width, height) {
    const changes = []; 
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            if (grid[y][x] === 1) {
                const horizontalGap = (grid[y][x-1] === 0 && grid[y][x+1] === 0);
                const verticalGap = (grid[y-1][x] === 0 && grid[y+1][x] === 0);
                if (horizontalGap || verticalGap) {
                    changes.push({x, y});
                }
            }
        }
    }
    for (const pos of changes) {
        grid[pos.y][pos.x] = 0;
    }
    return grid;
}

// === СТАНДАРТНАЯ ГЕНЕРАЦИЯ (КОМНАТЫ) ===
function generateRoomCorridorMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const rooms = [];
    const roomCount = rand.int(10, 20);
    for (let i = 0; i < roomCount; i++) {
        const w = rand.int(4, 8);
        const h = rand.int(4, 8);
        const x = rand.int(1, width - w - 1);
        const y = rand.int(1, height - h - 1); 
        let overlaps = false;
        for (const r of rooms) {
            if (x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) continue;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                grid[y + dy][x + dx] = 0;
            }
        }
        rooms.push({x, y, w, h});
    }
    if (rooms.length > 1) {
        for (let i = 0; i < rooms.length - 1; i++) {
            const r1 = rooms[i];
            const r2 = rooms[i + 1];
            const cx1 = Math.floor(r1.x + r1.w / 2);
            const cy1 = Math.floor(r1.y + r1.h / 2);
            const cx2 = Math.floor(r2.x + r2.w / 2);
            const cy2 = Math.floor(r2.y + r2.h / 2);
            
            const stepX = cx1 <= cx2 ? 1 : -1;
            for (let x = cx1; stepX > 0 ? x <= cx2 : x >= cx2; x += stepX) {
                if (cy1 >= 0 && cy1 < height && x >= 0 && x < width) {
                    grid[cy1][x] = 0;
                    if(cy1+1 < height) grid[cy1+1][x] = 0;
                }
            }
            const stepY = cy1 <= cy2 ? 1 : -1;
            for (let y = cy1; stepY > 0 ? y <= cy2 : y >= cy2; y += stepY) {
                if (y >= 0 && y < height && cx2 >= 0 && cx2 < width) {
                    grid[y][cx2] = 0;
                    if(cx2+1 < width) grid[y][cx2+1] = 0;
                }
            }
        }
    }
    return grid;
}

// === ГЕНЕРАЦИЯ ПЕЩЕР (CAVE) ===
function generateCaveMap(rand, width, height) {
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = 0.45;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                grid[y][x] = 1;
            } else {
                grid[y][x] = rand.next() < fillChance ? 1 : 0;
            }
        }
    }

    for (let i = 0; i < 5; i++) {
        grid = smoothMap(grid, width, height);
    }

    grid = thickenWalls(grid, width, height);
    grid = thickenWalls(grid, width, height);

    const regions = findRegions(grid, width, height);
    regions.sort((a, b) => b.cells.length - a.cells.length);

    if (regions.length < 2 || regions[0].cells.length < (width * height * 0.15)) {
        return generateCaveMap(rand, width, height);
    }

    const mainRegion = regions[0];
    const targets = regions.slice(1, 6); 
    
    for (const target of targets) {
        connectRegions(grid, mainRegion, target, width, height, rand);
    }

    grid = thickenWalls(grid, width, height);

    // Гарантированный поиск старта
    let startX = Math.floor(width / 2);
    let startY = Math.floor(height / 2);
    
    if (grid[startY][startX] === 1) {
        let minDist = Infinity;
        for (const cell of mainRegion.cells) {
            const dist = Math.abs(cell.x - startX) + Math.abs(cell.y - startY);
            if (dist < minDist) {
                minDist = dist;
                startX = cell.x;
                startY = cell.y;
            }
        }
    }

    return { grid, startPos: { x: startX, y: startY } };
}

// === CELLULAR MAP (ИСПРАВЛЕННЫЙ) ===
function generateCellularMap(rand, width, height) {
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = 0.45;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rand.next() < fillChance) grid[y][x] = 0;
        }
    }
    for (let iter = 0; iter < 4; iter++) {
        const newGrid = Array(height).fill().map(() => Array(width).fill(1));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    newGrid[y][x] = 1;
                    continue;
                 }
                let wallCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (grid[y + dy][x + dx] === 1) wallCount++;
                    }
                }
                newGrid[y][x] = (wallCount >= 5) ? 1 : 0;
            }
        }
        grid = newGrid;
    }
    
    grid = thickenWalls(grid, width, height);
    grid = thickenWalls(grid, width, height);
    
    return grid;
}

function generateArenaMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const margin = 2;
    for (let y = margin; y < height - margin; y++) {
        for (let x = margin; x < width - margin; x++) {
            grid[y][x] = 0;
        }
    }
    const colCount = rand.int(5, 15);
    for (let i = 0; i < colCount; i++) {
        const cx = rand.int(margin + 2, width - margin - 3);
        const cy = rand.int(margin + 2, height - margin - 3);
        if (Math.abs(cx - width/2) < 3 && Math.abs(cy - height/2) < 3) continue;
        grid[cy][cx] = 1;
        if (rand.next() > 0.5) {
            if(cx+1 < width-margin) grid[cy][cx+1] = 1;
            if(cy+1 < height-margin) grid[cy+1][cx] = 1;
            if(cx+1 < width-margin && cy+1 < height-margin) grid[cy+1][cx+1] = 1;
        }
    }
    return grid;
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ CAVE ===
function smoothMap(grid, width, height) {
    const newGrid = Array(height).fill().map(() => Array(width).fill(1));
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let wallCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (grid[y + dy][x + dx] === 1) wallCount++;
                }
            }
            if (wallCount > 4) newGrid[y][x] = 1;
            else if (wallCount < 4) newGrid[y][x] = 0;
            else newGrid[y][x] = grid[y][x];
        }
    }
    return newGrid;
}

function findRegions(grid, width, height) {
    const visited = Array(height).fill().map(() => Array(width).fill(false));
    const regions = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] === 0 && !visited[y][x]) {
                const region = { id: regions.length, cells: [] };
                const stack = [{x, y}];
                visited[y][x] = true;
                while (stack.length > 0) {
                    const curr = stack.pop();
                    region.cells.push(curr);
                    const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                    for (const [dx, dy] of dirs) {
                        const nx = curr.x + dx;
                        const ny = curr.y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (grid[ny][nx] === 0 && !visited[ny][nx]) {
                                visited[ny][nx] = true;
                                stack.push({x: nx, y: ny});
                            }
                        }
                    }
                }
                if (region.cells.length > 10) regions.push(region);
            }
        }
    }
    return regions;
}

function connectRegions(grid, regA, regB, width, height, rand) {
    const start = regA.cells[Math.floor(rand.next() * regA.cells.length)];
    const end = regB.cells[Math.floor(rand.next() * regB.cells.length)];
    let currX = start.x;
    let currY = start.y;
    const steps = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    
    for (let i = 0; i < steps * 1.5; i++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ty = currY + dy;
                const tx = currX + dx;
                if (ty > 0 && ty < height - 1 && tx > 0 && tx < width - 1) {
                    grid[ty][tx] = 0;
                }
            }
        }
        const dx = end.x - currX;
        const dy = end.y - currY;
        if (Math.abs(dx) > Math.abs(dy)) {
            currX += Math.sign(dx);
            if (rand.next() < 0.2) currY += (rand.next() < 0.5 ? 1 : -1);
        } else {
            currY += Math.sign(dy);
            if (rand.next() < 0.2) currX += (rand.next() < 0.5 ? 1 : -1);
        }
        currX = Math.max(1, Math.min(width - 2, currX));
        currY = Math.max(1, Math.min(height - 2, currY));
        if (Math.abs(currX - end.x) < 2 && Math.abs(currY - end.y) < 2) break;
    }
}

// === МОДУЛЬ ЭКСПОРТА ===
// === МОДУЛЬ ЭКСПОРТА ===
const DungeonGeneratorModule = {
    generateLevel: function(x, y, depth, width, height) {
        const seedVal = createSeed(x, y, depth);
        const rand = new SeededRandom(seedVal);
        const dungeonType = selectDungeonType(rand);
        
        let mapGrid;
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };

        if (dungeonType.name === 'cave') {
            const caveResult = generateCaveMap(rand, width, height);
            mapGrid = caveResult.grid;
            startPos = caveResult.startPos;
        } else if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
             mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }

        // Финальная проверка старта для всех типов
        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r < Math.max(width,height); r++) {
                for(let dy=-r; dy <=r; dy++) {
                    for(let dx=-r; dx <=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny >=0 && ny <height && nx >=0 && nx <width && mapGrid[ny][nx]===0) {
                            startPos = {x: nx, y: ny};
                            found = true;
                            break;
                         }
                    }
                    if(found) break;
                }
                if(found) break;
            }
        }

        return {
            mapData: mapGrid,
            dungeonType: dungeonType,
            startPos: startPos,
            seed: seedVal
        };
    },

    generateLevelWithType: function(x, y, depth, width, height, forcedType) {
        const seedVal = createSeed(x, y, depth);
        const rand = new SeededRandom(seedVal);
        let dungeonType = DUNGEON_TYPES.find(t => t.name === forcedType);
        if (!dungeonType) {
            dungeonType = selectDungeonType(rand);
        }
        
        let mapGrid;
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };

        if (dungeonType.name === 'cave') {
            const caveResult = generateCaveMap(rand, width, height);
            mapGrid = caveResult.grid;
            startPos = caveResult.startPos;
        } else if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
            mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }

        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r < Math.max(width,height); r++) {
                for(let dy=-r; dy <=r; dy++) {
                    for(let dx=-r; dx <=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny >=0 && ny <height && nx >=0 && nx <width && mapGrid[ny][nx]===0) {
                            startPos = {x: nx, y: ny};
                            found = true;
                            break;
                         }
                    }
                    if(found) break;
                }
                if(found) break;
            }
        }
        
        return {
            mapData: mapGrid,
            dungeonType: dungeonType,
            startPos: startPos,
            seed: seedVal
        };
    },
    
    // ✅ НОВЫЙ МЕТОД - ДОБАВЬТЕ ЭТОТ БЛОК
    getRandomDungeonType: function(rand) {
        return selectDungeonType(rand);
    }
};
 
``` 
 
### effect_system.js 
 
```js 
 
/**
 * МОДУЛЬ СИСТЕМЫ ЭФФЕКТОВ (effect_system.js)
 * Управляет временными состояниями существ (баффы, дебаффы, DoT).
 */

const EffectSystemModule = (function() {
    'use strict';

    // Типы эффектов
    const EFFECT_TYPES = {
        BUFF_ATK: 'buff_atk',   // Временное увеличение атаки
        BUFF_DEF: 'buff_def',   // Временное увеличение защиты
        DOT: 'dot',             // Урон со временем
        HOT: 'hot'              // Лечение со временем
    };

    /**
     * Создает объект эффекта
     */
    function createEffect(id, name, type, duration, value, color) {
        return {
            id: id + '_' + Date.now(), // Уникальный ID для каждого применения
            name: name,
            type: type,
            duration: duration, // Осталось ходов
            maxDuration: duration, // Для визуализации (опционально)
            value: value,       // Значение бонуса (например, +2 к атаке)
            color: color || '#fff'
        };
    }

    /**
     * Добавляет эффект к существу (игроку или врагу)
     * Если такой же тип эффекта уже есть, он перезаписывается (продлевается/усиливается)
     */
    function addEffect(entity, effect) {
        if (!entity.effects) entity.effects = [];

        // Проверяем, есть ли уже активный эффект этого ТИПА
        const existingIndex = entity.effects.findIndex(e => e.type === effect.type);

        if (existingIndex !== -1) {
            // Эффект уже есть. 
            // Логика: заменяем старое значение и сбрасываем таймер (продлеваем действие)
            // Можно также суммировать значения, если хотите stacking, но обычно баффы перезаписываются.
            const oldEffect = entity.effects[existingIndex];
            
            // Если новое значение больше старого, обновляем его, иначе оставляем старое (или всегда берем новое)
            // Здесь мы просто заменяем эффект на новый (как бы "выпили свежее зелье")
            entity.effects[existingIndex] = effect;
            
            console.log(`Эффект ${effect.name} обновлен. Осталось ходов: ${effect.duration}`);
        } else {
            // Нового эффекта нет, добавляем
            entity.effects.push(effect);
            console.log(`Новый эффект ${effect.name} добавлен.`);
        }
    }

    /**
     * Обрабатывает тики эффектов (уменьшает длительность, применяет DoT/HoT)
     * Вызывать в конце каждого хода игрока/врага.
     */
    function processEffects(entity, logFn) {
        if (!entity.effects || entity.effects.length === 0) return;

        // Проходим по копии массива, чтобы безопасно удалять
        [...entity.effects].forEach(effect => {
            
            // 1. Применяем мгновенные эффекты (урон/лечение каждый ход)
            if (effect.type === EFFECT_TYPES.DOT) {
                const dmg = effect.value || 1;
                entity.hp -= dmg;
                if (logFn) logFn(`${entity.name} получает ${dmg} урона от ${effect.name}.`, "combat");
            } 
            else if (effect.type === EFFECT_TYPES.HOT) {
                const heal = effect.value || 1;
                entity.hp = Math.min(entity.maxHp, entity.hp + heal);
                if (logFn) logFn(`${entity.name} восстанавливает ${heal} HP.`, "info");
            }

            // 2. Уменьшаем длительность
            effect.duration--;

            // 3. Если время вышло - удаляем и сбрасываем статы
            if (effect.duration <= 0) {
                removeEffect(entity, effect.type); // Удаляем по типу
                
                // Если это был бафф статов, нужно пересчитать итоговый стат
                if (effect.type === EFFECT_TYPES.BUFF_ATK || effect.type === EFFECT_TYPES.BUFF_DEF) {
                    recalculateStats(entity);
                }

                if (logFn && entity === GameModule.getPlayer()) {
                     logFn(`Действие ${effect.name} закончилось.`, "info");
                }
            }
        });
    }

    /**
     * Удаляет эффект определенного типа
     */
    function removeEffect(entity, type) {
        if (!entity.effects) return;
        entity.effects = entity.effects.filter(e => e.type !== type);
    }

    /**
     * Получает суммарный бонус к конкретному типу эффекта
     */
    function getActiveEffectValue(entity, type) {
        if (!entity.effects) return 0;
        const effect = entity.effects.find(e => e.type === type);
        return effect ? effect.value : 0;
    }
    
    /**
     * Получает оставшуюся длительность эффекта
     */
    function getEffectDuration(entity, type) {
        if (!entity.effects) return 0;
        const effect = entity.effects.find(e => e.type === type);
        return effect ? effect.duration : 0;
    }

    /**
     * Пересчитывает итоговые статы игрока на основе базовых + экипировки + активных эффектов
     */
    function recalculateStats(player) {
        if (!player) return;

        // 1. Базовые статы от уровня
        const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
        const baseDef = WorldCurveModule.getPlayerBaseDef(player.level);

        // 2. Бонусы от экипировки (они хранятся в bonusAtk/bonusDef постоянно)
        // Примечание: в текущей архитектуре bonusAtk уже включает экипировку.
        // Нам нужно отделить "постоянные" бонусы от "временных".
        // Но проще всего: пересчитать Atk = Base + EquipmentBonus + ActiveEffectBonus
        
        // Чтобы это работало корректно, нам нужно знать "чистый" бонус от вещей.
        // В текущем коде player.bonusAtk меняется при надевании. 
        // Давайте считать, что player.bonusAtk - это бонус ОТ ВЕЩЕЙ.
        
        const equipAtkBonus = player.bonusAtk || 0;
        const equipDefBonus = player.bonusDef || 0;

        // 3. Бонусы от активных эффектов
        const buffAtk = getActiveEffectValue(player, EFFECT_TYPES.BUFF_ATK);
        const buffDef = getActiveEffectValue(player, EFFECT_TYPES.BUFF_DEF);

        // Итоговые значения
        player.atk = baseAtk + equipAtkBonus + buffAtk;
        player.def = baseDef + equipDefBonus + buffDef;

        // Защита от отрицательных значений
        if (player.atk < 1) player.atk = 1;
        if (player.def < 0) player.def = 0;
    }

    // --- Конструкторы стандартных эффектов ---

    function createBuffAtk(duration, value) {
        return createEffect('buff_atk', 'Ярость', EFFECT_TYPES.BUFF_ATK, duration, value, '#ff9800');
    }

    function createBuffDef(duration, value) {
        return createEffect('buff_def', 'Каменная кожа', EFFECT_TYPES.BUFF_DEF, duration, value, '#00bcd4');
    }

    function createBurn(duration, power) {
        return createEffect('burn', 'Горение', EFFECT_TYPES.DOT, duration, power, '#ff5500');
    }

    function createRegen(duration, power) {
        return createEffect('regen', 'Регенерация', EFFECT_TYPES.HOT, duration, power, '#00ffaa');
    }

    // === ПУБЛИЧНЫЙ ИНТЕРФЕЙС ===
    return {
        addEffect: addEffect,
        processEffects: processEffects,
        recalculateStats: recalculateStats,
        getEffectDuration: getEffectDuration,
        
        Effects: {
            createBuffAtk: createBuffAtk,
            createBuffDef: createBuffDef,
            createBurn: createBurn,
            createRegen: createRegen
        },
        TYPES: EFFECT_TYPES // Экспортируем типы для использования в combat.js
    };

})();
 
``` 
 
### entity.js 
 
```js 
 
// =========================== Модуль сущностей (игрок, враги, предметы) ===========================
const EntityModule = (function() {
    function createPlayer(x, y) {
         return {
            x: x, y: y,
            char:  "@", color:  "#FFF ",
            hp: 20, maxHp: 20,
            stamina: 100, maxStamina: 100, // <--- НОВОЕ: Выносливость
            atk: 2, def: 1,
            bonusAtk: 0, bonusDef: 0,
            level: 1, xp: 0,
            gold: 0,
            inventory: [],
             equipment: { weapon: null, armor: null }
        };
    }

    // В файле entity.js, функция createEnemy

    function createEnemy(template, x, y, difficultyMult) {
        // 1. Расчет базовых средних значений из шаблона
        const baseHp = (template.hp[0] + template.hp[1]) / 2;
        const baseAtk = (template.atk[0] + template.atk[1]) / 2;
        const baseDef = (template.def[0] + template.def[1]) / 2;

        // 2. Применение множителя сложности с разными кривыми роста
        // HP растет пропорционально сложности (линейно)
        const hp = Math.max(1, Math.floor(baseHp * difficultyMult));
        
        // Атака растет медленнее (квадратный корень), чтобы бой длился дольше
        const atk = Math.max(1, Math.floor(baseAtk * Math.sqrt(difficultyMult)));
        
        // Защита растет очень медленно, чтобы игрок всегда мог нанести хотя бы 1 урон
        const def = Math.max(0, Math.floor(baseDef * Math.pow(difficultyMult, 0.3)));

        // 3. Параметры скорости (для системы энергии)
        const speed = template.speed || 10; 
        // Начальная энергия случайна от 0 до speed, чтобы рассинхронизировать толпу врагов
        const startEnergy = Math.floor(Math.random() * speed); 

        return {
            x: x, y: y, name: template.name,
            char: template.char, color: template.color,
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true,
            lootType: template.lootType,
            
            // Новые поля для механики ходов:
            speed: speed,      
            energy: startEnergy 
        };
    }

    // === Вспомогательная функция: выбор формы прилагательного ===
    function getAdjectiveForm(adjObj, gender, plural) {
        if (!adjObj) return "";
        if (plural) return adjObj.plural;
        if (gender === "she") return adjObj.she;
        if (gender === "it") return adjObj.it;
        return adjObj.base; 
    }

    function createItem(template, x, y, itemPowerMult) {
        let name = template.baseName;
        let finalVal = 0;

        // 1. Логика для ЗОЛОТА (отдельная обработка)
        if (template.type === 'gold') {
            const baseAmount = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
            finalVal = Math.max(1, Math.floor(baseAmount * itemPowerMult));
            name = `${finalVal} золотых`;
        } 
        // 2. Логика для ОБЫЧНЫХ ПРЕДМЕТОВ
        else {
            // Расчет финального значения для определения Тира
            const baseVal = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
            finalVal = Math.max(1, Math.floor(baseVal * itemPowerMult));

            // === ОПРЕДЕЛЕНИЕ ТИРА И ВЫБОР СЛОВАРЯ ===
            let tier = 'trash';
            // Получаем пороги из data.js (если их нет, используем дефолтные)
            const thresholds = DataModule.ADJECTIVE_TIERS?.thresholds || { trash: 3, common: 8, rare: 15, epic: 25 };

            if (finalVal > thresholds.epic) tier = 'epic';
            else if (finalVal > thresholds.rare) tier = 'rare';
            else if (finalVal > thresholds.common) tier = 'common';
            
            // Выбираем словарь в зависимости от типа предмета
            let adjList = null;

            // === ИСКЛЮЧЕНИЕ: СВИТКИ, КНИГИ И ОСОБЫЕ ПРЕДМЕТЫ БЕЗ ПРИЛАГАТЕЛЬНЫХ ===
            if (template.type === 'book' || template.type === 'scroll_teleport' || template.type === 'scroll') {
                adjList = null; // Прилагательное не добавляется
            }
            else if (template.type === 'weapon') {
                adjList = DataModule.ADJECTIVE_TIERS?.weapon[tier];
            } 
            else if (template.type === 'armor') {
                adjList = DataModule.ADJECTIVE_TIERS?.armor[tier];
            } 
            else {
                // Для зелий, еды и прочего используем общий список 'consumable' или 'item'
                adjList = DataModule.ADJECTIVE_TIERS?.consumable?.[tier] || DataModule.ADJECTIVE_TIERS?.item?.[tier];
            }

            // Формируем имя только если прилагательное нашлось
            if (adjList && adjList.length > 0) {
                const adjObj = adjList[Math.floor(Math.random() * adjList.length)];
                const adj = getAdjectiveForm(adjObj, template.gender, template.plural);
                name = `${adj} ${template.baseName}`;
            } else {
                // Если списка нет или это книга/свиток
                name = template.baseName;
            }
        }

        // 3. Создание объекта предмета
        return {
            x: x, y: y, 
            name: name,
            char: template.char, 
            color: template.color,
            type: template.type,
            stat: template.stat,
            effect: template.effect,
            val: finalVal,
            duration: template.duration, 
            isItem: true,
            meleeType: template.meleeType !== undefined ? template.meleeType : true,
            range: template.range || 1,
            maxAmmo: template.maxAmmo || 0,
            currentAmmo: template.maxAmmo || 0
        };
    }

    // === НОВАЯ ФУНКЦИЯ: Фильтрация врагов по уровню ===
    function getAvailableEnemies(depth) {
        if (depth <= 2) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Крыса", "Гоблин", "Волк", "Слизень"].includes(e.name)
            );
        } else if (depth <= 6) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Бандит", "Скелет", "Орк-разведчик", "Зомби", "Гарпия", "Призрак"].includes(e.name)
            );
        } else {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Тролль", "Вампир", "Лич", "Голем", "Демон", "Дракон"].includes(e.name)
            );
        }
    }

    // Безопасное размещение врагов
    function spawnEnemies(mapGrid, startPos, enemyTemplates, count, difficultyMult, minDist = 3, depth = 0) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        const availableTemplates = getAvailableEnemies(depth);
        const templatesToUse = availableTemplates.length > 0 ? availableTemplates : enemyTemplates;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= 4) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        // Fisher-Yates shuffle
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedEnemies = [];
        const occupiedCoords = [];

        for (const tile of validTiles) {
            if (placedEnemies.length >= count) break;
            let tooClose = false;
            for (const occ of occupiedCoords) {
                if (Math.abs(tile.x - occ.x) + Math.abs(tile.y - occ.y) < minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                occupiedCoords.push({ x: tile.x, y: tile.y });
                const template = templatesToUse[Math.floor(Math.random() * templatesToUse.length)];
                placedEnemies.push(createEnemy(template, tile.x, tile.y, difficultyMult));
            }
        }
        return placedEnemies;
    }

    // Размещение предметов (оружие, броня, зелья)
    function spawnItems(mapGrid, startPos, itemTemplates, count, itemPowerMult, minDistFromPlayer = 3) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= minDistFromPlayer) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedItems = [];
        // Исключаем золото из обычного спавна предметов
        const nonGoldTemplates = itemTemplates.filter(t => t.type !== 'gold');
        
        for (let i = 0; i < Math.min(count, validTiles.length); i++) {
            const tile = validTiles[i];
            const template = nonGoldTemplates[Math.floor(Math.random() * nonGoldTemplates.length)];
            placedItems.push(createItem(template, tile.x, tile.y, itemPowerMult));
        }
        return placedItems;
    }

    // === НОВАЯ ФУНКЦИЯ: Случайное разбрасывание золота ===
    // Вызывается отдельно при каждом входе в подземелье для генерации нового распределения
    function spawnGold(mapGrid, startPos, goldTemplate, count, depth, worldGoldMult = 1) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        // Собираем все проходимые клетки, кроме стартовой позиции игрока
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= 3) { // Не спавним золото прямо у ног
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        // Перемешиваем клетки для случайного выбора
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const goldPiles = [];
        const placed = new Set(); // Чтобы не класть две кучки в одну клетку

        for (let i = 0; i < Math.min(count, validTiles.length); i++) {
            const tile = validTiles[i];
            const key = `${tile.x},${tile.y}`;
            if (placed.has(key)) continue;
            placed.add(key);

            // Расчёт количества золота: база × множитель глубины × множитель мира
            const depthBonus = 1 + (depth * 0.1); // +50% за каждый уровень глубины
            const baseAmount = Math.floor(goldTemplate.val[0] + Math.random() * (goldTemplate.val[1] - goldTemplate.val[0]));
            const finalAmount = Math.max(1, Math.floor(baseAmount * depthBonus * worldGoldMult));

            goldPiles.push({
                x: tile.x,
                y: tile.y,
                name: `${finalAmount} золотых`,
                char: '$',
                color: '#FFD700',
                type: 'gold',
                val: finalAmount,
                isItem: true
            });
        }
        return goldPiles;
    }




    // === НОВАЯ ФУНКЦИЯ: Спавн предметов ВНУТРИ зданий (для городов) ===
    function spawnItemsInCity(interiorCoords, itemTemplates, count, itemPowerMult) {
        if (!interiorCoords || interiorCoords.length === 0) {
            console.warn("Нет внутренних помещений для спавна предметов");
            return [];
        }

        // Перемешиваем доступные внутренние клетки
        const shuffledCoords = [...interiorCoords];
        for (let i = shuffledCoords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledCoords[i], shuffledCoords[j]] = [shuffledCoords[j], shuffledCoords[i]];
        }

        const placedItems = [];
        // Берем столько клеток, сколько нужно предметов (или сколько есть)
        const limit = Math.min(count, shuffledCoords.length);

        for (let i = 0; i < limit; i++) {
            const pos = shuffledCoords[i];
            const template = itemTemplates[Math.floor(Math.random() * itemTemplates.length)];
            // Создаем предмет на этой позиции
            placedItems.push(createItem(template, pos.x, pos.y, itemPowerMult));
        }

        return placedItems;
    }
    // === СОЗДАНИЕ БОССА ===
    function createBoss(x, y, depth, bossData) {
        // Базовые статы босса сильно масштабируются от глубины
        const hp = Math.floor(150 * (1 + depth * 0.4));
        const atk = Math.floor(15 * (1 + depth * 0.3));
        const def = Math.floor(8 * (1 + depth * 0.3));

        return {
            x: x, y: y,
            name: bossData.fullName,
            char: 'B', // Символ-заглушка, рендерер использует isBoss
            color: '#ff0000',
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true,
            isBoss: true,          // ФЛАГ: это босс
            bossType: bossData.bossType, // Для выбора спрайтов
            lootType: 'boss_loot'
        };
    }

        // === НОВАЯ ФУНКЦИЯ: Создание инвентаря торговца ===
    function createMerchantInventory(depth, goldAmount) {
        const items = [];
        // Используем детерминированный сид на основе глубины и текущего времени (чтобы ассортимент менялся при перезаходе, но был стабилен в рамках сессии)
        // Если хочешь полностью статичный магазин для каждой глубины, убери Date.now()
        const rng = new Math.seedrandom(`merchant_${depth}_${Math.floor(Date.now() / 60000)}`); 
        
        // 1. Оружие и Броня (Экипировка)
        const equipTemplates = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
        // Количество зависит от глубины: минимум 5 предметов
        const equipCount = 5 + Math.floor(depth / 2);
        
        for (let i = 0; i < equipCount; i++) {
            const template = equipTemplates[Math.floor(rng() * equipTemplates.length)];
            // Сила предмета растет с глубиной
            const powerMult = 1.0 + (depth * 0.15);
            const item = EntityModule.createItem(template, 0, 0, powerMult);
            
            // Расчет цены продажи: (Базовая ценность * 10) + (Глубина * 5)
            // Это гарантирует, что крутые вещи стоят дорого
            item.price = Math.floor((item.val * 10) + (depth * 10)); 
            items.push(item);
        }

        // 2. Зелья и Еда (Расходники)
        const consumableTemplates = DataModule.ITEM_TYPES.filter(i => 
            i.type.includes('potion') || i.type === 'food' || i.type === 'scroll_teleport'
        );
        const consumableCount = 8 + Math.floor(depth / 3);
        
        for (let i = 0; i < consumableCount; i++) {
            const template = consumableTemplates[Math.floor(rng() * consumableTemplates.length)];
            const item = EntityModule.createItem(template, 0, 0, 1.0);
            
            // Цена расходников зависит от их лечебной/боевой силы (val)
            item.price = Math.floor(item.val * 3); 
            items.push(item);
        }

        return {
            items: items,
            gold: goldAmount
        };
    }

    return {
        createPlayer,
        createEnemy,
        createItem,
        spawnEnemies,
        spawnItems,
        spawnGold,
        spawnItemsInCity,
        createBoss,
        createMerchantInventory // <--- ДОБАВИТЬ ЭКСПОРТ
    };
})();
 
``` 
 
### game.js 
 
```js 
 
// =========================== Модуль игры (управление, ходы, загрузка уровней) ===========================
const GameModule = (function() {
    // === Состояние игры ===
    let player = null;
    let enemies = [];
    let items = [];
    let npcs = []; 
    let explored = new Set();
    let busy = false;
    let isReadingQuest = false; // Флаг: открыто ли окно сюжета
    let isTwineActive = false; // Флаг активности Twine-окна


    // === ПАМЯТЬ ПОДЗЕМЕЛИЙ ===
    let dungeonClearState = new Map(); 
    
    // === КВЕСТЫ ===
    let activeQuests = []; 
    let completedQuestIds = new Set();
    // В game.js, внутри GameModule, рядом с let activeQuests = [];
    let completedTextQuests = new Set(); // Храним имена файлов, которые игрок уже завершил

    // === Режимы ===
    let gameMode = 'global';
    let entrancePos = null; 
    
    // === Подземельные координаты ===
    let dungeonX = 0;
    let dungeonY = 0;
    let currentDepth = 0;  
    let currentDungeonTypeName = null; 
    let currentDungeonFullName = null; 
    
    // === Глобальные координаты и магазин ===
    let currentLocData = null;
    let currentWorldTrend = null;
    let isShopOpen = false;
    let isInnOpen = false;
    let currentMerchantInv = null;

    // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ UI ===
    function toggleUI(isVisible) {
        const panels = document.querySelectorAll('.ui-panel');
        panels.forEach(panel => {
            if (isVisible) {
                panel.classList.remove('hidden-ui');
            } else {
                panel.classList.add('hidden-ui');
            }
        });
    }

    // === ОКНО СЮЖЕТНОГО КВЕСТА ===
    // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ UI ===
    function toggleUI(isVisible) {
        // Находим все элементы с классом ui-panel
        const panels = document.querySelectorAll('.ui-panel');
        panels.forEach(panel => {
            if (isVisible) {
                panel.classList.remove('hidden-ui');
            } else {
                panel.classList.add('hidden-ui');
            }
        });
    }

    // === ОКНО СЮЖЕТНОГО КВЕСТА ===
    function openQuestWindow(quest, isCompleted) {
        isReadingQuest = true;
        toggleUI(false); // <--- СКРЫВАЕМ ПАНЕЛИ
    
        if (typeof RenderModule.drawQuestWindow === 'function') {
            RenderModule.drawQuestWindow(quest, isCompleted);
        } else {
            console.error("RenderModule.drawQuestWindow не найден!");
            closeQuestWindow();
        }
    }

    function closeQuestWindow() {
        isReadingQuest = false;
        window.questCloseButton = null;
        window.questClickAreas = null; // Очистка зон клика для пагинации
        toggleUI(true); // <--- ВОЗВРАЩАЕМ ПАНЕЛИ
        RenderModule.requestRedraw();
    }

    // === ОБРАБОТКА КЛИКА В ОКНЕ КВЕСТА ===
    function handleQuestClick(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // Проверка зон клика (кнопки пагинации и закрытия)
        if (window.questClickAreas) {
            for (const area of window.questClickAreas) {
                if (clickX >= area.x && clickX <= area.x + area.w && 
                    clickY >= area.y && clickY <= area.y + area.h) {
                    
                    if (area.action === 'close') {
                        closeQuestWindow();
                        return;
                    }
                    if (area.action === 'prev_q' || area.action === 'next_q') {
                        // Перерисовка окна с новой страницей
                        // Данные берутся из глобальной переменной, сохраненной при открытии
                        if (window.currentQuestWindowData) {
                            RenderModule.drawQuestWindow(window.currentQuestWindowData.quest, window.currentQuestWindowData.isCompleted);
                        }
                        return;
                    }
                }
            }
        }
        
        // Клик вне активных зон закрывает окно
        closeQuestWindow();
    }

    // === ПОСТОЯЛЫЙ ДВОР ===
    function openInn() {
        if (isInnOpen) return;
        isInnOpen = true;
        toggleUI(false);
        RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
        innLog("Вы вошли в Постоялый двор. Добро пожаловать!", "info");
    }

    function closeInn() {
        isInnOpen = false;
        window.innStatusMessage = "";
        toggleUI(true);
        RenderModule.requestRedraw();
    }

    function handleInnClick(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        if (window.innClickAreas) {
            for (const area of window.innClickAreas) {
                if (clickX >= area.x && clickX <= area.x + area.w && 
                    clickY >= area.y && clickY <= area.y + area.h) {
                    
                    if (area.action === 'exit') { closeInn(); return; }
                    if (area.action === 'rest') { innAction('rest'); return; }
                    if (area.action === 'rumor') { innAction('rumor'); return; }
                    if (area.action === 'dice') { innAction('dice'); return; }
                }
            }
        }
    }

    function innLog(msg, type) {
        RenderModule.log(msg, type);
        window.innStatusMessage = msg;
        if (player) RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
    }

    function innAction(actionType) {
        if (!player) return;
        
        if (actionType === 'rest') {
            const cost = 20;
            if (player.gold >= cost) {
                player.gold -= cost;
                player.stamina = player.maxStamina;
                innLog(`Вы сняли комнату за ${cost} золотых. Выносливость восстановлена!`, "loot");
            } else {
                innLog("Недостаточно золота для ночлега!", "combat");
            }
        } 
        else if (actionType === 'rumor') {
            if (typeof LoreModule !== 'undefined' && LoreModule.getRumor) {
                const rumor = LoreModule.getRumor();
                innLog(`Трактирщик шепчет: "${rumor}"`, "lore");
            }
        } 
        else if (actionType === 'dice') {
            const bet = 10;
            if (player.gold >= bet) {
                player.gold -= bet;
                const roll = Math.random();
                if (roll < 0.45) {
                    innLog("Вы проиграли в кости. Трактирщик забирает ваше золото.", "combat");
                } else if (roll < 0.90) {
                    player.gold += bet * 2;
                    innLog(`Вы выиграли! Получено ${bet * 2} золотых.`, "loot");
                } else {
                    player.gold += bet * 5;
                    innLog(`ДЖЕКПОТ! Вы выиграли ${bet * 5} золотых!`, "event");
                }
            } else {
                innLog("У вас нет даже 10 золотых, чтобы поставить!", "combat");
            }
        }
        
        RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
    }
    
    // === МАГАЗИН ===
    // === МАГАЗИН ===
    function openShop() {
        if (isShopOpen) return;
    
        const depth = currentDepth > 0 ? currentDepth : 1;
        const merchantGold = 500 + (depth * 100);
    
        currentMerchantInv = EntityModule.createMerchantInventory(depth, merchantGold);
        isShopOpen = true;
    
        toggleUI(false); // <--- СКРЫВАЕМ ПАНЕЛИ
    
        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        RenderModule.log("Вы вошли в лавку. Добро пожаловать!", "info");
    }

    function closeShop() {
        isShopOpen = false;
        currentMerchantInv = null;
        toggleUI(true); // <--- ВОЗВРАЩАЕМ ПАНЕЛИ
        RenderModule.requestRedraw();
        RenderModule.log("Вы покинули лавку.", "info");
    }

    function handleShopClick(clientX, clientY) {
        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // 1. Кнопка выхода
        if (window.shopExitButton) {
            const btn = window.shopExitButton;
            if (clickX >= btn.x && clickX <= btn.x + btn.w && 
                clickY >= btn.y && clickY <= btn.y + btn.h) {
                closeShop();
                return;
            }
        }

        // 2. Навигация и товары
        if (window.shopClickAreas) {
            for (const area of window.shopClickAreas) {
                if (clickX >= area.x && clickX <= area.x + area.w &&
                    clickY >= area.y && clickY <= area.y + area.h) {
                    
                    if (area.action.startsWith('prev_') || area.action.startsWith('next_')) {
                        if (area.action === 'prev_m') window.shopPageMerchant--;
                        if (area.action === 'next_m') window.shopPageMerchant++;
                        if (area.action === 'prev_p') window.shopPagePlayer--;
                        if (area.action === 'next_p') window.shopPagePlayer++;
                        RenderModule.drawShopWindow(currentMerchantInv, player.gold);
                        return;
                    }
                    
                    if (area.action === 'buy') { buyItem(area.index); return; }
                    if (area.action === 'sell') { sellItem(area.index); return; }
                }
            }
        }

        // 3. Клик вне окна
        const winW = canvas.width * 0.65; // Соответствует новому размеру в render.js
        const winH = canvas.height * 0.60;
        const winX = (canvas.width - winW) / 2;
        const winY = (canvas.height - winH) / 2;

        if (clickX < winX || clickX > winX + winW || clickY < winY || clickY > winY + winH) {
            closeShop();
        }
    }

    function buyItem(index) {
        if (!currentMerchantInv || !player) return;
        const item = currentMerchantInv.items[index];
        if (!item) return;

        if (player.gold >= item.price) {
            player.gold -= item.price;
            currentMerchantInv.gold += item.price;
            currentMerchantInv.items.splice(index, 1);
            player.inventory.push(item);
            
            window.shopPageMerchant = 0;
            window.shopPagePlayer = 0;
            
            RenderModule.log(`Куплено: ${item.name} за ${item.price} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        } else {
            RenderModule.log("Недостаточно золота!", "combat");
        }
    }

    function sellItem(index) {
        if (!player) return;
        const item = player.inventory[index];
        if (!item) return;
        if (item.isQuestItem) {
            RenderModule.log("Это квестовый предмет, его нельзя продать!", "combat");
            return;
        }

        const sellPrice = Math.floor(item.price ? item.price * 0.5 : item.val * 2);
        if (currentMerchantInv.gold >= sellPrice) {
            player.gold += sellPrice;
            currentMerchantInv.gold -= sellPrice;
            player.inventory.splice(index, 1);
            
            const buyBackPrice = Math.floor(sellPrice * 1.2); 
            item.price = buyBackPrice;
            currentMerchantInv.items.unshift(item);
            
            window.shopPageMerchant = 0;
            window.shopPagePlayer = 0;
            
            RenderModule.log(`Продано: ${item.name} за ${sellPrice} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            RenderModule.drawShopWindow(currentMerchantInv, player.gold);
        } else {
            RenderModule.log("У торговца недостаточно золота!", "combat");
        }
    }

    // === ИНИЦИАЛИЗАЦИЯ ===
    async function init() {
        try {
            if (typeof RenderModule === 'undefined') throw new Error("RenderModule не загружен");
            await RenderModule.init();
            RenderModule.setRedrawCallback(renderFrame);
        } catch (e) {
            console.error("Критическая ошибка при инициализации: ", e);
            document.body.innerHTML = `<div style="color:red; padding:20px;">Ошибка загрузки игры: ${e.message}</div>`;
            return;
        }

        gameMode = 'global';
        
        if (typeof GlobalMapModule !== 'undefined') {
            const startPos = GlobalMapModule.initSafeStart(1, 1, 3);
            RenderModule.log(`Стартовая позиция: ${startPos.x}, ${startPos.y}`, "info");

            if (typeof QuestChainModule !== 'undefined') {
                QuestChainModule.init(startPos.x, startPos.y);
                RenderModule.log("📜 Сюжетная линия мира сгенерирована.", "info");
            }
        } else {
            RenderModule.log("Ошибка: GlobalMapModule не найден", "combat");
            return;
        }
        
        renderGlobalMap();
        
        window.addEventListener("keydown", (e) => handleInput(e));
        addTouchControls();

        const mapContainer = document.getElementById("map-container");
        if (mapContainer) {
            mapContainer.addEventListener("mousedown", (e) => {
                if (!isMobileDevice()) {
                    handleCanvasClick(e.clientX, e.clientY);
                }
            });
        }
        
        RenderModule.log("Игра загружена. Режим: ГЛОБАЛЬНАЯ КАРТА", "info");
        updateAbandonButton(false);
    }

    // === ОБРАБОТКА ВВОДА (КЛИКИ И КЛАВИШИ) ===
    function handleCanvasClick(clientX, clientY) {
        // Приоритет 1: Окно квеста
        if (isReadingQuest) {
            handleQuestClick(clientX, clientY);
            return;
        }
        // Приоритет 2: Магазин
        if (isShopOpen) {
            handleShopClick(clientX, clientY);
            return;
        }
        if (isInnOpen) { handleInnClick(clientX, clientY); return; }
        
        // Приоритет 3: Осмотр карты (только в подземелье)
        if (gameMode === 'dungeon') {
            handleMapClick(clientX, clientY);
        }
    }

    function handleInput(e) {
        // 1. ПРОВЕРКА ОКНА СЮЖЕТА (Приоритет №0)
        if (isReadingQuest) {
            if (e.key === "Escape") closeQuestWindow();
            return; 
        }

        // 2. ПРОВЕРКА ПОСТОЯЛОГО ДВОРА (Приоритет №1)
        if (isInnOpen) {
            if (e.key === "Escape") closeInn();
            return; 
        }

        // 3. ПРОВЕРКА МАГАЗИНА (Приоритет №2)
        if (isShopOpen) {
            if (e.key === "Escape") closeShop();
            return; 
        }

        // 4. ЧИТ-КОД: Восстановление здоровья (Enter)
        if (e.key === "Enter") {
            e.preventDefault();
            if (player && player.hp > 0) {
                const healAmount = 100;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                RenderModule.log(`💊 ЧИТ: Восстановлено ${healAmount} HP!`, "event");
                RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            }
            return;
        }
        // Временная клавиша для теста Twine
        if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            GameModule.openTwineQuest('Quack of Duckness.html');
            return;
        }
        // 5. БЛОКИРОВКА ПРИ ЗАНЯТОСТИ ИЛИ СМЕРТИ
        if (busy || (player && player.hp <= 0)) return;
        
        let dx = 0, dy = 0;
        
        // Определение направления
        if (e.key === "ArrowUp") dy = -1;
        if (e.key === "ArrowDown") dy = 1;
        if (e.key === "ArrowLeft") dx = -1;
        if (e.key === "ArrowRight") dx = 1;
        
        // Обработка движения или пропуска хода (Space)
        if (dx !== 0 || dy !== 0 || e.key === " ") {
            e.preventDefault();
            
            if (gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }
        }
    }





    // === ЛОГИКА ВЫДАЧИ КВЕСТОВ (Интеграция с QuestChainModule и Окном Сюжета) ===
    function tryGiveQuest(npc) {
        if (typeof QuestSystemModule === 'undefined') return false;
        if (!npc.isQuestGiver) return false;

        if (!entrancePos) return false;
        const cityGx = entrancePos.x;
        const cityGy = entrancePos.y;

        // ==========================================
        // 1. ПРОВЕРКА СЮЖЕТНОЙ ЦЕПОЧКИ (Приоритет №1)
        // ==========================================
        if (typeof QuestChainModule !== 'undefined' && QuestChainModule.isInitialized()) {
            if (QuestChainModule.isChainCity(cityGx, cityGy)) {
                const chainQuest = QuestChainModule.getQuestForCity(cityGx, cityGy);
                
                if (chainQuest) {
                    const questId = chainQuest.id;
                    const alreadyActive = activeQuests.some(q => q.id === questId);
                    const alreadyDone = completedQuestIds.has(questId);

                    // --- СЦЕНАРИЙ А: СДАЧА СЮЖЕТНОГО КВЕСТА ---
                    if (alreadyActive) {
                        const q = activeQuests.find(q => q.id === questId);
                        
                        if (q.isCompleted && !q.isTurnedIn) {
                            // 1. Очистка инвентаря от квестовых предметов
                            if (q.type === 'FETCH' || q.type === 'COLLECT') {
                                player.inventory = player.inventory.filter(item => {
                                    // Удаляем предмет, если он помечен как квестовый И совпадает с целью
                                    if (item.isQuestItem) {
                                        const isTypeMatch = (item.type === q.target.itemType);
                                        const isNameMatch = (!q.target.itemName || item.name.includes(q.target.itemName));
                                        
                                        // Для COLLECT можно добавить проверку uniqueId, если она есть
                                        const isUniqueMatch = q.target.uniqueId ? (item.uniqueId === q.target.uniqueId) : true;

                                        // Если это нужный предмет - удаляем его (возвращаем false)
                                        if (isTypeMatch && isNameMatch && isUniqueMatch) {
                                            return false; 
                                        }
                                    }
                                    return true; // Оставляем остальные предметы
                                });
                            }

                            // 2. Выдача награды
                            player.gold += q.rewardGold;
                            q.isTurnedIn = true; 

                            // 3. Обновление UI и логов
                            RenderModule.log(`🏆 СЮЖЕТНЫЙ КВЕСТ СДАН! Получено: ${q.rewardGold} золотых.`, "loot");
                            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
                            RenderModule.updateQuestBriefing(null); 

                            // 4. Удаление из активных и добавление в выполненные
                            activeQuests = activeQuests.filter(aq => aq.id !== questId);
                            completedQuestIds.add(questId);
                            updateAbandonButton(activeQuests.length > 0);
                            
                            // 5. Прогресс цепочки
                            QuestChainModule.completeCurrentQuest();
                            updateQuestCompass();

                            // 6. ОТКРЫТИЕ ОКНА СЮЖЕТА (Сдача)
                            if (typeof openQuestWindow === 'function') {
                                openQuestWindow(q, true);
                            } else {
                                // Фолбэк, если окно еще не подключено
                                if (q.turnInText) {
                                    RenderModule.log(`🗣️ ${npc.name}: "${q.turnInText}"`, "event");
                                }
                            }
                            
                            if (typeof RenderModule.updateInspector === 'function') {
                                RenderModule.updateInspector(`📜 Квест сдан!`, `Награда: ${q.rewardGold} золотых.`, "npc");
                            }
                            return true;
                        } else {
                            // Квест активен, но не выполнен
                            RenderModule.log(`${npc.name}: "Ты еще не выполнил мое поручение. Ищи ${q.target.locationName}."`, "info");
                            return true;
                        }
                    } 
                    
                    // --- СЦЕНАРИЙ Б: ВЫДАЧА НОВОГО СЮЖЕТНОГО КВЕСТА ---
                    else if (!alreadyDone) {
                        chainQuest.isActive = true;
                        chainQuest.originX = cityGx;
                        chainQuest.originY = cityGy;
                        activeQuests.push(chainQuest);
                        updateAbandonButton(true);
                        
                        RenderModule.log(`📜 СЮЖЕТНЫЙ КВЕСТ от ${npc.name}:`, "event");
                        RenderModule.log(chainQuest.briefing, "info");
                        RenderModule.updateQuestBriefing(chainQuest);
                        
                        if (typeof RenderModule.updateInspector === 'function') {
                            RenderModule.updateInspector(`📜 Квест принят!`, chainQuest.briefing, "npc");
                        }

                        // ОТКРЫТИЕ ОКНА СЮЖЕТА (Взятие)
                        if (typeof openQuestWindow === 'function') {
                            openQuestWindow(chainQuest, false);
                        }
                        
                        return true; 
                    }
                } else {
                    // Город из цепочки, но квест для него уже сдан или еще не время
                    const expectedIdx = QuestChainModule.getExpectedIndex();
                    const cityIdx = QuestChainModule.getChainCities().findIndex(c => c.x === cityGx && c.y === cityGy);
                    
                    if (cityIdx < expectedIdx) {
                         RenderModule.log(`${npc.name}: "Спасибо за помощь, герой. Твой путь лежит дальше."`, "info");
                    } else {
                         RenderModule.log(`${npc.name}: "Я чувствую, ты еще не готов к моей просьбе. Сначала заверши дела в других землях."`, "info");
                    }
                    return true; // Блокируем выдачу случайного квеста
                }
            }
        }

    // ==========================================
    // 2. СТАНДАРТНЫЕ СЛУЧАЙНЫЕ КВЕСТЫ (Fallback)
    // ==========================================
    let npcIndex = 0;
    for(let i=0; i<npc.name.length; i++) npcIndex += npc.name.charCodeAt(i);

    const tempQuest = QuestSystemModule.createQuest(cityGx, cityGy, npcIndex % 5);
    const questId = tempQuest.id;
    
    const alreadyActive = activeQuests.some(q => q.id === questId);
    const alreadyDone = completedQuestIds.has(questId);

    // Сценарий 0: Квест выполнен, но награда еще не получена (СДАЧА КВЕСТА)
    if (alreadyActive) {
        const q = activeQuests.find(q => q.id === questId);
        if (q.isCompleted && !q.isTurnedIn) {
            player.gold += q.rewardGold;
            q.isTurnedIn = true; 
            
            RenderModule.log(`🏆 Квест сдан! Получено: ${q.rewardGold} золотых.`, "loot");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
            
            // Очищаем футер, так как квест сдан
            RenderModule.updateQuestBriefing(null); 

            activeQuests = activeQuests.filter(aq => aq.id !== questId);
            completedQuestIds.add(questId);
            updateAbandonButton(activeQuests.length > 0);
            updateQuestCompass();
            
            if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(`📜 Квест сдан!`, `Награда: ${q.rewardGold} золотых.`, "npc");
            }
            return true;
        }
    }


    // Сценарий 1: Новый квест
    if (!alreadyActive && !alreadyDone) {
        const newQuest = QuestSystemModule.createQuest(cityGx, cityGy, npcIndex % 5);
        newQuest.isActive = true;
        newQuest.originX = cityGx;
        newQuest.originY = cityGy;
        activeQuests.push(newQuest);
        updateAbandonButton(true); // <--- ДОБАВИТЬ
        RenderModule.log(`📜 НОВЫЙ КВЕСТ от ${npc.name}:`, "event");
        RenderModule.log(newQuest.briefing, "info");
        
        RenderModule.updateQuestBriefing(newQuest);
        
        if (typeof RenderModule.updateInspector === 'function') {
            RenderModule.updateInspector(`📜 Квест принят!`, newQuest.briefing, "npc");
        }
        return true; 
    }
    // Сценарий 2: Квест активен, но цель еще не достигнута
    else if (alreadyActive) {
         const q = activeQuests.find(q => q.id === questId);
         const statusMsg = `Статус: В процессе (${q.progress}/${q.maxProgress})`;
         
         RenderModule.log(`${npc.name}: "Ты еще не выполнил мое поручение! Ищи ${q.target.locationName}."`, "info");
         
         if (typeof RenderModule.updateInspector === 'function') {
             RenderModule.updateInspector(`📜 ${npc.name}`, statusMsg, "npc");
         }
         return true; 
    } 
    // Сценарий 3: Квест полностью завершен (сдан)
    else if (alreadyDone) {
         RenderModule.log(`${npc.name}: "Спасибо за помощь, герой. Пока что дел нет."`, "info");
         
         if (typeof RenderModule.updateInspector === 'function') {
             RenderModule.updateInspector(`📜 ${npc.name}`, "Задание выполнено. Спасибо!", "npc");
         }
         return true;
    }
    
    return false;
}

    
    // === НАГРАДА ЗА КВЕСТ ===
    function grantReward(quest) {
        if (!player) return;
        
        player.gold += quest.rewardGold;
        RenderModule.log(`🏆 Квест выполнен! Получено: ${quest.rewardGold} золотых.`, "loot");
        
        activeQuests = activeQuests.filter(q => q.id !== quest.id);
        completedQuestIds.add(quest.id);
        
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        updateQuestCompass(); // Обновляем компас после завершения
    }

    // === ЛОГИКА КОМПАСА (ПРОСТАЯ СТРЕЛКА) ==// === ЛОГИКА КОМПАСА (ПРОСТАЯ СТРЕЛКА) ===
function getQuestArrow(targetX, targetY, currentX, currentY) {
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    
    if (dx === 0 && dy === 0) return '📍'; 

    let arrow = '';
    if (dy < 0) arrow += '↑'; 
    else if (dy > 0) arrow += '↓';
    
    if (dx > 0) arrow += '→'; 
    else if (dx < 0) arrow += '←';
    
    if (arrow === '↑←') arrow = '↖';
    if (arrow === '↑→') arrow = '↗';
    if (arrow === '↓←') arrow = '↙';
    if (arrow === '↓→') arrow = '↘';
    
    return arrow;
}

function updateQuestCompass() {
    const coordsEl = document.getElementById("ui-loc-coords");
    if (!coordsEl) return;

    // Работаем ТОЛЬКО на глобальной карте
    if (gameMode !== 'global') {
        return;
    }

    const playerPos = GlobalMapModule.getPlayerPosition();
    
    // 1. Ищем квест, который выполнен, но награда еще не сдана
    const turnInQuest = activeQuests.find(q => q.isCompleted && !q.isTurnedIn);
    
    // 2. Если таких нет, ищем обычный активный квест
    const activeQuest = !turnInQuest ? activeQuests.find(q => !q.isCompleted) : null;

    let targetX, targetY, color;
    let isGlobalQuest = false; // Флаг для квестов без конкретной локации (BOUNTY/SCHOLAR)

    if (turnInQuest) {
        // Цель: Город, где взят квест
        if (turnInQuest.originX !== undefined && turnInQuest.originY !== undefined) {
            targetX = turnInQuest.originX;
            targetY = turnInQuest.originY;
            color = "#00ff00"; // Зеленый для награды
        } else {
            coordsEl.textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
            return;
        }
    } else if (activeQuest && activeQuest.target) {
        // Цель: Подземелье или локация квеста
        targetX = activeQuest.target.targetX;
        targetY = activeQuest.target.targetY;
        
        // Проверка: если это квест типа BOUNTY или SCHOLAR (координат нет)
        if (targetX === null || targetY === null) {
            isGlobalQuest = true;
        } else {
            // Обычные квесты с локацией
            if (activeQuest.type === 'HUNT') color = "#ff5555";
            else if (activeQuest.type === 'FETCH') color = "#ffd700";
            else color = "#58a6ff";
        }
    }

    if (isGlobalQuest) {
        // Для BOUNTY/SCHOLAR показываем статус выполнения вместо стрелки
        const label = activeQuest.type === 'BOUNTY' ? "🏹 Охота" : "📚 Чтение";
        coordsEl.innerHTML = `<span style="color:#58a6ff">${label}: ${activeQuest.progress}/${activeQuest.maxProgress}</span>`;
    } 
    else if (targetX !== undefined && targetY !== undefined) {
        // Для квестов с локацией рисуем стрелку
        const arrow = getQuestArrow(targetX, targetY, playerPos.x, playerPos.y);
        const label = turnInQuest ? "🏆 Награда" : "📜 Квест";
        
        coordsEl.innerHTML = `<span style="color:${color}">${label}: ${arrow}</span>`;
    } else {
        // Если квестов нет
        coordsEl.textContent = `X: ${playerPos.x}, Y: ${playerPos.y}`;
    }
}
    function addTouchControls() {
        const mapContainer = document.getElementById("map-container");
        const canvas = mapContainer.querySelector("canvas");
        
        if (!canvas) return;

        canvas.addEventListener("touchstart", (e) => {
            e.preventDefault();
            
            // Получаем координаты тапа один раз для всех проверок
            const touch = e.touches[0];
            const clientX = touch.clientX;
            const clientY = touch.clientY;

            // 0. ПРОВЕРКА ОКНА СЮЖЕТА (Приоритет №0)
            if (isReadingQuest) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const clickX = (clientX - rect.left) * scaleX;
                const clickY = (clientY - rect.top) * scaleY;

                // Проверяем клик по кнопке закрытия
                if (window.questCloseButton) {
                    const btn = window.questCloseButton;
                    if (clickX >= btn.x && clickX <= btn.x + btn.w && 
                        clickY >= btn.y && clickY <= btn.y + btn.h) {
                        closeQuestWindow();
                        return;
                    }
                }
                // Клик вне кнопки тоже закрывает окно
                closeQuestWindow();
                return;
            }

            // 1. БЛОКИРОВКА ПРИ ЗАНЯТОСТИ ИЛИ СМЕРТИ
            if (busy || (player && player.hp <= 0)) return;

            // 2. 🎯 ПРОВЕРКА МАГАЗИНА (Приоритет №1 после сюжета)
            if (isShopOpen) {
                handleShopClick(clientX, clientY);
                return; 
            }

            if (isInnOpen) {
                handleInnClick(clientX, clientY);
                return; 
            }

            // ... остальной код движения ...
            const rect = canvas.getBoundingClientRect();
            const touchX = clientX - rect.left;
            const touchY = clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            let dx = 0, dy = 0;
            const offsetX = touchX - centerX;
            const offsetY = touchY - centerY;
            
            if (Math.abs(offsetX) > Math.abs(offsetY)) {
                dx = offsetX > 0 ? 1 : -1;
            } else {
                dy = offsetY > 0 ? 1 : -1;
            }
            
            if (gameMode === 'global') {
                processGlobalTurn(dx, dy);
            } else {
                processTurn(dx, dy);
            }
            
        }, { passive: false });
        
        if (isMobileDevice()) {
            RenderModule.log("💡 Коснитесь части экрана для движения", "info");
        }
    }    
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // === ГЛОБАЛЬНЫЙ РЕЖИМ ===
    function processGlobalTurn(dx, dy) {
        if (busy) return;
        if (dx === 0 && dy === 0) return;
        
        // === НОВОЕ: Проверка выносливости ПЕРЕД движением ===
        if (player && player.stamina <= 0) {
            RenderModule.log("Вы умерли от усталости. Нажмите F5 чтобы начать сначала.", "combat");
            busy = true; // Блокируем дальнейшие действия
            return;
        }

        if (GlobalMapModule.tryMove(dx, dy)) {
            // === НОВОЕ: Уменьшаем выносливость при успешном шаге ===
            if (player) {
                player.stamina = Math.max(0, player.stamina - 1);
                
                // Проверка смерти ПОСЛЕ шага (если ушли в минус)
                if (player.stamina <= 0) {
                    RenderModule.log("Вы сделали последний шаг... Вы умерли от усталости. Нажмите F5 чтобы начать сначала.", "combat");
                    busy = true;
                    renderGlobalMap(); // Обновить UI перед смертью
                    return;
                }
            }

            const playerPos = GlobalMapModule.getPlayerPosition();
            // ... остальной код функции без изменений ...
            const poi = GlobalMapModule.getPOI(playerPos.x, playerPos.y);
            
            if (poi) {
                enterPOI(poi);
                return;
            }

            // Проверка квестов типа EXPLORE/FETCH при движении
            if (typeof QuestSystemModule !== 'undefined') {
                activeQuests.forEach(q => {
                    if (QuestSystemModule.checkProgress(q, { type: 'move', x: playerPos.x, y: playerPos.y })) {
                         RenderModule.log(`📍 Квест выполнен: Вы достигли ${q.target.locationName}!`, "event");
                         
                         // >>> ЗАМЕНИТЬ ЭТУ СТРОКУ <<<
                         // grantReward(q); 
                         
                         // >>> НА ЭТИ ДВЕ СТРОКИ <<<
                         q.isTurnedIn = false; // Явно указываем, что награда еще не получена
                         RenderModule.updateQuestBriefing(q);
                        
                         updateQuestCompass(); // Обновляем стрелку на "Награда"
                    }
                });
            }

            updateQuestCompass(); // <--- ВАЖНО: Обновляем стрелку после каждого шага
            renderGlobalMap();
        } else {
            RenderModule.log("Путь преграждают горы или вода!", "combat");
        }
    }
    
    function enterPOI(poi) {
        busy = true;
        entrancePos = GlobalMapModule.getPlayerPosition();
        gameMode = 'dungeon';
        
        if (poi.type === 'city') {
            RenderModule.log(`Вы входите в город ${poi.name}`, "info");
            loadCityLevel(poi.x, poi.y, poi.name);
        } else if (poi.type === 'dungeon') {
            RenderModule.log(`Вы входите в подземелье ${poi.name}`, "info");
            currentDepth = 0;
            currentDungeonTypeName = poi.dungeonType;
            currentDungeonFullName = poi.name;
            loadDungeonLevel(poi.x, poi.y, currentDepth, poi.dungeonType, poi.name);
        }
        busy = false;
    }
    
    function exitToGlobal() {
        saveCurrentDungeonState();
        isShopOpen = false;
        currentMerchantInv = null;
        gameMode = 'global';
        updateQuestCompass(); 
        renderGlobalMap();
        if (entrancePos) {
            GlobalMapModule.setPlayerPosition(entrancePos.x, entrancePos.y);
            //entrancePos = null;
        }
        if (MapModule.clearCache) MapModule.clearCache();

        dungeonX = 0;
        dungeonY = 0;
        currentDepth = 0;
        currentDungeonTypeName = null;
        currentDungeonFullName = null;
        enemies = [];
        items = [];
        npcs = [];
        window.currentCityNpcs = [];
        explored.clear();
       
        RenderModule.log("Вы вернулись на поверхность", "info");
        
        // <--- ВАЖНО: Сразу обновляем компас при выходе

    }
    
    // === ЗАГРУЗКА ГОРОДА ===
    // === ЗАГРУЗКА ГОРОДА ===
    function loadCityLevel(gx, gy, cityName) {
        enemies = []; 
        items = [];
        npcs = [];
        window.currentCityNpcs = [];
        explored.clear();
        isShopOpen = false; 
        currentMerchantInv = null;
        
        // 1. Генерируем город
        const startPos = MapModule.generateCity(gx, gy, 0);
        
        // 2. === ВАЖНОЕ ИСПРАВЛЕНИЕ: Сохраняем координаты магазина ===
        // MapModule.generateCity уже записывает их в window.currentShopCoords внутри себя,
        // но для надежности продублируем или убедимся, что они доступны.
        // Если в map.js вы используете window.currentShopCoords, то здесь все ок.
        // Но давайте сбросим флаг магазина, чтобы он точно открылся при входе.
        //isShopOpen = false; 
        //currentMerchantInv = null;

        if (!player) player = EntityModule.createPlayer(startPos.x, startPos.y);
        else {
            player.x = startPos.x;
            player.y = startPos.y;
        }
        
        if (typeof NpcGeneratorModule !== 'undefined' && NpcGeneratorModule.generateCityNpcs) {
            try {
                const generatedNpcs = NpcGeneratorModule.generateCityNpcs(gx, gy, MapModule.currentMapData, startPos);
                npcs = generatedNpcs;
                window.currentCityNpcs = generatedNpcs;
            } catch (e) {
                console.error("Ошибка генерации NPC:", e);
            }
        }

        if (EntityModule.spawnItemsInCity) {
            const interior = MapModule.interiorCoords || [];
            items = EntityModule.spawnItemsInCity(interior, DataModule.ITEM_TYPES, 6, 1.0);
        } else {
            if (EntityModule.spawnItems) {
                items = EntityModule.spawnItems(MapModule.currentMapData, player, DataModule.ITEM_TYPES, 6, 1.0, 2);
            }
        }
        
        currentLocData = {
            fullName: cityName,
            description: "Безопасное место. Здесь можно отдохнуть.",
            themeName: "Город"
        };
        currentWorldTrend = null;
        renderFrame();
    }    

    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    // === ЗАГРУЗКА ПОДЗЕМЕЛЬЯ ===
    function loadDungeonLevel(gx, gy, depth, dungeonType, dungeonName, entryPoint = null) {
        saveCurrentDungeonState();
        enemies = [];
        items = [];
        npcs = [];
        window.currentCityNpcs = [];
        explored.clear();
    
        const startPos = MapModule.generateWithType(gx, gy, depth, dungeonType, entryPoint);
    
        dungeonX = gx;
        dungeonY = gy;
        currentDepth = depth;
        currentDungeonTypeName = dungeonType;
        currentDungeonFullName = dungeonName;
    
        if (!player) player = EntityModule.createPlayer(startPos.x, startPos.y);
        else {
            player.x = startPos.x;
            player.y = startPos.y;
        }
    
        spawnDungeonEntities(gx, gy, depth);

        // >>> ВСТАВЛЕННЫЙ БЛОК: ПРОВЕРКА И СПАВН КВЕСТОВЫХ ПРЕДМЕТОВ <<<
        if (typeof QuestSystemModule !== 'undefined') {
            activeQuests.forEach(q => {
                // 1. Спавн предмета для FETCH
                if (q.isActive && !q.isCompleted && 
                    q.type === 'FETCH' && 
                    q.target.targetX === gx && 
                    q.target.targetY === gy) {
                    spawnQuestItem(q);
                }

                // 2. ГАРАНТИРОВАННЫЙ СПАВН КНИГ ДЛЯ SCHOLAR/COLLECT
                if (q.isActive && !q.isCompleted && 
                   (q.type === 'SCHOLAR' || q.type === 'COLLECT') && 
                    q.target.itemType === 'book') {
                    const booksToSpawn = Math.min(q.maxProgress, 3); 
                    for(let i=0; i<booksToSpawn; i++) {
                        spawnScholarBook(q);
                    }
                }

                // 3. ПРОВЕРКА DIGGER (Глубинный разведчик)
                if (q.isActive && !q.isCompleted && q.type === 'DIGGER') {
                    // Проверяем координаты подземелья и глубину
                    // ВАЖНО: currentDepth начинается с 0, а targetDepth - это "Уровень" (с 1)
                    // Поэтому сравниваем (currentDepth + 1)
                    if (q.target.targetX === gx && 
                        q.target.targetY === gy && 
                        (currentDepth + 1) >= q.target.targetDepth) { 
                        
                        // Завершаем квест
                        q.progress = q.maxProgress;
                        q.isCompleted = true;
                        
                        RenderModule.log(`🏆 Квест выполнен: Вы достигли глубины ${currentDepth + 1} в ${dungeonName}!`, "event");
                        RenderModule.updateQuestBriefing(q); // Обновляем футер
                        updateQuestCompass(); // Переключаем стрелку на "Награда"
                    }
                }

                // 4. ПРОВЕРКА EXPLORE (Исследователь)
                // Для EXPLORE цель - просто добраться до определенного подземелья (любой глубины)
                if (q.isActive && !q.isCompleted && q.type === 'EXPLORE') {
                     if (q.target.targetX === gx && q.target.targetY === gy) {
                        q.progress = q.maxProgress;
                        q.isCompleted = true;
                        
                        RenderModule.log(`🏆 Квест выполнен: Вы исследовали ${dungeonName}!`, "event");
                        RenderModule.updateQuestBriefing(q);
                        updateQuestCompass();
                     }
                }
            });
        }
        // >>> КОНЕЦ ВСТАВКИ <<<
    
        currentLocData = {
            fullName: `${dungeonName} [Уровень ${depth + 1}]`,
            description: `Подземелье типа ${dungeonType}, уровень ${depth + 1}`,
            themeName: MapModule.currentDungeonType ? MapModule.currentDungeonType.name : dungeonType
        };
    
        currentWorldTrend = WorldCurveModule.getWorldTrend(gx, gy);
        if (currentWorldTrend.name !== "Обычный уровень") {
            RenderModule.log(`Тренд мира: ${currentWorldTrend.name}`, "event");
        }
    
        RenderModule.log(`=== УРОВЕНЬ ${depth + 1} подземелья "${dungeonName}" ===`, "info");
        renderFrame();
    }    
    
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    // === СПАВН СУЩНОСТЕЙ ===
    function spawnDungeonEntities(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        const savedState = dungeonClearState.get(cacheKey);

        // 1. Количество врагов: база 8 + 1.5 за каждый этаж
        let enemyCount = 8 + Math.floor(depth * 1.5);
        
        // Если уровень уже посещался, ограничиваем спавн сохраненным числом
        if (savedState) {
            // Используем savedState.enemies, так как именно так мы сохраняли значение
            enemyCount = Math.min(enemyCount, savedState.enemies);
            
            // Выводим сообщение только если враги еще остались
            if (savedState.enemies > 0) {
                RenderModule.log(`👣 Вы замечаете следы своей предыдущей битвы. Осталось врагов: ~${savedState.enemies}`, "info");
            } else {
                // Опционально: можно вывести тихое сообщение или вообще ничего
                // RenderModule.log("🕸️ Это место кажется подозрительно тихим... (зачищено)", "info");
            }
        }
        
        // 2. Множитель сложности врагов
        const enemyMult = WorldCurveModule.getEnemyMultiplier(gx, gy) * (1 + depth * 0.2);
        
        // 3. Фильтрация врагов по уровню сложности
        let availableEnemies = DataModule.ENEMY_TYPES;
        if (depth < 3) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Гоблин", "Крыса", "Волк", "Слизень"].includes(e.name));
        } else if (depth < 7) {
            availableEnemies = DataModule.ENEMY_TYPES.filter(e => ["Бандит", "Скелет", "Орк", "Зомби"].includes(e.name));
        }

        // Спавн врагов (если их больше 0)
        if (enemyCount > 0) {
            enemies = EntityModule.spawnEnemies(
                MapModule.currentMapData,
                player,
                availableEnemies,
                enemyCount,
                enemyMult,
                3,
                depth
            );
        } else {
            enemies = []; // Гарантируем пустой массив для зачищенного уровня
        }
        
        // 4. Спавн предметов и золота (без изменений)
        const itemMult = WorldCurveModule.getItemPowerMultiplier(gx, gy) * (1 + depth * 0.15);
        
        if (EntityModule.spawnItems) {
            items = EntityModule.spawnItems(
                MapModule.currentMapData,
                player,
                DataModule.ITEM_TYPES,
                4,
                itemMult,
                3
            );
        }

        const goldTemplate = DataModule.ITEM_TYPES.find(item => item.type === 'gold');
        if (goldTemplate && EntityModule.spawnGold) {
            const goldPilesCount = 2 + Math.floor(depth / 2);
            const worldGoldMult = WorldCurveModule.getGoldMultiplier ? WorldCurveModule.getGoldMultiplier(gx, gy) : 1;
            
            const goldItems = EntityModule.spawnGold(
                MapModule.currentMapData,
                player,
                goldTemplate,
                goldPilesCount,
                depth,
                worldGoldMult
            );
            items.push(...goldItems);
        }

        // === СПАВН БОССА ===
        const bossAlreadyDefeated = savedState && savedState.bossDefeated;

        if (currentDungeonTypeName === 'boss' && !bossAlreadyDefeated) {
            let bossPos = null;
            let attempts = 0;
            while (!bossPos && attempts < 100) {
                const rx = Math.floor(Math.random() * DataModule.MAP_WIDTH);
                const ry = Math.floor(Math.random() * DataModule.MAP_HEIGHT);
                
                if (!MapModule.isWall(rx, ry) && 
                    !MapModule.isWall(rx+1, ry) && 
                    !MapModule.isWall(rx, ry+1) && 
                    !MapModule.isWall(rx+1, ry+1)) {
                    
                    const distToPlayer = Math.abs(rx - player.x) + Math.abs(ry - player.y);
                    if (distToPlayer > 15) {
                        bossPos = { x: rx, y: ry };
                    }
                }
                attempts++;
            }

            if (bossPos) {
                if (typeof EntityModule.createBoss === 'function') {
                    const bossNameData = NameGeneratorModule.generateBossName(gx, gy, depth);
                    const bossEntity = EntityModule.createBoss(bossPos.x, bossPos.y, depth, bossNameData);
                    enemies.push(bossEntity);
                    RenderModule.log(`⚠️ Вы чувствуете присутствие: ${bossEntity.name}!`, "combat");
                }
            }
        } else if (bossAlreadyDefeated) {
            // Сообщение о боссе тоже можно скрыть, если оно мешает
            // RenderModule.log("💀 Логово босса пусто. Хозяин повержен навсегда.", "info");
        }
        const totalEnemies = enemies.length;
        console.log(`🕷️ [DEBUG] Уровень ${depth}: Создано врагов: ${totalEnemies}`, enemies.map(e => e.name));
        // === НОВОЕ: ОТЛАДКА ПРЕДМЕТОВ И ЗОЛОТА ===
        if (items.length > 0) {
            // Группируем предметы по типам для компактного вывода
            const itemSummary = items.reduce((acc, item) => {
                acc[item.name] = (acc[item.name] || 0) + 1;
                return acc;
            }, {});
            
            console.log(`🎒 [DEBUG] Уровень ${depth}: Сгенерировано предметов: ${items.length}`, itemSummary);
        } else {
            console.log(`🎒 [DEBUG] Уровень ${depth}: Предметы не сгенерированы.`);
        }
        
    }
     

    // === ГАРАНТИРОВАННЫЙ СПАВН КВЕСТОВОГО ПРЕДМЕТА ===
    // === ГАРАНТИРОВАННЫЙ СПАВН КВЕСТОВОГО ПРЕДМЕТА ===
// В game.js, замените функцию spawnQuestItem на эту обновленную версию:

    function spawnQuestItem(quest) {
        if (!quest || (quest.type !== 'FETCH' && quest.type !== 'COLLECT')) return;
        
        let template = null;
        let isUnique = false;

        // 1. ПРОВЕРКА НА УНИКАЛЬНЫЙ ПРЕДМЕТ (Приоритет №1)
        if (quest.target.uniqueId && typeof DataModule.UNIQUE_ITEM_TEMPLATES !== 'undefined') {
            template = DataModule.UNIQUE_ITEM_TEMPLATES.find(t => t.id === quest.target.uniqueId);
            if (template) isUnique = true;
        }
        
        // 2. ФОЛБЭК: Обычные предметы (если uniqueId нет или не найден)
        if (!template) {
            if (quest.target.itemName) {
                template = DataModule.ITEM_TYPES.find(t => t.baseName === quest.target.itemName);
            }
            if (!template && quest.target.itemType) {
                template = DataModule.ITEM_TYPES.find(t => t.type === quest.target.itemType);
            }
        }

        if (!template) {
            console.warn(`⚠️ Не удалось найти шаблон для квестового предмета: ${quest.target.itemName}`);
            return;
        }

        // 3. СОЗДАНИЕ ОБЪЕКТА ПРЕДМЕТА
        let questItem;
        if (isUnique) {
            // Ручное создание для сохранения уникальных статов и имени
            const baseTemplate = DataModule.ITEM_TYPES.find(t => t.type === template.baseType);
            const char = template.char || (baseTemplate ? baseTemplate.char : '?');
            
            // Вычисляем среднее значение стата для совместимости с UI
            const statVal = template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 
                            (template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0);

            questItem = {
                x: 0, y: 0,
                name: `${template.uniquePrefix} ${template.baseName}`,
                char: char,
                color: template.color || '#FFD700',
                type: template.baseType,
                val: statVal,
                isItem: true,
                isQuestItem: true,
                isUnique: true, // Флаг для рендера и логики
                uniqueAtk: template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0,
                uniqueDef: template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 0,
                desc: template.desc || ""
            };
        } else {
            // Стандартная процедурная генерация
            questItem = EntityModule.createItem(template, 0, 0, 1.0);
            questItem.name = `✨ ${questItem.name} (Квест)`;
            questItem.isQuestItem = true;
        }

        // 4. ПОИСК МЕСТА ДЛЯ СПАВНА (без изменений)
        let spawnPos = null;
        if (MapModule.stairsUp) {
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(MapModule.stairsUp, 5) : null;
        }
        if (!spawnPos && player) {
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(player, 3) : null;
        }
        if (!spawnPos) {
            spawnPos = MapModule.getRandomFloor ? MapModule.getRandomFloor(player) : {x: player.x+1, y: player.y};
        }

        if (spawnPos) {
            questItem.x = spawnPos.x;
            questItem.y = spawnPos.y;
            items.push(questItem);
            RenderModule.log(`🔮 Вы чувствуете присутствие артефакта "${questItem.name}" где-то рядом...`, "event");
        }
    }
    // === ГАРАНТИРОВАННЫЙ СПАВН КНИГИ ДЛЯ КВЕСТА SCHOLAR ===
    // === ГАРАНТИРОВАННЫЙ СПАВН КНИГИ ДЛЯ КВЕСТА SCHOLAR/COLLECT ===
    function spawnScholarBook(quest) {
        const bookTemplate = DataModule.ITEM_TYPES.find(t => t.type === 'book');
        if (!bookTemplate) return;

        const questBook = EntityModule.createItem(bookTemplate, 0, 0, 1.0);
        questBook.name = `✨ ${questBook.name} (Квест)`;
        questBook.isQuestItem = true;

        let spawnPos = null;
        
        // Стратегия: Ищем место рядом с игроком, но с небольшим случайным смещением,
        // чтобы несколько книг не спаунились в одной точке
        if (player) {
            // Пробуем найти место в радиусе 5 клеток от игрока
            spawnPos = MapModule.getSafePosNearby ? MapModule.getSafePosNearby(player, 5) : null;
            
            // Если не вышло или занято, пробуем чуть дальше
            if (!spawnPos || items.some(i => i.x === spawnPos.x && i.y === spawnPos.y)) {
                 spawnPos = MapModule.getRandomFloor ? MapModule.getRandomFloor(player) : null;
            }
        }

        if (spawnPos) {
            questBook.x = spawnPos.x;
            questBook.y = spawnPos.y;
            items.push(questBook);
            // Не спамим логом каждую книгу, иначе будет много текста при входе
            // RenderModule.log(`📚 Вы замечаете древний фолиант...`, "event");
        }
    }
    // === СОХРАНЕНИЕ СОСТОЯНИЯ ПРИ ПОКИДАНИИ УРОВНЯ ===
    function saveCurrentDungeonState() {
        if (gameMode === 'dungeon' && currentDepth >= 0) {
            const cacheKey = `${dungeonX}_${dungeonY}_${currentDepth}`;
            const aliveEnemies = enemies.filter(e => e.hp > 0);
            
            let bossDefeated = false;
            if (currentDungeonTypeName === 'boss') {
                const bossAlive = aliveEnemies.some(e => e.isBoss);
                bossDefeated = !bossAlive;
            }
            
            dungeonClearState.set(cacheKey, {
                enemies: aliveEnemies.length,
                bossDefeated: bossDefeated
            });
        }
    }
    function renderGlobalMap() {
        const playerPos = GlobalMapModule.getPlayerPosition();
        RenderModule.drawGlobalMap(playerPos.x, playerPos.y);
        
        // <--- ВАЖНО: Обновляем компас при каждой отрисовке глобальной карты
        updateQuestCompass();
        
        if (player) {
            const globalLocData = {
                fullName: "Глобальная карта",
                description: "Исследуйте мир, находите города и подземелья",
                themeName: "Поверхность"
            };
            RenderModule.updateUI(player, globalLocData, null);
        } else {
            document.getElementById("ui-loc-name").textContent = "Глобальная карта";
            document.getElementById("ui-stats").innerHTML = "<div class='stat-row'><span>Глобальный режим</span></div>";
            document.getElementById("ui-equip").innerHTML = "<div class='equip-slot'>─</div>";
            const invDiv = document.getElementById("inventory-list");
            if (invDiv) invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
        }
        RenderModule.drawGlobalMinimap(playerPos.x, playerPos.y);
    }


    // === ДВИЖЕНИЕ NPC И ВРАГОВ ===
    function getRandomDirection() {
        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
        return dirs[Math.floor(Math.random() * dirs.length)];
    }

    function moveNpcs() {
        if (!window.currentCityNpcs || window.currentCityNpcs.length === 0) return;
        
        const PLAYER_SPEED_THRESHOLD = 10;
        const width = DataModule.MAP_WIDTH;
        const height = DataModule.MAP_HEIGHT;

        window.currentCityNpcs.forEach(npc => {
            if (npc.speed === undefined) npc.speed = 5;
            if (npc.energy === undefined) npc.energy = Math.floor(Math.random() * npc.speed);

            npc.energy += npc.speed;

            if (npc.energy >= PLAYER_SPEED_THRESHOLD) {
                npc.energy -= PLAYER_SPEED_THRESHOLD;

                if (!npc.direction) {
                    npc.direction = getRandomDirection();
                }

                let moved = false;
                let attempts = 0;
                while (!moved && attempts < 4) {
                    const nx = npc.x + npc.direction.dx;
                    const ny = npc.y + npc.direction.dy;

                    if (nx < 0 || nx >= width || ny < 0 || ny >= height || MapModule.isWall(nx, ny)) {
                        npc.direction = getRandomDirection();
                        attempts++;
                        continue;
                    }

                    const blockedByNpc = window.currentCityNpcs.some(other => other !== npc && other.x === nx && other.y === ny);
                    const blockedByPlayer = (player.x === nx && player.y === ny);
                    const blockedByEnemy = enemies.some(e => e.hp > 0 && e.x === nx && e.y === ny);

                    if (blockedByNpc || blockedByPlayer || blockedByEnemy) {
                        npc.direction = getRandomDirection();
                        attempts++;
                        continue;
                    }

                    npc.x = nx;
                    npc.y = ny;
                    moved = true;
                }
            }
        });
    }

    function moveEnemies() {
        const PLAYER_SPEED_THRESHOLD = 10;

        enemies.forEach(e => {
            if (e.hp <= 0) return;
            
            if (e.speed === undefined) e.speed = 10; 
            if (e.energy === undefined) e.energy = Math.floor(Math.random() * e.speed);

            e.energy += e.speed;

            if (e.energy >= PLAYER_SPEED_THRESHOLD) {
                e.energy -= PLAYER_SPEED_THRESHOLD;

                const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
                const inSight = dist <= 8;

                if (e.isBoss) {
                    let nextX = e.x, nextY = e.y;

                    if (inSight) {
                        const astar = new ROT.Path.AStar(player.x, player.y, 
                            (x, y) => !MapModule.isWall(x, y), { topology: 8 });
                        
                        let next = null;
                        astar.compute(e.x, e.y, (x, y) => {
                            if (!next && (x !== e.x || y !== e.y)) next = { x, y };
                        });

                        if (next) {
                            if (next.x === player.x && next.y === player.y) {
                                CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                                checkDeath();
                                return;
                            }
                            nextX = next.x;
                            nextY = next.y;
                        }
                    } else {
                        const dirs = [{dx:0, dy:-1}, {dx:0, dy:1}, {dx:-1, dy:0}, {dx:1, dy:0}];
                        dirs.sort(() => Math.random() - 0.5);
                        
                        for (const dir of dirs) {
                            const nx = e.x + dir.dx;
                            const ny = e.y + dir.dy;
                            
                            if (!MapModule.isWall(nx, ny) && 
                                !MapModule.isWall(nx+1, ny) && 
                                !MapModule.isWall(nx, ny+1) && 
                                !MapModule.isWall(nx+1, ny+1)) {
                                
                                if ((nx === player.x && ny === player.y) || 
                                    (nx+1 === player.x && ny === player.y) ||
                                    (nx === player.x && ny+1 === player.y) ||
                                    (nx+1 === player.x && ny+1 === player.y)) {
                                    continue;
                                }
                                
                                nextX = nx;
                                nextY = ny;
                                break;
                            }
                        }
                    }

                    if (nextX !== e.x || nextY !== e.y) {
                        e.x = nextX;
                        e.y = nextY;
                    }

                } else {
                    const aggroRange = e.aggroOverride || 8;
                    if (dist < aggroRange) {
                        if (dist === 1) {
                            CombatModule.attack(e, player, (m, t) => RenderModule.log(m, t));
                            checkDeath();
                        } else {
                            const astar = new ROT.Path.AStar(player.x, player.y,
                                (x, y) => !MapModule.isWall(x, y), { topology: 8 });
                            let next = null;
                            astar.compute(e.x, e.y, (x, y) => {
                                if (!next && (x !== e.x || y !== e.y)) next = { x, y };
                            });
                            if (next) {
                                const isBlockedByNpc = window.currentCityNpcs && window.currentCityNpcs.some(n => n.x === next.x && n.y === next.y);
                                const isBlockedByEnemy = enemies.some(other => other !== e && other.hp > 0 && other.x === next.x && other.y === next.y);
                                if (!isBlockedByNpc && !isBlockedByEnemy) {
                                    e.x = next.x;
                                    e.y = next.y;
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    
    // === СИСТЕМА ПРОКАЧКИ ===
    function gainXp(amount) {
        player.xp += amount;
        const xpNeeded = player.level * 50;
        if (player.xp >= xpNeeded) {
            player.level++;
            player.xp -= xpNeeded;
            player.maxHp = WorldCurveModule.getPlayerBaseHP(player.level);
            player.hp = player.maxHp;
        
            // Пересчёт с учётом бонусов
            const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
            const baseDef = WorldCurveModule.getPlayerBaseDef(player.level);
            player.atk = baseAtk + player.bonusAtk;
            player.def = baseDef + player.bonusDef;
        
            // Защита от отрицательных (на всякий случай)
            if (player.atk < 1) player.atk = 1;
            if (player.def < 0) player.def = 0;
        
            RenderModule.log(`🎉 УРОВЕНЬ ПОВЫШЕН!`, "event");
            RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        }
    }

    // === ПРОВЕРКА СМЕРТИ ВРАГОВ (Финальная версия) ===
    // === ПРОВЕРКА СМЕРТИ ВРАГОВ (Финальная версия) ===
    // === ПРОВЕРКА СМЕРТИ ВРАГОВ (Финальная версия) ===
    function checkDeath() {
        const deadEnemies = enemies.filter(e => e.hp <= 0);
        
        deadEnemies.forEach(enemy => {
            // 1. Выпадение лута
            CombatModule.dropLoot(enemy, currentDepth, items, RenderModule.log);
            
            // 2. Начисление опыта
            gainXp(10 + (currentDepth * 5));

            // 3. Проверка квестов
            // 3. Проверка квестов
            if (typeof QuestSystemModule !== 'undefined') {
                [...activeQuests].forEach(q => {
                    
                    // >>> СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ СЮЖЕТНОГО BOUNTY <<<
                    if (q.isChainQuest && q.type === 'BOUNTY' && !q.isCompleted) {
                        if (enemy.name === q.target.enemyName) {
                            q.progress++;
                            RenderModule.log(`🏹 Охота: ${q.target.enemyName} (${q.progress}/${q.maxProgress})`, "info");
                            
                            // >>> ДОБАВИТЬ ЭТУ СТРОКУ ДЛЯ ОБНОВЛЕНИЯ ФУТЕРА <<<
                            RenderModule.updateQuestBriefing(q); 
                            
                            if (q.progress >= q.maxProgress) {
                                q.isCompleted = true;
                                RenderModule.log(`🏆 Сюжетная охота завершена! Вернитесь в город за наградой.`, "event");
                                updateQuestCompass();
                            }
                            return; // Прерываем итерацию для этого квеста
                        }
                    }

                    // Стандартная проверка для остальных квестов
                    const eventData = {
                        type: 'kill',
                        enemyName: enemy.name,
                        locX: dungeonX,
                        locY: dungeonY
                    };

                    const progressUpdated = QuestSystemModule.checkProgress(q, eventData);

                    if (progressUpdated && q.isCompleted) {
                        updateQuestCompass(); 
                    }
                });
            }
        });

        // Удаляем мертвых врагов из основного массива
        enemies = enemies.filter(e => e.hp > 0);
    }

    // === ОБРАБОТКА КЛИКА ПО КАРТЕ (ОСМОТР) ===
    function handleMapClick(clientX, clientY) {
        if (gameMode !== 'dungeon' || !player) return;

        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // Преобразуем экранные координаты в координаты канваса
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // Получаем смещение камеры от RenderModule
        const cam = RenderModule.getCameraOffset(player);
        
        // Вычисляем мировые координаты клетки, по которой кликнули
        const tileSize = RenderModule.TILE_SIZE || 32; 
        const worldX = Math.floor(clickX / tileSize) + cam.x;
        const worldY = Math.floor(clickY / tileSize) + cam.y;

        // Проверяем границы карты
        if (worldX < 0 || worldX >= DataModule.MAP_WIDTH || worldY < 0 || worldY >= DataModule.MAP_HEIGHT) {
            return;
        }

        // 1. Проверяем врагов
        const enemy = enemies.find(e => e.hp > 0 && e.x === worldX && e.y === worldY);
        if (enemy) {
            let details = `HP: ${enemy.hp}/${enemy.maxHp}\nАтака: ${enemy.atk}\nЗащита: ${enemy.def}`;
            if (enemy.isBoss) details += "\n⚠️ БОСС";
            RenderModule.updateInspector(enemy.name, details, "enemy");
            return;
        }

        // 2. Проверяем предметы
        const item = items.find(i => i.x === worldX && i.y === worldY);
        if (item) {
            let details = `Тип: ${item.type}`;
            if (item.val) details += `\nХарактеристика: +${item.val}`;
            if (item.effect) details += `\nЭффект: ${item.effect}`;
            if (item.isQuestItem) details += "\n📜 Квестовый предмет";
            RenderModule.updateInspector(item.name, details, "loot");
            return;
        }

        // 3. Проверяем NPC (если мы в городе)
        if (window.currentCityNpcs) {
            const npc = window.currentCityNpcs.find(n => n.x === worldX && n.y === worldY);
            if (npc) {
                let details = npc.dialog;
                if (npc.isQuestGiver) details += "\n📜 Может дать задание";
                RenderModule.updateInspector(npc.name, details, "npc");
                return;
            }
        }

        // 4. Проверяем стены/пол
        if (MapModule.isWall(worldX, worldY)) {
            RenderModule.updateInspector("Стена", "Непроходимое препятствие.", "neutral");
        } else {
             if (MapModule.stairsUp && MapModule.stairsUp.x === worldX && MapModule.stairsUp.y === worldY) {
                RenderModule.updateInspector("Лестница вверх", "Ведет на предыдущий уровень или на поверхность.", "neutral");
            } else if (MapModule.stairsDown && MapModule.stairsDown.x === worldX && MapModule.stairsDown.y === worldY) {
                RenderModule.updateInspector("Лестница вниз", "Ведет глубже в подземелье.", "neutral");
            }
        }
    }
    
    // === ОСНОВНОЙ ХОД ИГРЫ (ПОЛНАЯ ВЕРСИЯ) ===
    function processTurn(dx, dy) {
        // БЛОКИРОВКА: Если игрок мертв, ничего не делаем
        if (player.hp <= 0) return; 

        const nx = player.x + dx;
        const ny = player.y + dy;

        // Пропуск хода
        if (dx === 0 && dy === 0) {
            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return;
        }

        // Проверка стен
        if (MapModule.isWall(nx, ny)) return;

        // === ПРОВЕРКА ВХОДА В МАГАЗИН ===
        if (window.currentShopCoords && window.currentShopCoords.length > 0) {
            const isTargetShop = window.currentShopCoords.some(pos => pos.x === nx && pos.y === ny);
            if (isTargetShop && !isShopOpen) {
                openShop();
                return; 
            }
        }

        // === ПРОВЕРКА ВХОДА В ПОСТОЯЛЫЙ ДВОР (НОВОЕ) ===
        if (window.currentInnCoords && window.currentInnCoords.length > 0) {
            const isTargetInn = window.currentInnCoords.some(pos => pos.x === nx && pos.y === ny);
            if (isTargetInn && !isInnOpen) {
                openInn();
                return; 
            }
        }
        
        // Проверка столкновения с боссом (учитываем его размер 2x2)
        const bossInWay = enemies.find(e => e.isBoss && e.hp > 0 && (
            (nx === e.x && ny === e.y) || 
            (nx === e.x + 1 && ny === e.y) || 
            (nx === e.x && ny === e.y + 1) || 
            (nx === e.x + 1 && ny === e.y + 1)
        ));
        
        if (bossInWay) {
            CombatModule.attack(player, bossInWay, (m, t) => RenderModule.log(m, t));
            checkDeath();
            // ВАЖНО: Если после атаки игрок умер, прерываем ход
            if (player.hp <= 0) {
                RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
                renderFrame();
                return;
            }
            moveNpcs();
            moveEnemies();
            renderFrame();
            return;
        }

        // Атака обычного врага
        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            CombatModule.attack(player, enemy, (m, t) => RenderModule.log(m, t));
            checkDeath();
            // ВАЖНО: Если после атаки игрок умер, прерываем ход
            if (player.hp <= 0) {
                RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
                renderFrame();
                return;
            }
            moveNpcs();
            moveEnemies();
            renderFrame();
            return;
        }

        // Взаимодействие с NPC
        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === nx && n.y === ny) : null;
        if (npc) {
            // === НОВОЕ: Проверка на особое действие (например, запуск Twine-квеста) ===
            if (npc.action) {
                npc.action(); // Вызываем функцию действия
                return;       // Прерываем ход, чтобы не двигаться в клетку NPC
            }

            let questHandled = false;
            if (npc.isQuestGiver) {
                questHandled = tryGiveQuest(npc);
            }

             if (!questHandled) {
                RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            }
            
            // === ИСПРАВЛЕНИЕ: Если открылось окно квеста, не затираем его отрисовкой карты ===
            if (isReadingQuest) {
                return; // Прерываем ход, окно квеста уже на экране
            }

            moveNpcs(); 
            moveEnemies();
            renderFrame();
            return; 
        }

        // Движение игрока
        player.x = nx;
        player.y = ny;

        // Подбор предметов
        const itemIdx = items.findIndex(i => i.x === nx && i.y === ny);
        if (itemIdx !== -1) {
            const item = items[itemIdx];
        
            if (item.type === 'gold') {
                player.gold += item.val;
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
            } 
            else if (item.type === 'book') {
                if (typeof LoreModule !== 'undefined') {
                    const fragment = LoreModule.getNextFragment();
                    RenderModule.log(`📖 Вы нашли "${item.name}". Внутри написано:`, "info");
                    RenderModule.log(fragment, "event");
                    
                    if (typeof QuestSystemModule !== 'undefined') {
                        activeQuests.forEach(q => {
                            QuestSystemModule.checkProgress(q, { type: 'read_book' });
                        });
                    }
                } else {
                    RenderModule.log(`Вы нашли "${item.name}", но не можете прочитать.`, "info");
                }
            }  
            else {
                player.inventory.push(item);
                RenderModule.log(`Подобрано: ${item.name}`, "loot");
                
                // Проверка квестов на подбор
                if (typeof QuestSystemModule !== 'undefined') {
                    [...activeQuests].forEach(q => {
                        if (q.isCompleted) return;
                        if (q.type === 'FETCH' || q.type === 'COLLECT') {
                            let isMatch = false;
                            if (q.target.uniqueId && item.uniqueId === q.target.uniqueId) {
                                isMatch = true;
                            } else if ((item.type === q.target.itemType) && 
                                     (!q.target.itemName || item.name.includes(q.target.itemName))) {
                                isMatch = true;
                            }

                            if (isMatch) {
                                item.isQuestItem = true;
                                if (q.type === 'FETCH') {
                                    q.progress = q.maxProgress;
                                    q.isCompleted = true;
                                    RenderModule.updateQuestBriefing(q);
                                    RenderModule.log(`📦 Это тот самый предмет!`, "info");
                                } else if (q.type === 'COLLECT') {
                                    QuestSystemModule.checkProgress(q, { 
                                        type: 'pickup', 
                                        itemType: item.type,
                                        itemName: item.name,
                                        uniqueId: item.uniqueId,
                                        locX: dungeonX,
                                        locY: dungeonY
                                    });
                                    RenderModule.log(`📦 Подобрано для квеста: ${item.name} (${q.progress}/${q.maxProgress})`, "info");
                                }
                                updateQuestCompass();
                            }
                        }
                    });
                }
            }
            items.splice(itemIdx, 1);
        }

        // Лестницы
        if (MapModule.stairsDown && nx === MapModule.stairsDown.x && ny === MapModule.stairsDown.y) {
            const nextDepth = currentDepth + 1;
            RenderModule.log(`Вы спускаетесь на уровень ${nextDepth + 1}...`, "info");
            loadDungeonLevel(dungeonX, dungeonY, nextDepth, currentDungeonTypeName, currentDungeonFullName, 'down');
            return; 
        }

        if (MapModule.stairsUp && nx === MapModule.stairsUp.x && ny === MapModule.stairsUp.y) {
            if (currentDepth === 0) {
                RenderModule.log("Вы поднимаетесь на поверхность...", "info");
                exitToGlobal();
            } else {
                const prevDepth = currentDepth - 1;
                RenderModule.log(`Вы поднимаетесь на уровень ${prevDepth + 1}...`, "info");
                loadDungeonLevel(dungeonX, dungeonY, prevDepth, currentDungeonTypeName, currentDungeonFullName, 'up');
            }
            return; 
        }

        // Ход врагов в конце хода игрока
        if (player.hp > 0) {
            moveNpcs();
            moveEnemies();
        }

        if (player.hp <= 0) {
            RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
        }


        // === НОВОЕ: Обработка временных эффектов игрока ===
        if (player.hp > 0) {
            EffectSystemModule.processEffects(player, RenderModule.log);
            // Если эффекты изменились (например, закончились), пересчитываем статы
            // (recalculateStats вызывается внутри processEffects при удалении, 
            // но можно вызвать явно для надежности, если были DoT/HoT)
            EffectSystemModule.recalculateStats(player);
        }

        if (player.hp <= 0) {
            RenderModule.log("ВЫ ПОГИБЛИ. F5 для рестарта.", "combat");
        }
    
        
        renderFrame();
    }

    // === ОТРИСОВКА КАДРА (Исправленная renderFrame) ===
    function renderFrame() {
        if (!player) return;
        
        // Стандартная отрисовка подземелья/города
        const vis = RenderModule.draw(player, enemies, items, npcs);
        vis.forEach(k => explored.add(k));
        
        // Обновление UI панелей
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
        RenderModule.drawMinimap(player, explored);

        // === НОВОЕ: Если открыт постоялый двор, рисуем его поверх всего ===
        if (isInnOpen && typeof RenderModule.drawInnWindow === 'function') {
            RenderModule.drawInnWindow(player.gold, player.stamina, player.maxStamina);
        }
    }
    
    function getPlayer() {
        return player;
    }

    function getActiveQuests() {
        return activeQuests;
    }

    // >>> ДОБАВИТЬ ЭТУ ФУНКЦИЮ <<<
    function getCompletedQuestIds() {
        return completedQuestIds;
    }

    // === ОТКАЗ ОТ КВЕСТА ===
    // === УПРАВЛЕНИЕ ВИДИМОСТЬЮ КНОПКИ ОТКАЗА ===
    function updateAbandonButton(hasActiveQuest) {
        const btn = document.getElementById("btn-abandon-quest");
        if (btn) {
            btn.style.display = hasActiveQuest ? "block" : "none";
        }
    }

    // === ОТКАЗ ОТ КВЕСТА ===
    function abandonCurrentQuest() {
        if (activeQuests.length === 0) return;

        const quest = activeQuests[0];
        
        RenderModule.log("После долгих раздумий герой отрекся от задания.", "info");
        
        activeQuests = []; 
        
        RenderModule.updateQuestBriefing(null);
        updateQuestCompass();
        updateAbandonButton(false); // Скрываем кнопку
        
        if (typeof RenderModule.updateInspector === 'function') {
            RenderModule.updateInspector("Квест отменен", "Герой сменил свои планы.", "neutral");
        }
    }

    // === ПАМЯТЬ ТЕКСТОВЫХ КВЕСТОВ ===
    // Хранит имена файлов (например, 'Quack of Duckness.html'), которые игрок уже завершил
    //let completedTextQuests = []; 

    // === СИСТЕМА TWINE КВЕСТОВ ===

    function openTwineQuest(url) {
        if (isTwineActive) return;
    
        isTwineActive = true;
    
        // 1. Создаем контейнер-затемнение
        const overlay = document.createElement('div');
        overlay.id = 'twine-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        `;

        // 2. Создаем Iframe
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = `
            width: 90%; height: 90%; border: 2px solid #58a6ff;
            background: #fff; border-radius: 8px;
        `;
    
        // 3. Кнопка принудительного выхода (крестик)
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&#10006;'; // Символ крестика
        closeBtn.style.cssText = `
            position: absolute; top: 20px; right: 20px;
            background: #da3633; color: white; border: none;
            width: 40px; height: 40px; border-radius: 50%;
            font-size: 20px; cursor: pointer; z-index: 10001;
        `;
    
        // Обработчик закрытия без награды
        closeBtn.onclick = () => closeTwineQuest(false, url);
    
        overlay.appendChild(iframe);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        // 4. Слушатель сообщений от Iframe
        const messageHandler = (event) => {
            // Проверка типа сообщения
            if (event.data && event.data.type === 'TWINE_QUEST_COMPLETE') {
                console.log("Квест завершен! Данные:", event.data.payload);
                applyTwineReward(event.data.payload);
                closeTwineQuest(true, url); // Передаем URL для запоминания
            }
        };
    
        window.addEventListener('message', messageHandler);
        // Сохраняем ссылку на обработчик, чтобы удалить его потом
        overlay._msgHandler = messageHandler;
    }

    function closeTwineQuest(success, url) {
        const overlay = document.getElementById('twine-overlay');
        if (!overlay) return;

        // Удаляем слушатель событий
        if (overlay._msgHandler) {
            window.removeEventListener('message', overlay._msgHandler);
        }

        overlay.remove();
        isTwineActive = false;

        // === ЛОГИКА ОТМЕТКИ ПРОЙДЕННОГО КВЕСТА ===
        if (success && url) {
            // Для Set используем .add(), он сам проверяет уникальность
            completedTextQuests.add(url); 
            RenderModule.log(`📜 История "${url}" завершена и сохранена в памяти.`, "info");
        }

        // Возвращаем фокус и перерисовываем интерфейс
        if (typeof RenderModule !== 'undefined') {
            RenderModule.requestRedraw();
            RenderModule.log(success ? "Вы вернулись из приключения." : "Вы прервали приключение.", "info");
        }
    }

    function applyTwineReward(data) {
        if (!player) return;
    
        // Пример обработки награды из Twine
        if (data.gold) {
            player.gold += parseInt(data.gold);
            RenderModule.log(`💰 Получено золото: ${data.gold}`, "loot");
        }
    
        // Здесь можно добавить логику выдачи предметов, если Twine передает их ID
        // if (data.itemId) { ... }

        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
    }

    // === ПРОВЕРКА: БЫЛ ЛИ КВЕСТ УЖЕ ПРОЙДЕН? ===
    function isTextQuestCompleted(filename) {
        // Используем .has() для Set вместо .includes() для Array
        return completedTextQuests.has(filename);
    }

    
    return {
        init,
        getPlayer,
        getActiveQuests,
        getCompletedQuestIds,
        abandonCurrentQuest,
        openTwineQuest, 
        isTextQuestCompleted, // <--- ЭКСПОРТИРУЕМ НОВУЮ ФУНКЦИЮ
        exitToGlobal 
    };
})();

window.onload = async () => {
    await GameModule.init();
};
 
``` 
 
### globalMap.js 
 
```js 
 
/**
 * МОДУЛЬ ГЛОБАЛЬНОЙ КАРТЫ (globalMap.js)
 * Бесконечная карта, разбитая на чанки.
 */

// === ВАЖНО: ОЧИСТКА КЭША ПРИ ПЕРЕЗАГРУЗКЕ СКРИПТА ===
// Это гарантирует, что старые "багованные" чанки не будут использоваться
const chunkCache = new Map(); 

// Конфигурация
const GLOBAL_CONFIG = {
    CHUNK_SIZE: 50,          
    WORLD_SEED: 193460752,       
    CITY_DENSITY: 0.010,      
    DUNGEON_DENSITY: 0.01,   
    ROAD_CONNECT_RADIUS: 40  
};

// Текущая позиция игрока
let playerGlobalX = 0;
let playerGlobalY = 0;

// === Вспомогательные функции ===

function getChunkRandom(cx, cy) {
    const seed = GLOBAL_CONFIG.WORLD_SEED + cx * 1000003 + cy * 1000033;
    return new SeededRandom(seed);
}

// Генерация ландшафта
function generateTerrain(rand, width, height) {
    const tiles = Array(height).fill().map(() => Array(width).fill('plain'));
    
    // 1. Горы
    const mountainCount = rand.int(5, 15);
    for (let i = 0; i < mountainCount; i++) {
        const mx = rand.int(0, width-1);
        const my = rand.int(0, height-1);
        const radius = rand.int(1, 3);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = mx+dx, y = my+dy;
                if (x >= 0 && x < width && y >= 0 && y < height && Math.abs(dx)+Math.abs(dy) <= radius) {
                    // Горы не стирают города, но города еще не созданы, так что это просто земля
                    tiles[y][x] = 'mountain';
                }
            }
        }
    }
    
    // 2. Леса (кластерами)
    const forestClusterCount = rand.int(20, 40); 
    for (let i = 0; i < forestClusterCount; i++) {
        const fx = rand.int(0, width-1);
        const fy = rand.int(0, height-1);
        const radius = rand.int(1, 3); 

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = fx + dx;
                const y = fy + dy;
                
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    // Лес растет только на равнинах (не на горах)
                    if (tiles[y][x] === 'plain') {
                        if (rand.next() < 0.8) {
                            tiles[y][x] = 'forest';
                        }
                    }
                }
            }
        }
    }
     
    // 3. Реки
    const riverCount = rand.int(1, 3);
    for (let r = 0; r < riverCount; r++) {
        let x = rand.int(0, width-1);
        let y = rand.int(0, height-1);
        for (let step = 0; step < 30; step++) {
            if (x >= 0 && x < width && y >= 0 && y < height) {
                // Река НЕ может быть там, где уже есть горы
                if (tiles[y][x] !== 'mountain') {
                    tiles[y][x] = 'water';
                }
            }
            const dir = rand.int(0, 3);
            if (dir === 0) x++;
            else if (dir === 1) x--;
            else if (dir === 2) y++;
            else y--;
        }
    }
    return tiles;
}

// Генерация точек интереса (ИСПРАВЛЕННАЯ ВЕРСИЯ)
function generatePOIs(rand, cx, cy, tiles) {
    const pois = [];
    const width = GLOBAL_CONFIG.CHUNK_SIZE;
    const height = GLOBAL_CONFIG.CHUNK_SIZE;
    
    const MIN_POI_DISTANCE = 7; 

    const isTooClose = (localX, localY) => {
        const globalX = cx * width + localX;
        const globalY = cy * height + localY;
        for (const p of pois) {
            const dist = Math.abs(p.x - globalX) + Math.abs(p.y - globalY);
            if (dist < MIN_POI_DISTANCE) return true;
        }
        return false;
    };
    
    // 1. Города
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentTile = tiles[y][x];
            
            // 🛠️ ЖЕСТКАЯ ПРОВЕРКА: Только равнина или лес. Никакой воды, гор или дорог.
            const isValidCityTerrain = (currentTile === 'plain' || currentTile === 'forest');

            if (isValidCityTerrain && rand.next() < GLOBAL_CONFIG.CITY_DENSITY) {
                
                if (isTooClose(x, y)) continue;

                // Ставим город
                tiles[y][x] = 'city';
                const globalX = cx * width + x;
                const globalY = cy * height + y;
                const cityName = NameGeneratorModule.generateCityName(globalX, globalY);
                
                pois.push({ x: globalX, y: globalY, type: 'city', name: cityName });
            }
        }
    }
    
    // 2. Входы в подземелья
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentTile = tiles[y][x];
            
            // 🛠️ ПРОВЕРКА: Равнина, лес или дорога. Не вода, не горы, не город.
            const isValidTerrain = (currentTile === 'plain' || currentTile === 'forest' || currentTile === 'road');
            
            if (isValidTerrain && rand.next() < GLOBAL_CONFIG.DUNGEON_DENSITY) {
                if (currentTile !== 'city') {
                    
                    if (isTooClose(x, y)) continue;

                    tiles[y][x] = 'dungeon_entrance';
                    const globalX = cx * width + x;
                    const globalY = cy * height + y;
                    
                    const dungeonType = DungeonGeneratorModule.getRandomDungeonType(rand).name;
                    const { fullName } = NameGeneratorModule.generateLocationData(globalX, globalY, dungeonType);
                    pois.push({ x: globalX, y: globalY, type: 'dungeon', dungeonType: dungeonType, name: fullName });
                }
            }
        }
    }
    return pois;
}

// Построение дорог
function connectPOIsWithRoads(tiles, poisLocal, rand) {
    if (poisLocal.length < 2) return;
    
    const edges = [];
    for (let i = 0; i < poisLocal.length; i++) {
        let closest = null;
        let minDist = Infinity;
        for (let j = 0; j < poisLocal.length; j++) {
            if (i === j) continue;
            const dist = Math.abs(poisLocal[i].x - poisLocal[j].x) + Math.abs(poisLocal[i].y - poisLocal[j].y);
            if (dist < minDist) {
                minDist = dist;
                closest = j;
            }
        }
        if (closest !== null) {
            edges.push([i, closest]);
        }
    }
    
    const uniqueEdges = [];
    for (const [a,b] of edges) {
        if (!uniqueEdges.some(e => (e[0]===a && e[1]===b) || (e[0]===b && e[1]===a))) {
            uniqueEdges.push([a,b]);
        }
    }
    
    for (const [i,j] of uniqueEdges) {
        const p1 = poisLocal[i];
        const p2 = poisLocal[j];
        
        const stepX = p1.x <= p2.x ? 1 : -1;
        for (let x = p1.x; stepX > 0 ? x <= p2.x : x >= p2.x; x += stepX) {
            if (x >= 0 && x < tiles[0].length && p1.y >= 0 && p1.y < tiles.length) {
                // Дороги не строятся через горы и воду
                if (tiles[p1.y][x] !== 'mountain' && tiles[p1.y][x] !== 'water') {
                    tiles[p1.y][x] = 'road';
                }
            }
        }
        const stepY = p1.y <= p2.y ? 1 : -1;
        for (let y = p1.y; stepY > 0 ? y <= p2.y : y >= p2.y; y += stepY) {
            if (y >= 0 && y < tiles.length && p2.x >= 0 && p2.x < tiles[0].length) {
                if (tiles[y][p2.x] !== 'mountain' && tiles[y][p2.x] !== 'water') {
                    tiles[y][p2.x] = 'road';
                }
            }
        }
    }
}

// Генерация целого чанка
function generateChunk(cx, cy) {
    const rand = getChunkRandom(cx, cy);
    // 1. Сначала ландшафт (горы, леса, реки)
    const tiles = generateTerrain(rand, GLOBAL_CONFIG.CHUNK_SIZE, GLOBAL_CONFIG.CHUNK_SIZE);
    // 2. Потом POI (города, подземелья) - они видят готовый ландшафт
    const pois = generatePOIs(rand, cx, cy, tiles);
    
    const poisLocal = pois.map(p => ({ 
        x: p.x - cx * GLOBAL_CONFIG.CHUNK_SIZE, 
        y: p.y - cy * GLOBAL_CONFIG.CHUNK_SIZE 
    }));
    connectPOIsWithRoads(tiles, poisLocal, rand);
    
    return { tiles, pois };
}

// Получить чанк по глобальной клетке
function getChunkForCell(globalX, globalY) {
    const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
    const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
    const key = `${cx},${cy}`;
    
    // Если чанка нет в кэше, генерируем новый
    if (!chunkCache.has(key)) {
        chunkCache.set(key, generateChunk(cx, cy));
    }
    return chunkCache.get(key);
}

// === НОВАЯ ФУНКЦИЯ: поиск безопасной стартовой позиции ===
function findSafeStartPosition(startX, startY, radius = 3) {
    for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const testX = startX + dx;
                const testY = startY + dy;
                
                if (GlobalMapModule.isWalkable(testX, testY)) {
                    let obstacleCount = 0;
                    for (let ny = -1; ny <= 1; ny++) {
                        for (let nx = -1; nx <= 1; nx++) {
                            if (!GlobalMapModule.isWalkable(testX + nx, testY + ny)) {
                                obstacleCount++;
                            }
                        }
                    }
                    if (obstacleCount <= 4) {
                        return { x: testX, y: testY };
                    }
                }
            }
        }
    }
    return { x: startX, y: startY };
}

// === Публичный API ===

const GlobalMapModule = {
    getTileType(globalX, globalY) {
        const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
        const chunk = getChunkForCell(globalX, globalY);
        const localX = globalX - cx * GLOBAL_CONFIG.CHUNK_SIZE;
        const localY = globalY - cy * GLOBAL_CONFIG.CHUNK_SIZE;
        if (localY >= 0 && localY < chunk.tiles.length && localX >= 0 && localX < chunk.tiles[0].length) {
            return chunk.tiles[localY][localX];
        }
        return 'plain';
    },

    getDisplayTileType(globalX, globalY) {
        const poi = this.getPOI(globalX, globalY);
        if (poi) {
            return poi.type === 'city' ? 'city' : 'dungeon_entrance';
        }
        return this.getTileType(globalX, globalY);
    },
    
    isWalkable(globalX, globalY) {
        const type = this.getTileType(globalX, globalY);
        return type !== 'mountain' && type !== 'water';
    },

    getPOI(globalX, globalY) {
        const chunk = getChunkForCell(globalX, globalY);
        if (!chunk || !chunk.pois) return null;
        return chunk.pois.find(p => p.x === globalX && p.y === globalY);
    },
    
    tryMove(dx, dy) {
        const newX = playerGlobalX + dx;
        const newY = playerGlobalY + dy;
        if (this.isWalkable(newX, newY)) {
            playerGlobalX = newX;
            playerGlobalY = newY;
            return true;
        }
        return false;
    },
    
    getPlayerPosition() {
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    setPlayerPosition(x, y) {
        playerGlobalX = x;
        playerGlobalY = y;
    },
    
    initSafeStart(startX, startY, radius = 3) {
        const safePos = findSafeStartPosition(startX, startY, radius);
        playerGlobalX = safePos.x;
        playerGlobalY = safePos.y;
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    getChunkSize() { 
        return GLOBAL_CONFIG.CHUNK_SIZE; 
    },
    
    getConfig() {
        return GLOBAL_CONFIG;
    }
};
 
``` 
 
### index.html 
 
```html 
 
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Roguelike: Подземелье Координат</title>
    
    <!-- Скрипты -->
    <script src="rot.min.js"></script>
    <script src="seedrandom.min.js"></script>
    <script src="sprite_registry.js"></script>
    <script src="name_generator.js"></script>
    <script src="worldCurve.js"></script>
    <script src="dungeon_generator.js"></script>
    <script src="data.js"></script>
    <script src="entity.js"></script>
    <script src="map.js"></script>
    <script src="effect_system.js"></script>    
    <script src="combat.js"></script>
    <script src="globalMap.js"></script>
    <script src="tileset_renderer.js"></script> 
    <script src="render.js"></script>
    <script src="npc_generator.js"></script>
    <script src="lore.js"></script>
    <script src="quest_system.js"></script>
    <script src="quest_chain.js"></script>
    <script src="game.js"></script>

<style>
    :root {
        --bg-overlay: rgba(13, 17, 23, 0.88);
        --border-color: rgba(48, 54, 61, 0.6);
        --text-main: #c9d1d9;
        --text-dim: #8b949e;
        --accent: #58a6ff;
        --danger: #f85149;
        --gold: #d29922;
        --font-stack: 'Consolas', 'Monaco', monospace;
    }

    body {
        background-color: #000;
        color: var(--text-main);
        font-family: var(--font-stack);
        margin: 0;
        height: 100dvh;
        height: 100vh;
        width: 100%;
        overflow: hidden;
        overflow-x: hidden;
        position: relative;
        user-select: none;
        -webkit-user-select: none;
        -webkit-transform: translate3d(0, 0, 0);
        transform: translate3d(0, 0, 0);
    }

    #map-container {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 0; display: flex; justify-content: center; align-items: center;
    }
    #map-container canvas { display: block; image-rendering: pixelated; -ms-interpolation-mode: nearest-neighbor;}

    .ui-panel {
        position: absolute;
        background: var(--bg-overlay);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 6px;
        z-index: 10;
        pointer-events: auto;
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        opacity: 0;
        animation: fadeInUI 0.3s ease-out forwards;
        transform: translate3d(0, 0, 0);
        will-change: opacity, transform;
    }

    @keyframes fadeInUI {
        from { opacity: 0; transform: translate3d(0, 0, 0) scale(0.98); }
        to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }

    #header-panel { animation-delay: 0.05s; }
    #stats-panel { animation-delay: 0.1s; }
    #inventory-panel { animation-delay: 0.15s; }
    #inspector-panel { animation-delay: 0.2s; }
    #minimap-panel { animation-delay: 0.25s; }
    #log-panel { animation-delay: 0.3s; }
    #quest-bar { animation-delay: 0.35s; }

    h3 {
        margin: 0 0 4px 0;
        font-size: 11px;
        text-transform: uppercase;
        color: var(--text-dim);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 3px;
        letter-spacing: 0.5px;
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* ========================================= */
    /* === ВЕРХНЯЯ ПАНЕЛЬ (ЛОКАЦИЯ) === */
    /* ========================================= */
    #header-panel {
        top: 8px;
        /* Подстроено под новые ширины stats (160px) и inventory (190px) */
        left: calc(160px + 8px + 15px);
        right: calc(190px + 8px + 15px);
        text-align: center;
        padding: 4px 12px;
        z-index: 20;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .loc-name { color: var(--accent); font-weight: bold; font-size: 13px; line-height: 1.3; }
    .loc-coords { color: var(--text-dim); font-size: 12px; margin-top: 2px; }

    /* ========================================= */
    /* === ЛЕВАЯ ВЕРХНЯЯ (Статы) === */
    /* ========================================= */
    #stats-panel {
        top: 8px;
        left: 8px;
        width: 160px; /* было 110px */
    }
    .stat-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 12px; /* было 10px */
        line-height: 1.3;
    }
    .val-hp { color: var(--danger); }
    .val-atk { color: var(--gold); }
    .val-def { color: var(--accent); }

    .equip-slot {
        font-size: 11px; /* было 9px */
        margin-bottom: 2px;
        color: #aaa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .equip-item { color: var(--gold); }

    /* ========================================= */
    /* === ПРАВАЯ ВЕРХНЯЯ (Инвентарь) === */
    /* ========================================= */
    #inventory-panel {
        top: 8px;
        right: 8px;
        width: 190px; /* было 130px */
        max-height: 45vh;
        display: flex;
        flex-direction: column;
    }
    #inventory-list {
        overflow-y: auto;
        flex: 1;
        font-size: 12px; /* было 10px */
        margin-bottom: 2px;
    }
    .inv-item {
        padding: 3px 4px;
        background: rgba(255,255,255,0.05);
        margin-bottom: 2px;
        cursor: pointer;
        border-radius: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px; /* было 10px */
    }
    .inv-item:hover {
        background: rgba(255,255,255,0.12);
    }

    /* ========================================= */
    /* === НИЖНЯЯ ЛЕВАЯ (Миникарта) === */
    /* ========================================= */
    #minimap-panel {
        bottom: 8px;
        left: 8px;
        width: 150px; /* было 100px */
        height: 150px; /* было 100px */
        display: flex;
        flex-direction: column;
    }
    #minimap {
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        border-radius: 2px;
        image-rendering: pixelated;
    }

    /* ========================================= */
    /* === ИНСПЕКТОР (над миникартой) === */
    /* ========================================= */
    #inspector-panel {
        /* bottom = высота миникарты (150) + отступ (8) + margin (4) */
        bottom: 166px; /* было 110px */
        left: 8px;
        width: 150px; /* было 100px */
        max-height: 180px; /* было 120px */
        overflow-y: auto;
        font-size: 11px; /* было 9px */
    }
    #ui-inspector {
        font-size: 11px;
        color: var(--text-dim);
        line-height: 1.2;
    }

    /* ========================================= */
    /* === НИЖНЯЯ ПРАВАЯ (Лог событий) === */
    /* ========================================= */
    #log-panel {
        bottom: 8px;
        right: 8px;
        width: 280px; /* было 180px */
        height: 180px; /* было 100px */
        display: flex;
        flex-direction: column;
    }
    #log-list {
        overflow-y: auto;
        flex: 1;
        font-size: 11px; /* было 9px */
        line-height: 1.25;
        justify-content: flex-end;
        scroll-behavior: smooth;
    }
    .log-msg {
        margin-bottom: 2px;
        word-wrap: break-word;
        opacity: 0.9;
    }
    .log-combat { color: var(--danger); }
    .log-loot { color: var(--gold); }
    .log-info { color: var(--accent); }
    .log-lore {
        color: #d2b48c;
        font-style: italic;
        border-left: 2px solid #8b7355;
        padding-left: 4px;
        background: rgba(139, 115, 85, 0.1);
        margin-top: 2px;
    }

    /* ========================================= */
    /* === НИЖНЯЯ ЦЕНТРАЛЬНАЯ (Квесты) === */
    /* ========================================= */
    #quest-bar {
        bottom: 8px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 16px;
        max-width: 65%; /* было 50% */
    }
    #ui-quest-briefing {
        color: var(--gold);
        font-weight: bold;
        font-size: 12px; /* было 10px */
        white-space: normal; /* было nowrap — теперь текст переносится */
        word-wrap: break-word;
        line-height: 1.3;
    }
    #btn-abandon-quest {
        color: #f85149;
        font-size: 11px;
        cursor: pointer;
        opacity: 0.6;
        white-space: nowrap;
    }
    #btn-abandon-quest:hover {
        opacity: 1.0;
    }

    /* ========================================= */
    /* === МОБИЛЬНАЯ АДАПТАЦИЯ (без изменений) === */
    /* ========================================= */
    @media (max-width: 600px) {
        .ui-panel {
            background: rgba(13, 17, 23, 0.88);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            border-width: 1px;
        }
        h3 { display: none; }

        #header-panel {
            top: 2px; padding: 2px 5px;
            left: calc(90px + 2px + 12px);
            right: calc(100px + 2px + 12px);
        }
        .loc-name { font-size: 10px; }
        .loc-coords { font-size: 9px; }

        #stats-panel { width: 90px; top: 2px; left: 2px; }
        .stat-row { font-size: 8px; }
        .equip-slot { font-size: 7px; }

        #inventory-panel { width: 100px; right: 2px; top: 2px; max-height: 35vh; }
        .inv-item { font-size: 8px; }

        #minimap-panel { width: 80px; height: 80px; bottom: 2px; left: 2px; }

        #inspector-panel { bottom: 85px; left: 2px; width: 80px; max-height: 100px; font-size: 8px; }
        #ui-inspector { font-size: 8px; }

        #log-panel { width: 140px; height: 80px; bottom: 2px; right: 2px; }
        #log-list { font-size: 8px; }

        #quest-bar { bottom: 2px; padding: 3px 8px; max-width: 55%; }
        #ui-quest-briefing { font-size: 9px; }
    }

    /* В index.html внутри тега <style> */
    .hidden-ui {
        display: none !important;
    }

</style>
</head>
<body>

    <!-- Игровое окно (Канвас) -->
    <div id="map-container"></div>

    <!-- UI Слои -->
    
    <!-- Верх Центр: Локация -->
    <div id="header-panel" class="ui-panel">
        <div id="ui-loc-name" class="loc-name">Инициализация...</div>
        <div id="ui-loc-coords" class="loc-coords">Выход: —</div>
    </div>

    <!-- Верх Лево: Статы -->
    <div id="stats-panel" class="ui-panel">
        <h3>Персонаж</h3>
        <div id="ui-stats"></div>
        <h3 style="margin-top: 8px;">Экипировка</h3>
        <div id="ui-equip"></div>
    </div>

    <!-- Лево Середина: Инспектор -->
    <div id="inspector-panel" class="ui-panel">
        <h3>👁️ Обзор</h3>
        <div id="ui-inspector">
            <div style="font-style: italic; opacity: 0.7;">Кликните по объекту...</div>
        </div>
    </div>

    <!-- Верх Право: Инвентарь -->
    <div id="inventory-panel" class="ui-panel">
        <h3>Инвентарь</h3>
        <div id="inventory-list"></div>
    </div>

    <!-- Низ Лево: Миникарта -->
    <div id="minimap-panel" class="ui-panel">
        <h3>Карта</h3>
        <canvas id="minimap"></canvas>
    </div>

    <!-- Низ Право: Лог -->
    <div id="log-panel" class="ui-panel">
        <h3>События</h3>
        <div id="log-list"></div>
    </div>

    <!-- Низ Центр: Квесты -->
    <div id="quest-bar" class="ui-panel">
        <div id="ui-quest-briefing"></div>
        <div id="btn-abandon-quest" 
             onclick="if(typeof GameModule !== 'undefined') GameModule.abandonCurrentQuest();"
             style="display: none;">
             ❌ Отказаться
        </div>
    </div>

</body>
</html>
 
``` 
 
### lore.js 
 
```js 
 
/**
 * МОДУЛЬ ЛОРА (lore.js)
 * Управляет выдачей текстовых фрагментов из книг.
 */

const LoreModule = (function() {
    'use strict';

    // База текстов. Можно расширять бесконечно.
    const BOOK_FRAGMENTS = [
        "Дневник неизвестного путника: 'День 4. Запасы еды на исходе. В темноте я слышу шорох крыс, но они кажутся мне сейчас друзьями.'",
        "Выдержка из трактата 'Основы некромантии': 'Жизнь — это лишь искра. Смерть — это океан. Не бойтесь утонуть, бойтесь высохнуть.'",
        "Старая карта с пометками: 'Здесь был вход... или выход? Стрелки указывают в разные стороны. Камень теплый на ощупь.'",
        "Записка, найденная в склепе: 'Они не мертвы. Они просто ждут. Не буди тех, кто спит под фундаментом.'",
        "Фрагмент королевского указа: '...в связи с эпидемией чумы, въезд в столицу закрыт. Всем нарушителям — отрубать головы без суда.'",
        "Молитва забытому богу: 'О, Хранитель Порога, дай мне сил пройти сквозь тьму, или дай тьме сил поглотить меня.'",
        "Нацарапано на стене: 'НЕ ДОВЕРЯЙ ТЕНЯМ. ОНИ ЖИВЫЕ.'",
        "Рецепт зелья: 'Взять корень мандрагоры, высушить на солнце... стоп, какое солнце? Мы же под землей.'",
        "Письмо домой: 'Мама, я стал героем. Или монстром. Я уже не различаю отражения в воде.'",
        "Торговый договор: '50 мечей за 100 золотых. Доставка в Северные Врата. Опасность пути оценивается как высокая.'",
        "Легенда о первом короле: 'Он нашел корону в пещере. Говорят, корона нашла его сама.'",
        "Наблюдения алхимика: 'Слизь зеленого цвета реагирует на железо. При контакте выделяется ядовитый газ.'",
        "Последняя запись в журнале стражи: 'Они идут снизу. Барабаны... я слышу барабаны.'",
        "Детский рисунок на клочке бумаги: 'Папа ушел в пещеру и не вернулся. Я нарисовал ему фонарь, чтобы он не заблудился.'",
        "Философский трактат: 'Если дерево падает в лесу, а рядом нет никого, кто это услышит, издает ли оно звук? А если это падает человек?'",
        "Инструкция к механизму: 'Не нажимать красную кнопку. Серьезно. Мы потеряли трех лучших инженеров.'",
        "Отрывок из поэмы: 'Под камнем спит древнее зло, / Оно видит сны про тепло. / Но стоит лучу пробиться сквозь мрак, / Как мир охватит вечный мрак.'",
        "Запись в судовом журнале (странно для подземелья): 'Шторм усиливается. Компас сошел с ума. Мы плывем в никуда.'",
        "Предсказание гадалки: 'Ты найдешь то, что ищешь, но потеряешь то, что любишь.'",
        "Надпись на могильной плите: 'Здесь лежит тот, кто слишком много знал.'",
        "Черновик письма: 'Дорогой брат, прости меня за то, что я сделал с нашим отцом. Это было необходимо.'",
        "Отчет разведчика: 'Вход в логово дракона охраняют два голема. Уязвимое место — суставы.'",
        "Рецепт пирога: '3 стакана муки, 2 яйца, щепотка соли... и немного любви.'",
        "Запись в дневнике сумасшедшего: 'Стены дышат. Пол пульсирует. Я часть этого места.'",
        "Указ императора: 'Всем магам зарегистрироваться в гильдии. Незаконное использование магии карается смертью.'"
    ];

    let currentIndex = 0;

    /**
     * Получить следующую фразу из списка (циклически)
     */
    function getNextFragment() {
        // Шанс 25% получить сюжетную подсказку, если цепочка активна
        if (Math.random() < 0.25 && typeof QuestChainModule !== 'undefined' && QuestChainModule.isInitialized()) {
            const chainLore = QuestChainModule.getLoreFragment();
            if (chainLore) {
                return `📖 ${chainLore}`;
            }
        }

        const text = BOOK_FRAGMENTS[currentIndex];
        currentIndex = (currentIndex + 1) % BOOK_FRAGMENTS.length;
        return text;
    }
    const RUMORS = [
        "Говорят, в соседних подземельях стены начали дышать...",
        "Я видел, как огромный дракон украл корону короля.",
        "Не ходи на север, путник. Там вода в реках стала красной.",
        "Старый шахтер нашел дверь, за которой слышны голоса мертвых.",
        "Гильдия магов ищет тех, кто читал древние фолианты. Платят золотом.",
        "В лесах появились волки с горящими красными глазами.",
        "Торговцы шепчутся, что цены на зелья скоро упадут из-за чумы.",
        "Кто-то украл священный артефакт из местного храма. Стража вне себя.",
        "Говорят, на дне самого глубокого колодца спит древнее зло.",
        "Один мой знакомый нашел карту, но сошел с ума, пытаясь её прочитать."
    ];

    function getRumor() {
        return RUMORS[Math.floor(Math.random() * RUMORS.length)];
    }
    return {
        getNextFragment: getNextFragment,
        getRumor: getRumor // <--- НОВОЕ
    };
})();
 
``` 
 
### map.js 
 
```js 
 
// =========================== Модуль карты (генерация, стены, лестницы) ===========================
const MapModule = (function() {
    let currentMapData = null;
    let currentDungeonType = null;
    let stairsUp = null;
    let stairsDown = null;
    
    // Кеш для связанных лестниц между уровнями
    const stairsCache = new Map();

    // Вспомогательная функция поиска случайной клетки пола (для спавна врагов/предметов)
    function findRandomFloor(excludePos, far = false, seed = null) {
        if (!seed) seed = `stairs_${currentDungeonType?.name || 'default'}`;
        const rng = new Math.seedrandom(seed);
        let attempts = 0;
        while (attempts < 1000) {
            const x = Math.floor(rng() * DataModule.MAP_WIDTH);
            const y = Math.floor(rng() * DataModule.MAP_HEIGHT);
            if (currentMapData && currentMapData[y][x] === 0) {
                if (excludePos && x === excludePos.x && y === excludePos.y) {
                    attempts++;
                    continue;
                }
                if (far && excludePos) {
                    const dist = Math.abs(x - excludePos.x) + Math.abs(y - excludePos.y);
                    if (dist < 10) {
                        attempts++;
                        continue;
                    }
                }
                return { x, y };
            }
            attempts++;
        }
        return excludePos || { x: 0, y: 0 };
    }

    // === НОВАЯ ФУНКЦИЯ: Поиск безопасного места РЯДОМ с точкой ===
    function getSafePosNearby(targetPos, maxRadius = 5) {
        if (!targetPos) return { x: 2, y: 2 };
        
        // 1. Проверяем саму точку
        if (currentMapData[targetPos.y] && currentMapData[targetPos.y][targetPos.x] === 0) {
            return targetPos;
        }

        // 2. Ищем по спирали вокруг точки в заданном радиусе
        for (let r = 1; r <= maxRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    // Пропускаем углы квадрата, чтобы сохранить форму круга/ромба (опционально)
                    // if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; 
                    
                    const nx = targetPos.x + dx;
                    const ny = targetPos.y + dy;
                    
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) {
                            return { x: nx, y: ny };
                        }
                    }
                }
            }
        }
        
        // 3. Если совсем рядом нет места (редкий случай в пещерах), ищем глобально
        console.warn("⚠️ Не удалось найти место рядом с целью, ищу глобально...");
        return getSafePosGlobal(targetPos);
    }

    // Старая функция глобального поиска (как запасной вариант)
    function getSafePosGlobal(pos) {
        if (!pos) return { x: 2, y: 2 };
        if (currentMapData[pos.y] && currentMapData[pos.y][pos.x] === 0) return pos;
        
        for (let r = 1; r < 20; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = pos.x + dx, ny = pos.y + dy;
                    if (ny >= 0 && ny < DataModule.MAP_HEIGHT && nx >= 0 && nx < DataModule.MAP_WIDTH) {
                        if (currentMapData[ny][nx] === 0) return { x: nx, y: ny };
                    }
                }
            }
        }
        return pos;
    }

    // Генерация или восстановление лестниц для уровня
    function generateStaircase(gx, gy, depth) {
        const cacheKey = `${gx}_${gy}_${depth}`;
        let cached = stairsCache.get(cacheKey);

        if (cached) {
            const upValid = cached.stairsUp && currentMapData[cached.stairsUp.y]?.[cached.stairsUp.x] === 0;
            const downValid = cached.stairsDown && currentMapData[cached.stairsDown.y]?.[cached.stairsDown.x] === 0;

            if (upValid && (currentDungeonType.name === 'city' || downValid)) {
                stairsUp = cached.stairsUp;
                stairsDown = cached.stairsDown;
                return;
            }
            stairsCache.delete(cacheKey);
        }

        // 1. Определяем stairsUp
        if (depth > 0) {
            const prevKey = `${gx}_${gy}_${depth - 1}`;
            const prevCached = stairsCache.get(prevKey); 
            if (prevCached?.stairsDown) {
                stairsUp = prevCached.stairsDown;
                if (currentMapData[stairsUp.y]?.[stairsUp.x] !== 0) {
                    stairsUp = findRandomFloor(null, false, `up_fb_${gx}_${gy}_${depth}`);
                }
            } else {
                stairsUp = findRandomFloor(null, false, `up_${gx}_${gy}_${depth}`);
            }
        } else {
            stairsUp = findRandomFloor(null, false, `up_${gx}_${gy}_${depth}`);
        }

        // 2. Определяем stairsDown
        if (currentDungeonType.name !== 'city') {
            stairsDown = findRandomFloor(stairsUp, true, `down_${gx}_${gy}_${depth}`);
        } else {
            stairsDown = null;
        }

        stairsCache.set(cacheKey, { stairsUp, stairsDown });
    }

    // Основная функция генерации уровня (в map.js)
    function generateLevel(gx, gy, depth, dungeonType, entryPoint = null) {
        const result = DungeonGeneratorModule.generateLevelWithType(gx, gy, depth, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, dungeonType);
        currentMapData = result.mapData;
        currentDungeonType = result.dungeonType;
        window.currentShopCoords = []; 

        
        generateStaircase(gx, gy, depth);
        
        let startPos;
        
        // ЛОГИКА ВЫБОРА СТАРТОВОЙ ПОЗИЦИИ
        if (entryPoint === 'down') {
            startPos = getSafePosNearby(stairsUp, 5);
        } else if (entryPoint === 'up') {
            startPos = getSafePosNearby(stairsDown, 5);
        } else {
            const genStart = result.startPos;
            if (genStart && currentMapData[genStart.y]?.[genStart.x] === 0) {
                 startPos = getSafePosNearby(stairsUp, 5);
            } else {
                 startPos = getSafePosNearby(stairsUp, 5);
            }
        }

        // ==========================================================
        // 🛠️ НОВОЕ: ГАРАНТИЯ СВЯЗНОСТИ (FIX ЗАМКНУТЫХ ПОЛОСТЕЙ)
        // ==========================================================
        if (stairsDown && startPos) {
            // Проверяем, существует ли путь от старта до лестницы вниз
            const astar = new ROT.Path.AStar(stairsDown.x, stairsDown.y,
                (x, y) => !isWall(x, y), { topology: 8 });
            
            let isReachable = false;
            astar.compute(startPos.x, startPos.y, (x, y) => {
                if (x === stairsDown.x && y === stairsDown.y) {
                    isReachable = true;
                }
            });

            // Если путь не найден (изолированная полость), принудительно прокладываем коридор
            if (!isReachable) {
                console.warn(`⚠️ [MapModule] Обнаружена изолированная полость на уровне ${depth}! Прокладываем аварийный коридор.`);
                let cx = startPos.x;
                let cy = startPos.y;
                
                // Двигаемся по оси X
                while (cx !== stairsDown.x) {
                    cx += (cx < stairsDown.x) ? 1 : -1;
                    if (cy >= 0 && cy < currentMapData.length && cx >= 0 && cx < currentMapData[0].length) {
                        currentMapData[cy][cx] = 0;
                        // Делаем коридор чуть шире (2x2) для надежности и эстетики
                        if (cy + 1 < currentMapData.length) currentMapData[cy + 1][cx] = 0;
                        if (cx + 1 < currentMapData[0].length) currentMapData[cy][cx + 1] = 0;
                        if (cy + 1 < currentMapData.length && cx + 1 < currentMapData[0].length) currentMapData[cy + 1][cx + 1] = 0;
                    }
                }
                // Двигаемся по оси Y
                while (cy !== stairsDown.y) {
                    cy += (cy < stairsDown.y) ? 1 : -1;
                    if (cy >= 0 && cy < currentMapData.length && cx >= 0 && cx < currentMapData[0].length) {
                        currentMapData[cy][cx] = 0;
                        if (cy + 1 < currentMapData.length) currentMapData[cy + 1][cx] = 0;
                        if (cx + 1 < currentMapData[0].length) currentMapData[cy][cx + 1] = 0;
                        if (cy + 1 < currentMapData.length && cx + 1 < currentMapData[0].length) currentMapData[cy + 1][cx + 1] = 0;
                    }
                }
            }
        }
        // ==========================================================
        
        return startPos;
    }

    function generate(gx, gy, depth) {
        return generateLevel(gx, gy, depth, null);
    }

    function generateWithType(gx, gy, depth, dungeonType, entryPoint = null) {
        return generateLevel(gx, gy, depth, dungeonType, entryPoint);
    } 

    // === ГЕНЕРАТОР ПЛАНИРОВКИ ГОРОДА ===
    let currentMapInteriorCoords = [];

    function generateCityLayout(rand, width, height, density = 0.7) {
        const grid = Array(height).fill().map(() => Array(width).fill(1));
        const interiorCoords = []; 
        const shopCoords = []; // Теперь это массив объектов {x, y, decor}

        // Список символов для декора магазина (оружие, броня, зелья из sprite_registry)
        const shopDecorSymbols = ['/', 'P', ')', '*', 'Y', '(', '=', '|', ']', '[', '}', '{', 'H', '!', '+', '%', '~', '?'];

        // 1. Очищаем карту (делаем все полом)
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                grid[y][x] = 0;
            }
        }

        // 2. Генерируем здания и собираем их список, чтобы потом выбрать одно под магазин
        const buildings = [];
        const STREET_W = 2;
        let y = 2; 

        while (y < height - 6) {
            const bh = rand.int(4, 8); 
            if (y + bh > height) break;

            let x = 2; 
            while (x < width - 6) {
                const bw = rand.int(5, 9); 
                
                // Пропускаем здание, если не хватает места или выпал шанс пропуска
                if (rand.next() > density) {
                    x += bw + STREET_W;
                    continue;
                }
                if (x + bw + STREET_W >= width - 1) break;

                // Сохраняем параметры здания для последующей отрисовки
                buildings.push({ x, y, w: bw, h: bh });

                x += bw + STREET_W;
            }
            y += bh + STREET_W;
        }

        // 3. Выбираем ОДНО здание под МАГАЗИН и ОДНО под ПОСТОЯЛЫЙ ДВОР
        let shopBuildingIndex = -1;
        let innBuildingIndex = -1;
        
        if (buildings.length > 0) {
            shopBuildingIndex = rand.int(0, buildings.length - 1);
        }
        if (buildings.length > 1) {
            innBuildingIndex = rand.int(0, buildings.length - 1);
            while (innBuildingIndex === shopBuildingIndex) {
                innBuildingIndex = rand.int(0, buildings.length - 1);
            }
        }

        const innCoords = []; // Теперь здесь будут ВСЕ клетки пола постоялого двора

        // 4. Отрисовываем стены зданий и заполняем списки координат
        buildings.forEach((b, index) => {
            const isShop = (index === shopBuildingIndex);
            const isInn = (index === innBuildingIndex);

            for (let dy = 0; dy < b.h; dy++) {
                for (let dx = 0; dx < b.w; dx++) {
                    const isPerimeter = (dy === 0 || dy === b.h - 1 || dx === 0 || dx === b.w - 1);
                    const val = isPerimeter ? 1 : 0; 
                    
                    const wx = b.x + dx;
                    const wy = b.y + dy;
                    
                    grid[wy][wx] = val;

                    if (val === 0) { // Если это пол
                        if (isShop) {
                            // Для магазина оставляем случайный декор
                            const decorChar = shopDecorSymbols[Math.floor(rand.next() * shopDecorSymbols.length)];
                            shopCoords.push({ x: wx, y: wy, decor: decorChar });
                        } else if (isInn) {
                            // Для постоялого двора сохраняем ВСЕ клетки пола
                            // В качестве 'decor' используем символ кровати '8'
                            innCoords.push({ x: wx, y: wy, decor: '8' });
                        } else {
                            // Обычные здания
                            interiorCoords.push({ x: wx, y: wy });
                        }
                    }
                }
            }

            // 5. Делаем дверь
            const side = rand.int(0, 3); 
            let doorX = 0, doorY = 0;
            if (side === 0) { doorX = b.x + rand.int(1, b.w - 2); doorY = b.y; }
            else if (side === 1) { doorX = b.x + b.w - 1; doorY = b.y + rand.int(1, b.h - 2); }
            else if (side === 2) { doorX = b.x + rand.int(1, b.w - 2); doorY = b.y + b.h - 1; }
            else { doorX = b.x; doorY = b.y + rand.int(1, b.h - 2); }
            
            grid[doorY][doorX] = 0; 
        });
         
        return { grid, interiorCoords, shopCoords, innCoords };
    }
    function generateCity(gx, gy, depth) {
        const seedVal = createSeed(gx, gy, depth);
        const rand = new SeededRandom(seedVal);
        const density = rand.next() * 0.3 + 0.3; 
        
        // 1. Генерируем планировку (здания, улицы, магазин)
        const layoutResult = generateCityLayout(rand, DataModule.MAP_WIDTH, DataModule.MAP_HEIGHT, density);
        
        currentMapData = layoutResult.grid;
        currentMapInteriorCoords = layoutResult.interiorCoords || [];
        
        // === НОВОЕ: Сохраняем координаты магазина для отрисовки ===
        window.currentShopCoords = layoutResult.shopCoords || [];
        window.currentInnCoords = layoutResult.innCoords || []; // <--- НОВОЕ
        currentDungeonType = { 
            name: 'city',
            wallChar: getChar('WALL_CITY'),
            floorChar: getChar('FLOOR_CITY'),
            wallColor: '#6b7280', 
            floorColor: '#374151' 
        };
    
        // 2. Определяем точку входа/выхода (лестницу вверх)
        const upSeed = `up_city_${gx}_${gy}_${depth}`;
        const rng = new Math.seedrandom(upSeed);
        const w = DataModule.MAP_WIDTH;
        const h = DataModule.MAP_HEIGHT;
        
        const edgeTiles = [];
        for (let y = 1; y < h - 1; y++) {
            if (currentMapData[y][1] === 0) edgeTiles.push({x: 1, y});
            if (currentMapData[y][w-2] === 0) edgeTiles.push({x: w-2, y});
        }
        for (let x = 1; x < w - 1; x++) {
            if (currentMapData[1][x] === 0) edgeTiles.push({x, y: 1});
            if (currentMapData[h-2][x] === 0) edgeTiles.push({x, y: h-2});
        }
        
        if (edgeTiles.length > 0) {
            stairsUp = edgeTiles[Math.floor(rng() * edgeTiles.length)];
        } else {
            stairsUp = { x: 2, y: 2 };
        }
        
        stairsDown = null; 
        return { x: stairsUp.x, y: stairsUp.y };
    }

    function clearCache() {
        stairsCache.clear();
        currentMapInteriorCoords = [];
        console.log("🗑️ Кеш лестниц очищен");
    }

    function isWall(x, y) {
        if (!currentMapData) return true;
        if (x < 0 || x >= DataModule.MAP_WIDTH || y < 0 || y >= DataModule.MAP_HEIGHT) return true;
        return currentMapData[y][x] === 1;
    }

    function getRandomFloor(excludePos) {
        return findRandomFloor(excludePos);
    } 

    function debugCache() {
        console.log("=== Текущий кеш лестниц ===");
        for (let [key, value] of stairsCache.entries()) {
            console.log(`${key}: up=(${value.stairsUp?.x},${value.stairsUp?.y}), down=(${value.stairsDown?.x},${value.stairsDown?.y})`);
        }
    }

    return {
        get currentMapData() { return currentMapData; },
        get currentDungeonType() { return currentDungeonType; },
        get stairsUp() { return stairsUp; },
        get stairsDown() { return stairsDown; },
        get interiorCoords() { return currentMapInteriorCoords; },
        
        generate,
        generateWithType,
        generateCity,
        isWall,
        getRandomFloor,
        clearCache,
        debugCache
    };
})();
 
``` 
 
### name_generator.js 
 
```js 
 
/**
 * МОДУЛЬ ГЕНЕРАЦИИ НАЗВАНИЙ (name_generator.js)
 * Содержит единственный экземпляр SeededRandom и createSeed
 */

// База данных для генерации (из вашего примера)
const NAME_COMPONENTS = {
    themes: {
        dark: {
            name: 'Мрачный мир',
            prefixes: ['Нек', 'Мор', 'Тар', 'Зар', 'Дру', 'Вор', 'Кри', 'Стр', 'Бла', 'Гро', 'Шад', 'Кул', 'Вам', 'Лик', 'Рав', 'Дем', 'Фен', 'Гул', 'Хор', 'Зом'],
            roots: ['али', 'ус', 'ек', 'ит', 'ум', 'ар', 'он', 'ис', 'ат', 'ен', 'ок', 'ур', 'ил', 'аш', 'ез', 'ин', 'оп', 'ук', 'ам', 'ир'],
            suffixes: ['тус', 'ган', 'нок', 'гар', 'зор', 'мак', 'вул', 'дур', 'мор', 'зул', 'рак', 'док', 'вел', 'зар', 'ник', 'лок', 'мар', 'ток', 'рук', 'зак']
        },
        light: {
            name: 'Светлый мир',
            prefixes: ['Лум', 'Сил', 'Фен', 'Пра', 'Кри', 'Ли', 'Ари', 'Эли', 'Ори', 'Су', 'Лай', 'Сол', 'Рей', 'Аур', 'Люк', 'Ним', 'Вал', 'Сеар', 'Три', 'Кел'],
            roots: ['има', 'ан', 'ор', 'ен', 'ур', 'ол', 'ик', 'ас', 'ем', 'ир', 'ал', 'ис', 'ет', 'ун', 'ам', 'ел', 'ин', 'ос', 'ат', 'ев'],
            suffixes: ['тал', 'мир', 'лан', 'мус', 'дек', 'вел', 'рил', 'тор', 'нис', 'лис', 'ран', 'виэл', 'зар', 'нок', 'рик', 'маэр', 'веэль', 'тик', 'нуэр', 'заль']
        },
        underground: {
            name: 'Подземный мир',
            prefixes: ['Ган', 'Гро', 'Тру', 'Стр', 'Бла', 'Дур', 'Кар', 'Мар', 'Раг', 'Туг', 'Двар', 'Гном', 'Краг', 'Морг', 'Тор', 'Ург', 'Барг', 'Грак', 'Фрог', 'Мург'],
            roots: ['ог', 'ар', 'он', 'ис', 'ат', 'ук', 'ак', 'ор', 'ам', 'ад', 'уг', 'аг', 'ог', 'умм', 'йяр', 'окх', 'йюр', 'аам', 'ауг', 'од'],
            suffixes: ['зар', 'рон', 'мак', 'тор', 'кул', 'дак', 'раг', 'зуг', 'мок', 'дур', 'гар', 'дхаур', 'мук', 'тхунд', 'кхульг', 'даг', 'рьяг', 'зорг', 'миг', 'дорр']
        },
        ancient: {
            name: 'Древний мир',
            prefixes: ['Ака', 'Эло', 'Ило', 'Ура', 'Оме', 'Ха', 'Тха', 'Жа', 'Рха', 'Ша', 'Атл', 'Лем', 'Му', 'Ра', 'Сет', 'Ос', 'Ир', 'Ан', 'Ка', 'Та'],
            roots: ['тун', 'мар', 'дал', 'вор', 'кул', 'зан', 'мор', 'тал', 'рен', 'вал', 'флун', 'мер', 'дьел', 'фор', 'кхуль', 'зайн', 'мойр', 'тхайл', 'жен', 'воль'],
            suffixes: ['дор', 'мир', 'зул', 'кар', 'мал', 'нор', 'рил', 'тор', 'вак', 'зур', 'доур', 'миэр', 'цзуль', 'кайр', 'майль', 'нойд', 'рииль', 'тхойн', 'факх', 'цзур']
        }
    },
    
    locationTypes: {
        dungeon: ['Подземелья', 'Темные подземелья', 'Заброшенные катакомбы', 'Тайные подземелья', 'Проклятые подземелья', 'Затопленные катакомбы', 'Древние подземелья', 'Запечатанные подземелья', 'Зловещие катакомбы', 'Темные лабиринты', 'Зловещие казематы'],
        cave: ['Пещеры', 'Темные пещеры', 'Глубинные пещеры', 'Зловещие пещеры', 'Сталагмитовые пещеры', 'Угольные пещеры', 'Доисторические пещеры', 'Зловонные пещеры', 'Заброшенные шахты', 'Кварцевые пещеры'],
        icy: ['Ледяные лабиринты', 'Хрустальные коридоры', 'Ледяные тоннели', 'Морозные лабиринты', 'Снежные коридоры', 'Ледяные катакомбы', 'Хрустальные лабиринты', 'Морозные тоннели', 'Ледяные залы', 'Снежные лабиринты'],
        rogue: ['Заброшенные руины', 'Древние руины', 'Разрушенные залы', 'Покинутые руины', 'Обвалившиеся руины', 'Заросшие руины', 'Разрушенные храмы', 'Забытые дворцы', 'Обрушившиеся арки', 'Разрушенные крепости'],
        cellular: ['Органические пещеры', 'Живые пещеры', 'Пульсирующие полости', 'Биологические пещеры', 'Грибные пещеры', 'Корневые полости', 'Слизевые пещеры', 'Грибковые полости', 'Органические тоннели', 'Живые лабиринты'],
        arena: ['Арены', 'Кровавые арены', 'Боевые арены', 'Смертельные арены', 'Гладиаторские арены', 'Круговые арены', 'Подземные арены', 'Кровавые колизеи', 'Боевые круги', 'Арены смерти'],
        boss: ['Логова', 'Тронные залы', 'Святилища', 'Цитадели', 'Крепости', 'Дворцы', 'Храмы', 'Священные соборы', 'Тронные палаты', 'Святилища владык']
    },
    
    extras: ['ма', 'ли', 'та', 'су', 'но', 'ре', 'ки', 'до', 'ве', 'ша', 'ну', 'ра', 'се', 'ту', 'го', 'ба', 'да', 'фа', 'га', 'ха', 'йя', 'кья', 'лиа', 'нья', 'пья', 'сье', 'вье', 'зиа', 'вха', 'уа']
};
// === ДАННЫЕ ДЛЯ БОССОВ ===
const BOSS_DATA = {
    races: ["Древний Дракон", "Повелитель Бездны", "Каменный Голем", "Король Личей", "Матриарх Пауков", "Падший Ангел"],
    syllables: {
        prefixes: ["Зул", "Мор", "Гар", "Тар", "Ксар", "Вул", "Нек", "Аз", "Иг", "Рак", "Гер", "Дур"],
        roots: ["го", "рак", "тар", "мун", "дор", "зул", "рак", "тул", "зар", "морг"],
        suffixes: ["гор", "акс", "ум", "иус", "ар", "он", "ат", "ус", "ор", "ак", "гул"]
    }
};
// Детерминированный генератор случайных чисел (LCG) - ЕДИНЫЙ ЭКЗЕМПЛЯР
class SeededRandom {
    constructor(seed) {
        this.seed = Math.abs(seed) || 1;
    }
    
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
    
    choice(array) {
        const index = Math.floor(this.next() * array.length);
        return array[index];
    }
    
    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

function createSeed(x, y, depth = 0) {
    const seed = (x * 73856093) ^ (y * 19349663) ^ (depth * 9999991);
    return (Math.abs(seed) % 2147483647) || 1;
}

// Генератор названий
// Генератор названий
const NameGeneratorModule = {
    
    // === ГЕНЕРАЦИЯ НАЗВАНИЙ ГОРОДОВ ===
    generateCityName(x, y) {
        const seed = createSeed(x, y);
        const rng = new SeededRandom(seed);
        
        const lightTheme = NAME_COMPONENTS.themes.light;
        const prefix = rng.choice(lightTheme.prefixes);
        const root = rng.choice(lightTheme.roots);
        let baseName = prefix + root;
        
        const citySuffixes = ['град', 'стед', 'борг', 'виль', 'хейм', 'форд', 'порт', 'полис', 'хольм', 'дол', 'фьорд', 'федль', 'карт', 'хольт', 'трис', 'трайн', 'кройн'];
        const suffix = rng.choice(citySuffixes);
        
        return (baseName + suffix).charAt(0).toUpperCase() + (baseName + suffix).slice(1);
    },
    
    generateName(random, theme) {
        let name = '';
        const partCount = random.int(2, 5);
        name += random.choice(theme.prefixes);
        
        const middleCount = Math.max(0, partCount - 2);
        for (let i = 0; i < middleCount; i++) {
            if (random.next() > 0.5 && theme.roots.length > 0) {
                name += random.choice(theme.roots);
            } else {
                name += random.choice(NAME_COMPONENTS.extras);
            }
        }
        
        if (partCount > 1) {
            name += random.choice(theme.suffixes);
        }
        
        return name.charAt(0).toUpperCase() + name.slice(1);
    },
    
    getLocationType(random, dungeonType) {
        if (dungeonType && NAME_COMPONENTS.locationTypes[dungeonType]) {
            const typeVariants = NAME_COMPONENTS.locationTypes[dungeonType];
            return random.choice(typeVariants);
        }
        const typeKeys = Object.keys(NAME_COMPONENTS.locationTypes);
        const randomType = random.choice(typeKeys);
        const typeVariants = NAME_COMPONENTS.locationTypes[randomType];
        return random.choice(typeVariants);
    },
    
    generateDescription(random) {
        const descriptors = [
            'проклятые', 'забытые', 'древние', 'кровавые', 'темные', 'вечные',
            'таинственные', 'опасные', 'зловещие', 'мрачные', 'заброшенные',
            'волшебные', 'священные', 'тайные', 'неприступные', 'легендарные',
            'зачарованные', 'проклятые вечностью', 'окутанные мраком', 'испещренные рунами', 'хранящие древние тайны',
            'наполненные эхом прошлого', 'пропитанные магией', 'защищенные древними заклятиями', 'резонирующие от криков ужаса', 'окутанные вечным туманом',
            'хранящие сокровища', 'полные ловушек', 'непостижимые', 'запретные', 'тающие во времени', 'нечестивые', 'колдовские', 'эпические', 'мифические', 'скрытые'
        ];
        
        const atmospheres = [
            'наполненные эхом шагов', 'освещенные тусклым светом',
            'пропитанные зловонием', 'вибрирующие от магии',
            'покрытые паутиной', 'украшенные древними рунами',
            'испещренные трещинами', 'окутанные вечным туманом',
            'резонирующие от криков прошлого', 'хранящие древние тайны',
            'полные ловушек и загадок', 'защищенные древними заклятиями',
            'эхом отзывающиеся на каждый шепот', 'мерцающие от скрытой энергии',
            'испускающие холодный ветер', 'наполненные странными звуками',
            'окрашенные в неестественные цвета', 'вибрирующие от скрытой угрозы',
            'наполненные призрачными фигурами', 'испускающие запах древности',
            'окутанные паутиной времени', 'пропитанные кровью предыдущих искателей приключений',
            'мерцающие от магических разрядов', 'наполненные странными шепотами',
            'испускающие зловещее сияние', 'вибрирующие от древней силы'
        ];
        
        const descriptor = random.choice(descriptors);
        const atmosphere = random.choice(atmospheres);
        
        return `${descriptor}, ${atmosphere}`;
    },
    
    getRandomTheme(random) {
        const themeKeys = Object.keys(NAME_COMPONENTS.themes);
        const themeKey = random.choice(themeKeys);
        return NAME_COMPONENTS.themes[themeKey];
    },

    generateLocationData(x, y, dungeonType) {
        const seed = createSeed(x, y);
        const rng = new SeededRandom(seed);
        
        const theme = this.getRandomTheme(rng);
        const namePart = this.generateName(rng, theme);
        const typePart = this.getLocationType(rng, dungeonType);
        const description = this.generateDescription(rng);
        
        return {
            fullName: `${typePart} ${namePart}`,
            description: description,
            themeName: theme.name,
            seed: seed
        };
    },

    // === ГЕНЕРАЦИЯ ИМЕНИ БОССА (ДОБАВЛЕНО ВНУТРЬ МОДУЛЯ) ===
    generateBossName: function(x, y, depth) {
        const seed = createSeed(x, y, depth) + 777; 
        const rng = new SeededRandom(seed);
        
        const race = rng.choice(BOSS_DATA.races);
        const pre = rng.choice(BOSS_DATA.syllables.prefixes);
        const root = rng.choice(BOSS_DATA.syllables.roots);
        const suf = rng.choice(BOSS_DATA.syllables.suffixes);
        
        const properName = (pre + root + suf).charAt(0).toUpperCase() + (pre + root + suf).slice(1);
        
        return {
            fullName: `${race} ${properName}`,
            bossType: race
        };
    }
};
 
``` 
 
### npc_generator.js 
 
```js 
 
/**
 * МОДУЛЬ ГЕНЕРАЦИИ NPC (npc_generator.js)
 * Создает нейтральных персонажей для городов.
 */

const NpcGeneratorModule = (function() {
    'use strict';

    // === РОСТЕР ТЕКСТОВЫХ КВЕСТОВ ===
    const TEXT_QUESTS_ROSTER = [
        'Quack of Duckness.html',
        // Сюда можно добавить другие файлы, когда они появятся:
        // 'The_Haunted_Mansion.html',
        // 'Lost_Caravan.html'
    ];

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
     * @param {Array} mapGrid  - двумерный массив карты города (0 - пол, 1 - стена)
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
            
            // Проверки валидности позиции
            if (mapGrid[y][x] !== 0) continue; // Не стена
            if (Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y) < 3) continue; // Не рядом со входом
            if (npcs.some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)) continue; // Не слишком близко к другим NPC

            npcs.push({
                x, y,
                name: rng.choice(NPC_DATA.titles),
                char: "☺", 
                color: "#58a6ff",
                dialog: rng.choice(NPC_DATA.phrases),
                isNPC: true,
                direction: directions[rng.int(0, 3)] 
            });
        }

        // === ЛОГИКА КВЕСТОДАТЕЛЯ (СТАНДАРТНАЯ) ===
        if (npcs.length > 0) {
            // Делаем первого NPC квестодателем
            const giver = npcs[0];
            giver.isQuestGiver = true;
            giver.color = "#FFD700"; // Золотой цвет для выделения
            giver.name = "Капитан стражи"; // Уникальное имя
            giver.dialog = "Город нуждается в твоей помощи.";
        }

        // === ЛОГИКА ОСОБОГО ПЕРСОНАЖА (НОВОЕ) ===
        // Шанс 80% появления Барда-легенды в городе
        if (npcs.length > 5 && rng.next() < 0.8) {
            let specialX, specialY;
            let foundSpot = false;
            let tries = 0;
            
            while (!foundSpot && tries < 50) {
                specialX = rng.int(1, w - 2);
                specialY = rng.int(1, h - 2);
                
                // Проверки: не стена, далеко от входа, далеко от других NPC
                if (mapGrid[specialY][specialX] === 0 &&
                    Math.abs(specialX - playerStart.x) + Math.abs(specialY - playerStart.y) > 5 &&
                    !npcs.some(n => Math.abs(n.x - specialX) + Math.abs(n.y - specialY) < 3)) {
                    foundSpot = true;
                }
                tries++;
            }

            if (foundSpot) {
                // 1. Получаем список всех доступных квестов
                // (Предполагается, что TEXT_QUESTS_ROSTER определен выше в файле)
                let availableQuests = TEXT_QUESTS_ROSTER;

                // 2. Фильтруем список, убирая пройденные (если GameModule доступен)
                if (typeof GameModule !== 'undefined' && typeof GameModule.isTextQuestCompleted === 'function') {
                    availableQuests = TEXT_QUESTS_ROSTER.filter(q => !GameModule.isTextQuestCompleted(q));
                }

                // 3. Если все квесты пройдены, можно либо не создавать NPC, либо дать случайный из всех
                if (availableQuests.length === 0) {
                    // Вариант: Не создаем особого NPC, так как все истории услышаны
                    // return npcs; 
                    
                    // Или вариант: Даем последний доступный (повтор)
                    availableQuests = TEXT_QUESTS_ROSTER;
                }

                const randomQuestFile = rng.choice(availableQuests);

                npcs.push({
                    x: specialX,
                    y: specialY,
                    name: "Странный Странник",
                    char: "☺",
                    color: "#ff00ff",
                    dialog: "Псс! Эй, ты! У меня есть для тебя одна история...",
                    isNPC: true,
                    isSpecial: true,
                    direction: directions[rng.int(0, 3)],
                    action: () => GameModule.openTwineQuest(randomQuestFile) 
                });
            }
        }

        return npcs;
    }

    return {
        generateCityNpcs: generateCityNpcs
    };
})();
 
``` 
 
### quest_chain.js 
 
```js 
 
/**
 * МОДУЛЬ СЮЖЕТНОЙ ЦЕПОЧКИ КВЕСТОВ (quest_chain.js)
 * Генерирует детерминированную сюжетную линию по миру.
 */
const QuestChainModule = (function() {
    'use strict';

    let chainCities = [];      // Массив городов цепочки
    let isInitialized = false;

    // === ШАБЛОНЫ БРИФИНГОВ (Сюжетные) ===
    const CHAIN_TEMPLATES = {
        FETCH: [
            "Хранители {city} утратили священный {item}. Разведчики донесли, что он в {location}. Найди его, и мы укажем тебе путь в {nextCity}.",
            "В {city} украден артефакт — {item}. Ищи его в {location}. Это первый шаг к тайне, что скрывает {nextCity}."
        ],
        HUNT: [
            "Торговые пути между {city} и {nextCity} перекрыты. {enemy} атакуют караваны. Убей {count} тварей, чтобы путь открылся.",
            "Жители {city} в ужасе. {enemy} спускаются с гор. Истреби {count} из них, иначе до {nextCity} не добраться."
        ],
        EXPLORE: [
            "Старцы {city} говорят о пророчестве, связанном с {location}. Спустись на глубину {depth} и узнай правду. Твой путь лежит в {nextCity}.",
            "Карта из {city} ведет в {location}. Найди там древние знаки. Только так ты узнаешь, что скрывает {nextCity}."
        ],
        DIGGER: [
            "Шахтеры {city} нашли странный тоннель, ведущий в недра. Спустись на глубину {depth} в {location}. Это ключ к {nextCity}.",
            "В {city} говорят о древних залежах в {location}. Доберись до глубины {depth}. Только так ты поймешь, куда идти дальше — в {nextCity}."
        ],
        COLLECT: [
            "Алхимики {city} готовят эликсир для защиты от тьмы {nextCity}. Собери {count} шт. '{item}' в {location}.",
            "Для ритуала в {city} нужно {count} шт. '{item}'. Ищи их в {location}. От этого зависит безопасность пути в {nextCity}."
        ],
        BOUNTY: [
            "Гильдия объявляет награду за головы {enemy}. Истреби {count} особей, где бы ты их ни встретил. Награда: {gold}.",
            "Эти твари ({enemy}) стали слишком наглыми. Убей {count} штук в любом подземелье. Гильдия {city} заплатит щедро."
        ],
        SCHOLAR: [
            "Мудрецы {city} ищут утраченные знания. Прочитай {count} древних книг, которые найдешь. Это прольет свет на тайну {nextCity}.",
            "Библиотека {city} пуста, но мир полон книг. Прочитай {count} томов. В них скрыт путь к {nextCity}."
        ]
    };
    // === ШАБЛОНЫ ТЕКСТОВ СДАЧИ КВЕСТА (Говорит NPC, когда вы вернулись) ===
    const TURN_IN_TEMPLATES = {
        FETCH: [
            "Ты нашел {item}! Жители {city} вздохнули с облегчением. Теперь иди в {nextCity}, там знают, что делать с этой находкой.",
            "Отличная работа. Артефакт в целости. Путь в {nextCity} теперь открыт для тебя."
        ],
        HUNT: [
            "Твари истреблены! Торговые пути в {nextCity} снова безопасны. Ступай туда, тебя ждут.",
            "Ты спас наши земли от {enemy}. В {nextCity} уже знают о твоей доблести. Иди же туда!"
        ],
        EXPLORE: [
            "Твои карты и заметки бесценны. Тайна {nextCity} начинает раскрываться. Спешите туда!"
        ],
        DIGGER: [
            "Шахтеры в восторге! Твои сведения о глубинах помогут нам. А теперь отправляйся в {nextCity}."
        ],
        COLLECT: [
            "Этих {item} хватит для ритуала. Спасибо, странник. Твой следующий шаг — {nextCity}."
        ],
        BOUNTY: [
            "Головы {enemy} принесли мир на наши дороги. Гильдия откроет тебе тайные тропы к {nextCity}."
        ],
        SCHOLAR: [
            "Мудрость древних теперь с тобой. Ты готов к тому, что скрывает {nextCity}. Иди же!"
        ],
        // Специальный текст для ФИНАЛЬНОГО квеста цепочки
        FINAL: [
            "Ты прошел весь путь от {city} до наших дней. Ты не просто искатель приключений, ты — легенда. Эти земли навсегда запомнят твое имя!"
        ]
    };
    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
    
    // Поиск городов в кольце (от minR до maxR)
    function findCitiesInRing(cx, cy, minR, maxR) {
        const cities = [];
        const found = new Set();
        // Ограничиваем перебор, чтобы не зависнуть
        for (let dy = -maxR; dy <= maxR; dy++) {
            for (let dx = -maxR; dx <= maxR; dx++) {
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist >= minR && dist <= maxR) {
                    if (typeof GlobalMapModule !== 'undefined') {
                        const poi = GlobalMapModule.getPOI(cx + dx, cy + dy);
                        if (poi && poi.type === 'city' && !found.has(`${poi.x},${poi.y}`)) {
                            found.add(`${poi.x},${poi.y}`);
                            cities.push(poi);
                        }
                    }
                }
            }
        }
        return cities;
    }

    // Вычисление текущего ожидаемого индекса цепочки (ДЕТЕРМИНИРОВАННО!)
    function getExpectedIndex() {
        if (typeof GameModule === 'undefined') return 0;
        const completed = GameModule.getCompletedQuestIds();
        let expected = 0;
        
        for (let i = 0; i < chainCities.length; i++) {
            const id = `chain_${chainCities[i].x}_${chainCities[i].y}`;
            if (completed.has(id)) {
                expected = i + 1; // Если квест сдан, ждем следующий
            } else {
                break; // Цепочка прервалась, это текущий квест
            }
        }
        return expected;
    }

    // === ПУБЛИЧНЫЕ МЕТОДЫ ===

    function init(startX, startY) {
        if (isInitialized) return;
        
        // 1. Ищем ближайший город к точке старта
        let startCity = null;
        for (let r = 0; r <= 50; r++) {
            const cities = findCitiesInRing(startX, startY, r, r);
            if (cities.length > 0) {
                startCity = cities[0]; 
                break;
            }
        }
        
        if (!startCity) {
            console.warn("QuestChain: Не удалось найти стартовый город.");
            return;
        }

        chainCities.push({ ...startCity, questIndex: 0, isFinal: false });

        // 2. Генерируем следующие города цепочки (от 4 до 6 звеньев)
        const rng = new SeededRandom(GLOBAL_CONFIG.WORLD_SEED + 12345);
        const chainLength = rng.int(4, 6);
        
        let currentCity = startCity;
        for (let i = 1; i < chainLength; i++) {
            // Ищем город на расстоянии от 15 до 50 клеток
            const candidates = findCitiesInRing(currentCity.x, currentCity.y, 15, 50);
            if (candidates.length === 0) break;
            
            // Детерминированный выбор следующего города
            const nextCity = candidates[Math.floor(rng.next() * candidates.length)];
            const isFinal = (i === chainLength - 1);
            chainCities.push({ ...nextCity, questIndex: i, isFinal });
            currentCity = nextCity;
        }
        // === БЛОК ОТЛАДКИ: ВЫВОД В КОНСОЛЬ ===
        console.group("🗺️ СЮЖЕТНАЯ ЦЕПОЧКА КВЕСТОВ (DEBUG)");
        console.log(`Стартовая точка игрока: X=${startX}, Y=${startY}`);
        console.table(chainCities.map((city, index) => ({
            "Этап": index + 1,
            "Город": city.name,
            "Координаты": `(${city.x}, ${city.y})`,
            "Финал": city.isFinal ? "✅ ДА" : "❌ НЕТ",
            "ID Квеста": `chain_${city.x}_${city.y}`
        })));
        console.groupEnd();
        // ======================================        
        isInitialized = true;
        console.log(`✅ Сюжетная цепочка сгенерирована (${chainCities.length} городов).`);
    }

    function isChainCity(x, y) {
        return chainCities.some(city => city.x === x && city.y === y);
    }

    function getQuestForCity(x, y) {
        const idx = chainCities.findIndex(c => c.x === x && c.y === y);
        if (idx === -1) return null;
        
        const expectedIdx = getExpectedIndex();
        // Выдаем квест только если это текущий ожидаемый город цепочки
        if (idx !== expectedIdx) return null; 

        return generateCustomQuest(chainCities[idx]);
    }

    function generateCustomQuest(cityData) {
        const idx = cityData.questIndex;
        const nextCity = chainCities[idx + 1];
        
        // Детерминированный RNG для этого конкретного квеста
        const rng = new SeededRandom(createSeed(cityData.x, cityData.y, 7777));
        
        // Выбор типа квеста
        const types = ['FETCH', 'HUNT', 'EXPLORE', 'COLLECT', 'BOUNTY', 'SCHOLAR'];
        if (idx > 0) types.push('DIGGER');
        const type = types[Math.floor(rng.next() * types.length)];
        
        // === ГЕНЕРАЦИЯ ЦЕЛИ (TARGET DATA) ===
        let targetData = {
            locationName: "неизвестных землях",
            targetX: null,
            targetY: null,
            enemyName: "монстров",
            itemName: "артефакт",
            itemType: "weapon",
            count: 1,
            targetDepth: 1,
            uniqueId: null // <-- НОВОЕ ПОЛЕ: для хранения ID уникального предмета
        };

        // 1. Поиск локации (Подземелья)
        // Для BOUNTY и SCHOLAR локация не важна, поэтому пропускаем поиск
        if (type !== 'BOUNTY' && type !== 'SCHOLAR') {
            const dungeons = [];
            // Ищем в кольце от 5 до 40 клеток от города выдачи
            for (let dy = -40; dy <= 40; dy++) {
                for (let dx = -40; dx <= 40; dx++) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < 5 || dist > 40) continue;
                    
                    const tx = cityData.x + dx;
                    const ty = cityData.y + dy;
                    
                    if (typeof GlobalMapModule !== 'undefined') {
                        const poi = GlobalMapModule.getPOI(tx, ty);
                        // Ищем именно входы в подземелья
                        if (poi && (poi.type === 'dungeon' || poi.type === 'dungeon_entrance')) {
                            dungeons.push(poi);
                        }
                    }
                }
            }

            if (dungeons.length > 0) {
                const targetPoi = dungeons[Math.floor(rng.next() * dungeons.length)];
                targetData.targetX = targetPoi.x;
                targetData.targetY = targetPoi.y;
                targetData.locationName = targetPoi.name;
            } else {
                // Заглушка, если подземелий совсем нет рядом
                targetData.locationName = "Забытых руинах";
                targetData.targetX = cityData.x + 10;
                targetData.targetY = cityData.y + 10;
            }
        } else {
            // Для глобальных квестов
            targetData.locationName = "любом опасном месте";
        }

        // 2. Заполнение специфичных параметров в зависимости от типа
        if (type === 'HUNT' || type === 'BOUNTY') {
            const enemies = DataModule.ENEMY_TYPES.filter(e => 
                ["Гоблин", "Крыса", "Волк", "Слизень", "Бандит", "Скелет", "Орк-разведчик"].includes(e.name)
            );
            const enemy = enemies[Math.floor(rng.next() * enemies.length)];
            targetData.enemyName = enemy.name;
            // Для BOUNTY меньше целей, для HUNT больше
            targetData.count = (type === 'BOUNTY') ? rng.int(1, 3) : rng.int(3, 6);
        } 
        
        // === ИЗМЕНЕНИЯ ЗДЕСЬ: ЛОГИКА УНИКАЛЬНЫХ ПРЕДМЕТОВ ===
        else if (type === 'FETCH') {
            // Шанс 50% получить уникальный квестовый предмет, если реестр существует
            const hasUniqueItems = DataModule.UNIQUE_ITEM_TEMPLATES && DataModule.UNIQUE_ITEM_TEMPLATES.length > 0;
            const isUniqueRoll = hasUniqueItems && (rng.next() > 0.5);

            if (isUniqueRoll) {
                // Выбираем случайный уникальный шаблон
                const uniquePool = DataModule.UNIQUE_ITEM_TEMPLATES;
                const uniqueItem = uniquePool[Math.floor(rng.next() * uniquePool.length)];
                
                targetData.itemName = `${uniqueItem.uniquePrefix} ${uniqueItem.baseName}`;
                targetData.itemType = uniqueItem.baseType;
                targetData.uniqueId = uniqueItem.id; // Сохраняем ID для спавнера
            } else {
                // Стандартная генерация обычного предмета
                const items = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
                const item = items[Math.floor(rng.next() * items.length)];
                targetData.itemName = item.baseName;
                targetData.itemType = item.type;
            }
        } 
        
        else if (type === 'DIGGER') {
            targetData.targetDepth = rng.int(2, 5);
        } 
        
        else if (type === 'COLLECT') {
            // Шанс 30% на уникальную книгу/свиток
            const hasUniqueItems = DataModule.UNIQUE_ITEM_TEMPLATES && DataModule.UNIQUE_ITEM_TEMPLATES.length > 0;
            const isUniqueRoll = hasUniqueItems && (rng.next() > 0.7);

            if (isUniqueRoll) {
                // ИСПРАВЛЕНИЕ: Используем полное имя массива вместо неопределенной uniquePool
                const bookUniques = DataModule.UNIQUE_ITEM_TEMPLATES.filter(u => u.baseType === 'book' || u.baseType === 'scroll_teleport');
                
                if (bookUniques.length > 0) {
                    const uniqueBook = bookUniques[Math.floor(rng.next() * bookUniques.length)];
                    targetData.itemName = `${uniqueBook.uniquePrefix} ${uniqueBook.baseName}`;
                    targetData.itemType = uniqueBook.baseType;
                    targetData.uniqueId = uniqueBook.id;
                } else {
                    // Фолбэк на обычные книги, если уникальных книг нет в реестре
                    targetData.itemName = "Книга";
                    targetData.itemType = "book";
                }
            } else {
                targetData.itemName = "Книга"; 
                targetData.itemType = "book";
            }
            targetData.count = rng.int(2, 4);
        }
        
        else if (type === 'SCHOLAR') {
            targetData.count = rng.int(1, 3);
        }

        // === РАСЧЕТ НАГРАДЫ ===
        const baseGold = 100 + (idx * 50);
        // Если квест на уникальный предмет, награда может быть выше
        const goldMult = targetData.uniqueId ? 1.5 : 1.0; 
        const finalGold = Math.floor(baseGold * (1 + idx * 0.2) * goldMult);

        // === ФОРМИРОВАНИЕ БРИФИНГА ===
        let templatePool = CHAIN_TEMPLATES[type] || CHAIN_TEMPLATES.FETCH;
        let template = templatePool[Math.floor(rng.next() * templatePool.length)];
        
        if (cityData.isFinal) {
            template = `Ты прошел долгий путь. Финальное испытание в ${cityData.name}: ${template}`;
        }

        const briefing = template
            .replace(/{city}/g, cityData.name)
            .replace(/{nextCity}/g, nextCity ? nextCity.name : 'дальних земель')
            .replace(/{item}/g, targetData.itemName || 'древний артефакт')
            .replace(/{enemy}/g, targetData.enemyName || 'монстров')
            .replace(/{count}/g, targetData.count || 1)
            .replace(/{location}/g, targetData.locationName || 'забытых руинах')
            .replace(/{depth}/g, targetData.targetDepth || targetData.recommendedDepth || 1)
            .replace(/{gold}/g, finalGold);

        // === ГЕНЕРАЦИЯ ТЕКСТА СДАЧИ ===
        let turnInPool;
        if (cityData.isFinal) {
            turnInPool = TURN_IN_TEMPLATES.FINAL;
        } else {
            turnInPool = TURN_IN_TEMPLATES[type] || TURN_IN_TEMPLATES.FETCH;
        }
        
        let turnInText = turnInPool[Math.floor(rng.next() * turnInPool.length)];
        turnInText = turnInText
            .replace(/{city}/g, cityData.name)
            .replace(/{nextCity}/g, nextCity ? nextCity.name : 'дальних земель')
            .replace(/{item}/g, targetData.itemName)
            .replace(/{enemy}/g, targetData.enemyName);

        return {
            id: `chain_${cityData.x}_${cityData.y}`,
            type: type,
            target: targetData, 
            progress: 0,
            maxProgress: (type === 'HUNT' || type === 'COLLECT' || type === 'BOUNTY' || type === 'SCHOLAR') ? targetData.count : 1,
            rewardGold: finalGold,
            briefing: briefing,
            turnInText: turnInText,
            isCompleted: false,
            isTurnedIn: false, 
            isActive: false,
            isChainQuest: true,
            chainIndex: idx,
            isFinal: cityData.isFinal
        };
    }
    // === ПУБЛИЧНЫЕ МЕТОДЫ (продолжение) ===

    function getChainCities() { 
        return chainCities; 
    }

    // Функция завершения текущего этапа цепочки
    // Вызывается из game.js после успешной сдачи квеста
    function completeCurrentQuest() {
        // В данной архитектуре прогресс вычисляется детерминированно 
        // через getExpectedIndex() на основе completedQuestIds в GameModule.
        // Эта функция нужна для совместимости и потенциальной будущей логики 
        // (например, спец. эффектов при завершении этапа).
        console.log("✅ Сюжетный этап завершен. Ожидание следующего города...");
    }

    // Генерация лора для книг
    function getLoreFragment() {
        if (chainCities.length < 2) return null;
        const rng = new SeededRandom(Date.now()); // Тут можно случайный, чтобы книги были разными
        const idx = Math.floor(rng.next() * (chainCities.length - 1));
        const city1 = chainCities[idx];
        const city2 = chainCities[idx + 1];
        
        const phrases = [
            `В старых хрониках упоминается тайный путь из ${city1.name} в ${city2.name}. Говорят, там спрятано нечто важное.`,
            `Странники шепчутся о связи между ${city1.name} и ${city2.name}. Будь осторожен, путник.`,
            `Печать ${city1.name} укажет тебе дорогу к тайнам ${city2.name}. Ищи хранителя в городе ${city1.name}.`
        ];
        return phrases[Math.floor(rng.next() * phrases.length)];
    }

    return {
        init,
        isChainCity,
        getQuestForCity,
        getChainCities,
        getLoreFragment,
        getExpectedIndex,
        completeCurrentQuest, // <--- ДОБАВИТЬ ЭТУ СТРОКУ
        isInitialized: () => isInitialized
    };
})();
 
``` 
 
### quest_system.js 
 
```js 
 
/**
 * МОДУЛЬ СИСТЕМЫ КВЕСТОВ (quest_system.js)
 */
const QuestSystemModule = (function() {
    'use strict';

    const MAX_QUEST_RADIUS = 50;
    const FALLBACK_RADIUS = 100;

    const QUEST_TEMPLATES = {
        FETCH: [
            "Мне нужен предмет: {item}. Говорят, последний раз его видели здесь: {location} (глубина {depth}+). Принеси его, и я заплачу {gold} золотых.",
            "В {location} (не ниже {depth} уровня) затерялся ценный артефакт: {item}. Найди его для меня. Награда: {gold} монет."
        ],
        HUNT: [
            "{enemy} расплодились на нижних уровнях подземелья {location} (глубина {depth}+). Убей {count} штук, и город будет в безопасности. Награда: {gold} золотых.",
            "Охотники боятся спускаться в {location} ниже {depth} уровня. Там слишком много {enemy}. Устрани {count} особей, и я дам тебе {gold} монет."
        ],
        EXPLORE: [
            "Разведчики пропали рядом с подземельем {location}. Доберись до глубины {depth} и проверь, что там происходит. Награда за риск: {gold} золотых.",
            "На карте отмечено странное место: {location}. Спустись хотя бы на {depth} уровень и убедись, что путь открыт. Плачу {gold} за информацию."
        ],
        DIGGER: [
            "Шахтерская гильдия ищет смельчаков. Спустись в {location} хотя бы на {depth} уровень. Награда за риск: {gold} золотых.",
            "Говорят, на {depth} уровне в {location} есть древние залежи. Доберись туда и проверь. Плачу {gold} монет."
        ],
        COLLECT: [
            "Мне нужно {count} шт. '{item}' для экспериментов. Ищи в подземелье {location} (глубина {depth}+). Награда: {gold} золотых.",
            "Собери {count} экземпляров '{item}' в подземелье {location}. Заплату {gold} монет."
        ],
        BOUNTY: [
            "Голова {enemy} стоит дорого. Убей {count} штук в любом подземелье. Награда: {gold} золотых.",
            "Эти твари ({enemy}) стали слишком наглыми. Истреби {count} особей где бы ты их ни нашел. Плачу {gold}."
        ],
        SCHOLAR: [
            "Библиотекарь просит принести знания. Прочитай {count} древних книг, которые найдешь. Награда: {gold} золотых."
        ]
    };

    function pickRandom(rng, array) { return array[Math.floor(rng.next() * array.length)]; }

    function formatBriefing(template, data) {
        let text = template;
        text = text.replace(/{item}/g, data.itemName || "древний предмет");
        text = text.replace(/{enemy}/g, data.enemyName || "врагов");
        text = text.replace(/{location}/g, data.locationName || "неизвестном месте");
        text = text.replace(/{count}/g, data.count || "несколько");
        text = text.replace(/{gold}/g, data.gold || "немного");
        text = text.replace(/{depth}/g, data.depth || "1");
        return text;
    }

    function generateQuestId(gx, gy, type, index) { return `Q_${type}_${gx}_${gy}_${index}`; }

    function findRealPOI(gx, gy, radius, poiType) {
        const candidates = [];
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > radius) continue;
                const tx = gx + dx;
                const ty = gy + dy;
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getPOI) {
                    const poi = GlobalMapModule.getPOI(tx, ty);
                    // Ищем и 'dungeon', и 'dungeon_entrance'
                    if (poi && (poi.type === 'dungeon' || poi.type === 'dungeon_entrance')) candidates.push(poi);
                }
            }
        }
        return candidates.length > 0 ? candidates : null;
    }

    function calculateTargetParams(gx, gy, type, difficultyLevel) {
        const seed = createSeed(gx, gy, difficultyLevel) + 777; 
        const rng = new SeededRandom(seed);
        let targetData = {};

        // 1. Определение локации (Подземелья)
        const candidates = findRealPOI(gx, gy, MAX_QUEST_RADIUS, 'dungeon');
        let targetPoi = null;
        
        if (candidates && candidates.length > 0) {
            targetPoi = rng.choice(candidates);
        } else {
            const wideCandidates = findRealPOI(gx, gy, FALLBACK_RADIUS, 'dungeon');
            if (wideCandidates && wideCandidates.length > 0) {
                targetPoi = rng.choice(wideCandidates);
            }
        }

        if (targetPoi) {
            targetData.targetX = targetPoi.x;
            targetData.targetY = targetPoi.y;
            targetData.locationName = targetPoi.name;
            targetData.dungeonType = targetPoi.dungeonType;
        } else {
            // Фолбэк: случайные координаты
            const angle = rng.next() * Math.PI * 2;
            const r = rng.int(10, MAX_QUEST_RADIUS);
            targetData.targetX = gx + Math.round(Math.cos(angle) * r);
            targetData.targetY = gy + Math.round(Math.sin(angle) * r);
            targetData.locationName = "Забытых руинах";
            targetData.dungeonType = 'rogue';
        }

        // 2. Специфичные параметры для типов квестов
        if (type === 'FETCH') {
            const possibleItems = DataModule.ITEM_TYPES.filter(i => 
                i.type !== 'gold' && i.type !== 'book' && i.type !== 'food' && 
                i.type !== 'potion_hp' && i.type !== 'potion_str'
            );
            const itemTemplate = pickRandom(rng, possibleItems);
            targetData.itemName = itemTemplate.baseName;
            targetData.itemType = itemTemplate.type;
        } 
        else if (type === 'HUNT') {
            const enemies = EntityModule.getAvailableEnemies ? EntityModule.getAvailableEnemies(difficultyLevel) : DataModule.ENEMY_TYPES;
            const enemyTemplate = pickRandom(rng, enemies);
            
            targetData.enemyName = enemyTemplate.name;
            const baseCount = rng.int(3, 5);
            const multiplier = WorldCurveModule.getEnemyMultiplier(gx, gy);
            targetData.count = Math.max(1, Math.floor(baseCount * Math.sqrt(multiplier)));
        }
        else if (type === 'DIGGER') {
            targetData.targetDepth = rng.int(2, 5); 
        }
        else if (type === 'COLLECT') {
            const collectibleTypes = ['potion_hp', 'book', 'food'];
            const possibleItems = DataModule.ITEM_TYPES.filter(i => collectibleTypes.includes(i.type));
            const itemTemplate = pickRandom(rng, possibleItems);
            
            targetData.itemName = itemTemplate.baseName;
            targetData.itemType = itemTemplate.type;
            targetData.count = rng.int(2, 4);
        }
        else if (type === 'BOUNTY') {
            const enemies = EntityModule.getAvailableEnemies ? EntityModule.getAvailableEnemies(difficultyLevel) : DataModule.ENEMY_TYPES;
            const enemyTemplate = pickRandom(rng, enemies);
            
            targetData.enemyName = enemyTemplate.name;
            targetData.count = rng.int(1, 3); 
        }
        else if (type === 'SCHOLAR') {
            targetData.count = rng.int(1, 3);
            targetData.locationName = "древних библиотеках";
        }

        return targetData;
    }

    function createQuest(gx, gy, questIndex) {
        const types = ['FETCH', 'HUNT', 'EXPLORE', 'DIGGER', 'COLLECT', 'BOUNTY', 'SCHOLAR'];
        const rng = new SeededRandom(createSeed(gx, gy, questIndex));
        const type = pickRandom(rng, types);
        
        const globalDist = Math.abs(gx) + Math.abs(gy);
        let playerLevel = 1;
        if (typeof GameModule !== 'undefined' && GameModule.getPlayer) {
            const p = GameModule.getPlayer();
            if (p) playerLevel = p.level;
        }

        const questEnemyTier = Math.min(6, Math.floor(globalDist / 15) + playerLevel);
        const targetData = calculateTargetParams(gx, gy, type, questEnemyTier);
        
        const recommendedDepth = Math.max(1, Math.min(5, Math.floor(questEnemyTier / 1.5)));
        targetData.recommendedDepth = recommendedDepth;

        const goldBase = rng.int(50, 150);
        const goldMult = WorldCurveModule.getGoldMultiplier(globalDist, 0); 
        const finalGold = Math.floor(goldBase * goldMult) + (playerLevel * 10);
        
        const id = generateQuestId(gx, gy, type, questIndex);
        const templates = QUEST_TEMPLATES[type];
        const template = pickRandom(rng, templates);
        
        const briefingData = {
            itemName: targetData.itemName,
            enemyName: targetData.enemyName,
            locationName: targetData.locationName,
            count: targetData.count,
            gold: finalGold,
            depth: targetData.targetDepth || recommendedDepth
        };
        
        const briefing = formatBriefing(template, briefingData);

        let maxProg = 1;
        if (type === 'HUNT' || type === 'COLLECT' || type === 'BOUNTY' || type === 'SCHOLAR') {
            maxProg = targetData.count || 1;
        }

        return {
            id: id,
            type: type,
            target: targetData, 
            progress: 0,
            maxProgress: maxProg,
            rewardGold: finalGold,
            briefing: briefing,
            isCompleted: false,
            isTurnedIn: false,
            isActive: false
        };
    }

    function checkProgress(quest, eventData) {
        if (!quest || quest.isCompleted || !quest.isActive) return false;
        if (!eventData) return false;

        let updated = false;

        // Проверка локации
        const isInCorrectLocation = (
            !quest.target.targetX || 
            (eventData.locX !== undefined && eventData.locX === quest.target.targetX && 
             eventData.locY !== undefined && eventData.locY === quest.target.targetY)
        );

        // === DIGGER (Глубинный разведчик) ===
        if (quest.type === 'DIGGER' && eventData.type === 'depth') {
            // Проверяем, что мы в том же подземелье
            if (eventData.locX === quest.target.targetX && eventData.locY === quest.target.targetY) {
                // eventData.currentDepth приходит из game.js, он тоже начинается с 0
                if ((eventData.currentDepth + 1) >= quest.target.targetDepth) {
                    quest.progress = quest.maxProgress;
                    quest.isCompleted = true;
                    if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                        RenderModule.log(`🏆 Квест выполнен: Вы достигли глубины ${eventData.currentDepth + 1}!`, "event");
                    }
                    return true;
                }
            }
        }

        // === HUNT ===
        if (quest.type === 'HUNT' && eventData.type === 'kill') {
            if (eventData.enemyName === quest.target.enemyName && isInCorrectLocation) {
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === BOUNTY ===
        if (quest.type === 'BOUNTY' && eventData.type === 'kill') {
            if (eventData.enemyName === quest.target.enemyName) {
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: Охота на ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === FETCH ===
        if (quest.type === 'FETCH' && eventData.type === 'pickup') {
            // Проверяем тип предмета и имя (для точности)
            const isCorrectItem = (eventData.itemType === quest.target.itemType) && 
                                  (!quest.target.itemName || (eventData.itemName && eventData.itemName.includes(quest.target.itemName)));
            
            if (isCorrectItem && isInCorrectLocation) {
                quest.progress = quest.maxProgress; // Сразу ставим максимум
                quest.isCompleted = true; // Сразу завершаем
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`📦 Предмет для квеста найден!`, "info");
                }
            }
        }

        // === COLLECT ===
        if (quest.type === 'COLLECT' && eventData.type === 'pickup') {
            const isCorrectType = (eventData.itemType === quest.target.itemType);
            
            // Проверяем имя или уникальный ID
            let isCorrectIdentity = false;
            if (quest.target.uniqueId) {
                isCorrectIdentity = (eventData.uniqueId === quest.target.uniqueId);
            } else if (quest.target.itemName) {
                isCorrectIdentity = (eventData.itemName && eventData.itemName.includes(quest.target.itemName));
            } else {
                isCorrectIdentity = true; // Если ничего не указано, считаем любой предмет этого типа верным
            }
                                  
            if (isCorrectType && isCorrectIdentity && isInCorrectLocation) {
                quest.progress++;
                updated = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`Квест: Сбор ${quest.target.itemName} (${quest.progress}/${quest.maxProgress})`, "info");
                }
            }
        }

        // === SCHOLAR ===
        if (quest.type === 'SCHOLAR' && eventData.type === 'read_book') {
            quest.progress++;
            updated = true;
            if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                RenderModule.log(`Квест: Прочитано книг (${quest.progress}/${quest.maxProgress})`, "info");
            }
        }

        // === EXPLORE ===
        if (quest.type === 'EXPLORE' && eventData.type === 'move') {
            const dist = Math.abs(eventData.x - quest.target.targetX) + Math.abs(eventData.y - quest.target.targetY);
            if (dist <= 1) { 
                quest.progress = quest.maxProgress;
                quest.isCompleted = true;
                return true; 
            }
        }

        // Финальная проверка завершения для накопительных квестов
        if (updated && !quest.isCompleted) {
            if (quest.progress >= quest.maxProgress) {
                quest.isCompleted = true;
                if (typeof RenderModule !== 'undefined' && RenderModule.log) {
                    RenderModule.log(`🏆 Квест "${quest.target.locationName}" выполнен! Вернитесь за наградой.`, "event");
                }
            }
        }

        return updated;
    }

    return {
        createQuest: createQuest,
        checkProgress: checkProgress,
        calculateTargetParams: calculateTargetParams, // Экспортируем для использования в других модулях
        MAX_RADIUS: MAX_QUEST_RADIUS
    };

})();
 
``` 
 
### render.js 
 
```js 
 
// =========================== Модуль рендеринга (отрисовка, UI, лог, миникарта + ЭФФЕКТЫ) ===========================
const RenderModule = (function() {
    let display = null;
    let fov = null;
    const COLS = 30;
    const ROWS = 20;
    const FONT_SIZE = 16; 
    const TILE_SIZE = 32; 

    // === СИСТЕМА ЭФФЕКТОВ ===
    let activeEffects = []; 
    let currentCameraOffset = { x: 0, y: 0 };
    let redrawCallback = null;

    // === АСИНХРОННАЯ ИНИЦИАЛИЗАЦИЯ ===
    async function init() {
        if (typeof ROT === 'undefined') {
            alert("Ошибка: Библиотека ROT.js не загрузилась.");
            throw new Error("ROT missing");
        }

        display = new ROT.Display({
            width: COLS,
            height: ROWS,
            fontSize: FONT_SIZE,
            fontFamily: "Consolas, monospace",
            fg: "#ccc",
            bg: "#000",
            forceSquareRatio: true
        });

        const container = document.getElementById("map-container");
        container.innerHTML = "";
        const canvas = display.getContainer();
        container.appendChild(canvas);

        // ✅ СОХРАНЯЕМ КОНТЕКСТ ДЛЯ РУЧНОЙ ОТРИСОВКИ
        RenderModule._ctx = canvas.getContext('2d'); 

        fov = new ROT.FOV.PreciseShadowcasting((x, y) => !MapModule.isWall(x, y));

        const resizeGame = () => {
            if (!canvas) return;
            const fw = container.clientWidth;
            const fh = container.clientHeight;
            const cw = canvas.width;
            const ch = canvas.height;
            const scale = Math.min(fw / cw, fh / ch);
            canvas.style.transform = `scale(${scale})`;
            canvas.style.transformOrigin = "center center";
        };

        window.addEventListener("resize", resizeGame);
        setTimeout(resizeGame, 50);

        console.log("🔄 Загрузка тайлсетов...");
        
        // 1. Ждем загрузки TilesetRenderer (подземелье)
        if (typeof TilesetRenderer !== 'undefined') {
            await TilesetRenderer.init();
            console.log("✅ TilesetRenderer готов!");
        } else {
            console.warn("TilesetRenderer не найден.");
        }

        // Запуск цикла очистки старых эффектов (если есть модуль эффектов)
        if (typeof startEffectLoop === 'function') startEffectLoop();
        
        console.log("🚀 RenderModule полностью инициализирован.");
    }
    // === ОБНОВЛЕНИЕ ТЕКУЩЕГО КВЕСТА В ФУТЕРЕ ===
    // === ОБНОВЛЕНИЕ ТЕКУЩЕГО КВЕСТА В ФУТЕРЕ ===
    function updateQuestBriefing(quest) {
        const el = document.getElementById("ui-quest-briefing");
        if (!el) return;

        if (!quest) {
            el.textContent = " ";
            return;
        }

        let statusIcon = "📜 ";
        if (quest.isCompleted && !quest.isTurnedIn) statusIcon = "🏆 ";
        
        // Формируем краткое описание цели
        let goalText = " ";
        
        if (quest.type === 'FETCH') {
            goalText = `Найти: ${quest.target.itemName}`;
        } 
        else if (quest.type === 'HUNT' || quest.type === 'BOUNTY') {
            // Для BOUNTY и HUNT показываем счетчик убитых
            goalText = `Убить: ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`;
        }
        else if (quest.type === 'COLLECT') {
            goalText = `Собрать: ${quest.target.itemName} (${quest.progress}/${quest.maxProgress})`;
        }
        else if (quest.type === 'SCHOLAR') {
            goalText = `Прочитать книг: (${quest.progress}/${quest.maxProgress})`;
        }
        else if (quest.type === 'EXPLORE') {
            goalText = `Исследовать: ${quest.target.locationName}`;
        }
        else if (quest.type === 'DIGGER') {
            goalText = `Глубина: ${quest.target.targetDepth} в ${quest.target.locationName}`;
        }

        el.innerHTML = `<span style="color:${statusIcon === '🏆' ? '#00ff00' : 'var(--gold)'}">${statusIcon} ${goalText}</span>`;
    }


    
    // === ДОБАВЛЕНИЕ ЭФФЕКТОВ ===
    function addBlinkEffect(x, y, duration = 500, color = null) {
        activeEffects.push({
            type: 'blink',
            x: x, y: y,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            duration: duration,
            color: color || "rgba(255, 0, 0, 0.5)"
        });
    }

    function addProjectileEffect(sx, sy, tx, ty, duration = 300) {
        activeEffects.push({
            type: 'projectile',
            sx: sx, sy: sy,
            tx: tx, ty: ty,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            duration: duration
        });
    }

    // === ОТРИСОВКА ЭФФЕКТОВ (вызывается внутри draw) ===
    function drawEffects(ctx, cam) {
        const now = Date.now();
        const tileW = TILE_SIZE; 
        const tileH = TILE_SIZE;

        for (let i = activeEffects.length - 1; i >= 0; i--) {
            const effect = activeEffects[i];
            
            if (now > effect.endTime) {
                activeEffects.splice(i, 1);
                continue;
            }

            if (effect.type === 'blink') {
                const progress = (effect.endTime - now) / effect.duration;
                const alpha = Math.abs(Math.sin(now * 0.015)) * 0.6; 
                
                let baseColor = effect.color;
                if (baseColor.startsWith('rgba')) {
                    baseColor = baseColor.replace(/[\d\.]+\)$/g, `${alpha})`);
                } else {
                    baseColor = `rgba(255, 0, 0, ${alpha})`; 
                }
                
                ctx.fillStyle = baseColor;
                
                const screenX = (effect.x - cam.x) * tileW;
                const screenY = (effect.y - cam.y) * tileH;
                
                if (screenX >= -tileW && screenX < COLS * tileW && screenY >= -tileH && screenY < ROWS * tileH) {
                    ctx.fillRect(screenX, screenY, tileW, tileH);
                }
            } 
            else if (effect.type === 'projectile') {
                const totalTime = effect.duration;
                const elapsed = now - effect.startTime;
                const t = Math.min(1, elapsed / totalTime);

                const worldCurX = effect.sx + (effect.tx - effect.sx) * t;
                const worldCurY = effect.sy + (effect.ty - effect.sy) * t;

                const screenCurX = (worldCurX - cam.x) * tileW + tileW / 2;
                const screenCurY = (worldCurY - cam.y) * tileH + tileH / 2;

                ctx.save();
                ctx.fillStyle = "#FFFF00"; 
                ctx.font = `bold 12px Consolas, monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "black";
                ctx.shadowBlur = 4;
                ctx.fillText("*", screenCurX, screenCurY);
                ctx.restore();
            }
        }
    }

    function getCameraOffset(player) {
        const cam = {
            x: player.x - Math.floor(COLS / 2),
            y: player.y - Math.floor(ROWS / 2)
        };
        currentCameraOffset = cam;
        return cam;
    }
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ОТРИСОВКА БОССА 2x2 ===
    function drawBoss(ctx, bossType, sx, sy, color) {
        let prefix = 'BOSS_DRAGON'; 
        if (bossType.includes('Голем')) prefix = 'BOSS_GOLEM';
        else if (bossType.includes('Лич')) prefix = 'BOSS_LICH';
        else if (bossType.includes('Паук')) prefix = 'BOSS_DRAGON'; // Заглушка, добавьте свои ключи

        const parts = [
            { key: `${prefix}_TL`, dx: 0, dy: 0 },
            { key: `${prefix}_TR`, dx: 1, dy: 0 },
            { key: `${prefix}_BL`, dx: 0, dy: 1 },
            { key: `${prefix}_BR`, dx: 1, dy: 1 }
        ];

        parts.forEach(part => {
            const drawX = sx + part.dx;
            const drawY = sy + part.dy;
            if (drawX >= 0 && drawX < COLS && drawY >= 0 && drawY < ROWS) {
                // Вызываем новый метод, который мы добавили в TilesetRenderer
                if (typeof TilesetRenderer.drawByKey === 'function') {
                    TilesetRenderer.drawByKey(ctx, part.key, drawX, drawY, color);
                }
            }
        });
    }
    // === ОТРИСОВКА ПОДЗЕМЕЛЬЯ (Использует TilesetRenderer) ===
    function draw(player, enemies, items, npcs = []) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Проверка готовности рендерера
        if (typeof TilesetRenderer === 'undefined' || !TilesetRenderer.isReady()) {
            ctx.fillStyle = '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Loading...", ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        const cam = getCameraOffset(player);

        const visible = new Set();
        fov.compute(player.x, player.y, 25, (x, y, r, vis) => {
            if (vis) visible.add(`${x},${y}`);
        });

        // 1. РИСУЕМ ТАЙЛЫ
        // 1. РИСУЕМ ТАЙЛЫ
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const wx = sx + cam.x;
                const wy = sy + cam.y;
                
                if (wx < 0 || wx >= DataModule.MAP_WIDTH || wy < 0 || wy >= DataModule.MAP_HEIGHT) continue;

                const isVisible = visible.has(`${wx},${wy}`);
                let ch, fg;

                // === ПРОВЕРКА НА МАГАЗИН И ПОСТОЯЛЫЙ ДВОР ===
                let shopDecor = null;
                let innDecor = null;

                if (window.currentShopCoords) {
                    const shopTile = window.currentShopCoords.find(pos => pos.x === wx && pos.y === wy);
                    if (shopTile) {
                        shopDecor = shopTile.decor;
                    }
                }
                
                if (window.currentInnCoords) {
                    const innTile = window.currentInnCoords.find(pos => pos.x === wx && pos.y === wy);
                    if (innTile) {
                        innDecor = innTile.decor;
                    }
                }

                if (MapModule.isWall(wx, wy)) {
                    ch = dtype.wallChar;
                    fg = isVisible ? dtype.wallColor : '#222';
                } else {
                    // 1. Приоритет: Кровать в постоялом дворе
                    if (innDecor) {
                        ch = innDecor; 
                        // Цвет дерева/кровати (коричневый/бежевый)
                        fg = isVisible ? '#D2B48C' : '#3e1f09'; 
                    } 
                    // 2. Декор магазина (оружие, зелья на полу)
                    else if (shopDecor) {
                        ch = shopDecor;
                        fg = isVisible ? '#8B4513' : '#3e1f09'; 
                    } 
                    // 3. Обычный пол
                    else {
                        ch = dtype.floorChar;
                        fg = isVisible ? dtype.floorColor : '#111';
                    }
                }

                if (MapModule.stairsUp && wx === MapModule.stairsUp.x && wy === MapModule.stairsUp.y) {
                    ch = ">"; fg = isVisible ? "#FFF" : "#333";
                }
                if (MapModule.stairsDown && wx === MapModule.stairsDown.x && wy === MapModule.stairsDown.y) {
                    ch = "<"; fg = isVisible ? "#888" : "#222";
                }

                // Используем TilesetRenderer для подземелья
                TilesetRenderer.draw(ctx, ch, sx, sy, fg);
            }
        }
        // 2. ПРЕДМЕТЫ
        if (items) {
            items.forEach(i => {
                const sx = i.x - cam.x, sy = i.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                    TilesetRenderer.draw(ctx, i.char, sx, sy, i.color);
                }
            });
        }

        // 3. ВРАГИ (включая боссов 2x2)
        if (enemies) {
            enemies.forEach(e => {
                if (e.hp > 0) {
                    const sx = e.x - cam.x, sy = e.y - cam.y;
                    
                    // Проверяем видимость хотя бы одной части босса
                    const isVisible = visible.has(`${e.x},${e.y}`);
                    
                    if (sx >= -2 && sx < COLS && sy >= -2 && sy < ROWS && isVisible) {
                        if (e.isBoss) {
                            // === ОТРИСОВКА БОССА 2x2 ИЗ 4 ЧАСТЕЙ ===
                            // Определяем префикс ключей в зависимости от типа босса
                            let prefix = 'BOSS_DRAGON'; 
                            if (e.bossType.includes('Голем')) prefix = 'BOSS_GOLEM';
                            else if (e.bossType.includes('Лич')) prefix = 'BOSS_LICH';
                            
                            // Рисуем 4 тайла: TL (Top-Left), TR, BL, BR
                            TilesetRenderer.drawByKey(ctx, `${prefix}_TL`, sx, sy, e.color);       // Верх-Лево
                            TilesetRenderer.drawByKey(ctx, `${prefix}_TR`, sx + 1, sy, e.color);   // Верх-Право
                            TilesetRenderer.drawByKey(ctx, `${prefix}_BL`, sx, sy + 1, e.color);   // Низ-Лево
                            TilesetRenderer.drawByKey(ctx, `${prefix}_BR`, sx + 1, sy + 1, e.color); // Низ-Право
                        } else {
                            // Обычный враг
                            TilesetRenderer.draw(ctx, e.char, sx, sy, e.color);
                        }
                    }
                }
            });
        }
        // 4. NPC
        if (window.currentCityNpcs) {
            window.currentCityNpcs.forEach(npc => {
                const sx = npc.x - cam.x, sy = npc.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${npc.x},${npc.y}`)) {
                    TilesetRenderer.draw(ctx, npc.char, sx, sy, npc.color);
                }
            });
        }

        // 5. ИГРОК
        if (player) {
            const px = Math.floor(COLS / 2);
            const py = Math.floor(ROWS / 2);
            TilesetRenderer.draw(ctx, player.char, px, py, player.color);
        }

        // 6. ЭФФЕКТЫ
        drawEffects(ctx, cam);

        return visible;
    }

    // === ОТРИСОВКА ГЛОБАЛЬНОЙ КАРТЫ (Использует TilesetRenderer) ===
    function drawGlobalMap(centerX, centerY) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Проверка готовности
        if (typeof TilesetRenderer === 'undefined' || !TilesetRenderer.isReady()) {
            ctx.fillStyle = '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Loading World...", ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

        const halfW = Math.floor(COLS / 2);
        const halfH = Math.floor(ROWS / 2);

        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const gx = centerX + sx - halfW;
                const gy = centerY + sy - halfH;

                let tileType = 'plain';
                if (typeof GlobalMapModule !== 'undefined') {
                    tileType = GlobalMapModule.getDisplayTileType ? GlobalMapModule.getDisplayTileType(gx, gy) : GlobalMapModule.getTileType(gx, gy);
                }

                let ch, fg;
                switch(tileType) {
                    case 'plain': ch = '░'; fg = '#2e8b57'; break;
                    case 'forest': ch = 'T'; fg = '#336649'; break;
                    case 'mountain': ch = '^'; fg = '#a0a0a0'; break;
                    case 'water': ch = '≈'; fg = '#4682b4'; break;
                    case 'city': ch = 'C'; fg = '#ffd700'; break;
                    case 'dungeon_entrance': ch = 'D'; fg = '#cd5c5c'; break;
                    case 'road': ch = '─'; fg = '#b8860b'; break;
                    default: ch = '·'; fg = '#555';
                }

                // Игрок
                if (gx === centerX && gy === centerY) {
                    ch = '@'; fg = '#fff';
                }

                // Используем TilesetRenderer для глобальной карты
                TilesetRenderer.draw(ctx, ch, sx, sy, fg);
            }
        }
    }
     
    function drawGlobalMinimap(centerX, centerY) {
        const cvs = document.getElementById("minimap");
        if (!cvs) return;
        
        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        
        const MINIMAP_SIZE = 50; 
        const cellW = cvs.width / MINIMAP_SIZE;
        const cellH = cvs.height / MINIMAP_SIZE;
        const startX = centerX - Math.floor(MINIMAP_SIZE / 2);
        const startY = centerY - Math.floor(MINIMAP_SIZE / 2);
    
        for (let dy = 0; dy < MINIMAP_SIZE; dy++) {
            for (let dx = 0; dx < MINIMAP_SIZE; dx++) {
                const gx = startX + dx;
                const gy = startY + dy;
                
                let displayType = 'plain';
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getDisplayTileType) {
                    displayType = GlobalMapModule.getDisplayTileType(gx, gy);
                }
                
                let color;
                switch(displayType) {
                    case 'plain': color = '#555'; break;
                    case 'forest': color = '#2e8b57'; break;
                    case 'mountain': color = '#888'; break;
                    case 'water': color = '#4682b4'; break;
                    case 'city': color = '#ffd700'; break;
                    case 'dungeon_entrance': color = '#cd5c5c'; break;
                    case 'road': color = '#b8860b'; break;
                    default: color = '#333';
                }
                
                if (gx === centerX && gy === centerY) color = '#0f0'; // Игрок
                
                ctx.fillStyle = color;
                ctx.fillRect(dx * cellW, dy * cellH, cellW + 0.5, cellH + 0.5);
            }
        }
    }

    // === ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (UI) ===
    function updateUI(player, locData, worldTrend) {
        if (locData) {
            document.getElementById("ui-loc-name").textContent = locData.fullName;
            
            if (worldTrend && worldTrend.name !== "Обычный уровень") {
                document.getElementById("ui-loc-name").style.color = worldTrend.color;
            } else {
                document.getElementById("ui-loc-name").style.color = "var(--accent)";
            }
        }

        // === ЛОГИКА КОМПАСА / ВЫХОДА ===
        const exitEl = document.getElementById("ui-loc-coords");
        if (exitEl) {
            // Проверяем, находимся ли мы в подземелье (не на поверхности)
            const isDungeon = locData && locData.themeName !== "Поверхность";
            
            if (isDungeon && MapModule.stairsUp) {
                // МЫ В ПОДЗЕМЕЛЬЕ: Показываем стрелку к выходу (стандартная логика)
                const sx = MapModule.stairsUp.x, sy = MapModule.stairsUp.y;
                const dx = sx - player.x, dy = sy - player.y;
                
                let arrow = (dx === 0 && dy === 0) ? '🏠' : '';
                if (!arrow) {
                    if (dy < 0) arrow += '↑'; 
                    else if (dy > 0) arrow += '↓';
                    if (dx > 0) arrow += '→'; 
                    else if (dx < 0) arrow += '←';
                    
                    if (arrow === '↑←') arrow = '↖';
                    if (arrow === '↑→') arrow = '↗';
                    if (arrow === '↓←') arrow = '↙';
                    if (arrow === '↓→') arrow = '↘';
                }
                exitEl.textContent = `Выход: ${arrow}`;
            } 
            // ЕСЛИ МЫ НА ПОВЕРХНОСТИ (ГЛОБАЛЬНАЯ КАРТА):
            // Мы НИЧЕГО не пишем сюда. 
            // Элемент остается как есть, а GameModule.updateQuestCompass() заполнит его стрелкой квеста или координатами.
        }
        
        // === СТАТИСТИКА И ИНВЕНТАРЬ ===
        if (player && player.hp !== undefined) {
            
            // === ПОЛУЧЕНИЕ ДАННЫХ ОБ ЭФФЕКТАХ ===
            let atkText = `${player.atk}`;
            let defText = `${player.def}`;

            // Проверяем наличие модуля эффектов и активных баффов
            if (typeof EffectSystemModule !== 'undefined') {
                const atkDuration = EffectSystemModule.getEffectDuration(player, EffectSystemModule.TYPES.BUFF_ATK);
                const defDuration = EffectSystemModule.getEffectDuration(player, EffectSystemModule.TYPES.BUFF_DEF);

                if (atkDuration > 0) {
                    // Оранжевый цвет для силы, маленький шрифт
                    atkText += ` <span style="font-size:0.8em; color:#ff9800">(${atkDuration})</span>`;
                }
                if (defDuration > 0) {
                    // Голубой цвет для защиты, маленький шрифт
                    defText += ` <span style="font-size:0.8em; color:#00bcd4">(${defDuration})</span>`;
                }
            }

            // Цвет выносливости меняется на красный при низких значениях
            const staminaColor = player.stamina < 20 ? 'var(--danger)' : '#4CAF50';

            document.getElementById("ui-stats").innerHTML = `
                 <div class="stat-row"><span>HP</span> <span class="val-hp">${player.hp}/${player.maxHp}</span></div>
                 <div class="stat-row"><span>Выносл.</span> <span style="color:${staminaColor}">${player.stamina}/${player.maxStamina}</span></div>
                 <div class="stat-row"><span>Атака</span> <span class="val-atk">${atkText}</span></div>
                <div class="stat-row"><span>Защита</span> <span class="val-def">${defText}</span></div>
                <div class="stat-row"><span>Уровень</span> <span>${player.level}</span></div>
                <div class="stat-row"><span>Золото</span> <span style="color: #FFD700">$ ${player.gold}</span></div>
            `;
            
            const w = player.equipment.weapon ? 
                (player.equipment.weapon.maxAmmo > 0 ? 
                    `${player.equipment.weapon.name} (${player.equipment.weapon.currentAmmo})` : 
                    player.equipment.weapon.name) 
                : "—";
                
            const a = player.equipment.armor ? player.equipment.armor.name : "—";
            
            document.getElementById("ui-equip").innerHTML = `
                <div class="equip-slot">Рука: <span class="equip-item">${w}</span></div>
                <div class="equip-slot">Тело: <span class="equip-item">${a}</span></div>
            `;

            const invDiv = document.getElementById("inventory-list");
            if (invDiv) {
                invDiv.innerHTML = "";
                if (player.inventory.length === 0) {
                    invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
                } else {
                    const grouped = {};
                    const order = []; 
                    player.inventory.forEach((item, originalIndex) => {
                        const key = `${item.name}_${item.type}_${item.maxAmmo || 0}`;
                        if (!grouped[key]) {
                            grouped[key] = { item: item, count: 0, indices: [] };
                            order.push(key);
                        }
                        grouped[key].count++;
                        grouped[key].indices.push(originalIndex);
                    });

                    order.forEach(key => {
                        const group = grouped[key];
                        const item = group.item;
                        const div = document.createElement("div");
                        div.className = "inv-item";
                        
                        // Уникальные предметы выделяем фиолетовым или золотым, игнорируя их базовый цвет
                        div.style.color = item.isUnique ? "#d29922" : item.color; 
                        div.style.fontWeight = item.isUnique ? "bold" : "normal";

                        let html = `${item.char} ${item.isUnique ? '🌟 ' : ''}${item.name}`;
                        
                        if (item.val && !item.isUnique) html += ` (+${item.val})`;
                        if (item.isUnique) {
                            // Показываем реальные статы уникального предмета в инвентаре
                            const stats = [];
                            if (item.uniqueAtk) stats.push(`Атк:${item.uniqueAtk}`);
                            if (item.uniqueDef) stats.push(`Защ:${item.uniqueDef}`);
                            if (stats.length > 0) html += ` <span style="opacity:0.8;font-size:10px">[${stats.join(', ')}]</span>`;
                        }

                        if (group.count > 1) {
                            html += ` <span style="opacity:0.7">(${group.count})</span>`;
                        } else if (item.maxAmmo > 0) {
                            html += ` <span style="opacity:0.7">[${item.currentAmmo}]</span>`;
                        }
                        
                        div.innerHTML = html;
                        div.onclick = () => CombatModule.useItem(player, group.indices[0], log, () => updateUI(player, locData, worldTrend));
                        invDiv.appendChild(div);
                    });
                }
            }
        }
    }

    function log(msg, type = "info") {
        const list = document.getElementById("log-list");
        if (!list) return;

        const div = document.createElement("div");
        div.className = `log-msg log-${type}`;
        div.textContent = `> ${msg}`;
        
        // 1. Добавляем новое сообщение в КОНЕЦ списка (стандартный поток)
        list.appendChild(div);
        
        // 2. Ограничиваем историю (удаляем самые СТАРЫЕ сообщения сверху)
        if (list.children.length > 50) {
            list.removeChild(list.firstChild);
        }

        // 3. Железобетонная прокрутка вниз для мобильных браузеров
        // setTimeout дает браузеру 10 мс на то, чтобы физически отрисовать новый div 
        // и корректно пересчитать list.scrollHeight
        setTimeout(() => {
            list.scrollTop = list.scrollHeight;
        }, 10);
    }

    function drawMinimap(player, explored) {
        const cvs = document.getElementById("minimap");
        if (!cvs || !player) return;
        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#000"; 
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        const cw = cvs.width / DataModule.MAP_WIDTH;
        const ch = cvs.height / DataModule.MAP_HEIGHT;
        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        explored.forEach(k => {
            const [x, y] = k.split(',').map(Number);
            ctx.fillStyle = MapModule.isWall(x, y) ? dtype.wallColor : dtype.floorColor;
            ctx.globalAlpha = 0.5; 
            ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
            ctx.globalAlpha = 1.0;
        });
        ctx.fillStyle = "#0F0";
        ctx.fillRect(player.x * cw, player.y * ch, cw + 1, ch + 1);
    }

    function updateInspector(title, details, type = "neutral") {
        const div = document.getElementById("ui-inspector");
        if (!div) return;
        let color = "var(--text-dim)";
        if (type === "enemy") color = "var(--danger)";
        if (type === "loot") color = "var(--gold)";
        if (type === "npc") color = "var(--accent)";
        div.innerHTML = `
            <div style="color: ${color}; font-weight: bold; margin-bottom: 4px;">${title}</div>
            <div style="white-space: pre-line;">${details}</div>
        `;
    }

    function setRedrawCallback(callback) {
        redrawCallback = callback;
    }

    function requestRedraw() {
        if (redrawCallback) {
            redrawCallback();
        }
    }
    // === ОТРИСОВКА ОКНА МАГАЗИНА ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    function drawShopWindow(merchantInv, playerGold) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;
        // === НАСТРОЙКИ ДЛЯ ЧЕТКОГО ТЕКСТА ===
        // Отключаем сглаживание шрифтов (делает края жесткими)
        ctx.fontKerning = 'none'; 
        ctx.textRendering = 'geometricPrecision'; // Помогает сохранить геометрию букв
        window.shopClickAreas = []; 

        // === ИНИЦИАЛИЗАЦИЯ ПЕРЕМЕННЫХ СТРАНИЦ ===
        if (typeof window.shopPageMerchant === 'undefined') window.shopPageMerchant = 0;
        if (typeof window.shopPagePlayer === 'undefined') window.shopPagePlayer = 0;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const winW = ctx.canvas.width * 0.90;  // Было 0.95
        const winH = ctx.canvas.height * 0.60; // Было 0.90
        const winX = (ctx.canvas.width - winW) / 2;
        const winY = (ctx.canvas.height - winH) / 2;
        const midX = ctx.canvas.width / 2;
        
        ctx.fillStyle = '#161b22';
        ctx.strokeStyle = '#d29922';
        ctx.lineWidth = 2;
        ctx.fillRect(winX, winY, winW, winH);
        ctx.strokeRect(winX, winY, winW, winH);

        // Заголовок и кнопка выхода
        ctx.font = 'bold 14px Consolas, monospace';
        ctx.textBaseline = 'middle';
        const titleText = "🏪 ЛАВКА ТОРГОВЦА";
        const titleWidth = ctx.measureText(titleText).width;
        ctx.fillStyle = '#d29922';
        ctx.textAlign = 'center';
        ctx.fillText(titleText, ctx.canvas.width / 2, winY + 25);

        const btnText = "❌ ВЫЙТИ";
        ctx.font = 'bold 10px Consolas, monospace';
        const btnWidth = ctx.measureText(btnText).width + 16;
        const btnHeight = 24;
        const btnX = (ctx.canvas.width / 2) + (titleWidth / 2) + 20;
        const btnY = winY + 13;

        ctx.fillStyle = '#da3633';
        ctx.fillRect(btnX, btnY - btnHeight/2, btnWidth, btnHeight);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(btnText, btnX + btnWidth / 2, btnY);
        window.shopExitButton = { x: btnX, y: btnY - btnHeight/2, w: btnWidth, h: btnHeight };

        ctx.beginPath();
        ctx.moveTo(midX, winY + 45);
        ctx.lineTo(midX, winY + winH - 40);
        ctx.strokeStyle = '#30363d';
        ctx.stroke();

        ctx.font = 'bold 12px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.fillText("ТОВАРЫ", winX + 15, winY + 60);
        ctx.textAlign = 'right';
        ctx.fillText("ВАШ ИНВЕНТАРЬ", ctx.canvas.width - winX - 15, winY + 60);

        // === НАСТРОЙКИ СПИСКА ===
        ctx.font = '11px Consolas, monospace';
        ctx.textBaseline = 'alphabetic';
        let y = winY + 85;
        const itemHeight = 16; 
        const maxItemsPerCol = 10; 

        // === РАСЧЕТ СТРАНИЦ (ПЕРЕНЕСЕНО СЮДА ДЛЯ ДОСТУПНОСТИ) ===
        const totalMerchantPages = Math.ceil(merchantInv.items.length / maxItemsPerCol) || 1;
        
        // Получаем игрока заранее, чтобы рассчитать страницы
        let player = null;
        let totalPlayerPages = 1;
        if (typeof GameModule !== 'undefined') {
            player = GameModule.getPlayer();
            if (player) {
                totalPlayerPages = Math.ceil(player.inventory.length / maxItemsPerCol) || 1;
            }
        }

        // === ЛЕВАЯ КОЛОНКА (Торговец) ===
        const startIdxM = window.shopPageMerchant * maxItemsPerCol;
        const endIdxM = startIdxM + maxItemsPerCol;

        ctx.textAlign = 'left';
        merchantInv.items.slice(startIdxM, endIdxM).forEach((item, i) => {
            const index = startIdxM + i;
            if (y > winY + winH - 50) return;
            
            ctx.fillStyle = item.color;
            ctx.fillText(`${index + 1}. ${item.name}`, winX + 15, y);
            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'right';
            ctx.fillText(`${item.price}$`, midX - 15, y);
            ctx.textAlign = 'left';
            
            window.shopClickAreas.push({
                x: winX, y: y - 12, w: midX - winX, h: itemHeight,
                action: 'buy', index: index
            });
            y += itemHeight;
        });

        // === ПРАВАЯ КОЛОНКА (Игрок) ===
        if (player) {
            const startIdxP = window.shopPagePlayer * maxItemsPerCol;
            const endIdxP = startIdxP + maxItemsPerCol;

            ctx.textAlign = 'right';
            y = winY + 85;
            
            player.inventory.slice(startIdxP, endIdxP).forEach((item, i) => {
                const index = startIdxP + i;
                if (y > winY + winH - 50) return;                    
                ctx.fillStyle = item.color;
                ctx.fillText(`${index + 1}. ${item.name}`, ctx.canvas.width - winX - 15, y);


                
                const sellPrice = Math.floor(item.price ? item.price * 0.5 : item.val * 2);
                ctx.fillStyle = '#ffd700';
                ctx.textAlign = 'left';
                ctx.fillText(`${sellPrice}$`, midX + 15, y);
                ctx.textAlign = 'right';
                
                window.shopClickAreas.push({
                    x: midX, y: y - 12, w: ctx.canvas.width - winX - midX, h: itemHeight,
                    action: 'sell', index: index
                });
                y += itemHeight;
            });
        }

        // === НИЖНЯЯ ПАНЕЛЬ: ЗОЛОТО И НАВИГАЦИЯ ===
        const bottomY = winY + winH - 15; 

        // 1. Золото торговца (слева)
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`💰 Торговец: ${merchantInv.gold}`, winX + 15, bottomY);

        // 2. Золото игрока (справа)
        ctx.textAlign = 'right';
        ctx.fillText(`💰 Вы: ${playerGold}`, ctx.canvas.width - winX - 15, bottomY);

        // 3. Навигация торговца
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Стр. ${window.shopPageMerchant + 1}/${totalMerchantPages}`, (winX + midX)/2, bottomY - 15);
        
        if (window.shopPageMerchant > 0) {
            ctx.fillStyle = '#58a6ff';
            ctx.fillText("<", winX + 30, bottomY - 15);
            window.shopClickAreas.push({ x: winX + 10, y: bottomY - 25, w: 40, h: 20, action: 'prev_m' });
        }
        if (window.shopPageMerchant < totalMerchantPages - 1) {
            ctx.fillStyle = '#58a6ff';
            ctx.fillText(">", midX - 30, bottomY - 15);
            window.shopClickAreas.push({ x: midX - 50, y: bottomY - 25, w: 40, h: 20, action: 'next_m' });
        }

        // 4. Навигация игрока (теперь totalPlayerPages точно определена)
        if (player) {
            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'center';
            ctx.fillText(`Стр. ${window.shopPagePlayer + 1}/${totalPlayerPages}`, (midX + ctx.canvas.width - winX)/2, bottomY - 15);

            if (window.shopPagePlayer > 0) {
                ctx.fillStyle = '#58a6ff';
                ctx.fillText("<", midX + 30, bottomY - 15);
                window.shopClickAreas.push({ x: midX + 10, y: bottomY - 25, w: 40, h: 20, action: 'prev_p' });
            }
            if (window.shopPagePlayer < totalPlayerPages - 1) {
                ctx.fillStyle = '#58a6ff';
                ctx.fillText(">", ctx.canvas.width - winX - 30, bottomY - 15);
                window.shopClickAreas.push({ x: ctx.canvas.width - winX - 50, y: bottomY - 25, w: 40, h: 20, action: 'next_p' });
            }
        }
    }
    // === ОТРИСОВКА ОКНА КВЕСТА (СЮЖЕТНОГО) ===
    function drawQuestWindow(quest, isCompleted) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        // Очищаем экран и рисуем затемнение
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Параметры окна
        // Параметры окна
        // === ИЗМЕНЕНИЕ РАЗМЕРОВ ДЛЯ ПК (УМЕНЬШЕНО НА ~30%) ===
        const winW = ctx.canvas.width * 0.90;  // Было 0.80
        const winH = ctx.canvas.height * 0.60; // Было 0.60 (оставил таким же для баланса)
        const winX = (ctx.canvas.width - winW) / 2;
        const winY = (ctx.canvas.height - winH) / 2;
        
        // Фон и рамка
        ctx.fillStyle = '#161b22';
        ctx.strokeStyle = quest.isChainQuest ? '#d29922' : '#58a6ff'; // Золото для сюжета, синий для обычного
        ctx.lineWidth = 2;
        ctx.fillRect(winX, winY, winW, winH);
        ctx.strokeRect(winX, winY, winW, winH);

        // Заголовок
        ctx.font = 'bold 14px Consolas, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = quest.isChainQuest ? '#d29922' : '#fff';
        
        const titleText = isCompleted ? "🏆 КВЕСТ ВЫПОЛНЕН" : "📜 НОВЫЙ КВЕСТ";
        ctx.fillText(titleText, ctx.canvas.width / 2, winY + 30);

        // Текст описания (с переносом строк)
        ctx.font = '10px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#c9d1d9';

        const text = isCompleted ? (quest.turnInText || "Награда получена!") : quest.briefing;
        const maxWidth = winW - 40;
        const lineHeight = 20;
        let y = winY + 60;

        // Простой алгоритм переноса слов
        const words = text.split(' ');
        let line = '';
        
        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, winX + 20, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, winX + 20, y);

        // Награда (если есть)
        if (quest.rewardGold) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 14px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`💰 Награда: ${quest.rewardGold} золотых`, ctx.canvas.width / 2, winY + winH - 60);
        }

        // Кнопка "ЗАКРЫТЬ"
        const btnText = "❌ ЗАКРЫТЬ";
        ctx.font = 'bold 14px Consolas, monospace';
        const btnWidth = 120;
        const btnHeight = 30;
        const btnX = (ctx.canvas.width - btnWidth) / 2;
        const btnY = winY + winH - 40;

        ctx.fillStyle = '#da3633';
        ctx.fillRect(btnX, btnY, btnWidth, btnHeight);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btnText, ctx.canvas.width / 2, btnY + btnHeight / 2);

        // Сохраняем зону клика для кнопки
        window.questCloseButton = { x: btnX, y: btnY, w: btnWidth, h: btnHeight };
    }
    function drawInnWindow(gold, stamina, maxStamina) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;
        
        // ✅ ИСПРАВЛЕНИЕ: Получаем canvas из контекста
        const canvas = ctx.canvas; 
        window.innClickAreas = [];

        // === 1. УМНОЕ ЗАТЕМНЕНИЕ ФОНА (Оставляем окно лога видимым) ===
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        
        const logPanel = document.getElementById('log-panel');
        let logRect = null;
        if (logPanel) {
            const canvasRect = canvas.getBoundingClientRect();
            const panelRect = logPanel.getBoundingClientRect();
            
            const scaleX = canvas.width / canvasRect.width;
            const scaleY = canvas.height / canvasRect.height;
            
            logRect = {
                x: (panelRect.left - canvasRect.left) * scaleX,
                y: (panelRect.top - canvasRect.top) * scaleY,
                w: panelRect.width * scaleX,
                h: panelRect.height * scaleY
            };
        }

        if (logRect) {
            ctx.fillRect(0, 0, canvas.width, logRect.y);
            ctx.fillRect(0, logRect.y, logRect.x, canvas.height - logRect.y);
            ctx.fillRect(logRect.x + logRect.w, logRect.y, canvas.width - (logRect.x + logRect.w), canvas.height - logRect.y);
        } else {
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // === 2. НАСТРОЙКИ ОКНА (МАКСИМАЛЬНЫЙ РАЗМЕР, МИНИМАЛЬНЫЕ ОТСТУПЫ) ===
        const winW = canvas.width * 0.92;  
        const winH = canvas.height * 0.70; 
        const winX = (canvas.width - winW) / 2;
        const winY = (canvas.height - winH) / 2;
        const padding = 12; 

        // Рисуем само окно
        ctx.fillStyle = '#161b22';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        ctx.fillRect(winX, winY, winW, winH);
        ctx.strokeRect(winX, winY, winW, winH);

        // Заголовок (компактный)
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#D2B48C';
        ctx.fillText('🏨 ПОСТОЯЛЫЙ ДВОР', canvas.width / 2, winY + 20);

        // === 3. ЗОЛОТО (Желтым цветом, компактно) ===
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`💰 Золото: ${gold}`, winX + padding, winY + 45);

        // Поле статуса с ПЕРЕНОСОМ СТРОК (мелкий шрифт)
        ctx.font = '10px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#c9d1d9';
        
        const statusText = window.innStatusMessage || "Выберите действие...";
        const maxWidth = winW - (padding * 2);
        const lineHeight = 12; 
        
        // Функция для разбивки текста на строки
        function wrapText(context, text, x, y, maxW, lineH) {
            const words = text.split(' ');
            let line = '';
            let currentY = y;

            for(let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = context.measureText(testLine);
                
                if (metrics.width > maxW && n > 0) {
                    context.fillText(line, x, currentY);
                    line = words[n] + ' ';
                    currentY += lineH;
                } else {
                    line = testLine;
                }
            }
            context.fillText(line, x, currentY);
            return currentY;
        }

        // Рисуем статус и получаем координату Y после него
        const lastStatusY = wrapText(ctx, statusText, canvas.width / 2, winY + 65, maxWidth, lineHeight);

        // === 4. КНОПКИ (Компактные) ===
        const btnW = winW - (padding * 2);
        const btnH = 22; 
        let btnY = lastStatusY + 12; 

        const buttons = [
            { text: `🛌 Ночлег (Восстановить выносливость) - 20 золотых`, action: 'rest', color: '#238636' },
            { text: '🗣️ Послушать слухи (Бесплатно)', action: 'rumor', color: '#1f6feb' },
            { text: '🎲 Сыграть в кости (Ставка 10 золотых)', action: 'dice', color: '#8b5cf6' },
            { text: '❌ Выйти', action: 'exit', color: '#da3633' }
        ];

        ctx.font = 'bold 10px Consolas, monospace'; 
        ctx.textAlign = 'center';

        buttons.forEach(btn => {
            // Проверка: если кнопки не влезают в окно, останавливаемся
            if (btnY + btnH > winY + winH - 5) return;

            ctx.fillStyle = btn.color;
            ctx.fillRect(winX + padding, btnY, btnW, btnH);
            
            ctx.fillStyle = '#ffffff';
            ctx.fillText(btn.text, canvas.width / 2, btnY + btnH / 2);
            
            window.innClickAreas.push({
                x: winX + padding, y: btnY, w: btnW, h: btnH,
                action: btn.action
            });
            
            btnY += btnH + 4; 
        });
    }
    
    return {
        init,
        draw,
        drawGlobalMap,
        drawGlobalMinimap,
        updateUI,
        log,
        drawMinimap,
        getCameraOffset,
        updateInspector,
        setRedrawCallback,
        requestRedraw,
        addBlinkEffect,
        addProjectileEffect,
        updateQuestBriefing,
        drawShopWindow,
        drawQuestWindow,
        drawInnWindow, // <--- НОВОЕ// <--- ДОБАВИТЬ ЭТУ СТРОКУ
        COLS,
        ROWS,
        _ctx: null, 
        TILE_SIZE   
    };
})();
 
``` 
 
### rot.min.js 
 
```js 
 
function _assertThisInitialized(r){if(void 0===r)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return r}
function _createForOfIteratorHelperLoose(r,y){var x="undefined"!==typeof Symbol&&r[Symbol.iterator]||r["@@iterator"];if(x)return(x=x.call(r)).next.bind(x);if(Array.isArray(r)||(x=_unsupportedIterableToArray(r))||y&&r&&"number"===typeof r.length){x&&(r=x);var E=0;return function(){return E>=r.length?{done:!0}:{done:!1,value:r[E++]}}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");}
function _unsupportedIterableToArray(r,y){if(r){if("string"===typeof r)return _arrayLikeToArray(r,y);var x=Object.prototype.toString.call(r).slice(8,-1);"Object"===x&&r.constructor&&(x=r.constructor.name);if("Map"===x||"Set"===x)return Array.from(r);if("Arguments"===x||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(x))return _arrayLikeToArray(r,y)}}function _arrayLikeToArray(r,y){if(null==y||y>r.length)y=r.length;for(var x=0,E=Array(y);x<y;x++)E[x]=r[x];return E}
function _inheritsLoose(r,y){r.prototype=Object.create(y.prototype);r.prototype.constructor=r;_setPrototypeOf(r,y)}function _setPrototypeOf(r,y){_setPrototypeOf=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(x,E){x.__proto__=E;return x};return _setPrototypeOf(r,y)}
(function(r,y){"object"===typeof exports&&"undefined"!==typeof module?y(exports):"function"===typeof define&&define.amd?define(["exports"],y):(r="undefined"!==typeof globalThis?globalThis:r||self,y(r.ROT={}))})(this,function(r){function y(k,h){return(k%h+h)%h}function x(k,h,d){void 0===h&&(h=0);void 0===d&&(d=1);return k<h?h:k>d?d:k}function E(k){return k.charAt(0).toUpperCase()+k.substring(1)}function U(k){for(var h=arguments.length,d=Array(1<h?h-1:0),a=1;a<h;a++)d[a-1]=arguments[a];var b=U.map;
return k.replace(/%(?:([a-z]+)|(?:{([^}]+)}))/gi,function(c,e,f,g){if("%"==k.charAt(g-1))return c.substring(1);if(!d.length)return c;f=(e||f).split(",");e=f.shift()||"";g=b[e.toLowerCase()];if(!g)return c;c=d.shift();c=c[g].apply(c,f);e=e.charAt(0);e!=e.toLowerCase()&&(c=E(c));return c})}function P(k){var h;if(k in V)var d=V[k];else{if("#"==k.charAt(0))if(d=(k.match(/[0-9a-f]/gi)||[]).map(function(a){return parseInt(a,16)}),3==d.length)d=d.map(function(a){return 17*a});else for(h=0;3>h;h++)d[h+1]+=
16*d[h],d.splice(h,1);else d=(h=k.match(/rgb\(([0-9, ]+)\)/i))?h[1].split(/\s*,\s*/).map(function(a){return parseInt(a)}):[0,0,0];V[k]=d}return d.slice()}function ea(k){for(var h=arguments.length,d=Array(1<h?h-1:0),a=1;a<h;a++)d[a-1]=arguments[a];for(h=0;3>h;h++)for(a=0;a<d.length;a++)k[h]+=d[a][h];return k}function fa(k,h,d){void 0===d&&(d=.5);for(var a=k.slice(),b=0;3>b;b++)a[b]=Math.round(a[b]+d*(h[b]-k[b]));return a}function ha(k,h,d){void 0===d&&(d=.5);k=W(k);h=W(h);for(var a=0;3>a;a++)k[a]+=
d*(h[a]-k[a]);return ia(k)}function W(k){var h=k[0]/255,d=k[1]/255;k=k[2]/255;var a=Math.max(h,d,k),b=Math.min(h,d,k),c=0,e=(a+b)/2;if(a==b)b=0;else{var f=a-b;b=.5<e?f/(2-a-b):f/(a+b);switch(a){case h:c=(d-k)/f+(d<k?6:0);break;case d:c=(k-h)/f+2;break;case k:c=(h-d)/f+4}c/=6}return[c,b,e]}function X(k,h,d){0>d&&(d+=1);1<d&&--d;return d<1/6?k+6*(h-k)*d:.5>d?h:d<2/3?k+(h-k)*(2/3-d)*6:k}function ia(k){var h=k[2];if(0==k[1])return h=Math.round(255*h),[h,h,h];var d=k[1];d=.5>h?h*(1+d):h+d-h*d;var a=2*
h-d;h=X(a,d,k[0]+1/3);var b=X(a,d,k[0]);k=X(a,d,k[0]-1/3);return[Math.round(255*h),Math.round(255*b),Math.round(255*k)]}function oa(k,h,d){var a=k.createShader(k.VERTEX_SHADER);k.shaderSource(a,h);k.compileShader(a);if(!k.getShaderParameter(a,k.COMPILE_STATUS))throw Error(k.getShaderInfoLog(a)||"");h=k.createShader(k.FRAGMENT_SHADER);k.shaderSource(h,d);k.compileShader(h);if(!k.getShaderParameter(h,k.COMPILE_STATUS))throw Error(k.getShaderInfoLog(h)||"");d=k.createProgram();k.attachShader(d,a);k.attachShader(d,
h);k.linkProgram(d);if(!k.getProgramParameter(d,k.LINK_STATUS))throw Error(k.getProgramInfoLog(d)||"");return d}function pa(k){var h=new Float32Array([0,0,1,0,0,1,1,1]),d=k.createBuffer();k.bindBuffer(k.ARRAY_BUFFER,d);k.bufferData(k.ARRAY_BUFFER,h,k.STATIC_DRAW);k.enableVertexAttribArray(0);k.vertexAttribPointer(0,2,k.FLOAT,!1,0,0)}function Q(k){if(!(k in Y)){if("transparent"==k)var h=[0,0,0,0];else if(-1<k.indexOf("rgba")){h=(k.match(/[\d.]+/g)||[]).map(Number);for(var d=0;3>d;d++)h[d]/=255}else h=
P(k).map(function(a){return a/255}),h.push(1);Y[k]=h}return Y[k]}function Z(k){k=P(k);return 36*Math.floor(.0234375*k[0])+6*Math.floor(.0234375*k[1])+1*Math.floor(.0234375*k[2])+16}function aa(k,h){var d=[],a=0;k.replace(qa,function(c,e,f,g){var l=k.substring(a,g);l.length&&d.push({type:0,value:l});d.push({type:"c"==e?2:3,value:f.trim()});a=g+c.length;return""});var b=k.substring(a);b.length&&d.push({type:0,value:b});return ra(d,h)}function ra(k,h){h||=Infinity;for(var d=0,a=0,b=-1;d<k.length;){var c=
k[d];1==c.type&&(a=0,b=-1);if(0!=c.type)d++;else{for(;0==a&&" "==c.value.charAt(0);)c.value=c.value.substring(1);var e=c.value.indexOf("\n");if(-1!=e){c.value=R(k,d,e,!0);for(e=c.value.split("");e.length&&" "==e[e.length-1];)e.pop();c.value=e.join("")}if(c.value.length){if(a+c.value.length>h){for(e=-1;;){var f=c.value.indexOf(" ",e+1);if(-1==f)break;if(a+f>h)break;e=f}-1!=e?c.value=R(k,d,e,!0):-1!=b?(d=k[b],c=d.value.lastIndexOf(" "),d.value=R(k,b,c,!0),d=b):c.value=R(k,d,h-a,!1)}else a+=c.value.length,
-1!=c.value.indexOf(" ")&&(b=d);d++}else k.splice(d,1)}}k.push({type:1});h=null;for(a=0;a<k.length;a++)switch(b=k[a],b.type){case 0:h=b;break;case 1:if(h){for(b=h.value.split("");b.length&&" "==b[b.length-1];)b.pop();h.value=b.join("")}h=null}k.pop();return k}function R(k,h,d,a){a={type:0,value:k[h].value.substring(d+(a?1:0))};k.splice(h+1,0,{type:1},a);return k[h].value.substring(0,d)}function ja(k,h,d){d[h[k+1]]=d[k];h[d[k]]=h[k+1];d[k]=k+1;h[k+1]=k}function ka(k,h,d){d[h[k]]=d[k];h[d[k]]=h[k];
d[k]=k;h[k]=k}var t=(new (function(){function k(){this._c=this._s2=this._s1=this._s0=this._seed=0}var h=k.prototype;h.getSeed=function(){return this._seed};h.setSeed=function(d){this._seed=d=1>d?1/d:d;this._s0=2.3283064365386963E-10*(d>>>0);d=69069*d+1>>>0;this._s1=2.3283064365386963E-10*d;this._s2=2.3283064365386963E-10*(69069*d+1>>>0);this._c=1;return this};h.getUniform=function(){var d=2091639*this._s0+2.3283064365386963E-10*this._c;this._s0=this._s1;this._s1=this._s2;this._c=d|0;return this._s2=
d-this._c};h.getUniformInt=function(d,a){var b=Math.max(d,a);d=Math.min(d,a);return Math.floor(this.getUniform()*(b-d+1))+d};h.getNormal=function(d,a){void 0===d&&(d=0);void 0===a&&(a=1);do{var b=2*this.getUniform()-1;var c=2*this.getUniform()-1;c=b*b+c*c}while(1<c||0==c);return d+b*Math.sqrt(-2*Math.log(c)/c)*a};h.getPercentage=function(){return 1+Math.floor(100*this.getUniform())};h.getItem=function(d){return d.length?d[Math.floor(this.getUniform()*d.length)]:null};h.shuffle=function(d){var a=[];
for(d=d.slice();d.length;){var b=d.indexOf(this.getItem(d));a.push(d.splice(b,1)[0])}return a};h.getWeightedValue=function(d){var a=0;for(c in d)a+=d[c];a*=this.getUniform();var b;var c=0;for(b in d)if(c+=d[b],a<c)break;return b};h.getState=function(){return[this._s0,this._s1,this._s2,this._c]};h.setState=function(d){this._s0=d[0];this._s1=d[1];this._s2=d[2];this._c=d[3];return this};h.clone=function(){return(new k).setState(this.getState())};return k}())).setSeed(Date.now()),M=function(){function k(){}
var h=k.prototype;h.getContainer=function(){return null};h.setOptions=function(d){this._options=d};return k}(),N=function(k){function h(){var a=k.call(this)||this;a._ctx=document.createElement("canvas").getContext("2d");return a}_inheritsLoose(h,k);var d=h.prototype;d.schedule=function(a){requestAnimationFrame(a)};d.getContainer=function(){return this._ctx.canvas};d.setOptions=function(a){k.prototype.setOptions.call(this,a);a=(a.fontStyle?a.fontStyle+" ":"")+" "+a.fontSize+"px "+a.fontFamily;this._ctx.font=
a;this._updateSize();this._ctx.font=a;this._ctx.textAlign="center";this._ctx.textBaseline="middle"};d.clear=function(){var a=this._ctx.globalCompositeOperation;this._ctx.globalCompositeOperation="copy";this._ctx.fillStyle=this._options.bg;this._ctx.fillRect(0,0,this._ctx.canvas.width,this._ctx.canvas.height);this._ctx.globalCompositeOperation=a};d.eventToPosition=function(a,b){var c=this._ctx.canvas,e=c.getBoundingClientRect();a-=e.left;b-=e.top;a*=c.width/e.width;b*=c.height/e.height;return 0>a||
0>b||a>=c.width||b>=c.height?[-1,-1]:this._normalizedEventToPosition(a,b)};return h}(M);U.map={s:"toString"};var sa=Object.freeze({__proto__:null,mod:y,clamp:x,capitalize:E,format:U}),S=function(k){function h(){var a=k.call(this)||this;a._spacingX=0;a._spacingY=0;a._hexSize=0;return a}_inheritsLoose(h,k);var d=h.prototype;d.draw=function(a,b){var c=a[2],e=a[3],f=a[4];a=[(a[0]+1)*this._spacingX,a[1]*this._spacingY+this._hexSize];this._options.transpose&&a.reverse();b&&(this._ctx.fillStyle=f,this._fill(a[0],
a[1]));if(c)for(this._ctx.fillStyle=e,b=[].concat(c),c=0;c<b.length;c++)this._ctx.fillText(b[c],a[0],Math.ceil(a[1]))};d.computeSize=function(a,b){this._options.transpose&&(a+=b,b=a-b,a-=b);return[Math.floor(a/this._spacingX)-1,Math.floor((b-2*this._hexSize)/this._spacingY+1)]};d.computeFontSize=function(a,b){this._options.transpose&&(a+=b,b=a-b,a-=b);a=Math.min(2*a/((this._options.width+1)*Math.sqrt(3))-1,b/(2+1.5*(this._options.height-1)));b=this._ctx.font;this._ctx.font="100px "+this._options.fontFamily;
var c=Math.ceil(this._ctx.measureText("W").width);this._ctx.font=b;a=Math.floor(a)+1;return Math.ceil(2*a/(this._options.spacing*(1+c/100/Math.sqrt(3))))-1};d._normalizedEventToPosition=function(a,b){if(this._options.transpose){a+=b;b=a-b;a-=b;var c=this._ctx.canvas.width}else c=this._ctx.canvas.height;b=Math.floor(b/(c/this._options.height));y(b,2)?(a-=this._spacingX,a=1+2*Math.floor(a/(2*this._spacingX))):a=2*Math.floor(a/(2*this._spacingX));return[a,b]};d._fill=function(a,b){var c=this._hexSize,
e=this._options.border,f=this._ctx;f.beginPath();this._options.transpose?(f.moveTo(a-c+e,b),f.lineTo(a-c/2+e,b+this._spacingX-e),f.lineTo(a+c/2-e,b+this._spacingX-e),f.lineTo(a+c-e,b),f.lineTo(a+c/2-e,b-this._spacingX+e),f.lineTo(a-c/2+e,b-this._spacingX+e),f.lineTo(a-c+e,b)):(f.moveTo(a,b-c+e),f.lineTo(a+this._spacingX-e,b-c/2+e),f.lineTo(a+this._spacingX-e,b+c/2-e),f.lineTo(a,b+c-e),f.lineTo(a-this._spacingX+e,b+c/2-e),f.lineTo(a-this._spacingX+e,b-c/2+e),f.lineTo(a,b-c+e));f.fill()};d._updateSize=
function(){var a=this._options,b=Math.ceil(this._ctx.measureText("W").width);this._hexSize=Math.floor(a.spacing*(a.fontSize+b/Math.sqrt(3))/2);this._spacingX=this._hexSize*Math.sqrt(3)/2;this._spacingY=1.5*this._hexSize;if(a.transpose){b="height";var c="width"}else b="width",c="height";this._ctx.canvas[b]=Math.ceil((a.width+1)*this._spacingX);this._ctx.canvas[c]=Math.ceil((a.height-1)*this._spacingY+2*this._hexSize)};return h}(N),J=function(k){function h(){var a=k.call(this)||this;a._spacingX=0;a._spacingY=
0;a._canvasCache={};return a}_inheritsLoose(h,k);var d=h.prototype;d.setOptions=function(a){k.prototype.setOptions.call(this,a);this._canvasCache={}};d.draw=function(a,b){h.cache?this._drawWithCache(a):this._drawNoCache(a,b)};d._drawWithCache=function(a){var b=a[0],c=a[1],e=a[2],f=a[3],g=a[4];a=""+e+f+g;if(a in this._canvasCache)var l=this._canvasCache[a];else{var m=this._options.border;l=document.createElement("canvas");var n=l.getContext("2d");l.width=this._spacingX;l.height=this._spacingY;n.fillStyle=
g;n.fillRect(m,m,l.width-m,l.height-m);if(e)for(n.fillStyle=f,n.font=this._ctx.font,n.textAlign="center",n.textBaseline="middle",e=[].concat(e),f=0;f<e.length;f++)n.fillText(e[f],this._spacingX/2,Math.ceil(this._spacingY/2));this._canvasCache[a]=l}this._ctx.drawImage(l,b*this._spacingX,c*this._spacingY)};d._drawNoCache=function(a,b){var c=a[0],e=a[1],f=a[2],g=a[3];a=a[4];b&&(b=this._options.border,this._ctx.fillStyle=a,this._ctx.fillRect(c*this._spacingX+b,e*this._spacingY+b,this._spacingX-b,this._spacingY-
b));if(f)for(this._ctx.fillStyle=g,f=[].concat(f),g=0;g<f.length;g++)this._ctx.fillText(f[g],(c+.5)*this._spacingX,Math.ceil((e+.5)*this._spacingY))};d.computeSize=function(a,b){return[Math.floor(a/this._spacingX),Math.floor(b/this._spacingY)]};d.computeFontSize=function(a,b){a=Math.floor(a/this._options.width);b=Math.floor(b/this._options.height);var c=this._ctx.font;this._ctx.font="100px "+this._options.fontFamily;var e=Math.ceil(this._ctx.measureText("W").width);this._ctx.font=c;a=e/100*b/a;1<
a&&(b=Math.floor(b/a));return Math.floor(b/this._options.spacing)};d._normalizedEventToPosition=function(a,b){return[Math.floor(a/this._spacingX),Math.floor(b/this._spacingY)]};d._updateSize=function(){var a=this._options,b=Math.ceil(this._ctx.measureText("W").width);this._spacingX=Math.ceil(a.spacing*b);this._spacingY=Math.ceil(a.spacing*a.fontSize);a.forceSquareRatio&&(this._spacingX=this._spacingY=Math.max(this._spacingX,this._spacingY));this._ctx.canvas.width=a.width*this._spacingX;this._ctx.canvas.height=
a.height*this._spacingY};return h}(N);J.cache=!1;var F=function(k){function h(){var a=k.call(this)||this;a._colorCanvas=document.createElement("canvas");return a}_inheritsLoose(h,k);var d=h.prototype;d.draw=function(a,b){var c=a[0],e=a[1],f=a[2],g=a[3],l=a[4];a=this._options.tileWidth;var m=this._options.tileHeight;b&&(this._options.tileColorize?this._ctx.clearRect(c*a,e*m,a,m):(this._ctx.fillStyle=l,this._ctx.fillRect(c*a,e*m,a,m)));if(f)for(b=[].concat(f),g=[].concat(g),l=[].concat(l),f=0;f<b.length;f++){var n=
this._options.tileMap[b[f]];if(!n)throw Error('Char "'+b[f]+'" not found in tileMap');if(this._options.tileColorize){var p=this._colorCanvas,q=p.getContext("2d");q.globalCompositeOperation="source-over";q.clearRect(0,0,a,m);var u=g[f],v=l[f];q.drawImage(this._options.tileSet,n[0],n[1],a,m,0,0,a,m);"transparent"!=u&&(q.fillStyle=u,q.globalCompositeOperation="source-atop",q.fillRect(0,0,a,m));"transparent"!=v&&(q.fillStyle=v,q.globalCompositeOperation="destination-over",q.fillRect(0,0,a,m));this._ctx.drawImage(p,
c*a,e*m,a,m)}else this._ctx.drawImage(this._options.tileSet,n[0],n[1],a,m,c*a,e*m,a,m)}};d.computeSize=function(a,b){return[Math.floor(a/this._options.tileWidth),Math.floor(b/this._options.tileHeight)]};d.computeFontSize=function(){throw Error("Tile backend does not understand font size");};d._normalizedEventToPosition=function(a,b){return[Math.floor(a/this._options.tileWidth),Math.floor(b/this._options.tileHeight)]};d._updateSize=function(){var a=this._options;this._ctx.canvas.width=a.width*a.tileWidth;
this._ctx.canvas.height=a.height*a.tileHeight;this._colorCanvas.width=a.tileWidth;this._colorCanvas.height=a.tileHeight};return h}(N),V={black:[0,0,0],navy:[0,0,128],darkblue:[0,0,139],mediumblue:[0,0,205],blue:[0,0,255],darkgreen:[0,100,0],green:[0,128,0],teal:[0,128,128],darkcyan:[0,139,139],deepskyblue:[0,191,255],darkturquoise:[0,206,209],mediumspringgreen:[0,250,154],lime:[0,255,0],springgreen:[0,255,127],aqua:[0,255,255],cyan:[0,255,255],midnightblue:[25,25,112],dodgerblue:[30,144,255],forestgreen:[34,
139,34],seagreen:[46,139,87],darkslategray:[47,79,79],darkslategrey:[47,79,79],limegreen:[50,205,50],mediumseagreen:[60,179,113],turquoise:[64,224,208],royalblue:[65,105,225],steelblue:[70,130,180],darkslateblue:[72,61,139],mediumturquoise:[72,209,204],indigo:[75,0,130],darkolivegreen:[85,107,47],cadetblue:[95,158,160],cornflowerblue:[100,149,237],mediumaquamarine:[102,205,170],dimgray:[105,105,105],dimgrey:[105,105,105],slateblue:[106,90,205],olivedrab:[107,142,35],slategray:[112,128,144],slategrey:[112,
128,144],lightslategray:[119,136,153],lightslategrey:[119,136,153],mediumslateblue:[123,104,238],lawngreen:[124,252,0],chartreuse:[127,255,0],aquamarine:[127,255,212],maroon:[128,0,0],purple:[128,0,128],olive:[128,128,0],gray:[128,128,128],grey:[128,128,128],skyblue:[135,206,235],lightskyblue:[135,206,250],blueviolet:[138,43,226],darkred:[139,0,0],darkmagenta:[139,0,139],saddlebrown:[139,69,19],darkseagreen:[143,188,143],lightgreen:[144,238,144],mediumpurple:[147,112,216],darkviolet:[148,0,211],palegreen:[152,
251,152],darkorchid:[153,50,204],yellowgreen:[154,205,50],sienna:[160,82,45],brown:[165,42,42],darkgray:[169,169,169],darkgrey:[169,169,169],lightblue:[173,216,230],greenyellow:[173,255,47],paleturquoise:[175,238,238],lightsteelblue:[176,196,222],powderblue:[176,224,230],firebrick:[178,34,34],darkgoldenrod:[184,134,11],mediumorchid:[186,85,211],rosybrown:[188,143,143],darkkhaki:[189,183,107],silver:[192,192,192],mediumvioletred:[199,21,133],indianred:[205,92,92],peru:[205,133,63],chocolate:[210,105,
30],tan:[210,180,140],lightgray:[211,211,211],lightgrey:[211,211,211],palevioletred:[216,112,147],thistle:[216,191,216],orchid:[218,112,214],goldenrod:[218,165,32],crimson:[220,20,60],gainsboro:[220,220,220],plum:[221,160,221],burlywood:[222,184,135],lightcyan:[224,255,255],lavender:[230,230,250],darksalmon:[233,150,122],violet:[238,130,238],palegoldenrod:[238,232,170],lightcoral:[240,128,128],khaki:[240,230,140],aliceblue:[240,248,255],honeydew:[240,255,240],azure:[240,255,255],sandybrown:[244,164,
96],wheat:[245,222,179],beige:[245,245,220],whitesmoke:[245,245,245],mintcream:[245,255,250],ghostwhite:[248,248,255],salmon:[250,128,114],antiquewhite:[250,235,215],linen:[250,240,230],lightgoldenrodyellow:[250,250,210],oldlace:[253,245,230],red:[255,0,0],fuchsia:[255,0,255],magenta:[255,0,255],deeppink:[255,20,147],orangered:[255,69,0],tomato:[255,99,71],hotpink:[255,105,180],coral:[255,127,80],darkorange:[255,140,0],lightsalmon:[255,160,122],orange:[255,165,0],lightpink:[255,182,193],pink:[255,
192,203],gold:[255,215,0],peachpuff:[255,218,185],navajowhite:[255,222,173],moccasin:[255,228,181],bisque:[255,228,196],mistyrose:[255,228,225],blanchedalmond:[255,235,205],papayawhip:[255,239,213],lavenderblush:[255,240,245],seashell:[255,245,238],cornsilk:[255,248,220],lemonchiffon:[255,250,205],floralwhite:[255,250,240],snow:[255,250,250],yellow:[255,255,0],lightyellow:[255,255,224],ivory:[255,255,240],white:[255,255,255]};N=Object.freeze({__proto__:null,fromString:P,add:function(k){for(var h=
k.slice(),d=arguments.length,a=Array(1<d?d-1:0),b=1;b<d;b++)a[b-1]=arguments[b];for(d=0;3>d;d++)for(b=0;b<a.length;b++)h[d]+=a[b][d];return h},add_:ea,multiply:function(k){for(var h=k.slice(),d=arguments.length,a=Array(1<d?d-1:0),b=1;b<d;b++)a[b-1]=arguments[b];for(d=0;3>d;d++){for(b=0;b<a.length;b++)h[d]*=a[b][d]/255;h[d]=Math.round(h[d])}return h},multiply_:function(k){for(var h=arguments.length,d=Array(1<h?h-1:0),a=1;a<h;a++)d[a-1]=arguments[a];for(h=0;3>h;h++){for(a=0;a<d.length;a++)k[h]*=d[a][h]/
255;k[h]=Math.round(k[h])}return k},interpolate:fa,lerp:fa,interpolateHSL:ha,lerpHSL:ha,randomize:function(k,h){h instanceof Array||(h=Math.round(t.getNormal(0,h)));k=k.slice();for(var d=0;3>d;d++)k[d]+=h instanceof Array?Math.round(t.getNormal(0,h[d])):h;return k},rgb2hsl:W,hsl2rgb:ia,toRGB:function(k){return"rgb("+k.map(function(h){return x(h,0,255)}).join(",")+")"},toHex:function(k){return"#"+k.map(function(h){return x(h,0,255).toString(16).padStart(2,"0")}).join("")}});var D=function(k){function h(){var a=
k.call(this)||this;a._uniforms={};try{a._gl=a._initWebGL()}catch(b){"string"===typeof b?alert(b):b instanceof Error&&alert(b.message)}return a}_inheritsLoose(h,k);h.isSupported=function(){return!!document.createElement("canvas").getContext("webgl2",{preserveDrawingBuffer:!0})};var d=h.prototype;d.schedule=function(a){requestAnimationFrame(a)};d.getContainer=function(){return this._gl.canvas};d.setOptions=function(a){var b=this;k.prototype.setOptions.call(this,a);this._updateSize();var c=this._options.tileSet;
c&&"complete"in c&&!c.complete?c.addEventListener("load",function(){return b._updateTexture(c)}):this._updateTexture(c)};d.draw=function(a,b){var c=this._gl,e=this._options,f=a[0],g=a[1],l=a[2],m=a[3];a=a[4];c.scissor(f*e.tileWidth,c.canvas.height-(g+1)*e.tileHeight,e.tileWidth,e.tileHeight);b&&(e.tileColorize?c.clearColor(0,0,0,0):c.clearColor.apply(c,Q(a)),c.clear(c.COLOR_BUFFER_BIT));if(l)for(b=[].concat(l),l=[].concat(a),m=[].concat(m),c.uniform2fv(this._uniforms.targetPosRel,[f,g]),f=0;f<b.length;f++){g=
this._options.tileMap[b[f]];if(!g)throw Error('Char "'+b[f]+'" not found in tileMap');c.uniform1f(this._uniforms.colorize,e.tileColorize?1:0);c.uniform2fv(this._uniforms.tilesetPosAbs,g);e.tileColorize&&(c.uniform4fv(this._uniforms.tint,Q(m[f])),c.uniform4fv(this._uniforms.bg,Q(l[f])));c.drawArrays(c.TRIANGLE_STRIP,0,4)}};d.clear=function(){var a=this._gl;a.clearColor.apply(a,Q(this._options.bg));a.scissor(0,0,a.canvas.width,a.canvas.height);a.clear(a.COLOR_BUFFER_BIT)};d.computeSize=function(a,b){return[Math.floor(a/
this._options.tileWidth),Math.floor(b/this._options.tileHeight)]};d.computeFontSize=function(){throw Error("Tile backend does not understand font size");};d.eventToPosition=function(a,b){var c=this._gl.canvas,e=c.getBoundingClientRect();a-=e.left;b-=e.top;a*=c.width/e.width;b*=c.height/e.height;return 0>a||0>b||a>=c.width||b>=c.height?[-1,-1]:this._normalizedEventToPosition(a,b)};d._initWebGL=function(){var a=this,b=document.createElement("canvas").getContext("webgl2",{preserveDrawingBuffer:!0});
window.gl=b;var c=oa(b,ta,ua);b.useProgram(c);pa(b);va.forEach(function(e){return a._uniforms[e]=b.getUniformLocation(c,e)});this._program=c;b.enable(b.BLEND);b.blendFuncSeparate(b.SRC_ALPHA,b.ONE_MINUS_SRC_ALPHA,b.ONE,b.ONE_MINUS_SRC_ALPHA);b.enable(b.SCISSOR_TEST);return b};d._normalizedEventToPosition=function(a,b){return[Math.floor(a/this._options.tileWidth),Math.floor(b/this._options.tileHeight)]};d._updateSize=function(){var a=this._gl,b=this._options,c=[b.width*b.tileWidth,b.height*b.tileHeight];
a.canvas.width=c[0];a.canvas.height=c[1];a.viewport(0,0,c[0],c[1]);a.uniform2fv(this._uniforms.tileSize,[b.tileWidth,b.tileHeight]);a.uniform2fv(this._uniforms.targetSize,c)};d._updateTexture=function(a){var b=this._gl,c=b.createTexture();b.bindTexture(b.TEXTURE_2D,c);b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MAG_FILTER,b.NEAREST);b.texParameteri(b.TEXTURE_2D,b.TEXTURE_MIN_FILTER,b.NEAREST);b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_S,b.REPEAT);b.texParameteri(b.TEXTURE_2D,b.TEXTURE_WRAP_T,b.REPEAT);
b.pixelStorei(b.UNPACK_FLIP_Y_WEBGL,0);b.texImage2D(b.TEXTURE_2D,0,b.RGBA,b.RGBA,b.UNSIGNED_BYTE,a)};return h}(M),va="targetPosRel tilesetPosAbs tileSize targetSize colorize bg tint".split(" "),ta="#version 300 es\n\nin vec2 tilePosRel;\nout vec2 tilesetPosPx;\n\nuniform vec2 tilesetPosAbs;\nuniform vec2 tileSize;\nuniform vec2 targetSize;\nuniform vec2 targetPosRel;\n\nvoid main() {\n\tvec2 targetPosPx = (targetPosRel + tilePosRel) * tileSize;\n\tvec2 targetPosNdc = ((targetPosPx / targetSize)-0.5)*2.0;\n\ttargetPosNdc.y *= -1.0;\n\n\tgl_Position = vec4(targetPosNdc, 0.0, 1.0);\n\ttilesetPosPx = tilesetPosAbs + tilePosRel * tileSize;\n}",
ua="#version 300 es\nprecision highp float;\n\nin vec2 tilesetPosPx;\nout vec4 fragColor;\nuniform sampler2D image;\nuniform bool colorize;\nuniform vec4 bg;\nuniform vec4 tint;\n\nvoid main() {\n\tfragColor = vec4(0, 0, 0, 1);\n\n\tvec4 texel = texelFetch(image, ivec2(tilesetPosPx), 0);\n\n\tif (colorize) {\n\t\ttexel.rgb = tint.a * tint.rgb + (1.0-tint.a) * texel.rgb;\n\t\tfragColor.rgb = texel.a*texel.rgb + (1.0-texel.a)*bg.rgb;\n\t\tfragColor.a = texel.a + (1.0-texel.a)*bg.a;\n\t} else {\n\t\tfragColor = texel;\n\t}\n}",
Y={},z=function(k){function h(){var a=k.call(this)||this;a._offset=[0,0];a._cursor=[-1,-1];a._lastColor="";return a}_inheritsLoose(h,k);var d=h.prototype;d.schedule=function(a){setTimeout(a,1E3/60)};d.setOptions=function(a){k.prototype.setOptions.call(this,a);var b=[a.width,a.height];this._offset=this.computeSize().map(function(c,e){return Math.floor((c-b[e])/2)})};d.clear=function(){process.stdout.write("\u001b[0;48;5;"+Z(this._options.bg)+"m\u001b[2J")};d.draw=function(a,b){var c=a[2],e=a[3],f=
a[4],g=this._offset[0]+a[0],l=this._offset[1]+a[1];a=this.computeSize();if(!(0>g||g>=a[0]||0>l||l>=a[1])){if(g!==this._cursor[0]||l!==this._cursor[1])process.stdout.write("\u001b["+(l+1)+";"+(g+1)+"H"),this._cursor[0]=g,this._cursor[1]=l;b&&(c||=" ");c&&(b="\u001b[0;38;5;"+Z(e)+";48;5;"+Z(f)+"m",b!==this._lastColor&&(process.stdout.write(b),this._lastColor=b),"\t"!=c&&(c=[].concat(c),process.stdout.write(c[0])),this._cursor[0]++,this._cursor[0]>=a[0]&&(this._cursor[0]=0,this._cursor[1]++))}};d.computeFontSize=
function(){throw Error("Terminal backend has no notion of font size");};d.eventToPosition=function(a,b){return[a,b]};d.computeSize=function(){return[process.stdout.columns,process.stdout.rows]};return h}(M),qa=/%([bc]){([^}]*)}/g;M=Object.freeze({__proto__:null,TYPE_TEXT:0,TYPE_NEWLINE:1,TYPE_FG:2,TYPE_BG:3,measure:function(k,h){var d={width:0,height:1};k=aa(k,h);for(var a=h=0;a<k.length;a++){var b=k[a];switch(b.type){case 0:h+=b.value.length;break;case 1:d.height++,d.width=Math.max(d.width,h),h=
0}}d.width=Math.max(d.width,h);return d},tokenize:aa});var C={4:[[0,-1],[1,0],[0,1],[-1,0]],8:[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]],6:[[-1,-1],[1,-1],[2,0],[1,1],[-1,1],[-2,0]]},wa={hex:S,rect:J,tile:F,"tile-gl":D,term:z},xa={width:80,height:25,transpose:!1,layout:"rect",fontSize:15,spacing:1,border:0,forceSquareRatio:!1,fontFamily:"monospace",fontStyle:"",fg:"#ccc",bg:"#000",tileWidth:32,tileHeight:32,tileMap:{},tileSet:null,tileColorize:!1},K=function(){function k(d){void 0===
d&&(d={});this._data={};this._dirty=!1;this._options={};d=Object.assign({},xa,d);this.setOptions(d);this.DEBUG=this.DEBUG.bind(this);this._tick=this._tick.bind(this);this._backend.schedule(this._tick)}var h=k.prototype;h.DEBUG=function(d,a,b){var c=[this._options.bg,this._options.fg];this.draw(d,a,null,null,c[b%c.length])};h.clear=function(){this._data={};this._dirty=!0};h.setOptions=function(d){Object.assign(this._options,d);if(d.width||d.height||d.fontSize||d.fontFamily||d.spacing||d.layout)d.layout&&
(this._backend=new wa[d.layout]),this._backend.setOptions(this._options),this._dirty=!0;return this};h.getOptions=function(){return this._options};h.getContainer=function(){return this._backend.getContainer()};h.computeSize=function(d,a){return this._backend.computeSize(d,a)};h.computeFontSize=function(d,a){return this._backend.computeFontSize(d,a)};h.computeTileSize=function(d,a){return[Math.floor(d/this._options.width),Math.floor(a/this._options.height)]};h.eventToPosition=function(d){if("touches"in
d){var a=d.touches[0].clientX;d=d.touches[0].clientY}else a=d.clientX,d=d.clientY;return this._backend.eventToPosition(a,d)};h.draw=function(d,a,b,c,e){c||(c=this._options.fg);e||(e=this._options.bg);var f=d+","+a;this._data[f]=[d,a,b,c,e];!0!==this._dirty&&(this._dirty||(this._dirty={}),this._dirty[f]=!0)};h.drawOver=function(d,a,b,c,e){var f=this._data[d+","+a];f?(f[2]=b||f[2],f[3]=c||f[3],f[4]=e||f[4]):this.draw(d,a,b,c,e)};h.drawText=function(d,a,b,c){var e=null,f=null,g=d,l=1;c||=this._options.width-
d;for(b=aa(b,c);b.length;)switch(c=b.shift(),c.type){case 0:for(var m,n=!1,p,q=!1,u=0;u<c.value.length;u++){m=c.value.charCodeAt(u);var v=c.value.charAt(u);if("term"===this._options.layout&&(p=m>>8,17===p||46<=p&&159>=p||172<=p&&215>=p||43360<=m&&43391>=m)){this.draw(g+0,a,v,e,f);this.draw(g+1,a,"\t",e,f);g+=2;continue}p=65280<m&&65377>m||65500<m&&65512>m||65518<m;m=32==v.charCodeAt(0)||12288==v.charCodeAt(0);!q||p||m||g++;p&&!n&&g++;this.draw(g++,a,v,e,f);n=m;q=p}break;case 2:e=c.value||null;break;
case 3:f=c.value||null;break;case 1:g=d,a++,l++}return l};h._tick=function(){this._backend.schedule(this._tick);if(this._dirty){if(!0===this._dirty){this._backend.clear();for(var d in this._data)this._draw(d,!1)}else for(var a in this._dirty)this._draw(a,!0);this._dirty=!1}};h._draw=function(d,a){d=this._data[d];d[4]!=this._options.bg&&(a=!0);this._backend.draw(d,a)};return k}();K.Rect=J;K.Hex=S;K.Tile=F;K.TileGL=D;K.Term=z;S=function(){function k(d){this._options={words:!1,order:3,prior:.001};Object.assign(this._options,
d);this._suffix=this._boundary=String.fromCharCode(0);this._prefix=[];for(d=0;d<this._options.order;d++)this._prefix.push(this._boundary);this._priorValues={};this._priorValues[this._boundary]=this._options.prior;this._data={}}var h=k.prototype;h.clear=function(){this._data={};this._priorValues={}};h.generate=function(){for(var d=[this._sample(this._prefix)];d[d.length-1]!=this._boundary;)d.push(this._sample(d));return this._join(d.slice(0,-1))};h.observe=function(d){d=this._split(d);for(var a=0;a<
d.length;a++)this._priorValues[d[a]]=this._options.prior;d=this._prefix.concat(d).concat(this._suffix);for(a=this._options.order;a<d.length;a++)for(var b=d.slice(a-this._options.order,a),c=d[a],e=0;e<b.length;e++){var f=b.slice(e);this._observeEvent(f,c)}};h.getStats=function(){var d=[],a=Object.keys(this._priorValues).length;a--;d.push("distinct samples: "+a);a=Object.keys(this._data).length;var b=0,c;for(c in this._data)b+=Object.keys(this._data[c]).length;d.push("dictionary size (contexts): "+
a);d.push("dictionary size (events): "+b);return d.join(", ")};h._split=function(d){return d.split(this._options.words?/\s+/:"")};h._join=function(d){return d.join(this._options.words?" ":"")};h._observeEvent=function(d,a){d=this._join(d);d in this._data||(this._data[d]={});d=this._data[d];a in d||(d[a]=0);d[a]++};h._sample=function(d){d=this._backoff(d);d=this._join(d);d=this._data[d];var a={};if(this._options.prior){for(var b in this._priorValues)a[b]=this._priorValues[b];for(var c in d)a[c]+=d[c]}else a=
d;return t.getWeightedValue(a)};h._backoff=function(d){for(d.length>this._options.order?d=d.slice(-this._options.order):d.length<this._options.order&&(d=this._prefix.slice(0,this._options.order-d.length).concat(d));!(this._join(d)in this._data)&&0<d.length;)d=d.slice(1);return d};return k}();var la=function(){function k(){this.heap=[];this.timestamp=0}var h=k.prototype;h.lessThan=function(d,a){return d.key==a.key?d.timestamp<a.timestamp:d.key<a.key};h.shift=function(d){this.heap=this.heap.map(function(a){return{key:a.key+
d,value:a.value,timestamp:a.timestamp}})};h.len=function(){return this.heap.length};h.push=function(d,a){this.timestamp+=1;var b=this.len();this.heap.push({value:d,timestamp:this.timestamp,key:a});this.updateUp(b)};h.pop=function(){if(0==this.len())throw Error("no element to pop");var d=this.heap[0];1<this.len()?(this.heap[0]=this.heap.pop(),this.updateDown(0)):this.heap.pop();return d};h.find=function(d){for(var a=0;a<this.len();a++)if(d==this.heap[a].value)return this.heap[a];return null};h.remove=
function(d){for(var a=null,b=0;b<this.len();b++)d==this.heap[b].value&&(a=b);if(null===a)return!1;1<this.len()?(b=this.heap.pop(),b.value!=d&&(this.heap[a]=b,this.updateDown(a))):this.heap.pop();return!0};h.parentNode=function(d){return Math.floor((d-1)/2)};h.leftChildNode=function(d){return 2*d+1};h.rightChildNode=function(d){return 2*d+2};h.existNode=function(d){return 0<=d&&d<this.heap.length};h.swap=function(d,a){var b=this.heap[d];this.heap[d]=this.heap[a];this.heap[a]=b};h.minNode=function(d){var a=
d.filter(this.existNode.bind(this));d=a[0];a=_createForOfIteratorHelperLoose(a);for(var b;!(b=a()).done;)b=b.value,this.lessThan(this.heap[b],this.heap[d])&&(d=b);return d};h.updateUp=function(d){if(0!=d){var a=this.parentNode(d);this.existNode(a)&&this.lessThan(this.heap[d],this.heap[a])&&(this.swap(d,a),this.updateUp(a))}};h.updateDown=function(d){var a=this.leftChildNode(d),b=this.rightChildNode(d);this.existNode(a)&&(a=this.minNode([d,a,b]),a!=d&&(this.swap(d,a),this.updateDown(a)))};h.debugPrint=
function(){console.log(this.heap)};return k}(),ma=function(){function k(){this._time=0;this._events=new la}var h=k.prototype;h.getTime=function(){return this._time};h.clear=function(){this._events=new la;return this};h.add=function(d,a){this._events.push(d,a)};h.get=function(){if(!this._events.len())return null;var d=this._events.pop(),a=d.key;d=d.value;0<a&&(this._time+=a,this._events.shift(-a));return d};h.getEventTime=function(d){if(d=this._events.find(d))return d.key};h.remove=function(d){return this._events.remove(d)};
return k}();D=function(){function k(){this._queue=new ma;this._repeat=[];this._current=null}var h=k.prototype;h.getTime=function(){return this._queue.getTime()};h.add=function(d,a){a&&this._repeat.push(d);return this};h.getTimeOf=function(d){return this._queue.getEventTime(d)};h.clear=function(){this._queue.clear();this._repeat=[];this._current=null;return this};h.remove=function(d){var a=this._queue.remove(d),b=this._repeat.indexOf(d);-1!=b&&this._repeat.splice(b,1);this._current==d&&(this._current=
null);return a};h.next=function(){return this._current=this._queue.get()};return k}();J=function(k){function h(){return k.apply(this,arguments)||this}_inheritsLoose(h,k);var d=h.prototype;d.add=function(a,b){this._queue.add(a,0);return k.prototype.add.call(this,a,b)};d.next=function(){null!==this._current&&-1!=this._repeat.indexOf(this._current)&&this._queue.add(this._current,0);return k.prototype.next.call(this)};return h}(D);F=function(k){function h(){return k.apply(this,arguments)||this}_inheritsLoose(h,
k);var d=h.prototype;d.add=function(a,b,c){this._queue.add(a,void 0!==c?c:1/a.getSpeed());return k.prototype.add.call(this,a,b)};d.next=function(){this._current&&-1!=this._repeat.indexOf(this._current)&&this._queue.add(this._current,1/this._current.getSpeed());return k.prototype.next.call(this)};return h}(D);D=function(k){function h(){var a=k.call(this)||this;a._defaultDuration=1;a._duration=a._defaultDuration;return a}_inheritsLoose(h,k);var d=h.prototype;d.add=function(a,b,c){this._queue.add(a,
c||this._defaultDuration);return k.prototype.add.call(this,a,b)};d.clear=function(){this._duration=this._defaultDuration;return k.prototype.clear.call(this)};d.remove=function(a){a==this._current&&(this._duration=this._defaultDuration);return k.prototype.remove.call(this,a)};d.next=function(){null!==this._current&&-1!=this._repeat.indexOf(this._current)&&(this._queue.add(this._current,this._duration||this._defaultDuration),this._duration=this._defaultDuration);return k.prototype.next.call(this)};
d.setDuration=function(a){this._current&&(this._duration=a);return this};return h}(D);J={Simple:J,Speed:F,Action:D};z=function(){function k(h,d){void 0===d&&(d={});this._lightPasses=h;this._options=Object.assign({topology:8},d)}k.prototype._getCircle=function(h,d,a){var b=[];switch(this._options.topology){case 4:var c=1;var e=[0,1];var f=[C[8][7],C[8][1],C[8][3],C[8][5]];break;case 6:f=C[6];c=1;e=[-1,1];break;case 8:f=C[4];c=2;e=[-1,1];break;default:throw Error("Incorrect topology for FOV computation");
}h+=e[0]*a;d+=e[1]*a;for(e=0;e<f.length;e++)for(var g=0;g<a*c;g++)b.push([h,d]),h+=f[e][0],d+=f[e][1];return b};return k}();F=function(k){function h(){return k.apply(this,arguments)||this}_inheritsLoose(h,k);var d=h.prototype;d.compute=function(a,b,c,e){e(a,b,0,1);if(this._lightPasses(a,b))for(var f=[],g,l,m,n,p,q=1;q<=c;q++)for(var u=this._getCircle(a,b,q),v=360/u.length,w=0;w<u.length;w++)if(m=u[w][0],n=u[w][1],g=v*(w-.5),l=g+v,p=!this._lightPasses(m,n),this._visibleCoords(Math.floor(g),Math.ceil(l),
p,f)&&e(m,n,q,1),2==f.length&&0==f[0]&&360==f[1])return};d._visibleCoords=function(a,b,c,e){if(0>a)return b=this._visibleCoords(0,b,c,e),a=this._visibleCoords(360+a,360,c,e),b||a;for(var f=0;f<e.length&&e[f]<a;)f++;if(f==e.length)return c&&e.push(a,b),!0;var g=0;if(f%2){for(;f<e.length&&e[f]<b;)f++,g++;if(0==g)return!1;c&&(g%2?e.splice(f-g,g,b):e.splice(f-g,g))}else{for(;f<e.length&&e[f]<b;)f++,g++;if(a==e[f-g]&&1==g)return!1;c&&(g%2?e.splice(f-g,g,a):e.splice(f-g,g,a,b))}return!0};return h}(z);D=
function(k){function h(){return k.apply(this,arguments)||this}_inheritsLoose(h,k);var d=h.prototype;d.compute=function(a,b,c,e){e(a,b,0,1);if(this._lightPasses(a,b))for(var f=[],g,l,m,n,p,q=1;q<=c;q++)for(var u=this._getCircle(a,b,q),v=u.length,w=0;w<v;w++)if(g=u[w][0],l=u[w][1],n=[w?2*w-1:2*v-1,2*v],p=[2*w+1,2*v],m=!this._lightPasses(g,l),(m=this._checkVisibility(n,p,m,f))&&e(g,l,q,m),2==f.length&&0==f[0][0]&&f[1][0]==f[1][1])return};d._checkVisibility=function(a,b,c,e){if(a[0]>b[0])return a=this._checkVisibility(a,
[a[1],a[1]],c,e),b=this._checkVisibility([0,1],b,c,e),(a+b)/2;for(var f=0,g=!1;f<e.length;){var l=e[f];l=l[0]*a[1]-a[0]*l[1];if(0<=l){0!=l||f%2||(g=!0);break}f++}l=e.length;for(var m=!1;l--;){var n=e[l];n=b[0]*n[1]-n[0]*b[1];if(0<=n){0==n&&l%2&&(m=!0);break}}n=!0;f==l&&(g||m)?n=!1:g&&m&&f+1==l&&l%2?n=!1:f>l&&f%2&&(n=!1);if(!n)return 0;g=l-f+1;if(g%2)f%2?(l=e[f],l=(b[0]*l[1]-l[0]*b[1])/(l[1]*b[1]),c&&e.splice(f,g,b)):(l=e[l],l=(l[0]*a[1]-a[0]*l[1])/(a[1]*l[1]),c&&e.splice(f,g,a));else if(f%2)m=e[f],
l=e[l],l=(l[0]*m[1]-m[0]*l[1])/(m[1]*l[1]),c&&e.splice(f,g);else return c&&e.splice(f,g,a,b),1;return l/((b[0]*a[1]-a[0]*b[1])/(a[1]*b[1]))};return h}(z);var G=[[-1,0,0,1],[0,-1,1,0],[0,-1,-1,0],[-1,0,0,-1],[1,0,0,-1],[0,1,-1,0],[0,1,1,0],[1,0,0,1]];z=function(k){function h(){return k.apply(this,arguments)||this}_inheritsLoose(h,k);var d=h.prototype;d.compute=function(a,b,c,e){e(a,b,0,1);for(var f=0;f<G.length;f++)this._renderOctant(a,b,G[f],c,e)};d.compute180=function(a,b,c,e,f){f(a,b,0,1);var g=
(e-1+8)%8,l=(e+1+8)%8;this._renderOctant(a,b,G[(e-2+8)%8],c,f);this._renderOctant(a,b,G[g],c,f);this._renderOctant(a,b,G[e],c,f);this._renderOctant(a,b,G[l],c,f)};d.compute90=function(a,b,c,e,f){f(a,b,0,1);var g=(e-1+8)%8;this._renderOctant(a,b,G[e],c,f);this._renderOctant(a,b,G[g],c,f)};d._renderOctant=function(a,b,c,e,f){this._castVisibility(a,b,1,1,0,e+1,c[0],c[1],c[2],c[3],f)};d._castVisibility=function(a,b,c,e,f,g,l,m,n,p,q){if(!(e<f))for(;c<=g;c++){for(var u=-c-1,v=-c,w=!1,A=0;0>=u;){u+=1;var B=
a+u*l+v*m,ba=b+u*n+v*p,na=(u-.5)/(v+.5),ca=(u+.5)/(v-.5);if(!(ca>e)){if(na<f)break;u*u+v*v<g*g&&q(B,ba,c,1);w?this._lightPasses(B,ba)?(w=!1,e=A):A=ca:!this._lightPasses(B,ba)&&c<g&&(w=!0,this._castVisibility(a,b,c+1,e,na,g,l,m,n,p,q),A=ca)}}if(w)break}};return h}(z);F={DiscreteShadowcasting:F,PreciseShadowcasting:D,RecursiveShadowcasting:z};z=function(){function k(h,d){void 0===h&&(h=80);void 0===d&&(d=25);this._width=h;this._height=d}k.prototype._fillMap=function(h){for(var d=[],a=0;a<this._width;a++){d.push([]);
for(var b=0;b<this._height;b++)d[a].push(h)}return d};return k}();D=function(k){function h(){return k.apply(this,arguments)||this}_inheritsLoose(h,k);h.prototype.create=function(d){for(var a=this._width-1,b=this._height-1,c=0;c<=a;c++)for(var e=0;e<=b;e++)d(c,e,c&&e&&c<a&&e<b?0:1);return this};return h}(z);var L=function(k){function h(a,b){a=k.call(this,a,b)||this;a._rooms=[];a._corridors=[];return a}_inheritsLoose(h,k);var d=h.prototype;d.getRooms=function(){return this._rooms};d.getCorridors=function(){return this._corridors};
return h}(z),H=function(){},T=function(k){function h(a,b,c,e,f,g){var l=k.call(this)||this;l._x1=a;l._y1=b;l._x2=c;l._y2=e;l._doors={};void 0!==f&&void 0!==g&&l.addDoor(f,g);return l}_inheritsLoose(h,k);h.createRandomAt=function(a,b,c,e,f){var g=f.roomWidth[0],l=f.roomWidth[1],m=t.getUniformInt(g,l);g=f.roomHeight[0];l=f.roomHeight[1];f=t.getUniformInt(g,l);if(1==c)return c=b-Math.floor(t.getUniform()*f),new this(a+1,c,a+m,c+f-1,a,b);if(-1==c)return c=b-Math.floor(t.getUniform()*f),new this(a-m,c,
a-1,c+f-1,a,b);if(1==e)return c=a-Math.floor(t.getUniform()*m),new this(c,b+1,c+m-1,b+f,a,b);if(-1==e)return c=a-Math.floor(t.getUniform()*m),new this(c,b-f,c+m-1,b-1,a,b);throw Error("dx or dy must be 1 or -1");};h.createRandomCenter=function(a,b,c){var e=c.roomWidth[0],f=c.roomWidth[1],g=t.getUniformInt(e,f);e=c.roomHeight[0];f=c.roomHeight[1];c=t.getUniformInt(e,f);a-=Math.floor(t.getUniform()*g);b-=Math.floor(t.getUniform()*c);return new this(a,b,a+g-1,b+c-1)};h.createRandom=function(a,b,c){var e=
c.roomWidth[0],f=c.roomWidth[1],g=t.getUniformInt(e,f);e=c.roomHeight[0];f=c.roomHeight[1];c=t.getUniformInt(e,f);a=a-g-1;b=b-c-1;a=1+Math.floor(t.getUniform()*a);b=1+Math.floor(t.getUniform()*b);return new this(a,b,a+g-1,b+c-1)};var d=h.prototype;d.addDoor=function(a,b){this._doors[a+","+b]=1;return this};d.getDoors=function(a){for(var b in this._doors){var c=b.split(",");a(parseInt(c[0]),parseInt(c[1]))}return this};d.clearDoors=function(){this._doors={};return this};d.addDoors=function(a){for(var b=
this._x1-1,c=this._x2+1,e=this._y1-1,f=this._y2+1,g=b;g<=c;g++)for(var l=e;l<=f;l++)if(g==b||g==c||l==e||l==f)a(g,l)||this.addDoor(g,l);return this};d.debug=function(){console.log("room",this._x1,this._y1,this._x2,this._y2)};d.isValid=function(a,b){for(var c=this._x1-1,e=this._x2+1,f=this._y1-1,g=this._y2+1,l=c;l<=e;l++)for(var m=f;m<=g;m++)if(l==c||l==e||m==f||m==g){if(!a(l,m))return!1}else if(!b(l,m))return!1;return!0};d.create=function(a){for(var b=this._x1-1,c=this._x2+1,e=this._y1-1,f=this._y2+
1,g,l=b;l<=c;l++)for(var m=e;m<=f;m++)g=l+","+m in this._doors?2:l==b||l==c||m==e||m==f?1:0,a(l,m,g)};d.getCenter=function(){return[Math.round((this._x1+this._x2)/2),Math.round((this._y1+this._y2)/2)]};d.getLeft=function(){return this._x1};d.getRight=function(){return this._x2};d.getTop=function(){return this._y1};d.getBottom=function(){return this._y2};return h}(H),da=function(k){function h(a,b,c,e){var f=k.call(this)||this;f._startX=a;f._startY=b;f._endX=c;f._endY=e;f._endsWithAWall=!0;return f}
_inheritsLoose(h,k);h.createRandomAt=function(a,b,c,e,f){f=t.getUniformInt(f.corridorLength[0],f.corridorLength[1]);return new this(a,b,a+c*f,b+e*f)};var d=h.prototype;d.debug=function(){console.log("corridor",this._startX,this._startY,this._endX,this._endY)};d.isValid=function(a,b){var c=this._startX,e=this._startY,f=this._endX-c,g=this._endY-e,l=1+Math.max(Math.abs(f),Math.abs(g));f&&(f/=Math.abs(f));g&&(g/=Math.abs(g));for(var m=g,n=-f,p=!0,q=0;q<l;q++){var u=c+q*f,v=e+q*g;b(u,v)||(p=!1);a(u+m,
v+n)||(p=!1);a(u-m,v-n)||(p=!1);if(!p){l=q;this._endX=u-f;this._endY=v-g;break}}if(0==l||1==l&&a(this._endX+f,this._endY+g))return!1;b=!a(this._endX+f+m,this._endY+g+n);m=!a(this._endX+f-m,this._endY+g-n);this._endsWithAWall=a(this._endX+f,this._endY+g);return(b||m)&&this._endsWithAWall?!1:!0};d.create=function(a){var b=this._startX,c=this._startY,e=this._endX-b,f=this._endY-c,g=1+Math.max(Math.abs(e),Math.abs(f));e&&(e/=Math.abs(e));f&&(f/=Math.abs(f));for(var l=0;l<g;l++)a(b+l*e,c+l*f,0);return!0};
d.createPriorityWalls=function(a){if(this._endsWithAWall){var b=this._endX-this._startX,c=this._endY-this._startY;b&&(b/=Math.abs(b));c&&(c/=Math.abs(c));var e=c,f=-b;a(this._endX+b,this._endY+c);a(this._endX+e,this._endY+f);a(this._endX-e,this._endY-f)}};return h}(H);H=function(k){function h(a,b,c){a=k.call(this,a,b)||this;a._options={roomWidth:[3,9],roomHeight:[3,5],roomDugPercentage:.1,timeLimit:1E3};Object.assign(a._options,c);a._map=[];a._dug=0;a._roomAttempts=20;a._corridorAttempts=20;a._connected=
[];a._unconnected=[];a._digCallback=a._digCallback.bind(_assertThisInitialized(a));a._canBeDugCallback=a._canBeDugCallback.bind(_assertThisInitialized(a));a._isWallCallback=a._isWallCallback.bind(_assertThisInitialized(a));return a}_inheritsLoose(h,k);var d=h.prototype;d.create=function(a){for(var b=Date.now();;){if(Date.now()-b>this._options.timeLimit)return null;this._map=this._fillMap(1);this._dug=0;this._rooms=[];this._unconnected=[];this._generateRooms();if(!(2>this._rooms.length)&&this._generateCorridors())break}if(a)for(b=
0;b<this._width;b++)for(var c=0;c<this._height;c++)a(b,c,this._map[b][c]);return this};d._generateRooms=function(){var a=this._width-2,b=this._height-2;do{var c=this._generateRoom();if(this._dug/(a*b)>this._options.roomDugPercentage)break}while(c)};d._generateRoom=function(){for(var a=0;a<this._roomAttempts;){a++;var b=T.createRandom(this._width,this._height,this._options);if(b.isValid(this._isWallCallback,this._canBeDugCallback))return b.create(this._digCallback),this._rooms.push(b),b}return null};
d._generateCorridors=function(){for(var a=0;a<this._corridorAttempts;){a++;this._corridors=[];this._map=this._fillMap(1);for(var b=0;b<this._rooms.length;b++){var c=this._rooms[b];c.clearDoors();c.create(this._digCallback)}this._unconnected=t.shuffle(this._rooms.slice());this._connected=[];for(this._unconnected.length&&this._connected.push(this._unconnected.pop());;){b=t.getItem(this._connected);if(!b)break;b=this._closestRoom(this._unconnected,b);if(!b)break;c=this._closestRoom(this._connected,b);
if(!c)break;if(!this._connectRooms(b,c))break;if(!this._unconnected.length)return!0}}return!1};d._closestRoom=function(a,b){var c=Infinity;b=b.getCenter();for(var e=null,f=0;f<a.length;f++){var g=a[f],l=g.getCenter(),m=l[0]-b[0];l=l[1]-b[1];m=m*m+l*l;m<c&&(c=m,e=g)}return e};d._connectRooms=function(a,b){var c=a.getCenter(),e=b.getCenter(),f=e[0]-c[0];c=e[1]-c[1];if(Math.abs(f)<Math.abs(c)){f=0<c?2:0;var g=(f+2)%4;var l=b.getLeft();var m=b.getRight();c=0}else f=0<f?1:3,g=(f+2)%4,l=b.getTop(),m=b.getBottom(),
c=1;f=this._placeInWall(a,f);if(!f)return!1;if(f[c]>=l&&f[c]<=m){e=f.slice();l=0;switch(g){case 0:l=b.getTop()-1;break;case 1:l=b.getRight()+1;break;case 2:l=b.getBottom()+1;break;case 3:l=b.getLeft()-1}e[(c+1)%2]=l;this._digLine([f,e])}else if(f[c]<l-1||f[c]>m+1){e=f[c]-e[c];l=0;switch(g){case 0:case 1:l=0>e?3:1;break;case 2:case 3:l=0>e?1:3}e=this._placeInWall(b,(g+l)%4);if(!e)return!1;g=[0,0];g[c]=f[c];c=(c+1)%2;g[c]=e[c];this._digLine([f,g,e])}else{l=(c+1)%2;e=this._placeInWall(b,g);if(!e)return!1;
g=Math.round((e[l]+f[l])/2);m=[0,0];var n=[0,0];m[c]=f[c];m[l]=g;n[c]=e[c];n[l]=g;this._digLine([f,m,n,e])}a.addDoor(f[0],f[1]);b.addDoor(e[0],e[1]);c=this._unconnected.indexOf(a);-1!=c&&(this._unconnected.splice(c,1),this._connected.push(a));c=this._unconnected.indexOf(b);-1!=c&&(this._unconnected.splice(c,1),this._connected.push(b));return!0};d._placeInWall=function(a,b){var c=[0,0],e=[0,0],f=0;switch(b){case 0:e=[1,0];c=[a.getLeft(),a.getTop()-1];f=a.getRight()-a.getLeft()+1;break;case 1:e=[0,
1];c=[a.getRight()+1,a.getTop()];f=a.getBottom()-a.getTop()+1;break;case 2:e=[1,0];c=[a.getLeft(),a.getBottom()+1];f=a.getRight()-a.getLeft()+1;break;case 3:e=[0,1],c=[a.getLeft()-1,a.getTop()],f=a.getBottom()-a.getTop()+1}a=[];b=-2;for(var g=0;g<f;g++){var l=c[0]+g*e[0],m=c[1]+g*e[1];a.push(null);1==this._map[l][m]?b!=g-1&&(a[g]=[l,m]):(b=g)&&(a[g-1]=null)}for(c=a.length-1;0<=c;c--)a[c]||a.splice(c,1);return a.length?t.getItem(a):null};d._digLine=function(a){for(var b=1;b<a.length;b++){var c=a[b-
1],e=a[b];c=new da(c[0],c[1],e[0],e[1]);c.create(this._digCallback);this._corridors.push(c)}};d._digCallback=function(a,b,c){this._map[a][b]=c;0==c&&this._dug++};d._isWallCallback=function(a,b){return 0>a||0>b||a>=this._width||b>=this._height?!1:1==this._map[a][b]};d._canBeDugCallback=function(a,b){return 1>a||1>b||a+1>=this._width||b+1>=this._height?!1:1==this._map[a][b]};return h}(L);var I=function(k){function h(a,b,c){void 0===c&&(c={});a=k.call(this,a,b)||this;a._options={born:[5,6,7,8],survive:[4,
5,6,7,8],topology:8};a.setOptions(c);a._dirs=C[a._options.topology];a._map=a._fillMap(0);return a}_inheritsLoose(h,k);var d=h.prototype;d.randomize=function(a){for(var b=0;b<this._width;b++)for(var c=0;c<this._height;c++)this._map[b][c]=t.getUniform()<a?1:0;return this};d.setOptions=function(a){Object.assign(this._options,a)};d.set=function(a,b,c){this._map[a][b]=c};d.create=function(a){for(var b=this._fillMap(0),c=this._options.born,e=this._options.survive,f=0;f<this._height;f++){var g=1,l=0;6==
this._options.topology&&(g=2,l=f%2);for(;l<this._width;l+=g){var m=this._map[l][f],n=this._getNeighbors(l,f);m&&-1!=e.indexOf(n)?b[l][f]=1:m||-1==c.indexOf(n)||(b[l][f]=1)}}this._map=b;a&&this._serviceCallback(a)};d._serviceCallback=function(a){for(var b=0;b<this._height;b++){var c=1,e=0;6==this._options.topology&&(c=2,e=b%2);for(;e<this._width;e+=c)a(e,b,this._map[e][b])}};d._getNeighbors=function(a,b){for(var c=0,e=0;e<this._dirs.length;e++){var f=this._dirs[e],g=a+f[0];f=b+f[1];0>g||g>=this._width||
0>f||f>=this._height||(c+=1==this._map[g][f]?1:0)}return c};d.connect=function(a,b,c){b||=0;var e=[],f={},g=1,l=[0,0];6==this._options.topology&&(g=2,l=[0,1]);for(var m=0;m<this._height;m++)for(var n=l[m%2];n<this._width;n+=g)if(this._freeSpace(n,m,b)){var p=[n,m];f[this._pointKey(p)]=p;e.push([n,m])}g=e[t.getUniformInt(0,e.length-1)];l=this._pointKey(g);e={};e[l]=g;delete f[l];for(this._findConnected(e,f,[g],!1,b);0<Object.keys(f).length;){l=this._getFromTo(e,f);g=l[0];m=l[1];l={};l[this._pointKey(g)]=
g;this._findConnected(l,f,[g],!0,b);(6==this._options.topology?this._tunnelToConnected6:this._tunnelToConnected).call(this,m,g,e,f,b,c);for(var q in l)g=l[q],this._map[g[0]][g[1]]=b,e[q]=g,delete f[q]}a&&this._serviceCallback(a)};d._getFromTo=function(a,b){for(var c=[0,0],e=[0,0],f,g=Object.keys(a),l=Object.keys(b),m=0;5>m&&!(g.length<l.length?(c=g,e=a[c[t.getUniformInt(0,c.length-1)]],c=this._getClosest(e,b)):(c=l,c=b[c[t.getUniformInt(0,c.length-1)]],e=this._getClosest(c,a)),f=(c[0]-e[0])*(c[0]-
e[0])+(c[1]-e[1])*(c[1]-e[1]),64>f);m++);return[c,e]};d._getClosest=function(a,b){var c=null,e=null,f;for(f in b){var g=b[f],l=(g[0]-a[0])*(g[0]-a[0])+(g[1]-a[1])*(g[1]-a[1]);if(null==e||l<e)e=l,c=g}return c};d._findConnected=function(a,b,c,e,f){for(;0<c.length;){var g=c.splice(0,1)[0];g=6==this._options.topology?[[g[0]+2,g[1]],[g[0]+1,g[1]-1],[g[0]-1,g[1]-1],[g[0]-2,g[1]],[g[0]-1,g[1]+1],[g[0]+1,g[1]+1]]:[[g[0]+1,g[1]],[g[0]-1,g[1]],[g[0],g[1]+1],[g[0],g[1]-1]];for(var l=0;l<g.length;l++){var m=
this._pointKey(g[l]);null==a[m]&&this._freeSpace(g[l][0],g[l][1],f)&&(a[m]=g[l],e||delete b[m],c.push(g[l]))}}};d._tunnelToConnected=function(a,b,c,e,f,g){if(b[0]<a[0]){var l=b;var m=a}else l=a,m=b;for(var n=l[0];n<=m[0];n++){this._map[n][l[1]]=f;var p=[n,l[1]],q=this._pointKey(p);c[q]=p;delete e[q]}g&&l[0]<m[0]&&g(l,[m[0],l[1]]);n=m[0];b[1]<a[1]?(l=b,m=a):(l=a,m=b);for(a=l[1];a<m[1];a++)this._map[n][a]=f,b=[n,a],p=this._pointKey(b),c[p]=b,delete e[p];g&&l[1]<m[1]&&g([m[0],l[1]],[m[0],m[1]])};d._tunnelToConnected6=
function(a,b,c,e,f,g){if(b[0]<a[0]){var l=b;var m=a}else l=a,m=b;var n=l[0];for(l=l[1];n!=m[0]||l!=m[1];){var p=2;l<m[1]?(l++,p=1):l>m[1]&&(l--,p=1);n=n<m[0]?n+p:n>m[0]?n-p:m[1]%2?n-p:n+p;this._map[n][l]=f;p=[n,l];var q=this._pointKey(p);c[q]=p;delete e[q]}g&&g(b,a)};d._freeSpace=function(a,b,c){return 0<=a&&a<this._width&&0<=b&&b<this._height&&this._map[a][b]==c};d._pointKey=function(a){return a[0]+"."+a[1]};return h}(z),ya={room:T,corridor:da};L=function(k){function h(a,b,c){void 0===c&&(c={});
a=k.call(this,a,b)||this;a._options=Object.assign({roomWidth:[3,9],roomHeight:[3,5],corridorLength:[3,10],dugPercentage:.2,timeLimit:1E3},c);a._features={room:4,corridor:4};a._map=[];a._featureAttempts=20;a._walls={};a._dug=0;a._digCallback=a._digCallback.bind(_assertThisInitialized(a));a._canBeDugCallback=a._canBeDugCallback.bind(_assertThisInitialized(a));a._isWallCallback=a._isWallCallback.bind(_assertThisInitialized(a));a._priorityWallCallback=a._priorityWallCallback.bind(_assertThisInitialized(a));
return a}_inheritsLoose(h,k);var d=h.prototype;d.create=function(a){this._rooms=[];this._corridors=[];this._map=this._fillMap(1);this._walls={};this._dug=0;var b=(this._width-2)*(this._height-2);this._firstRoom();var c=Date.now();do{var e=0;if(Date.now()-c>this._options.timeLimit)break;var f=this._findWall();if(!f)break;var g=f.split(",");f=parseInt(g[0]);g=parseInt(g[1]);var l=this._getDiggingDirection(f,g);if(l){var m=0;do if(m++,this._tryFeature(f,g,l[0],l[1])){this._removeSurroundingWalls(f,g);
this._removeSurroundingWalls(f-l[0],g-l[1]);break}while(m<this._featureAttempts);for(var n in this._walls)1<this._walls[n]&&e++}}while(this._dug/b<this._options.dugPercentage||e);this._addDoors();if(a)for(b=0;b<this._width;b++)for(c=0;c<this._height;c++)a(b,c,this._map[b][c]);this._walls={};this._map=[];return this};d._digCallback=function(a,b,c){0==c||2==c?(this._map[a][b]=0,this._dug++):this._walls[a+","+b]=1};d._isWallCallback=function(a,b){return 0>a||0>b||a>=this._width||b>=this._height?!1:1==
this._map[a][b]};d._canBeDugCallback=function(a,b){return 1>a||1>b||a+1>=this._width||b+1>=this._height?!1:1==this._map[a][b]};d._priorityWallCallback=function(a,b){this._walls[a+","+b]=2};d._firstRoom=function(){var a=T.createRandomCenter(Math.floor(this._width/2),Math.floor(this._height/2),this._options);this._rooms.push(a);a.create(this._digCallback)};d._findWall=function(){var a=[],b=[],c;for(c in this._walls)2==this._walls[c]?b.push(c):a.push(c);a=b.length?b:a;if(!a.length)return null;a=t.getItem(a.sort());
delete this._walls[a];return a};d._tryFeature=function(a,b,c,e){var f=t.getWeightedValue(this._features);a=ya[f].createRandomAt(a,b,c,e,this._options);if(!a.isValid(this._isWallCallback,this._canBeDugCallback))return!1;a.create(this._digCallback);a instanceof T&&this._rooms.push(a);a instanceof da&&(a.createPriorityWalls(this._priorityWallCallback),this._corridors.push(a));return!0};d._removeSurroundingWalls=function(a,b){for(var c=C[4],e=0;e<c.length;e++){var f=c[e],g=a+f[0],l=b+f[1];delete this._walls[g+
","+l];g=a+2*f[0];l=b+2*f[1];delete this._walls[g+","+l]}};d._getDiggingDirection=function(a,b){if(0>=a||0>=b||a>=this._width-1||b>=this._height-1)return null;for(var c=null,e=C[4],f=0;f<e.length;f++){var g=e[f];if(!this._map[a+g[0]][b+g[1]]){if(c)return null;c=g}}return c?[-c[0],-c[1]]:null};d._addDoors=function(){function a(f,g){return 1==b[f][g]}for(var b=this._map,c=0;c<this._rooms.length;c++){var e=this._rooms[c];e.clearDoors();e.addDoors(a)}};return h}(L);var za=function(k){function h(){return k.apply(this,
arguments)||this}_inheritsLoose(h,k);h.prototype.create=function(d){for(var a=this._fillMap(1),b=Math.ceil((this._width-2)/2),c=[],e=[],f=0;f<b;f++)c.push(f),e.push(f);c.push(b-1);for(f=1;f+3<this._height;f+=2)for(var g=0;g<b;g++){var l=2*g+1,m=f;a[l][m]=0;g!=c[g+1]&&.375<t.getUniform()&&(ja(g,c,e),a[l+1][m]=0);g!=c[g]&&.375<t.getUniform()?ka(g,c,e):a[l][m+1]=0}for(g=0;g<b;g++)l=2*g+1,m=f,a[l][m]=0,g!=c[g+1]&&(g==c[g]||.375<t.getUniform())&&(ja(g,c,e),a[l+1][m]=0),ka(g,c,e);for(b=0;b<this._width;b++)for(c=
0;c<this._height;c++)d(b,c,a[b][c]);return this};return h}(z),Aa=function(k){function h(){var a=k.apply(this,arguments)||this;a._stack=[];a._map=[];return a}_inheritsLoose(h,k);var d=h.prototype;d.create=function(a){var b=this._width,c=this._height;this._map=[];for(var e=0;e<b;e++){this._map.push([]);for(var f=0;f<c;f++)this._map[e].push(0==e||0==f||e+1==b||f+1==c?1:0)}this._stack=[[1,1,b-2,c-2]];this._process();for(e=0;e<b;e++)for(f=0;f<c;f++)a(e,f,this._map[e][f]);this._map=[];return this};d._process=
function(){for(;this._stack.length;){var a=this._stack.shift();this._partitionRoom(a)}};d._partitionRoom=function(a){for(var b=[],c=[],e=a[0]+1;e<a[2];e++){var f=this._map[e][a[3]+1];!this._map[e][a[1]-1]||!f||e%2||b.push(e)}for(e=a[1]+1;e<a[3];e++)f=this._map[a[2]+1][e],!this._map[a[0]-1][e]||!f||e%2||c.push(e);if(b.length&&c.length){b=t.getItem(b);c=t.getItem(c);this._map[b][c]=1;e=[];f=[];e.push(f);for(var g=a[0];g<b;g++)this._map[g][c]=1,g%2&&f.push([g,c]);f=[];e.push(f);for(g=b+1;g<=a[2];g++)this._map[g][c]=
1,g%2&&f.push([g,c]);f=[];e.push(f);for(g=a[1];g<c;g++)this._map[b][g]=1,g%2&&f.push([b,g]);f=[];e.push(f);for(g=c+1;g<=a[3];g++)this._map[b][g]=1,g%2&&f.push([b,g]);f=t.getItem(e);for(g=0;g<e.length;g++){var l=e[g];l!=f&&(l=t.getItem(l),this._map[l[0]][l[1]]=0)}this._stack.push([a[0],a[1],b-1,c-1]);this._stack.push([b+1,a[1],a[2],c-1]);this._stack.push([a[0],c+1,b-1,a[3]]);this._stack.push([b+1,c+1,a[2],a[3]])}};return h}(z),Ba=function(k){function h(a,b,c){void 0===c&&(c=0);a=k.call(this,a,b)||
this;a._regularity=c;a._map=[];return a}_inheritsLoose(h,k);var d=h.prototype;d.create=function(a){var b=this._width,c=this._height,e=this._fillMap(1);b-=b%2?1:2;c-=c%2?1:2;var f=0,g=[[0,0],[0,0],[0,0],[0,0]];do{var l=1+2*Math.floor(t.getUniform()*(b-1)/2);var m=1+2*Math.floor(t.getUniform()*(c-1)/2);f||(e[l][m]=0);if(!e[l][m]){this._randomize(g);do{0==Math.floor(t.getUniform()*(this._regularity+1))&&this._randomize(g);var n=!0;for(var p=0;4>p;p++){var q=l+2*g[p][0];var u=m+2*g[p][1];if(this._isFree(e,
q,u,b,c)){e[q][u]=0;e[l+g[p][0]][m+g[p][1]]=0;l=q;m=u;n=!1;f++;break}}}while(!n)}}while(f+1<b*c/4);for(b=0;b<this._width;b++)for(c=0;c<this._height;c++)a(b,c,e[b][c]);this._map=[];return this};d._randomize=function(a){for(var b=0;4>b;b++)a[b][0]=0,a[b][1]=0;switch(Math.floor(4*t.getUniform())){case 0:a[0][0]=-1;a[1][0]=1;a[2][1]=-1;a[3][1]=1;break;case 1:a[3][0]=-1;a[2][0]=1;a[1][1]=-1;a[0][1]=1;break;case 2:a[2][0]=-1;a[3][0]=1;a[0][1]=-1;a[1][1]=1;break;case 3:a[1][0]=-1,a[0][0]=1,a[3][1]=-1,a[2][1]=
1}};d._isFree=function(a,b,c,e,f){return 1>b||1>c||b>=e||c>=f?!1:a[b][c]};return h}(z);z=function(k){function h(a,b,c){a=k.call(this,a,b)||this;a.map=[];a.rooms=[];a.connectedCells=[];c=Object.assign({cellWidth:3,cellHeight:3},c);c.hasOwnProperty("roomWidth")||(c.roomWidth=a._calculateRoomSize(a._width,c.cellWidth));c.hasOwnProperty("roomHeight")||(c.roomHeight=a._calculateRoomSize(a._height,c.cellHeight));a._options=c;return a}_inheritsLoose(h,k);var d=h.prototype;d.create=function(a){this.map=this._fillMap(1);
this.rooms=[];this.connectedCells=[];this._initRooms();this._connectRooms();this._connectUnconnectedRooms();this._createRandomRoomConnections();this._createRooms();this._createCorridors();if(a)for(var b=0;b<this._width;b++)for(var c=0;c<this._height;c++)a(b,c,this.map[b][c]);return this};d._calculateRoomSize=function(a,b){var c=Math.floor(a/b*.8);a=Math.floor(a/b*.25);2>a&&(a=2);2>c&&(c=2);return[a,c]};d._initRooms=function(){for(var a=0;a<this._options.cellWidth;a++){this.rooms.push([]);for(var b=
0;b<this._options.cellHeight;b++)this.rooms[a].push({x:0,y:0,width:0,height:0,connections:[],cellx:a,celly:b})}};d._connectRooms=function(){var a=t.getUniformInt(0,this._options.cellWidth-1),b=t.getUniformInt(0,this._options.cellHeight-1);do{var c=[0,2,4,6];c=t.shuffle(c);do{var e=!1;var f=c.pop();var g=a+C[8][f][0];f=b+C[8][f][1];if(!(0>g||g>=this._options.cellWidth||0>f||f>=this._options.cellHeight)){var l=this.rooms[a][b];if(0<l.connections.length&&l.connections[0][0]==g&&l.connections[0][1]==
f)break;l=this.rooms[g][f];0==l.connections.length&&(l.connections.push([a,b]),this.connectedCells.push([g,f]),a=g,b=f,e=!0)}}while(0<c.length&&0==e)}while(0<c.length)};d._connectUnconnectedRooms=function(){var a=this._options.cellWidth,b=this._options.cellHeight;this.connectedCells=t.shuffle(this.connectedCells);for(var c,e,f,g=0;g<this._options.cellWidth;g++)for(var l=0;l<this._options.cellHeight;l++)if(c=this.rooms[g][l],0==c.connections.length){var m=[0,2,4,6];m=t.shuffle(m);f=!1;do{var n=m.pop(),
p=g+C[8][n][0];n=l+C[8][n][1];if(!(0>p||p>=a||0>n||n>=b)){e=this.rooms[p][n];f=!0;if(0==e.connections.length)break;for(p=0;p<e.connections.length;p++)if(e.connections[p][0]==g&&e.connections[p][1]==l){f=!1;break}if(f)break}}while(m.length);f?c.connections.push([e.cellx,e.celly]):console.log("-- Unable to connect room.")}};d._createRandomRoomConnections=function(){};d._createRooms=function(){for(var a=this._width,b=this._height,c=this._options.cellWidth,e=this._options.cellHeight,f=Math.floor(this._width/
c),g=Math.floor(this._height/e),l,m,n=this._options.roomWidth,p=this._options.roomHeight,q,u,v,w=0;w<c;w++)for(var A=0;A<e;A++){q=f*w;u=g*A;0==q&&(q=1);0==u&&(u=1);l=t.getUniformInt(n[0],n[1]);m=t.getUniformInt(p[0],p[1]);if(0<A)for(v=this.rooms[w][A-1];3>u-(v.y+v.height);)u++;if(0<w)for(v=this.rooms[w-1][A];3>q-(v.x+v.width);)q++;v=Math.round(t.getUniformInt(0,f-l)/2);for(var B=Math.round(t.getUniformInt(0,g-m)/2);q+v+l>=a;)v?v--:l--;for(;u+B+m>=b;)B?B--:m--;q+=v;u+=B;this.rooms[w][A].x=q;this.rooms[w][A].y=
u;this.rooms[w][A].width=l;this.rooms[w][A].height=m;for(v=q;v<q+l;v++)for(B=u;B<u+m;B++)this.map[v][B]=0}};d._getWallPosition=function(a,b){if(1==b||3==b){var c=t.getUniformInt(a.x+1,a.x+a.width-2);if(1==b){var e=a.y-2;a=e+1}else e=a.y+a.height+1,a=e-1;this.map[c][a]=0}else e=t.getUniformInt(a.y+1,a.y+a.height-2),2==b?(c=a.x+a.width+1,a=c-1):(c=a.x-2,a=c+1),this.map[a][e]=0;return[c,e]};d._drawCorridor=function(a,b){var c=b[0]-a[0],e=b[1]-a[1];b=a[0];a=a[1];var f=[];var g=Math.abs(c);var l=Math.abs(e);
var m=t.getUniform();var n=1-m;c=0<c?2:6;e=0<e?4:0;g<l?(m=Math.ceil(l*m),f.push([e,m]),f.push([c,g]),m=Math.floor(l*n),f.push([e,m])):(m=Math.ceil(g*m),f.push([c,m]),f.push([e,l]),m=Math.floor(g*n),f.push([c,m]));for(this.map[b][a]=0;0<f.length;)for(g=f.pop();0<g[1];)b+=C[8][g[0]][0],a+=C[8][g[0]][1],this.map[b][a]=0,--g[1]};d._createCorridors=function(){for(var a=this._options.cellWidth,b=this._options.cellHeight,c,e,f,g,l=0;l<a;l++)for(var m=0;m<b;m++){c=this.rooms[l][m];for(var n=0;n<c.connections.length;n++)e=
c.connections[n],e=this.rooms[e[0]][e[1]],e.cellx>c.cellx?(f=2,g=4):e.cellx<c.cellx?(f=4,g=2):e.celly>c.celly?(f=3,g=1):(f=1,g=3),this._drawCorridor(this._getWallPosition(c,f),this._getWallPosition(e,g))}};return h}(z);D={Arena:D,Uniform:H,Cellular:I,Digger:L,EllerMaze:za,DividedMaze:Aa,IceyMaze:Ba,Rogue:z};var Ca=.5*(Math.sqrt(3)-1),O=(3-Math.sqrt(3))/6;z={Simplex:function(k){function h(d){void 0===d&&(d=256);var a=k.call(this)||this;a._gradients=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,
-1]];for(var b=[],c=0;c<d;c++)b.push(c);b=t.shuffle(b);a._perms=[];a._indexes=[];for(c=0;c<2*d;c++)a._perms.push(b[c%d]),a._indexes.push(a._perms[c]%a._gradients.length);return a}_inheritsLoose(h,k);h.prototype.get=function(d,a){var b=this._perms,c=this._indexes,e=b.length/2,f=0,g=0,l=0,m=(d+a)*Ca,n=Math.floor(d+m);var p=Math.floor(a+m);var q=(n+p)*O;m=d-(n-q);var u=a-(p-q);if(m>u){var v=1;var w=0}else v=0,w=1;q=m-v+O;var A=u-w+O;a=m-1+2*O;d=u-1+2*O;n=y(n,e);e=y(p,e);var B=.5-m*m-u*u;0<=B&&(B*=B,
p=c[n+b[e]],f=this._gradients[p],f=B*B*(f[0]*m+f[1]*u));m=.5-q*q-A*A;0<=m&&(m*=m,p=c[n+v+b[e+w]],g=this._gradients[p],g=m*m*(g[0]*q+g[1]*A));m=.5-a*a-d*d;0<=m&&(m*=m,p=c[n+1+b[e+1]],b=this._gradients[p],l=m*m*(b[0]*a+b[1]*d));return 70*(f+g+l)};return h}(function(){})};I=function(){function k(h,d,a,b){void 0===b&&(b={});this._toX=h;this._toY=d;this._passableCallback=a;this._options=Object.assign({topology:8},b);this._dirs=C[this._options.topology];8==this._options.topology&&(this._dirs=[this._dirs[0],
this._dirs[2],this._dirs[4],this._dirs[6],this._dirs[1],this._dirs[3],this._dirs[5],this._dirs[7]])}k.prototype._getNeighbors=function(h,d){for(var a=[],b=0;b<this._dirs.length;b++){var c=this._dirs[b],e=h+c[0];c=d+c[1];this._passableCallback(e,c)&&a.push([e,c])}return a};return k}();H=function(k){function h(a,b,c,e){c=k.call(this,a,b,c,e)||this;c._computed={};c._todo=[];c._add(a,b,null);return c}_inheritsLoose(h,k);var d=h.prototype;d.compute=function(a,b,c){var e=a+","+b;e in this._computed||this._compute(a,
b);if(e in this._computed)for(a=this._computed[e];a;)c(a.x,a.y),a=a.prev};d._compute=function(a,b){for(;this._todo.length;){var c=this._todo.shift();if(c.x==a&&c.y==b)break;for(var e=this._getNeighbors(c.x,c.y),f=0;f<e.length;f++){var g=e[f],l=g[0];g=g[1];l+","+g in this._computed||this._add(l,g,c)}}};d._add=function(a,b,c){c={x:a,y:b,prev:c};this._computed[a+","+b]=c;this._todo.push(c)};return h}(I);I=function(k){function h(a,b,c,e){void 0===e&&(e={});a=k.call(this,a,b,c,e)||this;a._todo=[];a._done=
{};return a}_inheritsLoose(h,k);var d=h.prototype;d.compute=function(a,b,c){this._todo=[];this._done={};this._fromX=a;this._fromY=b;for(this._add(this._toX,this._toY,null);this._todo.length;){var e=this._todo.shift(),f=e.x+","+e.y;if(!(f in this._done)){this._done[f]=e;if(e.x==a&&e.y==b)break;f=this._getNeighbors(e.x,e.y);for(var g=0;g<f.length;g++){var l=f[g],m=l[0];l=l[1];m+","+l in this._done||this._add(m,l,e)}}}if(a=this._done[a+","+b])for(;a;)c(a.x,a.y),a=a.prev};d._add=function(a,b,c){var e=
this._distance(a,b);a={x:a,y:b,prev:c,g:c?c.g+1:0,h:e};b=a.g+a.h;for(c=0;c<this._todo.length;c++){var f=this._todo[c],g=f.g+f.h;if(b<g||b==g&&e<f.h){this._todo.splice(c,0,a);return}}this._todo.push(a)};d._distance=function(a,b){switch(this._options.topology){case 4:return Math.abs(a-this._fromX)+Math.abs(b-this._fromY);case 6:return b=Math.abs(b-this._fromY),b+Math.max(0,(Math.abs(a-this._fromX)-b)/2);case 8:return Math.max(Math.abs(a-this._fromX),Math.abs(b-this._fromY))}};return h}(I);H={Dijkstra:H,
AStar:I};I=function(){function k(d){this._scheduler=d;this._lock=1}var h=k.prototype;h.start=function(){return this.unlock()};h.lock=function(){this._lock++;return this};h.unlock=function(){if(!this._lock)throw Error("Cannot unlock unlocked engine");for(this._lock--;!this._lock;){var d=this._scheduler.next();if(!d)return this.lock();(d=d.act())&&d.then&&(this.lock(),d.then(this.unlock.bind(this)))}return this};return k}();L=function(){function k(d,a){void 0===a&&(a={});this._reflectivityCallback=
d;this._options={};a=Object.assign({passes:1,emissionThreshold:100,range:10},a);this._lights={};this._reflectivityCache={};this._fovCache={};this.setOptions(a)}var h=k.prototype;h.setOptions=function(d){Object.assign(this._options,d);d&&d.range&&this.reset();return this};h.setFOV=function(d){this._fov=d;this._fovCache={};return this};h.setLight=function(d,a,b){d=d+","+a;b?this._lights[d]="string"==typeof b?P(b):b:delete this._lights[d];return this};h.clearLights=function(){this._lights={}};h.reset=
function(){this._reflectivityCache={};this._fovCache={};return this};h.compute=function(d){var a={},b={},c={},e;for(e in this._lights){var f=this._lights[e];b[e]=[0,0,0];ea(b[e],f)}for(e=0;e<this._options.passes;e++)this._emitLight(b,c,a),e+1!=this._options.passes&&(b=this._computeEmitters(c,a));for(var g in c)b=g.split(","),a=parseInt(b[0]),b=parseInt(b[1]),d(a,b,c[g]);return this};h._emitLight=function(d,a,b){for(var c in d){var e=c.split(","),f=parseInt(e[0]);e=parseInt(e[1]);this._emitLightFromCell(f,
e,d[c],a);b[c]=1}return this};h._computeEmitters=function(d,a){var b={},c;for(c in d)if(!(c in a)){var e=d[c];if(c in this._reflectivityCache)var f=this._reflectivityCache[c];else{var g=c.split(",");f=parseInt(g[0]);g=parseInt(g[1]);f=this._reflectivityCallback(f,g);this._reflectivityCache[c]=f}if(0!=f){g=[0,0,0];for(var l=0,m=0;3>m;m++){var n=Math.round(e[m]*f);g[m]=n;l+=n}l>this._options.emissionThreshold&&(b[c]=g)}}return b};h._emitLightFromCell=function(d,a,b,c){var e=d+","+a;d=e in this._fovCache?
this._fovCache[e]:this._updateFOV(d,a);for(var f in d){a=d[f];f in c?e=c[f]:(e=[0,0,0],c[f]=e);for(var g=0;3>g;g++)e[g]+=Math.round(b[g]*a)}return this};h._updateFOV=function(d,a){var b={};this._fovCache[d+","+a]=b;var c=this._options.range;this._fov.compute(d,a,c,function(e,f,g,l){g=l*(1-g/c);0!=g&&(b[e+","+f]=g)}.bind(this));return b};return k}();r.Color=N;r.DEFAULT_HEIGHT=25;r.DEFAULT_WIDTH=80;r.DIRS=C;r.Display=K;r.Engine=I;r.EventQueue=ma;r.FOV=F;r.KEYS={VK_CANCEL:3,VK_HELP:6,VK_BACK_SPACE:8,
VK_TAB:9,VK_CLEAR:12,VK_RETURN:13,VK_ENTER:14,VK_SHIFT:16,VK_CONTROL:17,VK_ALT:18,VK_PAUSE:19,VK_CAPS_LOCK:20,VK_ESCAPE:27,VK_SPACE:32,VK_PAGE_UP:33,VK_PAGE_DOWN:34,VK_END:35,VK_HOME:36,VK_LEFT:37,VK_UP:38,VK_RIGHT:39,VK_DOWN:40,VK_PRINTSCREEN:44,VK_INSERT:45,VK_DELETE:46,VK_0:48,VK_1:49,VK_2:50,VK_3:51,VK_4:52,VK_5:53,VK_6:54,VK_7:55,VK_8:56,VK_9:57,VK_COLON:58,VK_SEMICOLON:59,VK_LESS_THAN:60,VK_EQUALS:61,VK_GREATER_THAN:62,VK_QUESTION_MARK:63,VK_AT:64,VK_A:65,VK_B:66,VK_C:67,VK_D:68,VK_E:69,VK_F:70,
VK_G:71,VK_H:72,VK_I:73,VK_J:74,VK_K:75,VK_L:76,VK_M:77,VK_N:78,VK_O:79,VK_P:80,VK_Q:81,VK_R:82,VK_S:83,VK_T:84,VK_U:85,VK_V:86,VK_W:87,VK_X:88,VK_Y:89,VK_Z:90,VK_CONTEXT_MENU:93,VK_NUMPAD0:96,VK_NUMPAD1:97,VK_NUMPAD2:98,VK_NUMPAD3:99,VK_NUMPAD4:100,VK_NUMPAD5:101,VK_NUMPAD6:102,VK_NUMPAD7:103,VK_NUMPAD8:104,VK_NUMPAD9:105,VK_MULTIPLY:106,VK_ADD:107,VK_SEPARATOR:108,VK_SUBTRACT:109,VK_DECIMAL:110,VK_DIVIDE:111,VK_F1:112,VK_F2:113,VK_F3:114,VK_F4:115,VK_F5:116,VK_F6:117,VK_F7:118,VK_F8:119,VK_F9:120,
VK_F10:121,VK_F11:122,VK_F12:123,VK_F13:124,VK_F14:125,VK_F15:126,VK_F16:127,VK_F17:128,VK_F18:129,VK_F19:130,VK_F20:131,VK_F21:132,VK_F22:133,VK_F23:134,VK_F24:135,VK_NUM_LOCK:144,VK_SCROLL_LOCK:145,VK_CIRCUMFLEX:160,VK_EXCLAMATION:161,VK_DOUBLE_QUOTE:162,VK_HASH:163,VK_DOLLAR:164,VK_PERCENT:165,VK_AMPERSAND:166,VK_UNDERSCORE:167,VK_OPEN_PAREN:168,VK_CLOSE_PAREN:169,VK_ASTERISK:170,VK_PLUS:171,VK_PIPE:172,VK_HYPHEN_MINUS:173,VK_OPEN_CURLY_BRACKET:174,VK_CLOSE_CURLY_BRACKET:175,VK_TILDE:176,VK_COMMA:188,
VK_PERIOD:190,VK_SLASH:191,VK_BACK_QUOTE:192,VK_OPEN_BRACKET:219,VK_BACK_SLASH:220,VK_CLOSE_BRACKET:221,VK_QUOTE:222,VK_META:224,VK_ALTGR:225,VK_WIN:91,VK_KANA:21,VK_HANGUL:21,VK_EISU:22,VK_JUNJA:23,VK_FINAL:24,VK_HANJA:25,VK_KANJI:25,VK_CONVERT:28,VK_NONCONVERT:29,VK_ACCEPT:30,VK_MODECHANGE:31,VK_SELECT:41,VK_PRINT:42,VK_EXECUTE:43,VK_SLEEP:95};r.Lighting=L;r.Map=D;r.Noise=z;r.Path=H;r.RNG=t;r.Scheduler=J;r.StringGenerator=S;r.Text=M;r.Util=sa;Object.defineProperty(r,"__esModule",{value:!0})});
 
``` 
 
### seedrandom.min.js 
 
```js 
 
!function(f,a,c){var s,l=256,p="random",d=c.pow(l,6),g=c.pow(2,52),y=2*g,h=l-1;function n(n,t,r){function e(){for(var n=u.g(6),t=d,r=0;n<g;)n=(n+r)*l,t*=l,r=u.g(1);for(;y<=n;)n/=2,t/=2,r>>>=1;return(n+r)/t}var o=[],i=j(function n(t,r){var e,o=[],i=typeof t;if(r&&"object"==i)for(e in t)try{o.push(n(t[e],r-1))}catch(n){}return o.length?o:"string"==i?t:t+"\0"}((t=1==t?{entropy:!0}:t||{}).entropy?[n,S(a)]:null==n?function(){try{var n;return s&&(n=s.randomBytes)?n=n(l):(n=new Uint8Array(l),(f.crypto||f.msCrypto).getRandomValues(n)),S(n)}catch(n){var t=f.navigator,r=t&&t.plugins;return[+new Date,f,r,f.screen,S(a)]}}():n,3),o),u=new m(o);return e.int32=function(){return 0|u.g(4)},e.quick=function(){return u.g(4)/4294967296},e.double=e,j(S(u.S),a),(t.pass||r||function(n,t,r,e){return e&&(e.S&&v(e,u),n.state=function(){return v(u,{})}),r?(c[p]=n,t):n})(e,i,"global"in t?t.global:this==c,t.state)}function m(n){var t,r=n.length,u=this,e=0,o=u.i=u.j=0,i=u.S=[];for(r||(n=[r++]);e<l;)i[e]=e++;for(e=0;e<l;e++)i[e]=i[o=h&o+n[e%r]+(t=i[e])],i[o]=t;(u.g=function(n){for(var t,r=0,e=u.i,o=u.j,i=u.S;n--;)t=i[e=h&e+1],r=r*l+i[h&(i[e]=i[o=h&o+t])+(i[o]=t)];return u.i=e,u.j=o,r})(l)}function v(n,t){return t.i=n.i,t.j=n.j,t.S=n.S.slice(),t}function j(n,t){for(var r,e=n+"",o=0;o<e.length;)t[h&o]=h&(r^=19*t[h&o])+e.charCodeAt(o++);return S(t)}function S(n){return String.fromCharCode.apply(0,n)}if(j(c.random(),a),"object"==typeof module&&module.exports){module.exports=n;try{s=require("crypto")}catch(n){}}else"function"==typeof define&&define.amd?define(function(){return n}):c["seed"+p]=n}("undefined"!=typeof self?self:this,[],Math); 
``` 
 
### sprite_registry.js 
 
```js 
 
/**
 * ЕДИНЫЙ РЕЕСТР СПРАЙТОВ И СИМВОЛОВ (sprite_registry.js)
 * Подключать ПЕРВЫМ среди пользовательских скриптов.
 */

const SPRITE_REGISTRY = {
    // === 1. ГЛОБАЛЬНАЯ КАРТА (уникальные символы) ===
    'TILE_PLAIN':            { char: '░',   tile: { file: 'terrain_sprites', x: 10, y: 2 }, desc: 'Равнина' }, // Было: '.'
    'TILE_FOREST':           { char: 'T',   tile: { file: 'terrain_sprites', x: 8, y: 2 }, desc: 'Лес' },
    'TILE_MOUNTAIN':         { char: '^',   tile: { file: 'terrain_sprites', x: 5, y: 2 }, desc: 'Горы' },
    'TILE_WATER':            { char: '≈',   tile: { file: 'terrain_sprites', x: 7, y: 2 }, desc: 'Вода' },
    'TILE_CITY':             { char: 'C',   tile: { file: 'terrain_sprites', x: 9, y: 2 }, desc: 'Город' },
    'TILE_DUNGEON_ENTRANCE': { char: 'D',   tile: { file: 'terrain_sprites', x: 6, y: 0 }, desc: 'Вход' },
    'TILE_ROAD':             { char: '─',   tile: { file: 'terrain_sprites', x: 1, y: 2 }, desc: 'Дорога' }, // Было: '█'

    // === 2. ПОДЗЕМЕЛЬЕ (стандартные символы, без изменений) ===
    'FLOOR_DEFAULT':         { char: '.',   tile: { file: 'terrain_sprites', x: 0, y: 0 }, desc: 'Пол' },
    'WALL_DEFAULT':          { char: '#',   tile: { file: 'terrain_sprites', x: 12, y: 2 }, desc: 'Стена' },
    'FLOOR_ORGANIC':         { char: 'o',   tile: { file: 'terrain_sprites', x: 3, y: 2 }, desc: 'Орг. пол' },
    'WALL_ORGANIC':          { char: 'O',   tile: { file: 'terrain_sprites', x: 4, y: 2 }, desc: 'Орг. стена' },
    'FLOOR_CITY':            { char: '·',   tile: { file: 'terrain_sprites', x: 0, y: 0 }, desc: 'Пол города' },
    'WALL_CITY':             { char: '█',   tile: { file: 'terrain_sprites', x: 11, y: 2 }, desc: 'Стена города' },
    'STAIRS_UP':             { char: '>',  tile: { file: 'terrain_sprites', x: 3, y: 0 }, desc: 'Лестница ↑' },
    'STAIRS_DOWN':           { char: '<',  tile: { file: 'terrain_sprites', x: 2, y: 0 }, desc: 'Лестница ↓' },
    

    // ==========================================
    // 3. СУЩНОСТИ (Игрок и NPC)
    // ==========================================
    'PLAYER':                { char: '@',   tile: { file: 'creature_sprites', x: 2, y: 0 }, desc: 'Игрок' },
    'NPC':                   { char: '☺',   tile: { file: 'creature_sprites', x: 8, y: 3 }, desc: 'NPC' },

    // ==========================================
    // 4. ВРАГИ (ENEMY_TYPES)
    // ==========================================
    'ENEMY_RAT':             { char: 'r',   tile: { file: 'creature_sprites', x: 8, y: 9 }, desc: 'Крыса' },
    'ENEMY_GOBLIN':          { char: 'g',   tile: { file: 'creature_sprites', x: 12, y: 3 }, desc: 'Гоблин' },
    'ENEMY_WOLF':            { char: 'w',   tile: { file: 'creature_sprites', x: 1, y: 9 }, desc: 'Волк' },
    'ENEMY_BANDIT':          { char: 'b',   tile: { file: 'creature_sprites', x: 5, y: 0 }, desc: 'Бандит' },
    'ENEMY_SKELETON':        { char: 's',   tile: { file: 'creature_sprites', x: 6, y: 0 }, desc: 'Скелет' },
    'ENEMY_SLIME':           { char: 'j',   tile: { file: 'creature_sprites', x: 3, y: 15 }, desc: 'Слизень' },
    'ENEMY_ORC':             { char: 'k',   tile: { file: 'creature_sprites', x: 7, y: 0 }, desc: 'Орк' }, // Внимание: символ совпадает с WALL_ORGANIC
    'ENEMY_ZOMBIE':          { char: 'z',   tile: { file: 'creature_sprites', x: 8, y: 0 }, desc: 'Зомби' },
    'ENEMY_HARPY':           { char: 'h',   tile: { file: 'creature_sprites', x: 9, y: 0 }, desc: 'Гарпия' },
    'ENEMY_GHOST':           { char: 'G',   tile: { file: 'creature_sprites', x: 10, y: 0 }, desc: 'Призрак' }, // Совпадает с ITEM_GLOVES
    'ENEMY_VAMPIRE':         { char: 'V',   tile: { file: 'creature_sprites', x: 11, y: 0 }, desc: 'Вампир' },
    'ENEMY_TROLL':           { char: 't',   tile: { file: 'creature_sprites', x: 12, y: 0 }, desc: 'Тролль' }, // Совпадает с TILE_FOREST
    'ENEMY_LICH':            { char: 'L',   tile: { file: 'creature_sprites', x: 13, y: 0 }, desc: 'Лич' },
    'ENEMY_GOLEM':           { char: 'M',   tile: { file: 'creature_sprites', x: 14, y: 0 }, desc: 'Голем' },
    'ENEMY_DRAGON':          { char: 'q',   tile: { file: 'creature_sprites', x: 15, y: 0 }, desc: 'Дракон' },

    // ==========================================
    // 5. ПРЕДМЕТЫ (ITEM_TYPES)
    // ==========================================
    
    // Оружие ближнего боя
    'ITEM_SWORD':            { char: '/',   tile: { file: 'item_sprites', x: 0, y: 0 }, desc: 'Меч' },
    'ITEM_AXE':              { char: 'P',   tile: { file: 'item_sprites', x: 1, y: 0 }, desc: 'Топор' }, // Совпадает с TILE_MOUNTAIN
    'ITEM_MACE':             { char: ')',   tile: { file: 'item_sprites', x: 2, y: 0 }, desc: 'Булава' },
    'ITEM_DAGGER':           { char: '*',   tile: { file: 'item_sprites', x: 3, y: 0 }, desc: 'Кинжал' }, // Совпадает с ITEM_BERSERK
    'ITEM_SPEAR':            { char: 'Y',   tile: { file: 'item_sprites', x: 4, y: 0 }, desc: 'Копье' },

    // Оружие дальнего боя
    'ITEM_BOW':              { char: '(',   tile: { file: 'item_sprites', x: 5, y: 0 }, desc: 'Лук' },
    'ITEM_CROSSBOW':         { char: '=',   tile: { file: 'item_sprites', x: 6, y: 0 }, desc: 'Арбалет' },
    'ITEM_STAFF':            { char: '|',   tile: { file: 'item_sprites', x: 7, y: 0 }, desc: 'Посох' },
    

    // Броня
    'ITEM_ARMOR_LEATHER':    { char: ']',   tile: { file: 'item_sprites', x: 8, y: 0 }, desc: 'Кожаная броня' },
    'ITEM_ARMOR_CHAIN':      { char: '[',   tile: { file: 'item_sprites', x: 9, y: 0 }, desc: 'Кольчуга' },
    'ITEM_SHIELD':           { char: '}',   tile: { file: 'item_sprites', x: 10, y: 0 }, desc: 'Щит' },
    'ITEM_GREAVES':          { char: '"',   tile: { file: 'item_sprites', x: 11, y: 0 }, desc: 'Наголенники' }, // Совпадает с FLOOR_ORGANIC
    'ITEM_CLOAK':            { char: '{',   tile: { file: 'item_sprites', x: 12, y: 0 }, desc: 'Плащ' },
    'ITEM_HELMET':           { char: 'H',   tile: { file: 'item_sprites', x: 13, y: 0 }, desc: 'Шлем' },
    'ITEM_GLOVES':           { char: 'v',   tile: { file: 'item_sprites', x: 14, y: 0 }, desc: 'Перчатки' }, // Совпадает с ENEMY_GHOST

    // Ресурсы и прочее
    'ITEM_GOLD':             { char: '$',   tile: { file: 'item_sprites', x: 13, y: 3 }, desc: 'Золото' },
    'ITEM_BOOK':             { char: '?',   tile: { file: 'item_sprites', x: 3, y: 4 }, desc: 'Книга' },
    'ITEM_SCROLL':          { char: '&',   tile: { file: 'item_sprites', x: 0, y: 4 }, desc: 'Свиток' },
    'ITEM_BED':            { char: '8',   tile: { file: 'item_sprites', x: 19, y: 0 }, desc: 'Кровать' }, // Если x:19 нет в вашем PNG, поменяйте на любую свободную клетку

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
    'ITEM_POTION_HP':        { char: '!',   tile: { file: 'item_sprites', x: 14, y: 0 }, desc: 'Зелье лечения' }, // Совпадает с ITEM_POTION_STR
    'ITEM_ELIXIR':           { char: '+',   tile: { file: 'item_sprites', x: 15, y: 0 }, desc: 'Эликсир' },
    'ITEM_FOOD_BREAD':       { char: '%',   tile: { file: 'item_sprites', x: 16, y: 0 }, desc: 'Еда' },
    'ITEM_FOOD_MEAT':        { char: '~',   tile: { file: 'item_sprites', x: 17, y: 0 }, desc: 'Мясо' },
    'ITEM_POTION_STR':       { char: '!',   tile: { file: 'item_sprites', x: 14, y: 0 }, desc: 'Зелье силы' },
    'ITEM_BERSERK':          { char: '*',   tile: { file: 'item_sprites', x: 3, y: 0 }, desc: 'Настой берсерка' } // Совпадает с ITEM_DAGGER
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
 
``` 
 
### tileset_renderer.js 
 
```js 
 
/**
 * МОДУЛЬ ОТРИСОВКИ СПРАЙТОВ (TilesetRenderer)
 * Отвечает за загрузку PNG-тайлсетов и их отрисовку с программной окраской.
 */
const TilesetRenderer = (function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const TILE_SIZE = 16;
    const SPRITE_FILES = [
        { src: 'terrain_sprites.png', key: 'terrain_sprites' },
        { src: 'creature_sprites.png', key: 'creature_sprites' },
        { src: 'item_sprites.png',   key: 'item_sprites' }
    ];

    // === СОСТОЯНИЕ ===
    const spriteSheets = {};
    let isReady = false;

    // === МАППИНГ СИМВОЛОВ
    // Формат: 'символ': { file: 'ключ_картинки', x: колонка, y: ряд }
    const TILE_MAP = {
        // === ПОДЗЕМЕЛЬЕ (стандартные, без изменений) ===
        '.':  { file: 'terrain_sprites', x: 0, y: 0 },  // FLOOR_DEFAULT
        '#':  { file: 'terrain_sprites', x: 12, y: 2 },  // WALL_DEFAULT
        'o':  { file: 'terrain_sprites', x: 3, y: 2 },  // FLOOR_ORGANIC
        'O':  { file: 'terrain_sprites', x: 4, y: 2 },  // WALL_ORGANIC
        '·':  { file: 'terrain_sprites', x: 0, y: 0 },  // FLOOR_CITY
        '█':  { file: 'terrain_sprites', x: 11, y: 2 }, // WALL_CITY
        '>': { file: 'terrain_sprites', x: 3, y: 0 },  // STAIRS_UP
        '<': { file: 'terrain_sprites', x: 2, y: 0 },  // STAIRS_DOWN

        // === ГЛОБАЛЬНАЯ КАРТА (новые уникальные символы) ===
        '░':  { file: 'terrain_sprites', x: 10, y: 2 }, // TILE_PLAIN
        '─':  { file: 'terrain_sprites', x: 1, y: 2 }, // TILE_ROAD
        'T':  { file: 'terrain_sprites', x: 8, y: 2 },  // TILE_FOREST
        '^':  { file: 'terrain_sprites', x: 5, y: 2 },  // TILE_MOUNTAIN
        '≈':  { file: 'terrain_sprites', x: 7, y: 2 },  // TILE_WATER
        'C':  { file: 'terrain_sprites', x: 9, y: 2 },  // TILE_CITY
        'D':  { file: 'terrain_sprites', x: 6, y: 0 },  // TILE_DUNGEON_ENTRANCE


        // --- СУЩЕСТВА ---
        '@': { file: 'creature_sprites', x: 2,  y: 0 },  // Игрок
        'r': { file: 'creature_sprites', x: 8,  y: 9 },  // Крыса
        'g': { file: 'creature_sprites', x: 12, y: 3 },  // Гоблин
        'w': { file: 'creature_sprites', x: 1,  y: 9 },  // Волк
        'j': { file: 'creature_sprites', x: 3,  y: 15 }, // Слизень
        'b': { file: 'creature_sprites', x: 5,  y: 0 },  // Бандит
        's': { file: 'creature_sprites', x: 6,  y: 0 },  // Скелет
        'k': { file: 'creature_sprites', x: 7,  y: 0 },  // Орк
        'z': { file: 'creature_sprites', x: 8,  y: 0 },  // Зомби
        'h': { file: 'creature_sprites', x: 9,  y: 0 },  // Гарпия
        'G': { file: 'creature_sprites', x: 10, y: 0 },  // Призрак
        'V': { file: 'creature_sprites', x: 11, y: 0 },  // Вампир
        't': { file: 'creature_sprites', x: 12, y: 0 },  // Тролль
        'L': { file: 'creature_sprites', x: 13, y: 0 },  // Лич
        'M': { file: 'creature_sprites', x: 14, y: 0 },  // Голем
        'q': { file: 'creature_sprites', x: 15, y: 0 },  // Дракон
        '☺': { file: 'creature_sprites', x: 8,  y: 3 },  // NPC
        
        // === БОССЫ (2x2) ===
        // Добавляем символ 'B', который используется в entity.js для всех боссов
        'B': { file: 'creature_sprites', x: 0,  y: 18 }, // Босс (верхний левый угол 32x32)
        
        // --- ПРЕДМЕТЫ ---
        '/': { file: 'item_sprites', x: 0,  y: 0 }, // Меч
        'P': { file: 'item_sprites', x: 1,  y: 0 }, // Топор
        ')': { file: 'item_sprites', x: 2,  y: 0 }, // Булава
        '*': { file: 'item_sprites', x: 3,  y: 0 }, // Кинжал
        'Y': { file: 'item_sprites', x: 4,  y: 0 }, // Копье
        '(': { file: 'item_sprites', x: 5,  y: 0 }, // Лук
        '=': { file: 'item_sprites', x: 6,  y: 0 }, // Арбалет
        '|': { file: 'item_sprites', x: 7,  y: 0 }, // Посох
        ']': { file: 'item_sprites', x: 8,  y: 0 }, // Кожа
        '[': { file: 'item_sprites', x: 9,  y: 0 }, // Кольчуга
        '}': { file: 'item_sprites', x: 10, y: 0 }, // Щит
        '"': { file: 'item_sprites', x: 11, y: 0 }, // Наголенники
        '{': { file: 'item_sprites', x: 12, y: 0 }, // Плащ
        'H': { file: 'item_sprites', x: 13, y: 0 }, // Шлем
        'v': { file: 'item_sprites', x: 14, y: 0 }, // Перчатки
        '!': { file: 'item_sprites', x: 15, y: 0 }, // Зелье
        '+': { file: 'item_sprites', x: 16, y: 0 }, // Эликсир
        '%': { file: 'item_sprites', x: 17, y: 0 }, // Еда
        '~': { file: 'item_sprites', x: 18, y: 0 }, // Мясо
        '?': { file: 'item_sprites', x: 3, y: 4 }, // ITEM_BOOK
        '$': { file: 'item_sprites', x: 13, y: 3 },  // Золото
        '&': { file: 'item_sprites', x: 0, y: 4 },
        '8': { file: 'item_sprites', x: 19, y: 0 } // Кровать
    };

    // === ИНИЦИАЛИЗАЦИЯ (Загрузка изображений) ===
    async function init() {
        try {
            await Promise.all(SPRITE_FILES.map(({ src, key }) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        spriteSheets[key] = img;
                        resolve();
                    };
                    img.onerror = () => {
                        console.error(`❌ Не удалось загрузить тайлсет: ${src}`);
                        reject(new Error(`Failed to load ${src}`));
                    };
                    img.src = src;
                });
            }));
            isReady = true;
            console.log("✅ TilesetRenderer: Все спрайты загружены.");
        } catch (error) {
            console.error("❌ Критическая ошибка загрузки спрайтов:", error);
        }
    }

    // === ОТРИСОВКА ПО СИМВОЛУ (стандартная) ===
    function draw(ctx, char, screenX, screenY, color) {
        if (!ctx) return;

        const destX = screenX * TILE_SIZE;
        const destY = screenY * TILE_SIZE;
        const tileData = TILE_MAP[char];

        // 1. Fallback: Если символ не найден в маппинге -> рисуем текст
        if (!tileData) {
            ctx.fillStyle = color || '#fff';
            ctx.font = `${TILE_SIZE}px Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, destX + TILE_SIZE / 2, destY + TILE_SIZE / 2);
            return;
        }

        const img = spriteSheets[tileData.file];

        // 2. Ошибка: Картинка не загружена
        if (!img || !isReady) {
            ctx.fillStyle = '#ff0000'; // Красный квадрат
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tileData.x * TILE_SIZE;
        const srcY = tileData.y * TILE_SIZE;

        // 3. Ошибка: Координаты вне границ картинки
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00'; // Желтый квадрат
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            console.warn(`⚠️ OOB: Спрайт '${char}' (${tileData.file}) за пределами изображения`);
            return;
        }

        // 4. Отрисовка спрайта
        ctx.save();
        
        // Очищаем ячейку (на случай, если там был мусор)
        ctx.clearRect(destX, destY, TILE_SIZE, TILE_SIZE);
        
        // Рисуем сам спрайт
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // 5. Программная окраска (если цвет не белый/черный)
        if (color && color !== '#fff' && color !== '#ffffff' && color !== '#000' && color !== '#000000') {
            // source-atop: рисует новый цвет ТОЛЬКО там, где уже есть непрозрачные пиксели (спрайт)
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }

        ctx.restore();
    }

    // === НОВАЯ ФУНКЦИЯ: ОТРИСОВКА ПО КЛЮЧУ РЕЕСТРА (для боссов 2x2) ===
    function drawByKey(ctx, key, screenX, screenY, color) {
        if (!ctx) return;

        const destX = screenX * TILE_SIZE;
        const destY = screenY * TILE_SIZE;
        
        // Получаем данные тайла напрямую из реестра спрайтов
        const tileData = getTileData(key); 

        // Если ключа нет в реестре, рисуем красный квадрат ошибки
        if (!tileData) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            console.warn(`⚠️ Не найден ключ спрайта: ${key}`);
            return;
        }

        const img = spriteSheets[tileData.file];

        if (!img || !isReady) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tileData.x * TILE_SIZE;
        const srcY = tileData.y * TILE_SIZE;

        // Проверка границ
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        ctx.save();
        ctx.clearRect(destX, destY, TILE_SIZE, TILE_SIZE);
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // Окраска
        if (color && color !== '#fff' && color !== '#ffffff' && color !== '#000' && color !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }
        ctx.restore();
    }


        // === НОВАЯ ФУНКЦИЯ: ОТРИСОВКА БОЛЬШИХ СПРАЙТОВ (2x2) ===
    function drawBig(ctx, char, screenX, screenY, color) {
        if (!ctx) return;

        const tileData = TILE_MAP[char];
        if (!tileData) return;

        const img = spriteSheets[tileData.file];
        if (!img || !isReady) return;

        const srcX = tileData.x * TILE_SIZE;
        const srcY = tileData.y * TILE_SIZE;

        // Размеры назначения: 2 тайла в ширину и высоту
        const destW = TILE_SIZE * 2;
        const destH = TILE_SIZE * 2;
        const destX = screenX * TILE_SIZE;
        const destY = screenY * TILE_SIZE;

        ctx.save();
        ctx.clearRect(destX, destY, destW, destH);
        
        // Рисуем изображение, растягивая его на 2x2 клетки
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, destW, destH);

        // Окраска (если нужна)
        if (color && color !== '#fff' && color !== '#ffffff' && color !== '#000' && color !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, destW, destH);
        }
        ctx.restore();
    }

    // === ПУБЛИЧНЫЙ ИНТЕРФЕЙС ===
    return {
        init,
        draw,
        drawBig, // <--- ДОБАВИТЬ ЭТО
        drawByKey, // Если вы добавляли её ранее
        TILE_SIZE,
        isReady: () => isReady
    };
})();

 
``` 
 
### worldCurve.js 
 
```js 
 
/**
 * МОДУЛЬ МИРОВОЙ КРИВОЙ (worldCurve.js)
 * Зависит от: name_generator.js (SeededRandom, createSeed)
 * 
 * Отвечает за прогрессивную сложность врагов, силу предметов и статы игрока.
 * Все расчеты детерминированы координатами (x, y).
 */

if (typeof SeededRandom === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед worldCurve.js");
}

const WorldCurveModule = (function() {
    'use strict';

    // Типы математических кривых
    const CURVES = {
        LINEAR: 'linear',       // Равномерный рост
        EXPONENTIAL: 'exp',     // Быстрый рост (для сложности врагов)
        LOGARITHMIC: 'log'      // Медленный рост (для защиты)
    };

    /**
     * Внутренняя функция расчета значения по кривой
     */
    function calculate(type, x, params) {
        const a = params.a || 1;
        const b = params.b || 1;
        const c = params.c || 0;

        switch (type) {
            case CURVES.LINEAR:
                return a * x + b;
            
            case CURVES.EXPONENTIAL:
                // Ограниченный экспоненциальный рост
                return a * Math.pow(1.15, x) + c; 
            
            case CURVES.LOGARITHMIC:
                // Логарифмический рост (замедляется с уровнем)
                return a * Math.log(x + 1) + b;
                
            default:
                return x;
        }
    }

    return {
        /**
         * Получить базовое HP игрока для данного уровня
         */
        getPlayerBaseHP: function(level) {
            // Линейный рост: 5 * уровень + 15. На 1 ур = 20 HP.
            return Math.floor(calculate(CURVES.LINEAR, level, { a: 5, b: 15 }));
        },

        /**
         * Получить базовую Атаку игрока
         */
        getPlayerBaseAtk: function(level) {
            // Медленный линейный рост: 0.5 * уровень + 2. На 1 ур = 2.5 (округлится до 2).
            return Math.floor(calculate(CURVES.LINEAR, level, { a: 0.5, b: 2 }));
        },

        /**
         * Получить базовую Защиту игрока
         */
        getPlayerBaseDef: function(level) {
            // Логарифмический рост, чтобы защита не становилась имбой.
            return Math.floor(calculate(CURVES.LOGARITHMIC, level, { a: 1.5, b: 0 }));
        },

        /**
         * Получить множитель сложности врагов для данной глубины/расстояния
         */
        getEnemyMultiplier: function(x, y) {
            const dist = Math.abs(x) + Math.abs(y);
            // Замедленный рост через квадратный корень.
            // На 100 клетках множитель будет всего 1.5 (вместо 7.3 раньше)
            return 1 + (Math.sqrt(dist) * 0.05); 
        },

        /**
         * Множитель силы предметов (качества) от расстояния
         */
        getItemPowerMultiplier: function(x, y) {
            const dist = Math.abs(x) + Math.abs(y);
            // Очень плавный рост: +2% характеристик за каждую клетку от центра
            return calculate(CURVES.LINEAR, dist, { a: 0.02, b: 1.0 });
        },

        /**
         * Множитель золота
         */
        getGoldMultiplier: function(x, y) {
            const dist = Math.abs(x) + Math.abs(y);
            // Умеренный рост золота
            return calculate(CURVES.LINEAR, dist, { a: 0.1, b: 1 });
        },
        /**
         * Проверка: является ли этот уровень "Хабом" (безопасной зоной)
         * Хабы появляются каждые 5 уровней глубины
         */
        isHubLevel: function(x, y) {
            const depth = Math.abs(x) + Math.abs(y);
            return depth > 0 && depth % 5 === 0;
        },

        /**
         * Генерация параметров "тренда" мира для этого уровня
         */
        getWorldTrend: function(x, y) {
            // Используем createSeed из name_generator.js для детерминизма
            const metaSeed = createSeed(x, y) + 9999; 
            const rng = new SeededRandom(metaSeed);
            const roll = rng.next();
            
            if (roll < 0.1) {
                return { name: "Кровавая Луна", enemyAtkMult: 1.5, enemyHpMult: 0.8, color: "#500" };
            } else if (roll < 0.2) {
                return { name: "Древние Сокровища", goldMult: 3.0, itemQualityMult: 1.5, color: "#fd0" };
            } else if (roll < 0.3) {
                return { name: "Магический Фон", magicFindMult: 2.0, color: "#a0f" };
            }
            
            return { name: "Обычный уровень", enemyAtkMult: 1.0, enemyHpMult: 1.0, goldMult: 1.0, color: "#fff" };
        }
    };
})();
 
``` 
 
