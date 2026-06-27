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

            // === НОВОЕ: Экспоненциальный рост золота ===
            // База: 10-25 монет. 
            // Множитель глубины: 1.5^depth. 
            // Уровень 1: x1.5, Уровень 3: x3.37, Уровень 5: x7.5, Уровень 10: x57!
            const depthBonus = Math.pow(1.5, depth); 
            
            // Увеличиваем базовый разброс, чтобы на верхних уровнях тоже было чуть больше
            const baseAmount = Math.floor(goldTemplate.val[0] + Math.random() * (goldTemplate.val[1] - goldTemplate.val[0]));
            
            // Итоговая формула: База * Экспонента * Глобальный множитель
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
    // === ПАМЯТЬ ГОРОДОВ, ВЫДАВШИХ ТЕКСТОВЫЕ КВЕСТЫ ===
    // Хранит ключи городов вида "gx_gy", чтобы не спавнить квестодателя повторно
    let textQuestCities = new Set(); 
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
        
        // === ИСПРАВЛЕНИЕ: Объявляем переменную здесь, чтобы она была видна ниже ===
        let startPos = null; 

        if (typeof GlobalMapModule !== 'undefined') {
            // Теперь мы просто присваиваем значение существующей переменной
            startPos = GlobalMapModule.initSafeStart(1, 1, 3);
            RenderModule.log(`Стартовая позиция: ${startPos.x}, ${startPos.y}`, "info");

            if (typeof QuestChainModule !== 'undefined') {
                QuestChainModule.init(startPos.x, startPos.y);
                RenderModule.log("📜 Сюжетная линия мира сгенерирована.", "info");
            }
        } else {
            RenderModule.log("Ошибка: GlobalMapModule не найден", "combat");
            return;
        }

        // === ИСПРАВЛЕНИЕ 1: Создаем игрока здесь, если он еще не создан ===
        if (!player && startPos) {
            player = EntityModule.createPlayer(startPos.x, startPos.y);
            // Обновляем UI сразу после создания, чтобы статы появились
            RenderModule.updateUI(player, { fullName: "Глобальная карта", themeName: "Поверхность" }, null);
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
        // 0. БЛОКИРОВКА ПРИ СМЕРТИ (Глобальная проверка)
        if (player && player.hp <= 0) {
             // Можно добавить повторный лог, если игрок жмет кнопки после смерти
             return; 
        }    
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

    // === ОБРАБОТКА КЛИКА ПО КАРТЕ (ОСМОТР И ВЗАИМОДЕЙСТВИЕ) ===
    function handleMapClick(clientX, clientY) {
        // 1. Если открыт магазин, обрабатываем клик по товарам
        if (isShopOpen) {
            handleShopClick(clientX, clientY);
            return;
        }

        if (!player || gameMode !== 'dungeon') return;

        const canvas = document.querySelector("#map-container canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // Используем размеры сетки из RenderModule для точного попадания
        const cellW = canvas.width / RenderModule.COLS;
        const cellH = canvas.height / RenderModule.ROWS;

        const sx = Math.floor(clickX / cellW);
        const sy = Math.floor(clickY / cellH);

        const cam = RenderModule.getCameraOffset(player);
        const wx = sx + cam.x;
        const wy = sy + cam.y;

        // 2. Враги
        const enemy = enemies.find(en => en.hp > 0 && en.x === wx && en.y === wy);
        if (enemy) {
            const weapon = player.equipment.weapon;
            
            // Логика дистанционной атаки
            if (weapon && !weapon.meleeType) {
                const killed = CombatModule.rangedAttack(player, enemy, weapon, RenderModule.log, RenderModule.updateUI);
                
                if (killed) {
                    // ВАЖНО: Не фильтруем массив вручную! checkDeath() сделает это сам,
                    // предварительно выдав лут, опыт и проверив квесты.
                    checkDeath(); 
                }
                
                moveNpcs();
                moveEnemies();
                renderFrame();
            } 
            // Логика осмотра (если оружие ближнего боя или его нет)
            else {
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`⚔️ ${enemy.name}`, `HP: ${enemy.hp}/${enemy.maxHp}\nATK: ${enemy.atk} | DEF: ${enemy.def}`, "enemy");
                }
                RenderModule.log(`Осмотр: ${enemy.name} [HP:${enemy.hp} ATK:${enemy.atk}]`, "info");
            }
            return;
        }

        // 3. NPC (Диалог или Квест)
        const npc = window.currentCityNpcs ? window.currentCityNpcs.find(n => n.x === wx && n.y === wy) : null;
        if (npc) {
            if (npc.isQuestGiver) {
                tryGiveQuest(npc);
            } else {
                if (typeof RenderModule.updateInspector === 'function') {
                    RenderModule.updateInspector(`☺ ${npc.name}`, `"${npc.dialog}"`, "npc");
                }
                RenderModule.log(`${npc.name}: "${npc.dialog}"`, "info");
            }
            return;
        }

        // 4. Предметы
        const item = items.find(i => i.x === wx && i.y === wy);
        if (item) {
             let details = " ";
             if (item.stat) details += `Характеристика: ${item.stat.toUpperCase()} +${item.val}\n`;
             if (item.effect) details += `Эффект: ${item.effect} (${item.val})`;
             
             if (typeof RenderModule.updateInspector === 'function') {
                RenderModule.updateInspector(`🎒 ${item.name}`, details, "loot");
             }
            RenderModule.log(`Предмет: ${item.name}`, "loot");
            return;
        }

        if (typeof RenderModule.updateInspector === 'function') {
            RenderModule.updateInspector("Пусто", "Здесь ничего нет...", "neutral");
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

            // ... внутри processTurn ...

            // Подбор предметов
            const itemIdx = items.findIndex(i => i.x === nx && i.y === ny);
            if (itemIdx !== -1) {
                const item = items[itemIdx];
            
                if (item.type === 'gold') {
                    player.gold += item.val;
                     RenderModule.log(`Подобрано: ${item.name}`, "loot ");
                } 
                else if (item.type === 'book') {
                    // === ИЗМЕНЕНИЕ: Добавляем книгу в инвентарь ===
                    player.inventory.push(item);
                    
                    if (typeof LoreModule !== 'undefined') {
                        const fragment = LoreModule.getNextFragment();
                        RenderModule.log(`📖 Вы подобрали "${item.name}". Внутри написано:`, "info ");
                        RenderModule.log(fragment, "event ");
                        
                        if (typeof QuestSystemModule !== 'undefined') {
                            activeQuests.forEach(q => {
                                QuestSystemModule.checkProgress(q, { type: 'read_book' });
                            });
                        }
                    } else {
                         RenderModule.log(`Вы подобрали "${item.name}".`, "info ");
                    }
                }  
                else {
                    player.inventory.push(item);
                    RenderModule.log(`Подобрано: ${item.name}`, "loot ");
                    
                    // Проверка квестов на подбор (FETCH/COLLECT)
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
                                         RenderModule.log(`📦 Это тот самый предмет!`, "info ");
                                    } else if (q.type === 'COLLECT') {
                                        QuestSystemModule.checkProgress(q, { 
                                             type: 'pickup', 
                                            itemType: item.type,
                                            itemName: item.name,
                                             uniqueId: item.uniqueId,
                                            locX: dungeonX,
                                            locY: dungeonY
                                        });
                                         RenderModule.log(`📦 Подобрано для квеста: ${item.name} (${q.progress}/${q.maxProgress})`, "info ");
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
            busy = true; // Блокируем дальнейшие действия
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

        // 2. Создаем Iframe с уникальным параметром времени
        const iframe = document.createElement('iframe');
        
        // === ИСПРАВЛЕНИЕ: Добавляем ?t=... чтобы сбросить кэш ===
        const timestamp = new Date().getTime();
        const separator = url.includes('?') ? '&' : '?';
        iframe.src = `${url}${separator}t=${timestamp}`;
        
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
    
        // 1. Обработка золота (безопасная проверка)
        if (data && data.gold !== undefined) {
            const amount = parseInt(data.gold);
            if (amount !== 0) { // Логируем только если есть изменение
                player.gold += amount;
                RenderModule.log(amount > 0 ? `💰 Получено золото: ${amount}` : `💸 Потеряно золото: ${Math.abs(amount)}`, "loot");
            }
        }
    
        // 2. Обработка уникальных предметов (по ID из data.js)
        if (data && data.itemId) {
            const template = DataModule.UNIQUE_ITEM_TEMPLATES.find(t => t.id === data.itemId);
            
            if (template) {
                // Находим базовый тип предмета, чтобы взять правильный символ
                const baseTemplate = DataModule.ITEM_TYPES.find(t => t.type === template.baseType);
                const char = template.char || (baseTemplate ? baseTemplate.char : '?');
                
                // Вычисляем среднее значение стата для отображения
                const statVal = template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 
                                (template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0);

                const newItem = {
                    x: 0, y: 0,
                    name: `${template.uniquePrefix} ${template.baseName}`,
                    char: char,
                    color: template.color || '#FFD700',
                    type: template.baseType,
                    val: statVal,
                    isItem: true,
                    isQuestItem: false, // Это награда, а не цель квеста
                    isUnique: true,     // Флаг уникальности
                    uniqueAtk: template.atk ? Math.floor((template.atk[0] + template.atk[1]) / 2) : 0,
                    uniqueDef: template.def ? Math.floor((template.def[0] + template.def[1]) / 2) : 0,
                    desc: template.desc || ""
                };
                
                player.inventory.push(newItem);
                RenderModule.log(`🎁 Получен уникальный предмет: ${newItem.name}`, "loot");
            } else {
                RenderModule.log(`⚠️ Ошибка: предмет с ID "${data.itemId}" не найден в базе.`, "combat");
            }
        }

        // 3. Обновление интерфейса
        RenderModule.updateUI(player, currentLocData, currentWorldTrend);
    }

    // === ПРОВЕРКА: БЫЛ ЛИ КВЕСТ УЖЕ ПРОЙДЕН? ===
    function isTextQuestCompleted(filename) {
        // Используем .has() для Set вместо .includes() для Array
        return completedTextQuests.has(filename);
    }
    // === УПРАВЛЕНИЕ ПАМЯТЬЮ ГОРОДОВ ===
    function markCityTextQuestTaken(gx, gy) {
        textQuestCities.add(`${gx}_${gy}`);
        console.log(`🏙️ Город (${gx}, ${gy}) больше не выдает текстовые квесты.`);
    }

    function hasCityTakenTextQuest(gx, gy) {
        return textQuestCities.has(`${gx}_${gy}`);
    }
    
    return {
        init,
        getPlayer,
        getActiveQuests,
        getCompletedQuestIds,
        abandonCurrentQuest,
        openTwineQuest, 
        isTextQuestCompleted,
        markCityTextQuestTaken,      // <--- ДОБАВИТЬ
        hasCityTakenTextQuest,       // <--- ДОБАВИТЬ        
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
    <script src="story_script.js"></script> 
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
        justify-content: center; /* <--- ДОБАВИТЬ: Это выровняет содержимое по центру */
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
        window.currentInnCoords = []; // <--- ДОБАВИТЬ ЭТУ СТРОКУ

        
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

        // === ЛОГИКА ОСОБОГО ПЕРСОНАЖА (ОБНОВЛЕННАЯ С ЗАЩИТОЙ ОТ АБЬЮЗА) ===
        
        // 0. ПРОВЕРКА: Выдавал ли этот город уже текстовый квест?
        let cityAlreadyGaveQuest = false;
        if (typeof GameModule !== 'undefined' && typeof GameModule.hasCityTakenTextQuest === 'function') {
            cityAlreadyGaveQuest = GameModule.hasCityTakenTextQuest(gx, gy);
        }

        // Шанс 80% появления Барда-легенды в городе (ТОЛЬКО если город еще не выдавал квест)
        if (!cityAlreadyGaveQuest && npcs.length > 5 && rng.next() < 0.8) {
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
                let availableQuests = TEXT_QUESTS_ROSTER;

                // 2. Фильтруем список, убирая глобально пройденные квесты
                if (typeof GameModule !== 'undefined' && typeof GameModule.isTextQuestCompleted === 'function') {
                    const filtered = TEXT_QUESTS_ROSTER.filter(q => !GameModule.isTextQuestCompleted(q));
                    // Если есть непройденные, используем их, иначе оставляем полный список (для повтора)
                    if (filtered.length > 0) {
                        availableQuests = filtered;
                    }
                }

                const randomQuestFile = rng.choice(availableQuests);

                // 3. ФИКСИРУЕМ ГОРОД КАК "ИСПОЛЬЗОВАННЫЙ" ДЛЯ ТЕКСТОВЫХ КВЕСТОВ
                if (typeof GameModule !== 'undefined' && GameModule.markCityTextQuestTaken) {
                    GameModule.markCityTextQuestTaken(gx, gy);
                }

                npcs.push({
                    x: specialX,
                    y: specialY,
                    name: "Странный Странник",
                    char: "☺",
                    color: "#ff00ff", // Ярко-розовый цвет для отличия
                    dialog: "Псс! Эй, ты! У меня есть для тебя одна история...",
                    isNPC: true,
                    isSpecial: true,
                    direction: directions[rng.int(0, 3)],
                    
                    // === ДЕЙСТВИЕ ПРИ ВЗАИМОДЕЙСТВИИ ===
                    action: function() { 
                        // Запускаем квест
                        GameModule.openTwineQuest(randomQuestFile);
                        
                        // Удаляем действие у ЭТОГО NPC, чтобы он стал обычным жителем до перезахода в город
                        this.action = null; 
                        
                        // Меняем диалог
                        this.dialog = "Я уже рассказал тебе всё, что знал. Иди с миром.";
                    }
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
 
### Quack of Duckness.html 
 
```html 
 
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta content="width=device-width, initial-scale=1" name="viewport">
<title>История без названия</title>
<style title="Twine CSS">@keyframes appear{0%{opacity:0}to{opacity:1}}@keyframes fade-in-out{0%,to{opacity:0}50%{opacity:1}}@keyframes rumble{25%{top:-0.1em}75%{top:.1em}0%,to{top:0px}}@keyframes shudder{25%{left:.1em}75%{left:-0.1em}0%,to{left:0px}}@keyframes buoy{25%{top:.25em}75%{top:-0.25em}0%,to{top:0px}}@keyframes sway{25%{left:.25em}75%{left:-0.25em}0%,to{left:0px}}@keyframes pulse{0%{transform:scale(0, 0)}20%{transform:scale(1.2, 1.2)}40%{transform:scale(0.9, 0.9)}60%{transform:scale(1.05, 1.05)}80%{transform:scale(0.925, 0.925)}to{transform:scale(1, 1)}}@keyframes zoom-in{0%{transform:scale(0, 0)}to{transform:scale(1, 1)}}@keyframes shudder-in{0%,to{transform:translateX(0em)}5%,25%,45%{transform:translateX(-1em)}15%,35%,55%{transform:translateX(1em)}65%{transform:translateX(-0.6em)}75%{transform:translateX(0.6em)}85%{transform:translateX(-0.2em)}95%{transform:translateX(0.2em)}}@keyframes rumble-in{0%,to{transform:translateY(0em)}5%,25%,45%{transform:translateY(-1em)}15%,35%,55%{transform:translateY(1em)}65%{transform:translateY(-0.6em)}75%{transform:translateY(0.6em)}85%{transform:translateY(-0.2em)}95%{transform:translateY(0.2em)}}@keyframes fidget{0%,8.1%,82.1%,31.1%,38.1%,44.1%,40.1%,47.1%,74.1%,16.1%,27.1%,72.1%,24.1%,95.1%,6.1%,36.1%,20.1%,4.1%,91.1%,14.1%,87.1%,to{left:0px;top:0px}8%,82%,31%,38%,44%{left:-1px}40%,47%,74%,16%,27%{left:1px}72%,24%,95%,6%,36%{top:-1px}20%,4%,91%,14%,87%{top:1px}}@keyframes slide-right{0%{transform:translateX(-100vw)}}@keyframes slide-left{0%{transform:translateX(100vw)}}@keyframes slide-up{0%{transform:translateY(100vh)}}@keyframes slide-down{0%{transform:translateY(-100vh)}}@keyframes fade-right{0%{opacity:0;transform:translateX(-1em)}to{opacity:1}}@keyframes fade-left{0%{opacity:0;transform:translateX(1em)}to{opacity:1}}@keyframes fade-up{0%{opacity:0;transform:translateY(1em)}to{opacity:1}}@keyframes fade-down{0%{opacity:0;transform:translateY(-1em)}to{opacity:1}}@keyframes flicker{0%,29%,31%,63%,65%,77%,79%,86%,88%,91%,93%{opacity:0}30%{opacity:.2}64%{opacity:.4}78%{opacity:.6}87%{opacity:.8}92%,to{opacity:1}}@keyframes blur{0%{filter:blur(2rem);opacity:0}25%{opacity:1}to{filter:blur(0rem);opacity:1}}.dom-debug-mode tw-story,.dom-debug-mode tw-passage,.dom-debug-mode tw-sidebar,.dom-debug-mode tw-include,.dom-debug-mode tw-hook,.dom-debug-mode tw-expression,.dom-debug-mode tw-link,.dom-debug-mode tw-dialog,.dom-debug-mode tw-columns,.dom-debug-mode tw-column,.dom-debug-mode tw-align{outline:1px solid #f5a3da;min-height:32px;display:block !important}.dom-debug-mode tw-story::before,.dom-debug-mode tw-passage::before,.dom-debug-mode tw-sidebar::before,.dom-debug-mode tw-include::before,.dom-debug-mode tw-hook::before,.dom-debug-mode tw-expression::before,.dom-debug-mode tw-link::before,.dom-debug-mode tw-dialog::before,.dom-debug-mode tw-columns::before,.dom-debug-mode tw-column::before,.dom-debug-mode tw-align::before{position:absolute;top:0;left:0;height:16px;background-color:#f5a3da;color:#000;font-size:16px;font-weight:normal;font-style:normal;font-family:monospace;display:inline-block;line-height:100%;white-space:pre;z-index:999997}.dom-debug-mode tw-story:hover,.dom-debug-mode tw-passage:hover,.dom-debug-mode tw-sidebar:hover,.dom-debug-mode tw-include:hover,.dom-debug-mode tw-hook:hover,.dom-debug-mode tw-expression:hover,.dom-debug-mode tw-link:hover,.dom-debug-mode tw-dialog:hover,.dom-debug-mode tw-columns:hover,.dom-debug-mode tw-column:hover,.dom-debug-mode tw-align:hover{outline:1px solid #fc9}.dom-debug-mode tw-story:hover::before,.dom-debug-mode tw-passage:hover::before,.dom-debug-mode tw-sidebar:hover::before,.dom-debug-mode tw-include:hover::before,.dom-debug-mode tw-hook:hover::before,.dom-debug-mode tw-expression:hover::before,.dom-debug-mode tw-link:hover::before,.dom-debug-mode tw-dialog:hover::before,.dom-debug-mode tw-columns:hover::before,.dom-debug-mode tw-column:hover::before,.dom-debug-mode tw-align:hover::before{background-color:#fc9;transition:background-color 1s}.dom-debug-mode tw-passage,.dom-debug-mode tw-include,.dom-debug-mode tw-hook,.dom-debug-mode tw-expression,.dom-debug-mode tw-link,.dom-debug-mode tw-dialog,.dom-debug-mode tw-columns,.dom-debug-mode tw-column,.dom-debug-mode tw-align{padding:1em;margin:0}.dom-debug-mode tw-story::before{content:'<tw-story tags="' attr(tags) '">'}.dom-debug-mode tw-passage::before{top:-16px;content:'<tw-passage tags="' attr(tags) '">'}.dom-debug-mode tw-sidebar::before{top:-16px;content:"<tw-sidebar>"}.dom-debug-mode tw-hook::before{content:'<tw-hook name="' attr(name) '">'}.dom-debug-mode tw-expression::before{content:'<tw-expression name="' attr(name) '">'}.dom-debug-mode tw-link::before{content:'<tw-link name="' attr(name) '">'}.dom-debug-mode tw-dialog::before{content:"<tw-dialog>"}.dom-debug-mode tw-columns::before{content:"<tw-columns>"}.dom-debug-mode tw-column::before{content:"<tw-column>"}.dom-debug-mode tw-align::before{content:"<tw-align>"}.dom-debug-mode tw-include::before{content:'<tw-include type="' attr(type) '" name="' attr(name) '">'}tw-open-button[goto]{display:none}.debug-mode tw-open-button[replay],.debug-mode tw-open-button[goto]{display:inline}.debug-mode tw-expression{display:inline-block !important}.debug-mode tw-expression[type=variable]::after{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"$" attr(name)}.debug-mode tw-expression[type=tempVariable]::after{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"_" attr(name)}.debug-mode tw-expression[return=boolean]{background-color:rgba(179,179,179,.2)}.debug-mode tw-expression[return=array]{background-color:rgba(255,102,102,.2)}.debug-mode tw-expression[return=dataset]{background-color:rgba(255,128,0,.2)}.debug-mode tw-expression[return=number]{background-color:rgba(255,179,102,.2)}.debug-mode tw-expression[return=datamap]{background-color:rgba(255,255,102,.2)}.debug-mode tw-expression[return=changer]{background-color:rgba(179,255,102,.2)}.debug-mode tw-expression[return=lambda]{background-color:rgba(102,255,102,.2)}.debug-mode tw-expression[return=hookname]{background-color:rgba(102,255,204,.2)}.debug-mode tw-expression[return=string]{background-color:rgba(102,255,255,.2)}.debug-mode tw-expression[return=datatype]{background-color:rgba(102,153,255,.2)}.debug-mode tw-expression[return=gradient],.debug-mode tw-expression[return=colour]{background-color:rgba(204,102,255,.2)}.debug-mode tw-expression[return=instant],.debug-mode tw-expression[return=macro]{background-color:rgba(240,117,199,.2)}.debug-mode tw-expression[return=command]{background-color:rgba(153,153,255,.2)}.debug-mode tw-expression.false{background-color:rgba(255,0,0,.2) !important}.debug-mode tw-expression[type=macro]::before{content:"(" attr(name) ":)";padding:0 .5rem;font-size:1rem;vertical-align:middle;line-height:normal;background-color:inherit;border:1px solid rgba(255,255,255,.5)}.debug-mode tw-expression[title]:not([title=""]){cursor:help}.debug-mode tw-hook{background-color:rgba(0,85,255,.1) !important}.debug-mode tw-hook::before{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"["}.debug-mode tw-hook::after{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"]"}.debug-mode tw-hook[name]::after{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"]<" attr(name) "|"}.debug-mode tw-pseudo-hook{background-color:rgba(255,170,0,.1) !important}.debug-mode tw-collapsed::before{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"{"}.debug-mode tw-collapsed::after{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"}"}.debug-mode tw-verbatim::before,.debug-mode tw-verbatim::after{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:"`"}.debug-mode tw-align[style*="text-align: center"]{background:linear-gradient(to right, hsla(14, 100%, 87%, 0) 0%, hsla(14, 100%, 87%, 0.25) 50%, hsla(14, 100%, 87%, 0) 100%)}.debug-mode tw-align[style*="text-align: left"]{background:linear-gradient(to right, hsla(14, 100%, 87%, 0.25) 0%, hsla(14, 100%, 87%, 0) 100%)}.debug-mode tw-align[style*="text-align: right"]{background:linear-gradient(to right, hsla(14, 100%, 87%, 0) 0%, hsla(14, 100%, 87%, 0.25) 100%)}.debug-mode tw-column{background-color:rgba(189,228,255,.2)}.debug-mode tw-enchantment{animation:enchantment .5s infinite;border:1px solid}.debug-mode tw-link::after,.debug-mode tw-broken-link::after{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:attr(passage-name)}.debug-mode tw-include{background-color:rgba(204,128,51,.1)}.debug-mode tw-include::before{font-size:.8rem;padding-left:.2rem;padding-right:.2rem;vertical-align:top;content:attr(type) ' "' attr(name) '"'}.debug-dialogs tw-backdrop:not(.eval-replay):not(.harlowe-crash){pointer-events:none;opacity:.1}tw-eval-replay tw-eval-code,tw-eval-replay tw-eval-explanation{max-height:20vh;overflow:auto;margin:10px auto}tw-eval-replay tw-eval-code{display:block;font-family:monospace;padding-bottom:1ex;border-bottom:2px solid gray}tw-eval-replay tw-eval-explanation{display:block;text-align:center}tw-eval-replay tw-eval-explanation>code{white-space:pre-wrap}tw-eval-replay tw-eval-explanation>code.from-block{width:40%;display:inline-block;text-align:left;max-height:4em;overflow-wrap:anywhere;overflow-y:scroll}tw-eval-replay tw-eval-explanation>code.from-block~.to-desc{width:calc(40% - 2em);margin-left:2em;display:inline-block}tw-eval-replay tw-eval-explanation>code.from-block+span::after{content:"..."}tw-eval-replay tw-eval-explanation>code.from-inline{text-align:right}tw-eval-replay tw-eval-explanation>:nth-child(2){white-space:pre}tw-eval-replay tw-eval-explanation>.to-desc{text-align:left}tw-eval-replay tw-eval-explanation>table{width:100%;margin-top:1em}tw-eval-replay tw-eval-explanation>table td{white-space:pre-wrap !important;word-wrap:anywhere}tw-eval-replay tw-eval-reason{text-align:center;font-size:80%;font-style:italic;display:block}tw-eval-replay tw-eval-it{text-align:center;font-size:80%;display:block}tw-eval-replay tw-dialog-links{display:-ms-flexbox;display:flex;-ms-flex-pack:distribute;justify-content:space-around}@keyframes enchantment{0%,to{border-color:#ffb366}50%{border-color:#6fc}}tw-debugger{position:fixed;box-sizing:border-box;bottom:0;right:0;z-index:999999;min-width:14em;min-height:1em;padding:0em .5em .5em 1em;font-size:1.25em;font-family:sans-serif;color:#262626;background-color:#fff;border-left:solid #262626 2px;border-top:solid #262626 2px;border-top-left-radius:.5em;opacity:1}tw-debugger.fade-panel:not(:hover){opacity:.33}tw-debugger.theme-dark{color:#d9d9d9;background-color:#000}tw-debugger.theme-dark{border-color:#d9d9d9 rgba(0,0,0,0) rgba(0,0,0,0) #d9d9d9}tw-debugger select{margin-right:1em;width:12em}tw-debugger button,tw-debugger tw-link{border-radius:3px;border:solid #999 1px;margin:auto 4px;color:#262626;background-color:#fff;cursor:pointer}tw-debugger button.enabled,tw-debugger tw-link.enabled{color:#000;background-color:#d9d9d9;box-shadow:inset #999 3px 5px .5em}tw-debugger.theme-dark button,tw-debugger.theme-dark tw-link{color:#d9d9d9;background-color:#000;border-color:#666}tw-debugger.theme-dark button.enabled,tw-debugger.theme-dark tw-link.enabled{color:#e6e6e6;background-color:#424242;box-shadow:inset #666 3px 5px .5em}tw-debugger button{font-size:1em;overflow-x:hidden;text-overflow:ellipsis;white-space:pre}tw-debugger tw-link{font-size:1.25em;border-radius:16px;border-style:solid;border-width:2px;text-align:center;padding:0px 8px;display:block}tw-debugger tw-link:hover{border-color:#262626;color:#262626}tw-debugger.theme-dark tw-link:hover{border-color:#d9d9d9;color:#d9d9d9}tw-debugger tw-dialog{background-color:#fff;color:#000;font-size:1.25em}tw-debugger.theme-dark tw-dialog{background-color:#000;color:#e6e6e6}tw-debugger .panel{display:-ms-flexbox;display:flex;-ms-flex-direction:column;flex-direction:column;position:absolute;bottom:100%;left:-2px;right:0;padding:1em;overflow-y:scroll;overflow-x:hidden;border:inherit;box-sizing:content-box;background-color:#fff;border-bottom:solid #999 2px;border-top-left-radius:.5em;border-bottom-left-radius:.5em;font-size:.8em}tw-debugger .panel:empty,tw-debugger .panel[hidden]{display:none}tw-debugger.theme-dark .panel{background-color:#000;border-bottom-color:#666}tw-debugger .panel-source .panel-row-buttons{width:2rem}tw-debugger .panel-source .source-tags{width:20%;font-style:italic}tw-debugger .panel-row-source td{font-family:monospace;font-size:1rem;white-space:pre-wrap;overflow-wrap:anywhere;max-height:8rem;padding:1rem}tw-debugger .panel-rows{width:100%;overflow-x:scroll}tw-debugger .panel-rows>*{display:table-row}tw-debugger .panel-rows>div:nth-of-type(2n){background-color:#e6e6e6}tw-debugger .panel-tools .panel-rows>*,tw-debugger .panel-options .panel-rows>*{margin-top:.4rem;display:block}tw-debugger.theme-dark .panel-rows>div:nth-of-type(2n){background-color:#212121}tw-debugger .panel-row-buttons{text-align:right}tw-debugger .panel-variables .panel-rows:empty::before{content:"~ No variables ~";font-style:italic;color:#575757;text-align:center}tw-debugger .panel-enchantments .panel-rows:empty::before{content:"~ No enchantments ~";font-style:italic;color:#575757;text-align:center}tw-debugger .panel-errors .panel-rows:empty::before{content:"~ No errors... for now. ~";font-style:italic;color:#575757;text-align:center}tw-debugger .panel-errors .panel-rows:empty+.panel-errors-bottom{display:none}tw-debugger.theme-dark .panel-variables .panel-rows:empty::before,tw-debugger.theme-dark .panel-enchantments .panel-rows:empty::before,tw-debugger.theme-dark .panel-errors .panel-rows:empty::before{color:#a8a8a8}tw-debugger .panel-rows:empty+.panel-variables-bottom{display:none}tw-debugger th[data-col]{text-decoration:underline;cursor:pointer}tw-debugger th[data-col][data-order=asc]::after{content:"↓"}tw-debugger th[data-col][data-order=desc]::after{content:"↑"}tw-debugger .panel-storylets:not(.panel-exclusive) .storylet-exclusive,tw-debugger .panel-storylets:not(.panel-urgent) .storylet-urgent{display:none}tw-debugger .storylet-exclusive,tw-debugger .storylet-urgent,tw-debugger .storylet-open{text-align:center}tw-debugger .panel-variables-bottom{padding-top:5px}tw-debugger .enchantment-row{min-height:1.5em}tw-debugger .variable-path{opacity:.4}tw-debugger .temporary-variable-scope,tw-debugger .enchantment-local{font-family:sans-serif;font-weight:normal;opacity:.8;font-size:.75em}tw-debugger .temporary-variable-scope:not(:empty)::before,tw-debugger .enchantment-local:not(:empty)::before{content:" in "}tw-debugger .variable-name,tw-debugger .enchantment-name{font-family:monospace;font-weight:bold}tw-debugger .variable-type{color:#575757;font-weight:normal;text-overflow:ellipsis;overflow:hidden;max-width:10em}tw-debugger.theme-dark .variable-type{color:#a8a8a8}tw-debugger .error-row{display:table-row;background-color:rgba(230,101,204,.3)}tw-debugger .error-row:nth-of-type(2n){background-color:rgba(237,145,219,.3)}tw-debugger .error-row>*{display:table-cell;padding:.25em .5em}tw-debugger .error-row .error-message[title]:not([title=""]){cursor:help}tw-debugger .error-row .error-passage{color:#575757}tw-debugger.theme-dark .error-row .error-passage{color:#a8a8a8}tw-debugger .storylet-row{background-color:rgba(193,240,225,.3)}tw-debugger .storylet-row:nth-child(2n){background-color:rgba(152,231,204,.3)}tw-debugger .storylet-row.storylet-closed{font-style:italic;background-color:#fff}tw-debugger .storylet-row.storylet-closed:nth-child(2n){background-color:#e6e6e6}tw-debugger .storylet-row.storylet-closed>:not(.storylet-lambda){opacity:.6}.storylet-error tw-debugger .storylet-row{background-color:rgba(230,101,204,.3)}.storylet-error tw-debugger .storylet-row:nth-child(2n){background-color:rgba(237,145,219,.3)}tw-debugger .storylet-row .storylet-name,tw-debugger .storylet-row .storylet-value{display:inline-block;width:50%}tw-debugger .storylet-row .storylet-lambda{font-family:monospace;font-size:1rem;white-space:pre-wrap;overflow-wrap:anywhere}tw-debugger.theme-dark .storylet-row.storylet-closed{background-color:#000}tw-debugger.theme-dark .storylet-row.storylet-closed:nth-child(2n){background-color:#212121}tw-debugger .tabs{padding-bottom:.5em}tw-debugger .tab{border-radius:0px 0px .5em .5em;border-top:none;top:-2px}tw-debugger .resizer-h{position:absolute;height:14em;border-left:2px solid #999;border-right:2px solid #999;top:10px;left:4px;width:8px;cursor:ew-resize}tw-debugger.theme-dark .resizer-h{border-color:rgba(0,0,0,0) #666}tw-debugger .resizer-v{position:absolute;height:8px;border-top:2px solid #999;border-bottom:2px solid #999;margin-bottom:4px;top:4px;left:10px;width:95%;cursor:ns-resize;box-sizing:border-box}tw-debugger.theme-dark .resizer-v{border-color:#666 rgba(0,0,0,0)}tw-debugger mark{color:inherit;background-color:rgba(101,230,230,.3) !important}tw-dialog{z-index:999997;border:#fff solid 2px;padding:2em;color:#fff;background-color:#000;display:block}@media(min-width: 576px){tw-dialog{max-width:50vw}}tw-dialog input[type=text]{font-size:inherit;width:100%;border:solid #fff !important}tw-dialog-links{text-align:right;display:-ms-flexbox;display:flex;-ms-flex-pack:end;justify-content:flex-end}tw-backdrop{z-index:999996;position:fixed;top:0;left:0;right:0;bottom:0;background-color:rgba(0,0,0,.8);display:-ms-flexbox;display:flex;-ms-flex-align:center;align-items:center;-ms-flex-pack:center;justify-content:center}tw-backdrop~tw-backdrop{display:none}tw-link,.enchantment-link{cursor:pointer;color:#4169e1;font-weight:bold;text-decoration:none;transition:color .2s ease-in-out}tw-passage [style^=color] tw-link:not(:hover),tw-passage [style*=" color"] tw-link:not(:hover),tw-passage [style^=color][hover=true] tw-link:hover,tw-passage [style*=" color"][hover=true] tw-link:hover,tw-passage [style^=color] .enchantment-link:not(:hover),tw-passage [style*=" color"] .enchantment-link:not(:hover),tw-passage [style^=color][hover=true] .enchantment-link:hover,tw-passage [style*=" color"][hover=true] .enchantment-link:hover{color:inherit}tw-link:hover,.enchantment-link:hover{color:#00bfff}tw-link:active,.enchantment-link:active{color:#dd4b39}.visited{color:#6941e1}tw-passage [style^=color] .visited:not(:hover),tw-passage [style*=" color"] .visited:not(:hover),tw-passage [style^=color][hover=true] .visited:hover,tw-passage [style*=" color"][hover=true] .visited:hover{color:inherit}.visited:hover{color:#e3e}tw-broken-link{color:#933;border-bottom:2px solid #933;cursor:not-allowed}tw-passage [style^=color] tw-broken-link:not(:hover),tw-passage [style*=" color"] tw-broken-link:not(:hover),tw-passage [style^=color][hover=true] tw-broken-link:hover,tw-passage [style*=" color"][hover=true] tw-broken-link:hover{color:inherit}tw-link.enchantment-mouseover,.link.enchantment-mouseover,tw-expression.enchantment-mouseover>tw-link{color:inherit;font-weight:inherit;transition:none;cursor:inherit;border-bottom:2px dashed #999}tw-link.enchantment-mouseover:hover,tw-link.enchantment-mouseover:active,.link.enchantment-mouseover:hover,.link.enchantment-mouseover:active,tw-expression.enchantment-mouseover>tw-link:hover,tw-expression.enchantment-mouseover>tw-link:active{color:inherit}tw-link.enchantment-mouseover.enchantment-button,.link.enchantment-mouseover.enchantment-button,tw-expression.enchantment-mouseover>tw-link.enchantment-button{border-style:dashed}tw-link.enchantment-mouseout,.link.enchantment-mouseout,tw-expression.enchantment-mouseout>tw-link{color:inherit;font-weight:inherit;transition:none;cursor:inherit;border:rgba(64,149,191,.6) 1px solid;border-radius:.2em}tw-link.enchantment-mouseout:hover,tw-link.enchantment-mouseout:active,.link.enchantment-mouseout:hover,.link.enchantment-mouseout:active,tw-expression.enchantment-mouseout>tw-link:hover,tw-expression.enchantment-mouseout>tw-link:active{color:inherit}tw-link.enchantment-mouseout:hover,.link.enchantment-mouseout:hover,tw-expression.enchantment-mouseout>tw-link:hover{background-color:rgba(175,197,207,.75);border:rgba(0,0,0,0) 1px solid}tw-link.enchantment-dblclick,.link.enchantment-dblclick,tw-expression.enchantment-dblclick>tw-link{color:inherit;font-weight:inherit;transition:none;cursor:inherit;cursor:pointer;border:2px solid #999;border-radius:0}tw-link.enchantment-dblclick:hover,tw-link.enchantment-dblclick:active,.link.enchantment-dblclick:hover,.link.enchantment-dblclick:active,tw-expression.enchantment-dblclick>tw-link:hover,tw-expression.enchantment-dblclick>tw-link:active{color:inherit}tw-link.enchantment-dblclick:active,.link.enchantment-dblclick:active,tw-expression.enchantment-dblclick>tw-link:active{background-color:#999}tw-link.enchantment-button,.link.enchantment-button,.enchantment-button:not(.link) tw-link,.enchantment-button:not(.link) .link{border-radius:16px;border-style:solid;border-width:2px;text-align:center;padding:0px 8px;display:block}.enchantment-button{display:block}.enchantment-clickblock{cursor:pointer;width:100%;height:100%;display:block}.enchantment-clickblock>:not(tw-enchantment)::after{content:"";width:100%;height:100%;top:0;left:0;display:block;box-sizing:border-box;position:absolute;pointer-events:none;color:rgba(65,105,225,.5);transition:color .2s ease-in-out}.enchantment-clickblock>:not(tw-enchantment):hover::after{color:rgba(0,191,255,.5)}.enchantment-clickblock>:not(tw-enchantment):active::after{color:rgba(222,78,59,.5)}.enchantment-clickblock>:not(tw-enchantment)::after{box-shadow:inset 0 0 0 .5vmax}.enchantment-clickblock>tw-passage::after,.enchantment-clickblock>tw-sidebar::after{box-shadow:0 0 0 .5vmax}.enchantment-mouseoverblock>:not(tw-enchantment)::after{content:"";width:100%;height:100%;top:0;left:0;display:block;box-sizing:border-box;position:absolute;pointer-events:none;border:2px dashed #999}.enchantment-mouseoutblock>:not(tw-enchantment)::after{content:"";width:100%;height:100%;top:0;left:0;display:block;box-sizing:border-box;position:absolute;pointer-events:none;border:rgba(64,149,191,.6) 2px solid}.enchantment-mouseoutblock:hover>:not(tw-enchantment)::after{content:"";width:100%;height:100%;top:0;left:0;display:block;box-sizing:border-box;position:absolute;pointer-events:none;background-color:rgba(175,197,207,.75);border:rgba(0,0,0,0) 2px solid;border-radius:.2em}.enchantment-dblclickblock>:not(tw-enchantment)::after{content:"";width:100%;height:100%;top:0;left:0;display:block;box-sizing:border-box;position:absolute;pointer-events:none;cursor:pointer;border:2px solid #999}tw-dialog-links{padding-top:1.5em}tw-dialog-links tw-link{border-radius:16px;border-style:solid;border-width:2px;text-align:center;padding:0px 8px;display:block;display:inline-block}html{margin:0;height:100%;overflow-x:hidden}*,:before,:after{position:relative;box-sizing:inherit}body{margin:0;height:100%}tw-storydata{display:none}tw-story{display:-ms-flexbox;display:flex;-ms-flex-direction:column;flex-direction:column;font:100% Georgia,serif;box-sizing:border-box;width:100%;min-height:100%;font-size:1.5em;line-height:1.5em;padding:5% 5%;overflow:hidden;background-color:#000;color:#fff}tw-story [style*=content-box] *{box-sizing:border-box}@media(min-width: 576px){tw-story{padding:5% 20%}}tw-story tw-consecutive-br{display:block;height:1.6ex;visibility:hidden}tw-story select{background-color:rgba(0,0,0,0);font:inherit;border-style:solid;padding:2px}tw-story select:not([disabled]){color:inherit}tw-story textarea{resize:none;background-color:rgba(0,0,0,0);font:inherit;color:inherit;border-style:none;padding:2px}tw-story input[type=text]{background-color:rgba(0,0,0,0);font:inherit;color:inherit;border-style:none}tw-story input[type=checkbox]{transform:scale(1.5);margin:0 .5em .5em .5em;vertical-align:middle}tw-story tw-noscript{animation:appear .8s}tw-passage{display:block}tw-sidebar{text-align:center;display:-ms-flexbox;display:flex;-ms-flex-pack:justify;justify-content:space-between}@media(min-width: 576px){tw-sidebar{left:-5em;width:3em;position:absolute;-ms-flex-direction:column;flex-direction:column}tw-enchantment[style*=width]>tw-sidebar{width:inherit}}tw-icon{display:inline-block;margin:.5em 0;font-size:66px;font-family:"Verdana",sans-serif}tw-icon[alt]{opacity:.2;cursor:pointer}tw-icon[alt]:hover{opacity:.4}tw-icon[data-label]::after{font-weight:bold;content:attr(data-label);font-size:20px;bottom:-20px;left:-50%;white-space:nowrap}tw-meter{display:block}tw-hook:empty,tw-expression:empty{display:none}tw-error{display:inline-block;border-radius:.2em;padding:.2em;font-size:1rem;cursor:help;white-space:pre-wrap}tw-error.error{background-color:rgba(223,58,190,.6);color:#fff}tw-error.warning{background-color:rgba(223,140,58,.6);color:#fff;display:none}.debug-mode tw-error.warning{display:inline}tw-error-explanation{display:block;font-size:.8rem;line-height:1rem}tw-open-button,tw-folddown{cursor:pointer;line-height:0em;border-radius:4px;border:1px solid rgba(255,255,255,.5);font-size:.8rem;margin:0 .2rem;padding:3px;white-space:pre}tw-folddown::after{content:"▶"}tw-folddown.open::after{content:"▼"}tw-open-button[replay]{display:none}tw-error tw-open-button,tw-eval-replay tw-open-button{display:inline !important}tw-open-button::after{content:attr(label)}tw-notifier{border-radius:.2em;padding:.2em;font-size:1rem;background-color:rgba(223,182,58,.4);display:none}.debug-mode tw-notifier{display:inline}tw-notifier::before{content:attr(message)}tw-colour{border:1px solid #000;display:inline-block;width:1em;height:1em}tw-enchantment:empty{display:none}h1{font-size:3em}h2{font-size:2.25em}h3{font-size:1.75em}h1,h2,h3,h4,h5,h6{line-height:1em;margin:.3em 0 .6em 0}pre{font-size:1rem;line-height:initial}small{font-size:70%}big{font-size:120%}mark{color:rgba(0,0,0,.6);background-color:#ff9}ins{color:rgba(0,0,0,.6);background-color:rgba(255,242,204,.5);border-radius:.5em;box-shadow:0em 0em .2em #ffe699;text-decoration:none}center{text-align:center;margin:0 auto;width:60%}blink{text-decoration:none;animation:fade-in-out 1s steps(1, end) infinite alternate}tw-align{display:block}tw-columns{display:-ms-flexbox;display:flex;-ms-flex-direction:row;flex-direction:row;-ms-flex-pack:justify;justify-content:space-between}.transition-in{animation:appear 0ms step-start}.transition-out{animation:appear 0ms step-end}[data-t8n^=dissolve].transition-in,[data-t8n=fade].transition-in{animation:appear .8s}[data-t8n^=dissolve].transition-out,[data-t8n=fade].transition-out{animation:appear .8s reverse}[data-t8n^=shudder].transition-in{display:inline-block !important;animation:shudder-in .8s}[data-t8n^=shudder].transition-out{display:inline-block !important;animation:shudder-in .8s reverse}[data-t8n^=rumble].transition-in{display:inline-block !important;animation:rumble-in .8s}[data-t8n^=rumble].transition-out{display:inline-block !important;animation:rumble-in .8s reverse}[data-t8n^=pulse].transition-in{animation:pulse .8s;display:inline-block !important}[data-t8n^=pulse].transition-out{animation:pulse .8s reverse;display:inline-block !important}[data-t8n^=zoom].transition-in{animation:zoom-in .8s;display:inline-block !important}[data-t8n^=zoom].transition-out{animation:zoom-in .8s reverse;display:inline-block !important}[data-t8n^=blur].transition-in{animation:blur .8s;display:inline-block !important}[data-t8n^=blur].transition-out{animation:blur .8s reverse;display:inline-block !important}[data-t8n^=slideleft].transition-in{animation:slide-left .8s;display:inline-block !important}[data-t8n^=slideleft].transition-out{animation:slide-right .8s reverse;display:inline-block !important}[data-t8n^=slideright].transition-in{animation:slide-right .8s;display:inline-block !important}[data-t8n^=slideright].transition-out{animation:slide-left .8s reverse;display:inline-block !important}[data-t8n^=slideup].transition-in{animation:slide-up .8s;display:inline-block !important}[data-t8n^=slideup].transition-out{animation:slide-down .8s reverse;display:inline-block !important}[data-t8n^=slidedown].transition-in{animation:slide-down .8s;display:inline-block !important}[data-t8n^=slidedown].transition-out{animation:slide-up .8s reverse;display:inline-block !important}[data-t8n^=fadeleft].transition-in{animation:fade-left .8s;display:inline-block !important}[data-t8n^=fadeleft].transition-out{animation:fade-right .8s reverse;display:inline-block !important}[data-t8n^=faderight].transition-in{animation:fade-right .8s;display:inline-block !important}[data-t8n^=faderight].transition-out{animation:fade-left .8s reverse;display:inline-block !important}[data-t8n^=fadeup].transition-in{animation:fade-up .8s;display:inline-block !important}[data-t8n^=fadeup].transition-out{animation:fade-down .8s reverse;display:inline-block !important}[data-t8n^=fadedown].transition-in{animation:fade-down .8s;display:inline-block !important}[data-t8n^=fadedown].transition-out{animation:fade-up .8s reverse;display:inline-block !important}[data-t8n^=flicker].transition-in{animation:flicker .8s}[data-t8n^=flicker].transition-out{animation:flicker .8s reverse}
</style>
</head>
<body>
<tw-story><noscript><tw-noscript>JavaScript needs to be enabled to play История без названия.</tw-noscript></noscript></tw-story>
<tw-storydata name="История без названия" startnode="1" creator="Twine" creator-version="2.12.0" format="Harlowe" format-version="3.3.9" ifid="EBCBC153-2E61-4905-9227-993968AE7C90" options="" tags="" zoom="1" hidden><style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css">tw-story {
  font-family: "Consolas", "Monaco", monospace;
}
tw-sidebar {
  display: none;
}
</style><script role="script" id="twine-user-script" type="text/twine-javascript"></script><tw-passagedata pid="1" name="Начало" tags="" position="450,175" size="100,100">Старик в обносках подошел к вам и заискивающе забормотал:
- О славный рыцарь! Позволь обратиться к тебе с просьбой. 

[[- Пошел прочь, смерд-&gt;Конец1]]
[[- Слушаю тебя, старик-&gt;История старика]]</tw-passagedata><tw-passagedata pid="2" name="Конец1" tags="" position="575,300" size="100,100">Старик пожал плечами и побрел прочь.

(link: &quot;На этом ваш короткий разговор закончился&quot;)[
    &lt;script&gt;
        // Этот код выполнится сразу при переходе по ссылке
        window.parent.postMessage({
            type: &#39;TWINE_QUEST_COMPLETE&#39;,
            payload: { gold: 0 } 
        }, &#39;*&#39;);
    &lt;/script&gt;
]</tw-passagedata><tw-passagedata pid="3" name="История старика" tags="" position="450,300" size="100,100">Старик обрадовался, что вы согласились выслушать его:
- Сама судьба свела нас в этом месте, почтенный рыцарь! Позволь же рассказать мою скорбную историю. Я пришел сюда из восточных земель, чтобы излечиться от подагры. Мне сказали, что здесь живет лекарь Григуар, который знает толк в исцелении от всех болезней, и я, собрав последние монеты, отправился пешком сюда. Караванщик указал мне на дом, где живет Григуар. Я позвонил в дверной колокольчик и услышал: &quot;Кто там?&quot;. Я представился, дверь открылась, и злобный обличьем карлик повел меня по темным коридорам. Мы дошли до пустой залы с канделябрами, стены которой были завешены портьерами. Карлик оставил меня в одиночестве и скрылся за портьерой. Наконец, в из-за портьеры появился некто в мантии и напудренном парике. Он сказал, что его зовут Григуар, и он может вылечить мою болезнь одним глотком его &quot;особого эликсира&quot;. Он протянул мне бутылочку с зельем, я выпил его, и в ту же минуту почувствовал, что падаю в беспамятстве. Я очнулся где-то в подворотнях, не помня, где дом этого мошенника, с пустым мешком. Меня обчистили! Поможешь мне вернуть похищенное?

[[- Нет, мне некогда возиться с тобой.-&gt;Конец1]]
[[- Пойдем, поищем этого твоего Григуара.-&gt;Поиски]]</tw-passagedata><tw-passagedata pid="4" name="Поиски" tags="" position="450,425" size="100,100">Вы долго плутали по городу, прежде чем старик хлопнул себя по лбу и воскликнул:
- Да вот же он, дом Григуара!
Каменный дом с закрытыми ставнями был похож на крепость. Вы подошли к двери и потянули дверной колокольчик.
Из-за двери раздался неприятный на слух голос:
- Кто там? Чего надобно?

[[- В этом доме ограбили старика, верните его монеты!.-&gt;Конец2]]
[[- Я ищу Григуара. Слышал, что он может вылечить мою язву.-&gt;Григуар]]</tw-passagedata><tw-passagedata pid="5" name="Конец2" tags="" position="450,550" size="100,100">Вам, конечно же, не открыли. Вы еще раз позвонили в колокольчик, постучали в дверь кулаком, но тщетно.
- Что ж, старик, выбить такие двери я не смогу. Придется тебе решать свою проблему самому.
Старик сел на землю и закрыл голову руками.

(link: &quot;Вы ничем не смогли ему помочь.&quot;)[
    &lt;script&gt;
        // Этот код выполнится сразу при переходе по ссылке
        window.parent.postMessage({
            type: &#39;TWINE_QUEST_COMPLETE&#39;
        }, &#39;*&#39;);
    &lt;/script&gt;
]</tw-passagedata><tw-passagedata pid="6" name="Григуар" tags="" position="575,550" size="100,100">Вы жестом попросили старика отойти в сторону так, чтобы его не было видно.
После минутной паузы хлопнул затвор, и дверь отворилась. За дверью стоял коротышка отвратительной наружности:
- Идем за мной.
Вы пошли за ним по хитросплетениям сумеречных коридоров, пока наконец не дошли до залы, стены которой были завешены портьерами, вдоль которых стояли канделябры с давно погасшими остатками свечей. Карлик сделал вам жест оставаться на месте, а сам скрылся за портьерой.
Вскоре из-за нее вышел Григуар в мантии и напудренном парике.
- Я отлично умею лечить твою болезнь, путник! Держи вот этот эликсир, и излечишься с одного глотка!

[[- Гони монеты, которые ты украл у старика, пока я не сдал тебя городской страже!-&gt;Честный]]
[[- Я пожалуй возьму эликсир с собой и выпью позже.-&gt;Разборки]]
</tw-passagedata><tw-passagedata pid="7" name="Разборки" tags="" position="575,675" size="100,100">Услышав это, &quot;лекарь&quot; зашипел как змея и схватил канделябр с явным намерением ударить вас. Вы легко увернулись от его неловкого движения и одним тычком повалили его на пол. 
- Ну что, мошенник, не нравится, когда обманывают тебя самого?
Вы сгребли лже-лекаря в охапку и стали трясти его, а из его карманов посыпались монеты!
(link: &quot;Вернув монеты старику, вы оставили часть себе в награду.&quot;)[
    &lt;script&gt;
        // Этот код выполнится сразу при переходе по ссылке
        window.parent.postMessage({
            type: &#39;TWINE_QUEST_COMPLETE&#39;,
            payload: { gold: 50 } 
        }, &#39;*&#39;);
    &lt;/script&gt;
]
</tw-passagedata><tw-passagedata pid="8" name="Честный" tags="" position="700,675" size="100,100">- Как смеешь ты позорить мое честное имя!!! Стручок, на помощь!!! - завопил Григуар и в то же мгновение скрылся за портьерой. Оттуда выскочил карлик с побагровевшей от злобы рожей и топором в руках. Он попытался огреть вас обухом, но вы ударили его коленом прямо в челюсть, от чего он рухнул на пол как подкошенный и застонал. Вы принялись обыскивать его, но при нем ничего не было. Вы откинули портьеру, чтобы догнать лже-лекаря, но за портьерой была запертая дубовая дверь.

Григуар вовремя сбежал.

(link: &quot;Пришлось объяснить старику, что его деньги пропали&quot;)[
    &lt;script&gt;
        // Этот код выполнится сразу при переходе по ссылке
        window.parent.postMessage({
            type: &#39;TWINE_QUEST_COMPLETE&#39;,
            payload: { gold: 0 } 
        }, &#39;*&#39;);
    &lt;/script&gt;
]</tw-passagedata></tw-storydata>
<script title="Twine engine code" data-main="harlowe">(function(){"use strict";
var require,define;!function(){var e={},r={};require=function(i){var n=e[i];return n&&(r[i]=n[1].apply(void 0,n[0].map(require)),e[i]=void 0),r[i]},(define=function(r,i,n){if("function"==typeof r)return r();e[r]=[i,n]}).amd=!0}();/*!
 * https://github.com/paulmillr/es6-shim
 * @license es6-shim Copyright 2013-2016 by Paul Miller (http://paulmillr.com)
 *   and contributors,  MIT License
 * es6-shim: v0.35.4
 * see https://github.com/paulmillr/es6-shim/blob/0.35.3/LICENSE
 * Details and documentation:
 * https://github.com/paulmillr/es6-shim/
 */
(function(e,t){if(typeof define==="function"&&define.amd){define(t)}else if(typeof exports==="object"){module.exports=t()}else{e.returnExports=t()}})(this,function(){"use strict";var e=Function.call.bind(Function.apply);var t=Function.call.bind(Function.call);var r=Array.isArray;var n=Object.keys;var o=function notThunker(t){return function notThunk(){return!e(t,this,arguments)}};var i=function(e){try{e();return false}catch(t){return true}};var a=function valueOrFalseIfThrows(e){try{return e()}catch(t){return false}};var u=o(i);var f=function(){return!i(function(){return Object.defineProperty({},"x",{get:function(){}})})};var s=!!Object.defineProperty&&f();var c=function foo(){}.name==="foo";var l=Function.call.bind(Array.prototype.forEach);var p=Function.call.bind(Array.prototype.reduce);var v=Function.call.bind(Array.prototype.filter);var y=Function.call.bind(Array.prototype.some);var h=function(e,t,r,n){if(!n&&t in e){return}if(s){Object.defineProperty(e,t,{configurable:true,enumerable:false,writable:true,value:r})}else{e[t]=r}};var b=function(e,t,r){l(n(t),function(n){var o=t[n];h(e,n,o,!!r)})};var g=Function.call.bind(Object.prototype.toString);var d=typeof/abc/==="function"?function IsCallableSlow(e){return typeof e==="function"&&g(e)==="[object Function]"}:function IsCallableFast(e){return typeof e==="function"};var m={getter:function(e,t,r){if(!s){throw new TypeError("getters require true ES5 support")}Object.defineProperty(e,t,{configurable:true,enumerable:false,get:r})},proxy:function(e,t,r){if(!s){throw new TypeError("getters require true ES5 support")}var n=Object.getOwnPropertyDescriptor(e,t);Object.defineProperty(r,t,{configurable:n.configurable,enumerable:n.enumerable,get:function getKey(){return e[t]},set:function setKey(r){e[t]=r}})},redefine:function(e,t,r){if(s){var n=Object.getOwnPropertyDescriptor(e,t);n.value=r;Object.defineProperty(e,t,n)}else{e[t]=r}},defineByDescriptor:function(e,t,r){if(s){Object.defineProperty(e,t,r)}else if("value"in r){e[t]=r.value}},preserveToString:function(e,t){if(t&&d(t.toString)){h(e,"toString",t.toString.bind(t),true)}}};var O=Object.create||function(e,t){var r=function Prototype(){};r.prototype=e;var o=new r;if(typeof t!=="undefined"){n(t).forEach(function(e){m.defineByDescriptor(o,e,t[e])})}return o};var w=function(e,t){if(!Object.setPrototypeOf){return false}return a(function(){var r=function Subclass(t){var r=new e(t);Object.setPrototypeOf(r,Subclass.prototype);return r};Object.setPrototypeOf(r,e);r.prototype=O(e.prototype,{constructor:{value:r}});return t(r)})};var j=function(){if(typeof self!=="undefined"){return self}if(typeof window!=="undefined"){return window}if(typeof global!=="undefined"){return global}throw new Error("unable to locate global object")};var S=j();var T=S.isFinite;var I=Function.call.bind(String.prototype.indexOf);var E=Function.apply.bind(Array.prototype.indexOf);var P=Function.call.bind(Array.prototype.concat);var C=Function.call.bind(String.prototype.slice);var M=Function.call.bind(Array.prototype.push);var x=Function.apply.bind(Array.prototype.push);var N=Function.call.bind(Array.prototype.join);var A=Function.call.bind(Array.prototype.shift);var _=Math.max;var R=Math.min;var k=Math.floor;var L=Math.abs;var F=Math.exp;var D=Math.log;var z=Math.sqrt;var q=Function.call.bind(Object.prototype.hasOwnProperty);var W;var G=function(){};var H=S.Map;var V=H&&H.prototype["delete"];var B=H&&H.prototype.get;var U=H&&H.prototype.has;var $=H&&H.prototype.set;var J=S.Symbol||{};var X=J.species||"@@species";var K=Number.isNaN||function isNaN(e){return e!==e};var Z=Number.isFinite||function isFinite(e){return typeof e==="number"&&T(e)};var Y=d(Math.sign)?Math.sign:function sign(e){var t=Number(e);if(t===0){return t}if(K(t)){return t}return t<0?-1:1};var Q=function log1p(e){var t=Number(e);if(t<-1||K(t)){return NaN}if(t===0||t===Infinity){return t}if(t===-1){return-Infinity}return 1+t-1===0?t:t*(D(1+t)/(1+t-1))};var ee=function isArguments(e){return g(e)==="[object Arguments]"};var te=function isArguments(e){return e!==null&&typeof e==="object"&&typeof e.length==="number"&&e.length>=0&&g(e)!=="[object Array]"&&g(e.callee)==="[object Function]"};var re=ee(arguments)?ee:te;var ne={primitive:function(e){return e===null||typeof e!=="function"&&typeof e!=="object"},string:function(e){return g(e)==="[object String]"},regex:function(e){return g(e)==="[object RegExp]"},symbol:function(e){return typeof S.Symbol==="function"&&typeof e==="symbol"}};var oe=function overrideNative(e,t,r){var n=e[t];h(e,t,r,true);m.preserveToString(e[t],n)};var ie=typeof J==="function"&&typeof J["for"]==="function"&&ne.symbol(J());var ae=ne.symbol(J.iterator)?J.iterator:"_es6-shim iterator_";if(S.Set&&typeof(new S.Set)["@@iterator"]==="function"){ae="@@iterator"}if(!S.Reflect){h(S,"Reflect",{},true)}var ue=S.Reflect;var fe=String;var se=typeof document==="undefined"||!document?null:document.all;var ce=se==null?function isNullOrUndefined(e){return e==null}:function isNullOrUndefinedAndNotDocumentAll(e){return e==null&&e!==se};var le={Call:function Call(t,r){var n=arguments.length>2?arguments[2]:[];if(!le.IsCallable(t)){throw new TypeError(t+" is not a function")}return e(t,r,n)},RequireObjectCoercible:function(e,t){if(ce(e)){throw new TypeError(t||"Cannot call method on "+e)}return e},TypeIsObject:function(e){if(e===void 0||e===null||e===true||e===false){return false}return typeof e==="function"||typeof e==="object"||e===se},ToObject:function(e,t){return Object(le.RequireObjectCoercible(e,t))},IsCallable:d,IsConstructor:function(e){return le.IsCallable(e)},ToInt32:function(e){return le.ToNumber(e)>>0},ToUint32:function(e){return le.ToNumber(e)>>>0},ToNumber:function(e){if(ie&&g(e)==="[object Symbol]"){throw new TypeError("Cannot convert a Symbol value to a number")}return+e},ToInteger:function(e){var t=le.ToNumber(e);if(K(t)){return 0}if(t===0||!Z(t)){return t}return(t>0?1:-1)*k(L(t))},ToLength:function(e){var t=le.ToInteger(e);if(t<=0){return 0}if(t>Number.MAX_SAFE_INTEGER){return Number.MAX_SAFE_INTEGER}return t},SameValue:function(e,t){if(e===t){if(e===0){return 1/e===1/t}return true}return K(e)&&K(t)},SameValueZero:function(e,t){return e===t||K(e)&&K(t)},GetIterator:function(e){if(re(e)){return new W(e,"value")}var t=le.GetMethod(e,ae);if(!le.IsCallable(t)){throw new TypeError("value is not an iterable")}var r=le.Call(t,e);if(!le.TypeIsObject(r)){throw new TypeError("bad iterator")}return r},GetMethod:function(e,t){var r=le.ToObject(e)[t];if(ce(r)){return void 0}if(!le.IsCallable(r)){throw new TypeError("Method not callable: "+t)}return r},IteratorComplete:function(e){return!!e.done},IteratorClose:function(e,t){var r=le.GetMethod(e,"return");if(r===void 0){return}var n,o;try{n=le.Call(r,e)}catch(i){o=i}if(t){return}if(o){throw o}if(!le.TypeIsObject(n)){throw new TypeError("Iterator's return method returned a non-object.")}},IteratorNext:function(e){var t=arguments.length>1?e.next(arguments[1]):e.next();if(!le.TypeIsObject(t)){throw new TypeError("bad iterator")}return t},IteratorStep:function(e){var t=le.IteratorNext(e);var r=le.IteratorComplete(t);return r?false:t},Construct:function(e,t,r,n){var o=typeof r==="undefined"?e:r;if(!n&&ue.construct){return ue.construct(e,t,o)}var i=o.prototype;if(!le.TypeIsObject(i)){i=Object.prototype}var a=O(i);var u=le.Call(e,a,t);return le.TypeIsObject(u)?u:a},SpeciesConstructor:function(e,t){var r=e.constructor;if(r===void 0){return t}if(!le.TypeIsObject(r)){throw new TypeError("Bad constructor")}var n=r[X];if(ce(n)){return t}if(!le.IsConstructor(n)){throw new TypeError("Bad @@species")}return n},CreateHTML:function(e,t,r,n){var o=le.ToString(e);var i="<"+t;if(r!==""){var a=le.ToString(n);var u=a.replace(/"/g,"&quot;");i+=" "+r+'="'+u+'"'}var f=i+">";var s=f+o;return s+"</"+t+">"},IsRegExp:function IsRegExp(e){if(!le.TypeIsObject(e)){return false}var t=e[J.match];if(typeof t!=="undefined"){return!!t}return ne.regex(e)},ToString:function ToString(e){if(ie&&g(e)==="[object Symbol]"){throw new TypeError("Cannot convert a Symbol value to a number")}return fe(e)}};if(s&&ie){var pe=function defineWellKnownSymbol(e){if(ne.symbol(J[e])){return J[e]}var t=J["for"]("Symbol."+e);Object.defineProperty(J,e,{configurable:false,enumerable:false,writable:false,value:t});return t};if(!ne.symbol(J.search)){var ve=pe("search");var ye=String.prototype.search;h(RegExp.prototype,ve,function search(e){return le.Call(ye,e,[this])});var he=function search(e){var t=le.RequireObjectCoercible(this);if(!ce(e)){var r=le.GetMethod(e,ve);if(typeof r!=="undefined"){return le.Call(r,e,[t])}}return le.Call(ye,t,[le.ToString(e)])};oe(String.prototype,"search",he)}if(!ne.symbol(J.replace)){var be=pe("replace");var ge=String.prototype.replace;h(RegExp.prototype,be,function replace(e,t){return le.Call(ge,e,[this,t])});var de=function replace(e,t){var r=le.RequireObjectCoercible(this);if(!ce(e)){var n=le.GetMethod(e,be);if(typeof n!=="undefined"){return le.Call(n,e,[r,t])}}return le.Call(ge,r,[le.ToString(e),t])};oe(String.prototype,"replace",de)}if(!ne.symbol(J.split)){var me=pe("split");var Oe=String.prototype.split;h(RegExp.prototype,me,function split(e,t){return le.Call(Oe,e,[this,t])});var we=function split(e,t){var r=le.RequireObjectCoercible(this);if(!ce(e)){var n=le.GetMethod(e,me);if(typeof n!=="undefined"){return le.Call(n,e,[r,t])}}return le.Call(Oe,r,[le.ToString(e),t])};oe(String.prototype,"split",we)}var je=ne.symbol(J.match);var Se=je&&function(){var e={};e[J.match]=function(){return 42};return"a".match(e)!==42}();if(!je||Se){var Te=pe("match");var Ie=String.prototype.match;h(RegExp.prototype,Te,function match(e){return le.Call(Ie,e,[this])});var Ee=function match(e){var t=le.RequireObjectCoercible(this);if(!ce(e)){var r=le.GetMethod(e,Te);if(typeof r!=="undefined"){return le.Call(r,e,[t])}}return le.Call(Ie,t,[le.ToString(e)])};oe(String.prototype,"match",Ee)}}var Pe=function wrapConstructor(e,t,r){m.preserveToString(t,e);if(Object.setPrototypeOf){Object.setPrototypeOf(e,t)}if(s){l(Object.getOwnPropertyNames(e),function(n){if(n in G||r[n]){return}m.proxy(e,n,t)})}else{l(Object.keys(e),function(n){if(n in G||r[n]){return}t[n]=e[n]})}t.prototype=e.prototype;m.redefine(e.prototype,"constructor",t)};var Ce=function(){return this};var Me=function(e){if(s&&!q(e,X)){m.getter(e,X,Ce)}};var xe=function(e,t){var r=t||function iterator(){return this};h(e,ae,r);if(!e[ae]&&ne.symbol(ae)){e[ae]=r}};var Ne=function createDataProperty(e,t,r){if(s){Object.defineProperty(e,t,{configurable:true,enumerable:true,writable:true,value:r})}else{e[t]=r}};var Ae=function createDataPropertyOrThrow(e,t,r){Ne(e,t,r);if(!le.SameValue(e[t],r)){throw new TypeError("property is nonconfigurable")}};var _e=function(e,t,r,n){if(!le.TypeIsObject(e)){throw new TypeError("Constructor requires `new`: "+t.name)}var o=t.prototype;if(!le.TypeIsObject(o)){o=r}var i=O(o);for(var a in n){if(q(n,a)){var u=n[a];h(i,a,u,true)}}return i};if(String.fromCodePoint&&String.fromCodePoint.length!==1){var Re=String.fromCodePoint;oe(String,"fromCodePoint",function fromCodePoint(e){return le.Call(Re,this,arguments)})}var ke={fromCodePoint:function fromCodePoint(e){var t=[];var r;for(var n=0,o=arguments.length;n<o;n++){r=Number(arguments[n]);if(!le.SameValue(r,le.ToInteger(r))||r<0||r>1114111){throw new RangeError("Invalid code point "+r)}if(r<65536){M(t,String.fromCharCode(r))}else{r-=65536;M(t,String.fromCharCode((r>>10)+55296));M(t,String.fromCharCode(r%1024+56320))}}return N(t,"")},raw:function raw(e){var t=arguments.length-1;var r=le.ToObject(e,"bad template");var raw=le.ToObject(r.raw,"bad raw value");var n=raw.length;var o=le.ToLength(n);if(o<=0){return""}var i=[];var a=0;var u,f,s,c;while(a<o){u=le.ToString(a);s=le.ToString(raw[u]);M(i,s);if(a+1>=o){break}f=a+1<arguments.length?arguments[a+1]:"";c=le.ToString(f);M(i,c);a+=1}return N(i,"")}};if(String.raw&&String.raw({raw:{0:"x",1:"y",length:2}})!=="xy"){oe(String,"raw",ke.raw)}b(String,ke);var Le=function repeat(e,t){if(t<1){return""}if(t%2){return repeat(e,t-1)+e}var r=repeat(e,t/2);return r+r};var Fe=Infinity;var De={repeat:function repeat(e){var t=le.ToString(le.RequireObjectCoercible(this));var r=le.ToInteger(e);if(r<0||r>=Fe){throw new RangeError("repeat count must be less than infinity and not overflow maximum string size")}return Le(t,r)},startsWith:function startsWith(e){var t=le.ToString(le.RequireObjectCoercible(this));if(le.IsRegExp(e)){throw new TypeError('Cannot call method "startsWith" with a regex')}var r=le.ToString(e);var n;if(arguments.length>1){n=arguments[1]}var o=_(le.ToInteger(n),0);return C(t,o,o+r.length)===r},endsWith:function endsWith(e){var t=le.ToString(le.RequireObjectCoercible(this));if(le.IsRegExp(e)){throw new TypeError('Cannot call method "endsWith" with a regex')}var r=le.ToString(e);var n=t.length;var o;if(arguments.length>1){o=arguments[1]}var i=typeof o==="undefined"?n:le.ToInteger(o);var a=R(_(i,0),n);return C(t,a-r.length,a)===r},includes:function includes(e){if(le.IsRegExp(e)){throw new TypeError('"includes" does not accept a RegExp')}var t=le.ToString(e);var r;if(arguments.length>1){r=arguments[1]}return I(this,t,r)!==-1},codePointAt:function codePointAt(e){var t=le.ToString(le.RequireObjectCoercible(this));var r=le.ToInteger(e);var n=t.length;if(r>=0&&r<n){var o=t.charCodeAt(r);var i=r+1===n;if(o<55296||o>56319||i){return o}var a=t.charCodeAt(r+1);if(a<56320||a>57343){return o}return(o-55296)*1024+(a-56320)+65536}}};if(String.prototype.includes&&"a".includes("a",Infinity)!==false){oe(String.prototype,"includes",De.includes)}if(String.prototype.startsWith&&String.prototype.endsWith){var ze=i(function(){return"/a/".startsWith(/a/)});var qe=a(function(){return"abc".startsWith("a",Infinity)===false});if(!ze||!qe){oe(String.prototype,"startsWith",De.startsWith);oe(String.prototype,"endsWith",De.endsWith)}}if(ie){var We=a(function(){var e=/a/;e[J.match]=false;return"/a/".startsWith(e)});if(!We){oe(String.prototype,"startsWith",De.startsWith)}var Ge=a(function(){var e=/a/;e[J.match]=false;return"/a/".endsWith(e)});if(!Ge){oe(String.prototype,"endsWith",De.endsWith)}var He=a(function(){var e=/a/;e[J.match]=false;return"/a/".includes(e)});if(!He){oe(String.prototype,"includes",De.includes)}}b(String.prototype,De);var Ve=["\t\n\x0B\f\r \xa0\u1680\u180e\u2000\u2001\u2002\u2003","\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028","\u2029\ufeff"].join("");var Be=new RegExp("(^["+Ve+"]+)|(["+Ve+"]+$)","g");var Ue=function trim(){return le.ToString(le.RequireObjectCoercible(this)).replace(Be,"")};var $e=["\x85","\u200b","\ufffe"].join("");var Je=new RegExp("["+$e+"]","g");var Xe=/^[-+]0x[0-9a-f]+$/i;var Ke=$e.trim().length!==$e.length;h(String.prototype,"trim",Ue,Ke);var Ze=function(e){return{value:e,done:arguments.length===0}};var Ye=function(e){le.RequireObjectCoercible(e);h(this,"_s",le.ToString(e));h(this,"_i",0)};Ye.prototype.next=function(){var e=this._s;var t=this._i;if(typeof e==="undefined"||t>=e.length){this._s=void 0;return Ze()}var r=e.charCodeAt(t);var n,o;if(r<55296||r>56319||t+1===e.length){o=1}else{n=e.charCodeAt(t+1);o=n<56320||n>57343?1:2}this._i=t+o;return Ze(e.substr(t,o))};xe(Ye.prototype);xe(String.prototype,function(){return new Ye(this)});var Qe={from:function from(e){var r=this;var n;if(arguments.length>1){n=arguments[1]}var o,i;if(typeof n==="undefined"){o=false}else{if(!le.IsCallable(n)){throw new TypeError("Array.from: when provided, the second argument must be a function")}if(arguments.length>2){i=arguments[2]}o=true}var a=typeof(re(e)||le.GetMethod(e,ae))!=="undefined";var u,f,s;if(a){f=le.IsConstructor(r)?Object(new r):[];var c=le.GetIterator(e);var l,p;s=0;while(true){l=le.IteratorStep(c);if(l===false){break}p=l.value;try{if(o){p=typeof i==="undefined"?n(p,s):t(n,i,p,s)}f[s]=p}catch(v){le.IteratorClose(c,true);throw v}s+=1}u=s}else{var y=le.ToObject(e);u=le.ToLength(y.length);f=le.IsConstructor(r)?Object(new r(u)):new Array(u);var h;for(s=0;s<u;++s){h=y[s];if(o){h=typeof i==="undefined"?n(h,s):t(n,i,h,s)}Ae(f,s,h)}}f.length=u;return f},of:function of(){var e=arguments.length;var t=this;var n=r(t)||!le.IsCallable(t)?new Array(e):le.Construct(t,[e]);for(var o=0;o<e;++o){Ae(n,o,arguments[o])}n.length=e;return n}};b(Array,Qe);Me(Array);W=function(e,t){h(this,"i",0);h(this,"array",e);h(this,"kind",t)};b(W.prototype,{next:function(){var e=this.i;var t=this.array;if(!(this instanceof W)){throw new TypeError("Not an ArrayIterator")}if(typeof t!=="undefined"){var r=le.ToLength(t.length);if(e<r){var n=this.kind;var o;if(n==="key"){o=e}else if(n==="value"){o=t[e]}else if(n==="entry"){o=[e,t[e]]}this.i=e+1;return Ze(o)}}this.array=void 0;return Ze()}});xe(W.prototype);var et=Array.of===Qe.of||function(){var e=function Foo(e){this.length=e};e.prototype=[];var t=Array.of.apply(e,[1,2]);return t instanceof e&&t.length===2}();if(!et){oe(Array,"of",Qe.of)}var tt={copyWithin:function copyWithin(e,t){var r=le.ToObject(this);var n=le.ToLength(r.length);var o=le.ToInteger(e);var i=le.ToInteger(t);var a=o<0?_(n+o,0):R(o,n);var u=i<0?_(n+i,0):R(i,n);var f;if(arguments.length>2){f=arguments[2]}var s=typeof f==="undefined"?n:le.ToInteger(f);var c=s<0?_(n+s,0):R(s,n);var l=R(c-u,n-a);var p=1;if(u<a&&a<u+l){p=-1;u+=l-1;a+=l-1}while(l>0){if(u in r){r[a]=r[u]}else{delete r[a]}u+=p;a+=p;l-=1}return r},fill:function fill(e){var t;if(arguments.length>1){t=arguments[1]}var r;if(arguments.length>2){r=arguments[2]}var n=le.ToObject(this);var o=le.ToLength(n.length);t=le.ToInteger(typeof t==="undefined"?0:t);r=le.ToInteger(typeof r==="undefined"?o:r);var i=t<0?_(o+t,0):R(t,o);var a=r<0?o+r:r;for(var u=i;u<o&&u<a;++u){n[u]=e}return n},find:function find(e){var r=le.ToObject(this);var n=le.ToLength(r.length);if(!le.IsCallable(e)){throw new TypeError("Array#find: predicate must be a function")}var o=arguments.length>1?arguments[1]:null;for(var i=0,a;i<n;i++){a=r[i];if(o){if(t(e,o,a,i,r)){return a}}else if(e(a,i,r)){return a}}},findIndex:function findIndex(e){var r=le.ToObject(this);var n=le.ToLength(r.length);if(!le.IsCallable(e)){throw new TypeError("Array#findIndex: predicate must be a function")}var o=arguments.length>1?arguments[1]:null;for(var i=0;i<n;i++){if(o){if(t(e,o,r[i],i,r)){return i}}else if(e(r[i],i,r)){return i}}return-1},keys:function keys(){return new W(this,"key")},values:function values(){return new W(this,"value")},entries:function entries(){return new W(this,"entry")}};if(Array.prototype.keys&&!le.IsCallable([1].keys().next)){delete Array.prototype.keys}if(Array.prototype.entries&&!le.IsCallable([1].entries().next)){delete Array.prototype.entries}if(Array.prototype.keys&&Array.prototype.entries&&!Array.prototype.values&&Array.prototype[ae]){b(Array.prototype,{values:Array.prototype[ae]});if(ne.symbol(J.unscopables)){Array.prototype[J.unscopables].values=true}}if(c&&Array.prototype.values&&Array.prototype.values.name!=="values"){var rt=Array.prototype.values;oe(Array.prototype,"values",function values(){return le.Call(rt,this,arguments)});h(Array.prototype,ae,Array.prototype.values,true)}b(Array.prototype,tt);if(1/[true].indexOf(true,-0)<0){h(Array.prototype,"indexOf",function indexOf(e){var t=E(this,arguments);if(t===0&&1/t<0){return 0}return t},true)}xe(Array.prototype,function(){return this.values()});if(Object.getPrototypeOf){var nt=Object.getPrototypeOf([].values());if(nt){xe(nt)}}var ot=function(){return a(function(){return Array.from({length:-1}).length===0})}();var it=function(){var e=Array.from([0].entries());return e.length===1&&r(e[0])&&e[0][0]===0&&e[0][1]===0}();if(!ot||!it){oe(Array,"from",Qe.from)}var at=function(){return a(function(){return Array.from([0],void 0)})}();if(!at){var ut=Array.from;oe(Array,"from",function from(e){if(arguments.length>1&&typeof arguments[1]!=="undefined"){return le.Call(ut,this,arguments)}return t(ut,this,e)})}var ft=-(Math.pow(2,32)-1);var st=function(e,r){var n={length:ft};n[r?(n.length>>>0)-1:0]=true;return a(function(){t(e,n,function(){throw new RangeError("should not reach here")},[]);return true})};if(!st(Array.prototype.forEach)){var ct=Array.prototype.forEach;oe(Array.prototype,"forEach",function forEach(e){return le.Call(ct,this.length>=0?this:[],arguments)})}if(!st(Array.prototype.map)){var lt=Array.prototype.map;oe(Array.prototype,"map",function map(e){return le.Call(lt,this.length>=0?this:[],arguments)})}if(!st(Array.prototype.filter)){var pt=Array.prototype.filter;oe(Array.prototype,"filter",function filter(e){return le.Call(pt,this.length>=0?this:[],arguments)})}if(!st(Array.prototype.some)){var vt=Array.prototype.some;oe(Array.prototype,"some",function some(e){return le.Call(vt,this.length>=0?this:[],arguments)})}if(!st(Array.prototype.every)){var yt=Array.prototype.every;oe(Array.prototype,"every",function every(e){return le.Call(yt,this.length>=0?this:[],arguments)})}if(!st(Array.prototype.reduce)){var ht=Array.prototype.reduce;oe(Array.prototype,"reduce",function reduce(e){return le.Call(ht,this.length>=0?this:[],arguments)})}if(!st(Array.prototype.reduceRight,true)){var bt=Array.prototype.reduceRight;oe(Array.prototype,"reduceRight",function reduceRight(e){return le.Call(bt,this.length>=0?this:[],arguments)})}var gt=Number("0o10")!==8;var dt=Number("0b10")!==2;var mt=y($e,function(e){return Number(e+0+e)===0});if(gt||dt||mt){var Ot=Number;var wt=/^0b[01]+$/i;var jt=/^0o[0-7]+$/i;var St=wt.test.bind(wt);var Tt=jt.test.bind(jt);var It=function(e,t){var r;if(typeof e.valueOf==="function"){r=e.valueOf();if(ne.primitive(r)){return r}}if(typeof e.toString==="function"){r=e.toString();if(ne.primitive(r)){return r}}throw new TypeError("No default value")};var Et=Je.test.bind(Je);var Pt=Xe.test.bind(Xe);var Ct=function(){var e=function Number(t){var r;if(arguments.length>0){r=ne.primitive(t)?t:It(t,"number")}else{r=0}if(typeof r==="string"){r=le.Call(Ue,r);if(St(r)){r=parseInt(C(r,2),2)}else if(Tt(r)){r=parseInt(C(r,2),8)}else if(Et(r)||Pt(r)){r=NaN}}var n=this;var o=a(function(){Ot.prototype.valueOf.call(n);return true});if(n instanceof e&&!o){return new Ot(r)}return Ot(r)};return e}();Pe(Ot,Ct,{});b(Ct,{NaN:Ot.NaN,MAX_VALUE:Ot.MAX_VALUE,MIN_VALUE:Ot.MIN_VALUE,NEGATIVE_INFINITY:Ot.NEGATIVE_INFINITY,POSITIVE_INFINITY:Ot.POSITIVE_INFINITY});Number=Ct;m.redefine(S,"Number",Ct)}var Mt=Math.pow(2,53)-1;b(Number,{MAX_SAFE_INTEGER:Mt,MIN_SAFE_INTEGER:-Mt,EPSILON:2.220446049250313e-16,parseInt:S.parseInt,parseFloat:S.parseFloat,isFinite:Z,isInteger:function isInteger(e){return Z(e)&&le.ToInteger(e)===e},isSafeInteger:function isSafeInteger(e){return Number.isInteger(e)&&L(e)<=Number.MAX_SAFE_INTEGER},isNaN:K});h(Number,"parseInt",S.parseInt,Number.parseInt!==S.parseInt);if([,1].find(function(){return true})===1){oe(Array.prototype,"find",tt.find)}if([,1].findIndex(function(){return true})!==0){oe(Array.prototype,"findIndex",tt.findIndex)}var xt=Function.bind.call(Function.bind,Object.prototype.propertyIsEnumerable);var Nt=function ensureEnumerable(e,t){if(s&&xt(e,t)){Object.defineProperty(e,t,{enumerable:false})}};var At=function sliceArgs(){var e=Number(this);var t=arguments.length;var r=t-e;var n=new Array(r<0?0:r);for(var o=e;o<t;++o){n[o-e]=arguments[o]}return n};var _t=function assignTo(e){return function assignToSource(t,r){t[r]=e[r];return t}};var Rt=function(e,t){var r=n(Object(t));var o;if(le.IsCallable(Object.getOwnPropertySymbols)){o=v(Object.getOwnPropertySymbols(Object(t)),xt(t))}return p(P(r,o||[]),_t(t),e)};var kt={assign:function(e,t){var r=le.ToObject(e,"Cannot convert undefined or null to object");return p(le.Call(At,1,arguments),Rt,r)},is:function is(e,t){return le.SameValue(e,t)}};var Lt=Object.assign&&Object.preventExtensions&&function(){var e=Object.preventExtensions({1:2});try{Object.assign(e,"xy")}catch(t){return e[1]==="y"}}();if(Lt){oe(Object,"assign",kt.assign)}b(Object,kt);if(s){var Ft={setPrototypeOf:function(e){var r;var n=function(e,t){if(!le.TypeIsObject(e)){throw new TypeError("cannot set prototype on a non-object")}if(!(t===null||le.TypeIsObject(t))){throw new TypeError("can only set prototype to an object or null"+t)}};var o=function(e,o){n(e,o);t(r,e,o);return e};try{r=e.getOwnPropertyDescriptor(e.prototype,"__proto__").set;t(r,{},null)}catch(i){if(e.prototype!=={}.__proto__){return}r=function(e){this.__proto__=e};o.polyfill=o(o({},null),e.prototype)instanceof e}return o}(Object)};b(Object,Ft)}if(Object.setPrototypeOf&&Object.getPrototypeOf&&Object.getPrototypeOf(Object.setPrototypeOf({},null))!==null&&Object.getPrototypeOf(Object.create(null))===null){(function(){var e=Object.create(null);var t=Object.getPrototypeOf;var r=Object.setPrototypeOf;Object.getPrototypeOf=function(r){var n=t(r);return n===e?null:n};Object.setPrototypeOf=function(t,n){var o=n===null?e:n;return r(t,o)};Object.setPrototypeOf.polyfill=false})()}var Dt=!i(function(){return Object.keys("foo")});if(!Dt){var zt=Object.keys;oe(Object,"keys",function keys(e){return zt(le.ToObject(e))});n=Object.keys}var qt=i(function(){return Object.keys(/a/g)});if(qt){var Wt=Object.keys;oe(Object,"keys",function keys(e){if(ne.regex(e)){var t=[];for(var r in e){if(q(e,r)){M(t,r)}}return t}return Wt(e)});n=Object.keys}if(Object.getOwnPropertyNames){var Gt=!i(function(){return Object.getOwnPropertyNames("foo")});if(!Gt){var Ht=typeof window==="object"?Object.getOwnPropertyNames(window):[];var Vt=Object.getOwnPropertyNames;oe(Object,"getOwnPropertyNames",function getOwnPropertyNames(e){var t=le.ToObject(e);if(g(t)==="[object Window]"){try{return Vt(t)}catch(r){return P([],Ht)}}return Vt(t)})}}if(Object.getOwnPropertyDescriptor){var Bt=!i(function(){return Object.getOwnPropertyDescriptor("foo","bar")});if(!Bt){var Ut=Object.getOwnPropertyDescriptor;oe(Object,"getOwnPropertyDescriptor",function getOwnPropertyDescriptor(e,t){return Ut(le.ToObject(e),t)})}}if(Object.seal){var $t=!i(function(){return Object.seal("foo")});if(!$t){var Jt=Object.seal;oe(Object,"seal",function seal(e){if(!le.TypeIsObject(e)){return e}return Jt(e)})}}if(Object.isSealed){var Xt=!i(function(){return Object.isSealed("foo")});if(!Xt){var Kt=Object.isSealed;oe(Object,"isSealed",function isSealed(e){if(!le.TypeIsObject(e)){return true}return Kt(e)})}}if(Object.freeze){var Zt=!i(function(){return Object.freeze("foo")});if(!Zt){var Yt=Object.freeze;oe(Object,"freeze",function freeze(e){if(!le.TypeIsObject(e)){return e}return Yt(e)})}}if(Object.isFrozen){var Qt=!i(function(){return Object.isFrozen("foo")});if(!Qt){var er=Object.isFrozen;oe(Object,"isFrozen",function isFrozen(e){if(!le.TypeIsObject(e)){return true}return er(e)})}}if(Object.preventExtensions){var tr=!i(function(){return Object.preventExtensions("foo")});if(!tr){var rr=Object.preventExtensions;oe(Object,"preventExtensions",function preventExtensions(e){if(!le.TypeIsObject(e)){return e}return rr(e)})}}if(Object.isExtensible){var nr=!i(function(){return Object.isExtensible("foo")});if(!nr){var or=Object.isExtensible;oe(Object,"isExtensible",function isExtensible(e){if(!le.TypeIsObject(e)){return false}return or(e)})}}if(Object.getPrototypeOf){var ir=!i(function(){return Object.getPrototypeOf("foo")});if(!ir){var ar=Object.getPrototypeOf;oe(Object,"getPrototypeOf",function getPrototypeOf(e){return ar(le.ToObject(e))})}}var ur=s&&function(){var e=Object.getOwnPropertyDescriptor(RegExp.prototype,"flags");return e&&le.IsCallable(e.get)}();if(s&&!ur){var fr=function flags(){if(!le.TypeIsObject(this)){throw new TypeError("Method called on incompatible type: must be an object.")}var e="";if(this.global){e+="g"}if(this.ignoreCase){e+="i"}if(this.multiline){e+="m"}if(this.unicode){e+="u"}if(this.sticky){e+="y"}return e};m.getter(RegExp.prototype,"flags",fr)}var sr=s&&a(function(){return String(new RegExp(/a/g,"i"))==="/a/i"});var cr=ie&&s&&function(){var e=/./;e[J.match]=false;return RegExp(e)===e}();var lr=a(function(){return RegExp.prototype.toString.call({source:"abc"})==="/abc/"});var pr=lr&&a(function(){return RegExp.prototype.toString.call({source:"a",flags:"b"})==="/a/b"});if(!lr||!pr){var vr=RegExp.prototype.toString;h(RegExp.prototype,"toString",function toString(){var e=le.RequireObjectCoercible(this);if(ne.regex(e)){return t(vr,e)}var r=fe(e.source);var n=fe(e.flags);return"/"+r+"/"+n},true);m.preserveToString(RegExp.prototype.toString,vr);RegExp.prototype.toString.prototype=void 0}if(s&&(!sr||cr)){var yr=Object.getOwnPropertyDescriptor(RegExp.prototype,"flags").get;var hr=Object.getOwnPropertyDescriptor(RegExp.prototype,"source")||{};var br=function(){return this.source};var gr=le.IsCallable(hr.get)?hr.get:br;var dr=RegExp;var mr=function(){return function RegExp(e,t){var r=le.IsRegExp(e);var n=this instanceof RegExp;if(!n&&r&&typeof t==="undefined"&&e.constructor===RegExp){return e}var o=e;var i=t;if(ne.regex(e)){o=le.Call(gr,e);i=typeof t==="undefined"?le.Call(yr,e):t;return new RegExp(o,i)}else if(r){o=e.source;i=typeof t==="undefined"?e.flags:t}return new dr(e,t)}}();Pe(dr,mr,{$input:true});RegExp=mr;m.redefine(S,"RegExp",mr)}if(s){var Or={input:"$_",lastMatch:"$&",lastParen:"$+",leftContext:"$`",rightContext:"$'"};l(n(Or),function(e){if(e in RegExp&&!(Or[e]in RegExp)){m.getter(RegExp,Or[e],function get(){return RegExp[e]})}})}Me(RegExp);var wr=1/Number.EPSILON;var jr=function roundTiesToEven(e){return e+wr-wr};var Sr=Math.pow(2,-23);var Tr=Math.pow(2,127)*(2-Sr);var Ir=Math.pow(2,-126);var Er=Math.E;var Pr=Math.LOG2E;var Cr=Math.LOG10E;var Mr=Number.prototype.clz;delete Number.prototype.clz;var xr={acosh:function acosh(e){var t=Number(e);if(K(t)||e<1){return NaN}if(t===1){return 0}if(t===Infinity){return t}var r=1/(t*t);if(t<2){return Q(t-1+z(1-r)*t)}var n=t/2;return Q(n+z(1-r)*n-1)+1/Pr},asinh:function asinh(e){var t=Number(e);if(t===0||!T(t)){return t}var r=L(t);var n=r*r;var o=Y(t);if(r<1){return o*Q(r+n/(z(n+1)+1))}return o*(Q(r/2+z(1+1/n)*r/2-1)+1/Pr)},atanh:function atanh(e){var t=Number(e);if(t===0){return t}if(t===-1){return-Infinity}if(t===1){return Infinity}if(K(t)||t<-1||t>1){return NaN}var r=L(t);return Y(t)*Q(2*r/(1-r))/2},cbrt:function cbrt(e){var t=Number(e);if(t===0){return t}var r=t<0;var n;if(r){t=-t}if(t===Infinity){n=Infinity}else{n=F(D(t)/3);n=(t/(n*n)+2*n)/3}return r?-n:n},clz32:function clz32(e){var t=Number(e);var r=le.ToUint32(t);if(r===0){return 32}return Mr?le.Call(Mr,r):31-k(D(r+.5)*Pr)},cosh:function cosh(e){var t=Number(e);if(t===0){return 1}if(K(t)){return NaN}if(!T(t)){return Infinity}var r=F(L(t)-1);return(r+1/(r*Er*Er))*(Er/2)},expm1:function expm1(e){var t=Number(e);if(t===-Infinity){return-1}if(!T(t)||t===0){return t}if(L(t)>.5){return F(t)-1}var r=t;var n=0;var o=1;while(n+r!==n){n+=r;o+=1;r*=t/o}return n},hypot:function hypot(e,t){var r=0;var n=0;for(var o=0;o<arguments.length;++o){var i=L(Number(arguments[o]));if(n<i){r*=n/i*(n/i);r+=1;n=i}else{r+=i>0?i/n*(i/n):i}}return n===Infinity?Infinity:n*z(r)},log2:function log2(e){return D(e)*Pr},log10:function log10(e){return D(e)*Cr},log1p:Q,sign:Y,sinh:function sinh(e){var t=Number(e);if(!T(t)||t===0){return t}var r=L(t);if(r<1){var n=Math.expm1(r);return Y(t)*n*(1+1/(n+1))/2}var o=F(r-1);return Y(t)*(o-1/(o*Er*Er))*(Er/2)},tanh:function tanh(e){var t=Number(e);if(K(t)||t===0){return t}if(t>=20){return 1}if(t<=-20){return-1}return(Math.expm1(t)-Math.expm1(-t))/(F(t)+F(-t))},trunc:function trunc(e){var t=Number(e);return t<0?-k(-t):k(t)},imul:function imul(e,t){var r=le.ToUint32(e);var n=le.ToUint32(t);var o=r>>>16&65535;var i=r&65535;var a=n>>>16&65535;var u=n&65535;return i*u+(o*u+i*a<<16>>>0)|0},fround:function fround(e){var t=Number(e);if(t===0||t===Infinity||t===-Infinity||K(t)){return t}var r=Y(t);var n=L(t);if(n<Ir){return r*jr(n/Ir/Sr)*Ir*Sr}var o=(1+Sr/Number.EPSILON)*n;var i=o-(o-n);if(i>Tr||K(i)){return r*Infinity}return r*i}};var Nr=function withinULPDistance(e,t,r){return L(1-e/t)/Number.EPSILON<(r||8)};b(Math,xr);h(Math,"sinh",xr.sinh,Math.sinh(710)===Infinity);h(Math,"cosh",xr.cosh,Math.cosh(710)===Infinity);h(Math,"log1p",xr.log1p,Math.log1p(-1e-17)!==-1e-17);h(Math,"asinh",xr.asinh,Math.asinh(-1e7)!==-Math.asinh(1e7));
h(Math,"asinh",xr.asinh,Math.asinh(1e300)===Infinity);h(Math,"atanh",xr.atanh,Math.atanh(1e-300)===0);h(Math,"tanh",xr.tanh,Math.tanh(-2e-17)!==-2e-17);h(Math,"acosh",xr.acosh,Math.acosh(Number.MAX_VALUE)===Infinity);h(Math,"acosh",xr.acosh,!Nr(Math.acosh(1+Number.EPSILON),Math.sqrt(2*Number.EPSILON)));h(Math,"cbrt",xr.cbrt,!Nr(Math.cbrt(1e-300),1e-100));h(Math,"sinh",xr.sinh,Math.sinh(-2e-17)!==-2e-17);var Ar=Math.expm1(10);h(Math,"expm1",xr.expm1,Ar>22025.465794806718||Ar<22025.465794806718);h(Math,"hypot",xr.hypot,Math.hypot(Infinity,NaN)!==Infinity);var _r=Math.round;var Rr=Math.round(.5-Number.EPSILON/4)===0&&Math.round(-.5+Number.EPSILON/3.99)===1;var kr=wr+1;var Lr=2*wr-1;var Fr=[kr,Lr].every(function(e){return Math.round(e)===e});h(Math,"round",function round(e){var t=k(e);var r=t===-1?-0:t+1;return e-t<.5?t:r},!Rr||!Fr);m.preserveToString(Math.round,_r);var Dr=Math.imul;if(Math.imul(4294967295,5)!==-5){Math.imul=xr.imul;m.preserveToString(Math.imul,Dr)}if(Math.imul.length!==2){oe(Math,"imul",function imul(e,t){return le.Call(Dr,Math,arguments)})}var zr=function(){var e=S.setTimeout;if(typeof e!=="function"&&typeof e!=="object"){return}le.IsPromise=function(e){if(!le.TypeIsObject(e)){return false}if(typeof e._promise==="undefined"){return false}return true};var r=function(e){if(!le.IsConstructor(e)){throw new TypeError("Bad promise constructor")}var t=this;var r=function(e,r){if(t.resolve!==void 0||t.reject!==void 0){throw new TypeError("Bad Promise implementation!")}t.resolve=e;t.reject=r};t.resolve=void 0;t.reject=void 0;t.promise=new e(r);if(!(le.IsCallable(t.resolve)&&le.IsCallable(t.reject))){throw new TypeError("Bad promise constructor")}};var n;if(typeof window!=="undefined"&&le.IsCallable(window.postMessage)){n=function(){var e=[];var t="zero-timeout-message";var r=function(r){M(e,r);window.postMessage(t,"*")};var n=function(r){if(r.source===window&&r.data===t){r.stopPropagation();if(e.length===0){return}var n=A(e);n()}};window.addEventListener("message",n,true);return r}}var o=function(){var e=S.Promise;var t=e&&e.resolve&&e.resolve();return t&&function(e){return t.then(e)}};var i=le.IsCallable(S.setImmediate)?S.setImmediate:typeof process==="object"&&process.nextTick?process.nextTick:o()||(le.IsCallable(n)?n():function(t){e(t,0)});var a=function(e){return e};var u=function(e){throw e};var f=0;var s=1;var c=2;var l=0;var p=1;var v=2;var y={};var h=function(e,t,r){i(function(){g(e,t,r)})};var g=function(e,t,r){var n,o;if(t===y){return e(r)}try{n=e(r);o=t.resolve}catch(i){n=i;o=t.reject}o(n)};var d=function(e,t){var r=e._promise;var n=r.reactionLength;if(n>0){h(r.fulfillReactionHandler0,r.reactionCapability0,t);r.fulfillReactionHandler0=void 0;r.rejectReactions0=void 0;r.reactionCapability0=void 0;if(n>1){for(var o=1,i=0;o<n;o++,i+=3){h(r[i+l],r[i+v],t);e[i+l]=void 0;e[i+p]=void 0;e[i+v]=void 0}}}r.result=t;r.state=s;r.reactionLength=0};var m=function(e,t){var r=e._promise;var n=r.reactionLength;if(n>0){h(r.rejectReactionHandler0,r.reactionCapability0,t);r.fulfillReactionHandler0=void 0;r.rejectReactions0=void 0;r.reactionCapability0=void 0;if(n>1){for(var o=1,i=0;o<n;o++,i+=3){h(r[i+p],r[i+v],t);e[i+l]=void 0;e[i+p]=void 0;e[i+v]=void 0}}}r.result=t;r.state=c;r.reactionLength=0};var O=function(e){var t=false;var r=function(r){var n;if(t){return}t=true;if(r===e){return m(e,new TypeError("Self resolution"))}if(!le.TypeIsObject(r)){return d(e,r)}try{n=r.then}catch(o){return m(e,o)}if(!le.IsCallable(n)){return d(e,r)}i(function(){j(e,r,n)})};var n=function(r){if(t){return}t=true;return m(e,r)};return{resolve:r,reject:n}};var w=function(e,r,n,o){if(e===I){t(e,r,n,o,y)}else{t(e,r,n,o)}};var j=function(e,t,r){var n=O(e);var o=n.resolve;var i=n.reject;try{w(r,t,o,i)}catch(a){i(a)}};var T,I;var E=function(){var e=function Promise(t){if(!(this instanceof e)){throw new TypeError('Constructor Promise requires "new"')}if(this&&this._promise){throw new TypeError("Bad construction")}if(!le.IsCallable(t)){throw new TypeError("not a valid resolver")}var r=_e(this,e,T,{_promise:{result:void 0,state:f,reactionLength:0,fulfillReactionHandler0:void 0,rejectReactionHandler0:void 0,reactionCapability0:void 0}});var n=O(r);var o=n.reject;try{t(n.resolve,o)}catch(i){o(i)}return r};return e}();T=E.prototype;var P=function(e,t,r,n){var o=false;return function(i){if(o){return}o=true;t[e]=i;if(--n.count===0){var a=r.resolve;a(t)}}};var C=function(e,t,r){var n=e.iterator;var o=[];var i={count:1};var a,u;var f=0;while(true){try{a=le.IteratorStep(n);if(a===false){e.done=true;break}u=a.value}catch(s){e.done=true;throw s}o[f]=void 0;var c=t.resolve(u);var l=P(f,o,r,i);i.count+=1;w(c.then,c,l,r.reject);f+=1}if(--i.count===0){var p=r.resolve;p(o)}return r.promise};var x=function(e,t,r){var n=e.iterator;var o,i,a;while(true){try{o=le.IteratorStep(n);if(o===false){e.done=true;break}i=o.value}catch(u){e.done=true;throw u}a=t.resolve(i);w(a.then,a,r.resolve,r.reject)}return r.promise};b(E,{all:function all(e){var t=this;if(!le.TypeIsObject(t)){throw new TypeError("Promise is not object")}var n=new r(t);var o,i;try{o=le.GetIterator(e);i={iterator:o,done:false};return C(i,t,n)}catch(a){var u=a;if(i&&!i.done){try{le.IteratorClose(o,true)}catch(f){u=f}}var s=n.reject;s(u);return n.promise}},race:function race(e){var t=this;if(!le.TypeIsObject(t)){throw new TypeError("Promise is not object")}var n=new r(t);var o,i;try{o=le.GetIterator(e);i={iterator:o,done:false};return x(i,t,n)}catch(a){var u=a;if(i&&!i.done){try{le.IteratorClose(o,true)}catch(f){u=f}}var s=n.reject;s(u);return n.promise}},reject:function reject(e){var t=this;if(!le.TypeIsObject(t)){throw new TypeError("Bad promise constructor")}var n=new r(t);var o=n.reject;o(e);return n.promise},resolve:function resolve(e){var t=this;if(!le.TypeIsObject(t)){throw new TypeError("Bad promise constructor")}if(le.IsPromise(e)){var n=e.constructor;if(n===t){return e}}var o=new r(t);var i=o.resolve;i(e);return o.promise}});b(T,{"catch":function(e){return this.then(null,e)},then:function then(e,t){var n=this;if(!le.IsPromise(n)){throw new TypeError("not a promise")}var o=le.SpeciesConstructor(n,E);var i;var b=arguments.length>2&&arguments[2]===y;if(b&&o===E){i=y}else{i=new r(o)}var g=le.IsCallable(e)?e:a;var d=le.IsCallable(t)?t:u;var m=n._promise;var O;if(m.state===f){if(m.reactionLength===0){m.fulfillReactionHandler0=g;m.rejectReactionHandler0=d;m.reactionCapability0=i}else{var w=3*(m.reactionLength-1);m[w+l]=g;m[w+p]=d;m[w+v]=i}m.reactionLength+=1}else if(m.state===s){O=m.result;h(g,i,O)}else if(m.state===c){O=m.result;h(d,i,O)}else{throw new TypeError("unexpected Promise state")}return i.promise}});y=new r(E);I=T.then;return E}();if(S.Promise){delete S.Promise.accept;delete S.Promise.defer;delete S.Promise.prototype.chain}if(typeof zr==="function"){b(S,{Promise:zr});var qr=w(S.Promise,function(e){return e.resolve(42).then(function(){})instanceof e});var Wr=!i(function(){return S.Promise.reject(42).then(null,5).then(null,G)});var Gr=i(function(){return S.Promise.call(3,G)});var Hr=function(e){var t=e.resolve(5);t.constructor={};var r=e.resolve(t);try{r.then(null,G).then(null,G)}catch(n){return true}return t===r}(S.Promise);var Vr=s&&function(){var e=0;var t=Object.defineProperty({},"then",{get:function(){e+=1}});Promise.resolve(t);return e===1}();var Br=function BadResolverPromise(e){var t=new Promise(e);e(3,function(){});this.then=t.then;this.constructor=BadResolverPromise};Br.prototype=Promise.prototype;Br.all=Promise.all;var Ur=a(function(){return!!Br.all([1,2])});if(!qr||!Wr||!Gr||Hr||!Vr||Ur){Promise=zr;oe(S,"Promise",zr)}if(Promise.all.length!==1){var $r=Promise.all;oe(Promise,"all",function all(e){return le.Call($r,this,arguments)})}if(Promise.race.length!==1){var Jr=Promise.race;oe(Promise,"race",function race(e){return le.Call(Jr,this,arguments)})}if(Promise.resolve.length!==1){var Xr=Promise.resolve;oe(Promise,"resolve",function resolve(e){return le.Call(Xr,this,arguments)})}if(Promise.reject.length!==1){var Kr=Promise.reject;oe(Promise,"reject",function reject(e){return le.Call(Kr,this,arguments)})}Nt(Promise,"all");Nt(Promise,"race");Nt(Promise,"resolve");Nt(Promise,"reject");Me(Promise)}var Zr=function(e){var t=n(p(e,function(e,t){e[t]=true;return e},{}));return e.join(":")===t.join(":")};var Yr=Zr(["z","a","bb"]);var Qr=Zr(["z",1,"a","3",2]);if(s){var en=function fastkey(e,t){if(!t&&!Yr){return null}if(ce(e)){return"^"+le.ToString(e)}else if(typeof e==="string"){return"$"+e}else if(typeof e==="number"){if(!Qr){return"n"+e}return e}else if(typeof e==="boolean"){return"b"+e}return null};var tn=function emptyObject(){return Object.create?Object.create(null):{}};var rn=function addIterableToMap(e,n,o){if(r(o)||ne.string(o)){l(o,function(e){if(!le.TypeIsObject(e)){throw new TypeError("Iterator value "+e+" is not an entry object")}n.set(e[0],e[1])})}else if(o instanceof e){t(e.prototype.forEach,o,function(e,t){n.set(t,e)})}else{var i,a;if(!ce(o)){a=n.set;if(!le.IsCallable(a)){throw new TypeError("bad map")}i=le.GetIterator(o)}if(typeof i!=="undefined"){while(true){var u=le.IteratorStep(i);if(u===false){break}var f=u.value;try{if(!le.TypeIsObject(f)){throw new TypeError("Iterator value "+f+" is not an entry object")}t(a,n,f[0],f[1])}catch(s){le.IteratorClose(i,true);throw s}}}}};var nn=function addIterableToSet(e,n,o){if(r(o)||ne.string(o)){l(o,function(e){n.add(e)})}else if(o instanceof e){t(e.prototype.forEach,o,function(e){n.add(e)})}else{var i,a;if(!ce(o)){a=n.add;if(!le.IsCallable(a)){throw new TypeError("bad set")}i=le.GetIterator(o)}if(typeof i!=="undefined"){while(true){var u=le.IteratorStep(i);if(u===false){break}var f=u.value;try{t(a,n,f)}catch(s){le.IteratorClose(i,true);throw s}}}}};var on={Map:function(){var e={};var r=function MapEntry(e,t){this.key=e;this.value=t;this.next=null;this.prev=null};r.prototype.isRemoved=function isRemoved(){return this.key===e};var n=function isMap(e){return!!e._es6map};var o=function requireMapSlot(e,t){if(!le.TypeIsObject(e)||!n(e)){throw new TypeError("Method Map.prototype."+t+" called on incompatible receiver "+le.ToString(e))}};var i=function MapIterator(e,t){o(e,"[[MapIterator]]");h(this,"head",e._head);h(this,"i",this.head);h(this,"kind",t)};i.prototype={isMapIterator:true,next:function next(){if(!this.isMapIterator){throw new TypeError("Not a MapIterator")}var e=this.i;var t=this.kind;var r=this.head;if(typeof this.i==="undefined"){return Ze()}while(e.isRemoved()&&e!==r){e=e.prev}var n;while(e.next!==r){e=e.next;if(!e.isRemoved()){if(t==="key"){n=e.key}else if(t==="value"){n=e.value}else{n=[e.key,e.value]}this.i=e;return Ze(n)}}this.i=void 0;return Ze()}};xe(i.prototype);var a;var u=function Map(){if(!(this instanceof Map)){throw new TypeError('Constructor Map requires "new"')}if(this&&this._es6map){throw new TypeError("Bad construction")}var e=_e(this,Map,a,{_es6map:true,_head:null,_map:H?new H:null,_size:0,_storage:tn()});var t=new r(null,null);t.next=t.prev=t;e._head=t;if(arguments.length>0){rn(Map,e,arguments[0])}return e};a=u.prototype;m.getter(a,"size",function(){if(typeof this._size==="undefined"){throw new TypeError("size method called on incompatible Map")}return this._size});b(a,{get:function get(e){o(this,"get");var t;var r=en(e,true);if(r!==null){t=this._storage[r];if(t){return t.value}return}if(this._map){t=B.call(this._map,e);if(t){return t.value}return}var n=this._head;var i=n;while((i=i.next)!==n){if(le.SameValueZero(i.key,e)){return i.value}}},has:function has(e){o(this,"has");var t=en(e,true);if(t!==null){return typeof this._storage[t]!=="undefined"}if(this._map){return U.call(this._map,e)}var r=this._head;var n=r;while((n=n.next)!==r){if(le.SameValueZero(n.key,e)){return true}}return false},set:function set(e,t){o(this,"set");var n=this._head;var i=n;var a;var u=en(e,true);if(u!==null){if(typeof this._storage[u]!=="undefined"){this._storage[u].value=t;return this}a=this._storage[u]=new r(e,t);i=n.prev}else if(this._map){if(U.call(this._map,e)){B.call(this._map,e).value=t}else{a=new r(e,t);$.call(this._map,e,a);i=n.prev}}while((i=i.next)!==n){if(le.SameValueZero(i.key,e)){i.value=t;return this}}a=a||new r(e,t);if(le.SameValue(-0,e)){a.key=+0}a.next=this._head;a.prev=this._head.prev;a.prev.next=a;a.next.prev=a;this._size+=1;return this},"delete":function(t){o(this,"delete");var r=this._head;var n=r;var i=en(t,true);if(i!==null){if(typeof this._storage[i]==="undefined"){return false}n=this._storage[i].prev;delete this._storage[i]}else if(this._map){if(!U.call(this._map,t)){return false}n=B.call(this._map,t).prev;V.call(this._map,t)}while((n=n.next)!==r){if(le.SameValueZero(n.key,t)){n.key=e;n.value=e;n.prev.next=n.next;n.next.prev=n.prev;this._size-=1;return true}}return false},clear:function clear(){o(this,"clear");this._map=H?new H:null;this._size=0;this._storage=tn();var t=this._head;var r=t;var n=r.next;while((r=n)!==t){r.key=e;r.value=e;n=r.next;r.next=r.prev=t}t.next=t.prev=t},keys:function keys(){o(this,"keys");return new i(this,"key")},values:function values(){o(this,"values");return new i(this,"value")},entries:function entries(){o(this,"entries");return new i(this,"key+value")},forEach:function forEach(e){o(this,"forEach");var r=arguments.length>1?arguments[1]:null;var n=this.entries();for(var i=n.next();!i.done;i=n.next()){if(r){t(e,r,i.value[1],i.value[0],this)}else{e(i.value[1],i.value[0],this)}}}});xe(a,a.entries);return u}(),Set:function(){var e=function isSet(e){return e._es6set&&typeof e._storage!=="undefined"};var r=function requireSetSlot(t,r){if(!le.TypeIsObject(t)||!e(t)){throw new TypeError("Set.prototype."+r+" called on incompatible receiver "+le.ToString(t))}};var o;var i=function Set(){if(!(this instanceof Set)){throw new TypeError('Constructor Set requires "new"')}if(this&&this._es6set){throw new TypeError("Bad construction")}var e=_e(this,Set,o,{_es6set:true,"[[SetData]]":null,_storage:tn()});if(!e._es6set){throw new TypeError("bad set")}if(arguments.length>0){nn(Set,e,arguments[0])}return e};o=i.prototype;var a=function(e){var t=e;if(t==="^null"){return null}else if(t==="^undefined"){return void 0}var r=t.charAt(0);if(r==="$"){return C(t,1)}else if(r==="n"){return+C(t,1)}else if(r==="b"){return t==="btrue"}return+t};var u=function ensureMap(e){if(!e["[[SetData]]"]){var t=new on.Map;e["[[SetData]]"]=t;l(n(e._storage),function(e){var r=a(e);t.set(r,r)});e["[[SetData]]"]=t}e._storage=null};m.getter(i.prototype,"size",function(){r(this,"size");if(this._storage){return n(this._storage).length}u(this);return this["[[SetData]]"].size});b(i.prototype,{has:function has(e){r(this,"has");var t;if(this._storage&&(t=en(e))!==null){return!!this._storage[t]}u(this);return this["[[SetData]]"].has(e)},add:function add(e){r(this,"add");var t;if(this._storage&&(t=en(e))!==null){this._storage[t]=true;return this}u(this);this["[[SetData]]"].set(e,e);return this},"delete":function(e){r(this,"delete");var t;if(this._storage&&(t=en(e))!==null){var n=q(this._storage,t);return delete this._storage[t]&&n}u(this);return this["[[SetData]]"]["delete"](e)},clear:function clear(){r(this,"clear");if(this._storage){this._storage=tn()}if(this["[[SetData]]"]){this["[[SetData]]"].clear()}},values:function values(){r(this,"values");u(this);return new f(this["[[SetData]]"].values())},entries:function entries(){r(this,"entries");u(this);return new f(this["[[SetData]]"].entries())},forEach:function forEach(e){r(this,"forEach");var n=arguments.length>1?arguments[1]:null;var o=this;u(o);this["[[SetData]]"].forEach(function(r,i){if(n){t(e,n,i,i,o)}else{e(i,i,o)}})}});h(i.prototype,"keys",i.prototype.values,true);xe(i.prototype,i.prototype.values);var f=function SetIterator(e){h(this,"it",e)};f.prototype={isSetIterator:true,next:function next(){if(!this.isSetIterator){throw new TypeError("Not a SetIterator")}return this.it.next()}};xe(f.prototype);return i}()};var an=S.Set&&!Set.prototype["delete"]&&Set.prototype.remove&&Set.prototype.items&&Set.prototype.map&&Array.isArray((new Set).keys);if(an){S.Set=on.Set}if(S.Map||S.Set){var un=a(function(){return new Map([[1,2]]).get(1)===2});if(!un){S.Map=function Map(){if(!(this instanceof Map)){throw new TypeError('Constructor Map requires "new"')}var e=new H;if(arguments.length>0){rn(Map,e,arguments[0])}delete e.constructor;Object.setPrototypeOf(e,S.Map.prototype);return e};S.Map.prototype=O(H.prototype);h(S.Map.prototype,"constructor",S.Map,true);m.preserveToString(S.Map,H)}var fn=new Map;var sn=function(){var e=new Map([[1,0],[2,0],[3,0],[4,0]]);e.set(-0,e);return e.get(0)===e&&e.get(-0)===e&&e.has(0)&&e.has(-0)}();var cn=fn.set(1,2)===fn;if(!sn||!cn){oe(Map.prototype,"set",function set(e,r){t($,this,e===0?0:e,r);return this})}if(!sn){b(Map.prototype,{get:function get(e){return t(B,this,e===0?0:e)},has:function has(e){return t(U,this,e===0?0:e)}},true);m.preserveToString(Map.prototype.get,B);m.preserveToString(Map.prototype.has,U)}var ln=new Set;var pn=Set.prototype["delete"]&&Set.prototype.add&&Set.prototype.has&&function(e){e["delete"](0);e.add(-0);return!e.has(0)}(ln);var vn=ln.add(1)===ln;if(!pn||!vn){var yn=Set.prototype.add;Set.prototype.add=function add(e){t(yn,this,e===0?0:e);return this};m.preserveToString(Set.prototype.add,yn)}if(!pn){var hn=Set.prototype.has;Set.prototype.has=function has(e){return t(hn,this,e===0?0:e)};m.preserveToString(Set.prototype.has,hn);var bn=Set.prototype["delete"];Set.prototype["delete"]=function SetDelete(e){return t(bn,this,e===0?0:e)};m.preserveToString(Set.prototype["delete"],bn)}var gn=w(S.Map,function(e){var t=new e([]);t.set(42,42);return t instanceof e});var dn=Object.setPrototypeOf&&!gn;var mn=function(){try{return!(S.Map()instanceof S.Map)}catch(e){return e instanceof TypeError}}();if(S.Map.length!==0||dn||!mn){S.Map=function Map(){if(!(this instanceof Map)){throw new TypeError('Constructor Map requires "new"')}var e=new H;if(arguments.length>0){rn(Map,e,arguments[0])}delete e.constructor;Object.setPrototypeOf(e,Map.prototype);return e};S.Map.prototype=H.prototype;h(S.Map.prototype,"constructor",S.Map,true);m.preserveToString(S.Map,H)}var On=w(S.Set,function(e){var t=new e([]);t.add(42,42);return t instanceof e});var wn=Object.setPrototypeOf&&!On;var jn=function(){try{return!(S.Set()instanceof S.Set)}catch(e){return e instanceof TypeError}}();if(S.Set.length!==0||wn||!jn){var Sn=S.Set;S.Set=function Set(){if(!(this instanceof Set)){throw new TypeError('Constructor Set requires "new"')}var e=new Sn;if(arguments.length>0){nn(Set,e,arguments[0])}delete e.constructor;Object.setPrototypeOf(e,Set.prototype);return e};S.Set.prototype=Sn.prototype;h(S.Set.prototype,"constructor",S.Set,true);m.preserveToString(S.Set,Sn)}var Tn=new S.Map;var In=!a(function(){return Tn.keys().next().done});if(typeof S.Map.prototype.clear!=="function"||(new S.Set).size!==0||Tn.size!==0||typeof S.Map.prototype.keys!=="function"||typeof S.Set.prototype.keys!=="function"||typeof S.Map.prototype.forEach!=="function"||typeof S.Set.prototype.forEach!=="function"||u(S.Map)||u(S.Set)||typeof Tn.keys().next!=="function"||In||!gn){b(S,{Map:on.Map,Set:on.Set},true)}if(S.Set.prototype.keys!==S.Set.prototype.values){h(S.Set.prototype,"keys",S.Set.prototype.values,true)}xe(Object.getPrototypeOf((new S.Map).keys()));xe(Object.getPrototypeOf((new S.Set).keys()));if(c&&S.Set.prototype.has.name!=="has"){var En=S.Set.prototype.has;oe(S.Set.prototype,"has",function has(e){return t(En,this,e)})}}b(S,on);Me(S.Map);Me(S.Set)}var Pn=function throwUnlessTargetIsObject(e){if(!le.TypeIsObject(e)){throw new TypeError("target must be an object")}};var Cn={apply:function apply(){return le.Call(le.Call,null,arguments)},construct:function construct(e,t){if(!le.IsConstructor(e)){throw new TypeError("First argument must be a constructor.")}var r=arguments.length>2?arguments[2]:e;if(!le.IsConstructor(r)){throw new TypeError("new.target must be a constructor.")}return le.Construct(e,t,r,"internal")},deleteProperty:function deleteProperty(e,t){Pn(e);if(s){var r=Object.getOwnPropertyDescriptor(e,t);if(r&&!r.configurable){return false}}return delete e[t]},has:function has(e,t){Pn(e);return t in e}};if(Object.getOwnPropertyNames){Object.assign(Cn,{ownKeys:function ownKeys(e){Pn(e);var t=Object.getOwnPropertyNames(e);if(le.IsCallable(Object.getOwnPropertySymbols)){x(t,Object.getOwnPropertySymbols(e))}return t}})}var Mn=function ConvertExceptionToBoolean(e){return!i(e)};if(Object.preventExtensions){Object.assign(Cn,{isExtensible:function isExtensible(e){Pn(e);return Object.isExtensible(e)},preventExtensions:function preventExtensions(e){Pn(e);return Mn(function(){return Object.preventExtensions(e)})}})}if(s){var xn=function get(e,t,r){var n=Object.getOwnPropertyDescriptor(e,t);if(!n){var o=Object.getPrototypeOf(e);if(o===null){return void 0}return xn(o,t,r)}if("value"in n){return n.value}if(n.get){return le.Call(n.get,r)}return void 0};var Nn=function set(e,r,n,o){var i=Object.getOwnPropertyDescriptor(e,r);if(!i){var a=Object.getPrototypeOf(e);if(a!==null){return Nn(a,r,n,o)}i={value:void 0,writable:true,enumerable:true,configurable:true}}if("value"in i){if(!i.writable){return false}if(!le.TypeIsObject(o)){return false}var u=Object.getOwnPropertyDescriptor(o,r);if(u){return ue.defineProperty(o,r,{value:n})}return ue.defineProperty(o,r,{value:n,writable:true,enumerable:true,configurable:true})}if(i.set){t(i.set,o,n);return true}return false};Object.assign(Cn,{defineProperty:function defineProperty(e,t,r){Pn(e);return Mn(function(){return Object.defineProperty(e,t,r)})},getOwnPropertyDescriptor:function getOwnPropertyDescriptor(e,t){Pn(e);return Object.getOwnPropertyDescriptor(e,t)},get:function get(e,t){Pn(e);var r=arguments.length>2?arguments[2]:e;return xn(e,t,r)},set:function set(e,t,r){Pn(e);var n=arguments.length>3?arguments[3]:e;return Nn(e,t,r,n)}})}if(Object.getPrototypeOf){var An=Object.getPrototypeOf;Cn.getPrototypeOf=function getPrototypeOf(e){Pn(e);return An(e)}}if(Object.setPrototypeOf&&Cn.getPrototypeOf){var _n=function(e,t){var r=t;while(r){if(e===r){return true}r=Cn.getPrototypeOf(r)}return false};Object.assign(Cn,{setPrototypeOf:function setPrototypeOf(e,t){Pn(e);if(t!==null&&!le.TypeIsObject(t)){throw new TypeError("proto must be an object or null")}if(t===ue.getPrototypeOf(e)){return true}if(ue.isExtensible&&!ue.isExtensible(e)){return false}if(_n(e,t)){return false}Object.setPrototypeOf(e,t);return true}})}var Rn=function(e,t){if(!le.IsCallable(S.Reflect[e])){h(S.Reflect,e,t)}else{var r=a(function(){S.Reflect[e](1);S.Reflect[e](NaN);S.Reflect[e](true);return true});if(r){oe(S.Reflect,e,t)}}};Object.keys(Cn).forEach(function(e){Rn(e,Cn[e])});var kn=S.Reflect.getPrototypeOf;if(c&&kn&&kn.name!=="getPrototypeOf"){oe(S.Reflect,"getPrototypeOf",function getPrototypeOf(e){return t(kn,S.Reflect,e)})}if(S.Reflect.setPrototypeOf){if(a(function(){S.Reflect.setPrototypeOf(1,{});return true})){oe(S.Reflect,"setPrototypeOf",Cn.setPrototypeOf)}}if(S.Reflect.defineProperty){if(!a(function(){var e=!S.Reflect.defineProperty(1,"test",{value:1});var t=typeof Object.preventExtensions!=="function"||!S.Reflect.defineProperty(Object.preventExtensions({}),"test",{});return e&&t})){oe(S.Reflect,"defineProperty",Cn.defineProperty)}}if(S.Reflect.construct){if(!a(function(){var e=function F(){};return S.Reflect.construct(function(){},[],e)instanceof e})){oe(S.Reflect,"construct",Cn.construct)}}if(String(new Date(NaN))!=="Invalid Date"){var Ln=Date.prototype.toString;var Fn=function toString(){var e=+this;if(e!==e){return"Invalid Date"}return le.Call(Ln,this)};oe(Date.prototype,"toString",Fn)}var Dn={anchor:function anchor(e){return le.CreateHTML(this,"a","name",e)},big:function big(){return le.CreateHTML(this,"big","","")},blink:function blink(){return le.CreateHTML(this,"blink","","")},bold:function bold(){return le.CreateHTML(this,"b","","")},fixed:function fixed(){return le.CreateHTML(this,"tt","","")},fontcolor:function fontcolor(e){return le.CreateHTML(this,"font","color",e)},fontsize:function fontsize(e){return le.CreateHTML(this,"font","size",e)},italics:function italics(){return le.CreateHTML(this,"i","","")},link:function link(e){return le.CreateHTML(this,"a","href",e)},small:function small(){return le.CreateHTML(this,"small","","")},strike:function strike(){return le.CreateHTML(this,"strike","","")},sub:function sub(){return le.CreateHTML(this,"sub","","")},sup:function sub(){return le.CreateHTML(this,"sup","","")}};l(Object.keys(Dn),function(e){var r=String.prototype[e];var n=false;if(le.IsCallable(r)){var o=t(r,"",' " ');var i=P([],o.match(/"/g)).length;n=o!==o.toLowerCase()||i>2}else{n=true}if(n){oe(String.prototype,e,Dn[e])}});var zn=function(){if(!ie){return false}var e=typeof JSON==="object"&&typeof JSON.stringify==="function"?JSON.stringify:null;if(!e){return false}if(typeof e(J())!=="undefined"){return true}if(e([J()])!=="[null]"){return true}var t={a:J()};t[J()]=true;if(e(t)!=="{}"){return true}return false}();var qn=a(function(){if(!ie){return true}return JSON.stringify(Object(J()))==="{}"&&JSON.stringify([Object(J())])==="[{}]"});if(zn||!qn){var Wn=JSON.stringify;oe(JSON,"stringify",function stringify(e){if(typeof e==="symbol"){return}var n;if(arguments.length>1){n=arguments[1]}var o=[e];if(!r(n)){var i=le.IsCallable(n)?n:null;var a=function(e,r){var n=i?t(i,this,e,r):r;if(typeof n!=="symbol"){if(ne.symbol(n)){return _t({})(n)}return n}};o.push(a)}else{o.push(n)}if(arguments.length>2){o.push(arguments[2])}return Wn.apply(this,o)})}return S});
//# sourceMappingURL=es6-shim.map
/*! jQuery v3.7.1 | (c) OpenJS Foundation and other contributors | jquery.org/license */
!function(e,t){"use strict";"object"==typeof module&&"object"==typeof module.exports?module.exports=e.document?t(e,!0):function(e){if(!e.document)throw new Error("jQuery requires a window with a document");return t(e)}:t(e)}("undefined"!=typeof window?window:this,function(ie,e){"use strict";var oe=[],r=Object.getPrototypeOf,ae=oe.slice,g=oe.flat?function(e){return oe.flat.call(e)}:function(e){return oe.concat.apply([],e)},s=oe.push,se=oe.indexOf,n={},i=n.toString,ue=n.hasOwnProperty,o=ue.toString,a=o.call(Object),le={},v=function(e){return"function"==typeof e&&"number"!=typeof e.nodeType&&"function"!=typeof e.item},y=function(e){return null!=e&&e===e.window},C=ie.document,u={type:!0,src:!0,nonce:!0,noModule:!0};function m(e,t,n){var r,i,o=(n=n||C).createElement("script");if(o.text=e,t)for(r in u)(i=t[r]||t.getAttribute&&t.getAttribute(r))&&o.setAttribute(r,i);n.head.appendChild(o).parentNode.removeChild(o)}function x(e){return null==e?e+"":"object"==typeof e||"function"==typeof e?n[i.call(e)]||"object":typeof e}var t="3.7.1",l=/HTML$/i,ce=function(e,t){return new ce.fn.init(e,t)};function c(e){var t=!!e&&"length"in e&&e.length,n=x(e);return!v(e)&&!y(e)&&("array"===n||0===t||"number"==typeof t&&0<t&&t-1 in e)}function fe(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()}ce.fn=ce.prototype={jquery:t,constructor:ce,length:0,toArray:function(){return ae.call(this)},get:function(e){return null==e?ae.call(this):e<0?this[e+this.length]:this[e]},pushStack:function(e){var t=ce.merge(this.constructor(),e);return t.prevObject=this,t},each:function(e){return ce.each(this,e)},map:function(n){return this.pushStack(ce.map(this,function(e,t){return n.call(e,t,e)}))},slice:function(){return this.pushStack(ae.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},even:function(){return this.pushStack(ce.grep(this,function(e,t){return(t+1)%2}))},odd:function(){return this.pushStack(ce.grep(this,function(e,t){return t%2}))},eq:function(e){var t=this.length,n=+e+(e<0?t:0);return this.pushStack(0<=n&&n<t?[this[n]]:[])},end:function(){return this.prevObject||this.constructor()},push:s,sort:oe.sort,splice:oe.splice},ce.extend=ce.fn.extend=function(){var e,t,n,r,i,o,a=arguments[0]||{},s=1,u=arguments.length,l=!1;for("boolean"==typeof a&&(l=a,a=arguments[s]||{},s++),"object"==typeof a||v(a)||(a={}),s===u&&(a=this,s--);s<u;s++)if(null!=(e=arguments[s]))for(t in e)r=e[t],"__proto__"!==t&&a!==r&&(l&&r&&(ce.isPlainObject(r)||(i=Array.isArray(r)))?(n=a[t],o=i&&!Array.isArray(n)?[]:i||ce.isPlainObject(n)?n:{},i=!1,a[t]=ce.extend(l,o,r)):void 0!==r&&(a[t]=r));return a},ce.extend({expando:"jQuery"+(t+Math.random()).replace(/\D/g,""),isReady:!0,error:function(e){throw new Error(e)},noop:function(){},isPlainObject:function(e){var t,n;return!(!e||"[object Object]"!==i.call(e))&&(!(t=r(e))||"function"==typeof(n=ue.call(t,"constructor")&&t.constructor)&&o.call(n)===a)},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},globalEval:function(e,t,n){m(e,{nonce:t&&t.nonce},n)},each:function(e,t){var n,r=0;if(c(e)){for(n=e.length;r<n;r++)if(!1===t.call(e[r],r,e[r]))break}else for(r in e)if(!1===t.call(e[r],r,e[r]))break;return e},text:function(e){var t,n="",r=0,i=e.nodeType;if(!i)while(t=e[r++])n+=ce.text(t);return 1===i||11===i?e.textContent:9===i?e.documentElement.textContent:3===i||4===i?e.nodeValue:n},makeArray:function(e,t){var n=t||[];return null!=e&&(c(Object(e))?ce.merge(n,"string"==typeof e?[e]:e):s.call(n,e)),n},inArray:function(e,t,n){return null==t?-1:se.call(t,e,n)},isXMLDoc:function(e){var t=e&&e.namespaceURI,n=e&&(e.ownerDocument||e).documentElement;return!l.test(t||n&&n.nodeName||"HTML")},merge:function(e,t){for(var n=+t.length,r=0,i=e.length;r<n;r++)e[i++]=t[r];return e.length=i,e},grep:function(e,t,n){for(var r=[],i=0,o=e.length,a=!n;i<o;i++)!t(e[i],i)!==a&&r.push(e[i]);return r},map:function(e,t,n){var r,i,o=0,a=[];if(c(e))for(r=e.length;o<r;o++)null!=(i=t(e[o],o,n))&&a.push(i);else for(o in e)null!=(i=t(e[o],o,n))&&a.push(i);return g(a)},guid:1,support:le}),"function"==typeof Symbol&&(ce.fn[Symbol.iterator]=oe[Symbol.iterator]),ce.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(e,t){n["[object "+t+"]"]=t.toLowerCase()});var pe=oe.pop,de=oe.sort,he=oe.splice,ge="[\\x20\\t\\r\\n\\f]",ve=new RegExp("^"+ge+"+|((?:^|[^\\\\])(?:\\\\.)*)"+ge+"+$","g");ce.contains=function(e,t){var n=t&&t.parentNode;return e===n||!(!n||1!==n.nodeType||!(e.contains?e.contains(n):e.compareDocumentPosition&&16&e.compareDocumentPosition(n)))};var f=/([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g;function p(e,t){return t?"\0"===e?"\ufffd":e.slice(0,-1)+"\\"+e.charCodeAt(e.length-1).toString(16)+" ":"\\"+e}ce.escapeSelector=function(e){return(e+"").replace(f,p)};var ye=C,me=s;!function(){var e,b,w,o,a,T,r,C,d,i,k=me,S=ce.expando,E=0,n=0,s=W(),c=W(),u=W(),h=W(),l=function(e,t){return e===t&&(a=!0),0},f="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",t="(?:\\\\[\\da-fA-F]{1,6}"+ge+"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+",p="\\["+ge+"*("+t+")(?:"+ge+"*([*^$|!~]?=)"+ge+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+t+"))|)"+ge+"*\\]",g=":("+t+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+p+")*)|.*)\\)|)",v=new RegExp(ge+"+","g"),y=new RegExp("^"+ge+"*,"+ge+"*"),m=new RegExp("^"+ge+"*([>+~]|"+ge+")"+ge+"*"),x=new RegExp(ge+"|>"),j=new RegExp(g),A=new RegExp("^"+t+"$"),D={ID:new RegExp("^#("+t+")"),CLASS:new RegExp("^\\.("+t+")"),TAG:new RegExp("^("+t+"|[*])"),ATTR:new RegExp("^"+p),PSEUDO:new RegExp("^"+g),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+ge+"*(even|odd|(([+-]|)(\\d*)n|)"+ge+"*(?:([+-]|)"+ge+"*(\\d+)|))"+ge+"*\\)|)","i"),bool:new RegExp("^(?:"+f+")$","i"),needsContext:new RegExp("^"+ge+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+ge+"*((?:-\\d)?\\d*)"+ge+"*\\)|)(?=[^-]|$)","i")},N=/^(?:input|select|textarea|button)$/i,q=/^h\d$/i,L=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,H=/[+~]/,O=new RegExp("\\\\[\\da-fA-F]{1,6}"+ge+"?|\\\\([^\\r\\n\\f])","g"),P=function(e,t){var n="0x"+e.slice(1)-65536;return t||(n<0?String.fromCharCode(n+65536):String.fromCharCode(n>>10|55296,1023&n|56320))},M=function(){V()},R=J(function(e){return!0===e.disabled&&fe(e,"fieldset")},{dir:"parentNode",next:"legend"});try{k.apply(oe=ae.call(ye.childNodes),ye.childNodes),oe[ye.childNodes.length].nodeType}catch(e){k={apply:function(e,t){me.apply(e,ae.call(t))},call:function(e){me.apply(e,ae.call(arguments,1))}}}function I(t,e,n,r){var i,o,a,s,u,l,c,f=e&&e.ownerDocument,p=e?e.nodeType:9;if(n=n||[],"string"!=typeof t||!t||1!==p&&9!==p&&11!==p)return n;if(!r&&(V(e),e=e||T,C)){if(11!==p&&(u=L.exec(t)))if(i=u[1]){if(9===p){if(!(a=e.getElementById(i)))return n;if(a.id===i)return k.call(n,a),n}else if(f&&(a=f.getElementById(i))&&I.contains(e,a)&&a.id===i)return k.call(n,a),n}else{if(u[2])return k.apply(n,e.getElementsByTagName(t)),n;if((i=u[3])&&e.getElementsByClassName)return k.apply(n,e.getElementsByClassName(i)),n}if(!(h[t+" "]||d&&d.test(t))){if(c=t,f=e,1===p&&(x.test(t)||m.test(t))){(f=H.test(t)&&U(e.parentNode)||e)==e&&le.scope||((s=e.getAttribute("id"))?s=ce.escapeSelector(s):e.setAttribute("id",s=S)),o=(l=Y(t)).length;while(o--)l[o]=(s?"#"+s:":scope")+" "+Q(l[o]);c=l.join(",")}try{return k.apply(n,f.querySelectorAll(c)),n}catch(e){h(t,!0)}finally{s===S&&e.removeAttribute("id")}}}return re(t.replace(ve,"$1"),e,n,r)}function W(){var r=[];return function e(t,n){return r.push(t+" ")>b.cacheLength&&delete e[r.shift()],e[t+" "]=n}}function F(e){return e[S]=!0,e}function $(e){var t=T.createElement("fieldset");try{return!!e(t)}catch(e){return!1}finally{t.parentNode&&t.parentNode.removeChild(t),t=null}}function B(t){return function(e){return fe(e,"input")&&e.type===t}}function _(t){return function(e){return(fe(e,"input")||fe(e,"button"))&&e.type===t}}function z(t){return function(e){return"form"in e?e.parentNode&&!1===e.disabled?"label"in e?"label"in e.parentNode?e.parentNode.disabled===t:e.disabled===t:e.isDisabled===t||e.isDisabled!==!t&&R(e)===t:e.disabled===t:"label"in e&&e.disabled===t}}function X(a){return F(function(o){return o=+o,F(function(e,t){var n,r=a([],e.length,o),i=r.length;while(i--)e[n=r[i]]&&(e[n]=!(t[n]=e[n]))})})}function U(e){return e&&"undefined"!=typeof e.getElementsByTagName&&e}function V(e){var t,n=e?e.ownerDocument||e:ye;return n!=T&&9===n.nodeType&&n.documentElement&&(r=(T=n).documentElement,C=!ce.isXMLDoc(T),i=r.matches||r.webkitMatchesSelector||r.msMatchesSelector,r.msMatchesSelector&&ye!=T&&(t=T.defaultView)&&t.top!==t&&t.addEventListener("unload",M),le.getById=$(function(e){return r.appendChild(e).id=ce.expando,!T.getElementsByName||!T.getElementsByName(ce.expando).length}),le.disconnectedMatch=$(function(e){return i.call(e,"*")}),le.scope=$(function(){return T.querySelectorAll(":scope")}),le.cssHas=$(function(){try{return T.querySelector(":has(*,:jqfake)"),!1}catch(e){return!0}}),le.getById?(b.filter.ID=function(e){var t=e.replace(O,P);return function(e){return e.getAttribute("id")===t}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&C){var n=t.getElementById(e);return n?[n]:[]}}):(b.filter.ID=function(e){var n=e.replace(O,P);return function(e){var t="undefined"!=typeof e.getAttributeNode&&e.getAttributeNode("id");return t&&t.value===n}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&C){var n,r,i,o=t.getElementById(e);if(o){if((n=o.getAttributeNode("id"))&&n.value===e)return[o];i=t.getElementsByName(e),r=0;while(o=i[r++])if((n=o.getAttributeNode("id"))&&n.value===e)return[o]}return[]}}),b.find.TAG=function(e,t){return"undefined"!=typeof t.getElementsByTagName?t.getElementsByTagName(e):t.querySelectorAll(e)},b.find.CLASS=function(e,t){if("undefined"!=typeof t.getElementsByClassName&&C)return t.getElementsByClassName(e)},d=[],$(function(e){var t;r.appendChild(e).innerHTML="<a id='"+S+"' href='' disabled='disabled'></a><select id='"+S+"-\r\\' disabled='disabled'><option selected=''></option></select>",e.querySelectorAll("[selected]").length||d.push("\\["+ge+"*(?:value|"+f+")"),e.querySelectorAll("[id~="+S+"-]").length||d.push("~="),e.querySelectorAll("a#"+S+"+*").length||d.push(".#.+[+~]"),e.querySelectorAll(":checked").length||d.push(":checked"),(t=T.createElement("input")).setAttribute("type","hidden"),e.appendChild(t).setAttribute("name","D"),r.appendChild(e).disabled=!0,2!==e.querySelectorAll(":disabled").length&&d.push(":enabled",":disabled"),(t=T.createElement("input")).setAttribute("name",""),e.appendChild(t),e.querySelectorAll("[name='']").length||d.push("\\["+ge+"*name"+ge+"*="+ge+"*(?:''|\"\")")}),le.cssHas||d.push(":has"),d=d.length&&new RegExp(d.join("|")),l=function(e,t){if(e===t)return a=!0,0;var n=!e.compareDocumentPosition-!t.compareDocumentPosition;return n||(1&(n=(e.ownerDocument||e)==(t.ownerDocument||t)?e.compareDocumentPosition(t):1)||!le.sortDetached&&t.compareDocumentPosition(e)===n?e===T||e.ownerDocument==ye&&I.contains(ye,e)?-1:t===T||t.ownerDocument==ye&&I.contains(ye,t)?1:o?se.call(o,e)-se.call(o,t):0:4&n?-1:1)}),T}for(e in I.matches=function(e,t){return I(e,null,null,t)},I.matchesSelector=function(e,t){if(V(e),C&&!h[t+" "]&&(!d||!d.test(t)))try{var n=i.call(e,t);if(n||le.disconnectedMatch||e.document&&11!==e.document.nodeType)return n}catch(e){h(t,!0)}return 0<I(t,T,null,[e]).length},I.contains=function(e,t){return(e.ownerDocument||e)!=T&&V(e),ce.contains(e,t)},I.attr=function(e,t){(e.ownerDocument||e)!=T&&V(e);var n=b.attrHandle[t.toLowerCase()],r=n&&ue.call(b.attrHandle,t.toLowerCase())?n(e,t,!C):void 0;return void 0!==r?r:e.getAttribute(t)},I.error=function(e){throw new Error("Syntax error, unrecognized expression: "+e)},ce.uniqueSort=function(e){var t,n=[],r=0,i=0;if(a=!le.sortStable,o=!le.sortStable&&ae.call(e,0),de.call(e,l),a){while(t=e[i++])t===e[i]&&(r=n.push(i));while(r--)he.call(e,n[r],1)}return o=null,e},ce.fn.uniqueSort=function(){return this.pushStack(ce.uniqueSort(ae.apply(this)))},(b=ce.expr={cacheLength:50,createPseudo:F,match:D,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(O,P),e[3]=(e[3]||e[4]||e[5]||"").replace(O,P),"~="===e[2]&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),"nth"===e[1].slice(0,3)?(e[3]||I.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*("even"===e[3]||"odd"===e[3])),e[5]=+(e[7]+e[8]||"odd"===e[3])):e[3]&&I.error(e[0]),e},PSEUDO:function(e){var t,n=!e[6]&&e[2];return D.CHILD.test(e[0])?null:(e[3]?e[2]=e[4]||e[5]||"":n&&j.test(n)&&(t=Y(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){var t=e.replace(O,P).toLowerCase();return"*"===e?function(){return!0}:function(e){return fe(e,t)}},CLASS:function(e){var t=s[e+" "];return t||(t=new RegExp("(^|"+ge+")"+e+"("+ge+"|$)"))&&s(e,function(e){return t.test("string"==typeof e.className&&e.className||"undefined"!=typeof e.getAttribute&&e.getAttribute("class")||"")})},ATTR:function(n,r,i){return function(e){var t=I.attr(e,n);return null==t?"!="===r:!r||(t+="","="===r?t===i:"!="===r?t!==i:"^="===r?i&&0===t.indexOf(i):"*="===r?i&&-1<t.indexOf(i):"$="===r?i&&t.slice(-i.length)===i:"~="===r?-1<(" "+t.replace(v," ")+" ").indexOf(i):"|="===r&&(t===i||t.slice(0,i.length+1)===i+"-"))}},CHILD:function(d,e,t,h,g){var v="nth"!==d.slice(0,3),y="last"!==d.slice(-4),m="of-type"===e;return 1===h&&0===g?function(e){return!!e.parentNode}:function(e,t,n){var r,i,o,a,s,u=v!==y?"nextSibling":"previousSibling",l=e.parentNode,c=m&&e.nodeName.toLowerCase(),f=!n&&!m,p=!1;if(l){if(v){while(u){o=e;while(o=o[u])if(m?fe(o,c):1===o.nodeType)return!1;s=u="only"===d&&!s&&"nextSibling"}return!0}if(s=[y?l.firstChild:l.lastChild],y&&f){p=(a=(r=(i=l[S]||(l[S]={}))[d]||[])[0]===E&&r[1])&&r[2],o=a&&l.childNodes[a];while(o=++a&&o&&o[u]||(p=a=0)||s.pop())if(1===o.nodeType&&++p&&o===e){i[d]=[E,a,p];break}}else if(f&&(p=a=(r=(i=e[S]||(e[S]={}))[d]||[])[0]===E&&r[1]),!1===p)while(o=++a&&o&&o[u]||(p=a=0)||s.pop())if((m?fe(o,c):1===o.nodeType)&&++p&&(f&&((i=o[S]||(o[S]={}))[d]=[E,p]),o===e))break;return(p-=g)===h||p%h==0&&0<=p/h}}},PSEUDO:function(e,o){var t,a=b.pseudos[e]||b.setFilters[e.toLowerCase()]||I.error("unsupported pseudo: "+e);return a[S]?a(o):1<a.length?(t=[e,e,"",o],b.setFilters.hasOwnProperty(e.toLowerCase())?F(function(e,t){var n,r=a(e,o),i=r.length;while(i--)e[n=se.call(e,r[i])]=!(t[n]=r[i])}):function(e){return a(e,0,t)}):a}},pseudos:{not:F(function(e){var r=[],i=[],s=ne(e.replace(ve,"$1"));return s[S]?F(function(e,t,n,r){var i,o=s(e,null,r,[]),a=e.length;while(a--)(i=o[a])&&(e[a]=!(t[a]=i))}):function(e,t,n){return r[0]=e,s(r,null,n,i),r[0]=null,!i.pop()}}),has:F(function(t){return function(e){return 0<I(t,e).length}}),contains:F(function(t){return t=t.replace(O,P),function(e){return-1<(e.textContent||ce.text(e)).indexOf(t)}}),lang:F(function(n){return A.test(n||"")||I.error("unsupported lang: "+n),n=n.replace(O,P).toLowerCase(),function(e){var t;do{if(t=C?e.lang:e.getAttribute("xml:lang")||e.getAttribute("lang"))return(t=t.toLowerCase())===n||0===t.indexOf(n+"-")}while((e=e.parentNode)&&1===e.nodeType);return!1}}),target:function(e){var t=ie.location&&ie.location.hash;return t&&t.slice(1)===e.id},root:function(e){return e===r},focus:function(e){return e===function(){try{return T.activeElement}catch(e){}}()&&T.hasFocus()&&!!(e.type||e.href||~e.tabIndex)},enabled:z(!1),disabled:z(!0),checked:function(e){return fe(e,"input")&&!!e.checked||fe(e,"option")&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,!0===e.selected},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeType<6)return!1;return!0},parent:function(e){return!b.pseudos.empty(e)},header:function(e){return q.test(e.nodeName)},input:function(e){return N.test(e.nodeName)},button:function(e){return fe(e,"input")&&"button"===e.type||fe(e,"button")},text:function(e){var t;return fe(e,"input")&&"text"===e.type&&(null==(t=e.getAttribute("type"))||"text"===t.toLowerCase())},first:X(function(){return[0]}),last:X(function(e,t){return[t-1]}),eq:X(function(e,t,n){return[n<0?n+t:n]}),even:X(function(e,t){for(var n=0;n<t;n+=2)e.push(n);return e}),odd:X(function(e,t){for(var n=1;n<t;n+=2)e.push(n);return e}),lt:X(function(e,t,n){var r;for(r=n<0?n+t:t<n?t:n;0<=--r;)e.push(r);return e}),gt:X(function(e,t,n){for(var r=n<0?n+t:n;++r<t;)e.push(r);return e})}}).pseudos.nth=b.pseudos.eq,{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})b.pseudos[e]=B(e);for(e in{submit:!0,reset:!0})b.pseudos[e]=_(e);function G(){}function Y(e,t){var n,r,i,o,a,s,u,l=c[e+" "];if(l)return t?0:l.slice(0);a=e,s=[],u=b.preFilter;while(a){for(o in n&&!(r=y.exec(a))||(r&&(a=a.slice(r[0].length)||a),s.push(i=[])),n=!1,(r=m.exec(a))&&(n=r.shift(),i.push({value:n,type:r[0].replace(ve," ")}),a=a.slice(n.length)),b.filter)!(r=D[o].exec(a))||u[o]&&!(r=u[o](r))||(n=r.shift(),i.push({value:n,type:o,matches:r}),a=a.slice(n.length));if(!n)break}return t?a.length:a?I.error(e):c(e,s).slice(0)}function Q(e){for(var t=0,n=e.length,r="";t<n;t++)r+=e[t].value;return r}function J(a,e,t){var s=e.dir,u=e.next,l=u||s,c=t&&"parentNode"===l,f=n++;return e.first?function(e,t,n){while(e=e[s])if(1===e.nodeType||c)return a(e,t,n);return!1}:function(e,t,n){var r,i,o=[E,f];if(n){while(e=e[s])if((1===e.nodeType||c)&&a(e,t,n))return!0}else while(e=e[s])if(1===e.nodeType||c)if(i=e[S]||(e[S]={}),u&&fe(e,u))e=e[s]||e;else{if((r=i[l])&&r[0]===E&&r[1]===f)return o[2]=r[2];if((i[l]=o)[2]=a(e,t,n))return!0}return!1}}function K(i){return 1<i.length?function(e,t,n){var r=i.length;while(r--)if(!i[r](e,t,n))return!1;return!0}:i[0]}function Z(e,t,n,r,i){for(var o,a=[],s=0,u=e.length,l=null!=t;s<u;s++)(o=e[s])&&(n&&!n(o,r,i)||(a.push(o),l&&t.push(s)));return a}function ee(d,h,g,v,y,e){return v&&!v[S]&&(v=ee(v)),y&&!y[S]&&(y=ee(y,e)),F(function(e,t,n,r){var i,o,a,s,u=[],l=[],c=t.length,f=e||function(e,t,n){for(var r=0,i=t.length;r<i;r++)I(e,t[r],n);return n}(h||"*",n.nodeType?[n]:n,[]),p=!d||!e&&h?f:Z(f,u,d,n,r);if(g?g(p,s=y||(e?d:c||v)?[]:t,n,r):s=p,v){i=Z(s,l),v(i,[],n,r),o=i.length;while(o--)(a=i[o])&&(s[l[o]]=!(p[l[o]]=a))}if(e){if(y||d){if(y){i=[],o=s.length;while(o--)(a=s[o])&&i.push(p[o]=a);y(null,s=[],i,r)}o=s.length;while(o--)(a=s[o])&&-1<(i=y?se.call(e,a):u[o])&&(e[i]=!(t[i]=a))}}else s=Z(s===t?s.splice(c,s.length):s),y?y(null,t,s,r):k.apply(t,s)})}function te(e){for(var i,t,n,r=e.length,o=b.relative[e[0].type],a=o||b.relative[" "],s=o?1:0,u=J(function(e){return e===i},a,!0),l=J(function(e){return-1<se.call(i,e)},a,!0),c=[function(e,t,n){var r=!o&&(n||t!=w)||((i=t).nodeType?u(e,t,n):l(e,t,n));return i=null,r}];s<r;s++)if(t=b.relative[e[s].type])c=[J(K(c),t)];else{if((t=b.filter[e[s].type].apply(null,e[s].matches))[S]){for(n=++s;n<r;n++)if(b.relative[e[n].type])break;return ee(1<s&&K(c),1<s&&Q(e.slice(0,s-1).concat({value:" "===e[s-2].type?"*":""})).replace(ve,"$1"),t,s<n&&te(e.slice(s,n)),n<r&&te(e=e.slice(n)),n<r&&Q(e))}c.push(t)}return K(c)}function ne(e,t){var n,v,y,m,x,r,i=[],o=[],a=u[e+" "];if(!a){t||(t=Y(e)),n=t.length;while(n--)(a=te(t[n]))[S]?i.push(a):o.push(a);(a=u(e,(v=o,m=0<(y=i).length,x=0<v.length,r=function(e,t,n,r,i){var o,a,s,u=0,l="0",c=e&&[],f=[],p=w,d=e||x&&b.find.TAG("*",i),h=E+=null==p?1:Math.random()||.1,g=d.length;for(i&&(w=t==T||t||i);l!==g&&null!=(o=d[l]);l++){if(x&&o){a=0,t||o.ownerDocument==T||(V(o),n=!C);while(s=v[a++])if(s(o,t||T,n)){k.call(r,o);break}i&&(E=h)}m&&((o=!s&&o)&&u--,e&&c.push(o))}if(u+=l,m&&l!==u){a=0;while(s=y[a++])s(c,f,t,n);if(e){if(0<u)while(l--)c[l]||f[l]||(f[l]=pe.call(r));f=Z(f)}k.apply(r,f),i&&!e&&0<f.length&&1<u+y.length&&ce.uniqueSort(r)}return i&&(E=h,w=p),c},m?F(r):r))).selector=e}return a}function re(e,t,n,r){var i,o,a,s,u,l="function"==typeof e&&e,c=!r&&Y(e=l.selector||e);if(n=n||[],1===c.length){if(2<(o=c[0]=c[0].slice(0)).length&&"ID"===(a=o[0]).type&&9===t.nodeType&&C&&b.relative[o[1].type]){if(!(t=(b.find.ID(a.matches[0].replace(O,P),t)||[])[0]))return n;l&&(t=t.parentNode),e=e.slice(o.shift().value.length)}i=D.needsContext.test(e)?0:o.length;while(i--){if(a=o[i],b.relative[s=a.type])break;if((u=b.find[s])&&(r=u(a.matches[0].replace(O,P),H.test(o[0].type)&&U(t.parentNode)||t))){if(o.splice(i,1),!(e=r.length&&Q(o)))return k.apply(n,r),n;break}}}return(l||ne(e,c))(r,t,!C,n,!t||H.test(e)&&U(t.parentNode)||t),n}G.prototype=b.filters=b.pseudos,b.setFilters=new G,le.sortStable=S.split("").sort(l).join("")===S,V(),le.sortDetached=$(function(e){return 1&e.compareDocumentPosition(T.createElement("fieldset"))}),ce.find=I,ce.expr[":"]=ce.expr.pseudos,ce.unique=ce.uniqueSort,I.compile=ne,I.select=re,I.setDocument=V,I.tokenize=Y,I.escape=ce.escapeSelector,I.getText=ce.text,I.isXML=ce.isXMLDoc,I.selectors=ce.expr,I.support=ce.support,I.uniqueSort=ce.uniqueSort}();var d=function(e,t,n){var r=[],i=void 0!==n;while((e=e[t])&&9!==e.nodeType)if(1===e.nodeType){if(i&&ce(e).is(n))break;r.push(e)}return r},h=function(e,t){for(var n=[];e;e=e.nextSibling)1===e.nodeType&&e!==t&&n.push(e);return n},b=ce.expr.match.needsContext,w=/^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;function T(e,n,r){return v(n)?ce.grep(e,function(e,t){return!!n.call(e,t,e)!==r}):n.nodeType?ce.grep(e,function(e){return e===n!==r}):"string"!=typeof n?ce.grep(e,function(e){return-1<se.call(n,e)!==r}):ce.filter(n,e,r)}ce.filter=function(e,t,n){var r=t[0];return n&&(e=":not("+e+")"),1===t.length&&1===r.nodeType?ce.find.matchesSelector(r,e)?[r]:[]:ce.find.matches(e,ce.grep(t,function(e){return 1===e.nodeType}))},ce.fn.extend({find:function(e){var t,n,r=this.length,i=this;if("string"!=typeof e)return this.pushStack(ce(e).filter(function(){for(t=0;t<r;t++)if(ce.contains(i[t],this))return!0}));for(n=this.pushStack([]),t=0;t<r;t++)ce.find(e,i[t],n);return 1<r?ce.uniqueSort(n):n},filter:function(e){return this.pushStack(T(this,e||[],!1))},not:function(e){return this.pushStack(T(this,e||[],!0))},is:function(e){return!!T(this,"string"==typeof e&&b.test(e)?ce(e):e||[],!1).length}});var k,S=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;(ce.fn.init=function(e,t,n){var r,i;if(!e)return this;if(n=n||k,"string"==typeof e){if(!(r="<"===e[0]&&">"===e[e.length-1]&&3<=e.length?[null,e,null]:S.exec(e))||!r[1]&&t)return!t||t.jquery?(t||n).find(e):this.constructor(t).find(e);if(r[1]){if(t=t instanceof ce?t[0]:t,ce.merge(this,ce.parseHTML(r[1],t&&t.nodeType?t.ownerDocument||t:C,!0)),w.test(r[1])&&ce.isPlainObject(t))for(r in t)v(this[r])?this[r](t[r]):this.attr(r,t[r]);return this}return(i=C.getElementById(r[2]))&&(this[0]=i,this.length=1),this}return e.nodeType?(this[0]=e,this.length=1,this):v(e)?void 0!==n.ready?n.ready(e):e(ce):ce.makeArray(e,this)}).prototype=ce.fn,k=ce(C);var E=/^(?:parents|prev(?:Until|All))/,j={children:!0,contents:!0,next:!0,prev:!0};function A(e,t){while((e=e[t])&&1!==e.nodeType);return e}ce.fn.extend({has:function(e){var t=ce(e,this),n=t.length;return this.filter(function(){for(var e=0;e<n;e++)if(ce.contains(this,t[e]))return!0})},closest:function(e,t){var n,r=0,i=this.length,o=[],a="string"!=typeof e&&ce(e);if(!b.test(e))for(;r<i;r++)for(n=this[r];n&&n!==t;n=n.parentNode)if(n.nodeType<11&&(a?-1<a.index(n):1===n.nodeType&&ce.find.matchesSelector(n,e))){o.push(n);break}return this.pushStack(1<o.length?ce.uniqueSort(o):o)},index:function(e){return e?"string"==typeof e?se.call(ce(e),this[0]):se.call(this,e.jquery?e[0]:e):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){return this.pushStack(ce.uniqueSort(ce.merge(this.get(),ce(e,t))))},addBack:function(e){return this.add(null==e?this.prevObject:this.prevObject.filter(e))}}),ce.each({parent:function(e){var t=e.parentNode;return t&&11!==t.nodeType?t:null},parents:function(e){return d(e,"parentNode")},parentsUntil:function(e,t,n){return d(e,"parentNode",n)},next:function(e){return A(e,"nextSibling")},prev:function(e){return A(e,"previousSibling")},nextAll:function(e){return d(e,"nextSibling")},prevAll:function(e){return d(e,"previousSibling")},nextUntil:function(e,t,n){return d(e,"nextSibling",n)},prevUntil:function(e,t,n){return d(e,"previousSibling",n)},siblings:function(e){return h((e.parentNode||{}).firstChild,e)},children:function(e){return h(e.firstChild)},contents:function(e){return null!=e.contentDocument&&r(e.contentDocument)?e.contentDocument:(fe(e,"template")&&(e=e.content||e),ce.merge([],e.childNodes))}},function(r,i){ce.fn[r]=function(e,t){var n=ce.map(this,i,e);return"Until"!==r.slice(-5)&&(t=e),t&&"string"==typeof t&&(n=ce.filter(t,n)),1<this.length&&(j[r]||ce.uniqueSort(n),E.test(r)&&n.reverse()),this.pushStack(n)}});var D=/[^\x20\t\r\n\f]+/g;function N(e){return e}function q(e){throw e}function L(e,t,n,r){var i;try{e&&v(i=e.promise)?i.call(e).done(t).fail(n):e&&v(i=e.then)?i.call(e,t,n):t.apply(void 0,[e].slice(r))}catch(e){n.apply(void 0,[e])}}ce.Callbacks=function(r){var e,n;r="string"==typeof r?(e=r,n={},ce.each(e.match(D)||[],function(e,t){n[t]=!0}),n):ce.extend({},r);var i,t,o,a,s=[],u=[],l=-1,c=function(){for(a=a||r.once,o=i=!0;u.length;l=-1){t=u.shift();while(++l<s.length)!1===s[l].apply(t[0],t[1])&&r.stopOnFalse&&(l=s.length,t=!1)}r.memory||(t=!1),i=!1,a&&(s=t?[]:"")},f={add:function(){return s&&(t&&!i&&(l=s.length-1,u.push(t)),function n(e){ce.each(e,function(e,t){v(t)?r.unique&&f.has(t)||s.push(t):t&&t.length&&"string"!==x(t)&&n(t)})}(arguments),t&&!i&&c()),this},remove:function(){return ce.each(arguments,function(e,t){var n;while(-1<(n=ce.inArray(t,s,n)))s.splice(n,1),n<=l&&l--}),this},has:function(e){return e?-1<ce.inArray(e,s):0<s.length},empty:function(){return s&&(s=[]),this},disable:function(){return a=u=[],s=t="",this},disabled:function(){return!s},lock:function(){return a=u=[],t||i||(s=t=""),this},locked:function(){return!!a},fireWith:function(e,t){return a||(t=[e,(t=t||[]).slice?t.slice():t],u.push(t),i||c()),this},fire:function(){return f.fireWith(this,arguments),this},fired:function(){return!!o}};return f},ce.extend({Deferred:function(e){var o=[["notify","progress",ce.Callbacks("memory"),ce.Callbacks("memory"),2],["resolve","done",ce.Callbacks("once memory"),ce.Callbacks("once memory"),0,"resolved"],["reject","fail",ce.Callbacks("once memory"),ce.Callbacks("once memory"),1,"rejected"]],i="pending",a={state:function(){return i},always:function(){return s.done(arguments).fail(arguments),this},"catch":function(e){return a.then(null,e)},pipe:function(){var i=arguments;return ce.Deferred(function(r){ce.each(o,function(e,t){var n=v(i[t[4]])&&i[t[4]];s[t[1]](function(){var e=n&&n.apply(this,arguments);e&&v(e.promise)?e.promise().progress(r.notify).done(r.resolve).fail(r.reject):r[t[0]+"With"](this,n?[e]:arguments)})}),i=null}).promise()},then:function(t,n,r){var u=0;function l(i,o,a,s){return function(){var n=this,r=arguments,e=function(){var e,t;if(!(i<u)){if((e=a.apply(n,r))===o.promise())throw new TypeError("Thenable self-resolution");t=e&&("object"==typeof e||"function"==typeof e)&&e.then,v(t)?s?t.call(e,l(u,o,N,s),l(u,o,q,s)):(u++,t.call(e,l(u,o,N,s),l(u,o,q,s),l(u,o,N,o.notifyWith))):(a!==N&&(n=void 0,r=[e]),(s||o.resolveWith)(n,r))}},t=s?e:function(){try{e()}catch(e){ce.Deferred.exceptionHook&&ce.Deferred.exceptionHook(e,t.error),u<=i+1&&(a!==q&&(n=void 0,r=[e]),o.rejectWith(n,r))}};i?t():(ce.Deferred.getErrorHook?t.error=ce.Deferred.getErrorHook():ce.Deferred.getStackHook&&(t.error=ce.Deferred.getStackHook()),ie.setTimeout(t))}}return ce.Deferred(function(e){o[0][3].add(l(0,e,v(r)?r:N,e.notifyWith)),o[1][3].add(l(0,e,v(t)?t:N)),o[2][3].add(l(0,e,v(n)?n:q))}).promise()},promise:function(e){return null!=e?ce.extend(e,a):a}},s={};return ce.each(o,function(e,t){var n=t[2],r=t[5];a[t[1]]=n.add,r&&n.add(function(){i=r},o[3-e][2].disable,o[3-e][3].disable,o[0][2].lock,o[0][3].lock),n.add(t[3].fire),s[t[0]]=function(){return s[t[0]+"With"](this===s?void 0:this,arguments),this},s[t[0]+"With"]=n.fireWith}),a.promise(s),e&&e.call(s,s),s},when:function(e){var n=arguments.length,t=n,r=Array(t),i=ae.call(arguments),o=ce.Deferred(),a=function(t){return function(e){r[t]=this,i[t]=1<arguments.length?ae.call(arguments):e,--n||o.resolveWith(r,i)}};if(n<=1&&(L(e,o.done(a(t)).resolve,o.reject,!n),"pending"===o.state()||v(i[t]&&i[t].then)))return o.then();while(t--)L(i[t],a(t),o.reject);return o.promise()}});var H=/^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;ce.Deferred.exceptionHook=function(e,t){ie.console&&ie.console.warn&&e&&H.test(e.name)&&ie.console.warn("jQuery.Deferred exception: "+e.message,e.stack,t)},ce.readyException=function(e){ie.setTimeout(function(){throw e})};var O=ce.Deferred();function P(){C.removeEventListener("DOMContentLoaded",P),ie.removeEventListener("load",P),ce.ready()}ce.fn.ready=function(e){return O.then(e)["catch"](function(e){ce.readyException(e)}),this},ce.extend({isReady:!1,readyWait:1,ready:function(e){(!0===e?--ce.readyWait:ce.isReady)||(ce.isReady=!0)!==e&&0<--ce.readyWait||O.resolveWith(C,[ce])}}),ce.ready.then=O.then,"complete"===C.readyState||"loading"!==C.readyState&&!C.documentElement.doScroll?ie.setTimeout(ce.ready):(C.addEventListener("DOMContentLoaded",P),ie.addEventListener("load",P));var M=function(e,t,n,r,i,o,a){var s=0,u=e.length,l=null==n;if("object"===x(n))for(s in i=!0,n)M(e,t,s,n[s],!0,o,a);else if(void 0!==r&&(i=!0,v(r)||(a=!0),l&&(a?(t.call(e,r),t=null):(l=t,t=function(e,t,n){return l.call(ce(e),n)})),t))for(;s<u;s++)t(e[s],n,a?r:r.call(e[s],s,t(e[s],n)));return i?e:l?t.call(e):u?t(e[0],n):o},R=/^-ms-/,I=/-([a-z])/g;function W(e,t){return t.toUpperCase()}function F(e){return e.replace(R,"ms-").replace(I,W)}var $=function(e){return 1===e.nodeType||9===e.nodeType||!+e.nodeType};function B(){this.expando=ce.expando+B.uid++}B.uid=1,B.prototype={cache:function(e){var t=e[this.expando];return t||(t={},$(e)&&(e.nodeType?e[this.expando]=t:Object.defineProperty(e,this.expando,{value:t,configurable:!0}))),t},set:function(e,t,n){var r,i=this.cache(e);if("string"==typeof t)i[F(t)]=n;else for(r in t)i[F(r)]=t[r];return i},get:function(e,t){return void 0===t?this.cache(e):e[this.expando]&&e[this.expando][F(t)]},access:function(e,t,n){return void 0===t||t&&"string"==typeof t&&void 0===n?this.get(e,t):(this.set(e,t,n),void 0!==n?n:t)},remove:function(e,t){var n,r=e[this.expando];if(void 0!==r){if(void 0!==t){n=(t=Array.isArray(t)?t.map(F):(t=F(t))in r?[t]:t.match(D)||[]).length;while(n--)delete r[t[n]]}(void 0===t||ce.isEmptyObject(r))&&(e.nodeType?e[this.expando]=void 0:delete e[this.expando])}},hasData:function(e){var t=e[this.expando];return void 0!==t&&!ce.isEmptyObject(t)}};var _=new B,z=new B,X=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,U=/[A-Z]/g;function V(e,t,n){var r,i;if(void 0===n&&1===e.nodeType)if(r="data-"+t.replace(U,"-$&").toLowerCase(),"string"==typeof(n=e.getAttribute(r))){try{n="true"===(i=n)||"false"!==i&&("null"===i?null:i===+i+""?+i:X.test(i)?JSON.parse(i):i)}catch(e){}z.set(e,t,n)}else n=void 0;return n}ce.extend({hasData:function(e){return z.hasData(e)||_.hasData(e)},data:function(e,t,n){return z.access(e,t,n)},removeData:function(e,t){z.remove(e,t)},_data:function(e,t,n){return _.access(e,t,n)},_removeData:function(e,t){_.remove(e,t)}}),ce.fn.extend({data:function(n,e){var t,r,i,o=this[0],a=o&&o.attributes;if(void 0===n){if(this.length&&(i=z.get(o),1===o.nodeType&&!_.get(o,"hasDataAttrs"))){t=a.length;while(t--)a[t]&&0===(r=a[t].name).indexOf("data-")&&(r=F(r.slice(5)),V(o,r,i[r]));_.set(o,"hasDataAttrs",!0)}return i}return"object"==typeof n?this.each(function(){z.set(this,n)}):M(this,function(e){var t;if(o&&void 0===e)return void 0!==(t=z.get(o,n))?t:void 0!==(t=V(o,n))?t:void 0;this.each(function(){z.set(this,n,e)})},null,e,1<arguments.length,null,!0)},removeData:function(e){return this.each(function(){z.remove(this,e)})}}),ce.extend({queue:function(e,t,n){var r;if(e)return t=(t||"fx")+"queue",r=_.get(e,t),n&&(!r||Array.isArray(n)?r=_.access(e,t,ce.makeArray(n)):r.push(n)),r||[]},dequeue:function(e,t){t=t||"fx";var n=ce.queue(e,t),r=n.length,i=n.shift(),o=ce._queueHooks(e,t);"inprogress"===i&&(i=n.shift(),r--),i&&("fx"===t&&n.unshift("inprogress"),delete o.stop,i.call(e,function(){ce.dequeue(e,t)},o)),!r&&o&&o.empty.fire()},_queueHooks:function(e,t){var n=t+"queueHooks";return _.get(e,n)||_.access(e,n,{empty:ce.Callbacks("once memory").add(function(){_.remove(e,[t+"queue",n])})})}}),ce.fn.extend({queue:function(t,n){var e=2;return"string"!=typeof t&&(n=t,t="fx",e--),arguments.length<e?ce.queue(this[0],t):void 0===n?this:this.each(function(){var e=ce.queue(this,t,n);ce._queueHooks(this,t),"fx"===t&&"inprogress"!==e[0]&&ce.dequeue(this,t)})},dequeue:function(e){return this.each(function(){ce.dequeue(this,e)})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,t){var n,r=1,i=ce.Deferred(),o=this,a=this.length,s=function(){--r||i.resolveWith(o,[o])};"string"!=typeof e&&(t=e,e=void 0),e=e||"fx";while(a--)(n=_.get(o[a],e+"queueHooks"))&&n.empty&&(r++,n.empty.add(s));return s(),i.promise(t)}});var G=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,Y=new RegExp("^(?:([+-])=|)("+G+")([a-z%]*)$","i"),Q=["Top","Right","Bottom","Left"],J=C.documentElement,K=function(e){return ce.contains(e.ownerDocument,e)},Z={composed:!0};J.getRootNode&&(K=function(e){return ce.contains(e.ownerDocument,e)||e.getRootNode(Z)===e.ownerDocument});var ee=function(e,t){return"none"===(e=t||e).style.display||""===e.style.display&&K(e)&&"none"===ce.css(e,"display")};function te(e,t,n,r){var i,o,a=20,s=r?function(){return r.cur()}:function(){return ce.css(e,t,"")},u=s(),l=n&&n[3]||(ce.cssNumber[t]?"":"px"),c=e.nodeType&&(ce.cssNumber[t]||"px"!==l&&+u)&&Y.exec(ce.css(e,t));if(c&&c[3]!==l){u/=2,l=l||c[3],c=+u||1;while(a--)ce.style(e,t,c+l),(1-o)*(1-(o=s()/u||.5))<=0&&(a=0),c/=o;c*=2,ce.style(e,t,c+l),n=n||[]}return n&&(c=+c||+u||0,i=n[1]?c+(n[1]+1)*n[2]:+n[2],r&&(r.unit=l,r.start=c,r.end=i)),i}var ne={};function re(e,t){for(var n,r,i,o,a,s,u,l=[],c=0,f=e.length;c<f;c++)(r=e[c]).style&&(n=r.style.display,t?("none"===n&&(l[c]=_.get(r,"display")||null,l[c]||(r.style.display="")),""===r.style.display&&ee(r)&&(l[c]=(u=a=o=void 0,a=(i=r).ownerDocument,s=i.nodeName,(u=ne[s])||(o=a.body.appendChild(a.createElement(s)),u=ce.css(o,"display"),o.parentNode.removeChild(o),"none"===u&&(u="block"),ne[s]=u)))):"none"!==n&&(l[c]="none",_.set(r,"display",n)));for(c=0;c<f;c++)null!=l[c]&&(e[c].style.display=l[c]);return e}ce.fn.extend({show:function(){return re(this,!0)},hide:function(){return re(this)},toggle:function(e){return"boolean"==typeof e?e?this.show():this.hide():this.each(function(){ee(this)?ce(this).show():ce(this).hide()})}});var xe,be,we=/^(?:checkbox|radio)$/i,Te=/<([a-z][^\/\0>\x20\t\r\n\f]*)/i,Ce=/^$|^module$|\/(?:java|ecma)script/i;xe=C.createDocumentFragment().appendChild(C.createElement("div")),(be=C.createElement("input")).setAttribute("type","radio"),be.setAttribute("checked","checked"),be.setAttribute("name","t"),xe.appendChild(be),le.checkClone=xe.cloneNode(!0).cloneNode(!0).lastChild.checked,xe.innerHTML="<textarea>x</textarea>",le.noCloneChecked=!!xe.cloneNode(!0).lastChild.defaultValue,xe.innerHTML="<option></option>",le.option=!!xe.lastChild;var ke={thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};function Se(e,t){var n;return n="undefined"!=typeof e.getElementsByTagName?e.getElementsByTagName(t||"*"):"undefined"!=typeof e.querySelectorAll?e.querySelectorAll(t||"*"):[],void 0===t||t&&fe(e,t)?ce.merge([e],n):n}function Ee(e,t){for(var n=0,r=e.length;n<r;n++)_.set(e[n],"globalEval",!t||_.get(t[n],"globalEval"))}ke.tbody=ke.tfoot=ke.colgroup=ke.caption=ke.thead,ke.th=ke.td,le.option||(ke.optgroup=ke.option=[1,"<select multiple='multiple'>","</select>"]);var je=/<|&#?\w+;/;function Ae(e,t,n,r,i){for(var o,a,s,u,l,c,f=t.createDocumentFragment(),p=[],d=0,h=e.length;d<h;d++)if((o=e[d])||0===o)if("object"===x(o))ce.merge(p,o.nodeType?[o]:o);else if(je.test(o)){a=a||f.appendChild(t.createElement("div")),s=(Te.exec(o)||["",""])[1].toLowerCase(),u=ke[s]||ke._default,a.innerHTML=u[1]+ce.htmlPrefilter(o)+u[2],c=u[0];while(c--)a=a.lastChild;ce.merge(p,a.childNodes),(a=f.firstChild).textContent=""}else p.push(t.createTextNode(o));f.textContent="",d=0;while(o=p[d++])if(r&&-1<ce.inArray(o,r))i&&i.push(o);else if(l=K(o),a=Se(f.appendChild(o),"script"),l&&Ee(a),n){c=0;while(o=a[c++])Ce.test(o.type||"")&&n.push(o)}return f}var De=/^([^.]*)(?:\.(.+)|)/;function Ne(){return!0}function qe(){return!1}function Le(e,t,n,r,i,o){var a,s;if("object"==typeof t){for(s in"string"!=typeof n&&(r=r||n,n=void 0),t)Le(e,s,n,r,t[s],o);return e}if(null==r&&null==i?(i=n,r=n=void 0):null==i&&("string"==typeof n?(i=r,r=void 0):(i=r,r=n,n=void 0)),!1===i)i=qe;else if(!i)return e;return 1===o&&(a=i,(i=function(e){return ce().off(e),a.apply(this,arguments)}).guid=a.guid||(a.guid=ce.guid++)),e.each(function(){ce.event.add(this,t,i,r,n)})}function He(e,r,t){t?(_.set(e,r,!1),ce.event.add(e,r,{namespace:!1,handler:function(e){var t,n=_.get(this,r);if(1&e.isTrigger&&this[r]){if(n)(ce.event.special[r]||{}).delegateType&&e.stopPropagation();else if(n=ae.call(arguments),_.set(this,r,n),this[r](),t=_.get(this,r),_.set(this,r,!1),n!==t)return e.stopImmediatePropagation(),e.preventDefault(),t}else n&&(_.set(this,r,ce.event.trigger(n[0],n.slice(1),this)),e.stopPropagation(),e.isImmediatePropagationStopped=Ne)}})):void 0===_.get(e,r)&&ce.event.add(e,r,Ne)}ce.event={global:{},add:function(t,e,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=_.get(t);if($(t)){n.handler&&(n=(o=n).handler,i=o.selector),i&&ce.find.matchesSelector(J,i),n.guid||(n.guid=ce.guid++),(u=v.events)||(u=v.events=Object.create(null)),(a=v.handle)||(a=v.handle=function(e){return"undefined"!=typeof ce&&ce.event.triggered!==e.type?ce.event.dispatch.apply(t,arguments):void 0}),l=(e=(e||"").match(D)||[""]).length;while(l--)d=g=(s=De.exec(e[l])||[])[1],h=(s[2]||"").split(".").sort(),d&&(f=ce.event.special[d]||{},d=(i?f.delegateType:f.bindType)||d,f=ce.event.special[d]||{},c=ce.extend({type:d,origType:g,data:r,handler:n,guid:n.guid,selector:i,needsContext:i&&ce.expr.match.needsContext.test(i),namespace:h.join(".")},o),(p=u[d])||((p=u[d]=[]).delegateCount=0,f.setup&&!1!==f.setup.call(t,r,h,a)||t.addEventListener&&t.addEventListener(d,a)),f.add&&(f.add.call(t,c),c.handler.guid||(c.handler.guid=n.guid)),i?p.splice(p.delegateCount++,0,c):p.push(c),ce.event.global[d]=!0)}},remove:function(e,t,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=_.hasData(e)&&_.get(e);if(v&&(u=v.events)){l=(t=(t||"").match(D)||[""]).length;while(l--)if(d=g=(s=De.exec(t[l])||[])[1],h=(s[2]||"").split(".").sort(),d){f=ce.event.special[d]||{},p=u[d=(r?f.delegateType:f.bindType)||d]||[],s=s[2]&&new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"),a=o=p.length;while(o--)c=p[o],!i&&g!==c.origType||n&&n.guid!==c.guid||s&&!s.test(c.namespace)||r&&r!==c.selector&&("**"!==r||!c.selector)||(p.splice(o,1),c.selector&&p.delegateCount--,f.remove&&f.remove.call(e,c));a&&!p.length&&(f.teardown&&!1!==f.teardown.call(e,h,v.handle)||ce.removeEvent(e,d,v.handle),delete u[d])}else for(d in u)ce.event.remove(e,d+t[l],n,r,!0);ce.isEmptyObject(u)&&_.remove(e,"handle events")}},dispatch:function(e){var t,n,r,i,o,a,s=new Array(arguments.length),u=ce.event.fix(e),l=(_.get(this,"events")||Object.create(null))[u.type]||[],c=ce.event.special[u.type]||{};for(s[0]=u,t=1;t<arguments.length;t++)s[t]=arguments[t];if(u.delegateTarget=this,!c.preDispatch||!1!==c.preDispatch.call(this,u)){a=ce.event.handlers.call(this,u,l),t=0;while((i=a[t++])&&!u.isPropagationStopped()){u.currentTarget=i.elem,n=0;while((o=i.handlers[n++])&&!u.isImmediatePropagationStopped())u.rnamespace&&!1!==o.namespace&&!u.rnamespace.test(o.namespace)||(u.handleObj=o,u.data=o.data,void 0!==(r=((ce.event.special[o.origType]||{}).handle||o.handler).apply(i.elem,s))&&!1===(u.result=r)&&(u.preventDefault(),u.stopPropagation()))}return c.postDispatch&&c.postDispatch.call(this,u),u.result}},handlers:function(e,t){var n,r,i,o,a,s=[],u=t.delegateCount,l=e.target;if(u&&l.nodeType&&!("click"===e.type&&1<=e.button))for(;l!==this;l=l.parentNode||this)if(1===l.nodeType&&("click"!==e.type||!0!==l.disabled)){for(o=[],a={},n=0;n<u;n++)void 0===a[i=(r=t[n]).selector+" "]&&(a[i]=r.needsContext?-1<ce(i,this).index(l):ce.find(i,this,null,[l]).length),a[i]&&o.push(r);o.length&&s.push({elem:l,handlers:o})}return l=this,u<t.length&&s.push({elem:l,handlers:t.slice(u)}),s},addProp:function(t,e){Object.defineProperty(ce.Event.prototype,t,{enumerable:!0,configurable:!0,get:v(e)?function(){if(this.originalEvent)return e(this.originalEvent)}:function(){if(this.originalEvent)return this.originalEvent[t]},set:function(e){Object.defineProperty(this,t,{enumerable:!0,configurable:!0,writable:!0,value:e})}})},fix:function(e){return e[ce.expando]?e:new ce.Event(e)},special:{load:{noBubble:!0},click:{setup:function(e){var t=this||e;return we.test(t.type)&&t.click&&fe(t,"input")&&He(t,"click",!0),!1},trigger:function(e){var t=this||e;return we.test(t.type)&&t.click&&fe(t,"input")&&He(t,"click"),!0},_default:function(e){var t=e.target;return we.test(t.type)&&t.click&&fe(t,"input")&&_.get(t,"click")||fe(t,"a")}},beforeunload:{postDispatch:function(e){void 0!==e.result&&e.originalEvent&&(e.originalEvent.returnValue=e.result)}}}},ce.removeEvent=function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n)},ce.Event=function(e,t){if(!(this instanceof ce.Event))return new ce.Event(e,t);e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||void 0===e.defaultPrevented&&!1===e.returnValue?Ne:qe,this.target=e.target&&3===e.target.nodeType?e.target.parentNode:e.target,this.currentTarget=e.currentTarget,this.relatedTarget=e.relatedTarget):this.type=e,t&&ce.extend(this,t),this.timeStamp=e&&e.timeStamp||Date.now(),this[ce.expando]=!0},ce.Event.prototype={constructor:ce.Event,isDefaultPrevented:qe,isPropagationStopped:qe,isImmediatePropagationStopped:qe,isSimulated:!1,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=Ne,e&&!this.isSimulated&&e.preventDefault()},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=Ne,e&&!this.isSimulated&&e.stopPropagation()},stopImmediatePropagation:function(){var e=this.originalEvent;this.isImmediatePropagationStopped=Ne,e&&!this.isSimulated&&e.stopImmediatePropagation(),this.stopPropagation()}},ce.each({altKey:!0,bubbles:!0,cancelable:!0,changedTouches:!0,ctrlKey:!0,detail:!0,eventPhase:!0,metaKey:!0,pageX:!0,pageY:!0,shiftKey:!0,view:!0,"char":!0,code:!0,charCode:!0,key:!0,keyCode:!0,button:!0,buttons:!0,clientX:!0,clientY:!0,offsetX:!0,offsetY:!0,pointerId:!0,pointerType:!0,screenX:!0,screenY:!0,targetTouches:!0,toElement:!0,touches:!0,which:!0},ce.event.addProp),ce.each({focus:"focusin",blur:"focusout"},function(r,i){function o(e){if(C.documentMode){var t=_.get(this,"handle"),n=ce.event.fix(e);n.type="focusin"===e.type?"focus":"blur",n.isSimulated=!0,t(e),n.target===n.currentTarget&&t(n)}else ce.event.simulate(i,e.target,ce.event.fix(e))}ce.event.special[r]={setup:function(){var e;if(He(this,r,!0),!C.documentMode)return!1;(e=_.get(this,i))||this.addEventListener(i,o),_.set(this,i,(e||0)+1)},trigger:function(){return He(this,r),!0},teardown:function(){var e;if(!C.documentMode)return!1;(e=_.get(this,i)-1)?_.set(this,i,e):(this.removeEventListener(i,o),_.remove(this,i))},_default:function(e){return _.get(e.target,r)},delegateType:i},ce.event.special[i]={setup:function(){var e=this.ownerDocument||this.document||this,t=C.documentMode?this:e,n=_.get(t,i);n||(C.documentMode?this.addEventListener(i,o):e.addEventListener(r,o,!0)),_.set(t,i,(n||0)+1)},teardown:function(){var e=this.ownerDocument||this.document||this,t=C.documentMode?this:e,n=_.get(t,i)-1;n?_.set(t,i,n):(C.documentMode?this.removeEventListener(i,o):e.removeEventListener(r,o,!0),_.remove(t,i))}}}),ce.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(e,i){ce.event.special[e]={delegateType:i,bindType:i,handle:function(e){var t,n=e.relatedTarget,r=e.handleObj;return n&&(n===this||ce.contains(this,n))||(e.type=r.origType,t=r.handler.apply(this,arguments),e.type=i),t}}}),ce.fn.extend({on:function(e,t,n,r){return Le(this,e,t,n,r)},one:function(e,t,n,r){return Le(this,e,t,n,r,1)},off:function(e,t,n){var r,i;if(e&&e.preventDefault&&e.handleObj)return r=e.handleObj,ce(e.delegateTarget).off(r.namespace?r.origType+"."+r.namespace:r.origType,r.selector,r.handler),this;if("object"==typeof e){for(i in e)this.off(i,t,e[i]);return this}return!1!==t&&"function"!=typeof t||(n=t,t=void 0),!1===n&&(n=qe),this.each(function(){ce.event.remove(this,e,n,t)})}});var Oe=/<script|<style|<link/i,Pe=/checked\s*(?:[^=]|=\s*.checked.)/i,Me=/^\s*<!\[CDATA\[|\]\]>\s*$/g;function Re(e,t){return fe(e,"table")&&fe(11!==t.nodeType?t:t.firstChild,"tr")&&ce(e).children("tbody")[0]||e}function Ie(e){return e.type=(null!==e.getAttribute("type"))+"/"+e.type,e}function We(e){return"true/"===(e.type||"").slice(0,5)?e.type=e.type.slice(5):e.removeAttribute("type"),e}function Fe(e,t){var n,r,i,o,a,s;if(1===t.nodeType){if(_.hasData(e)&&(s=_.get(e).events))for(i in _.remove(t,"handle events"),s)for(n=0,r=s[i].length;n<r;n++)ce.event.add(t,i,s[i][n]);z.hasData(e)&&(o=z.access(e),a=ce.extend({},o),z.set(t,a))}}function $e(n,r,i,o){r=g(r);var e,t,a,s,u,l,c=0,f=n.length,p=f-1,d=r[0],h=v(d);if(h||1<f&&"string"==typeof d&&!le.checkClone&&Pe.test(d))return n.each(function(e){var t=n.eq(e);h&&(r[0]=d.call(this,e,t.html())),$e(t,r,i,o)});if(f&&(t=(e=Ae(r,n[0].ownerDocument,!1,n,o)).firstChild,1===e.childNodes.length&&(e=t),t||o)){for(s=(a=ce.map(Se(e,"script"),Ie)).length;c<f;c++)u=e,c!==p&&(u=ce.clone(u,!0,!0),s&&ce.merge(a,Se(u,"script"))),i.call(n[c],u,c);if(s)for(l=a[a.length-1].ownerDocument,ce.map(a,We),c=0;c<s;c++)u=a[c],Ce.test(u.type||"")&&!_.access(u,"globalEval")&&ce.contains(l,u)&&(u.src&&"module"!==(u.type||"").toLowerCase()?ce._evalUrl&&!u.noModule&&ce._evalUrl(u.src,{nonce:u.nonce||u.getAttribute("nonce")},l):m(u.textContent.replace(Me,""),u,l))}return n}function Be(e,t,n){for(var r,i=t?ce.filter(t,e):e,o=0;null!=(r=i[o]);o++)n||1!==r.nodeType||ce.cleanData(Se(r)),r.parentNode&&(n&&K(r)&&Ee(Se(r,"script")),r.parentNode.removeChild(r));return e}ce.extend({htmlPrefilter:function(e){return e},clone:function(e,t,n){var r,i,o,a,s,u,l,c=e.cloneNode(!0),f=K(e);if(!(le.noCloneChecked||1!==e.nodeType&&11!==e.nodeType||ce.isXMLDoc(e)))for(a=Se(c),r=0,i=(o=Se(e)).length;r<i;r++)s=o[r],u=a[r],void 0,"input"===(l=u.nodeName.toLowerCase())&&we.test(s.type)?u.checked=s.checked:"input"!==l&&"textarea"!==l||(u.defaultValue=s.defaultValue);if(t)if(n)for(o=o||Se(e),a=a||Se(c),r=0,i=o.length;r<i;r++)Fe(o[r],a[r]);else Fe(e,c);return 0<(a=Se(c,"script")).length&&Ee(a,!f&&Se(e,"script")),c},cleanData:function(e){for(var t,n,r,i=ce.event.special,o=0;void 0!==(n=e[o]);o++)if($(n)){if(t=n[_.expando]){if(t.events)for(r in t.events)i[r]?ce.event.remove(n,r):ce.removeEvent(n,r,t.handle);n[_.expando]=void 0}n[z.expando]&&(n[z.expando]=void 0)}}}),ce.fn.extend({detach:function(e){return Be(this,e,!0)},remove:function(e){return Be(this,e)},text:function(e){return M(this,function(e){return void 0===e?ce.text(this):this.empty().each(function(){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||(this.textContent=e)})},null,e,arguments.length)},append:function(){return $e(this,arguments,function(e){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||Re(this,e).appendChild(e)})},prepend:function(){return $e(this,arguments,function(e){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var t=Re(this,e);t.insertBefore(e,t.firstChild)}})},before:function(){return $e(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return $e(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},empty:function(){for(var e,t=0;null!=(e=this[t]);t++)1===e.nodeType&&(ce.cleanData(Se(e,!1)),e.textContent="");return this},clone:function(e,t){return e=null!=e&&e,t=null==t?e:t,this.map(function(){return ce.clone(this,e,t)})},html:function(e){return M(this,function(e){var t=this[0]||{},n=0,r=this.length;if(void 0===e&&1===t.nodeType)return t.innerHTML;if("string"==typeof e&&!Oe.test(e)&&!ke[(Te.exec(e)||["",""])[1].toLowerCase()]){e=ce.htmlPrefilter(e);try{for(;n<r;n++)1===(t=this[n]||{}).nodeType&&(ce.cleanData(Se(t,!1)),t.innerHTML=e);t=0}catch(e){}}t&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(){var n=[];return $e(this,arguments,function(e){var t=this.parentNode;ce.inArray(this,n)<0&&(ce.cleanData(Se(this)),t&&t.replaceChild(e,this))},n)}}),ce.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,a){ce.fn[e]=function(e){for(var t,n=[],r=ce(e),i=r.length-1,o=0;o<=i;o++)t=o===i?this:this.clone(!0),ce(r[o])[a](t),s.apply(n,t.get());return this.pushStack(n)}});var _e=new RegExp("^("+G+")(?!px)[a-z%]+$","i"),ze=/^--/,Xe=function(e){var t=e.ownerDocument.defaultView;return t&&t.opener||(t=ie),t.getComputedStyle(e)},Ue=function(e,t,n){var r,i,o={};for(i in t)o[i]=e.style[i],e.style[i]=t[i];for(i in r=n.call(e),t)e.style[i]=o[i];return r},Ve=new RegExp(Q.join("|"),"i");function Ge(e,t,n){var r,i,o,a,s=ze.test(t),u=e.style;return(n=n||Xe(e))&&(a=n.getPropertyValue(t)||n[t],s&&a&&(a=a.replace(ve,"$1")||void 0),""!==a||K(e)||(a=ce.style(e,t)),!le.pixelBoxStyles()&&_e.test(a)&&Ve.test(t)&&(r=u.width,i=u.minWidth,o=u.maxWidth,u.minWidth=u.maxWidth=u.width=a,a=n.width,u.width=r,u.minWidth=i,u.maxWidth=o)),void 0!==a?a+"":a}function Ye(e,t){return{get:function(){if(!e())return(this.get=t).apply(this,arguments);delete this.get}}}!function(){function e(){if(l){u.style.cssText="position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0",l.style.cssText="position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%",J.appendChild(u).appendChild(l);var e=ie.getComputedStyle(l);n="1%"!==e.top,s=12===t(e.marginLeft),l.style.right="60%",o=36===t(e.right),r=36===t(e.width),l.style.position="absolute",i=12===t(l.offsetWidth/3),J.removeChild(u),l=null}}function t(e){return Math.round(parseFloat(e))}var n,r,i,o,a,s,u=C.createElement("div"),l=C.createElement("div");l.style&&(l.style.backgroundClip="content-box",l.cloneNode(!0).style.backgroundClip="",le.clearCloneStyle="content-box"===l.style.backgroundClip,ce.extend(le,{boxSizingReliable:function(){return e(),r},pixelBoxStyles:function(){return e(),o},pixelPosition:function(){return e(),n},reliableMarginLeft:function(){return e(),s},scrollboxSize:function(){return e(),i},reliableTrDimensions:function(){var e,t,n,r;return null==a&&(e=C.createElement("table"),t=C.createElement("tr"),n=C.createElement("div"),e.style.cssText="position:absolute;left:-11111px;border-collapse:separate",t.style.cssText="box-sizing:content-box;border:1px solid",t.style.height="1px",n.style.height="9px",n.style.display="block",J.appendChild(e).appendChild(t).appendChild(n),r=ie.getComputedStyle(t),a=parseInt(r.height,10)+parseInt(r.borderTopWidth,10)+parseInt(r.borderBottomWidth,10)===t.offsetHeight,J.removeChild(e)),a}}))}();var Qe=["Webkit","Moz","ms"],Je=C.createElement("div").style,Ke={};function Ze(e){var t=ce.cssProps[e]||Ke[e];return t||(e in Je?e:Ke[e]=function(e){var t=e[0].toUpperCase()+e.slice(1),n=Qe.length;while(n--)if((e=Qe[n]+t)in Je)return e}(e)||e)}var et=/^(none|table(?!-c[ea]).+)/,tt={position:"absolute",visibility:"hidden",display:"block"},nt={letterSpacing:"0",fontWeight:"400"};function rt(e,t,n){var r=Y.exec(t);return r?Math.max(0,r[2]-(n||0))+(r[3]||"px"):t}function it(e,t,n,r,i,o){var a="width"===t?1:0,s=0,u=0,l=0;if(n===(r?"border":"content"))return 0;for(;a<4;a+=2)"margin"===n&&(l+=ce.css(e,n+Q[a],!0,i)),r?("content"===n&&(u-=ce.css(e,"padding"+Q[a],!0,i)),"margin"!==n&&(u-=ce.css(e,"border"+Q[a]+"Width",!0,i))):(u+=ce.css(e,"padding"+Q[a],!0,i),"padding"!==n?u+=ce.css(e,"border"+Q[a]+"Width",!0,i):s+=ce.css(e,"border"+Q[a]+"Width",!0,i));return!r&&0<=o&&(u+=Math.max(0,Math.ceil(e["offset"+t[0].toUpperCase()+t.slice(1)]-o-u-s-.5))||0),u+l}function ot(e,t,n){var r=Xe(e),i=(!le.boxSizingReliable()||n)&&"border-box"===ce.css(e,"boxSizing",!1,r),o=i,a=Ge(e,t,r),s="offset"+t[0].toUpperCase()+t.slice(1);if(_e.test(a)){if(!n)return a;a="auto"}return(!le.boxSizingReliable()&&i||!le.reliableTrDimensions()&&fe(e,"tr")||"auto"===a||!parseFloat(a)&&"inline"===ce.css(e,"display",!1,r))&&e.getClientRects().length&&(i="border-box"===ce.css(e,"boxSizing",!1,r),(o=s in e)&&(a=e[s])),(a=parseFloat(a)||0)+it(e,t,n||(i?"border":"content"),o,r,a)+"px"}function at(e,t,n,r,i){return new at.prototype.init(e,t,n,r,i)}ce.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=Ge(e,"opacity");return""===n?"1":n}}}},cssNumber:{animationIterationCount:!0,aspectRatio:!0,borderImageSlice:!0,columnCount:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,gridArea:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnStart:!0,gridRow:!0,gridRowEnd:!0,gridRowStart:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,scale:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeMiterlimit:!0,strokeOpacity:!0},cssProps:{},style:function(e,t,n,r){if(e&&3!==e.nodeType&&8!==e.nodeType&&e.style){var i,o,a,s=F(t),u=ze.test(t),l=e.style;if(u||(t=Ze(s)),a=ce.cssHooks[t]||ce.cssHooks[s],void 0===n)return a&&"get"in a&&void 0!==(i=a.get(e,!1,r))?i:l[t];"string"===(o=typeof n)&&(i=Y.exec(n))&&i[1]&&(n=te(e,t,i),o="number"),null!=n&&n==n&&("number"!==o||u||(n+=i&&i[3]||(ce.cssNumber[s]?"":"px")),le.clearCloneStyle||""!==n||0!==t.indexOf("background")||(l[t]="inherit"),a&&"set"in a&&void 0===(n=a.set(e,n,r))||(u?l.setProperty(t,n):l[t]=n))}},css:function(e,t,n,r){var i,o,a,s=F(t);return ze.test(t)||(t=Ze(s)),(a=ce.cssHooks[t]||ce.cssHooks[s])&&"get"in a&&(i=a.get(e,!0,n)),void 0===i&&(i=Ge(e,t,r)),"normal"===i&&t in nt&&(i=nt[t]),""===n||n?(o=parseFloat(i),!0===n||isFinite(o)?o||0:i):i}}),ce.each(["height","width"],function(e,u){ce.cssHooks[u]={get:function(e,t,n){if(t)return!et.test(ce.css(e,"display"))||e.getClientRects().length&&e.getBoundingClientRect().width?ot(e,u,n):Ue(e,tt,function(){return ot(e,u,n)})},set:function(e,t,n){var r,i=Xe(e),o=!le.scrollboxSize()&&"absolute"===i.position,a=(o||n)&&"border-box"===ce.css(e,"boxSizing",!1,i),s=n?it(e,u,n,a,i):0;return a&&o&&(s-=Math.ceil(e["offset"+u[0].toUpperCase()+u.slice(1)]-parseFloat(i[u])-it(e,u,"border",!1,i)-.5)),s&&(r=Y.exec(t))&&"px"!==(r[3]||"px")&&(e.style[u]=t,t=ce.css(e,u)),rt(0,t,s)}}}),ce.cssHooks.marginLeft=Ye(le.reliableMarginLeft,function(e,t){if(t)return(parseFloat(Ge(e,"marginLeft"))||e.getBoundingClientRect().left-Ue(e,{marginLeft:0},function(){return e.getBoundingClientRect().left}))+"px"}),ce.each({margin:"",padding:"",border:"Width"},function(i,o){ce.cssHooks[i+o]={expand:function(e){for(var t=0,n={},r="string"==typeof e?e.split(" "):[e];t<4;t++)n[i+Q[t]+o]=r[t]||r[t-2]||r[0];return n}},"margin"!==i&&(ce.cssHooks[i+o].set=rt)}),ce.fn.extend({css:function(e,t){return M(this,function(e,t,n){var r,i,o={},a=0;if(Array.isArray(t)){for(r=Xe(e),i=t.length;a<i;a++)o[t[a]]=ce.css(e,t[a],!1,r);return o}return void 0!==n?ce.style(e,t,n):ce.css(e,t)},e,t,1<arguments.length)}}),((ce.Tween=at).prototype={constructor:at,init:function(e,t,n,r,i,o){this.elem=e,this.prop=n,this.easing=i||ce.easing._default,this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=o||(ce.cssNumber[n]?"":"px")},cur:function(){var e=at.propHooks[this.prop];return e&&e.get?e.get(this):at.propHooks._default.get(this)},run:function(e){var t,n=at.propHooks[this.prop];return this.options.duration?this.pos=t=ce.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):this.pos=t=e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):at.propHooks._default.set(this),this}}).init.prototype=at.prototype,(at.propHooks={_default:{get:function(e){var t;return 1!==e.elem.nodeType||null!=e.elem[e.prop]&&null==e.elem.style[e.prop]?e.elem[e.prop]:(t=ce.css(e.elem,e.prop,""))&&"auto"!==t?t:0},set:function(e){ce.fx.step[e.prop]?ce.fx.step[e.prop](e):1!==e.elem.nodeType||!ce.cssHooks[e.prop]&&null==e.elem.style[Ze(e.prop)]?e.elem[e.prop]=e.now:ce.style(e.elem,e.prop,e.now+e.unit)}}}).scrollTop=at.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},ce.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2},_default:"swing"},ce.fx=at.prototype.init,ce.fx.step={};var st,ut,lt,ct,ft=/^(?:toggle|show|hide)$/,pt=/queueHooks$/;function dt(){ut&&(!1===C.hidden&&ie.requestAnimationFrame?ie.requestAnimationFrame(dt):ie.setTimeout(dt,ce.fx.interval),ce.fx.tick())}function ht(){return ie.setTimeout(function(){st=void 0}),st=Date.now()}function gt(e,t){var n,r=0,i={height:e};for(t=t?1:0;r<4;r+=2-t)i["margin"+(n=Q[r])]=i["padding"+n]=e;return t&&(i.opacity=i.width=e),i}function vt(e,t,n){for(var r,i=(yt.tweeners[t]||[]).concat(yt.tweeners["*"]),o=0,a=i.length;o<a;o++)if(r=i[o].call(n,t,e))return r}function yt(o,e,t){var n,a,r=0,i=yt.prefilters.length,s=ce.Deferred().always(function(){delete u.elem}),u=function(){if(a)return!1;for(var e=st||ht(),t=Math.max(0,l.startTime+l.duration-e),n=1-(t/l.duration||0),r=0,i=l.tweens.length;r<i;r++)l.tweens[r].run(n);return s.notifyWith(o,[l,n,t]),n<1&&i?t:(i||s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l]),!1)},l=s.promise({elem:o,props:ce.extend({},e),opts:ce.extend(!0,{specialEasing:{},easing:ce.easing._default},t),originalProperties:e,originalOptions:t,startTime:st||ht(),duration:t.duration,tweens:[],createTween:function(e,t){var n=ce.Tween(o,l.opts,e,t,l.opts.specialEasing[e]||l.opts.easing);return l.tweens.push(n),n},stop:function(e){var t=0,n=e?l.tweens.length:0;if(a)return this;for(a=!0;t<n;t++)l.tweens[t].run(1);return e?(s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l,e])):s.rejectWith(o,[l,e]),this}}),c=l.props;for(!function(e,t){var n,r,i,o,a;for(n in e)if(i=t[r=F(n)],o=e[n],Array.isArray(o)&&(i=o[1],o=e[n]=o[0]),n!==r&&(e[r]=o,delete e[n]),(a=ce.cssHooks[r])&&"expand"in a)for(n in o=a.expand(o),delete e[r],o)n in e||(e[n]=o[n],t[n]=i);else t[r]=i}(c,l.opts.specialEasing);r<i;r++)if(n=yt.prefilters[r].call(l,o,c,l.opts))return v(n.stop)&&(ce._queueHooks(l.elem,l.opts.queue).stop=n.stop.bind(n)),n;return ce.map(c,vt,l),v(l.opts.start)&&l.opts.start.call(o,l),l.progress(l.opts.progress).done(l.opts.done,l.opts.complete).fail(l.opts.fail).always(l.opts.always),ce.fx.timer(ce.extend(u,{elem:o,anim:l,queue:l.opts.queue})),l}ce.Animation=ce.extend(yt,{tweeners:{"*":[function(e,t){var n=this.createTween(e,t);return te(n.elem,e,Y.exec(t),n),n}]},tweener:function(e,t){v(e)?(t=e,e=["*"]):e=e.match(D);for(var n,r=0,i=e.length;r<i;r++)n=e[r],yt.tweeners[n]=yt.tweeners[n]||[],yt.tweeners[n].unshift(t)},prefilters:[function(e,t,n){var r,i,o,a,s,u,l,c,f="width"in t||"height"in t,p=this,d={},h=e.style,g=e.nodeType&&ee(e),v=_.get(e,"fxshow");for(r in n.queue||(null==(a=ce._queueHooks(e,"fx")).unqueued&&(a.unqueued=0,s=a.empty.fire,a.empty.fire=function(){a.unqueued||s()}),a.unqueued++,p.always(function(){p.always(function(){a.unqueued--,ce.queue(e,"fx").length||a.empty.fire()})})),t)if(i=t[r],ft.test(i)){if(delete t[r],o=o||"toggle"===i,i===(g?"hide":"show")){if("show"!==i||!v||void 0===v[r])continue;g=!0}d[r]=v&&v[r]||ce.style(e,r)}if((u=!ce.isEmptyObject(t))||!ce.isEmptyObject(d))for(r in f&&1===e.nodeType&&(n.overflow=[h.overflow,h.overflowX,h.overflowY],null==(l=v&&v.display)&&(l=_.get(e,"display")),"none"===(c=ce.css(e,"display"))&&(l?c=l:(re([e],!0),l=e.style.display||l,c=ce.css(e,"display"),re([e]))),("inline"===c||"inline-block"===c&&null!=l)&&"none"===ce.css(e,"float")&&(u||(p.done(function(){h.display=l}),null==l&&(c=h.display,l="none"===c?"":c)),h.display="inline-block")),n.overflow&&(h.overflow="hidden",p.always(function(){h.overflow=n.overflow[0],h.overflowX=n.overflow[1],h.overflowY=n.overflow[2]})),u=!1,d)u||(v?"hidden"in v&&(g=v.hidden):v=_.access(e,"fxshow",{display:l}),o&&(v.hidden=!g),g&&re([e],!0),p.done(function(){for(r in g||re([e]),_.remove(e,"fxshow"),d)ce.style(e,r,d[r])})),u=vt(g?v[r]:0,r,p),r in v||(v[r]=u.start,g&&(u.end=u.start,u.start=0))}],prefilter:function(e,t){t?yt.prefilters.unshift(e):yt.prefilters.push(e)}}),ce.speed=function(e,t,n){var r=e&&"object"==typeof e?ce.extend({},e):{complete:n||!n&&t||v(e)&&e,duration:e,easing:n&&t||t&&!v(t)&&t};return ce.fx.off?r.duration=0:"number"!=typeof r.duration&&(r.duration in ce.fx.speeds?r.duration=ce.fx.speeds[r.duration]:r.duration=ce.fx.speeds._default),null!=r.queue&&!0!==r.queue||(r.queue="fx"),r.old=r.complete,r.complete=function(){v(r.old)&&r.old.call(this),r.queue&&ce.dequeue(this,r.queue)},r},ce.fn.extend({fadeTo:function(e,t,n,r){return this.filter(ee).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(t,e,n,r){var i=ce.isEmptyObject(t),o=ce.speed(e,n,r),a=function(){var e=yt(this,ce.extend({},t),o);(i||_.get(this,"finish"))&&e.stop(!0)};return a.finish=a,i||!1===o.queue?this.each(a):this.queue(o.queue,a)},stop:function(i,e,o){var a=function(e){var t=e.stop;delete e.stop,t(o)};return"string"!=typeof i&&(o=e,e=i,i=void 0),e&&this.queue(i||"fx",[]),this.each(function(){var e=!0,t=null!=i&&i+"queueHooks",n=ce.timers,r=_.get(this);if(t)r[t]&&r[t].stop&&a(r[t]);else for(t in r)r[t]&&r[t].stop&&pt.test(t)&&a(r[t]);for(t=n.length;t--;)n[t].elem!==this||null!=i&&n[t].queue!==i||(n[t].anim.stop(o),e=!1,n.splice(t,1));!e&&o||ce.dequeue(this,i)})},finish:function(a){return!1!==a&&(a=a||"fx"),this.each(function(){var e,t=_.get(this),n=t[a+"queue"],r=t[a+"queueHooks"],i=ce.timers,o=n?n.length:0;for(t.finish=!0,ce.queue(this,a,[]),r&&r.stop&&r.stop.call(this,!0),e=i.length;e--;)i[e].elem===this&&i[e].queue===a&&(i[e].anim.stop(!0),i.splice(e,1));for(e=0;e<o;e++)n[e]&&n[e].finish&&n[e].finish.call(this);delete t.finish})}}),ce.each(["toggle","show","hide"],function(e,r){var i=ce.fn[r];ce.fn[r]=function(e,t,n){return null==e||"boolean"==typeof e?i.apply(this,arguments):this.animate(gt(r,!0),e,t,n)}}),ce.each({slideDown:gt("show"),slideUp:gt("hide"),slideToggle:gt("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,r){ce.fn[e]=function(e,t,n){return this.animate(r,e,t,n)}}),ce.timers=[],ce.fx.tick=function(){var e,t=0,n=ce.timers;for(st=Date.now();t<n.length;t++)(e=n[t])()||n[t]!==e||n.splice(t--,1);n.length||ce.fx.stop(),st=void 0},ce.fx.timer=function(e){ce.timers.push(e),ce.fx.start()},ce.fx.interval=13,ce.fx.start=function(){ut||(ut=!0,dt())},ce.fx.stop=function(){ut=null},ce.fx.speeds={slow:600,fast:200,_default:400},ce.fn.delay=function(r,e){return r=ce.fx&&ce.fx.speeds[r]||r,e=e||"fx",this.queue(e,function(e,t){var n=ie.setTimeout(e,r);t.stop=function(){ie.clearTimeout(n)}})},lt=C.createElement("input"),ct=C.createElement("select").appendChild(C.createElement("option")),lt.type="checkbox",le.checkOn=""!==lt.value,le.optSelected=ct.selected,(lt=C.createElement("input")).value="t",lt.type="radio",le.radioValue="t"===lt.value;var mt,xt=ce.expr.attrHandle;ce.fn.extend({attr:function(e,t){return M(this,ce.attr,e,t,1<arguments.length)},removeAttr:function(e){return this.each(function(){ce.removeAttr(this,e)})}}),ce.extend({attr:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return"undefined"==typeof e.getAttribute?ce.prop(e,t,n):(1===o&&ce.isXMLDoc(e)||(i=ce.attrHooks[t.toLowerCase()]||(ce.expr.match.bool.test(t)?mt:void 0)),void 0!==n?null===n?void ce.removeAttr(e,t):i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:(e.setAttribute(t,n+""),n):i&&"get"in i&&null!==(r=i.get(e,t))?r:null==(r=ce.find.attr(e,t))?void 0:r)},attrHooks:{type:{set:function(e,t){if(!le.radioValue&&"radio"===t&&fe(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}},removeAttr:function(e,t){var n,r=0,i=t&&t.match(D);if(i&&1===e.nodeType)while(n=i[r++])e.removeAttribute(n)}}),mt={set:function(e,t,n){return!1===t?ce.removeAttr(e,n):e.setAttribute(n,n),n}},ce.each(ce.expr.match.bool.source.match(/\w+/g),function(e,t){var a=xt[t]||ce.find.attr;xt[t]=function(e,t,n){var r,i,o=t.toLowerCase();return n||(i=xt[o],xt[o]=r,r=null!=a(e,t,n)?o:null,xt[o]=i),r}});var bt=/^(?:input|select|textarea|button)$/i,wt=/^(?:a|area)$/i;function Tt(e){return(e.match(D)||[]).join(" ")}function Ct(e){return e.getAttribute&&e.getAttribute("class")||""}function kt(e){return Array.isArray(e)?e:"string"==typeof e&&e.match(D)||[]}ce.fn.extend({prop:function(e,t){return M(this,ce.prop,e,t,1<arguments.length)},removeProp:function(e){return this.each(function(){delete this[ce.propFix[e]||e]})}}),ce.extend({prop:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return 1===o&&ce.isXMLDoc(e)||(t=ce.propFix[t]||t,i=ce.propHooks[t]),void 0!==n?i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:e[t]=n:i&&"get"in i&&null!==(r=i.get(e,t))?r:e[t]},propHooks:{tabIndex:{get:function(e){var t=ce.find.attr(e,"tabindex");return t?parseInt(t,10):bt.test(e.nodeName)||wt.test(e.nodeName)&&e.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),le.optSelected||(ce.propHooks.selected={get:function(e){var t=e.parentNode;return t&&t.parentNode&&t.parentNode.selectedIndex,null},set:function(e){var t=e.parentNode;t&&(t.selectedIndex,t.parentNode&&t.parentNode.selectedIndex)}}),ce.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){ce.propFix[this.toLowerCase()]=this}),ce.fn.extend({addClass:function(t){var e,n,r,i,o,a;return v(t)?this.each(function(e){ce(this).addClass(t.call(this,e,Ct(this)))}):(e=kt(t)).length?this.each(function(){if(r=Ct(this),n=1===this.nodeType&&" "+Tt(r)+" "){for(o=0;o<e.length;o++)i=e[o],n.indexOf(" "+i+" ")<0&&(n+=i+" ");a=Tt(n),r!==a&&this.setAttribute("class",a)}}):this},removeClass:function(t){var e,n,r,i,o,a;return v(t)?this.each(function(e){ce(this).removeClass(t.call(this,e,Ct(this)))}):arguments.length?(e=kt(t)).length?this.each(function(){if(r=Ct(this),n=1===this.nodeType&&" "+Tt(r)+" "){for(o=0;o<e.length;o++){i=e[o];while(-1<n.indexOf(" "+i+" "))n=n.replace(" "+i+" "," ")}a=Tt(n),r!==a&&this.setAttribute("class",a)}}):this:this.attr("class","")},toggleClass:function(t,n){var e,r,i,o,a=typeof t,s="string"===a||Array.isArray(t);return v(t)?this.each(function(e){ce(this).toggleClass(t.call(this,e,Ct(this),n),n)}):"boolean"==typeof n&&s?n?this.addClass(t):this.removeClass(t):(e=kt(t),this.each(function(){if(s)for(o=ce(this),i=0;i<e.length;i++)r=e[i],o.hasClass(r)?o.removeClass(r):o.addClass(r);else void 0!==t&&"boolean"!==a||((r=Ct(this))&&_.set(this,"__className__",r),this.setAttribute&&this.setAttribute("class",r||!1===t?"":_.get(this,"__className__")||""))}))},hasClass:function(e){var t,n,r=0;t=" "+e+" ";while(n=this[r++])if(1===n.nodeType&&-1<(" "+Tt(Ct(n))+" ").indexOf(t))return!0;return!1}});var St=/\r/g;ce.fn.extend({val:function(n){var r,e,i,t=this[0];return arguments.length?(i=v(n),this.each(function(e){var t;1===this.nodeType&&(null==(t=i?n.call(this,e,ce(this).val()):n)?t="":"number"==typeof t?t+="":Array.isArray(t)&&(t=ce.map(t,function(e){return null==e?"":e+""})),(r=ce.valHooks[this.type]||ce.valHooks[this.nodeName.toLowerCase()])&&"set"in r&&void 0!==r.set(this,t,"value")||(this.value=t))})):t?(r=ce.valHooks[t.type]||ce.valHooks[t.nodeName.toLowerCase()])&&"get"in r&&void 0!==(e=r.get(t,"value"))?e:"string"==typeof(e=t.value)?e.replace(St,""):null==e?"":e:void 0}}),ce.extend({valHooks:{option:{get:function(e){var t=ce.find.attr(e,"value");return null!=t?t:Tt(ce.text(e))}},select:{get:function(e){var t,n,r,i=e.options,o=e.selectedIndex,a="select-one"===e.type,s=a?null:[],u=a?o+1:i.length;for(r=o<0?u:a?o:0;r<u;r++)if(((n=i[r]).selected||r===o)&&!n.disabled&&(!n.parentNode.disabled||!fe(n.parentNode,"optgroup"))){if(t=ce(n).val(),a)return t;s.push(t)}return s},set:function(e,t){var n,r,i=e.options,o=ce.makeArray(t),a=i.length;while(a--)((r=i[a]).selected=-1<ce.inArray(ce.valHooks.option.get(r),o))&&(n=!0);return n||(e.selectedIndex=-1),o}}}}),ce.each(["radio","checkbox"],function(){ce.valHooks[this]={set:function(e,t){if(Array.isArray(t))return e.checked=-1<ce.inArray(ce(e).val(),t)}},le.checkOn||(ce.valHooks[this].get=function(e){return null===e.getAttribute("value")?"on":e.value})});var Et=ie.location,jt={guid:Date.now()},At=/\?/;ce.parseXML=function(e){var t,n;if(!e||"string"!=typeof e)return null;try{t=(new ie.DOMParser).parseFromString(e,"text/xml")}catch(e){}return n=t&&t.getElementsByTagName("parsererror")[0],t&&!n||ce.error("Invalid XML: "+(n?ce.map(n.childNodes,function(e){return e.textContent}).join("\n"):e)),t};var Dt=/^(?:focusinfocus|focusoutblur)$/,Nt=function(e){e.stopPropagation()};ce.extend(ce.event,{trigger:function(e,t,n,r){var i,o,a,s,u,l,c,f,p=[n||C],d=ue.call(e,"type")?e.type:e,h=ue.call(e,"namespace")?e.namespace.split("."):[];if(o=f=a=n=n||C,3!==n.nodeType&&8!==n.nodeType&&!Dt.test(d+ce.event.triggered)&&(-1<d.indexOf(".")&&(d=(h=d.split(".")).shift(),h.sort()),u=d.indexOf(":")<0&&"on"+d,(e=e[ce.expando]?e:new ce.Event(d,"object"==typeof e&&e)).isTrigger=r?2:3,e.namespace=h.join("."),e.rnamespace=e.namespace?new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,e.result=void 0,e.target||(e.target=n),t=null==t?[e]:ce.makeArray(t,[e]),c=ce.event.special[d]||{},r||!c.trigger||!1!==c.trigger.apply(n,t))){if(!r&&!c.noBubble&&!y(n)){for(s=c.delegateType||d,Dt.test(s+d)||(o=o.parentNode);o;o=o.parentNode)p.push(o),a=o;a===(n.ownerDocument||C)&&p.push(a.defaultView||a.parentWindow||ie)}i=0;while((o=p[i++])&&!e.isPropagationStopped())f=o,e.type=1<i?s:c.bindType||d,(l=(_.get(o,"events")||Object.create(null))[e.type]&&_.get(o,"handle"))&&l.apply(o,t),(l=u&&o[u])&&l.apply&&$(o)&&(e.result=l.apply(o,t),!1===e.result&&e.preventDefault());return e.type=d,r||e.isDefaultPrevented()||c._default&&!1!==c._default.apply(p.pop(),t)||!$(n)||u&&v(n[d])&&!y(n)&&((a=n[u])&&(n[u]=null),ce.event.triggered=d,e.isPropagationStopped()&&f.addEventListener(d,Nt),n[d](),e.isPropagationStopped()&&f.removeEventListener(d,Nt),ce.event.triggered=void 0,a&&(n[u]=a)),e.result}},simulate:function(e,t,n){var r=ce.extend(new ce.Event,n,{type:e,isSimulated:!0});ce.event.trigger(r,null,t)}}),ce.fn.extend({trigger:function(e,t){return this.each(function(){ce.event.trigger(e,t,this)})},triggerHandler:function(e,t){var n=this[0];if(n)return ce.event.trigger(e,t,n,!0)}});var qt=/\[\]$/,Lt=/\r?\n/g,Ht=/^(?:submit|button|image|reset|file)$/i,Ot=/^(?:input|select|textarea|keygen)/i;function Pt(n,e,r,i){var t;if(Array.isArray(e))ce.each(e,function(e,t){r||qt.test(n)?i(n,t):Pt(n+"["+("object"==typeof t&&null!=t?e:"")+"]",t,r,i)});else if(r||"object"!==x(e))i(n,e);else for(t in e)Pt(n+"["+t+"]",e[t],r,i)}ce.param=function(e,t){var n,r=[],i=function(e,t){var n=v(t)?t():t;r[r.length]=encodeURIComponent(e)+"="+encodeURIComponent(null==n?"":n)};if(null==e)return"";if(Array.isArray(e)||e.jquery&&!ce.isPlainObject(e))ce.each(e,function(){i(this.name,this.value)});else for(n in e)Pt(n,e[n],t,i);return r.join("&")},ce.fn.extend({serialize:function(){return ce.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=ce.prop(this,"elements");return e?ce.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!ce(this).is(":disabled")&&Ot.test(this.nodeName)&&!Ht.test(e)&&(this.checked||!we.test(e))}).map(function(e,t){var n=ce(this).val();return null==n?null:Array.isArray(n)?ce.map(n,function(e){return{name:t.name,value:e.replace(Lt,"\r\n")}}):{name:t.name,value:n.replace(Lt,"\r\n")}}).get()}});var Mt=/%20/g,Rt=/#.*$/,It=/([?&])_=[^&]*/,Wt=/^(.*?):[ \t]*([^\r\n]*)$/gm,Ft=/^(?:GET|HEAD)$/,$t=/^\/\//,Bt={},_t={},zt="*/".concat("*"),Xt=C.createElement("a");function Ut(o){return function(e,t){"string"!=typeof e&&(t=e,e="*");var n,r=0,i=e.toLowerCase().match(D)||[];if(v(t))while(n=i[r++])"+"===n[0]?(n=n.slice(1)||"*",(o[n]=o[n]||[]).unshift(t)):(o[n]=o[n]||[]).push(t)}}function Vt(t,i,o,a){var s={},u=t===_t;function l(e){var r;return s[e]=!0,ce.each(t[e]||[],function(e,t){var n=t(i,o,a);return"string"!=typeof n||u||s[n]?u?!(r=n):void 0:(i.dataTypes.unshift(n),l(n),!1)}),r}return l(i.dataTypes[0])||!s["*"]&&l("*")}function Gt(e,t){var n,r,i=ce.ajaxSettings.flatOptions||{};for(n in t)void 0!==t[n]&&((i[n]?e:r||(r={}))[n]=t[n]);return r&&ce.extend(!0,e,r),e}Xt.href=Et.href,ce.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:Et.href,type:"GET",isLocal:/^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(Et.protocol),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":zt,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":JSON.parse,"text xml":ce.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?Gt(Gt(e,ce.ajaxSettings),t):Gt(ce.ajaxSettings,e)},ajaxPrefilter:Ut(Bt),ajaxTransport:Ut(_t),ajax:function(e,t){"object"==typeof e&&(t=e,e=void 0),t=t||{};var c,f,p,n,d,r,h,g,i,o,v=ce.ajaxSetup({},t),y=v.context||v,m=v.context&&(y.nodeType||y.jquery)?ce(y):ce.event,x=ce.Deferred(),b=ce.Callbacks("once memory"),w=v.statusCode||{},a={},s={},u="canceled",T={readyState:0,getResponseHeader:function(e){var t;if(h){if(!n){n={};while(t=Wt.exec(p))n[t[1].toLowerCase()+" "]=(n[t[1].toLowerCase()+" "]||[]).concat(t[2])}t=n[e.toLowerCase()+" "]}return null==t?null:t.join(", ")},getAllResponseHeaders:function(){return h?p:null},setRequestHeader:function(e,t){return null==h&&(e=s[e.toLowerCase()]=s[e.toLowerCase()]||e,a[e]=t),this},overrideMimeType:function(e){return null==h&&(v.mimeType=e),this},statusCode:function(e){var t;if(e)if(h)T.always(e[T.status]);else for(t in e)w[t]=[w[t],e[t]];return this},abort:function(e){var t=e||u;return c&&c.abort(t),l(0,t),this}};if(x.promise(T),v.url=((e||v.url||Et.href)+"").replace($t,Et.protocol+"//"),v.type=t.method||t.type||v.method||v.type,v.dataTypes=(v.dataType||"*").toLowerCase().match(D)||[""],null==v.crossDomain){r=C.createElement("a");try{r.href=v.url,r.href=r.href,v.crossDomain=Xt.protocol+"//"+Xt.host!=r.protocol+"//"+r.host}catch(e){v.crossDomain=!0}}if(v.data&&v.processData&&"string"!=typeof v.data&&(v.data=ce.param(v.data,v.traditional)),Vt(Bt,v,t,T),h)return T;for(i in(g=ce.event&&v.global)&&0==ce.active++&&ce.event.trigger("ajaxStart"),v.type=v.type.toUpperCase(),v.hasContent=!Ft.test(v.type),f=v.url.replace(Rt,""),v.hasContent?v.data&&v.processData&&0===(v.contentType||"").indexOf("application/x-www-form-urlencoded")&&(v.data=v.data.replace(Mt,"+")):(o=v.url.slice(f.length),v.data&&(v.processData||"string"==typeof v.data)&&(f+=(At.test(f)?"&":"?")+v.data,delete v.data),!1===v.cache&&(f=f.replace(It,"$1"),o=(At.test(f)?"&":"?")+"_="+jt.guid+++o),v.url=f+o),v.ifModified&&(ce.lastModified[f]&&T.setRequestHeader("If-Modified-Since",ce.lastModified[f]),ce.etag[f]&&T.setRequestHeader("If-None-Match",ce.etag[f])),(v.data&&v.hasContent&&!1!==v.contentType||t.contentType)&&T.setRequestHeader("Content-Type",v.contentType),T.setRequestHeader("Accept",v.dataTypes[0]&&v.accepts[v.dataTypes[0]]?v.accepts[v.dataTypes[0]]+("*"!==v.dataTypes[0]?", "+zt+"; q=0.01":""):v.accepts["*"]),v.headers)T.setRequestHeader(i,v.headers[i]);if(v.beforeSend&&(!1===v.beforeSend.call(y,T,v)||h))return T.abort();if(u="abort",b.add(v.complete),T.done(v.success),T.fail(v.error),c=Vt(_t,v,t,T)){if(T.readyState=1,g&&m.trigger("ajaxSend",[T,v]),h)return T;v.async&&0<v.timeout&&(d=ie.setTimeout(function(){T.abort("timeout")},v.timeout));try{h=!1,c.send(a,l)}catch(e){if(h)throw e;l(-1,e)}}else l(-1,"No Transport");function l(e,t,n,r){var i,o,a,s,u,l=t;h||(h=!0,d&&ie.clearTimeout(d),c=void 0,p=r||"",T.readyState=0<e?4:0,i=200<=e&&e<300||304===e,n&&(s=function(e,t,n){var r,i,o,a,s=e.contents,u=e.dataTypes;while("*"===u[0])u.shift(),void 0===r&&(r=e.mimeType||t.getResponseHeader("Content-Type"));if(r)for(i in s)if(s[i]&&s[i].test(r)){u.unshift(i);break}if(u[0]in n)o=u[0];else{for(i in n){if(!u[0]||e.converters[i+" "+u[0]]){o=i;break}a||(a=i)}o=o||a}if(o)return o!==u[0]&&u.unshift(o),n[o]}(v,T,n)),!i&&-1<ce.inArray("script",v.dataTypes)&&ce.inArray("json",v.dataTypes)<0&&(v.converters["text script"]=function(){}),s=function(e,t,n,r){var i,o,a,s,u,l={},c=e.dataTypes.slice();if(c[1])for(a in e.converters)l[a.toLowerCase()]=e.converters[a];o=c.shift();while(o)if(e.responseFields[o]&&(n[e.responseFields[o]]=t),!u&&r&&e.dataFilter&&(t=e.dataFilter(t,e.dataType)),u=o,o=c.shift())if("*"===o)o=u;else if("*"!==u&&u!==o){if(!(a=l[u+" "+o]||l["* "+o]))for(i in l)if((s=i.split(" "))[1]===o&&(a=l[u+" "+s[0]]||l["* "+s[0]])){!0===a?a=l[i]:!0!==l[i]&&(o=s[0],c.unshift(s[1]));break}if(!0!==a)if(a&&e["throws"])t=a(t);else try{t=a(t)}catch(e){return{state:"parsererror",error:a?e:"No conversion from "+u+" to "+o}}}return{state:"success",data:t}}(v,s,T,i),i?(v.ifModified&&((u=T.getResponseHeader("Last-Modified"))&&(ce.lastModified[f]=u),(u=T.getResponseHeader("etag"))&&(ce.etag[f]=u)),204===e||"HEAD"===v.type?l="nocontent":304===e?l="notmodified":(l=s.state,o=s.data,i=!(a=s.error))):(a=l,!e&&l||(l="error",e<0&&(e=0))),T.status=e,T.statusText=(t||l)+"",i?x.resolveWith(y,[o,l,T]):x.rejectWith(y,[T,l,a]),T.statusCode(w),w=void 0,g&&m.trigger(i?"ajaxSuccess":"ajaxError",[T,v,i?o:a]),b.fireWith(y,[T,l]),g&&(m.trigger("ajaxComplete",[T,v]),--ce.active||ce.event.trigger("ajaxStop")))}return T},getJSON:function(e,t,n){return ce.get(e,t,n,"json")},getScript:function(e,t){return ce.get(e,void 0,t,"script")}}),ce.each(["get","post"],function(e,i){ce[i]=function(e,t,n,r){return v(t)&&(r=r||n,n=t,t=void 0),ce.ajax(ce.extend({url:e,type:i,dataType:r,data:t,success:n},ce.isPlainObject(e)&&e))}}),ce.ajaxPrefilter(function(e){var t;for(t in e.headers)"content-type"===t.toLowerCase()&&(e.contentType=e.headers[t]||"")}),ce._evalUrl=function(e,t,n){return ce.ajax({url:e,type:"GET",dataType:"script",cache:!0,async:!1,global:!1,converters:{"text script":function(){}},dataFilter:function(e){ce.globalEval(e,t,n)}})},ce.fn.extend({wrapAll:function(e){var t;return this[0]&&(v(e)&&(e=e.call(this[0])),t=ce(e,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstElementChild)e=e.firstElementChild;return e}).append(this)),this},wrapInner:function(n){return v(n)?this.each(function(e){ce(this).wrapInner(n.call(this,e))}):this.each(function(){var e=ce(this),t=e.contents();t.length?t.wrapAll(n):e.append(n)})},wrap:function(t){var n=v(t);return this.each(function(e){ce(this).wrapAll(n?t.call(this,e):t)})},unwrap:function(e){return this.parent(e).not("body").each(function(){ce(this).replaceWith(this.childNodes)}),this}}),ce.expr.pseudos.hidden=function(e){return!ce.expr.pseudos.visible(e)},ce.expr.pseudos.visible=function(e){return!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)},ce.ajaxSettings.xhr=function(){try{return new ie.XMLHttpRequest}catch(e){}};var Yt={0:200,1223:204},Qt=ce.ajaxSettings.xhr();le.cors=!!Qt&&"withCredentials"in Qt,le.ajax=Qt=!!Qt,ce.ajaxTransport(function(i){var o,a;if(le.cors||Qt&&!i.crossDomain)return{send:function(e,t){var n,r=i.xhr();if(r.open(i.type,i.url,i.async,i.username,i.password),i.xhrFields)for(n in i.xhrFields)r[n]=i.xhrFields[n];for(n in i.mimeType&&r.overrideMimeType&&r.overrideMimeType(i.mimeType),i.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest"),e)r.setRequestHeader(n,e[n]);o=function(e){return function(){o&&(o=a=r.onload=r.onerror=r.onabort=r.ontimeout=r.onreadystatechange=null,"abort"===e?r.abort():"error"===e?"number"!=typeof r.status?t(0,"error"):t(r.status,r.statusText):t(Yt[r.status]||r.status,r.statusText,"text"!==(r.responseType||"text")||"string"!=typeof r.responseText?{binary:r.response}:{text:r.responseText},r.getAllResponseHeaders()))}},r.onload=o(),a=r.onerror=r.ontimeout=o("error"),void 0!==r.onabort?r.onabort=a:r.onreadystatechange=function(){4===r.readyState&&ie.setTimeout(function(){o&&a()})},o=o("abort");try{r.send(i.hasContent&&i.data||null)}catch(e){if(o)throw e}},abort:function(){o&&o()}}}),ce.ajaxPrefilter(function(e){e.crossDomain&&(e.contents.script=!1)}),ce.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(e){return ce.globalEval(e),e}}}),ce.ajaxPrefilter("script",function(e){void 0===e.cache&&(e.cache=!1),e.crossDomain&&(e.type="GET")}),ce.ajaxTransport("script",function(n){var r,i;if(n.crossDomain||n.scriptAttrs)return{send:function(e,t){r=ce("<script>").attr(n.scriptAttrs||{}).prop({charset:n.scriptCharset,src:n.url}).on("load error",i=function(e){r.remove(),i=null,e&&t("error"===e.type?404:200,e.type)}),C.head.appendChild(r[0])},abort:function(){i&&i()}}});var Jt,Kt=[],Zt=/(=)\?(?=&|$)|\?\?/;ce.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=Kt.pop()||ce.expando+"_"+jt.guid++;return this[e]=!0,e}}),ce.ajaxPrefilter("json jsonp",function(e,t,n){var r,i,o,a=!1!==e.jsonp&&(Zt.test(e.url)?"url":"string"==typeof e.data&&0===(e.contentType||"").indexOf("application/x-www-form-urlencoded")&&Zt.test(e.data)&&"data");if(a||"jsonp"===e.dataTypes[0])return r=e.jsonpCallback=v(e.jsonpCallback)?e.jsonpCallback():e.jsonpCallback,a?e[a]=e[a].replace(Zt,"$1"+r):!1!==e.jsonp&&(e.url+=(At.test(e.url)?"&":"?")+e.jsonp+"="+r),e.converters["script json"]=function(){return o||ce.error(r+" was not called"),o[0]},e.dataTypes[0]="json",i=ie[r],ie[r]=function(){o=arguments},n.always(function(){void 0===i?ce(ie).removeProp(r):ie[r]=i,e[r]&&(e.jsonpCallback=t.jsonpCallback,Kt.push(r)),o&&v(i)&&i(o[0]),o=i=void 0}),"script"}),le.createHTMLDocument=((Jt=C.implementation.createHTMLDocument("").body).innerHTML="<form></form><form></form>",2===Jt.childNodes.length),ce.parseHTML=function(e,t,n){return"string"!=typeof e?[]:("boolean"==typeof t&&(n=t,t=!1),t||(le.createHTMLDocument?((r=(t=C.implementation.createHTMLDocument("")).createElement("base")).href=C.location.href,t.head.appendChild(r)):t=C),o=!n&&[],(i=w.exec(e))?[t.createElement(i[1])]:(i=Ae([e],t,o),o&&o.length&&ce(o).remove(),ce.merge([],i.childNodes)));var r,i,o},ce.fn.load=function(e,t,n){var r,i,o,a=this,s=e.indexOf(" ");return-1<s&&(r=Tt(e.slice(s)),e=e.slice(0,s)),v(t)?(n=t,t=void 0):t&&"object"==typeof t&&(i="POST"),0<a.length&&ce.ajax({url:e,type:i||"GET",dataType:"html",data:t}).done(function(e){o=arguments,a.html(r?ce("<div>").append(ce.parseHTML(e)).find(r):e)}).always(n&&function(e,t){a.each(function(){n.apply(this,o||[e.responseText,t,e])})}),this},ce.expr.pseudos.animated=function(t){return ce.grep(ce.timers,function(e){return t===e.elem}).length},ce.offset={setOffset:function(e,t,n){var r,i,o,a,s,u,l=ce.css(e,"position"),c=ce(e),f={};"static"===l&&(e.style.position="relative"),s=c.offset(),o=ce.css(e,"top"),u=ce.css(e,"left"),("absolute"===l||"fixed"===l)&&-1<(o+u).indexOf("auto")?(a=(r=c.position()).top,i=r.left):(a=parseFloat(o)||0,i=parseFloat(u)||0),v(t)&&(t=t.call(e,n,ce.extend({},s))),null!=t.top&&(f.top=t.top-s.top+a),null!=t.left&&(f.left=t.left-s.left+i),"using"in t?t.using.call(e,f):c.css(f)}},ce.fn.extend({offset:function(t){if(arguments.length)return void 0===t?this:this.each(function(e){ce.offset.setOffset(this,t,e)});var e,n,r=this[0];return r?r.getClientRects().length?(e=r.getBoundingClientRect(),n=r.ownerDocument.defaultView,{top:e.top+n.pageYOffset,left:e.left+n.pageXOffset}):{top:0,left:0}:void 0},position:function(){if(this[0]){var e,t,n,r=this[0],i={top:0,left:0};if("fixed"===ce.css(r,"position"))t=r.getBoundingClientRect();else{t=this.offset(),n=r.ownerDocument,e=r.offsetParent||n.documentElement;while(e&&(e===n.body||e===n.documentElement)&&"static"===ce.css(e,"position"))e=e.parentNode;e&&e!==r&&1===e.nodeType&&((i=ce(e).offset()).top+=ce.css(e,"borderTopWidth",!0),i.left+=ce.css(e,"borderLeftWidth",!0))}return{top:t.top-i.top-ce.css(r,"marginTop",!0),left:t.left-i.left-ce.css(r,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var e=this.offsetParent;while(e&&"static"===ce.css(e,"position"))e=e.offsetParent;return e||J})}}),ce.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(t,i){var o="pageYOffset"===i;ce.fn[t]=function(e){return M(this,function(e,t,n){var r;if(y(e)?r=e:9===e.nodeType&&(r=e.defaultView),void 0===n)return r?r[i]:e[t];r?r.scrollTo(o?r.pageXOffset:n,o?n:r.pageYOffset):e[t]=n},t,e,arguments.length)}}),ce.each(["top","left"],function(e,n){ce.cssHooks[n]=Ye(le.pixelPosition,function(e,t){if(t)return t=Ge(e,n),_e.test(t)?ce(e).position()[n]+"px":t})}),ce.each({Height:"height",Width:"width"},function(a,s){ce.each({padding:"inner"+a,content:s,"":"outer"+a},function(r,o){ce.fn[o]=function(e,t){var n=arguments.length&&(r||"boolean"!=typeof e),i=r||(!0===e||!0===t?"margin":"border");return M(this,function(e,t,n){var r;return y(e)?0===o.indexOf("outer")?e["inner"+a]:e.document.documentElement["client"+a]:9===e.nodeType?(r=e.documentElement,Math.max(e.body["scroll"+a],r["scroll"+a],e.body["offset"+a],r["offset"+a],r["client"+a])):void 0===n?ce.css(e,t,i):ce.style(e,t,n,i)},s,n?e:void 0,n)}})}),ce.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){ce.fn[t]=function(e){return this.on(t,e)}}),ce.fn.extend({bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return 1===arguments.length?this.off(e,"**"):this.off(t,e||"**",n)},hover:function(e,t){return this.on("mouseenter",e).on("mouseleave",t||e)}}),ce.each("blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(" "),function(e,n){ce.fn[n]=function(e,t){return 0<arguments.length?this.on(n,null,e,t):this.trigger(n)}});var en=/^[\s\uFEFF\xA0]+|([^\s\uFEFF\xA0])[\s\uFEFF\xA0]+$/g;ce.proxy=function(e,t){var n,r,i;if("string"==typeof t&&(n=e[t],t=e,e=n),v(e))return r=ae.call(arguments,2),(i=function(){return e.apply(t||this,r.concat(ae.call(arguments)))}).guid=e.guid=e.guid||ce.guid++,i},ce.holdReady=function(e){e?ce.readyWait++:ce.ready(!0)},ce.isArray=Array.isArray,ce.parseJSON=JSON.parse,ce.nodeName=fe,ce.isFunction=v,ce.isWindow=y,ce.camelCase=F,ce.type=x,ce.now=Date.now,ce.isNumeric=function(e){var t=ce.type(e);return("number"===t||"string"===t)&&!isNaN(e-parseFloat(e))},ce.trim=function(e){return null==e?"":(e+"").replace(en,"$1")},"function"==typeof define&&define.amd&&define("jquery",[],function(){return ce});var tn=ie.jQuery,nn=ie.$;return ce.noConflict=function(e){return ie.$===ce&&(ie.$=nn),e&&ie.jQuery===ce&&(ie.jQuery=tn),ce},"undefined"==typeof e&&(ie.jQuery=ie.$=ce),ce});
"use strict";function _slicedToArray(e,t){return _arrayWithHoles(e)||_iterableToArrayLimit(e,t)||_unsupportedIterableToArray(e,t)||_nonIterableRest()}function _nonIterableRest(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}function _iterableToArrayLimit(e,t){var n=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=n){var r,a,o,i,s=[],c=!0,l=!1;try{if(o=(n=n.call(e)).next,0===t){if(Object(n)!==n)return;c=!1}else for(;!(c=(r=o.call(n)).done)&&(s.push(r.value),s.length!==t);c=!0);}catch(e){l=!0,a=e}finally{try{if(!c&&null!=n.return&&(i=n.return(),Object(i)!==i))return}finally{if(l)throw a}}return s}}function _arrayWithHoles(e){if(Array.isArray(e))return e}function ownKeys(t,e){var n,r=Object.keys(t);return Object.getOwnPropertySymbols&&(n=Object.getOwnPropertySymbols(t),e&&(n=n.filter(function(e){return Object.getOwnPropertyDescriptor(t,e).enumerable})),r.push.apply(r,n)),r}function _objectSpread(t){for(var e=1;e<arguments.length;e++){var n=null!=arguments[e]?arguments[e]:{};e%2?ownKeys(Object(n),!0).forEach(function(e){_defineProperty(t,e,n[e])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):ownKeys(Object(n)).forEach(function(e){Object.defineProperty(t,e,Object.getOwnPropertyDescriptor(n,e))})}return t}function _defineProperty(e,t,n){return(t=_toPropertyKey(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function _toPropertyKey(e){e=_toPrimitive(e,"string");return"symbol"==_typeof(e)?e:String(e)}function _toPrimitive(e,t){if("object"!=_typeof(e)||!e)return e;var n=e[Symbol.toPrimitive];if(void 0===n)return("string"===t?String:Number)(e);n=n.call(e,t||"default");if("object"!=_typeof(n))return n;throw new TypeError("@@toPrimitive must return a primitive value.")}function _toConsumableArray(e){return _arrayWithoutHoles(e)||_iterableToArray(e)||_unsupportedIterableToArray(e)||_nonIterableSpread()}function _nonIterableSpread(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}function _iterableToArray(e){if("undefined"!=typeof Symbol&&null!=e[Symbol.iterator]||null!=e["@@iterator"])return Array.from(e)}function _arrayWithoutHoles(e){if(Array.isArray(e))return _arrayLikeToArray(e)}function _typeof(e){return(_typeof="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e})(e)}function _createForOfIteratorHelper(e,t){var n,r,a,o,i="undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(i)return r=!(n=!0),{s:function(){i=i.call(e)},n:function(){var e=i.next();return n=e.done,e},e:function(e){r=!0,a=e},f:function(){try{n||null==i.return||i.return()}finally{if(r)throw a}}};if(Array.isArray(e)||(i=_unsupportedIterableToArray(e))||t&&e&&"number"==typeof e.length)return i&&(e=i),o=0,{s:t=function(){},n:function(){return o>=e.length?{done:!0}:{done:!1,value:e[o++]}},e:function(e){throw e},f:t};throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}function _unsupportedIterableToArray(e,t){var n;if(e)return"string"==typeof e?_arrayLikeToArray(e,t):"Map"===(n="Object"===(n=Object.prototype.toString.call(e).slice(8,-1))&&e.constructor?e.constructor.name:n)||"Set"===n?Array.from(e):"Arguments"===n||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?_arrayLikeToArray(e,t):void 0}function _arrayLikeToArray(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=new Array(t);n<t;n++)r[n]=e[n];return r}define("engine",["jquery","utils","state","section","passages"],function(N,j,P,R,I){var t,V=j.impossible,M=j.passageSelector,D=j.transitionOut,F=j.options;function L(e,t,n){var r,a,o;if(n?(n=n.get("name"),(a=I.getTree(n)).children.length&&(r={type:"include",tag:t,name:n,children:a.children,text:a.text})):r=I.getTree(t),r){for(;(o=e[e.length-1])&&("root"===o.type||"include"===o.type)&&o.children.some(function(e){return e.type.startsWith("unclosed")});)e[e.length-1]=Object.create(o),e=e[e.length-1].children=o.children.slice();e.push(r)}}function n(e){var t,n=1<arguments.length&&void 0!==arguments[1]?arguments[1]:{},r=n.loadedGame,a=I.get(e),o=j.storyElement,i=o.parent(),s=n.stretch,n=n.transition,n=void 0===n?{}:n,c=n.depart,c=void 0===c?"instant":c,l=n.arrive,l=void 0===l?"dissolve":l,u=n.departOrigin,p=n.arriveOrigin,n=n.time,d=(i.findAndFilter("tw-enchantment").each(function(e,t){var n=(t=N(t)).data("enchantedProperties");n&&o.css(n.reduce(function(e,t){return e[t]="",e},{})),t[0]===i[0]&&(i=o.unwrap().parent())}),I.hasValid(e)||V("Engine.showPassage","There's no passage with the name \""+e+'"!'),o.children(M).not(".transition-out, .transition-out *")),a=(a.get("tags")||[]).join(" "),f=(t=N("<tw-passage><tw-sidebar>"),f=t.children("tw-sidebar"),h=N('<tw-icon tabindex=0 alt="Undo" title="Undo">&#8630;</tw-icon>'),g=N('<tw-icon tabindex=0 alt="Redo" title="Redo">&#8631;</tw-icon>'),P.pastLength<=0&&h.css("visibility","hidden"),P.futureLength<=0&&g.css("visibility","hidden"),f.append(h,g),t),h=("function"==typeof u&&(u=u.call(d)),"function"==typeof p&&(p=p.call(f)),!s&&c),m=h&&d.css("width"),g=(j.detachStoryElement(),f.appendTo(o).attr({tags:a}),h&&(D(d,c,n,0,0,0,u),d.css({position:"absolute",width:function(){return"0px"!==m?m:"100%"}})),o.attr({tags:a}),R.create(f)),y=(r&&(g.loadedGame=!0),[]);if(P.pastLength<=0&&1===P.turns){var b,v=_createForOfIteratorHelper(I.getTagged("startup"));try{for(v.s();!(b=v.n()).done;)L(y,"startup",b.value)}catch(e){v.e(e)}finally{v.f()}if(F.debug){var w,k=_createForOfIteratorHelper(I.getTagged("debug-startup"));try{for(k.s();!(w=k.n()).done;)L(y,"debug-startup",w.value)}catch(e){k.e(e)}finally{k.f()}}}var S,T=_createForOfIteratorHelper(I.getTagged("header"));try{for(T.s();!(S=T.n()).done;)L(y,"header",S.value)}catch(e){T.e(e)}finally{T.f()}if(F.debug){var _,x=_createForOfIteratorHelper(I.getTagged("debug-header"));try{for(x.s();!(_=x.n()).done;)L(y,"debug-header",_.value)}catch(e){x.e(e)}finally{x.f()}}L(y,e);var O,A=_createForOfIteratorHelper(I.getTagged("footer"));try{for(A.s();!(O=A.n()).done;)L(y,"footer",O.value)}catch(e){A.e(e)}finally{A.f()}if(F.debug){var C,E=_createForOfIteratorHelper(I.getTagged("debug-footer"));try{for(E.s();!(C=E.n()).done;)L(y,"debug-footer",C.value)}catch(e){E.e(e)}finally{E.f()}}g.renderInto(y,f,{transition:l,transitionTime:n,transitionOrigin:p}),g.loadedGame=!1,j.reattachStoryElement(),scroll(0,s?f.offset().top-.05*N(window).height():o[0].getBoundingClientRect().top+document.body.scrollTop)}return Object.freeze({goBack:function(e){P.rewind()&&n(P.passage,e)},goForward:function(e){P.fastForward()&&n(P.passage,e)},goToPassage:function(e,t){P.play(e),n(e,t)},redirect:function(e,t){P.redirect(e),n(e,t)},toggleFullscreen:function(){var e=document.documentElement;document.fullscreenElement?document.exitFullscreen():document.msFullscreenElement?document.msExitFullscreen():(e.msRequestFullscreen||e.requestFullscreen).call(e)},showPassage:n,enableDebugMode:function(){t&&t()},registerDebugMode:function(e){t=t||e}})}),define("harlowe",["jquery","debugmode/mode","renderer","state","section","engine","passages","utils","utils/renderutils","internaltypes/varscope","internaltypes/twineerror","macros","macrolib/values","macrolib/commands","macrolib/datastructures","macrolib/stylechangers","macrolib/enchantments","macrolib/metadata","macrolib/patterns","macrolib/links","macrolib/custommacros","utils/jqueryplugins","repl"],function($,DebugMode,Renderer,State,Section,Engine,Passages,Utils,_ref,VarScope){var dialog=_ref.dialog;function __HarloweEval(text){eval(text+"")}function printJSError(e){var t,n="".concat(e.name,": ").concat(e.message);return e.stack&&(t=(e=e.stack.split("\n")).findIndex(function(e){return e.includes("__HarloweEval")}),n+="\n".concat(e.slice(0,t).join("\n").replace(/\([^)]+\)/g,""))),"<div style='font-family:monospace;overflow-y:scroll;max-height:30vh'>```"+n+"```</div>"}!function(o){window.onerror=function(e,t,n,r,a){window.onerror=o,Utils.storyElement.parent().append(dialog({message:"Sorry to interrupt, but this page's code has got itself in a mess.\n\n".concat(printJSError(a),"\n(This is probably due to a bug in the Harlowe game engine.)")}).addClass("harlowe-crash")),"function"==typeof o&&o.apply(void 0,arguments)}}(window.onerror),Utils.onStartup(function(){var n,e,t,r,a=$("tw-storydata");0!==a.length&&(Utils.options.ifid=a.attr("ifid"),(a.attr("tags")||"").split(/\s/).forEach(function(e){"uncompressed-pure-values"!==e&&"uncompressed-saves"!==e||(Utils.options.uncompressedPureValues=!0),"uncompressed-structures"!==e&&"uncompressed-saves"!==e||(Utils.options.uncompressedStructures=!0)}),(a.attr("options")||"").split(/\s/).forEach(function(e){e&&(Utils.options[e]=!0),"debug"===e&&DebugMode()}),a=(a=a.attr("startnode"))||[].reduce.call($("tw-passagedata"),function(e,t){t=t.getAttribute("pid");return t<e?t:e},1/0),a=$("tw-passagedata[pid='"+a+"']").attr("name"),$(document.documentElement).on("keydown",function(e){13===e.which&&"0"===e.target.getAttribute("tabindex")&&$(e.target).trigger("click")}),n=!1,$("[role=script]").each(function(t){try{__HarloweEval($(this).html())}catch(e){n||(n=!0,dialog({parent:Utils.storyElement.parent(),message:"There is a problem with this story's "+Utils.nth(t+1)+" script:\n\n"+printJSError(e)}))}}),$("[role=stylesheet]").each(function(e,t){$(document.head).append("<style data-title=\"Story stylesheet '".concat(e+1,"'\">").concat($(t).html()))}),(e=Section.create()).stack=[{tempVariables:Object.create(VarScope)}],(r=Passages.loadMetadata(e)).length&&(t=dialog({parent:Utils.storyElement.parent(),message:"These errors occurred when running the `(metadata:)` macro calls in this story's passages:<p></p>"}),r.forEach(function(e){return t.find("p").append(e.render())})),(r=!Utils.options.debug&&State.hasSessionStorage&&sessionStorage.getItem("Saved Session"))&&!0===State.deserialise(e,r)?Engine.showPassage(State.passage):Engine.goToPassage(a))})}),define("macros",["utils/naturalsort","utils","utils/operationutils","datatypes/changercommand","datatypes/custommacro","datatypes/lambda","datatypes/codehook","internaltypes/changedescriptor","internaltypes/twineerror"],function(g,e,t,o,r,y,b,p,v){var w=e.insensitiveName,k=e.nth,S=e.andList,T=t.objectName,_=t.typeName,d=t.toSource,x=Array.isArray,i={};function O(e){return e===s.TypeSignature.Any||(x(e.innerType)?e.innerType.some(O):!!e.innerType&&O(e.innerType))}function a(e,t,n,r){var a,o,i,s,c,l,u,p,d=t.fn,f=t.typeSignature,h=t.returnType,m=(r=function(e){for(var t,n,r,a=[],o=0;o<e.length;o+=1)o in e&&(!0===(null==(t=e[o])?void 0:t.spreader)?(n=t.value,(r=v.containsError(n))?a.push(r):x(n)||"string"==typeof n?a.push.apply(a,_toConsumableArray(n)):n instanceof Set?a.push.apply(a,_toConsumableArray(Array.from(n).sort(g("en")))):a.push(v.create("operation","I can't spread out "+T(n)+", because it is not a string, dataset, or array."))):a.push(t));return a}(r),"string"!=typeof e&&(a=e,e=""),a?"":"("+(x(e)&&1<e.length?e[0]:e)+":)");for(e=a?a.TwineScript_KnownName?"the custom macro, ".concat(a.TwineScript_KnownName):"an unnamed custom macro":"the ".concat(m," macro"),o=0<f.length?1===f.length&&O(f[0])?1===r.length?"That value can't be given to macros as-is.":"Give only a single value to this macro.":e+" must only be given "+S(f.map(_))+(1<f.length?", in that order":"."):e+" must not be given any data."+(a?"":" Just write "+m),s=0,c=Math.max(r.length,f.length);s<c;s+=1){if(p=f[s],l=r[s],v.containsError(l))return l;if(s>=f.length&&!i)return v.create("datatype",r.length-f.length+" too many values were given to "+e+".",o);if(!(p=p||i).innerType||"rest"!==p.pattern&&"zero or more"!==p.pattern||(i=p.innerType,"rest"===p.pattern&&(p=p.innerType)),!function e(t,n){if(null===n)return void 0===t;var r=_typeof(t);if("function"!=typeof n&&n.pattern){if("optional"===n.pattern||"zero or more"===n.pattern)return void 0===t||e(t,n.innerType);if("either"===n.pattern){for(var a=0;a<n.innerType.length;a+=1)if(e(t,n.innerType[a]))return!0;return!1}if("lambda"===n.pattern&&e(t,n.innerType))return n.clauses.includes("where")===("where"in t||"each"in t)&&n.clauses.includes("making")==="making"in t&&n.clauses.includes("via")==="via"in t&&n.clauses.includes("with")==="with"in t;if("insensitive set"===n.pattern)return n.innerType.includes(w(t));if("range"===n.pattern)return n.range(t);if("wrapped"===n.pattern)return e(t,n.innerType)}return(void 0===n||void 0!==t)&&("anything"===n.TwineScript_TypeName&&void 0!==t&&!t.TwineScript_Unstorable||"everything"===n.TwineScript_TypeName&&void 0!==t||(n===String?"string"===r:n===Boolean?"boolean"===r:n===parseInt?"number"===r&&!Number.isNaN(t)&&!(t+"").includes("."):n===Number?"number"===r&&!Number.isNaN(t):n===Array?x(t):n===Map||n===Set?t instanceof n:Object.isPrototypeOf.call(n,t)))}(l,p))return void 0===l?(u=f.filter(function(e){return!("optional"===e.pattern||"zero or more"===e.pattern)}).length,v.create("datatype","".concat(e," was given ").concat(r.length?S(r.map(T)):"nothing",", but needs ").concat(u-s," more value").concat(1<u-s?"s":"","."),o)):null!=(u=l)&&u.TwineScript_Unstorable&&O(p)?v.create("datatype",e+"'s "+k(s+1)+" value, "+T(l)+", is not valid data for this macro.",o):b.isPrototypeOf(l)&&"Changer"===h?v.create("syntax","Please put this hook outside the parentheses of "+e+", not inside it.","Hooks should appear after a macro"+(a?".":": "+m+"[Some text]")):l&&y.isPrototypeOf(l)&&"lambda"===p.pattern?v.create("datatype",e+"'s "+k(s+1)+" value (a lambda) should have "+S(["where","when","making","via","with"].filter(function(e){return p.clauses.includes(e)}).map(function(e){return"a '"+e+"' clause"}))+", not "+S(["where","when","making","via","with"].filter(function(e){return e in l}).map(function(e){return"a '"+e+"' clause"}))+"."):"insensitive set"===p.pattern?v.create("datatype",T(l)+" is not a valid name string for "+e+".","Only the following names are recognised (capitalisation and hyphens ignored): "+S(p.innerType)+"."):v.create("datatype","".concat(e,"'s ").concat(k(s+1)," value is ").concat(T(l),", but should be ").concat(_(p),"."),p.message||o)}return d.apply(null,[n].concat(r))}function f(e,t,n,r){var a={fn:n,typeSignature:r=[].concat(r||[]),returnType:t};Object.freeze(a),[].concat(e).forEach(function(e){return Object.defineProperty(i,w(e),{value:a})})}var s={has:function(e){return e=w(e),hasOwnProperty.call(i,e)},get:function(e){return e=w(e),hasOwnProperty.call(i,e)&&i[e]},add:function e(t,n,r,a){return f(t,n,r,a),e},addChanger:function e(t,n,r,a){return f(t,"Changer",n,a),o.register(x(t)?t[0]:t,r),e},addCommand:function e(t,n,r,a){var s,c,l,u,o=!(4<arguments.length&&void 0!==arguments[4])||arguments[4],i=[].concat(t)[0];return f(t,"Command",(s=i,c=n,l=r,u=o,function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];var a,o,i=c.apply(void 0,n);return i||(a=p.create(),o=_objectSpread({TwineScript_TypeID:"command",TwineScript_ObjectName:"a (".concat(s,":) command"),TwineScript_TypeName:"a (".concat(s,":) command"),TwineScript_Print:function(){return"`[A (".concat(s,":) command]`")},TwineScript_ToSource:function(){return"(".concat(s,":").concat(n.map(d),")")},TwineScript_is:function(e){return d(this)===d(e)}},u?{TwineScript_Attach:function(e,t){return a.section=e,t.run(a),o},TwineScript_Run:function(e){e=l.apply(void 0,[a,e].concat(n));return a=p.create(),e}}:{TwineScript_Run:function(e){return l.apply(void 0,[e].concat(n))}}))}),a),e},TypeSignature:{optional:function(e){return{pattern:"optional",innerType:e}},zeroOrMore:function(e){return{pattern:"zero or more",innerType:e}},either:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return{pattern:"either",innerType:t}},rest:function(e){return{pattern:"rest",innerType:e}},insensitiveSet:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return{pattern:"insensitive set",innerType:t}},numberRange:function(){var t=0<arguments.length&&void 0!==arguments[0]?arguments[0]:0,n=1<arguments.length&&void 0!==arguments[1]?arguments[1]:1/0;return{pattern:"range",min:t,max:n,range:function(e){return"number"==typeof e&&!Number.isNaN(e)&&t<=e&&e<=n}}},nonNegativeInteger:{pattern:"range",integer:!0,min:0,max:1/0,range:function(e){return"number"==typeof e&&!Number.isNaN(e)&&0<=e&&!(e+"").includes(".")}},positiveInteger:{pattern:"range",integer:!0,min:1,max:1/0,range:function(e){return"number"==typeof e&&!Number.isNaN(e)&&1<=e&&!(e+"").includes(".")}},wrapped:function(e,t){return{pattern:"wrapped",innerType:e,message:t}},Any:{TwineScript_TypeName:"anything"},Everything:{TwineScript_TypeName:"everything"}},run:function(e,t,n){return s.has(e)?a(e,s.get(e),t,n):v.create("macrocall","I can't run the macro '"+e+"' because it doesn't exist.","Did you mean to run a macro? If you have a word written like (this:), it is regarded as a macro name.")},runCustom:function(e,t,n){return r.isPrototypeOf(e)?a(e,e,t,n):v.containsError(e)?e:v.create("macrocall","I can't call ".concat(T(e)," because it isn't a custom macro."))}};return Object.assign(s.TypeSignature,{positiveNumber:s.TypeSignature.numberRange(Math.pow(2,-52),1/0),nonNegativeNumber:s.TypeSignature.numberRange(0,1/0),percent:s.TypeSignature.numberRange(0,1)}),Object.freeze(s)}),define("passages",["jquery","utils/naturalsort","utils","markup","internaltypes/twineerror"],function(t,s,e,c,l){var u=e.insensitiveName,p=e.unescape,n=e.onStartup,o=e.impossible,d=Object.assign,f=RegExp(c.Patterns.macroFront+c.Patterns.macroName,"ig");function r(e){var t,r,a,o,n=e.attr("name"),i=p(e.html()),s=(t=n,o=["metadata","storylet","exclusivity","urgency"],((s=i).match(f)||[]).some(function(t){return o.some(function(e){return u(t.slice(1,-1))===e})})?(r=!1,a={},c.lex(s,t).children.forEach(function e(t){if("macro"===t.type){var n=u(t.name);if(o.some(function(e){return n===e})){if(l.isPrototypeOf(a[n]))return;if(r)return void(a[n]=l.create("syntax","The (".concat(t.name,":) macro can't appear after non-metadata macros.")));if(a[n])return void(a[n]=l.create("syntax","There is more than one (".concat(t.name,":) macro.")));a[n]=t}else r=!0;t.children.forEach(function e(t){var n=u(t.name);"macro"===t.type&&o.some(function(e){return n===e})?a[n]=l.create("syntax","The (".concat(t.name,":) macro can't be inside another macro.")):t.children.forEach(e)})}else t.children.forEach(e)}),a):{});return d(new Map([["source",i],["tags",(e.attr("tags")||"").split(/\s/)||[]],["name",n]]),{TwineScript_TypeName:"a passage datamap",TwineScript_ObjectName:"a passage datamap",metadata:s,tree:null})}var a=Object.create(null),i=[],h=null,m=d(new Map,{TwineScript_ObjectName:"the Passages datamap",getTagged:function(n){var e,r;return a[n]||(e=s("en",function(e){return e.get("name")}),r=[],this.forEach(function(e){var t=e instanceof Map&&e.get("tags");Array.isArray(t)&&t.includes(n)&&r.push(e)}),r.sort(e),a[n]=r)},clearTagCache:function(){a=Object.create(null)},clear:function(){Map.prototype.clear.call(this),this.clearTagCache(),this.clearTreeCache(),this.clearStoryletCache()},delete:function(){var e;(e=Map.prototype.delete).call.apply(e,[this].concat(Array.prototype.slice.call(arguments))),this.clearTagCache(),this.clearTreeCache(),this.clearStoryletCache()},getTree:function(e){if(!this.has(e))return o("Passages.getTree","No passage name?"),[];var t=this.get(e),n=t.get("tags");if(n.includes("header")||n.includes("footer")||n.includes("debug-header")||n.includes("debug-footer"))return t.tree||(t.tree=c.lex(t.get("source"),e)),t.tree;for(var r,a=0;a<i.length;a+=1)if(i[a]&&i[a].place===e)return r=i.splice(a,1)[0],i.unshift(r),r;n=c.lex(t.get("source"),e);return i.unshift(n),16<i.length&&i.pop(),n},clearTreeCache:function(){i=[]},getStorylets:function(r,e){var a,o,i,e=e?e.filter(r,_toConsumableArray(m.values())):_toConsumableArray(m.values());return l.containsError(e)?e:(a=[],o=-1/0,e.reduce(function(e,t){if(e)return e;e=t.get("storylet");if(e){var n=r.speculate(e,t.get("name"),"a (storylet:) macro");if(l.containsError(n))return n.message="There's an error in the storylet passage \""+t.get("name")+'":\n'+n.message,n.source=e.TwineScript_ToSource(),n;n&&(e=t.get("exclusivity"),o=Math.max(o,"number"==typeof e?e:0),a.push(t))}},void 0)||(i=s("en"),a.filter(function(e){e=e.get("exclusivity");return("number"==typeof e?e:0)===o}).sort(function(e,t){var n=e.get("urgency"),r=t.get("urgency");return(n="number"==typeof n?n:0)!==(r="number"==typeof r?r:0)?r-n:i(e.get("name"),t.get("name"))})))},allStorylets:function(){return h=h||_toConsumableArray(m.values()).filter(function(e){return e.get("storylet")})},clearStoryletCache:function(){h=null},loadMetadata:function(i){var s=[];return m.forEach(function(o){o.metadata&&Object.keys(o.metadata).forEach(function(e){var t,n,r;function a(e,t){o.has(e)?s.push(l.create("syntax","This passage's datamap already has a '"+JSON.stringify(e)+"' data name.")):o.set(e,t)}l.containsError(o.metadata[e])?s.push(o.metadata[e]):(t=o.metadata[e],n=i.speculate(t,o.get("name"),"a ("+e+":) macro"),r='In "'+o.get("name")+'":\n',l.containsError(n)?(n.message=r+n.message,n.source=t.text,s.push(n)):n instanceof Map?n.forEach(function(e,t){return a(t,e)}):a(e,n))}),o.metadata=void 0}),s},hasValid:function(e){e=this.get(e);return e&&e instanceof Map&&e.has("source")},create:r});return n(function(){t("tw-storydata > tw-passagedata").get().forEach(function(e){e=t(e),m.set(e.attr("name"),new r(e))})}),m}),define("renderer",["jquery","utils","markup","internaltypes/twineerror"],function(a,e,S,T){var _=e.escape,x=e.insensitiveName,O=e.options;function A(e,t,n){n=2<arguments.length&&void 0!==n?n:"";return"<"+t+(n?" "+n:"")+">"+e+"</"+t+">"}var C="text-align: center; max-width:50%; ";function E(m,g){function y(e,t,n){e=E(e.children,g);return e&&A(e,t,n)}var b="",v=[];if(m)for(var e,w=(m=Array.isArray(m)?m:[m]).length,k=0;k<w;k+=1)if(e=function(e){var n=m[e];switch(n.type){case"include":b+=y(n,"tw-"+n.type,'type="'.concat(n.tag,'" name="').concat(n.name,'"'));break;case"error":b+=T.create("syntax",n.message,n.explanation).render(_(n.text))[0].outerHTML;break;case"numbered":case"bulleted":for(var t="numbered"===n.type?"ol":"ul",r=(b+="<"+t+">",1);e<w&&m[e];){if("br"===m[e].type){if(b+="</li>",!m[e+1]||m[e+1].type!==n.type)break}else m[e].type===n.type?(b=(b+=("<"+t+">").repeat(Math.max(0,m[e].depth-r)))+("</"+t+">").repeat(Math.max(0,r-m[e].depth))+"<li>",r=m[e].depth):b+=E([m[e]],g);e+=1}b+=("</"+t+">").repeat(r+1);break;case"align":for(;n&&"align"===n.type;){var a=n.align,o=e+=1;if("left"===a){--e;break}for(;e<w&&m[e]&&"align"!==m[e].type;)e+=1;var o=E(m.slice(o,e),g),i="";switch(a){case"center":i+=C+"margin-left: auto; margin-right: auto;";break;case"justify":case"right":i+="text-align: "+a+";";break;default:+a&&(i+=C+"margin-left: "+a+"%;")}b+="<tw-align "+(i?'style="'+i+'"':"")+">"+o+"</tw-align>\n",n=m[e]}break;case"column":for(var s,c=[];n&&"column"===n.type;){var l=n.column,u=e+=1;if("none"===l){--e;break}for(;e<w&&m[e]&&"column"!==m[e].type;)e+=1;c.push({text:n.text,type:l,body:E(m.slice(u,e),g),width:n.width,marginLeft:n.marginLeft,marginRight:n.marginRight}),n=m[e]}c.length&&(s=c.reduce(function(e,t){return e+t.width},0),b+="<tw-columns>"+c.map(function(e){return"<tw-column type=".concat(e.type," ",' style="width:').concat(e.width/s*100,"%; margin-left: ").concat(e.marginLeft,"em; margin-right: ").concat(e.marginRight,'em;">').concat(e.body,"</tw-column>\n")}).join("")+"</tw-columns>");break;case"heading":for(b+="<h"+n.depth+">";++e<w&&m[e];){if("br"===m[e].type){b+="</h"+n.depth+">";break}b+=E([m[e]],g)}break;case"br":if(!v.length||/td|th/.test(v[0])){b+="<br>";for(var p=m[e+1];p&&("br"===p.type||"tag"===p.type&&/^<br\b/i.test(p.text));)b+="<tw-consecutive-br"+("tag"===p.type?" data-raw":"")+"></tw-consecutive-br>",p=m[(e+=1)+1]}break;case"hr":b+="<hr>";break;case"escapedLine":case"comment":break;case"inlineUrl":b+='<a class="link" href="'+_(n.text)+'">'+n.text+"</a>";break;case"scriptStyleTag":case"tag":var d=n.text.toLowerCase();/^<\/?(?:table|thead|tbody|tr|tfoot|td|th|svg)\b/.test(d)&&!n.text.endsWith("/>")&&v[n.text.startsWith("</")?"shift":"unshift"](d),b+=n.text.startsWith("</")?n.text:n.text.replace(/(\/)?>$/,function(e,t){return" data-raw".concat(t?"></".concat(n.text.match(/[\w-]+/)):"",">")});break;case"sub":case"sup":case"strong":case"em":b+=y(n,n.type);break;case"strike":b+=y(n,"s");break;case"bold":b+=y(n,"b");break;case"italic":b+=y(n,"i");break;case"twineLink":d=_slicedToArray(S.lex("(link-goto:"+JSON.stringify(n.innerText)+","+JSON.stringify(n.passage)+")").children,1)[0];b+='<tw-expression type="macro" name="link-goto"'+(O.debug?' title="'+_(n.text)+'"':"")+' code="'+g.code.length+'"></tw-expression>',g.code.push(d);break;case"hook":b+="<tw-hook "+(n.hidden?"hidden ":"")+(n.name?'name="'+x(n.name)+'"':"")+(O.debug&&n.name?' title="Hook: ?'+n.name+'"':"")+' source="'+g.source.length+'"></tw-hook>',g.source.push(n.children);break;case"unclosedHook":return b+="<tw-hook "+(n.hidden?"hidden ":"")+(n.name?'name="'+x(n.name)+'"':"")+'source="'+g.source.length+'"></tw-hook>',g.source.push(m.slice(e+1,w)),{v:b};case"verbatim":b+=A(_(n.innerText).replace(/\n/g,"<br>"),"tw-verbatim");break;case"collapsed":b+=y(n,"tw-collapsed");break;case"unclosedCollapsed":return{v:b+="<tw-collapsed>"+E(m.slice(e+1,w),g)+"</tw-collapsed>"};case"variable":case"tempVariable":case"macro":var f=[],h=[];if("macro"===n.type&&!function e(t){"string"!==t.type&&"hook"!==t.type&&t.children.every(e);var n=x(t.name);if("macro"!==t.type||"prompt"!==n&&"confirm"!==n){if("hook"===t.type&&!t.everyLeaf(function(e){return"error"!==e.type||(h.push(e),!1)}))return!1}else f.push(t);return!0}(n),h.length)return{v:T.create("syntax","This code hook's markup contained "+h.length+" error"+(h.length?"s":"")+":<br>\u2014"+h.map(function(e){return e.message}).join("<br>\u2014")).render(_(n.text))[0].outerHTML};d=f.map(function(e){return e.blockerTree=g.blockers.length,g.blockers.push(e),e.blockerTree});b+='<tw-expression type="'+n.type+'" name="'+_(n.name||n.text)+'"'+(O.debug?' title="'+_(n.text)+'"':"")+(d.length?' blockers="'+d+'"':"")+' code="'+g.code.length+'"></tw-expression>',g.code.push(n);break;default:b+=n.children&&n.children.length?E(n.children,g):n.text}k=e}(k))return e.v;return b}return Object.freeze({exec:function(e){var r={code:[],blockers:[],source:[]},e=E(e="string"==typeof e?S.lex(e).children:e,r),e=a(a.parseHTML(e,document,!0));return e.findAndFilter("script:not([src])").each(function(e,t){var n=t.getAttribute("type");n&&"text/javascript"!==n.toLowerCase()||t.setAttribute("type","application/x-harlowe")}),r.blockers=r.blockers.map(function(e){e.blockedValue=!0;e=Object.create(e);return e.blockedValue=!1,e}),e.findAndFilter("tw-expression[code]:not([data-raw]), tw-expression[blockers]:not([data-raw]), tw-hook[source]:not([data-raw])").each(function(e,t){var n;(t=a(t)).attr("blockers")&&(n=t.popAttr("blockers").split(",").map(function(e){return r.blockers[e]}),t.data("blockers",n)),t.attr("source")&&t.data("source",r.source[t.popAttr("source")]),t.attr("code")&&t.data("code",r.code[t.popAttr("code")])}),e}})}),define("repl",["utils","markup","section"],function(e,t,n){e.onStartup(function(){return setTimeout(function(){e.options.debug&&(window.REPL=function(e){e=n.create().eval(t.lex("(print:"+e+")"));return e.TwineScript_Run?e.TwineScript_Run().source:e},window.LEX=function(e){e=t.lex(e);return 1===e.length?e[0]:e})})})}),define("section",["jquery","utils","twinescript/runner","twinescript/operations","state","utils/operationutils","utils/renderutils","utils/scripttag","datatypes/changercommand","datatypes/colour","datatypes/lambda","datatypes/codehook","internaltypes/changedescriptor","internaltypes/varscope","internaltypes/twineerror","internaltypes/twinenotifier"],function(p,f,a,u,r,e,t,i,d,h,o,m,g,y,b,v){var w=e.printBuiltinValue,k=e.objectName,S=e.typeID,T=e.isObject,s=t.collapse,_=Object.assign,x=Object.create,O=Object.keys;function A(e,t,n){if(t&&"object"===_typeof(t)&&d.isPrototypeOf(t)){var r=n.popData("source")||(null==(r=n[0].cachedData)?void 0:r.source),a=(null!=(a=n[0])&&a.cachedData&&(n[0].cachedData.source=void 0),n.data("originalSource",r),g.create({target:n,source:r,section:this,append:"append"})),o=t.run(a);if(b.containsError(o)&&e.replaceWith(o.render(e.attr("title"))),!this.renderInto(r,null,a))return o=f.insensitiveName(e.attr("name")),["if","elseif","unless","else","testfalse"].includes(o)&&(e.addClass("false"),"elseif"!==o)&&(this.stackTop.lastHookShown=!1),n.data("live")&&function(t,n,r){function a(e){p&&(d-=(e-p)*(f.options.debug&&void 0!==f.options.speedMultiplier?f.options.speedMultiplier:1)),p=e,0<d?requestAnimationFrame(a):(d=s,o())}var o,i=this,e=r.data("live"),s=e.delay,c=e.event,l=((n=_objectSpread(_objectSpread({},n),{},{append:"replace",transitionDeferred:!1,enabled:!0})).data=_objectSpread(_objectSpread({},n.data),{},{live:void 0}),r.data("originalSource")||""),u=this.stackTop.tempVariables,p=null,d=s;o=this.whenUnblocked.bind(this,function(){var e;i.inDOM()&&(e=null==c?void 0:c.filter(i,[!0],u),b.containsError(e)?e.render(i,t.attr("title")).replaceAll(t):c&&!e[0]?requestAnimationFrame(a):(i.renderInto(l,r,n,u),e||r.find("tw-expression[name='stop']").length||i.inDOM()&&requestAnimationFrame(a)))}),requestAnimationFrame(a)}.call(this,e,a,n),!0}else{if(!1===t)return o=n.popData("source")||(null==(r=n[0].cachedData)?void 0:r.source),null!=(a=n[0])&&a.cachedData&&(n[0].cachedData.source=void 0),o&&(n.cachedData&&(n.cachedData.source=void 0),n.data("originalSource",o),n.data("hidden",!0)),e.addClass("false"),!(this.stackTop.lastHookShown=!1);if(!0!==t)return!1}return this.stackTop.lastHookShown=!0}function C(e){var t,n,e=(e instanceof p?e[0]:e).nextSibling;return e&&(e instanceof Text&&!e.textContent.trim()||["br","tw-consecutive-br"].includes((e.tagName||"").toLowerCase()))?(t=(n=C(e)).whitespace,n=n.nextElem,{whitespace:p(e).add(t),nextElem:n}):{whitespace:p(),nextElem:p(e)}}function E(e){if(null!=e&&e.length)return p("<tw-open-button replay label='\ud83d\udd0d'>").data("evalReplay",e)}function c(e,t){var n=this.eval(t);e.append(E(this.evalReplay)),e.append(function(e,t){if(/a \((go-to|undo|redirect|restart):\) command/.exec(null==t?void 0:t.TwineScript_TypeName))return p("<tw-open-button goto label='GO'>").data("goto",{section:e,command:t})}(this,n)),this.stackTop.evaluateOnly&&n&&(d.isPrototypeOf(n)||"function"==typeof n.TwineScript_Run)&&(n=b.create("syntax","I can't work out what ".concat(this.stackTop.evaluateOnly," should evaluate to, because it contains a ").concat(d.isPrototypeOf(n)?"changer.":"command."),"Please rewrite this without putting changers or commands here."));var r=p();for(i=e;d.isPrototypeOf(n);){var a=C(i),o=a.whitespace;if((i=a.nextElem)[0]&&i[0].nodeType===Node.TEXT_NODE&&"+"===i[0].textContent.trim()){var i,a=i,s=C(a),c=s.whitespace;if((i=s.nextElem).is("tw-expression")){var s=i.popData("code")||(null==(s=i[0])||null==(s=s.cachedData)?void 0:s.code),l=(null!=(l=i[0])&&l.cachedData&&(i[0].cachedData.code=void 0),this.eval(s));if(b.containsError(l)){n=l;break}s=u["+"](n,l);p(o).add(a).add(c).remove(),n=b.containsError(s)?b.create("operation","I can't combine "+k(n)+" with "+k(l)+".","function"==typeof l.TwineScript_Run?"If you want to attach this changer to ".concat(k(l),", remove the + between them."):"Changers can only be added to other changers."):s;continue}}if(i.is("tw-expression")){c=i.popData("code")||(null==(a=i[0])||null==(a=a.cachedData)?void 0:a.code),s=(null!=(l=i[0])&&l.cachedData&&(i[0].cachedData.code=void 0),this.eval(c));if(i.append(E(this.evalReplay)),b.containsError(s)){n=s;break}if(s&&"object"===_typeof(s)&&"function"==typeof s.TwineScript_Attach){n=s.TwineScript_Attach(this,n);break}return d.isPrototypeOf(s)?void e.replaceWith(b.create("operation","Changers like (".concat(n.macroName,":) need to be combined using + between them."),"Place the + between the changer macros, or the variables holding them. The + is absent only between a changer and its attached hook or command.").render(e.attr("title"))):void e.replaceWith(b.create("operation","".concat(k(s)," can't have changers like (").concat(n.macroName,":) attached."),"Changers placed just before hooks, links and commands will attempt to attach, but in this case it didn't work.").render(e.attr("title")))}if(i.is("tw-hook")){o.remove(),r=i;break}n.macroName||f.impossible("Section.runExpression","changer has no macroName");a=e.attr("title")||"("+n.macroName+": ...)";return void e.replaceWith(b.create("syntax","The (".concat(n.macroName,":) changer should be stored in a variable or attached to a hook."),"Macros like this should appear before a hook: ".concat(a,"[Some text]")).render(e.attr("title")))}e.attr("return",S(n)),r=r.length?r:C(e).nextElem.filter("tw-hook"),(t=b.containsError(n))?e.replaceWith(t.render(e.attr("title")).append(E(this.evalReplay))):v.isPrototypeOf(n)?e.append(n.render()):n&&"function"==typeof n.TwineScript_Run?(n=n.TwineScript_Run(this),b.containsError(n)?e.replaceWith(n.render(e.attr("title"))):g.isPrototypeOf(n)?null!=(t=n.data)&&t.live?e.replaceWith(b.create("unimplemented","I currently can't attach (live:) or (event:) macros to commands - only hooks.").render(e.attr("title"))):(n.section=this,n.target=i,this.renderInto("",i,n)):T(n)&&n.blocked?(this.stackTop.blocked=n.blocked,e.data("code",{type:"macro",blockedValue:!0,text:e.attr("title")||"",start:0,end:(e.attr("title")||"").length})):n&&f.impossible("Section.runExpression","TwineScript_Run() returned a non-ChangeDescriptor ".concat(_typeof(n),': "').concat(n,'"'))):r.length&&A.call(this,e,n,r)||("string"==typeof n||"number"==typeof n||n instanceof Map||n instanceof Set||Array.isArray(n)||h.isPrototypeOf(n)||m.isPrototypeOf(n)||n&&"function"==typeof n.TwineScript_Print&&!d.isPrototypeOf(n)?(n=w(n),b.containsError(n)?e.replaceWith(n.render(e.attr("title"))):"string"==typeof n||Array.isArray(n)?this.renderInto(n,e):f.impossible("printBuiltinValue() produced a non-string non-array ".concat(_typeof(n)))):d.isPrototypeOf(n)||"boolean"==typeof n||f.impossible("Section.runExpression","The expression evaluated to an unknown value: ".concat(n)))}var l={add:[],remove:[]};return Object.preventExtensions({create:function(){var e=0<arguments.length&&void 0!==arguments[0]?arguments[0]:f.storyElement,n=_(x(this),{timestamp:Date.now(),dom:e,stack:[],enchantments:[],unblockCallbacks:[],freeVariables:null,evalReplay:null,loadedGame:!1,Identifiers:{TwineScript_Identifiers:!0,it:0,get time(){var e;return null!=(e=n.stackTop)&&e.evaluateOnly?b.create("operation","'time' can't be used in ".concat(n.stackTop.evaluateOnly,".")):(Date.now()-n.timestamp)*(f.options.debug&&void 0!==f.options.speedMultiplier?f.options.speedMultiplier:1)},get turns(){return r.turns},get turn(){return r.turns},get visits(){var t=n.stackTop.speculativePassage;return r.history().filter(function(e){return e===(t||r.passage)}).length+(!t||t===r.passage)},get visit(){return n.Identifiers.visits},get exits(){var e;return null!=(e=n.stackTop)&&e.evaluateOnly?b.create("operation","'exit' and 'exits' can't be used in ".concat(n.stackTop.evaluateOnly,".")):n.dom.find("tw-enchantment, tw-link").filter(function(e,t){return(t=p(t)).data("enchantmentEvent")||t.parent().data("linkPassageName")||t.parent().data("clickEvent")}).length},get exit(){return n.Identifiers.exits},get pos(){return n.stackTop&&!n.stackTop.evaluateOnly&&n.stackTop.lambdaPos?+n.stackTop.lambdaPos||1:b.create("operation","'pos' can only be used in lambdas that aren't 'when' lambdas.")}}});return n},eval:function(t){var e,n;f.options.debug&&f.options.evalReplay&&(n=Array.isArray(t)?t.reduce(function(e,t){return e+t.text},""):t.text||"",this.evalReplay=[{code:n,fromCode:n,basis:(Array.isArray(t)?t[0]:t).start,start:0,end:n.length,diff:0}]);try{e=a(this,t)}catch(e){return null!=(n=window.console)&&n.error(e),this.evalReplay=null,b.create("","An internal error occurred while trying to run ".concat([].concat(t).map(function(e){return e.text}).join(""),"."),'The error was "'.concat(e.message,'".\nIf this is the latest version of Harlowe, please consider reporting a bug (see the documentation).'))}return this.evalReplay&&2===this.evalReplay.length&&this.evalReplay.shift(),e},get stackTop(){return this.stack[0]},inDOM:function(){return 0<f.storyElement.find(this.dom).length},evaluateTwineMarkup:function(e,t){var n=p("<p>");return this.stack.unshift({desc:g.create({target:n,source:e,section:this,append:"append"}),tempVariables:this.stackTop.tempVariables,evaluateOnly:t,finalIter:!0}),this.execute(),0<(e=n.find("tw-error")).length?e:n},speculate:function(e,t,n){this.stack.unshift({evaluateOnly:n,finalIter:!0,tempVariables:_(x(y),{TwineScript_VariableStore:{type:"temp",name:n}}),speculativePassage:t});var r,n=this.evalReplay;return this.evalReplay=null,o.isPrototypeOf(e)?r=e.apply(this,{fail:!1,pass:!0}):e&&(r=a(this,e)),this.stack.shift(),this.evalReplay=n,r},renderInto:function(e,a,t){var o=this,r=3<arguments.length&&void 0!==arguments[3]?arguments[3]:null,i=g.create({target:a,source:e,section:this,append:"append"});if(t)if(d.isPrototypeOf(t)){var e=t.run(i);if(b.containsError(e))return e.render(a.attr("title")).replaceAll(a),!1}else _(i,t);if((a=i.target,50<=this.stack.length)&&50<=this.stack.reduce(function(e,t){return e+!!t.finalIter},0))return b.create("infinite","Printing this expression may have trapped me in an infinite loop.").render(a.attr("title")).replaceAll(a),!1;var s=function(e,t,n){var r=a instanceof p&&a.is("tw-hook")&&0<a.parents("tw-collapsed,[collapsing=true]").length;o.stack.unshift({desc:e,finalIter:n,tempVariables:t,collapses:r,evaluateOnly:o.stackTop&&o.stackTop.evaluateOnly})},r=r||x(this.stack.length?this.stackTop.tempVariables:y),t=(hasOwnProperty.call(r,"TwineScript_VariableStore")||(t=null==(e=a)?void 0:e.tag(),r.TwineScript_VariableStore={type:"temp",name:"tw-hook"===t?a.attr("name")?"?"+a.attr("name"):"an unnamed hook":"tw-expression"===t?"a "+a.attr("type")+" expression":"tw-passage"===t?"this passage":"an unknown scope"}),null==(e=this.stackTop)?void 0:e.blocked);if(O(i.loopVars).length){var c=_objectSpread({},i.loopVars),l=Math.min.apply(Math,_toConsumableArray(O(c).map(function(e){return c[e].length})));if(v.create(l+" loop"+(1!==l?"s":"")).render().prependTo(a),l){for(var n=l-1;0<=n;--n)!function(n){s(i,O(c).reduce(function(e,t){return e[t]=c[t][n],e},x(r),n===l-1))}(n);for(var u=l-1;0<=u&&!this.stackTop.blocked;--u)this.execute()}}else s(i,r,!0),this.execute();return(0===this.stack.length||!t&&null!=(e=this.stackTop)&&e.blocked)&&this.updateEnchantments(),i.enabled},execute:function(){var a=this,e=this.stackTop,t=e.desc,n=e.dom,r=e.collapses,o=e.evaluateOnly;t&&!n&&(n=t.render(),this.stackTop.dom=n,this.stackTop.desc=void 0),n.findAndFilter('tw-hook,tw-expression,script[type="application/x-harlowe"]').each(function(e,t){var n=p(t).data();t.cachedData={blockers:n.blockers,code:n.code,source:n.source}}).each(function(e,t){if(a.stackTop.blocked)return!1;var n=t.cachedData;switch(n&&(t.cachedData=void 0),(t=p(t)).tag()){case"tw-hook":var r=t.popData("source")||(null==n?void 0:n.source);(r&&t.data("originalSource",r),t.data("tempVariables",a.stackTop.tempVariables),t.popAttr("hidden"))?t.data("hidden",!0):r&&a.renderInto(r,t);break;case"tw-expression":var r=t.data("blockers")||(null==n?void 0:n.blockers);if(r){if(o)return void t.removeData("blockers").removeData("code").replaceWith(b.create("syntax","I can't use a macro like (prompt:) or (confirm:) in ".concat(o,"."),"Please rewrite this without putting such macros here.").render(t.attr("title"),t));if(r.length)return a.stackTop.blocked=!0,r=a.eval(r.shift()),b.containsError(r)&&(a.stackTop.blocked=!1,t.removeData("blockers").replaceWith(r.render(t.attr("title"),t))),!1;t.removeData("blockers")}r=t.popData("code")||(null==n?void 0:n.code);r&&c.call(a,t,r);break;case"script":if(f.reattachStoryElement(),t.text())try{i(t.text(),a.stackTop.tempVariables)}catch(e){b.isPrototypeOf(e)?t.replaceWith(e.render(t.text(),t)):(null!=(r=window.console)&&r.error(e),t.replaceWith(b.create("","A Javascript error occurred while running this <script> element.",'The error was "'.concat(e,'". Check the browser console for more details.')).render(t.text(),t)))}}}),this.stackTop.blocked||(n.length&&r&&s(n),n.findAndFilter("tw-collapsed,[collapsing=true]").each(function(){s(p(this))}),setTimeout(function(){return n.find("input, textarea").first().focus()},100),this.stack.shift())},updateEnchantments:function(){this.enchantments.forEach(function(e){e.disenchant(),e.enchantScope()})},on:function(e,t){return l[e].push(t),this},addEnchantment:function(t){var n=this;this.enchantments.push(t),l.add.forEach(function(e){return e(n,t)})},removeEnchantment:function(t){var n=this,e=this.enchantments.indexOf(t);this.enchantments.splice(e,1),t.disenchant(),l.remove.forEach(function(e){return e(n,t)})},unblock:function(e){for(this.stack.length||f.impossible("Section.unblock","stack is empty"),this.stackTop.blocked=!1,void 0!==e&&(this.stackTop.blockedValues=(this.stackTop.blockedValues||[]).concat(e));this.stack.length&&!this.stackTop.blocked;)this.execute();if(!this.stack.length)for(;0<this.unblockCallbacks.length;){var t;if(this.unblockCallbacks.shift()(),null!=(t=this.stackTop)&&t.blocked)return}},whenUnblocked:function(e,t){this.stack.length&&this.stackTop.blocked?this.unblockCallbacks=this.unblockCallbacks.concat(e):(t||e)()},blockedValue:function(){var e=this.stackTop;return e?e.blockedValues&&e.blockedValues.length?e.blockedValues.shift():(f.impossible("Section.blockedValue","blockedValues is missing or empty"),0):(f.impossible("Section.blockedValue","stack is empty"),0)}})}),define("state",["jquery","utils","passages","datatypes/customcommand","utils/operationutils","markup"],function(n,y,b,v,e,t){var i,w,C=e.toSource,E=e.is,k=t.lex,o=Object.assign,h=Object.create,e=Object.defineProperty,N=Array.isArray,s=Math.imul,t=(e(Map.prototype,"toJSON",{value:void 0}),e(Set.prototype,"toJSON",{value:void 0}),["localStorage","sessionStorage"].map(function(e){try{return!!window[e]&&(window[e].setItem("test","1"),window[e].removeItem("test"),!0)}catch(e){return!1}}));function S(e,t){var n=0<arguments.length&&void 0!==e?e:String.fromCodePoint(Date.now()%1114112),e=1<arguments.length&&void 0!==t?t:0;i.seedIter=e,i.seed=n;for(var r,a=0,o=2166136261;a<n.length;a+=1)r=s(n.charCodeAt(a),3432918353),o^=s(r<<15|r>>>17,461845907),o=s(o=o<<13|o>>>19,5)+3864292196|0;return o^=n.length,o=s(o^=o>>>16,2246822507),o=s(o^=o>>>13,3266489909),o=((o^=o>>>16)>>>0)+1831565813*e,function(){i.seedIter+=1;var e=o+=1831565813,e=s(e^e>>>15,1|e);return(((e^=e+s(e^e>>>7,61|e))^e>>>14)>>>0)/4294967296}}function r(e,t){for(var n,r=t.variables,a=h(null),o=e.length-1;0<=o;--o){for(var i,s,c=e[o],l=0,u=["mockVisits","mockTurns","seed","seedIter"];l<u.length;l++){var p=u[l];hasOwnProperty.call(c,p)&&!hasOwnProperty.call(t,p)&&(t[p]=c[p])}for(i in c.forgetVisits&&(t.forgetVisits=Math.max(t.forgetVisits||0,c.forgetVisits)),void 0!==c.turns&&(t.turns=(t.turns||0)+c.turns),t.pastVisits||(t.pastVisits=[]),o!==e.length-1&&(void 0!==e[o+1].visits&&Array.isArray(t.pastVisits[0])?t.pastVisits[0]:t.pastVisits).unshift(c.passage),void 0!==c.pastVisits&&t.pastVisits.unshift(c.pastVisits),void 0!==c.visits&&t.pastVisits.unshift(c.visits),c.variables)if("TwineScript_TypeDefs"===i)for(var d in r[i]||(r[i]=h(null)),c.variables[i])r[i][d]||(r[i][d]=c.variables[i][d]);else i.startsWith("TwineScript_")||i in r||(null===c.variables[i]&&(a[i]=!0),a[i])||(r[i]=c.variables[i],!(s=c.valueRefs[i]))||"via"in s||t.valueRefs[i]||(t.valueRefs[i]=s)}for(n in t.valueRefs){var f=t.valueRefs[n];f&&"via"in f&&delete t.valueRefs[n]}}var a,c={passage:"",variables:h(null),visits:void 0,turns:void 0,seed:void 0,seedIter:void 0,mockVisits:void 0,mockTurns:void 0,forgetVisits:void 0,create:function(e){var t=h(c);return t.passage=e||"",t.variables=h(null),t.valueRefs=h(null),t}},l={forward:[],back:[],load:[],beforeForward:[],beforeBack:[],beforeLoad:[],forgetUndos:[]},u=[],p=-1,d=c.create(),f="";function m(){i.history=i.pastVisits.slice(i.forgetVisits).reduce(function(e,t){return e.concat(t)},[]),i.mockVisits&&(i.history=i.mockVisits.concat(i.history))}function g(){var e=c.create();e.pastVisits=[],o(e.variables,{TwineScript_ObjectName:"this story's variables",TwineScript_TypeDefs:h(null),TwineScript_VariableStore:{type:"global",name:"this story's variables"},TwineScript_Delete:function(e){delete this[e],d.variables[e]=null,delete d.valueRefs[e]},TwineScript_Set:function(e,t,n){if(this[e]=t,d.variables[e]=t,n)d.valueRefs[e]=n;else if((N(t)||t instanceof Map||t instanceof Set||"string"==typeof t)&&!y.options.uncompressedStructures)for(var r=p;0<=r;--r){var a=u[r].variables[e];if(void 0!==a){a=function e(t,n,r){var a="it"===r?"its":r+"'s",o="";if(N(n)&&N(t)&&n.length){for(var i=n.length===t.length,o="(a:",s=0;s<n.length;s+=1){var c,l,u,p=n[s];E(p,t[s])?(c=C(p),l="".concat(a," ").concat(s+1,"th"),o+=(c.length<l.length?c:l)+","):(i=!1,-1<(c=t.indexOf(p))?(l=C(p),u="".concat(a," ").concat(c+1,"th"),o+=(l.length<u.length?l:u)+","):o+=e(t[s],p,"".concat(a," ").concat(s+1,"th"))+",")}o=i?r:o.slice(0,-1)+")"}else if(n instanceof Map&&t instanceof Map&&n.size){var d,f=n.size===t.size,h=(o="(dm:",_createForOfIteratorHelper(n.entries()));try{for(h.s();!(d=h.n()).done;){var m,g,y=_slicedToArray(d.value,2),b=y[0],v=y[1];o+="".concat(C(b),","),E(v,t.get(b))?(m=C(v),g="".concat(a," (").concat(C(b),")"),o+=(m.length<g.length?m:g)+","):(f=!1,o+=e(t.get(b),v,"".concat(a," (").concat(C(b),")"))+",")}}catch(e){h.e(e)}finally{h.f()}o=f?r:o.slice(0,-1)+")"}else if(n instanceof Set&&t instanceof Set&&n.size){var w,k=new Set,S=new Set,T=_createForOfIteratorHelper(t);try{for(T.s();!(w=T.n()).done;){var _=w.value;n.has(_)||k.add(_)}}catch(e){T.e(e)}finally{T.f()}var x,O=_createForOfIteratorHelper(n);try{for(O.s();!(x=O.n()).done;){var A=x.value;t.has(A)||S.add(A)}}catch(e){O.e(e)}finally{O.f()}k.size||S.size||(o=r),o=k.size+S.size>n.size?C(n):r+(S.size?"+"+C(S):"")+(k.size?"-"+C(k):"")}else"string"==typeof n&&"string"==typeof t&&n&&(n.startsWith(t)?o=r+"+"+C(n.slice(t.length)):n.endsWith(t)&&(o=C(n.slice(0,n.length-t.length))+"+"+r));return o?"it"===r?{via:o}:o:"it"===r?void 0:C(n)}(a,t,"it");a&&("it"===a.via?delete d.variables[e]:d.valueRefs[e]=a);break}}},TwineScript_GetProperty:function(e){return this[e]},TwineScript_DefineType:function(e,t){this.TwineScript_TypeDefs[e]=t,hasOwnProperty.call(d.variables,"TwineScript_TypeDefs")||(d.variables.TwineScript_TypeDefs=h(null)),d.variables.TwineScript_TypeDefs[e]=t}}),r(u.slice(0,p+1),e),i=e,m(),w=S(e.seed,e.seedIter)}function T(e){d=c.create(e);e=a.serialise(!0),f=e.past,e=e.pastAndPresent;if(a.hasSessionStorage&&"string"==typeof e)try{sessionStorage.setItem("Saved Session",e)}catch(e){}}function _(e,t,n,r){for(var a in r)if(hasOwnProperty.call(r,a)&&!a.startsWith("TwineScript_"))if("object"===_typeof(r[a]))if(hasOwnProperty.call(r[a],"at")){n.valueRefs[a]=r[a];var o=r[a],i=o.at,s=o.from,c=o.to,l=o.hash,u=o.seed,p=o.seedIter,o=o.blockedValues;if(!b.has(i))throw Error('The data refers to a passage named `"'.concat(n.passage,"\"`, but it isn't in this story."));var d=b.get(i).get("source"),f=d.slice(s,c);if(void 0!==l)for(var h=0,m=c-s;y.hash(f).toString(16)!==l;){if(h+m>=d.length)throw Error("The value (or type) of the variable `$".concat(a,"` couldn't be found in the passage `\"").concat(i,'"`.'));(h+=1)===s&&(h+=1),f=d.slice(h,h+m)}c=k(f,"","macro");void 0!==u&&void 0!==p&&(w=S(u,p)),void 0!==o&&(e.stackTop.blockedValues=o,c.forEach(function e(t){var n;"string"!==t.type&&"hook"!==t.type&&t.children.every(e),"macro"!==t.type||"prompt"!==(n=y.insensitiveName(t.name))&&"confirm"!==n||(t.blockedValue=!0)})),r[a]=e.eval(c)}else if(hasOwnProperty.call(r[a],"via")){for(var g=t.length-1;0<=g;--g)if(hasOwnProperty.call(t[g].variables,a)){e.Identifiers.it=t[g].variables[a];break}r[a]=e.eval(k(r[a].via,"","macro")),e.Identifiers.it=0}else hasOwnProperty.call(r[a],"changer")&&(r[a].changer=e.eval(k(r[a].changer,"","macro")),r[a].hook=e.eval(k(r[a].hook,"","macro")),_(e,t,n,r[a].variables),r[a]=v.create(r[a]));else r[a]=e.eval(k(r[a],"","macro"));else"TwineScript_MockVisits"===a&&(n.mockVisits=r[a])}return g(),d.seed=i.seed,d.seedIter=0,(a={get passage(){return d.passage},get variables(){return i.variables},get pastLength(){return p},get turns(){return p+1+(i.turns||0)+(i.mockTurns||0)},get futureLength(){return u.length-1-p},get mockVisits(){return i.mockVisits||[]},set mockVisits(e){i.mockVisits=e,d.mockVisits=e,m()},get mockTurns(){return i.mockTurns||0},set mockTurns(e){i.mockTurns=e,d.mockTurns=e},history:function(){return i.history},forgetUndos:function(e){e<0&&(e=u.length+e);var t,e=u.splice(0,Math.min(u.length-1,e));e.length&&(p=u.length-1,t=u[0],r(e,t),t.pastVisits.push(e[e.length-1].passage),t.turns=(t.turns||0)+e.length,i.turns=(i.turns||0)+e.length,t.forgetVisits&&(t.pastVisits=t.pastVisits.slice(t.forgetVisits-t.turns),t.forgetVisits-=t.turns),f="",0===p&&n("tw-link[undo], tw-icon[alt='Undo']",y.storyElement).each(function(e,t){(n(t).closest("tw-expression, tw-hook").data("forgetUndosEvent")||Object)(t)}),l.forgetUndos.forEach(function(e){return e()}))},forgetVisits:function(e){(e=e<0?u.length+e:e)>p+i.turns&&(e=p+i.turns),d.forgetVisits=i.forgetVisits=Math.max(i.forgetVisits||0,e),m()},passageNameVisited:function(e){var t=0;if(!b.get(e))return 0;for(var n=0;n<i.history.length;n++)t+=+(e===i.history[n]);return t},get timeline(){return u},play:function(t){var e;d||y.impossible("State.play","present is undefined!"),l.beforeForward.forEach(function(e){return e()}),d.passage&&((null!=(e=d.visits)&&e.length&&Array.isArray(i.pastVisits[i.pastVisits.length-1])?i.pastVisits[i.pastVisits.length-1]:i.pastVisits).push(d.passage),i.history.push(d.passage)),d.passage=t,u=u.slice(0,p+1).concat(d),p+=1,T(t),l.forward.forEach(function(e){return e(t)})},redirect:function(e){var t;d||y.impossible("State.redirect","present is undefined!"),d.passage&&(null!=(t=d.visits)&&t.length&&Array.isArray(i.pastVisits[i.pastVisits.length-1])?i.pastVisits[i.pastVisits.length-1].push(d.passage):i.pastVisits.push([d.passage]),i.history.push(d.passage)),d.visits=(d.visits||[]).concat(e),d.passage=e},rewind:function(e){for(var t=void 0!==e?e:1,n=!1;0<t&&0<p;t--)n=!0,--p;return n&&(l.beforeBack.forEach(function(e){return e()}),f="",T(u[p].passage),g(),l.back.forEach(function(e){return e()})),n},fastForward:function(e){var t=1,n=!1;for("number"==typeof e&&(t=e);0<t&&0<u.length;t--)n=!0,p+=1;return n&&(l.beforeForward.forEach(function(e){return e()}),T(u[p].passage),g(),l.forward.forEach(function(e){return e(u[p].passage,"fastForward")})),n},on:function(e,t){if(e in l)return"function"!=typeof t||l[e].includes(t)||l[e].push(t),a;y.impossible("State.on","invalid event name")},reset:function(){l.beforeLoad.forEach(function(e){return e()}),u=[],p=-1,g(),(d=c.create()).seed=i.seed,d.seedIter=0,f="",w=S(),l.load.forEach(function(e){return e(u)})},hasStorage:t[0],hasSessionStorage:t[1],setSeed:function(e){w=S(e),d.seed=i.seed,d.seedIter=0},get seed(){return i.seed},get seedIter(){return i.seedIter},random:function(){var e=w();return d.seedIter=i.seedIter,e},shuffled:function(){for(var a=this,e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];var r=t.reduce(function(e,t,n){var r=a.random()*(n+1)|0;return r===n?e.push(t):(e.push(e[r]),e[r]=t),e},[]);return d.seedIter=i.seedIter,r}}).serialise=function(e){function o(e,t){if("TwineScript_TypeDefs"===t){var n,r={};for(n in e[t])r[n]=C(e[t][n]);return r}var a;return null===e[t]?null:e[t]&&hasOwnProperty.call(e[t],"TwineScript_CustomCommand")?(a=e[t].TwineScript_CustomCommand(),{changer:C(a.changer),toSource:a.toSource,hook:C(a.hook),variables:Object.keys(a.variables).reduce(function(e,t){return e[t]=o(a.variables,t),e},{})}):C(e[t])}function t(e,t){if(c.isPrototypeOf(t)&&void 0===t.visits&&void 0===t.turns&&void 0===t.mockVisits&&void 0===t.forgetVisits&&void 0===t.pastVisits&&void 0===t.mockTurns&&void 0===t.seed&&void 0===t.seedIter&&Object.keys(t.variables).every(function(e){return e.startsWith("TwineScript_")}))return t.passage;if(!c.isPrototypeOf(this)||"valueRefs"!==e){if(c.isPrototypeOf(this)&&"variables"===e){var n,r={};for(n in this.variables)this.valueRefs[n]?r[n]=this.valueRefs[n]:r[n]=o(this.variables,n);return r}return t}}var e=u.slice(f?e?p-1:p:0,p+1),n=e.slice(0,-1),r=f;try{return{past:r=n.length?(r?r.slice(0,-1)+",":"[")+JSON.stringify(n,t).slice(1):r,pastAndPresent:r.slice(0,-1)+(r?",":"[")+JSON.stringify(e.slice(-1),t).slice(1)}}catch(e){return{past:!1,pastAndPresent:!1}}},a.deserialise=function(e,t){var n;try{n=JSON.parse(t)}catch(e){return Error("The save data is unintelligible.")}if(!N(n))return Error("The save data isn't a sequence of past turns.");for(var r=0;r<n.length;r+=1){var a=n[r];if("string"==typeof a)a={passage:a,variables:{}};else if("object"!==_typeof(a)||!hasOwnProperty.call(a,"variables")){n.splice(r--,1);continue}if(a.valueRefs=h(null),a.variables=o(h(null),a.variables),!b.hasValid(a.passage))return Error('The data refers to a passage named `"'.concat(a.passage,"\"`, but it isn't in this story."));if(hasOwnProperty.call(a.variables,"TwineScript_TypeDefs"))try{_(e,n.slice(0,r),a,a.variables.TwineScript_TypeDefs)}catch(e){return Error("The variable types on turn ".concat(r+1," couldn't be reconstructed.").concat(e.message?" (".concat(e.message,")"):""))}try{_(e,n.slice(0,r),a,a.variables)}catch(e){return Error("The variables on turn ".concat(r+1," couldn't be reconstructed.").concat(e.message?" (".concat(e.message,")"):""))}n[r]=o(h(c),a)}return p=(u=n).length-1,l.load.forEach(function(e){return e(u)}),f="",g(),T(u[p].passage),!0},Object.seal(c),Object.freeze(a)}),define("utils",["jquery","markup","utils/polyfills"],function(d){var r=String.fromCharCode,n="audio,blockquote,canvas,div,h1,h2,h3,h4,h5,hr,ol,p,pre,table,ul,video,tw-align,tw-story,tw-passage,tw-sidebar,tw-columns,tw-column,tw-meter".split(","),a="a,b,i,em,strong,sup,sub,abbr,acronym,s,strike,del,big,small,script,img,button,input,tw-link,tw-broken-link,tw-verbatim,tw-collapsed,tw-error,tw-colour,tw-icon".split(","),f=["audio"],e=_slicedToArray([function(e){return r(e)!==r(e).toLowerCase()},function(e){return r(e)!==r(e).toUpperCase()},function(e){return r(e).toLowerCase()!==r(e).toUpperCase()}].map(function(e){return"["+Array.from(Array(57343)).map(function(e,t){return t}).filter(e).map(function(e,t,n){return e===n[t-1]+1&&e===n[t+1]-1?"-":r(e)}).join("").replace(/-+/g,"-")+"]"}),3),t=e[0],o=e[1],e=e[2];function s(e){return"instant"===e?0:800}var i,c,l=[],u={},p=0,h={},m=0,g={};function y(n,r,e,a,o){var i=null,s=0,c=r+e;function l(e){var t;1&n[0].compareDocumentPosition(document)&&(c=0),i&&(c-=t=e-i),i=e,0<a&&0<p+m&&n.data("expediteAnim")(a),c<=r&&(s+=t||0,"paused"===n.css("animation-play-state"))&&n.css({visibility:"","animation-play-state":"running"}),c<=0?(n.removeData("expediteAnim"),o()):requestAnimationFrame(l)}n.data("expediteAnim",function(e){var t;c-=e=void 0===e?s:e,"running"===n.css("animation-play-state")&&n.css("animation-delay",(("ms"===(t=(t=n.css("animation-delay")).toLowerCase()).slice(-2)?+t.slice(0,-2)||0:"s"===t.slice(-1)&&1e3*+t.slice(0,-1)||0)||0)-e+"ms")}),c?requestAnimationFrame(l):l()}d(document.documentElement).on("keydown keyup mousedown mouseup",function(e){var t=e.key,n=e.button,e=e.type.includes("down"),r=t?u:h,n=t&&v.insensitiveName(t)||n;r[n]&&!e?t?p=Math.max(p-1,0):m=Math.max(m-1,0):!r[n]&&e&&(t?p+=1:m+=1),r[n]=e}).on("mousemove",function(e){var t=e.pageX,e=e.pageY;g.x=t,g.y=e});var b=/-|_/g,v={hash:function(e){for(var t=9,n=e.length;0<n;)--n,t=Math.imul(t^e.charCodeAt(n),Math.pow(9,9));return(t^t>>>9)>>>0},permutations:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];for(var r,a,o=t.length,i=[[].concat(t)],s=Array(o).fill(0),c=1;c<o;)s[c]<c?(r=c%2&&s[c],a=t[c],t[c]=t[r],t[r]=a,++s[c],c=1,i.push([].concat(t))):(s[c]=0,++c);return i},nth:function(e){var t=+e+"";return e+("1"!==t[t.length-1]||1!==t.length&&"1"===t[t.length-2]?"2"!==t[t.length-1]||1!==t.length&&"1"===t[t.length-2]?"3"!==t[t.length-1]||1!==t.length&&"1"===t[t.length-2]?"th":"rd":"nd":"st")},plural:function(e,t,n){return e+" "+(1!==Math.abs(e)?n||t+"s":t)},andList:function(e){return e.length<=1?e[0]:e.slice(0,-1).join(", ")+" and "+e[e.length-1]},realWhitespace:"[ \\n\\r\\f\\t\\v\\u00a0\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]",anyRealLetter:"[\\dA-Za-z\\u00c0-\\u00de\\u00df-\\u00ff\\u0150\\u0170\\u0151\\u0171\\uD800-\\uDFFF]",anyUppercase:t,anyLowercase:o,anyCasedLetter:e,anyNewline:"(?:\\n|\\r|\\r\\n)",unescape:function(e){return e.replace(/&(?:amp|lt|gt|quot|nbsp|zwnj|#39|#96);/g,function(e){return{"&amp;":"&","&gt;":">","&lt;":"<","&quot;":'"',"&#39;":"'","&nbsp;":String.fromCharCode(160),"&zwnj;":String.fromCharCode(8204)}[e]})},escape:function(e){return e.replace(/[&><"']/g,function(e){return{"&":"&amp;",">":"&gt;","<":"&lt;",'"':"&quot;","'":"&#39;"}[e]})},insensitiveName:function(e){return(e+"").toLowerCase().replace(b,"")},allKeysDown:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return t.every(function(e){return u[e]})},someKeysDown:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return t.some(function(e){return u[e]})},buttonsDown:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return t.every(function(e){return h[e]})},anyInputDown:function(){return 0<p+m},mouseCoords:g,parentColours:function(e){for(var t,n={colour:null,backgroundColour:null},r=/^\w+a\(.+?,\s*0\s*\)$|^transparent$/;e.length&&e[0]!==document;e=e.parent())if(n.backgroundColour||(t=e.css("background-color")).match(r)||(n.backgroundColour=t),n.colour||(t=e.css("color")).match(r)||(n.colour=t),n.colour&&n.backgroundColour)return n;return{colour:"#fff",backgroundColour:"#000"}},childrenProbablyInline:function(e){var t=[];return[].every.call(e.findAndFilter("*"),function(e){if(!(e.hidden||/none|inline/.test(e.style.display)||/display: (none|inline)/.test(e.getAttribute("style")))){if(n.includes(e.tagName.toLowerCase())||/display: (?!none|inline|inherit|unset)/.test(e.getAttribute("style")))return!1;a.includes(e.tagName.toLowerCase())||t.push(e)}return!0})&&t.every(function(e){return/inline|none/.test(window.getComputedStyle(e).display)})},transitionOut:function(e,t,n){var r=3<arguments.length&&void 0!==arguments[3]?arguments[3]:0,a=4<arguments.length&&void 0!==arguments[4]?arguments[4]:0,o=5<arguments.length&&void 0!==arguments[5]?arguments[5]:0,i=6<arguments.length&&void 0!==arguments[6]?arguments[6]:void 0;0!==e.length&&(n=n||s(t),!(1<e.length)&&v.childrenProbablyInline(e)&&["tw-hook","tw-passage","tw-sidebar","tw-expression"].includes(e.tag())||(e=e.wrapAll("<tw-transition-container>").parent()),i&&e.css("transform-origin",i),e.attr("data-t8n",t).addClass("transition-out").css({"animation-duration":"".concat(n,"ms"),"animation-delay":"".concat(-o,"ms"),"animation-play-state":"paused"}),requestAnimationFrame(function(){v.childrenProbablyInline(e)?e.css("display","inline"):e.parent().is("tw-backdrop,tw-story")||e[0].setAttribute("style",e[0].getAttribute("style")+"display:block !important;width:100%")}),y(e,n,r-o,a,function(){e.remove()}))},transitionIn:function(u,e,t){var p,n=3<arguments.length&&void 0!==arguments[3]?arguments[3]:0,r=4<arguments.length&&void 0!==arguments[4]?arguments[4]:0,a=5<arguments.length&&void 0!==arguments[5]?arguments[5]:0,o=6<arguments.length&&void 0!==arguments[6]?arguments[6]:void 0;0!==u.length&&(t=t||s(e),(p=1<u.length||!v.childrenProbablyInline(u)||!["tw-hook","tw-passage","tw-sidebar","tw-expression"].includes(u.tag()))&&(u=u.wrapAll("<tw-transition-container>").parent()),o&&u.css("transform-origin",o),u.attr("data-t8n",e).addClass("transition-in").css(_objectSpread({"animation-duration":"".concat(t,"ms"),"animation-delay":"".concat(-a,"ms")},n-a?{visibility:"hidden","animation-play-state":"paused"}:{})),requestAnimationFrame(function(){v.childrenProbablyInline(u)?u.css("display","inline"):u.parent().is("tw-backdrop,tw-story")||u[0].setAttribute("style",u[0].getAttribute("style")+"display:block !important;width:100%")}),y(u,t,n-a,r,function(){var e=0===u.filter(f.join(",")).length;if(p&&e){u.find("tw-transition-container, .transition-in, .transition-out").each(function(e,t){((t=d(t)).data("expediteAnim")||Object)()});for(var t=[],n=u.find("*"),r=0;r<n.length;r+=1){var a=n[r];0===a.scrollTop&&0===a.scrollLeft||t.push([a,a.scrollLeft,a.scrollTop])}e=u.find(document.activeElement);u.contents().unwrap();for(var o=0,i=t;o<i.length;o++){var s=_slicedToArray(i[o],3),c=s[0],l=s[1],s=s[2];c.scrollLeft=l,c.scrollTop=s}e.length&&e[0].focus()}else u.removeClass("transition-in").removeAttr("data-t8n")}))},debounce:function(e){function t(){300<Date.now()-l||s<=u?(u=n=0,p=!i,o?(e(c),c=[]):e.apply(void 0,_toConsumableArray(c)),p=!1):n=requestAnimationFrame(t)}var n,r=1<arguments.length&&void 0!==arguments[1]?arguments[1]:{},a=r.batch,o=void 0!==a&&a,a=r.recur,i=void 0!==a&&a,a=r.maxWait,s=void 0===a?1/0:a,c=[],l=0,u=0,p=!1;return function(){var e;p||(e=Date.now(),u+=e-l,l=e,o?c.push(arguments):c=arguments,n&&cancelAnimationFrame(n),n=requestAnimationFrame(t))}},impossible:function(e,t){window.console&&console.error(e+"(): "+t)},onStartup:function(e){l?l.push(e):e()},get storyElement(){return i},detachStoryElement:function(){document.documentElement.contains(i[0])&&(c=i.parent(),i.detach())},reattachStoryElement:function(){document.documentElement.contains(i[0])||(c||d(document.body)).append(i.parents().length?i.parents().last():i)},options:{speedMultiplier:1}};return d(function(){i=d("tw-story"),l.forEach(function(e){return e()}),l=null}),Object.freeze(v)}),define("datatypes/assignmentrequest",["utils/operationutils","datatypes/typedvar","datatypes/datatype","internaltypes/varref","internaltypes/twineerror"],function(e,y,b,v,w){var k=e.objectName,S=e.matches,t=e.toSource;return Object.freeze({assignmentRequest:!0,TwineScript_TypeName:"a VariableToValue (a 'to' or 'into' expression)",TwineScript_ObjectName:"a VariableToValue (a 'to' or 'into' expression)",TwineScript_ToSource:function(){return"into"===this.operator?"".concat(t(this.src)," ").concat(this.operator," ").concat(t(this.dest)):"".concat(t(this.dest)," ").concat(this.operator," ").concat(t(this.src))},TwineScript_Unstorable:!0,set:function(){var e,t=0<arguments.length&&void 0!==arguments[0]&&arguments[0],n=[],r=function e(t,n,r){var a=!(2<arguments.length&&void 0!==r)||r,o=[],i=n&&v.isPrototypeOf(n)?n.get():n;if(w.containsError(i))return i;if(Array.isArray(i)&&Array.isArray(t)){for(var s=0,c=0;s<t.length&&c<i.length;){var l=t[s],u=i[c];if(y.isPrototypeOf(l)&&l.datatype.rest||b.isPrototypeOf(l)&&l.rest){for(var p=c;c<i.length&&S(l,u);)u=i[c+=1];y.isPrototypeOf(l)?l.datatype=[l.datatype]:b.isPrototypeOf(l)&&(l=b.create("array")),o=o.concat(e(l,v.isPrototypeOf(n)?v.create(n,{first:p+1,last:c+1}):i.slice(p,c)))}else o=o.concat(e(l,v.isPrototypeOf(n)?v.create(n,c+1):u)),c+=1;s+=1}return s<t.length?a&&w.create("operation","I can't unpack this array because it needs ".concat(t.length-s," more value").concat(0<t.length-s?"s":"",".")):o}if(t instanceof Map&&i instanceof Map){var d,f=_createForOfIteratorHelper(t.entries());try{for(f.s();!(d=f.n()).done;){var h=_slicedToArray(d.value,2),m=h[0],g=h[1];if(!i.has(m))return a&&w.create("operation","I can't unpack this datamap because it needs a '"+m+"' data name.");o=o.concat(e(g,v.isPrototypeOf(n)?v.create(n,m):i.get(m)))}}catch(e){f.e(e)}finally{f.f()}return o}if(y.isPrototypeOf(t)){if("function"==typeof t.datatype.destructure)return[{dest:t,value:i,src:n}].concat(t.datatype.destructure(i));if(!S(i,t.datatype))return a&&w.create("operation","I can't put ".concat(k(i)," into ").concat(t.varRef.TwineScript_ToSource()," because it doesn't match ").concat(t.varRef.TwineScript_ToSource(),"'s datatype, ").concat(k(t.datatype),"."));o=o.concat(e(t.datatype,i))}return v.isPrototypeOf(t)||y.isPrototypeOf(t)?o.concat({dest:t,value:i,src:n}):"function"==typeof t.destructure?o.concat(t.destructure(i)):S(i,t)?o:a&&w.create("operation","I tried to unpack, but "+k(t)+" in the pattern didn't match "+k(i)+".")}(this.dest,this.src);if(e=w.containsError(r))return e;if(!r.length)return w.create("operation","I can't store a new value inside "+k(this.dest)+" that isn't in a variable.","You need a variable, or a data structure containing variables at certain positions, to store the value.");var a,o=_createForOfIteratorHelper(r.reverse());try{for(o.s();!(a=o.n()).done;){var i=a.value,s=i.dest,c=i.value,l=i.src;if(y.isPrototypeOf(s)){if(e=w.containsError(s.defineType()))return e;s=s.varRef}if(e=s.set(c,this.srcRef),w.isPrototypeOf(e))return e;t&&l&&l.delete(),n.shift(k(s)+" is now "+k(c))}}catch(e){o.e(e)}finally{o.f()}return n.join("; ")},create:function(e,t,n,r){return w.containsError(e)?e:w.containsError(t)?t:Object.assign(Object.create(this),{dest:e,src:t,operator:n,srcRef:r})}})}),define("datatypes/changercommand",["utils","utils/operationutils","internaltypes/changedescriptor","internaltypes/twineerror"],function(e,t,n,r){var i=e.plural,a=e.impossible,o=t.is,s=t.toSource,c={},l={TwineScript_TypeID:"changer",TwineScript_TypeName:"a changer",TwineScript_Print:function(){return"`[A ("+this.macroName+":) changer]`"},TwineScript_ToSource:function(){return"("+this.macroName+":"+("else"===this.name?"":this.params.map(s))+")"+(this.next?"+"+this.next.TwineScript_ToSource():"")},get TwineScript_ObjectName(){1===this.params.length&&36<(e=s(this.params[0])).length&&(e=void 0);for(var e,t="a (".concat(this.macroName,":").concat(e||"",") changer"),n=this.next,r=(n&&(t+=" combined with "),0);n&&t.length<48;){var a="(".concat(n.macroName,":)");t+=(0<r&&!n.next?" and ":"")+a+(n.next?", ":""),n=n.next,r+=1}for(var o=0;n&&o<99;)n=n.next,o+=1;return 0<o&&(t+="".concat(0<r?" and ":"").concat(i(o,"other changer"))),t},summary:function(){var e=n.create();return this.run(e),e.summary()},create:function(e){var t=1<arguments.length&&void 0!==arguments[1]?arguments[1]:[],n=2<arguments.length&&void 0!==arguments[2]?arguments[2]:null,r=!(3<arguments.length&&void 0!==arguments[3])||arguments[3];return Array.isArray(t)||a("ChangerCommand.create","params was not an array but "+t),Object.assign(Object.create(this),{macroName:e,params:t,next:n,canEnchant:r})},"TwineScript_+":function(e){for(var t=this.TwineScript_Clone(),n=t;n.next;)n=n.next;return n.next=e,t.canEnchant=this.canEnchant&&e.canEnchant,t},TwineScript_is:function(e){if(l.isPrototypeOf(e))return this.macroName===e.macroName&&o(this.params,e.params)&&o(this.next,e.next)},TwineScript_Clone:function(){for(var e=l.create(this.macroName,this.params,this.next),t=e;t.next;)t=t.next=t.next.TwineScript_Clone();return e.canEnchant=this.canEnchant,e},run:function(e,t){var n="output"===this.macroName?[t||this]:this.params,n=c[this.macroName].apply(c,[e].concat(_toConsumableArray(n)));if(r.containsError(n))return n;this.next&&this.next.run(e,t||this)},register:function(e,t){c[e]=t}};return Object.freeze(l)}),define("datatypes/codehook",[],function(){var t=Object.freeze({TwineScript_TypeName:"a code hook",TwineScript_ObjectName:"a code hook",TwineScript_ToSource:function(){return this.source},TwineScript_Print:function(){return this.code},TwineScript_toString:function(){return this.source},TwineScript_is:function(e){return t.isPrototypeOf(e)&&this.source===e.source},TwineScript_Clone:function(){return t.create(this.code,this.source)},create:function(e,t){return Object.assign(Object.create(this),{code:e,source:t})}});return t}),define("datatypes/colour",["jquery"],function(c){var l=Math.max,u=Math.min,a=Math.sin,o=Math.cos,i=Math.pow,p=Math.round,d=Math.floor,s=Math.atan2,f=Math.cbrt,h=Math.sqrt,m=Math.PI,g=Object.assign,y=Object.create,b=/^([\da-fA-F])([\da-fA-F])([\da-fA-F])$/,t=/^([\da-fA-F])([\da-fA-F])([\da-fA-F])([\da-fA-F])([\da-fA-F])([\da-fA-F])$/,v=y(null);function w(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];if(0<r.length)return w.apply(void 0,[w(e,t)].concat(r));if(!t)return e;for(var o=[],i=0;i<e.length;i++){o[i]=[];for(var s=0;s<t[0].length;s++){for(var c=0,l=0;l<e[0].length;l++)c+=e[i][l]*t[l][s];o[i][s]=c}}return o}function n(e){var t,n=e.r,r=e.g,a=e.b,e=e.a,o=l(n/=255,r/=255,a/=255),i=u(n,r,a),s=(o+i)/2,c=o-i;if(o===i)return{h:0,s:0,l:s};switch(o){case n:t=(r-a)/c+(r<a?6:0);break;case r:t=(a-n)/c+2;break;case a:t=(n-r)/c+4}return{h:t=p(60*t),s:.5<s?c/(2-o-i):c/(o+i),l:s,a:e}}var k=[.9642956764295677,1,.8251046025104602],S=24389/27,T=216/24389,_=function(e){return e.map(function(e){return[e]})},x=function(e){return e.map(function(e){return e[0]})};function O(e){var t=e.l,n=e.c,r=e.h,e=e.a,n=[t*=100,n*o(r*m/180),n*a(r*m/180)],r=[];r[1]=(n[0]+16)/116,r[0]=n[1]/500+r[1],r[2]=r[1]-n[2]/200;n=[i(r[0],3)>T?i(r[0],3):(116*r[0]-16)/S,S*T<t?i((16+t)/116,3):t/S,i(r[2],3)>T?i(r[2],3):(116*r[2]-16)/S].map(function(e,t){return e*k[t]}),t=_slicedToArray(x(w([[3.2409699419045226,-1.537383177570094,-.4986107602930034],[-.9692436362808796,1.8759675015077202,.04155505740717559],[.05563007969699366,-.20397695888897652,1.0569715142428786]],w([[.9554734527042182,-.023098536874261423,.0632593086610217],[-.028369706963208136,1.0099954580058226,.021041398966943008],[.012314001688319899,-.020507696433477912,1.3303659366080753]],_(n)))).map(function(e){return u(255,l(0,255*(.0031308<(e=e)?1.055*i(e,1/2.4)-.055:12.92*e)))}),3);return{r:t[0],g:t[1],b:t[2],a:e}}function e(e){function t(e){return 1e-5<=n[e]&&n[e]<=255-1e-5}var n=O(e);if(Object.keys(n).every(t))return n;var r=(e=_objectSpread({},e)).c,a=0;for(e.c/=2;1e-5<r-a;)n=O(e),Object.keys(n).every(t)?a=e.c:r=e.c,e.c=(r+a)/2;return O(e)}var A=Object.freeze({TwineScript_TypeID:"colour",TwineScript_TypeName:"a colour",TwineScript_ObjectName:"a colour",TwineScript_DebugName:function(){return"a colour "+this.TwineScript_Print()},"TwineScript_+":function(e){var t=this.toRGBA(),e=e.toRGBA();return A.create({r:u(p(.6*(t.r+e.r)),255),g:u(p(.6*(t.g+e.g)),255),b:u(p(.6*(t.b+e.b)),255),a:(t.a+e.a)/2})},TwineScript_Print:function(){var e=this.toRGBA();return"<tw-colour style='background-color:rgba("+[e.r,e.g,e.b,e.a]+");'></tw-colour>"},TwineScript_is:function(e){var t;return!!A.isPrototypeOf(e)&&(e.lcha&&this.lcha?e.lcha.l===this.lcha.l&&e.lcha.c===this.lcha.c&&e.lcha.h===this.lcha.h&&e.a===this.a:(t=this.toRGBA(),(e=e.toRGBA()).r===t.r&&e.g===t.g&&e.b===t.b&&e.a===t.a))},TwineScript_Clone:function(){return A.create(this)},toRGBAString:function(){var e=this.toRGBA(),t=e.r,n=e.g,r=e.b,e=e.a;return"rgba(".concat(t,", ").concat(n,", ").concat(r,", ").concat(e,")")},toHSLA:function(){return n(this.toRGBA())},toRGBA:function(){return this.lch?e(_objectSpread({a:this.a},this.lch)):this},toLCHA:function(){return this.lch?_objectSpread({a:this.a},this.lch):(t=(e=this).r,n=e.g,r=e.b,e=e.a,n=[116*(t=x(w([[1.0479298208405488,.022946793341019088,-.05019222954313557],[.029627815688159344,.990434484573249,-.01707382502938514],[-.009243058152591178,.015055144896577895,.7518742899580008]],w([[.41239079926595934,.357584339383878,.1804807884018343],[.21263900587151027,.715168678767756,.07219231536073371],[.01933081871559182,.11919477979462598,.9505321522496607]],_([t/255,n/255,r/255].map(function(e){return e<.04045?e/12.92:i((e+.055)/1.055,2.4)}))))).map(function(e,t){return e/k[t]}).map(function(e){return T<e?f(e):(S*e+16)/116}))[1]-16,500*(t[0]-t[1]),200*(t[1]-t[2])],r=180*s(n[2],n[1])/m,{l:n[0]/100,c:h(i(n[1],2)+i(n[2],2)),h:0<=r?r:360+r,a:e});var e,t,n,r},LCHRotate:function(e){e<0&&(e=360+e);var t=this.toLCHA();return t.h=(t.h+e)%360,A.create(t)},TwineScript_GetProperty:function(e){var t;return"lch"===e?(t=this.toLCHA(),new Map([["l",t.l],["c",t.c],["h",t.h]])):(t=this.toRGBA(),"h"===e||"s"===e||"l"===e?n(t)[e]:"r"===e||"g"===e||"b"===e||"a"===e?t[e]:void 0)},TwineScript_Properties:["h","s","l","r","g","b","a","lch"],TwineScript_ToSource:function(){if(0===this.a)return"transparent";var e=!this.lch&&n(this);if(1===e.l&&!e.h&&!e.s)return"white";if(0===e.l&&!e.h&&!e.s)return"black";if(.5<=e.l&&e.l<.5334&&0===e.s)return"gray";if(.5===e.l&&.8<=e.s&&e.s<.804){var t={0:"red",30:"orange",60:"yellow",90:"lime",120:"green",180:"cyan",210:"blue",240:"navy",270:"purple",300:"magenta"}[e.h];if(t)return t}return"(".concat(this.lch?"lch":"hsl",":").concat(this.lch?[this.lch.l,this.lch.c,this.lch.h]:[e.h,e.s,e.l]).concat(1!==this.a?","+this.a:"",")")},create:function(e){var t,n,r,a,o,i;return"string"==typeof e?this.create((A.isHexString(e)?function(e){return"string"!=typeof e?e:(e=(e=e.replace("#","")).replace(b,"$1$1$2$2$3$3"),{r:parseInt(e.slice(0,2),16),g:parseInt(e.slice(2,4),16),b:parseInt(e.slice(4,6),16)})}:function(e){var t;return e in v?v[e]:(t="transparent"===(t=c("<p>").css("background-color",e).css("background-color"))?{r:0,g:0,b:0,a:0}:t.startsWith("rgb")?t.match(/\d+/g).reduce(function(e,t,n){return e["rgb"[n]]=+t,e},{}):{r:192,g:192,b:192},v[e]=t)})(e)):!("h"in e&&"s"in e&&"l"in e)||"r"in e||"g"in e||"b"in e?("a"in e&&"number"==typeof e.a||(e.a=1),"h"in e&&"c"in e&&!("s"in e)&&"l"in e?g(y(this),{a:e.a,lch:{l:e.l,c:e.c,h:e.h}}):g(y(this),e)):this.create((a=(t=e).h,o=e.s,i=e.l,t=e.a,0===o?{r:e=d(255*i),g:e,b:e}:(r=2*i-(n=i<.5?i*(1+o):i+o-i*o),{r:d(255*s((a/=360)+1/3)),g:d(255*s(a)),b:d(255*s(a-1/3)),a:t})));function s(e){return e<0&&(e+=1),1<e&&--e,e<1/6?r+6*(n-r)*e:e<.5?n:e<2/3?r+(n-r)*(2/3-e)*6:r}},isHexString:function(e){return"string"==typeof e&&"#"===e[0]&&(e.slice(1).match(b)||e.slice(1).match(t))},isCSS3Function:function(e){return"string"==typeof e&&/^(?:rgb|hsl)a?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?%?\s*,\s*\d+(?:\.\d+)?%?(?:,\s*\d+(?:\.\d+)?\s*)?\)$/.test(e)}});return A}),define("datatypes/customcommand",["internaltypes/changedescriptor","internaltypes/twineerror"],function(l,u){var p=Object.assign,d=Object.create;return Object.seal({TwineScript_TypeID:"command",TwineScript_ObjectName:"a custom command",TwineScript_TypeName:"a custom command",TwineScript_Print:function(){return"`[a custom command]`"},create:function(e){var t,n=e.toSource,r=e.changer,a=e.hook,o=e.variables,i={};for(t in o)i[t]=[o[t]];var s,c=l.create({source:a,loopVars:i},r);return u.containsError(c)?c:s=p(d(this),{TwineScript_Attach:function(e,t){c.section=e;e=t.run(c);return u.containsError(e)?e:s},TwineScript_Run:function(e){c.section=e;e=c;return c=l.create({source:a,loopVars:i},r),e},TwineScript_ToSource:function(){return n},TwineScript_CustomCommand:function(){return e}})}})}),define("datatypes/custommacro",["jquery","utils","renderer","utils/operationutils","datatypes/customcommand","internaltypes/varref","internaltypes/varscope","internaltypes/twineerror","internaltypes/twinenotifier"],function(w,e,k,t,S,T,_,x,O){function n(v){return function(e){v.called+=1;for(var t=v.varNames,n=v.params,r=v.body,a=E(N(_),{TwineScript_VariableStore:{type:"temp",name:v.TwineScript_ObjectName+" call #"+v.called},TwineScript_TypeDefs:N(null)}),o=[],i=0,s=!1,c=arguments.length,l=new Array(1<c?c-1:0),u=1;u<c;u++)l[u-1]=arguments[u];for(var p=0;p<l.length;p+=1){var d=l[p],f=t[i],h=(a.TwineScript_TypeDefs[f]=n[i].datatype.rest?n[i].datatype.create("array"):n[i].datatype,T.create(a,f));if(x.containsError(h))return h;if(n[i].datatype.rest){var s=!0,m=(a[f]||[]).concat([d]);if(p<l.length-1){a[f]=m;continue}h.set(m)}else h.set(d),i+=1;o.push(O.create(A(h)+" is now "+A(a[f])))}if(!s&&null!=(g=n[i])&&g.datatype.rest){var g=T.create(a,t[i]);if(x.containsError(g))return g;g.set([]),a.TwineScript_TypeDefs[name]=n[i].datatype.create("array")}var y,g=w("<p>").append(k.exec(r.code)),b=e.stack.length,r=(e.stack.unshift({tempVariables:a,dom:g,output:function(e){y=e}}),e.evalReplay);for(e.evalReplay=null,e.execute();e.stack.length>b;)e.stack.shift();e.evalReplay=r;r=g.find("tw-error");return r.length?(g.prepend(o.map(function(e){return e.render()}),"<br>"),x.create("propagated","".concat(r.length," error").concat(1<r.length?"s":""," occurred when running ").concat(v.TwineScript_ObjectName,"."),void 0,g)):void 0===y?x.create("custommacro","".concat(v.TwineScript_ObjectName," didn't output any data or hooks using (output:) or (output-data:).")):"object"===_typeof(y)&&"changer"in y?S.create(E(y,{toSource:"(".concat(v.TwineScript_KnownName||"unnamed",":").concat(l.map(C),")")})):y}}var r=e.andList,A=t.objectName,a=t.typeName,o=t.matches,C=t.toSource,E=Object.assign,N=Object.create,i=Object.seal({TwineScript_TypeID:"macro",TwineScript_TypeName:"a custom macro",TwineScript_GetProperty:function(e){if("params"===e)return _toConsumableArray(this.params)},TwineScript_Properties:["params"],TwineScript_Print:function(){return"`["+this.TwineScript_ObjectName+"]`"},TwineScript_Clone:function(){var e=E(N(i),this);return e.fn=n(e),e},TwineScript_ToSource:function(){return"(macro:"+this.params.map(function(e){return e.TwineScript_ToSource()}).concat("")+this.body.TwineScript_ToSource()+")"},createFromFn:function(e,t,n,r){return E(N(i),{params:[],fn:e,typeSignature:r,TwineScript_ObjectName:t,TwineScript_ToSource:n,TwineScript_KnownName:""})},create:function(e,t){t=E(N(i),{params:e,called:0,varNames:e.map(function(e){return e.varRef.propertyChain[0]}),typeSignature:e.map(function(t){var e=t.datatype.toTypeSignatureObject?t.datatype.toTypeSignatureObject({rest:t.rest}):{pattern:"range",range:function(e){return o(t.datatype,e)},name:a(t.datatype)};return t.rest?{pattern:"zero or more",innerType:e}:e}),body:t,TwineScript_KnownName:"",TwineScript_ObjectName:"a custom macro (with ".concat(e.length?r(e.map(C)):"no params",")")});return t.fn=n(t),t}});return i}),define("datatypes/datatype",["utils","utils/operationutils","datatypes/changercommand","datatypes/colour","datatypes/gradient","datatypes/lambda","datatypes/custommacro","datatypes/codehook","internaltypes/twineerror"],function(e,t,n,r,a,o,i,s,c){var l=e.realWhitespace,u=e.anyRealLetter,p=e.anyCasedLetter,d=e.anyNewline,f=t.objectName,e=Object.seal,h=Object.keys,m=Math.floor,g=Math.abs,y={TwineScript_TypeID:"datatype",TwineScript_TypeName:"a datatype",TwineScript_Print:function(){return"`["+this.TwineScript_ObjectName+"]`"},get TwineScript_ObjectName(){return"the "+(this.rest?"...":"")+this.name+" datatype"},TwineScript_is:function(e){return y.isPrototypeOf(e)&&e.name===this.name},TwineScript_Clone:function(){return this.rest?this:Object.create(this)},TwineScript_ToSource:function(){return(this.rest?"...":"")+this.name},TwineScript_IsTypeOf:function(e){var t=this.name,n=this.rest;return!!v[t]&&v[t](e,n)},toTypeSignatureObject:function(){var e=this.name,e={pattern:"range",range:v[e],name:"a "+("dm"===e?"datamap":"ds"===e?"dataset":"num"===e?e+"ber":"str"===e?e+"ing":"color"===e?"colour":"bool"===e?e+"ean":"alnum"===e?"alphanumeric character":"int"===e?e+"eger":"even"===e||"odd"===e?e+" number":e.endsWith("case")||"whitespace"===e?e+" character":"empty"===e?e+" value":e)};return this.rest?{pattern:"zero or more",innerType:e}:e},create:function(e){var t=1<arguments.length&&void 0!==arguments[1]&&arguments[1],n=(e="datamap"===e?"dm":"dataset"===e?"ds":"number"===e?"num":"string"===e?"str":"color"===e?"colour":"boolean"===e?"bool":"alphanumeric"===e?"alnum":"integer"===e?"int":"newline"===e?"linebreak":e,Object.create(this));return n.name=e,n.rest=t,n},from:function(t){var e=h(b).find(function(e){return b[e](t)});return e?y.create(e):c.create("datatype",f(t)+" doesn't correspond to a datatype value.")}},b={array:Array.isArray,dm:function(e){return e instanceof Map},ds:function(e){return e instanceof Set},datatype:function(e){return y.isPrototypeOf(e)},changer:function(e){return n.isPrototypeOf(e)},colour:function(e){return r.isPrototypeOf(e)},gradient:function(e){return a.isPrototypeOf(e)},lambda:function(e){return o.isPrototypeOf(e)},macro:function(e){return i.isPrototypeOf(e)},codehook:function(e){return s.isPrototypeOf(e)},command:function(e){return e&&"command"===e.TwineScript_TypeID},str:function(e){return"string"==typeof e},num:function(e){return"number"==typeof e},bool:function(e){return"boolean"==typeof e}},v=_objectSpread(_objectSpread({},b),{},{even:function(e){return!isNaN(e)&&m(g(e))%2==0},odd:function(e){return!isNaN(e)&&m(g(e))%2==1},empty:function(e){return e instanceof Map||e instanceof Set?!e.size:!(!Array.isArray(e)&&"string"!=typeof e||e.length)},int:function(e){return"number"==typeof e&&e===(0|e)},uppercase:function(e){return"string"==typeof e&&1===_toConsumableArray(e).length&&_toConsumableArray(e).every(function(e){return e!==e.toLowerCase()})},lowercase:function(e){return"string"==typeof e&&1===_toConsumableArray(e).length&&_toConsumableArray(e).every(function(e){return e!==e.toUpperCase()})},whitespace:function(e){return"string"==typeof e&&!!e.match("^"+l+"$")},digit:function(e){return"string"==typeof e&&!!e.match("^\\d$")},alnum:function(e){return"string"==typeof e&&!!e.match("^"+u+"$")},anycase:function(e){return"string"==typeof e&&!!e.match("^"+p+"$")},linebreak:function(e){return"string"==typeof e&&!!e.match("^"+d+"$")},any:function(){return!0},const:function(){return!0}});return e(y)}),define("datatypes/gradient",["utils/operationutils"],function(e){var t=e.toSource,n=Object.freeze({TwineScript_TypeID:"gradient",TwineScript_TypeName:"a gradient",TwineScript_ObjectName:"a gradient",TwineScript_DebugName:function(){return"a gradient "+this.TwineScript_Print()},TwineScript_GetProperty:function(e){var t=this;return"angle"===e?this.angle:"stops"===e?this.stops.map(function(e){return new Map([[t.repeating?"pixels":"percent",e.stop],["colour",e.colour.TwineScript_Clone()]])}):void 0},TwineScript_Properties:["angle","stops"],TwineScript_ToSource:function(){return"(gradient:"+this.angle+","+this.stops.map(function(e){return t(e.stop)+","+t(e.colour)})+")"},TwineScript_is:function(e){var r=this;return e.angle===this.angle&&e.stops.length===this.stops.length&&e.stops.every(function(e,t){var n=e.colour,e=e.stop;return r.stops[t].stop===e&&r.stops[t].colour.TwineScript_is(n)})},TwineScript_Clone:function(){return n.create(this.angle,_toConsumableArray(this.stops))},TwineScript_Print:function(){return"<tw-colour style='background:"+this.toLinearGradientString()+"'></tw-colour>"},create:function(e,t){var n=2<arguments.length&&void 0!==arguments[2]&&arguments[2];return Object.assign(Object.create(this),{angle:e,stops:t.sort(function(e,t){return e.stop-t.stop}),repeating:n})},multiply:function(t){return n.create(this.angle,this.stops.map(function(e){return{colour:e.colour,stop:e.stop*t}}))},toLinearGradientString:function(){var r=this;return(this.repeating?"repeating-":"")+"linear-gradient(".concat(this.angle,"deg, ").concat(this.stops.reduce(function(e,t){var n=t.colour,t=t.stop;return e+n.toRGBAString()+" "+t*(r.repeating?1:100)+(r.repeating?"px,":"%,")},"").slice(0,-1),")")}});return n}),define("datatypes/hookset",["jquery","utils","utils/renderutils","utils/operationutils"],function(g,s,e,t){var y=e.textNodeToChars,b=e.realWhitespace,c=e.findTextInNodes,r=t.toSource;function l(e){function t(n,e){if(Array.isArray(e))return e.reduce(function(e,t){return e.add(n.get(t))},g());if(e&&"object"===_typeof(e)&&"first"in e&&"last"in e){for(var t=e.first,r=e.last,a=n.length,o=(t<0&&(t+=a),r<0&&(r+=a),[n.get(t)]);t!==r;)t+=Math.sign(r-t),o.push(n.get(t));return g(o)}if("string"==typeof e){if("chars"===e){var i,s=[],c=_createForOfIteratorHelper(n.textNodes(m));try{for(c.s();!(i=c.n()).done;){var l,u=i.value,p=_createForOfIteratorHelper(y(u));try{for(p.s();!(l=p.n()).done;){var d=l.value;d.textContent.match(b)||s.push(d)}}catch(e){p.e(e)}finally{p.f()}}}catch(e){c.e(e)}finally{c.f()}return g(s)}if("links"===e)return n.findAndFilter("tw-link, .enchantment-link");if("visited"===e)return n.findAndFilter("tw-link.visited");var f,h;if("lines"===e)return f=n.findAndFilter("br:not(tw-sidebar *),tw-consecutive-br:not(tw-sidebar *)").get(),h=[[]],n.contents().each(function e(t,n){var r=(n.tagName||"").toLowerCase();if("tw-sidebar"!==r)if("tw-passage"===r||"tw-transition-container"===r)g(n).contents().each(e);else{if(f.length){if(n===f[0])return f.shift(),void h.push([]);if(16&n.compareDocumentPosition(f[0]))return h.push([]),g(n).contents().each(e),void h.push([])}h[h.length-1].push(n)}}),g(h.map(function(e){return!!e.length&&g(e).wrapAll("<tw-pseudo-hook>").parent()[0]}).filter(Boolean))}return g(n.get(e))}var n,r,a=e.dom,m=":not(tw-error, tw-error *)",o=g();this.next&&(o=o.add(l.call(this.next,e)));if(this.selector){if("string"===this.selector.type)i=this.selector.data,n=c((n=a).textNodes(),i),r=g(),n.forEach(function(e){r=r.add(g(e).wrapAll("<tw-pseudo-hook>").parent())}),i=r;else{if("base"===this.selector.type)return o.add(t(l.call(this.selector.data,e),this.property));n=this.selector.data,e='tw-hook[name="'+(n=s.insensitiveName(n).replace(/"/g,"&quot;"))+'"],tw-enchantment[name="'+n+'"]';var e=e+={page:", tw-story",passage:", tw-passage",sidebar:", tw-sidebar",link:", tw-link, .enchantment-link"}[n]||"",i=a.findAndFilter(e).add(a.parentsUntil(s.storyElement.parent())).filter(e)}o=this.property?o.add(t(i,this.property)):o.add(i)}return o=o.get().reduce(function(e,t){return t=g(t),e.add(t.is("tw-enchantment")&&t.contents().length<=1?t.contents():t)},g())}function a(e){var t,n;return e?(t=e.selector,n=e.property,e=e.next,[JSON.stringify(["base"===t.type?a(t.data):s.insensitiveName(t.data),n])].concat(_toConsumableArray(a(e))).sort()):[]}var o=Object.freeze({forEach:function(e,n){var t=l.call(this,e).each(function(e,t){return n(g(t),e)});return e.dom.findAndFilter("tw-pseudo-hook").contents().unwrap(),t},hooks:function(e){return l.call(this,e)},get TwineScript_ObjectName(){return"the hook name ".concat(this.TwineScript_ToSource())},TwineScript_TypeID:"hookName",TwineScript_TypeName:"a hook name (like ?this)",TwineScript_Unstorable:!0,TwineScript_ToSource:function(){var e="",t=this.selector,n=t.type,t=t.data;return"name"===n?t.match(RegExp("^"+s.anyRealLetter+"+$"))?e+="?"+t:e+="(hooks-named:"+JSON.stringify(t)+")":"string"===n?e+=JSON.stringify(t):"base"===n&&(e+=t.TwineScript_ToSource()+"'s "+r(this.property,"property")),this.next&&(e+=" + "+this.next.TwineScript_ToSource()),e},"TwineScript_+":function(e){for(var t=this.TwineScript_Clone(),n=t;n.next;)n=n.next;return n.next=e,t},TwineScript_is:function(e){return a(this)+""==a(e)+""},TwineScript_GetProperty:function(e){return o.create({type:"base",data:this},e,void 0)},TwineScript_Properties:["chars","links","lines","visited"],TwineScript_Clone:function(){return o.create(this.selector,this.property,this.next)},create:function(e,t){var n=2<arguments.length&&void 0!==arguments[2]?arguments[2]:void 0;return Object.assign(Object.create(this||o),{selector:Object.freeze(e),property:t,next:n})},from:function(e){return o.isPrototypeOf(e)||"string"==typeof e||s.impossible("HookSet.from() was given a non-HookSet non-string."),o.isPrototypeOf(e)?e:o.create({type:"string",data:e})}});return o}),define("datatypes/lambda",["utils/operationutils","internaltypes/varscope","internaltypes/varref","internaltypes/twineerror"],function(e,h,s,m){var g=e.objectName;var c=Object.freeze({TwineScript_TypeID:"lambda",TwineScript_TypeName:"a lambda",get TwineScript_ObjectName(){return'a "'+("making"in this?"making ... ":"")+("each"in this?"each ... ":"")+("where"in this?"where ... ":"")+("when"in this?"when ... ":"")+("via"in this?"via ... ":"")+'" lambda'},TwineScript_Print:function(){return"`[A lambda]`"},TwineScript_is:function(e){return e===this},TwineScript_ToSource:function(){return this.source},TypeSignature:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return{pattern:"lambda",innerType:c,clauses:t,typeName:'a "'+t.concat("").join(" ...")+'" lambda'}},TwineScript_Clone:function(){return Object.assign(Object.create(c),this)},create:function(e,t,n,r){var a,o="temp variable, or typed temp variable";function i(e){e=e&&e.varRef?e.varRef:e;return void 0===e||e&&s.isPrototypeOf(e)&&h.isPrototypeOf(e.object)&&1===e.propertyChain.length}if(m.containsError(n))return n;if("making"===t&&!i(n))return m.create("syntax","I need a "+o+", to the right of '"+t+"', not "+g(n)+".");if(m.containsError(e))return e;if(c.isPrototypeOf(e)){if("when"===t||"when"in e)return m.create("syntax","A 'when' lambda cannot have any other clauses, such as '"+t+"'.");if(t in e)return m.create("syntax","This lambda has two '"+t+"' clauses.");a=e}else{if("when"===t&&void 0!==e)return m.create("syntax","A 'when' lambda shouldn't begin with a temp variable (just use 'when' followed by the condition).");if(!i(e))return m.create("syntax","This lambda needs to start with a single "+o+", not "+g(e)+".");(a=Object.create(this)).loop=e||""}return a.source=r.trim(),a[t]=n,a.making&&a.making.getName()===(a.loop&&a.loop.getName())?m.create("syntax","This lambda has two variables named '"+a.loop.getName()+"'.","Lambdas should have all-unique parameter names."):a},apply:function(e,t){var n=t.loop,r=t.pos,a=t.making,o=t.ignoreVia;function i(e,t){if(e){var n,r;if("datatype"in e&&"varRef"in e)return n=e.varRef.create(s,e.varRef.propertyChain),m.containsError(n)?n:(r=n.defineType(e.datatype),m.containsError(r)||(r=n.set(t),m.containsError(r))?r:void 0);s[e.getName()]=t}}var s=(s=t.tempVariables)||Object.create(e.stack.length?e.stackTop.tempVariables:h),t=i(this.loop,n)||i(this.making,a);if(m.containsError(t))return t;e.stack.unshift(Object.assign(Object.create(e.stackTop||null),{tempVariables:s,lambdaPos:this.when?void 0:r})),!n||this.making||this.when?e.Identifiers.it=m.create("operation","I can't use 'it', or an implied 'it', in "+this.TwineScript_ObjectName):e.Identifiers.it=n;var c,l,u,p,d,t=!o&&this.via,o="where"in this||"when"in this,f=e.evalReplay;return e.evalReplay=f?[]:null,o?(c=e.eval(this.where||this.when),l=e.evalReplay,e.evalReplay=l&&t?[]:null,!n||this.making||this.when||(e.Identifiers.it=n),u=c,p=!t||e.eval(t),d=null,u=m.containsError(u)||("boolean"!=typeof u?m.create("operation","This lambda's 'where' clause must evaluate to true or false, not "+g(u)+"."):u?p:d)):c=u=!t||e.eval(t),p=t?e.evalReplay:null,e.stack.shift(),(e.evalReplay=f)&&(o||t)&&(((d=f[f.length-1])||{}).lambda&&d.lambda.obj===this||((d={lambda:{obj:this,loops:[]},code:(f[f.length-1]||{}).code||""}).fromCode=d.code,f.push(d)),d.lambda.loops.push(_objectSpread(_objectSpread(_objectSpread({it:n,pos:r},void 0!==a&&{making:a}),t&&{viaReplay:p,viaResult:u}),o&&{whereReplay:l,whereResult:null!==c&&c}))),u},filter:function(r,e){var a,o=this,i=2<arguments.length&&void 0!==arguments[2]?arguments[2]:null;return e.reduce(function(e,t,n){return a||(n=o.apply(r,{loop:t,pos:n+1,ignoreVia:!0,tempVariables:i}),a=m.containsError(n))||e.concat(n?[t]:[])},[])}});return c}),define("datatypes/typedvar",["utils/operationutils","internaltypes/varref","internaltypes/twineerror"],function(e,a,o){var i=e.typeName,t=e.matches,n=e.toSource,s=e.unstorableValue,e=Object.freeze,c=Object.assign,l=Object.create,u=e({TwineScript_TypeName:"a TypedVar (typed variable name)",get TwineScript_ObjectName(){var e=n(this.datatype);return"the ".concat(e.length<24?e+"-":"","typed variable name, ").concat(this.varRef.TwineScript_ToSource())},TwineScript_Print:function(){return"`[A typed variable name]`"},TwineScript_Unstorable:!0,TwineScript_Clone:function(){return c(l(u),{datatype:this.datatype.TwineScript_Clone(),varRef:this.varRef})},TwineScript_ToSource:function(){return n(this.datatype)+"-type "+this.varRef.TwineScript_ToSource()},TwineScript_GetProperty:function(e){return"name"===e?this.getName():this[e]},TwineScript_Properties:["datatype","name"],TwineScript_IsTypeOf:function(e){return t(this.datatype,e)},get:function(){var e;return(e=this.varRef).get.apply(e,arguments)},getName:function(){return this.varRef.getName()},defineType:function(){if("any"!==this.datatype.name)return this.varRef.defineType(this.datatype)},create:function(e,t){var n,r;return(n=o.containsError(t)||o.containsError(e)||t.error)||(a.isPrototypeOf(t)?(n=t.object,r=t.compiledPropertyChain,n&&n.TwineScript_VariableStore&&1===r.length&&n.TwineScript_TypeDefs?(r=s(e))&&!u.isPrototypeOf(r)?o.create("syntax","The -type syntax can't have "+i(r)+" to its left."):c(l(this),{datatype:e,varRef:t}):o.create("unimplemented","I can only restrict the datatypes of variables, not data names or anything else.")):o.create("syntax","The -type syntax must have a variable to its right."))}});return u}),define("datatypes/varbind",["jquery","utils","utils/operationutils","internaltypes/varref","internaltypes/twineerror"],function(o,e,t,n,r){var a=t.objectName;return n.on("set",function(r,a){r.TwineScript_VariableStore&&e.storyElement.find("[data-2bind]").each(function(e,t){var n=(t=o(t)).data("twoWayBindEvent");"function"==typeof n&&n(t,r,a)})}),Object.freeze({TwineScript_TypeName:"a VarBind (bound variable name)",get TwineScript_ObjectName(){return"a ".concat(this.bind," bind to ").concat(this.varRef.TwineScript_ToSource())},TwineScript_Print:function(){return"`[A bound variable name]`"},TwineScript_Unstorable:!0,TwineScript_ToSource:function(){return("two way"===this.bind?"2":"")+"bind "+this.varRef.TwineScript_ToSource()},set:function(e){var e=this.varRef.set(e);if(e=r.containsError(e))return e},create:function(e){var t=1<arguments.length&&void 0!==arguments[1]?arguments[1]:"one way";return r.containsError(e)?e:n.isPrototypeOf(e)?e.error||Object.assign(Object.create(this),{varRef:e,bind:t}):r.create("operation","I can only 'bind' a variable, not "+a(e)+".")}})}),define("debugmode/highlight",["jquery","utils","utils/typecolours","macros","lexer"],function(u,e,t,p,n){var d=e.insensitiveName,f=t.versionClass,h=n.lex;return function(e,t,n,r){if(9999<e.length)return[u("<span>").text(e)];for(var a=h(e,"",t||"macro"),o=[],i="",s=a,c=a.start;c<a.end;c+=1){var l=a.pathAt(c);l[0]!==s[0]&&(o.length&&(o[o.length-1].textContent=i),i="",s=l,o.push(u("<".concat(r&&n<=c&&c<r?"mark":"span",' class="').concat(function(e){for(var t={},n="",r=0;r<e.length;r+=1){var a=e[r],o=a.type,i=a.text,s=("verbatim"!==o&&"comment"!==o||(n=""),f+o);switch(t[s]=(t[s]||0)+1,1<t[s]&&(s+="-"+t[s]),o){case"text":i.trim()&&e.slice(r+1).reduce(function(e,t){return void 0===e?"macro"===t.type||"hook"!==t.type&&e:e},void 0)&&(s+=" ".concat(f,"error"));break;case"macroName":var c,l=e[r].text[0];"_"!==l&&"$"!==l?(c=d(e[r].text.slice(0,-1)),p.has(c)?s+="-"+p.get(c).returnType.toLowerCase():s+=" ".concat(f,"error")):s+=" ".concat(f,"customMacro ").concat(f+("_"===l?"tempV":"v"),"ariable")}n+=s+" "}return n}(s),'">'))[0])),i+=a.text[c-a.start]}return o.length&&(o[o.length-1].textContent=i),o}}),define("debugmode/mode",["jquery","utils","utils/naturalsort","state","engine","internaltypes/varref","internaltypes/twineerror","utils/operationutils","utils/renderutils","passages","section","debugmode/panel","debugmode/highlight","utils/typecolours"],function(I,V,M,D,F,L,H,e,t,z,q,W,B,n){var U=e.objectName,$=e.isObject,G=e.toSource,Y=e.typeID,J=t.dialog,X=n.CSS,K=function(e,t){var f=V.escape,i=V.nth,n=V.debounce,r=I(document.documentElement),a=M(),o={darkMode:!0,fadePanel:!0,evalReplay:!0,width:null,maxHeight:400};if(D.hasStorage)try{var s=localStorage.getItem("(Debug Options "+V.options.ifid+")");s&&(o=JSON.parse(s))}catch(e){}function c(){if(D.hasStorage)try{localStorage.setItem("(Debug Options "+V.options.ifid+")",JSON.stringify(o))}catch(e){}}W.defaultMaxHeight=o.maxHeight;function l(e){return n(function(){if(V.options.debug)return e.apply(this,arguments)},{maxWait:2e3})}var h=I('<tw-debugger class="'.concat([o.darkMode?"theme-dark":"",o.fadePanel?"fade-panel":""].join(" "),'" style="').concat(o.width?"width:"+o.width+"px":"","\">\n<div class='panel panel-errors' hidden><table></table></div>\n<div class='tabs'></div>\n<label style='user-select:none'>Turns: </label><select class='turns' disabled></select>\n<button class='show-invisibles'>\ud83d\udd0d Debug View</button>\n<button class='show-dom'><span style=\"vertical-align:text-top\">&lt;</span><span style=\"vertical-align:text-bottom\">&gt;</span> DOM View</button>\n<button class='close'>\u2716</button>\n<div class='resizer-h'>\n</tw-debugger>")),s=h.find(".tabs"),u=h.find(".show-dom"),p=h.find(".show-invisibles"),d=h.find(".close"),m=h.find(".turns");I(document.documentElement).on("click","tw-expression, tw-error, tw-eval-explanation",n(function(e){var r,a,o,i,l,u,p,d,t=I(e.target).data("evalReplay");function n(){var e,s,c=r[a],t=o.find("tw-eval-explanation").empty(),n=o.find("tw-eval-code");c.toCode||c.toDesc||c.error||c.lambda?(o.find("tw-eval-code").empty().append(B(c.code,"macro",0<a&&c.start,0<a&&c.end+c.diff)),t.append(c.lambda?"":"<code class='".concat(56<c.fromCode.length?"from-block":"from-inline","'></code>"),c.error?"<span> caused an error: </span>":c.lambda?"<span>The lambda <code class='to-lambda'></code> was run, producing these results.</span>":"<span> became".concat(c.ToDesc?"\u2026":""," </span>").concat(c.toDesc?"<span class='to-desc'>".concat(f(c.toDesc),".</span>"):"<code class='to-code'></code>")),c.error?t.append(c.error):c.lambda?(s=function(e,t){return I("<".concat(e,"><code></").concat(e,">")).find("code").append(B(t,"macro")).end()},t.find(".to-lambda").append(B(c.lambda.obj.source,"macro")).end().append((e=I("<table>")).append.apply(e,[I("<tr>").append(s("th","pos"),c.lambda.obj.loop?s("th","_"+c.lambda.obj.loop.getName()).append(" / ",I("<code>").append(B("it","macro"))):s("th","it"),c.lambda.obj.making&&s("th","_"+c.lambda.obj.making.getName()),c.lambda.obj.where&&s("th","where").append(" result"),c.lambda.obj.via&&s("th","via").append(" result"))].concat(_toConsumableArray(c.lambda.loops.map(function(e){var t=e.it,n=e.pos,r=e.making,a=e.whereResult,o=e.whereReplay,i=e.viaResult,e=e.viaReplay;return I("<tr>").append(s("td",G(n)),s("td",G(t)),void 0!==r&&s("td",G(r)),null!=a&&(H.containsError(a)?I("<td>").append(a.render(c.lambda.obj.source,!0)):s("td",G(a))).append(o&&I("<tw-open-button replay label='\ud83d\udd0d'>").data("evalReplay",o)),null!=i&&(H.containsError(i)?I("<td>").append(i.render(c.lambda.obj.source,!0)):s("td",G(i))).append(e&&I("<tw-open-button replay label='\ud83d\udd0d'>").data("evalReplay",e)))})))))):c.toDesc||t.find(".to-code").append(B(c.toCode,"macro")),t.next().html(c.itIdentifier?'(The <code class="cm-harlowe-3-identifier">it</code> identifier now refers to '.concat(f(c.itIdentifier),".)"):"").next().text(c.reason||"")):(n.html(B(c.code,"macro")),t.html("<center>First, there was <code></code>.</center>").next().empty().next().empty()),c.lambda||t.find("code").first().append(B(c.fromCode,"macro")),o.find("mark").each(function(e,t){t.scrollIntoView()}),i.css("visibility",a<=9?"hidden":"visible"),l.css("visibility",a<=0?"hidden":"visible"),p.css("visibility",a>=r.length-1?"hidden":"visible"),d.css("visibility",a>=r.length-10?"hidden":"visible"),u.html("( ".concat(a+1,"/").concat(r.length," )"))}t&&(r=t,t=J({buttons:[{name:"Understood",confirm:!(a=0),callback:function(){return!h.find("tw-backdrop").length&&h.removeClass("show-dialog")}}]}).addClass("eval-replay"),o=I("<tw-eval-replay>".concat(1===r.length?"":"<tw-eval-code></tw-eval-code>","<tw-eval-explanation></tw-eval-explanation><tw-eval-it></tw-eval-it><tw-eval-reason></tw-eval-reason>").concat(1===r.length?"":"<tw-dialog-links><tw-link style='visibility:hidden'>\u2190 10</tw-link><tw-link style='visibility:hidden'>\u2190 \u2190</tw-link><b></b><tw-link>\u2192 \u2192</tw-link><tw-link>10 \u2192</tw-link></tw-dialog-links>","</tw-eval-replay>")),t.find("tw-dialog").css({width:"75vw","max-width":"75vw"}).prepend(o),i=o.find("tw-link:first-of-type"),l=i.next(),u=l.next(),p=u.next(),d=p.next(),n(),i.on("click",function(){a=Math.max(0,a-10),n()}),l.on("click",function(){a=Math.max(0,a-1),n()}),p.on("click",function(){a=Math.min(r.length-1,a+1),n()}),d.on("click",function(){a=Math.min(r.length-1,a+10),n()}),h.find("tw-backdrop").length?h.find("tw-backdrop").before(t):h.addClass("show-dialog").append(t));var s,t=I(e.target).data("goto");t&&(s=V.options.ignoreGotos,V.options.ignoreGotos=!1,t.command.TwineScript_Run(t.section),V.options.ignoreGotos=s),e.stopPropagation()})),h.find(".resizer-h").mousedown(function(e){if(1!==e.which)return!0;e.stopPropagation();var t=e.pageX,n=h.width();r.on("mousemove.debugger-resizer-h",function(e){e=e.pageX;h.width("".concat(n+t-e|0,"px"))}).on("mouseup.debugger-resizer-h",function(){r.off(".debugger-resizer-h"),o.width=h.width(),c()})}),h.on("mousedown",".resizer-v",function(e){if(1!==e.which)return!0;e.stopPropagation();var t=e.pageY,n=I(e.target.parentNode).height();r.on("mousemove.debugger-resizer-v",function(e){e=e.pageY;h.find(".panel").css("maxHeight","".concat(n+t-(0|e),"px"))}).on("mouseup.debugger-resizer-v",function(){r.off(".debugger-resizer-v"),o.maxHeight=h.find(".panel").css("maxHeight"),c()})}),p.click(function(){r.toggleClass("debug-mode").removeClass("dom-debug-mode"),p.toggleClass("enabled"),u.removeClass("enabled")}),u.click(function(){r.toggleClass("dom-debug-mode").removeClass("debug-mode"),u.toggleClass("enabled"),p.removeClass("enabled")}),d.click(function(){r.removeClass("debug-mode dom-debug-mode"),h.detach(),Object.assign(V.options,{debug:!1,speedMultiplier:1,ignoreClickEvents:!1,ignoreGotos:!1})});function g(e){(e=e.parents(".variable-row, .enchantment-row, .source-row")).next(".panel-row-source").find("td").empty().append(B(e.data("value")||G(e.data("enchantment").changer),e.is("source-row")?"markup":"macro"))}function y(){return k=new Set}function b(){I(document.body).append(h),V.options.debug=!0,V.options.evalReplay=o.evalReplay,V.options.speedMultiplier=1,V.options.ignoreClickEvents=!1,V.options.ignoreGotos=!1,R()}var v,w=l(function(){var r=m.children().get(),e=D.timeline,a=0;e.forEach(function(e,t){var n=e.turns,e=e.passage,n=(a+=1+(void 0===n?0:n))+": "+e;r[t]?r[t].textContent=n:m.append("<option value='".concat(t,"'>").concat(n,"</option>"))}),e.length<r.length&&I(r.slice(e.length)).remove(),m[1<=e.length?"removeAttr":"attr"]("disabled"),m.val(D.pastLength)}),k=(m.change(function(e){e=e.target.value-D.pastLength;0!=e&&(D[e<0?"rewind":"fastForward"](Math.abs(e)),F.showPassage(D.passage))}),w(),D.on("forward",w).on("load",w).on("forgetUndos",function(){return w}).on("back",function(){D.pastLength<=1&&m.attr("disabled"),m.find("[selected]").removeAttr("selected"),m.val(D.pastLength)}),new Set),S=W.create({className:"variables",tabName:"Variable",rowWrite:function(e,t){var n,r=e.name,a=e.dataset,o=e.path,i=e.value,s=e.tempScope,e=e.type,c=i&&48<i.length&&!i.TwineScript_DebugName,l=$(i)&&i.TwineScript_DebugName?i.TwineScript_DebugName():f(U(i)),u="",a=(o.length&&(u=o.reduce(function(e,t){return e+t+"'s "},"")),a&&(r="???"),e?G(e):""),e="object"===_typeof(i)||c;return t?(t[0].firstChild.innerHTML=a||"",u&&I(t[0].firstChild).children(".variable-path").html((s?"_":"$")+f(u)),t[0].childNodes[1].lastChild.textContent=(u?"":s?"_":"$")+f(r+""),t[0].childNodes[2].textContent=s||"",t[0].childNodes[3].innerHTML=l,n=(c=I(t[0].lastChild.firstChild)).is(".open"),c[e?"show":"hide"](),c=t.next(".panel-row-source"),n&&c.find("td").empty().append(B(G(i))),t.data("value",G(i)),t.add(c)):I('<div class="variable-row">').attr("data-name",r).attr("data-path",o+"").attr("data-scope",s||"").css("padding-left",Math.min(5,o.length)+"em").append("<td class='variable-type'>".concat(a||"","</td>"),"<td class='variable-name cm-harlowe-3-"+(s?"tempV":"v")+"ariable'><span class='variable-path'>"+(u?(s?"_":"$")+f(u):"")+"</span> "+(u?"":s?"_":"$")+f(r+"")+"</td>","<td class='temporary-variable-scope'>".concat(s||"","</td>"),"<td class='variable-value cm-harlowe-3-macroName-"+Y(i)+"'>"+l+"</td><td class='panel-row-buttons'><tw-folddown tabindex=0 style='display:"+(e?"visible":"none")+"'>(source:) </tw-folddown></td>").data("value",G(i)).find("tw-folddown").data("folddown",g).end().add("<tr class='variable-row panel-row-source' style='display:none'><td colspan='5'></td></tr>")},rowCheck:function(e,t){var n=e.name,r=e.path,e=e.tempScope;return t[0]&&t[0].getAttribute("data-name")===n&&t[0].getAttribute("data-path")===r+""&&t[0].getAttribute("data-scope")===e},columnHead:function(){return'<tr class="panel-head"><th data-col="variable-type">Type</th><th data-col="variable-name">Name</th><th data-col="temporary-variable-scope">Scope</th><th data-col="variable-value">Value</th></tr>'},rowSort:function(e,t,n){if("variable-value"===e)return a(t.attr("class"),n.attr("class"))||a(t.parent().data("value"),n.parent().data("value"))}}),T=l(function(){var e,t,o=[],n=D.variables,r=o.length;for(e in n)e.startsWith("TwineScript")||(r+=1,function n(e){var r,t,a;500<o.length||(o.push(e),r=e.path.concat(e.name),t=e.value,a=e.tempScope,r.length<=4&&(Array.isArray(t)?t.forEach(function(e,t){return n({name:i(t+1),path:r,value:e,tempScope:a})}):t instanceof Map?_toConsumableArray(t).forEach(function(e){var t=(e=_slicedToArray(e,2))[0],e=e[1];return n({name:t,path:r,value:e,tempScope:a})}):t instanceof Set&&_toConsumableArray(t).forEach(function(e,t){return n({name:t,dataset:!0,path:r,value:e,tempScope:a})})))}({name:e,path:[],value:n[e],tempScope:"",type:null==(t=n.TwineScript_TypeDefs)?void 0:t[e]}));o.push.apply(o,_toConsumableArray(k)),r+=k.size,S.update(o,r),0===r!==S.panel[0].classList.contains("panel-variables-empty")&&S.panel.toggleClass("panel-variables-empty")}),_=(L.on("set",function(e,t,n){var r,a;e===D.variables||"temp"!==(null==(a=e.TwineScript_VariableStore)?void 0:a.type)||null!=(a=e.TwineScript_VariableStore)&&a.name.match(/#\d+$/)||(r=null==(a=e.TwineScript_VariableStore)?void 0:a.name,e=null==(a=e.TwineScript_TypeDefs)?void 0:a[t],(a=_toConsumableArray(k).find(function(e){return e.name===t&&e.tempScope===r}))?a.value=n:k.add({name:t,path:[],value:n,tempScope:r,type:e})),T(),v()}).on("delete",function(){T(),v()}),S.panel.append("<div class='panel-variables-bottom'>\n\t\t\t<button class='panel-variables-copy'>Copy $ variables as (set:) call</button>\n\t\t\t<input class='clipboard' type=\"text\" style='opacity:0;pointer-events:none;position:absolute;'></input>\n\t\t</div>").removeAttr("hidden"),S.tab.addClass("enabled"),S.panel.find(".clipboard")),x=(r.on("click",".panel-variables-copy",function(){var e,t=[];for(e in D.variables)e.startsWith("TwineScript")||t.push("$"+e+" to "+G(D.variables[e]));_.val("(set:"+t+")")[0].select(),document.execCommand("copy")}),W.create({className:"enchantments",tabName:"Enchantment",rowWrite:function(e,t){var n=e.scope,r=e.changer,a=e.lambda,o=e.name,i=e.localHook,a=r?f(U(r)):a?f(G(a)):"<em>enchanted with ("+o+":)</em>";return t||I('<div class="enchantment-row">').data("enchantment",e).append("<td><span class='enchantment-name'>"+G(n)+(i?"</span><span class='enchantment-local cm-harlowe-3-hookName'>"+("function"==typeof i.TwineScript_ToSource?i.TwineScript_ToSource():i.attr("name")?"?"+i.attr("name"):"an unnamed hook"):"")+"</span></td><td class='enchantment-value cm-harlowe-3-macroName-"+(r?"changer":"command")+" '>"+a+"</td>"+(r?"<td class='panel-row-buttons'><tw-folddown tabindex=0>(source:)</tw-folddown></td>":"")).find("tw-folddown").data("folddown",g).end().add(r?I("<tr class='panel-row-source' style='display:none'><td colspan='3'></td></tr>"):"")},rowCheck:function(e,t){return t.data("enchantment")===e},columnHead:function(){return'<tr class="panel-head"><th data-col="enchantment-name">Scope</th><th data-col="enchantment-value">Value</th></div>'}})),d=l(function(e){x.update(e.enchantments,e.enchantments.length)}),O=(q.on("add",d).on("remove",d),q.create()),A=W.create({className:"storylets",tabName:"Storylet",rowWrite:function(e,t){var n=e.name,r=e.active,a=e.storyletSource,o=e.exclusive,e=e.urgent;return t?(t.toggleClass("storylet-closed",!r),t[0].firstChild.textContent=r?"\u2713":""):(t=I('<tr class="storylet-row '.concat(r?"":"storylet-closed",'">')).attr("data-name",n).append("<td class='storylet-open'>"+(r?"\u2713":"")+"</td><td class='storylet-name'>"+n+"</td><td class='storylet-lambda'></td><td class='storylet-exclusive'>"+o+"</td><td class='storylet-urgent'>"+e+"</td>")).find(".storylet-lambda").append(B(a.replace(/^when\s+/i,""))),t},rowCheck:function(e,t){e=e.name;return t[0].getAttribute("data-name")===f(e+"")},columnHead:function(){return'<tr class="panel-head"><th data-col="storylet-open" data-order="desc">Open</th><th data-col="storylet-name">Name</th><th data-col="storylet-lambda">Condition</th><th data-col="storylet-exclusive" class=\'storylet-exclusive\'>Exclusivity</th><th data-col="storylet-urgent" class=\'storylet-urgent\'>Urgency</th></tr>'}}),C=(A.tab.hide(),v=l(function(){var r,a,o=z.getStorylets(O),i=H.containsError(o),e=z.allStorylets();A.update(e.map(function(t){var e="number"==typeof t.get("exclusivity")?t.get("exclusivity"):0,n="number"==typeof t.get("urgency")?t.get("urgency"):0;return r=r||e,a=a||e,{name:t.get("name"),storyletSource:t.get("storylet").TwineScript_ToSource(),active:!i&&o.some(function(e){return e.get("name")===t.get("name")}),exclusive:e,urgent:n}}),i?0:o.length),A.panel.toggleClass("storylet-error",i),A.panel.toggleClass("panel-exclusive",r),A.panel.toggleClass("panel-urgent",a),e.length&&A.tab.show()}),W.create({className:"source",tabName:"Source",tabNameCounter:!1,rowWrite:function(e,t){var n=e.name,e=e.tag;return t?t.add(t.next(".panel-row-source")):(t=z.get(n).get("source"),I('<div class="source-row" data-tag="'.concat(e,'">')).data("value",t).append('<td class="source-name">'.concat(n,'</td><td class="source-tags">').concat(e,"</td><td class='panel-row-buttons'><tw-folddown class='").concat(e?"":"open","' tabindex=0></tw-folddown></td>")).find("tw-folddown").data("folddown",g).end().add(I("<tr class='panel-row-source' style='".concat(e?"display:none":"","'><td colspan='3'></td></tr>")).find("td").append(!e&&B(t,"markup")).end()))},rowCheck:function(e,t){e=e.name;return t[0].firstChild.textContent===f(e+"")},tabUpdate:I.noop,columnHead:I.noop})),E=["debug-startup","startup","header","debug-header","footer","debug-footer"].reduce(function(e,t){return e.concat(z.getTagged(t).map(function(e){return{name:e.get("name"),tag:t}}))},[]),N=W.create({className:"errors",tabName:"Error",rowWrite:I.noop,rowCheck:I.noop,columnHead:I.noop,tabUpdate:function(e){return N.tab.css({background:e?"rgba(230,101,204,0.3)":""}).text("".concat(e," Error").concat(1!==e?"s":""))}}),d=n(function(e){var t;V.options.debug&&(N.panelRows.append(e.reduce(function(e,t){var t=_slicedToArray(t,2),n=t[0],t=t[1];return"propagated"===n.type?e:e+'<tr class="error-row"><td class="error-passage">'+D.passage+'</td><td class="error-message" title="'+f(t)+'">'+n.message+"</td></tr>"},"")),500<(t=(e=N.panelRows.children()).length)&&I(Array.prototype.slice.call(N.panelRows[0].childNodes,0,t-500)).remove(),N.tabUpdate(Math.min(500,e.length)))},{batch:!0}),j=(H.on(d),N.panel.append("<div class='panel-errors-bottom'>\n\t\t\t<button class='panel-errors-clean'>\ud83e\uddf9 Clear this panel</button>\n\t\t</div>"),r.on("click",".panel-errors-clean",function(){N.panelRows.empty(),N.tabUpdate(0)}),W.create({className:"tools",tabName:"Tools",tabNameCounter:!1,rowWrite:function(e,t){var n=e.id,r=e.type,a=e.label,o=e.dropdownItems,i=e.dropdownValue;return"checkbox"===r?t?t.find("input").prop("checked",!1):I('<span><input id="debug-'.concat(n,'" type="checkbox"></input><label for="debug-').concat(n,'">').concat(a,"</label></span>")):"dropdown"===r?t?t.find("input").prop("checked",!1):I("<span>".concat(a,'<select style="width:3em" data-default="').concat(i,'" id="debug-').concat(n,'"></span>')).find("select").append(o.map(function(e){return"<option value='".concat(e,"' ").concat(e===i?"selected":"",">").concat(e,"x</option>")})).end():void 0},rowCheck:I.noop,columnHead:I.noop,tabUpdate:function(e){return j.tab.css({background:e?"hsla(210, 72%, 65%, .3)":""})}})),P=(r.on("click, change",'.panel-tools [type="checkbox"], .panel-tools select',function(e){var e=e.target,t=(e=I(e)).attr("id"),n=e.is(":checked")||e.is("select")&&e.val()!==+e.attr("data-default");"debug-peekBehindDialogs"===t&&r.toggleClass("debug-dialogs",n),"debug-ignoreClickEvents"===t&&(V.options.ignoreClickEvents=n),"debug-ignoreGotos"===t&&(V.options.ignoreGotos=n),"debug-speedMultiplier"===t&&(V.options.speedMultiplier=+e.val()),j.tabUpdate(n)}),j.update([{id:"peekBehindDialogs",type:"checkbox",label:"See through and click through <code>(dialog:)</code> boxes"},{id:"ignoreClickEvents",type:"checkbox",label:"Stop links, <code>(click:)</code> and <code>(hover-style:)</code> from activating"},{id:"ignoreGotos",type:"checkbox",label:"Stop <code>(go-to:)</code>, <code>(undo:)</code>, <code>(redirect:)</code> and <code>(restart:)</code> from activating<br><small>(Click 'GO' buttons in Debug View to activate later)</small>"},{id:"speedMultiplier",label:"Speed of timed events (<code>time</code>, <code>(live:)</code>, <code>(after:)</code>): ",type:"dropdown",dropdownValue:1,dropdownItems:[.25,.5,.75,1,1.25,1.5,1.75,2,3,5,10]}]),W.create({className:"options",tabName:"\u2699\ufe0f",tabNameCounter:!1,rowWrite:function(e,t){var n=e.name,e=e.label,r={darkMode:o.darkMode,fadePanel:o.fadePanel,evalReplay:o.evalReplay}[n];return t?t.find("input").prop("checked",r):I('<span><input id="debug-'.concat(n,'" type="checkbox" ').concat(r?"checked":"",'></input><label for="debug-').concat(n,'">').concat(e,"</label></span>"))},rowCheck:I.noop,tabUpdate:I.noop,columnHead:I.noop})),R=(r.on("click",'.panel-options [type="checkbox"]',function(e){var e=e.target,t=(e=I(e)).attr("id"),e=e.is(":checked");"debug-darkMode"===t&&(o.darkMode=e,h.toggleClass("theme-dark",e)),"debug-fadePanel"===t&&(o.fadePanel=e,h.toggleClass("fade-panel",e)),"debug-evalReplay"===t&&(V.options.evalReplay=o.evalReplay=e),c()}),P.update([{name:"darkMode",label:"Debug panel is dark"},{name:"fadePanel",label:"Debug panel is transparent unless the cursor is over it"},{name:"evalReplay",label:"Record expression replays (viewable via \ud83d\udd0d buttons in Debug View; slower)"}]),h.prepend(S.panel,x.panel,N.panel,A.panel,C.panel,j.panel,P.panel),s.prepend(S.tab,x.tab,N.tab,A.tab,C.tab,j.tab,P.tab),D.on("beforeForward",y).on("beforeBack",y).on("beforeLoad",y),l(function(){T(),v(),x.panelRows.empty(),x.tabUpdate(0),D.passage&&z.get(D.passage)&&(C.update(E.concat({name:D.passage,tag:""})),C.panel.find('[data-tag=""], [data-tag=""] + .panel-row-source').insertBefore(C.panel.find('[data-tag="footer"]').first()))}));D.on("forward",R).on("back",R).on("load",R);K=b,I(document.head).append(I("<style>").html(X)),b(),e&&d(e,t)};return F.registerDebugMode(function(e,t){return!V.options.debug&&K(e,t)}),K}),define("debugmode/panel",["jquery","utils/naturalsort"],function(d,e){var i=e();return Object.seal({create:function(e){var n,t=e.className,r=e.rowWrite,a=e.rowCheck,o=e.rowSort,i=e.columnHead,s=e.tabName,c=e.tabNameCounter,l=void 0===c||c,c=e.tabUpdate,u=d("<div class='panel panel-".concat(t,"' style='").concat(this.defaultMaxHeight?"max-height:"+this.defaultMaxHeight+"px":"","' hidden><div class=\"resizer-v\"></div><table class='panel-rows'></table></div>")),p=d("<button class='tab tab-".concat(t,"'>").concat(l?"0 ".concat(s,"s"):s,"</button>"));return p.click(function(){p.toggleClass("enabled"),p.parent().siblings(".panel").attr("hidden",""),p.is(".enabled")&&(p.siblings(".tab:not(.tab-"+t+")").removeClass("enabled"),u.removeAttr("hidden"))}),u.on("click","th",function(e){var e=e.target,t="desc"===(e=d(e)).attr("data-order")?"asc":"desc";n.sort(e.attr("data-col"),t),u.find("th[data-order]").removeAttr("data-order"),e.attr("data-order",t)}),c=c||function(e){return p.text(l?"".concat(e," ").concat(s).concat(1!==e?"s":""):s)},n=Object.assign(Object.create(this),{tabName:s,tab:p,panel:u,panelRows:u.find(".panel-rows"),rowWrite:r,rowSort:o,rowCheck:a,columnHead:i,tabUpdate:c})},sort:function(r,a){var o=this;this.panelRows.children(":not(.panel-head, .panel-row-source)").get().sort(function(e,t){var n;return"desc"===a&&(e=(n=[t,e])[0],t=n[1]),e=e.querySelector("."+r),t=t.querySelector("."+r),o.rowSort&&o.rowSort(r,d(e),d(t))||i(e.textContent,t.textContent)}).forEach(function(e){var t=d(e).next(".panel-row-source").get();o.panelRows.append(e,t)})},update:function(e,t){var r=this.rowCheck,a=this.rowWrite,o=this.panelRows,n=this.columnHead,i=this.panel,s=[],c=o.children(),e=(e.forEach(function(t){var e=c.get().filter(function(e){return r(t,d(e))}),n=a(t,e.length&&d(e));e.length||o.append(n),s.push.apply(s,_toConsumableArray(n.get()))}),c.filter(function(e,t){return!s.includes(t)&&!t.className.includes("panel-head")}).remove(),this.tabUpdate(t),0<t&&!o.find(".panel-head").length?o.prepend(n()):0===t&&o.find(".panel-head").remove(),i.find("th[data-order]"));e.length&&this.sort(e.attr("data-col"),e.attr("data-order"))},defaultMaxHeight:300})}),define("internaltypes/changedescriptor",["jquery","utils","renderer","datatypes/hookset","internaltypes/twineerror"],function(b,e,t,v,n){function w(e){return("string"==typeof e?e:e.map(function(e){return e.text}).join("")).split(/\n/g).reduce(function(e,t,n,r){r=r.length;return e.concat(document.createTextNode(t),n!==r-1&&document.createElement(t.length?"br":"tw-consecutive-br"))},[])}var k=e.impossible,S=e.transitionIn,T=t.exec,r=Object.assign,p=Object.keys,a=Object.create,e=Object.seal,_=Array.isArray,x={source:"",appendSource:null,enabled:!0,enablers:null,verbatim:!1,target:null,append:"",newTargets:null,transition:"",transitionTime:null,transitionDeferred:!1,transitionDelay:0,transitionSkip:0,transitionOrigin:null,loopVars:null,styles:null,attr:null,data:null,innerEnchantments:null,section:null,timestamp:0,output:!1,summary:function(){var t=this;return["source","appendSource","enabled","verbatim","target","append","newTargets","transition","transitionTime","transitionDeferred","transitionDelay","transitionSkip","transitionOrigin","innerEnchantments","enablers","output"].filter(function(e){return hasOwnProperty.call(t,e)}).concat([this.attr.length&&"attr",this.styles.length&&"styles",p(this.loopVars).length&&"loopVars",p(this.data).length&&"data"].filter(Boolean))},create:function(e,t){e=r(a(this),{attr:this.attr?this.attr.slice():[],styles:this.styles?this.styles.slice():[],loopVars:this.loopVars||{},data:this.data||{}},e);if(t){t=t.run(e);if(n.containsError(t))return t}return e},update:function(){function e(t){var e,n,r;_(a.styles)&&0<a.styles.length&&(n=(e=_slicedToArray(a.styles.reduce(function(n,r){return p(r).forEach(function(e){var t=r[e];n[+("function"==typeof t)].push(_defineProperty({},e,t))}),n},[[],[]]),2))[0],r=e[1],n.forEach(function(e){return t.css(e)}),setTimeout(function(){r.forEach(function(e){return t.css(e)})})),a.attr&&a.attr.forEach(function(e){return t.attr(e)}),a.data&&t.data(a.data)}var a=this,t=this.section,n=this.newTargets,r=this.transition,o=this.transitionDeferred,i=this.append,s=this.target;"function"==typeof s&&(s=s());if(_(n)&&n.length&&(s=n.map(function(e){return e.target})),_(s))for(var c=0;c<s.length;c+=1)v.isPrototypeOf(s[c])?s[c].forEach(t,e):e(s[c]);else v.isPrototypeOf(s)?s.forEach(t,e):e(s);if(r&&!o&&!i){for(var l,u=s;(l=u.data("timestamp"))||(u=u.parent()),!l&&u.length;);S(s,r,this.transitionTime,this.transitionDelay,this.transitionSkip,l?Date.now()-l:0,this.transitionOrigin)}},render:function(){var e,r=this,t=this.source,n=this.transition,a=this.transitionTime,o=this.transitionDeferred,i=this.enabled,s=this.enablers,c=this.data,l=this.section,u=this.newTargets,p=this.innerEnchantments,d=this.appendSource,f=this.output,h=this.target,m=this.target,g=this.append;if("function"==typeof h&&(h=h()),!g)return k("ChangeDescriptor.render","This doesn't have an 'append' method chosen."),b();if(f)return b();if(null!=s&&s.length)return s=(f=s[0]).descriptor,f=f.changer,s=s.render(),f&&(e=x.create({section:l,target:s}),f.run(e),e.update()),s;if(!i||void 0!==h.attr("hidden"))return x.create({target:h,attr:this.attr.filter(function(e){return!("style"in e)}),data:_objectSpread(_objectSpread({},c),{},{originalSource:t,hidden:!0})}).update(),b();if(!(h=_(u)&&u.length?u:h))return k("ChangeDescriptor.render","ChangeDescriptor has source but not a target!"),b();var y=b();if([].concat(h).filter(function(e){return!e.jquery}).map(function(e){var t,n,r=g;return e.target&&e.append&&(r=(t=e).append,n=t.before,e=e.target),{elements:e.hooks(l,m).filter(function(){return!(n&&1&this.compareDocumentPosition(document)&&2&this.compareDocumentPosition(m[0]))}),append:r}},[]).forEach(function(e){var t=e.elements,n=e.append;t.each(function(e,t){t=b(t),y=y.add(r.create({target:t,append:n,newTargets:null}).render()),t.filter("tw-pseudo-hook").contents().unwrap()})}),!(y.length||_(h)||v.isPrototypeOf(h))){f=g;if(!(f in h)){if("replace"!==f)return k("ChangeDescriptor.render","The target doesn't have a '"+f+"' method."),b();f=h[0]instanceof Text?"replaceWith":(h.empty(),"append")}h[0]instanceof Text&&"prepend"===(f="append"===f?"after":f)&&(f="before"),y=b(t&&(this.verbatim?w:T)(t)),_(d)&&d.forEach(function(e){var t=e.source,e=e.append,t=b((r.verbatim?w:T)(t));y="append"===e?y.add(t):"prepend"===e?t.add(y):t}),h[f](y.length?y:void 0),h.data("timestamp",Date.now()),this.update(),n&&!o&&S("replace"===g?h:y,n,a,this.transitionDelay,this.transitionSkip,this.expedite,this.transitionOrigin),p&&p.map(function(e){return e(h)}).forEach(function(e){return l.addEnchantment(e)})}return y}};return e(x)}),define("internaltypes/enchantment",["jquery","utils","internaltypes/changedescriptor","datatypes/changercommand","utils/operationutils","internaltypes/twineerror","utils/renderutils"],function(g,y,b,v,e,w,t){var k=e.objectName,S=e.toSource,T=t.collapse;return Object.freeze({create:function(e){return Object.assign(Object.create(this),{enchantments:g()},e)},enchantScope:function(){var i=this,s=this.attr,c=this.data,l=this.functions,u=this.section,p=this.scope,d=this.localHook,f=this.lambda,h=[],m=0;p.forEach(u,function(e,t){if(d){d=d.jquery?d:d.hooks(u);var n=e.find(d);if(n.length)e=n;else if(!d.has(e[0]).length)return}var r,a,o;(!e.is(":empty")||e.data("source")&&e.data("source").length)&&(m+=1,f?(o=f.apply(u,{loop:p.TwineScript_GetProperty(t),pos:m}),w.containsError(o)?(e.replaceWith(o.render()),f=o=null):v.isPrototypeOf(o)?o.canEnchant||(e.replaceWith(w.create("macrocall",'The lambda "'.concat(S(f),"\" can't be or include a revision, enchantment, or interaction changer like (replace:), (click:), or (link:).")).render()),f=o=null):(e.replaceWith(w.create("macrocall",'The lambda "'.concat(S(f),'" must return a changer, not ').concat(k(o),".")).render()),f=o=null)):o=i.changer,n=!s&&!c&&(!o||o.summary().every(function(e){return e.startsWith("transition")})),r=n?e:e.wrap("<tw-enchantment>").parent(),s&&r.attr(s),c&&r.data(c),l&&l.forEach(function(e){return e(r)}),o&&(t=b.create({section:u,target:r}),o.run(t),t.update(),e.is(y.storyElement)?(a=Object.keys(Object.assign.apply(Object,[{}].concat(_toConsumableArray(t.styles)))),e.css(a.reduce(function(e,t){return"background-color"===t||"background-image"===t?(e["background-color"]="transparent",e["background-image"]="none",a.push("background-".concat("background-color"===t?"image":"color"))):e[t]="inherit",e},{})),r.data({enchantedProperties:a})):e.is("tw-passage")&&t.styles.some(function(e){return"margin-left"in e||"margin"in e||"margin-right"in e})&&(o="padding-right",y.storyElement.css(t="padding-left","0px").css(o,"0px"),r.data({enchantedProperties:[t,o]}))),e.is(y.storyElement)&&r.css({"min-width":"100%","min-height":"100%"}),"true"===r.attr("collapsing")&&(r.find("[collapsing=false]").each(function(){g(this).removeAttr("collapsing")}),T(r)),n||h.push(r))}),this.enchantments=g(h)},disenchant:function(){this.enchantments.each(function(e,t){(t=g(t)).contents().unwrap();t=t.data("enchantedProperties");t&&y.storyElement.css(t.reduce(function(e,t){return e[t]="",e},{}))})}})}),define("internaltypes/twineerror",["jquery","utils"],function(i,s){var a=s.impossible,c=s.escape,l=(i(document.documentElement).on("click","tw-folddown",function(e){var t=e.target,e=((t=i(t)).toggleClass("open"),t.popData("folddown"));for("function"==typeof e&&e(t);t&&!t.next().length;)t=t.parent();null!=(e=t)&&e.next().toggle()}),{syntax:"The markup seems to contain a mistake.",saving:"I tried to save or load the game, but I couldn't do it.",operation:"I tried to perform an operation on some data, but the data's type was incorrect.",macrocall:"I tried to use a macro, but its call wasn't written correctly.",datatype:"I tried to use a macro, but was given the wrong type of data to it.",custommacro:"I tried to use a custom macro, but its code hook had a mistake in it.",infinite:"I almost ended up doing the same thing over and over, forever.",property:"I tried to access a value in a string/array/datamap, but I couldn't find it.",unimplemented:"I currently don't have this particular feature. I'm sorry.",propagated:"Click the 'Open' button to see the code hook as it was executed.",user:"This is a custom error created by (error:). It usually means you used a custom macro incorrectly.",assertion:"This command exists to provide a helpful error if a certain important condition wasn't true.",debugonly:"This macro is not meant to be used outside of debugging your story."}),u=[],n={TwineError:!0,create:function(e,t,n,r){return t&&"string"==typeof t||a("TwineError.create","has a bad message string"),n||e in l||a("TwineError.create","no error explanation given"),"user"!==e&&(t=t[0].toUpperCase()+t.slice(1)),Object.assign(Object.create(this),{type:e,message:t,explanation:n,source:void 0,innerDOM:r,appendTitleText:!1})},containsError:function(){for(var e=0;e<arguments.length;e+=1){var t=arguments[e];if(n.isPrototypeOf(t))return t;if(Array.isArray(t)){t=n.containsError.apply(n,t);if(t)return t}}return!1},createWarning:function(e,t){return Object.assign(this.create(e,t),{warning:!0})},render:function(t){var n=this,e=1<arguments.length&&void 0!==arguments[1]&&arguments[1],r=(t="string"==typeof t?t:this.source||"",i("<tw-error class='"+(this.warning?"warning":"error")+"' title='"+c(t)+"'>"+c(this.message+(this.appendTitleText?" "+t:""))+"</tw-error>")),a=i("<tw-error-explanation>").text(this.explanation||l[this.type]).hide(),o=i("<tw-folddown tabindex=0>");return this.innerDOM&&i("<tw-open-button label='Open'>").on("click",function(){var e=i("<tw-backdrop><tw-dialog></tw-backdrop>");e.find("tw-dialog").prepend(n.innerDOM,i("<tw-link tabindex=0>OK</tw-link>").on("click",function(){n.innerDOM.detach(),e.remove()}).wrap("<tw-dialog-links>").parent()),s.storyElement.prepend(e)}).appendTo(r),r.append(o).append(a),r.data("TwineError",this),e||u.forEach(function(e){return e(n,t)}),r},on:function(e){return"function"!=typeof e||u.includes(e)||u.push(e),n}};return Object.preventExtensions(n)}),define("internaltypes/twinenotifier",["jquery","utils"],function(e,t){var n=t.impossible,r={create:function(e){return e||n("TwineNotifier.create","called with only 1 string."),Object.assign(Object.create(r),{message:e})},render:function(){return e("<tw-notifier>").attr("message",this.message)}};return Object.preventExtensions(r)}),define("internaltypes/varref",["state","internaltypes/twineerror","utils","utils/operationutils","datatypes/hookset"],function(u,p,e,t,i){var c,n=e.impossible,s=e.andList,r=e.nth,o=t.is,d=t.isObject,f=t.toSource,h=t.isSequential,m=t.objectName,l=t.typeName,g=t.clone,y=t.isValidDatamapName,b=t.subset,v=t.collectionType,w=t.unstorableValue,a=t.matches,k=Array.isArray,S={set:[],delete:[]},T="You can only access position strings/numbers ('4th', 'last', '2ndlast', (2), etc.), slices ('1stTo2ndlast', '3rdTo5th'), ",_="You can't access the '0th' or '0thlast' position of ";function x(e,t){if(p.containsError(t))return n;if(e instanceof Map&&(n=p.containsError(y(e,t))))return n;if(h(e))if("number"==typeof t){if(0===t)return p.create("property","You can't access elements at position 0 of ".concat(m(e),"."),"Only positive and negative position values exist.");0<t&&--t}else if("string"==typeof t&&(r=/^(\d+)(?:st|[nr]d|th)last$/i.exec(t))){if("0"===r[1])return p.create("property",_+m(e)+".");t=-r[1]}else if("string"==typeof t&&(r=/^(\d+)(?:st|[nr]d|th)$/i.exec(t))){if("0"===r[1])return p.create("property",_+m(e)+".");t=r[1]-1}else if("string"==typeof t&&(r=/^(?:(\d+)(?:st|[nr]d|th)(last)?|last)to(?:(\d+)(?:st|[nr]d|th)(last)?|last)$/i.exec(t))){var n=_slicedToArray(r,5),r=n[1],r=void 0===r?0:r,a=n[2],o=n[3],o=void 0===o?0:o;t={last:n[4]?-o:o-1,first:a?-r:r-1}}else if("last"===t)t=-1;else if("random"===t){if(!e.length)return p.create("property","I can't get a random value from ".concat(m(e),", because it's empty."));t=u.random()*Array.from(e).length|0}else{if(i.isPrototypeOf(e)&&!i.TwineScript_Properties.includes(t))return p.create("property","".concat(T+s(i.TwineScript_Properties.map(function(e){return"'"+e+"'"}))," of ").concat(m(e),", not ").concat(("string"==typeof t?f:m)(t),"."));if(!["length","some","any","all","start","end","random"].includes(t)&&!i.isPrototypeOf(e))return p.create("property","".concat(T,"'length', 'some', 'any', 'all', 'start', 'end', and 'random' of ").concat(m(e),", not ").concat(("string"==typeof t?f:m)(t),"."))}else if(e instanceof Set){if(!["length","some","any","all"].includes(t))return p.create("property","".concat(T,"'length', 'some', 'any', and 'all' of ").concat(m(e),"."),"You can't access specific individual data values from datasets.");"length"===t&&(t="size")}else{if(k(e.TwineScript_Properties)&&!e.TwineScript_Properties.includes(t))return p.create("property","You can only get the ".concat(s(e.TwineScript_Properties.map(function(e){return"'"+e+"'"}))," of ").concat(m(e),", not ").concat(("string"==typeof t?f:m)(t),"."));if("number"==typeof e||"boolean"==typeof e)return p.create("property","You can't get any data values, let alone ".concat(m(t),", from ").concat(m(e)))}return t}function O(e,t){return+t<0&&Math.abs(t)<=e.length?e.length+ +t:t}var A=/[^\uD801-\uDFFF]/,C=new Map;function E(e,t){var n,r,a;return void 0===e?e:e instanceof Map?e.get(t):"some"!==t&&"any"!==t&&"all"!==t&&"start"!==t&&"end"!==t||e.TwineScript_VariableStore?("string"==typeof e&&(C.has(e)?e=C.get(e):A.test(e)?(a=_toConsumableArray(e),C.set(e,a),e=a):C.set(e,e)),h(e)&&Number.isFinite(t)&&(t=O(e,t)),e.TwineScript_GetProperty?e.TwineScript_GetProperty(t):"function"!=typeof(a=e[t])?a:void 0):(n=e,r=t,a='"'.concat(r," value").concat("any"===r?"":"s",'" of '),{determiner:r,determined:n,array:_toConsumableArray(n),string:"string"==typeof n&&n,TwineScript_ObjectName:a+m(n),TwineScript_ToSource:function(){return"".concat(r," of ").concat(f(n))},TwineScript_TypeName:a+"a data structure",TwineScript_Unstorable:!0,TwineScript_Print:function(){return"`["+this.TwineScript_TypeName+"]`"}})}function N(e){var t;return e.computed?(t=e.value,"string"==typeof(t=c.isPrototypeOf(t)?t.get():t)?"('"+t+"')":"("+t+")"):"number"==typeof e?r(e):"'"+e+"'"}function j(t,e,n){if(t.TwineScript_VariableStore){if(t.TwineScript_TypeDefs&&e in t.TwineScript_TypeDefs){var r=t.TwineScript_TypeDefs[e];if("const"===r.name){if(void 0!==t[e])return p.create("operation","I can't alter ".concat(t===u.variables?"$":"_").concat(e," because it's been restricted to a constant value."),"This variable can't be changed for the rest of the story.")}else if(!a(r,n))return p.create("operation","I can't set ".concat(t===u.variables?"$":"_").concat(e," to ").concat(l(n)," because it's been restricted to ").concat(f(r),"-type data."),"You can restrict a variable or data name by giving a typed variable to (set:) or (put:).")}return!0}return k(e)?e.map(function(e){return j(t,e)}):t instanceof Map?"string"==typeof e||p.create("operation","".concat(m(t)," can only have string data names, not ").concat(m(e),".")):h(t)?["length","random","some","any","all","start","end"].includes(e)?p.create("operation","I can't forcibly alter the '"+e+"' of "+m(t)+".","start"===e||"end"===e?"Alter the values at actual positions, like 1st or 2ndlast, rather than just the '"+e+"'.":void 0):+e==(0|e)||p.create("property",m(t)+" can only have position keys ('3rd', '1st', (5), etc.), not "+N(e)+"."):t.TwineScript_Identifiers&&e in t?p.create("keyword","I can't alter the value of the '"+e+"' identifier.","You can only alter data in variables, not fixed identifiers."):p.create("operation","I can't modify "+m(t),t instanceof Set?"You should use an (array:) if you need to modify the data inside this dataset.":i.isPrototypeOf(t)?"You should alter hooks indirectly using macros like (replace:) or (enchant:).":void 0)}function P(t,e,n,r){var a=e;t instanceof Map?t.set(e,n):(h(t)&&(e=O(t,e)),t.TwineScript_Set?t.TwineScript_Set(e,n,r):t[e]=n),S.set.forEach(function(e){return e(t,a,n)})}function R(t,e){var n=e;h(t)&&(e=O(t,e)),k(t)&&/^(?:[1-9]\d*|0)$/.exec(e)?t.splice(e,1):t instanceof Map||t instanceof Set?t.delete(e):t.TwineScript_Delete?t.TwineScript_Delete(e):delete t[e],S.delete.forEach(function(e){return e(t,n)})}function I(t,e){var n,r,a=2<arguments.length&&void 0!==arguments[2]?arguments[2]:e,o=3<arguments.length&&void 0!==arguments[3]&&arguments[3];return e&&"object"===_typeof(e)&&"last"in e&&"first"in e?i.isPrototypeOf(t)?t.TwineScript_GetProperty(e):(n=e.first,r=e.last,b(t,n+(0<=n),r+(0<=r))):k(e)?i.isPrototypeOf(t)?t.TwineScript_GetProperty(e):e.map(function(e){return I(t,e,e)})["string"==typeof t?"join":"valueOf"](""):void 0!==(n=E(t,e))||o?n:t===u.variables?0:"temp"===(null==(r=t.TwineScript_VariableStore)?void 0:r.type)?p.create("property","There isn't a temp variable named _".concat(a," in this place."),"Temp variables only exist inside the same passage, hook, or lambda in which they're created."):k(t)&&"number"==typeof e?p.create("property","This array of ".concat(t.length," elements doesn't have a ").concat(N(a+("number"==typeof a?1:""))," element."),t.length?"It contains: ".concat(s(t.map(m)),"."):"The array is empty."):(o=Array.from("function"==typeof t.keys&&t.keys()),p.create("property","I can't find a ".concat(N(a)," data name in ").concat(m(t)),t instanceof Map&&o.length?"Its names include: ".concat(s(o),"."):void 0))}function V(e,t){var r=this,e=this.compiledPropertyChain.reduce(function(e,t){var n=0===e.length?r.object:I.apply(void 0,_toConsumableArray(e[e.length-1]));return e.push([n,t])&&e},[]).reduceRight(e,t);return p.containsError(e)?e:void 0}return c=Object.freeze({get:function(){for(var e=this.object,t=0;t<this.compiledPropertyChain.length-1;t+=1)if(e=I(e,this.compiledPropertyChain[t]),p.containsError(e))return e;return I(e,this.compiledPropertyChain.slice(-1)[0],this.propertyChain.slice(-1)[0])},has:function(){for(var e=this.object,t=0;t<this.compiledPropertyChain.length-1;t+=1)if(void 0===(e=I(e,this.compiledPropertyChain[t],void 0,!0))||p.containsError(e))return!1;return void 0!==I(e,this.compiledPropertyChain.slice(-1)[0],void 0,!0)},set:function(e,c){var l=this;return!this.object||this.object.TwineScript_VariableStore||this.object.TwineScript_Identifiers?V.call(this,function(n,e,t){var e=_slicedToArray(e,2),r=e[0],a=e[1];if(e=p.containsError(n,r,a)||p.containsError(j(r,a,n)))return e;if(e=w(n))return p.create("operation","".concat(m(n)," can't be stored").concat(!n.TwineScript_Unstorable&&v(n)?" because it holds ".concat(m(e)):"","."));if(0<t)r=g(r);else if("temp"===(null==(e=r.TwineScript_VariableStore)?void 0:e.type)&&r!==u.variables){for(var o=r;"temp"===(null==(i=o.TwineScript_VariableStore)?void 0:i.type)&&!hasOwnProperty.call(o,a);)var i,o=Object.getPrototypeOf(o);"temp"===(null==(t=o.TwineScript_VariableStore)?void 0:t.type)&&(r=o)}if("string"==typeof r){if("string"!=typeof n)return p.create("datatype","I can't put this non-string value, ".concat(m(n),", in a string."));if(n.length!==(k(a)?a.length:1))return p.create("datatype","".concat(m(n),"is not the right length to fit into this string location."));var r=_toConsumableArray(r),s=_toConsumableArray(n);[].concat(a).forEach(function(e){0+e<0&&(e=r.length+(0+e)),r=[].concat(_toConsumableArray(r.slice(0,e)),[s.shift()],_toConsumableArray(r.slice(e+1)))}),r=r.join("")}else d(r)&&(void 0!==n.TwineScript_KnownName&&((n=""!==n.TwineScript_KnownName?g(n):n).TwineScript_KnownName=f(l)),k(a)&&h(n)?("string"==typeof n&&(n=_toConsumableArray(n)),a.map(function(e,t){return[e,n[t]]}).forEach(function(e){var e=_slicedToArray(e,2),t=e[0],e=e[1];return P(r,t,e,c)})):P(r,a,n,c));return r},e):p.create("macrocall","I can't (set:) ".concat(m(this),", if the ").concat((m(this.object).match(/ (.+$)/)||["","value"])[1]," isn't stored in a variable."),"Modifying data structures that aren't in variables won't change the game state at all.")},delete:function(){return V.call(this,function(e,t,n){var r,t=_slicedToArray(t,2),a=t[0],t=t[1];return(r=p.containsError(e,a,t)||p.containsError(j(a,t)))||(0<n&&(a=g(a)),null===e?((r="string"==typeof a)&&(a=_toConsumableArray(a)),k(t)?(h(a)&&(t=_toConsumableArray(new Set(t))).sort(function(e,t){return O(a,t)-O(a,e)}),t.forEach(function(e){return R(a,e)})):R(a,t),r&&(a=a.join(""))):P(a,t,e,!1),a)},null)},defineType:function(e){var t=this.object,n=this.compiledPropertyChain[0],r=(hasOwnProperty.call(t,"TwineScript_TypeDefs")||(t.TwineScript_TypeDefs=Object.create(t.TwineScript_TypeDefs||null)),t.TwineScript_TypeDefs),a=r[n];if(a&&!o(a,e))return p.create("operation","I can't redefine the type of "+m(this)+" to "+(e.TwineScript_ObjectName||l(e))+", as it is already "+(a.TwineScript_ObjectName||l(a))+".");t.TwineScript_DefineType?t.TwineScript_DefineType(n,e):r[n]=e,"const"===e.name&&(t[n]=void 0)},matches:function(e,t){return this.object===e&&this.compiledPropertyChain[0]===t},getName:function(){return this.compiledPropertyChain[0]},create:function(e,t){var n;if(n=p.containsError(e))return n;Array.isArray(t)||(t=[].concat(t)),c.isPrototypeOf(e)&&(t=e.propertyChain.concat(t),e=e.object);var r=function(e,t){for(var n,r=[],a=0;a<t.length;a+=1){var o=t[a];if(o.computed&&(o=o.value),c.isPrototypeOf(o)&&(o=o.get()),k(o)){for(var i=[],s=0;s<o.length;s+=1)i[s]=x(e,o[s]);o=i}else o=x(e,o);if(n=p.containsError(o))return n;a<t.length-1&&(e=I(e,o)),r.push(o)}return r}(e,t);return(n=p.containsError(r))||Object.assign(Object.create(c),{object:e,propertyChain:t,compiledPropertyChain:r})},TwineScript_ToSource:function(){function r(e,t){return!t&&n.object.TwineScript_VariableStore?e:N(e)}var e,n=this;return(this.object===u.variables?"$":"temp"===(null==(e=this.object.TwineScript_VariableStore)?void 0:e.type)?"_":f(this.object)+"'s ")+(1===this.propertyChain.length?r(this.propertyChain[0]):this.propertyChain.reduce(function(e,t,n){return e+"'s "+r(t,n)}))},get TwineScript_ObjectName(){var e;return this.object.TwineScript_VariableStore?"the ".concat("temp"===(null==(e=this.object.TwineScript_VariableStore)?void 0:e.type)?"temp ":"","variable ").concat(this.TwineScript_ToSource()):m(this.object)+"'s "+(1===this.propertyChain.length?N(this.propertyChain[0]):this.propertyChain.reduce(function(e,t,n){return e+"'s "+N(t)}))},on:function(e,t){if(e in S)return"function"!=typeof t||S[e].includes(t)||S[e].push(t),c;n("VarRef.on","invalid event name")}})}),define("internaltypes/varscope",[],function(){return Object.seal({TwineScript_ObjectName:"the temporary variables",TwineScript_VariableStore:{type:"temp",name:"an unknown scope"},TwineScript_TypeDefs:Object.create(null)})}),define("macrolib/commands",["jquery","macros","utils","state","passages","engine","internaltypes/twineerror","internaltypes/twinenotifier","datatypes/assignmentrequest","datatypes/hookset","datatypes/codehook","datatypes/colour","datatypes/gradient","internaltypes/varref","datatypes/typedvar","datatypes/varbind","utils/operationutils","utils/renderutils"],function(u,n,b,c,l,a,y,M,e,o,t,p,d,i,s,v,r,f){var h=r.printBuiltinValue,m=r.objectName,g=r.clone,w=r.toSource,k=f.dialog,S=f.geomParse,D=f.geomStringRegExp,r=n.TypeSignature,f=r.Any,F=r.Everything,T=r.rest,_=r.either,x=r.optional,O=r.zeroOrMore,L=r.percent,H=r.nonNegativeInteger,A=r.positiveInteger,r=r.positiveNumber,C=Object.assign,E=Math.floor,N=Math.ceil,j=Math.abs,z=Math.max,q=Math.min,P=u.noop;function R(e){return"(".concat(e," ").concat(b.options.ifid,") ")}["set","put","unpack"].forEach(function(r){return n.add(r,"Instant",function(e){for(var t=0;t<(arguments.length<=1?0:arguments.length-1);t+=1){var n=t+1<1||arguments.length<=t+1?void 0:arguments[t+1];if("into"===n.operator&&"set"===r)return y.create("macrocall","Please say 'to' when using the (set:) macro.");if("to"===n.operator&&"set"!==r)return y.create("macrocall","Please say 'into' when using the (put:) or (unpack:) macro.");if((i.isPrototypeOf(n.dest)||s.isPrototypeOf(n.dest))===("unpack"===r))return y.create("macrocall","unpack"===r?"Please use the (unpack:) macro with arrays, datamaps or (p:) patterns containing variables to the right of 'into'.":"Please use the (".concat(r,":) macro with just single variables and typed variables to the ").concat("set"===r?"left of 'to'.":"right of 'into'."),"You may wish to change this to the (".concat("unpack"!==r?"unpack":"to"===n.operator?"set":"put",":) macro."));n=n.set();if(y.containsError(n))return n}return{TwineScript_TypeID:"instant",TwineScript_TypeName:"a (".concat(r,":) operation"),TwineScript_ObjectName:"a (".concat(r,":) operation"),TwineScript_Unstorable:!0,TwineScript_Print:function(){return b.options.debug,""}}},[T(e)])}),n.add("move","Instant",function(e){for(var t=0;t<(arguments.length<=1?0:arguments.length-1);t+=1){var n=t+1<1||arguments.length<=t+1?void 0:arguments[t+1];if("into"!==n.operator)return y.create("macrocall","Please say 'into' when using the (move:) macro.");n=n.set(!0);if(y.containsError(n))return n}return{TwineScript_TypeID:"instant",TwineScript_TypeName:"a (move:) operation",TwineScript_ObjectName:"a (move:) operation",TwineScript_Unstorable:!0,TwineScript_Print:function(){return b.options.debug,""}}},[T(e)]),n.addCommand("display",function(e){if(!l.hasValid(e))return y.create("macrocall","I can't (display:) the passage '".concat(e,"' because it doesn't exist."))},function(e,t,n){return e.source=l.getTree(n),e},[String])("print",P,function(e,t,n){return C(e,{source:h(n)})},[f])(["verbatim-print","v6m-print"],P,function(e,t,n){return C(e,{verbatim:!0,source:h(n)})},[f])(["verbatim-source","v6m-source"],function(e){if("command"===(null==e?void 0:e.TwineScript_TypeID)&&!e.TwineScript_ToSource)return y.create("datatype","I can't construct the source code of a command created by a custom macro.")},function(e,t,n){return C(e,{verbatim:!0,source:h(w(n))})},[f])("go-to",function(e){if(!l.hasValid(e))return y.create("macrocall","I can't (go-to:) to the passage '".concat(e,"' because it doesn't exist."),"Check that you didn't mistype the passage name, or rename the passage to something else.")},function(e,t,n){if(!b.options.ignoreGotos)return requestAnimationFrame(function(){return a.goToPassage(n,{transition:e.data.passageT8n})}),{blocked:!0}},[String])("redirect",function(e){if(!l.hasValid(e))return y.create("macrocall","I can't (redirect:) to the passage '".concat(e,"' because it doesn't exist."),"Check that you didn't mistype the passage name, or rename the passage to something else.")},function(e,t,n){if(!b.options.ignoreGotos)return requestAnimationFrame(function(){return a.redirect(n,{transition:e.data.passageT8n})}),{blocked:!0}},[String])("undo",P,function(e,t,n){return c.pastLength<1?C(e,{source:n}):b.options.ignoreGotos?void 0:(requestAnimationFrame(function(){return a.goBack({transition:e.data.passageT8n})}),{blocked:!0})},[x(String)])("debug",P,a.enableDebugMode,[],!1),b.onStartup(function(){return b.storyElement.on("click.icon","tw-icon",function(e){var t=u(this),n=t.data("clickEvent"),r=t.attr("alt");n&&n(t),"Undo"===r&&(e.stopPropagation(),a.goBack()),"Redo"===r&&(e.stopPropagation(),a.goForward()),"Fullscreen"===r&&(e.stopPropagation(),a.toggleFullscreen()),"Restart"===r&&(c.hasSessionStorage&&sessionStorage.removeItem("Saved Session"),window.location.reload())})}),[["Undo","&#8630;",function(){return 0<c.pastLength}],["Redo","&#8631;",function(){return 0<c.futureLength}],["Fullscreen","&#9974;",function(){return document.fullscreenEnabled||document.msFullscreenEnabled}],["Restart","&#10226;",Object]].forEach(function(e){var e=_slicedToArray(e,3),o=e[0],i=e[1],s=e[2];n.addCommand("icon-".concat(o.toLowerCase()),function(e,t){if("string"==typeof e&&"string"==typeof t)return e=_toConsumableArray(e).length,t=_toConsumableArray(t).length,1<e&&1<t?y.create("datatype","One of the two strings given to (icon-".concat(o.toLowerCase(),":) should be 1 character long, for its icon.")):1===e&&1===t?y.create("datatype","One of the two strings given to (icon-".concat(o.toLowerCase(),":) should be 2 or more characters long, for its label.")):void 0},function(t,e,n,r){var a;return("string"==typeof r&&1===_toConsumableArray(r).length||"string"==typeof n&&1<_toConsumableArray(n).length)&&(n=(a=[r,n])[0],r=a[1]),"Undo"===o&&(t.data.forgetUndosEvent=function(e){t.section.whenUnblocked(function(){return u(e).css("visibility","hidden")})}),C(t,{source:'<tw-icon tabindex=0 alt="'.concat(o,'" ').concat(r?'data-label="'.concat(r.replace('"',"&quot;"),'"'):"",' title="').concat(o,'" ').concat(s()?"":'style="visibility:hidden"',">").concat(n||i,"</tw-icon>")})},[x(String),x(String)])}),n.addCommand("icon-counter",function(e,t,n){var r=" label string given to (icon-counter:) can't be empty or only whitespace.";return t&&t.trim()?"string"!=typeof n||n.trim()?void 0:y.create("datatype","The 2nd "+r):y.create("datatype","The 1st "+r)},function(r,e,a,o,i){r.attr.push({"data-2bind":!0}),r.data.twoWayBindEvent=function(e,t,n){a.varRef.matches(t,n)&&"number"==typeof(t=a.varRef.get())&&r.target.children("tw-icon").text((0<t?E:N)(t)).attr("data-label",1!==j(t)&&void 0!==i?i:o)};var t=a.varRef.get();return"number"!=typeof t?y.create("datatype","(icon-counter:) can only be bound to a variable holding a number, not ".concat(m(t),".")):C(r,{source:'<tw-icon data-label="'.concat(b.escape(1!==j(t)&&void 0!==i?i:o),'">').concat((0<t?E:N)(t),"</tw-icon>")})},[v,String,x(String)]),n.addCommand("meter",function(e,t,n,r){return"two way"===e.bind?y.create("datatype","(meter:) shouldn't be given two-way bound variables.",'Change the "2bind" keyword to just "bind".'):"string"!=typeof r||r.trim()?-1===n.search(D)||!n.includes("=")&&1<n.length?y.create("datatype",'The (meter:) macro requires a sizing line("==X==", "==X", "=XXXX=" etc.) be provided, not '+JSON.stringify(n)+"."):void 0:y.create("datatype","The label string given to (meter:) can't be empty or only whitespace.")},function(r,e,a,n,t,o,i){o&&"string"!=typeof o&&(i=o,o=void 0),i=i||p.create({h:0,s:0,l:.5,a:.5}),p.isPrototypeOf(i)&&(i=d.create(90,[{colour:i,stop:0},{colour:i,stop:1}]));function s(e){var t=z(0,q(1,e/n)),e=i.repeating?i:i.multiply(n/e);return"height:100%;background-repeat:no-repeat;background-image:".concat((l?C(e,e.repeating?{}:{angle:270}).toLinearGradientString()+", ":"")+C(e,e.repeating?{}:{angle:l||0===c?90:270}).toLinearGradientString(),";background-size:").concat(l?Array(2).fill(50*t+"%"):100*t+"%",";background-position-x:").concat(l?-100/(2-t)+100+"%,"+100/(2-t)+"%":0===c?"left":"right",";text-align:").concat(l?"center":0===c?"left":"right")}var t=S(t),c=t.marginLeft,t=t.size,l=0<c&&Math.ceil(c+t)<100,u=(r.styles.push({"margin-left":c+"%",width:t+"%",height:"1.5em",display:"block"}),r.attr.push({"data-2bind":!0}),o&&e.stackTop.tempVariables),t=(r.data.twoWayBindEvent=function(e,t,n){a.varRef.matches(t,n)&&"number"==typeof(t=a.varRef.get())&&((n=r.target.children("tw-meter")).attr("style",s(t)),o)&&r.section.renderInto("",null,{source:o,target:n,append:"replace",transitionDeferred:!1},u)},a.varRef.get());return"number"!=typeof t?y.create("datatype","(meter:) can only be bound to a variable holding a number, not ".concat(m(t),".")):C(r,{source:'<tw-meter style="'.concat(s(t),'">').concat(o||"","</tw-meter>")})},[v,r,String,x(_(String,p,d)),x(_(p,d))]),[["cycling-link"],["seq-link","sequence-link"]].forEach(function(t,u){return n.addCommand(t,function(){var e;return""===(arguments.length<=0?void 0:arguments[0])?y.create("datatype","The first string in a ("+t[0]+":) can't be empty."):arguments.length<=(v.isPrototypeOf(arguments.length<=0?void 0:arguments[0])?2:1)?y.create("datatype","I need two or more strings to "+(u?"sequence":"cycle")+" through, not just '"+((e=arguments.length-1)<0||arguments.length<=e?void 0:arguments[e])+"'."):void 0},function(a,e){for(var o,t=arguments.length,i=new Array(2<t?t-2:0),n=2;n<t;n++)i[n-2]=arguments[n];v.isPrototypeOf(i[0])&&(o=i.shift());var s=0,c=("two way"===(null==(l=o)?void 0:l.bind)&&(a.attr.push({"data-2bind":!0}),-1<(l=i.indexOf(o.varRef.get())))&&(s=l),e.stackTop.tempVariables);function r(e,t){var n=s>=i.length-1&&u,r=""===i[s]?"":n?i[s]:"<tw-link>".concat(i[s],"</tw-link>");if(n&&(a.data.clickEvent=void 0),o&&!t){n=o.set(i[s]);if(y.containsError(n))return void e.replaceWith(n.render(i[s]))}t=_objectSpread(_objectSpread({},a),{},{source:r,transitionDeferred:!1});a.section.renderInto("",null,t,c)}i[s]&&(a.data.clickEvent=function(e){s=(s+1)%i.length,r(e,!1)},a.data.twoWayBindEvent=function(e,t,n){o.varRef.matches(t,n)&&(t=o.varRef.get(),-1<(n=i.indexOf(t)))&&n!==s&&(s=n,r(e,!0))});var l="<tw-link>".concat(i[s],"</tw-link>");if(o){e=o.set(i[s]);if(y.containsError(e))return e}return C(a,{source:l,append:"replace",transitionDeferred:!0})},[_(v,String),T(String)])}),b.onStartup(function(){return b.storyElement.on("change.dropdown-macro","select",function(){var e=u(this),t=e.closest("tw-expression, tw-hook").data("dropdownEvent");t&&t(e)})}),n.addCommand("dropdown",function(e){var t;return""===(arguments.length<=1?void 0:arguments[1])||""===((t=(arguments.length<=1?0:arguments.length-1)-1+1)<1||arguments.length<=t?void 0:arguments[t])?y.create("datatype","The first or last strings in a (dropdown:) can't be empty.","Because empty strings create separators within (dropdown:)s, having them at the start or end doesn't make sense."):(arguments.length<=1?0:arguments.length-1)<=1?y.create("datatype","I need two or more strings to create a (dropdown:) menu, not just "+(arguments.length<=1?0:arguments.length-1)+"."):void 0},function(e,t,r){for(var n=arguments.length,a=new Array(3<n?n-3:0),o=3;o<n;o++)a[o-3]=arguments[o];var i=0,s=("two way"===r.bind&&(e.attr.push({"data-2bind":!0}),-1<(c=a.indexOf(r.varRef.get())))&&(i=c),Math.max.apply(Math,_toConsumableArray(a.map(function(e){return _toConsumableArray(e).length})))),c="<select>"+a.map(function(e,t){return"<option".concat(t===i?" selected":"").concat(""===e?" disabled":"",">").concat(b.escape(e||"\u2500".repeat(s)),"</option>")}).join("\n")+"</select>",l=(e.data.dropdownEvent=function(e){var t=e.val(),n=r.set(t);y.containsError(n)&&e.replaceWith(n.render(t))},e.data.twoWayBindEvent=function(e,t,n){r.varRef.matches(t,n)&&(t=r.varRef.get(),-1<(n=a.indexOf(t)))&&n!==i&&(e.find("select").val(t),i=n)},e.styles.push({"background-color":function(){return b.parentColours(u(this)).backgroundColour}}),r.set(a[i]));return y.containsError(l)?l:C(e,{source:c,append:"replace"})},[v,String,T(String)]),b.onStartup(function(){return b.storyElement.on("input.checkbox-macro","input[type=checkbox]",function(){var e=u(this),t=e.closest("tw-expression").data("checkboxEvent");t&&t(e)})});function I(e){return["I can't use a dialog macro in "+e+".","Please rewrite this without putting such macros here."]}var V=1;n.addCommand("checkbox",function(){},function(e,t,r,n){var a=!1,o="checkbox-"+ ++V,i=("two way"===r.bind&&(e.attr.push({"data-2bind":!0}),"boolean"==typeof(i=r.varRef.get())&&(a=i),e.data.twoWayBindEvent=function(e,t,n){r.varRef.matches(t,n)&&"boolean"==typeof(t=r.varRef.get())&&e.children("input[type=checkbox]").prop("checked",t)}),e.data.checkboxEvent=function(e){var t=e.is(":checked"),t=r.set(t);y.containsError(t)&&e.replaceWith(t.render(""))},r.set(a));return y.containsError(i)?i:C(e,{source:'<input id="'.concat(o,'" type="checkbox" ').concat(a?"checked":"",'><label for="').concat(o,'">').concat(n,"</label>"),append:"replace"})},[v,String]),b.onStartup(function(){return u(document).on("fullscreenchange",function(){u("input[type=checkbox][id^=fullscreen]",b.storyElement).each(function(e,t){(u(t).closest("tw-expression").data("fullscreenEvent")||Object)(t)})})}),n.addCommand("checkbox-fullscreen",function(){},function(e,t,n){var r="fullscreenCheckbox-"+ ++V;return e.data.fullscreenEvent=function(e){return u(e).prop("checked",!(!document.fullscreenElement&&!document.msFullscreenElement))},e.data.checkboxEvent=function(){return a.toggleFullscreen()},C(e,{source:'<input id="'.concat(r,'" type="checkbox" ').concat(document.fullscreenEnabled||document.msFullscreenEnabled?" ":"disabled ").concat(document.fullscreenElement||document.msFullscreenElement?"checked":"",'><label for="').concat(r,'">').concat(n,"</label>"),append:"replace"})},[String]),b.onStartup(function(){return b.storyElement.on("input.input-box-macro","textarea, input[type=text]",function(){var e=u(this),t=e.closest("tw-expression").data("inputBoxEvent");t&&t(e)})}),["input","force-input","input-box","force-input-box"].forEach(function(g){return n.addCommand(g,function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];var r=g.endsWith("box"),a=v.isPrototypeOf(t[0]),o="string"==typeof t[+a],r=r&&"number"==typeof t[o+a],i=o?t[+a]:t[a+r],s=0<S(i).size,o=s?t[a+r+o]:i;return g.startsWith("force")&&"string"!=typeof o?y.create("datatype","The (".concat(g,":) macro requires a string of text to forcibly input.")):t.length>a+r+s+("string"==typeof o)?y.create("datatype","An incorrect combination of values was given to this (".concat(g,":) macro.")):void 0},function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];var o=g.startsWith("force"),i=g.endsWith("box"),s=v.isPrototypeOf(r[0]),c="string"==typeof r[+s],l=i&&"number"==typeof r[c+s],u=s&&r[0],p=l?r[1+s]:3,d=c?S(r[+s]):{},f=d.marginLeft,d=d.size,h=(d?r[s+l+c]:c&&r[+s])||"",l=o?"":h,c=!1;if("two way"===u.bind){e.attr.push({"data-2bind":!0});s=u.varRef.get();if("string"==typeof s){l=o?h.slice(0,s.length):s,s=u.set(l),c=!0;if(y.containsError(s))return s}e.data.twoWayBindEvent=function(e,t,n){u.varRef.matches(t,n)&&"string"==typeof(t=u.varRef.get())&&e.find(i?"textarea":"input").val(o?h.slice(0,t.length):t)}}if(u&&!c){s=u.set(o?"":h);if(y.containsError(s))return s}!o&&u&&(e.data.inputBoxEvent=function(e){var t=e.val(),t=u.set(t);y.containsError(t)&&e.replaceWith(t.render(""))});var m,c="<".concat(i?"textarea":"input type=text",' style="width:100%" ').concat(i?"rows=".concat(p,">"):'value="').concat(b.escape(l)).concat(i?"</textarea>":'">');return o&&(m=Array.from(h),e.data.inputBoxEvent=function(e){var t=e.val().length,t=m.slice(0,t).join("");return e.val(t),u&&(t=u.set(t),y.containsError(t))&&e.replaceWith(t.render("")),!0}),e.styles.push({display:"block","margin-left":d?f+"%":void 0,width:d?d+"%":"100%","border-style":function(){return this.style.borderStyle||"solid"}}),C(e,{source:c,append:"replace"})},g.endsWith("box")?[_(v,String),x(_(A,String)),x(_(A,String)),x(String)]:[x(_(v,String)),x(String),x(String)])}),["show","rerun"].forEach(function(s){return n.addCommand(s,function(){for(var r,e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return t.some(function e(t){var n=t.selector,t=t.next;return"name"===n.type&&"page"===n.data?(r=y.create("macrocall","You can't (hide:) the ?page. Sorry."),!0):!!("base"===n.type&&e(n.data)||t&&e(t))||void 0}),r},function(o,i){for(var e=arguments.length,t=new Array(2<e?e-2:0),n=2;n<e;n++)t[n-2]=arguments[n];return t.forEach(function(e){return e.forEach(i,function(e){var t,n,r,a=e.data("hidden");void 0!==a!=("rerun"===s)&&(e.removeData("hidden"),a instanceof u?e.empty().append(a):(a=e.data("tempVariables"),n=(t="tw-passage"===e.tag())?l.getTree(c.passage):e.data("originalSource")||"",t&&(r=e.find("tw-sidebar").detach()),i.renderInto("",null,_objectSpread(_objectSpread({},o),{},{append:"replace",source:n,target:e}),a&&Object.create(a)),r&&e.prepend(r)))})}),o},[T(o)])});n.addCommand("hide",function(){for(var r,e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return t.some(function e(t){var n=t.selector,t=t.next;return"name"===n.type&&"page"===n.data?(r=y.create("macrocall","You can't (hide:) the ?page. Sorry."),!0):!!("base"===n.type&&e(n.data)||t&&e(t))||void 0}),r},function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];for(var a=0,o=n;a<o.length;a++)o[a].forEach(e,function(e){e.data("hidden")||e.data("hidden",e.contents().detach())})},[T(o)],!1)("scroll",P,function(m,e,g){var y="number"==typeof g&&g;requestAnimationFrame(function(){e.forEach(m,function(e){if(!1!==y){var t,n,r=e[0];null!=(t=(n=r=r===b.storyElement[0]&&r.scrollHeight===r.clientHeight?getComputedStyle(document.body).overflow.includes(" scroll")?document.body:document.documentElement:r).scrollTo)&&t.call(n,0,(r.scrollHeight-r.clientHeight)*y)}else{var a,o=_createForOfIteratorHelper(g.hooks(m).get());try{for(o.s();!(a=o.n()).done;){var i=a.value;if(e.find(i)){for(var s=[],c=e[0];(c=c.parentNode)&&c!==document.body;)s.push([c,c.scrollLeft,c.scrollTop]);i.scrollIntoView();for(var l=0,u=s;l<u.length;l++){var p=_slicedToArray(u[l],3),d=p[0],f=p[1],h=p[2];d.scrollLeft=f,d.scrollTop=h}break}}}catch(e){o.e(e)}finally{o.f()}}})})},[o,_(L,o)],!1)("stop",P,P,[],!1)("load-game",P,function(e,t){var n,r;return e.loadedGame?y.create("infinite","I can't use (load-game:) immediately after loading a game."):(n=localStorage.getItem(R("Saved Game")+t))?(n=c.deserialise(e,n))instanceof Error?{blocked:r=k({message:"Sorry to interrupt... The story tried to load saved data, but there was a problem.\n"+n.message+"\n\nThat data might have been saved from a different version of this story. Should I delete it?\n(Type 'delete' and choose Yes to delete it.)\n\nEither way, the story will now continue without loading the data.",defaultValue:"",buttons:[{name:"Yes",confirm:!0,callback:function(){"delete"===r.find("input").last().val()&&localStorage.removeItem(R("Saved Game")+t),e.unblock("")}},{name:"No",cancel:!0,callback:function(){return e.unblock()}}]})}:void requestAnimationFrame(a.showPassage.bind(a,c.passage,{loadedGame:!0})):y.create("saving","I can't find a save slot named '"+t+"'!")},[String],!1)("forget-undos",P,function(e,t){c.futureLength||c.forgetUndos(t)},[parseInt],!1)("forget-visits",P,function(e,t){c.forgetVisits(t)},[parseInt],!1)("mock-visits",function(){if(!b.options.debug)return y.create("debugonly","(mock-visits:) cannot be used outside of debug mode.");for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];var r=t.find(function(e){return!l.hasValid(e)});return r?y.create("datatype","I can't mock-visit '"+r+"' because no passage with that name exists."):void 0},function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];c.mockVisits=g(n)},[T(String)],!1)("mock-turns",function(){if(!b.options.debug)return y.create("debugonly","(mock-turns:) cannot be used outside of debug mode.")},function(e,t){c.mockTurns=t},[H],!1)("seed",P,function(e,t){c.setSeed(t)},[String],!1)(["dialog","alert"],function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];if(v.isPrototypeOf(e)){if("two way"===e.bind)return y.create("datatype","(dialog:) shouldn't be given two-way bound variables.",'Change the "2bind" keyword to just "bind".');if(void 0===t)return y.create("datatype","(dialog:) needs a message string or codehook to display.")}else void 0!==t&&r.unshift(t);e=r.findIndex(function(e){return""===e});if(-1<e)return y.create("datatype","(dialog:)'s ".concat(b.nth(e+1)," link text shouldn't be an empty string."))},function(e,n,r,t){for(var a=arguments.length,o=new Array(4<a?a-4:0),i=4;i<a;i++)o[i-4]=arguments[i];return v.isPrototypeOf(r)||(void 0!==t&&o.unshift(t),t=r,r=void 0),o.length||(o=["OK"]),{blocked:k({section:n,message:t,cd:e,buttons:o.map(function(t){return{name:t,callback:function(){var e;n.unblock((null==(e=r)?void 0:e.set(t))||"")}}})})}},[_(v,String,t),x(_(t,String)),O(String)])("open-url",P,function(e,t){window.open(t,"")},[String],!1)(["restart","reload"],P,function(){if(!b.options.ignoreGotos){if(c.turns<=1)return y.create("infinite","I mustn't (restart:) the story in the starting passage.");c.hasSessionStorage&&sessionStorage.removeItem("Saved Session"),window.location.reload()}},[],!1)("goto-url",P,function(e,t){window.location.assign(t)},[String],!1)("ignore",P,P,[O(F)])("assert-exists",function(e){if(""===e)return y.create("datatype","(assert-exists:) mustn't be given an empty string.")},function(e,t,n){var r=0;return("string"==typeof n?o.create({type:"string",data:n}):n).forEach(t,function(){++r}),r?e:y.create("assertion","I didn't see any ".concat("string"==typeof n?"text occurrences of":"hooks matching"," ").concat(w(n)," in this passage."))},[_(o,String)]),n.add("assert","Instant",function(e,t){return t?{TwineScript_TypeID:"instant",TwineScript_TypeName:"an (assert:) operation",TwineScript_ObjectName:"an (assert:) operation",TwineScript_Unstorable:!0,TwineScript_Print:function(){return""}}:C(y.create("assertion","An assertion failed: "),{appendTitleText:!0})},[Boolean])("save-game","Boolean",function(e,t,n){if(n=n||"",!c.hasStorage)return!1;var r=c.serialise(!1).pastAndPresent;if(y.containsError(r))return r;if(!1===r)return!1;try{return localStorage.setItem(R("Saved Game")+t,r),localStorage.setItem(R("Saved Game Filename")+t,n),!0}catch(e){return!1}},[String,x(String)])("prompt","String",function(e,t,n,r,a){var o,i;return null!=(o=e.stackTop)&&o.evaluateOnly?y.create.apply(y,["macrocall"].concat(_toConsumableArray(I(e.stackTop.evaluateOnly)))):""===a?y.create("datatype","The text for (prompt:)'s confirm link can't be blank."):(i=k({section:e,message:t,defaultValue:n,buttons:[{name:a||"OK",confirm:!0,callback:function(){return e.unblock(i.find("input").last().val())}}].concat(""===r?[]:{name:r||"Cancel",cancel:!0,callback:function(){return e.unblock(n)}})}),e.stackTop.blocked=i,0)},[_(String,t),String,x(String),x(String)])("confirm","Boolean",function(e,t,n,r){var a;return null!=(a=e.stackTop)&&a.evaluateOnly?y.create.apply(y,["macrocall"].concat(_toConsumableArray(I(e.stackTop.evaluateOnly)))):""===r?y.create("datatype","The text for (confirm:)'s confirm link can't be blank."):(a=k({section:e,message:t,defaultValue:!1,buttons:[{name:r||"OK",confirm:!0,callback:function(){return e.unblock(!0)}}].concat(""===n?[]:{name:n||"Cancel",cancel:!0,callback:function(){return e.unblock(!1)}})}),e.stackTop.blocked=a,0)},[_(String,t),x(String),x(String)])("page-url","String",function(){return window.location.href},[])}),define("macrolib/custommacros",["utils","macros","state","utils/operationutils","datatypes/changercommand","datatypes/custommacro","datatypes/codehook","datatypes/typedvar","internaltypes/twineerror"],function(c,l,u,e,t,p,n,d,f){function s(e,t,n){if(!t.some(function(e){if("function"==typeof e.output)return e.output(n),!0}))return f.create("macrocall","("+e+":) should only be used inside a code hook passed to (macro:).")}var h=e.objectName,m=e.toSource,e=l.add,r=l.addChanger,a=l.addCommand,o=l.TypeSignature,i=o.rest,g=o.either,y=o.Any,b=o.Everything,o=o.zeroOrMore;e("macro","CustomMacro",function(e){for(var t,n=[],r=arguments.length,a=new Array(1<r?r-1:0),o=1;o<r;o++)a[o-1]=arguments[o];for(t=0;t<a.length;t+=1){var i=t===a.length-1;if(d.isPrototypeOf(a[t])===i)return f.create("datatype","The "+(i?"":c.nth(a.length-t+1)+"-")+"last value given to (macro:) should be a "+(i?"code hook":"datatyped variable")+", not "+h(a[t]));if(!i){i="A custom macro";if(a[t].varRef.object===u.variables)return f.create("datatype",i+"'s typed variables must be temp variables (with a '_'), not global variables (with a '$').","Write them with a _ symbol at the start instead of a $ symbol.");if(1<a[t].varRef.propertyChain.length)return f.create("datatype",i+"'s typed variables can't be properties inside a data structure.");if(a[t].datatype.rest&&t!==a.length-2)return f.create("datatype",i+" can only have one spread variable, and it must be its last variable.");var s=a[t].varRef.propertyChain[0];if(n.includes(s))return f.create("datatype",i+"'s typed variables can't both be named '"+s+"'.");n.push(s)}}return p.create(a.slice(0,-1),a[a.length-1])},[i(g(d,n))]);a(["output-data","out-data"],function(){},function(e,t){e=e.stack;return s("output-data",e,t)||{blocked:!0}},[y],!1),r(["output","out"],function(){return Object.assign(t.create("output",[]))},function(e,t){if(e.section){var n,r=e.section,a=r.stack,o=r.stackTop,i={};for(n in o.tempVariables)n.startsWith("TwineScript_")||(i[n]=o.tempVariables[n]);s("output",a,{changer:t,variables:i,hook:Array.isArray(e.source)?"["+e.source.map(function(e){return e.text}).join("")+"]":e.source}),e.output=!0,o.blocked=!0}},[]),a("error",function(e){if(!e)return f.create("datatype","This (error:) macro was given an empty string.")},function(e,t){e=e.stack;return s("error",e,f.create("user",t))||{blocked:!0}},[String],!1),e("partial","CustomMacro",function(e,a){for(var t=arguments.length,o=new Array(2<t?t-2:0),n=2;n<t;n++)o[n-2]=arguments[n];var r="string"!=typeof a&&a,i=!r&&a;if(!r){if(!l.has(i))return f.create("macrocall",'The macro name given to (partial:), "'.concat(a,"\", isn't the name of a built-in macro."));if("Metadata"===l.get(i).returnType)return f.create("macrocall","(partial:) can't be used with metadata macros such as (".concat(a,":)"))}var s="(partial:".concat(m(a),",").concat(o.map(function(e){return m(e)}),")"),c=p.createFromFn(function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];e=l["string"==typeof a?"run":"runCustom"](a,e,o.concat(n));return f.containsError(e)&&(e.message="An error occurred while running the (partial:)-created macro, ".concat(c.TwineScript_ObjectName,":\n")+e.message),e},"a (partial:) custom macro of ".concat(i||r.TwineScript_KnownName?"(".concat(i||r.TwineScript_KnownName,":").concat(o.map(function(e){return m(e)}),")"):"another unnamed custom macro"),function(){return s},(i?l.get(i):r).typeSignature.filter(function(e,t){return t>=o.length||"rest"===e.pattern||"zero or more"===e.pattern}));return c},[g(String,p),o(b)])}),define("macrolib/datastructures",["utils","utils/naturalsort","macros","utils/operationutils","state","engine","passages","datatypes/lambda","datatypes/typedvar","internaltypes/twineerror"],function(e,i,t,n,s,r,a,c,o,l){var u=e.permutations,p=e.options,d=n.objectName,f=n.subset,h=n.collectionType,m=n.isValidDatamapName,g=n.is,y=n.unique,b=n.clone,v=n.range,e=t.TypeSignature,n=e.optional,w=e.rest,k=e.either,S=e.zeroOrMore,T=e.Any,e=e.nonNegativeInteger,_=i("en");t.add(["a","array"],"Array",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return n},S(k(o,T)))("range","Array",function(e,t,n){return v(t,n)},[parseInt,parseInt])("subarray","Array",function(e,t,n,r){return f(t,n,r)},[Array,parseInt,parseInt])("reversed","Array",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return n.reverse().map(b)},S(T))("shuffled","Array",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return s.shuffled.apply(s,n).map(b)},[S(T)])("sorted","Array",function(e){for(var t,n=arguments.length,r=new Array(1<n?n-1:0),a=1;a<n;a++)r[a-1]=arguments[a];if(!c.isPrototypeOf(r[0]))return(t=r.filter(function(e){return"string"!=typeof e&&"number"!=typeof e}))&&t.length?1===t.length&&Array.isArray(t[0])?l.create("macrocall","Please give multiple numbers or strings to (sorted:), not a single array.","You can use the spread ... syntax to spread out the array's values into (sorted:)."):l.create("datatype","If (sorted:) isn't given a 'via' lambda, it must be given only numbers and strings, not ".concat(d(t[0]),".")):r.sort(_);var o=r.shift();if("making"in o||"where"in o||"when"in o||!("via"in o))return l.create("datatype","The optional lambda given to (sorted:) must be a 'via' lambda, not ".concat(d(o),"."));for(var i=0;i<r.length;i+=1){var s=o.apply(e,{loop:r[i],pos:i+1});if(l.containsError(s))return s;if("string"!=typeof s&&"number"!=typeof s)return l.create("datatype",'The "via" lambda given to (sorted:) couldn\'t convert '.concat(d(r[i])," into a string or number."));r[i]=[r[i],s]}return r.sort(function(e,t){return _(e[1],t[1])}).map(function(e){return e[0]})},[S(T)])("rotated","Array",function(e,t){if(0===t)return l.create("macrocall","I can't rotate these values by 0 positions.");for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];t=-1*(t=Math.abs(t)%r.length*Math.sign(t));return r.slice(t).concat(r.slice(0,t)).map(b)},[parseInt,S(T)])("rotated-to","Array",function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];t=t.filter(e,r);return l.containsError(t)?t:t.length?(e=r.indexOf(t[0]),r.slice(e).concat(r.slice(0,e)).map(b)):l.create("macrocall","None of these "+r.length+" values matched the lambda, so I can't rotate them.")},[c.TypeSignature("where"),w(T)])("repeated","Array",function(e,t){for(var n=[],r=arguments.length,a=new Array(2<r?r-2:0),o=2;o<r;o++)a[o-2]=arguments[o];if(!a.length)return n;for(;0<t--;)n.push.apply(n,a);return n.map(b)},[e,w(T)])("interlaced","Array",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];for(var a=Math.min.apply(Math,_toConsumableArray(n.map(function(e){return e.length}))),o=[],i=0;i<a;i+=1)for(var s=0;s<n.length;s+=1)o.push(b(n[s][i]));return o},[Array,w(Array)])("permutations","Array",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return n.length?u.apply(void 0,n):[]},[S(T)])("unique","Array",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return n.filter(y)},[S(T)])("altered","Array",function(n,r){for(var e=arguments.length,t=new Array(2<e?e-2:0),a=2;a<e;a++)t[a-2]=arguments[a];return t.map(function(e,t){t=r.apply(n,{loop:e,pos:t+1});return null===t?e:t})},[k(c.TypeSignature("via"),c.TypeSignature("where","via")),S(T)])("find","Array",function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];return t.filter(e,r)},[c.TypeSignature("where"),S(T)])(["all-pass","pass"],"Boolean",function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];t=t.filter(e,r);return l.containsError(t)||t.length===r.length},[c.TypeSignature("where"),S(T)])("some-pass","Boolean",function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];t=t.filter(e,r);return l.containsError(t)||0<t.length},[c.TypeSignature("where"),S(T)])("none-pass","Boolean",function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];t=t.filter(e,r);return l.containsError(t)||0===t.length},[c.TypeSignature("where"),S(T)])("folded","Any",function(r,a){for(var e=arguments.length,t=new Array(2<e?e-2:0),n=2;n<e;n++)t[n-2]=arguments[n];return"where"in a&&(t=[t[0]].concat(_toConsumableArray(a.filter(r,t.slice(1))))),l.containsError(t)||t.reduce(function(e,t,n){return a.apply(r,{making:e,loop:t,pos:n+1})})},[k(c.TypeSignature("where","via","making"),c.TypeSignature("via","making")),w(T)])(["dm-names","datamap-names","datanames"],"Array",function(e,t){return Array.from(t.keys()).sort(i("en"))},[Map])(["dm-values","datamap-values","datavalues"],"Array",function(e,t){return Array.from(t.entries()).sort(i("en",function(e){return String(e[0])})).map(function(e){return b(e[1])})},[Map])(["dm-entries","datamap-entries","dataentries"],"Array",function(e,t){return Array.from(t.entries()).sort(function(e,t){return[e[0],t[0]].sort(i("en"))[0]===e[0]?-1:1}).map(function(e){return new Map([["name",e[0]],["value",b(e[1])]])})},[Map])(["dm-altered","datamap-altered"],"Datamap",function(a,o,e){return Array.from(e.entries()).sort(function(e,t){return[e[0],t[0]].sort(i("en"))[0]===e[0]?-1:1}).reduce(function(e,t,n){if(!l.containsError(e)){var r=new Map([["name",t[0]],["value",b(t[1])]]),r=o.apply(a,{loop:r,pos:n+1});if(l.containsError(r))return r;e.set(t[0],null===r?t[1]:r)}return e},new Map)},[k(c.TypeSignature("via"),c.TypeSignature("where","via")),Map])("history","Array",function(e,t){var n=s.history();return t?(t=t.filter(e,n.map(function(e){return a.get(e)})),l.containsError(t)?t:t.map(function(e){return e.get("name")})):n},[n(c.TypeSignature("where"))])("visited","Boolean",function(e,t){var n;return"string"==typeof t?a.has(t)?0<s.passageNameVisited(t)||s.passage===t:l.create("macrocall","There's no passage named '"+t+"' in this story."):(n=s.history(),n=t.filter(e,n.concat(s.passage).map(function(e){return a.get(e)})),l.containsError(n)?n:0<n.length)},[k(String,c.TypeSignature("where"))])("passage","Datamap",function(e,t){return b(a.get(t||s.passage))||l.create("macrocall","There's no passage named '"+t+"' in this story.")},[n(String)])("passages","Array",function(e,t){var n=i("en"),r=_toConsumableArray(a.values()).map(function(e){return b(e)}),t=t?t.filter(e,r):r,e=l.containsError(t);return e||t.sort(function(e,t){return n(e.get("name"),t.get("name"))})},[n(c.TypeSignature("where"))])("open-storylets","Array",function(e,t){return e.stackTop.evaluateOnly?l.create("macrocall","(open-storylets:) can't be used in "+e.stackTop.evaluateOnly+"."):(e=a.getStorylets(e,t),l.containsError(e)||e.map(b))},[n(c.TypeSignature("where"))])("savedgames","Datamap",function(){function e(e){return"("+e+" "+p.ifid+") "}var t,n,r=0,a=new Map;do{if(!s.hasStorage)break;t=localStorage.key(r),r+=1;var o=e("Saved Game")}while(null!=(n=t)&&n.startsWith(o)&&(t=t.slice(o.length),a.set(t,localStorage.getItem(e("Saved Game Filename")+t))),t);return a},[])(["datamap","dm"],"Datamap",function(e){for(var r,a=new Map,t=arguments.length,n=new Array(1<t?t-1:0),o=1;o<t;o++)n[o-1]=arguments[o];var i=n.reduce(function(e,t){var n;if(!l.containsError(e))if(void 0===r)r=t;else{if(n=l.containsError(m(a,r)))return n;if(a.has(r))return l.create("macrocall","You used the same data name ("+d(r)+") twice in the same (datamap:) call.");a.set(r,b(t)),r=void 0}return e},!0);return l.containsError(i)?i:void 0!==r?l.create("macrocall","This datamap has a data name without a value."):a},S(k(o,T)))(["dataset","ds"],"Dataset",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return new Set(n.filter(y).map(b))},S(T))("count","Number",function t(n,r){for(var e,a=arguments.length,o=new Array(2<a?a-2:0),i=2;i<a;i++)o[i-2]=arguments[i];if(1<o.length)return e=o.map(function(e){return t(n,r,e)}),l.containsError(e)||e.reduce(function(e,t){return e+t},0);var s=o[0];switch(h(r)){case"dataset":case"datamap":return l.create("macrocall","(count:) shouldn't be given a datamap or dataset.","You should use the 'contains' operator instead. For instance, write: $variable contains 'value'.");case"string":return"string"!=typeof s?l.create("macrocall",d(r)+" can't contain  "+d(s)+" because it isn't also a string."):s?r.split(s).length-1:0;case"array":return r.reduce(function(e,t){return e+g(t,s)},0);default:return l.create("macrocall",d(r)+" can't contain values, let alone "+d(s)+".")}},[T,w(T)])}),define("macrolib/enchantments",["jquery","utils","utils/operationutils","engine","state","passages","macros","datatypes/hookset","datatypes/codehook","datatypes/changercommand","datatypes/lambda","internaltypes/changedescriptor","internaltypes/enchantment","internaltypes/twineerror"],function(c,r,e,l,s,n,u,p,a,d,t,i,f,h){var m=e.is,e=u.TypeSignature,g=e.either,y=e.rest,o=e.optional,b=Object.assign;function v(e,t){if(d.isPrototypeOf(t)&&!t.canEnchant)return h.create("datatype","The changer given to (".concat(e,":) can't include a revision, enchantment, or interaction changer like (replace:), (click:), or (link:)."))}["enchant","change"].forEach(function(o){u.addCommand(o,function(e,t){t=v(o,t);if(t)return t},function(t,n,e){n=p.from(n);var r,a=[];return d.isPrototypeOf(e)&&(r=i.create({section:t}),e.run(r),0<(r.innerEnchantments||[]).length)&&(r=r.innerEnchantments.map(function(e){return e(n)}),a.push.apply(a,_toConsumableArray(r))),a.push(f.create(_defineProperty(_defineProperty({scope:n},d.isPrototypeOf(e)?"changer":"lambda",e),"section",t))),a.forEach(function(e){"enchant"===o?(t.addEnchantment(e),t.updateEnchantments()):e.enchantScope()}),""},[g(p,String),g(d,t.TypeSignature("via"))],!1)}),u.addChanger("enchant-in",function(e,t,n){var r=v("enchant-in",n);return r||d.create("enchant-in",[t,n])},function(t,n,r){return t.innerEnchantments=(t.innerEnchantments||[]).concat(function(e){return f.create(_defineProperty(_defineProperty({scope:p.from(n),localHook:e},d.isPrototypeOf(r)?"changer":"lambda",r),"section",t.section))}),t},[g(p,String),g(d,t.TypeSignature("via"))]),[["link-style",p.create({type:"name",data:"link"})],["line-style",p.create({type:"base",data:p.create({type:"name",data:"page"})},"lines",void 0)],["char-style",p.create({type:"base",data:p.create({type:"name",data:"page"})},"chars",void 0)]].forEach(function(e){var e=_slicedToArray(e,2),r=e[0],a=e[1];u.addChanger(r,function(e,t){var n=v(r,t);return n||d.create(r,[t])},function(t,n){return t.innerEnchantments=(t.innerEnchantments||[]).concat(function(e){return f.create(_defineProperty(_defineProperty({scope:a,localHook:e},d.isPrototypeOf(n)?"changer":"lambda",n),"section",t.section))}),t},[g(d,t.TypeSignature("via"))])});e=["replace","append","prepend"];function w(i,s){return r.onStartup(function(){var e=i.classList.replace(/ /g,"."),t=i.blockClassList?i.blockClassList.replace(/ /g,"."):"",n="."+e+(t?",."+t:"");r.storyElement.on(i.event.map(function(e){return e+".enchantment"}).join(" "),n,function(){var e,t=c(this);r.options.debug&&r.options.ignoreClickEvents&&!t.is("tw-backdrop.eval-replay *, tw-backdrop.harlowe-crash *")||t.is("tw-open-button")||(e=(t=c(Array.from(t.parents(n).add(this)).sort(function(e,t){return 8&e.compareDocumentPosition(t)?1:-1})[0])).data("enchantmentEvent"))&&e(t)})}),[function(e,t,n){if(!t)return h.create("datatype","A string given to this ("+s+":) macro was empty.");if(n){var r=v(s,n);if(r)return r}return d.create(s,[p.from(t)].concat(n?[n]:[]))},function(t,e,n){t.enabled=!1,t.transitionDeferred=!0,i.rerender&&(t.newTargets=(t.newTargets||[]).concat({target:e,append:i.rerender}));var r,a=null!=(r=t.section)&&r.stackTop?t.section.stackTop.tempVariables:Object.create(null),o=f.create(_defineProperty({functions:[function(e){e.attr("class",e.children().is("tw-story, tw-sidebar, tw-passage")||["block","flex"].includes(e.children().css("display"))?i.blockClassList:i.classList),e.attr({tabIndex:"0"})}],data:{enchantmentEvent:function(){var e;null!=(e=t.section.stackTop)&&e.blocked||(i.once&&t.section.removeEnchantment(o),i.goto?l.goToPassage(i.goto,{transition:i.transition}):i.undo?l.goBack({transition:i.transition}):t.section.renderInto(t.source,null,_objectSpread(_objectSpread({},t),{},{append:i.once?"append":"replace",enabled:!0,transitionDeferred:!1}),a))}},scope:e,section:t.section,name:s},d.isPrototypeOf(n)?"changer":"lambda",n));return t.section&&(t.section.addEnchantment(o),o.enchantScope()),t},[g(p,String),o(g(d,t.TypeSignature("via")))]]}e.forEach(function(o){u.addChanger(o,function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return n.every(Boolean)?d.create(o,n.map(p.from),null,!1):h.create("datatype","A string given to this (".concat(o,":) macro was empty."))},function(e){var t;0<c(e.target).parents().filter("tw-collapsed,[collapsing=true]").length||e.attr.some(function(e){return e.collapsing})||(e.attr=[].concat(_toConsumableArray(e.attr),[{collapsing:!1}])),e.newTargets=e.newTargets||[];for(var n=arguments.length,r=new Array(1<n?n-1:0),a=1;a<n;a++)r[a-1]=arguments[a];return(t=e.newTargets).push.apply(t,_toConsumableArray(r.filter(function(n){return!e.newTargets.some(function(e){var t=e.target,e=e.append;return m(n,t)&&o===e})}).map(function(e){return{target:e,append:o,before:!0}}))),e},y(g(p,String)))(o+"-with",function(e,t){return d.create(o+"-with",[t],null,!1)},function(e,t){return a.isPrototypeOf(t)&&(t=t.code),e.appendSource=(e.appendSource||[]).concat({source:t,append:o}),e},g(a,String))});var k="ontouchstart"in window||0<navigator.maxTouchPoints||0<navigator.msMaxTouchPoints,S=[{name:"click",enchantDesc:{event:["click"],once:!0,rerender:"",classList:"link enchantment-link",blockClassList:"enchantment-clickblock"}},{name:"mouseover",enchantDesc:{event:["mouseenter",k?"click":""].filter(Boolean),once:!0,rerender:"",classList:"link enchantment-mouseover",blockClassList:"enchantment-mouseoverblock"}},{name:"mouseout",enchantDesc:{event:["mouseleave",k?"click":""].filter(Boolean),once:!0,rerender:"",classList:"link enchantment-mouseout",blockClassList:"enchantment-mouseoutblock"}},{name:"doubleclick",enchantDesc:{event:["dblclick"],once:!0,rerender:"",classList:"link enchantment-dblclick",blockClassList:"enchantment-dblclickblock"}}];S.forEach(function(e){"doubleclick"!==e.name&&(u.addChanger.apply(u,[e.name].concat(_toConsumableArray(w(e.enchantDesc,e.name)))),"click"===e.name)&&u.addChanger.apply(u,[e.name+"-rerun"].concat(_toConsumableArray(w(_objectSpread(_objectSpread({},e.enchantDesc),{},{once:!1}),e.name+"-rerun"))))}),r.onStartup(function(){S.forEach(function(e){var n=e.enchantDesc;n.blockClassList&&r.storyElement.on(n.event.map(function(e){return e+".enchantment"}).join(" "),function(){var e,t=c(this);r.options.debug&&r.options.ignoreClickEvents&&!t.is("tw-backdrop.eval-replay *, tw-backdrop.harlowe-crash *")||t.is("tw-open-button")||(e=(t=c(Array.from(t.parents("."+n.blockClassList.replace(/ /g,"."))).sort(function(e,t){return 8&e.compareDocumentPosition(t)?1:-1})[0])).data("enchantmentEvent"))&&e(t)})})}),e.forEach(function(n){S.forEach(function(e){var t;"doubleclick"!==e&&(t=_objectSpread(_objectSpread({},e.enchantDesc),{},{rerender:n}),e=e.name+"-"+n,u.addChanger.apply(u,[e].concat(_toConsumableArray(w(t,e)))))})}),S.forEach(function(i){"doubleclick"!==i&&["goto","undo"].forEach(function(a){var o=i.name+"-"+a;u.addCommand(o,function(e,t){return!e||!t&&"goto"===a?h.create("datatype","A string given to this ("+o+":) macro was empty."):"goto"!==a||n.hasValid(t)?void 0:h.create("macrocall","I can't ("+o+":) the passage '"+t+"' because it doesn't exist.")},function(e,t,n,r){return"undo"===a&&s.pastLength<1?h.create("macrocall","I can't (undo:) on the first turn."):((0,_slicedToArray(w(_objectSpread(_objectSpread({},i.enchantDesc),{},{transition:e.data.passageT8n},"undo"===a?{undo:!0}:{goto:r}),o),2)[1])({section:t},p.from(n)),b(e,{source:""}))},[g(p,String)].concat("undo"===a?[]:String))})})}),define("macrolib/links",["jquery","macros","utils","state","passages","engine","datatypes/changercommand","internaltypes/changedescriptor","datatypes/hookset","datatypes/lambda","internaltypes/twineerror"],function(i,e,c,l,u,p,a,d,t,f,h){var n=e.TypeSignature,r=n.optional,o=n.rest,n=n.either,m=["Links can't have empty strings for their displayed text.","In the link syntax, a link's displayed text is inside the [[ and ]], and on the non-pointy side of the -> or <- arrow if it's there."],g=Object.assign;function s(e,t,n){n=n||t;var r,a=u.hasValid(t)&&t===n,e=e.evaluateTwineMarkup(c.unescape(n),"a link's passage name");return a?t=(a=0<e.children().length?"`".repeat((n.match(/`+/)||[]).reduce(function(e,t){return Math.max(e,t.length+1)},1)):"")+"\0".repeat(!!a)+t+"\0".repeat(!!a)+a:(e.findAndFilter("tw-error").length&&(r=e.findAndFilter("tw-error").data("TwineError")),n=e.text()),{text:t,passage:n,error:r}}c.onStartup(function(){var e="ontouchstart"in window||0<navigator.maxTouchPoints||0<navigator.msMaxTouchPoints;function t(e){var t=i(this),n=t.closest("tw-expression"),r=t.closest("tw-expression, tw-hook"),a=r.data("clickEvent"),r=r.data("section");if((!c.options.debug||!c.options.ignoreClickEvents||t.is("tw-backdrop.eval-replay *, tw-backdrop.harlowe-crash *"))&&!t.is("tw-open-button")&&(null==r||!r.stackTop||!r.stackTop.blocked||r.stackTop.blocked instanceof i&&r.stackTop.blocked.find(t).length)){if(a)return 0<t.find("tw-error").length?void 0:(e.stopPropagation(),void a(t));var r=n.data("linkPassageName"),o=_objectSpread({},n.data("passageT8n")||{});n.find("tw-enchantment").each(function(e,t){Object.assign(o,i(t).data("passageT8n")||{})}),r?(e.stopPropagation(),p.goToPassage(r,{transition:o})):t.is("[undo]")?(e.stopPropagation(),p.goBack({transition:o})):t.is("[fullscreen]")&&(e.stopPropagation(),p.toggleFullscreen())}}c.storyElement.on("click.passage-link","tw-link"+(e?"":":not(.enchantment-mouseover):not(.enchantment-mouseout):not(.enchantment-dblclick)"),t).on("mouseover.passage-link","tw-link.enchantment-mouseover, tw-expression.enchantment-mouseover > tw-link",t).on("mouseout.passage-link","tw-link.enchantment-mouseout, tw-expression.enchantment-mouseout > tw-link",t).on("dblclick.passage-link","tw-link.enchantment-dblclick, tw-expression.enchantment-dblclick > tw-link",t),i(document).on("fullscreenchange",function(){i("tw-link[fullscreen]",c.storyElement).each(function(e,t){(i(t).closest("tw-expression, tw-hook").data("fullscreenEvent")||Object)(t)})})}),[["link","link-replace"],["link-reveal","link-append"],["link-repeat"],["link-rerun"]].forEach(function(s){return e.addChanger(s,function(e,t,n){return t?n&&!n.canEnchant?h.create("datatype","The changer given to (".concat(s[0],":) can't be (or include) a revision, enchantment, or interaction changer like (replace:), (click:), or (link:).")):a.create(s[0],[t].concat(n||[]),null,!0):h.create("datatype",m[0])},function(r,e,t){var n,a=s[0],o=null!=(n=r.section)&&n.stackTop?r.section.stackTop.tempVariables:Object.create(null),i=d.create({source:"<tw-link tabindex=0>"+e+"</tw-link>",target:function(){return r.target},append:"replace",data:{section:r.section,clickEvent:function(e){r.enablers=r.enablers.filter(function(e){return e.descriptor!==i}),"link-reveal"===a&&e.contents().unwrap();var t,n=e.parentsUntil(":not(tw-enchantment)").parent();n.length||(n=e.parent()),"link-rerun"===a&&(t=e.parentsUntil(":not(tw-enchantment)"),e.detach(),t.remove()),"link"!==a&&"link-rerun"!==a||n.empty(),r.section.renderInto("",null,r,o),"link-rerun"===a&&n.prepend(e)}}});return r.enablers=(r.enablers||[]).concat({descriptor:i,changer:t}),r},[String,r(a)])}),e.addCommand("link-goto",function(e){if(!e)return h.create.apply(h,["datatype"].concat(m))},function(e,t,n,r){var a,o=s(t,n,r);return n=o.text,r=o.passage,(o=o.error)||(e.transition?h.create("datatype","Please attach ("+(o="transition")+"-depart:) or ("+o+"-arrive:) to a passage link, not ("+o+":)."):(a=(a=u.hasValid(r)?a:'<tw-broken-link passage-name="'+c.escape(r)+'">'+n+"</tw-broken-link>")||"<tw-link tabindex=0 "+(0<l.passageNameVisited(r)?'class="visited" ':"")+">"+n+"</tw-link>",e.data.linkPassageName=r,e.data.section=t,g(e,{source:a,transitionDeferred:!0})))},[String,r(String)])("link-storylet",function(){var e=(e=1===arguments.length||"string"!=typeof(arguments.length<=0?void 0:arguments[0])?0:1)<0||arguments.length<=e?void 0:arguments[e];if(!e||"string"==typeof e)return h.create("datatype","(link-storylet:) should be given one index number or one 'where' lambda, after the optional link text string.")},function(e,t){var n=(n=2+("string"==typeof(arguments.length<=2?void 0:arguments[2])?1:0))<2||arguments.length<=n?void 0:arguments[n],r="string"==typeof(arguments.length<=2?void 0:arguments[2])&&(arguments.length<=2?void 0:arguments[2]),a=((a=(arguments.length<=2?0:arguments.length-2)-1+2)<2||arguments.length<=a?void 0:arguments[a])!==n&&((a=(arguments.length<=2?0:arguments.length-2)-1+2)<2||arguments.length<=a?void 0:arguments[a]);if(e.transition)return h.create("datatype","Please attach (".concat(o="transition","-depart:) or (").concat(o,"-arrive:) to (link-storylet:), not (").concat(o,":)."));var o=f.isPrototypeOf(n),i=u.getStorylets(t,o&&n),s=h.containsError(i);if(s)return s;var c,s=i[o?0:n<0?i.length+n:n-1];if(s)s=s.get("name"),r=r||s,c=c||"<tw-link tabindex=0 "+(0<l.passageNameVisited(s)?'class="visited" ':"")+">"+r+"</tw-link>",e.data.linkPassageName=s,e.data.section=t;else{if(!a)return e;c=a}return g(e,{source:c,transitionDeferred:!0})},[n(parseInt,String,f.TypeSignature("where")),r(n(parseInt,String,f.TypeSignature("where"))),r(String)])("link-undo",function(e){if(!e)return h.create("datatype",m[0])},function(t,e,n){var r,a=3<arguments.length&&void 0!==arguments[3]?arguments[3]:"";return l.pastLength<1?g(t,{source:a}):(r=(t.data.section=e).stackTop.tempVariables,t.data.forgetUndosEvent=function(){return t.data.section.whenUnblocked(function(){var e=_objectSpread(_objectSpread({},t),{},{append:"replace",source:a,transitionDeferred:!1});t.section.renderInto("",null,e,r)})},g(t,{source:"<tw-link tabindex=0 undo>"+n+"</tw-link>",transitionDeferred:!0}))},[String,r(String)])("link-show",function(e){if(!e)return h.create("datatype",m[0])},function(r,a,e){for(var t=arguments.length,n=new Array(3<t?t-3:0),o=3;o<t;o++)n[o-3]=arguments[o];return r.data.section=a,r.data.clickEvent=function(e){e.contents().unwrap(),n.forEach(function(e){return e.forEach(a,function(e){var t=e.data("originalSource")||"",n=e.data("hidden");n&&(e.removeData("hidden"),n instanceof i?e.empty().append(n):(n=e.data("tempVariables"),a.renderInto("",null,_objectSpread(_objectSpread({},r),{},{source:t,target:e,transitionDeferred:!1}),n&&Object.create(n))))})})},g(r,{source:"<tw-link tabindex=0>"+e+"</tw-link>",transitionDeferred:!0})},[String,o(t)])("link-fullscreen",function(e,t){if(!e||!t)return h.create("datatype",m[0])},function(t,e,n,r){function a(){return document.fullscreenEnabled||document.msFullscreenEnabled?"<tw-link tabindex=0 fullscreen>"+(document.fullscreenElement||document.msFullscreenElement?r:n)+"</tw-link>":r?"<tw-broken-link>"+r+"</tw-broken-link>":""}var o=e.stackTop.tempVariables;return t.data.section=e,t.data.fullscreenEvent=function(){(document.fullscreenEnabled||document.msFullscreenEnabled)&&t.data.section.whenUnblocked(function(){var e=_objectSpread(_objectSpread({},t),{},{append:"replace",source:a(),transitionDeferred:!1});t.section.renderInto("",null,e,o)})},g(t,{source:a(),transitionDeferred:!0})},[String,String,r(String)]),e.addChanger(["link-reveal-goto"],function(e,t,n,r){if(!t)return h.create.apply(h,["datatype"].concat(m));if(a.isPrototypeOf(n)){if(a.isPrototypeOf(r))return h.create("datatype","You mustn't give two changers to (link-reveal-goto:)");r=n,n=void 0}return r&&!r.canEnchant?h.create("datatype","The changer given to (link-reveal-goto:) can't include a revision, enchantment, or interaction changer like (replace:), (click:), or (link:)."):(t=(e=s(e,t,n)).text,n=e.passage,e.error||a.create("link-reveal-goto",[t,n,r].filter(function(e){return void 0!==e}),null,!1))},function(t,e,n,r){var a,o,i,s;if(u.hasValid(n))return o=l.passageNameVisited(n),i=null!=(a=t.section)&&a.stackTop?t.section.stackTop.tempVariables:Object.create(null),s=d.create({source:"<tw-link tabindex=0 "+(0<o?'class="visited" ':"")+">"+e+"</tw-link>",target:t.target,append:"replace",data:{section:t.section,append:"replace",clickEvent:function(e){t.enablers=t.enablers.filter(function(e){return e.descriptor!==s}),e.contents().unwrap(),t.section.renderInto("",null,t,i),t.section.whenUnblocked(function(){return p.goToPassage(n,{transition:t.data.passageT8n})})}}}),t.enablers=(t.enablers||[]).concat({descriptor:s,changer:r}),t;t.source='<tw-broken-link passage-name="'+c.escape(n)+'">'+e+"</tw-broken-link>"},[String,r(n(a,String)),r(a)])}),define("macrolib/metadata",["macros","utils/operationutils","datatypes/lambda","internaltypes/twineerror"],function(t,e,n,s){function c(e){return{TwineScript_TypeName:"a ("+e+":) macro",TwineScript_ObjectName:"a ("+e+":) macro",TwineScript_Unstorable:!0,TwineScript_Print:function(){return""}}}var l=e.clone,u=e.objectName,p=e.isValidDatamapName,e=t.TypeSignature,r=e.zeroOrMore,e=e.Any;[["storylet",n.TypeSignature("when")],["urgency",Number],["exclusivity",Number]].forEach(function(e){var e=_slicedToArray(e,2),n=e[0],e=e[1];t.add(n,"Metadata",function(e,t){return e.stackTop.speculativePassage?t:c(n)},e)}),t.add("metadata","Metadata",function(e){for(var r,a=new Map,t=arguments.length,n=new Array(1<t?t-1:0),o=1;o<t;o++)n[o-1]=arguments[o];var i=n.reduce(function(e,t){var n;if(!s.containsError(e))if(void 0===r)r=t;else{if(n=s.containsError(p(a,r)))return n;if(a.has(r))return s.create("macrocall","You used the same data name ("+u(r)+") twice in the same (metadata:) call.");a.set(r,l(t)),r=void 0}return e},!0);return s.containsError(i)?i:void 0!==r?s.create("macrocall","This (metadata:) macro has a data name without a value."):e.stackTop.speculativePassage?a:c("metadata")},r(e))}),define("macrolib/patterns",["macros","utils","utils/operationutils","datatypes/lambda","datatypes/datatype","datatypes/typedvar","internaltypes/twineerror","internaltypes/varscope"],function(e,t,n,y,b,h,v,w){function k(e){var r,t,a=e.name,n=e.fullArgs,o=e.args,i=e.makeRegExpString,s=void 0===i?function(e){return e.join("")}:i,c=void 0!==(i=e.insensitive)&&i,l=void 0===(i=e.canContainTypedVars)||i,u=void 0===(i=e.canBeUsedAlone)||i,p=void 0===(i=e.canContainTypedGlobals)||i,d=o||n,f=E(null),e=d.map(function e(t){if(h.isPrototypeOf(t)){var n=t.varRef;if(!l)return v.create("operation","Optional string patterns, like (".concat(a,":)").concat("p-many"===a?" with a minimum of 0 matches":"",", can't have typed variables inside them."));if(!p&&!w.isPrototypeOf(n.object))return v.create("operation","Only typed temp variables can be used in patterns given to (".concat(a,":)"));n=n.getName();if(n in f)return v.create("operation","There's already a typed temp variable named _".concat(n," inside this (").concat(a,":) call."));f[n]=!0;n=e(t.datatype);return v.containsError(n)?n:"("+n+")"}if(b.isPrototypeOf(t)){if(!(l&&p||"function"!=typeof t.typedVars)){n=t.typedVars();if(!l&&n.length)return v.create("operation","(".concat(a,":) can't have typed variables inside its pattern."));if(!p&&n.some(function(e){return!w.isPrototypeOf(e.varRef.object)}))return v.create("operation","Only typed temp variables can be used in patterns given to (".concat(a,":)"))}var r;return t.regExp?(t.rest?"(?:":"")+(c?t.insensitive():t).regExp+(t.rest?")*":""):(n=t.name,r=t.rest?"*":"","alnum"===n?m+r:"whitespace"===n?_+r:"uppercase"===n?(c?T:g)+r:"lowercase"===n?(c?T:S)+r:"anycase"===n?T+r:"digit"===n?"\\d"+r:"linebreak"===n?"(?:\\r|\\n|\\r\\n)"+r:"str"===n?".*?":["even","odd","int","num"].includes(n)?v.create("datatype","Please use string datatypes like 'digit' in (".concat(a,":) instead of number datatypes.")):v.create("datatype","The (".concat(a,":) macro must only be given string-related datatypes, not ").concat(O(t),".")))}return"string"==typeof t?(t=t.replace(/[.*+\-?^${}()|[\]\\]/g,"\\$&"),c?t.replace(RegExp("(".concat(g,"|").concat(S,")"),"g"),function(e){return"["+e.toUpperCase()+e.toLowerCase()+"]"}):t):(x("createPattern","mapper() was given a non-string non-datatype "+t),"")});return(i=v.containsError(e))||(r=s(e),t=C(E(b),{name:a,regExp:r,insensitive:function(){return c?t:k({name:a,fullArgs:n,args:d.map(function(e){return b.isPrototypeOf(e)&&"function"==typeof e.insensitive?e.insensitive():e}),makeRegExpString:s,insensitive:!0,canContainTypedVars:l,canBeUsedAlone:u})},typedVars:function(){return d.reduce(function(e,t){return h.isPrototypeOf(t)&&(e=e.concat(c?h.create(k({name:"p-ins",fullArgs:[t.datatype],insensitive:!0}),t.varRef):t),t=t.datatype),e=b.isPrototypeOf(t)&&"function"==typeof t.typedVars?e.concat(t.typedVars()):e},[])},destructure:function(e){var n,t;return"string"!=typeof e?[v.create("operation","I can't put ".concat(O(e)," into ").concat(this.TwineScript_ToSource()," because it isn't a string."))]:(n=this.typedVars()).length?(t=(RegExp("^"+(this.rest?"(?:":"")+r+(this.rest?")*":"")+"$").exec(e)||[]).slice(1)).length?t.map(function(e,t){t=n[t];if(t)return t.datatype.rest&&!t.datatype.regExp&&((t=t.TwineScript_Clone()).datatype=k({name:"p",fullArgs:[t.datatype]})),{dest:t,value:e||"",src:void 0}}).filter(Boolean):[v.create("operation","I can't put ".concat(O(e)," because it doesn't match the pattern ").concat(this.TwineScript_ToSource(),"."))]:[]},TwineScript_IsTypeOf:function(e){return u?"string"==typeof e&&!!e.match("^"+(this.rest?"(?:":"")+r+(this.rest?")*":"")+"$"):v.create("operation","A (".concat(a,":) datatype must only be used with a (p:) macro."))},TwineScript_toTypeSignatureObject:function(){var t=this;return{pattern:"range",name:a,range:function(e){return t.TwineScript_IsTypeOf(e)}}},TwineScript_ToSource:function(){return(this.rest?"...":"")+"("+a+":"+n.map(A)+")"}}),Object.defineProperty(t,"TwineScript_ObjectName",{get:function(){return"a (".concat(a,":) datatype")}}),t)}var m=t.anyRealLetter,g=t.anyUppercase,S=t.anyLowercase,T=t.anyCasedLetter,_=t.realWhitespace,x=t.impossible,O=n.objectName,A=n.toSource,t=e.TypeSignature,n=t.rest,r=t.either,a=t.optional,t=t.nonNegativeInteger,C=Object.assign,E=Object.create,o=n(r(String,b,h));e.add(["p","pattern"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p",fullArgs:n})},o)(["p-either","pattern-either"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p-either",fullArgs:n,canContainTypedVars:!1,makeRegExpString:function(e){return"(?:"+e.join("|")+")"}})},o)(["p-opt","pattern-opt","p-optional","pattern-optional"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p-opt",fullArgs:n,canContainTypedVars:!1,makeRegExpString:function(e){return"(?:"+e.join("")+")?"}})},o)(["p-not","pattern-not"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return n.find(function(e){return"string"==typeof e?1!==_toConsumableArray(e).length:e.rest||e.regExp||["str","empty"].includes(e.name)})?v.create("datatype","(p-not:) should only be given single characters, or datatypes that match single characters"):k({name:"p-not",fullArgs:n,canContainTypedVars:!1,makeRegExpString:function(e){return"[^"+e.map(function(e){return e.startsWith("[")&&e.endsWith("]")?e.slice(1,-1):e}).join("")+"]"}})},o)(["p-not-before","pattern-not-before"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p-not-before",fullArgs:n,canContainTypedVars:!1,makeRegExpString:function(e){return"(?!"+e.join("")+")"}})},o)(["p-before","pattern-before"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p-before",fullArgs:n,canContainTypedVars:!1,makeRegExpString:function(e){return"(?="+e.join("")+")"}})},o)(["p-start","pattern-start"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p-start",fullArgs:n,makeRegExpString:function(e){return"^(?:"+e.join("")+")"}})},o)(["p-end","pattern-end"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p-end",fullArgs:n,makeRegExpString:function(e){return"(?:"+e.join("")+")$"}})},o)(["p-many","pattern-many"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];var a,o,i,s=n.slice();return"number"==typeof n[0]&&(a=n.shift(),o="number"==typeof n[0]?n.shift():1/0),!(void 0!==o&&o<a)&&n.length?(i=n.find(function(e){return"string"!=typeof e&&!b.isPrototypeOf(e)&&!h.isPrototypeOf(e)}))?v.create("datatype","This (p-many:) macro can only be given a min and max number followed by datatypes or strings, but was also given "+O(i)+"."):k({name:"p-many",args:n,fullArgs:s,canContainTypedVars:0<a,makeRegExpString:function(e){return"(?:"+e.join("")+")"+(void 0!==a?"{"+a+(o===1/0?",":o!==a?","+o:"")+"}":"+")}}):v.create("datatype","The (p-many:) macro needs to be given string patterns, not just min and max numbers.")},[n(r(t,String,b,h))])(["p-ins","pattern-ins","p-insensitive","pattern-insensitive"],"Datatype",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return k({name:"p-ins",fullArgs:n,insensitive:!0})},o)(["split","splitted"],"Array",function(e,t,n){if(t=k({name:"split",fullArgs:[t],canContainTypedVars:!1}),v.containsError(t))return t;if(!n)return[""];if(!t.regExp)return _toConsumableArray(n);for(var r,a=RegExp(t.regExp),o=[];n&&(r=a.exec(n));){if(r.index+r[0].length===0)return o;o.push(n.slice(0,r.index)),n=n.slice(r.index+r[0].length)}return o.concat(n||[])},[r(String,b),String])("trimmed","String",function(e,t,n){return void 0===n||b.isPrototypeOf(t)&&"whitespace"===t.name?t.trim():(t=k({name:"trimmed",fullArgs:[t],canContainTypedVars:!1}),v.containsError(t)?t:t.regExp?n.replace(RegExp("^("+t.regExp+")*|("+t.regExp+")*$","g"),""):n)},[r(String,b),a(String)])(["str-find","string-find"],"String",function(e,t,n){if(t=k({name:"str-find",fullArgs:[t],canContainTypedGlobals:!1}),v.containsError(t))return t;for(var r,a=t.typedVars(),o=RegExp(t.regExp,"g"),i=[],s=o.lastIndex;(r=o.exec(n))&&s!==o.lastIndex;)if(s=o.lastIndex,a.length){for(var c=new Map,l=0;l<a.length;l+=1){if("match"===a[l].varRef.getName())return v.create("macrocall","There was a typed temp variable named _match in the pattern given to (str-find:)","The variable _match is reserved, and can't be used inside (str-find:)'s pattern.");c.set(a[l].varRef.getName(),r[l+1]),c.set("match",r[0])}i.push(c)}else i.push(r[0]);return i},[b,String])(["str-replaced","string-replaced","replaced"],"String",function(e,t,n,r,a){if("number"!=typeof t){if(void 0!==a)return v.create("macrocall","1 too many values were given to (str-replaced:).","If this is given 5 values, the first value must be a number of replacements.");a=r,r=n,n=t,t=1/0}else if(void 0===a)return v.create("macrocall","The (str-replaced:) macro needs 1 more value.","The final string seems to be missing.");if(b.isPrototypeOf(r))return v.create("datatype","The replacement value for (str-replaced:) must be a string or lambda, not ".concat(O(r)));if(y.isPrototypeOf(a)||y.isPrototypeOf(n))return v.create("datatype","The ".concat(y.isPrototypeOf(a)?"final string":"search pattern"," given to (str-replaced:) can't be a lambda."),"Only the replacement value (after the search pattern) can be a 'via' lambda.");if(n=k({name:"str-replaced",fullArgs:[n],canContainTypedGlobals:!1}),v.containsError(n))return n;if(!n.regExp)return a;for(var o,i=RegExp(n.regExp,"g"),s=y.isPrototypeOf(r)?n.typedVars():[],c=1,l=0,u="",p=i.lastIndex;a&&(o=i.exec(a))&&0<t&&p!==i.lastIndex;){for(var p=i.lastIndex,d=Object.create(e.stack.length?e.stackTop.tempVariables:w),f=0;f<s.length;f+=1){var h=s[f],m=h.varRef.create(d,h.varRef.propertyChain);if(v.containsError(m))return m;h=m.defineType(h.datatype);if(v.containsError(h))return h;m.set(o[f+1])}var g=y.isPrototypeOf(r)?r.apply(e,{loop:o[0],pos:c,tempVariables:d}):r;if(v.containsError(g))return g;if("string"!=typeof g)return v.create("datatype","(str-replaced:)'s lambda must produce a string, but it produced ".concat(O(g),' when given "').concat(o[0],'".'));u+=a.slice(l,o.index)+g,c+=1,--t,l=o.index+o[0].length}return u+=a.slice(l)},[r(t,String,b),r(b,String,y.TypeSignature("via")),r(String,y.TypeSignature("via")),a(String)])}),define("macrolib/stylechangers",["jquery","macros","utils","utils/renderutils","datatypes/colour","datatypes/hookset","datatypes/gradient","datatypes/changercommand","datatypes/lambda","internaltypes/changedescriptor","internaltypes/twineerror"],function(s,e,c,t,a,n,r,o,i,l,u){var p,d,f=t.geomParse,h=t.geomStringRegExp,m=Object.assign,t=e.TypeSignature,g=t.either,y=t.wrapped,b=t.optional,v=t.Any,w=t.Everything,k=t.zeroOrMore,S=t.rest,T=t.insensitiveSet,_=t.positiveNumber,x=t.positiveInteger,O=t.nonNegativeNumber,t=t.percent,y=[y(Boolean,'If you gave a number, you may instead want to check that the number is not 0. If you gave a string, you may instead want to check that the string is not "".')],A=(c.onStartup(function(){return c.storyElement.on("mouseenter.hover-macro","[hover=false]",function(){var e=s(this),t=e.data("hoverChanger");c.options.debug&&c.options.ignoreClickEvents&&!e.is("tw-backdrop.eval-replay *, tw-backdrop.harlowe-crash *")||(e.data({mouseoutStyle:e.attr("style")||""}),l.create({target:e},t).update(),e.attr("hover",!0))}).on("mouseleave.hover-macro","[hover=true]",function(){var e=s(this),t=e.data("mouseoutStyle");e.attr("style",t).removeData("mouseoutStyle").attr("hover",!1)})}),u.on(function(){s("tw-expression, tw-hook",c.storyElement).each(function(e,t){((t=s(t)).data("errorEvent")||Object)(t)})}),T("instant","dissolve","fade","rumble","shudder","pulse","zoom","flicker","slideleft","slideright","slideup","slidedown","fadeleft","faderight","fadeup","fadedown","blur")),C=T("dotted","dashed","solid","double","groove","ridge","inset","outset","none");e.addChanger("if",function(e,t){return o.create("if",[t])},function(e,t){return e.enabled=e.enabled&&t},y)("unless",function(e,t){return o.create("unless",[t])},function(e,t){return e.enabled=e.enabled&&!t},y)("elseif",function(e,t){return"lastHookShown"in e.stack[0]?o.create("elseif",[!1===e.stack[0].lastHookShown&&!!t]):u.create("macrocall","There's no (if:) or something else before this to do (else-if:) with.")},function(e,t){return e.enabled=e.enabled&&t},y)("else",function(e){return"lastHookShown"in e.stack[0]?o.create("else",[!1===e.stack[0].lastHookShown]):u.create("macrocall","There's nothing before this to do (else:) with.")},function(e,t){return e.enabled=e.enabled&&t},null)("hidden",function(){return o.create("hidden")},function(e){return e.enabled=!1},null)(["verbatim","v6m"],function(){return o.create("verbatim")},function(e){return e.verbatim=!0},null)("live",function(e,t){return o.create("live",t?[t]:[])},function(e,t){e.enabled=!1,e.transitionDeferred=!0,e.data.live={delay:t}},b(Number))("event",function(e,t){return o.create("event",[t])},function(e,t){e.enabled=!1,e.transitionDeferred=!0,e.data.live={event:t}},i.TypeSignature("when"))("more",function(){return o.create("more")},function(e){e.enabled=!1,e.transitionDeferred=!0,e.data.live={event:{when:!0,filter:function(e){return 0!==e.Identifiers.exits?[]:[!0]}}}},null)("after",function(e,t,n){return o.create("after",[t].concat(void 0!==n?[n]:[]))},function(e,t,n){e.enabled=!1,e.transitionDeferred=!0,e.data.live={event:{when:!0,filter:function(e){return c.anyInputDown()&&n&&(t-=n),e.Identifiers.time>t?[!0]:[]}}}},[_,b(O)])("after-error",function(){return o.create("after-error",[])},function(n){n.enabled=!1,n.transitionDeferred=!0;var r=n.section.stackTop.tempVariables;n.data.errorEvent=function(e){e.removeData("errorEvent");var t=_objectSpread(_objectSpread({},n),{},{enabled:!0,transitionDeferred:!1});t.data&&(t.data.errorEvent=void 0),n.section.whenUnblocked(function(){return n.section.renderInto("",null,t,r)})}},[])("hook",function(e,t){var n;return t?(n=c.insensitiveName(t))?o.create("hook",[n]):u.create("datatype",'The string given to (hook:), "'.concat(t,'", contained only dashes and underscores.')):u.create("datatype","The string given to (hook:) was empty.")},function(e,t){return e.attr.push({name:t})},[String])(["for","loop"],function(e,t){if(!t.loop)return u.create("datatype","The lambda provided to (for:) must refer to a temp variable, not just 'it'.");for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];return o.create("for",[t].concat(r))},function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];var o,i=t.filter(e.section,r);if(o=u.containsError(i))return o;e.loopVars[t.loop.getName()]=i||[]},[i.TypeSignature("where"),k(v)])(["transition","t8n"],function(e,t){return o.create("transition",[c.insensitiveName(t)])},function(e,t){return"zoom"===(e.transition=t)&&(e.transitionOrigin=function(){var e=s(this).offset(),t=e.left,e=e.top;return c.mouseCoords.x-t+"px "+(c.mouseCoords.y-e)+"px"}),e},[A])(["transition-time","t8n-time"],function(e,t){return o.create("transition-time",[t])},function(e,t){return e.transitionTime=t,e.data.passageT8n=m(e.data.passageT8n||{},{time:t}),e},[_])(["transition-delay","t8n-delay"],function(e,t){return o.create("transition-delay",[t])},function(e,t){return e.transitionDelay=t,e},[O])(["transition-skip","t8n-skip"],function(e,t){return o.create("transition-skip",[t])},function(e,t){return e.transitionSkip=t,e},[_])(["transition-depart","t8n-depart"],function(e,t){return o.create("transition-depart",[c.insensitiveName(t)])},function(e,t){return e.data.passageT8n=m(e.data.passageT8n||{},{depart:t}),"zoom"===t&&(e.data.passageT8n.departOrigin=function(){var e=s(this).offset(),t=e.left,e=e.top;return c.mouseCoords.x-t+"px "+(c.mouseCoords.y-e)+"px"}),e},[A])(["transition-arrive","t8n-arrive"],function(e,t){return o.create("transition-arrive",[c.insensitiveName(t)])},function(e,t){return e.data.passageT8n=m(e.data.passageT8n||{},{arrive:t}),"zoom"===t&&(e.data.passageT8n.arriveOrigin=function(){var e=s(this),t=e.offset(),n=t.left,t=t.top,r=e.height();return{"transform-origin":100*(c.mouseCoords.x-n)/e.width()+"% "+100*(c.mouseCoords.y-t)/r+"%",height:r+"px"}}),e},[A])("button",function(e,t){return void 0===t||f(t).size?o.create("button",t?[t]:[]):u.create("datatype",'The string given to (button:) should be a sizing line ("==X==", "==X", "=XXXX=" etc.), not '.concat(JSON.stringify(t),"."))},function(e,t){var t=f(t),n=t.marginLeft,t=t.size;return e.attr.push({class:function(){return this.className+(this.classList.contains("enchantment-button")?"":" ".repeat(0<this.className.length)+"enchantment-button")}}),e.styles.push({"margin-left":t?n+"%":void 0,width:t?t+"%":"100%"}),e},[b(String)]).apply(void 0,_toConsumableArray((d={click:{className:"enchantment-link",blockClassName:"enchantment-clickblock"},doubleclick:{className:"enchantment-dblclick",blockClassName:"enchantment-dblclickblock"},mouseover:{className:"enchantment-mouseover",blockClassName:"enchantment-mouseoverblock"},mouseout:{className:"enchantment-mouseout",blockClassName:"enchantment-mouseoutblock"}},["action",function(e,t){return o.create("action",[c.insensitiveName(t)])},function(e,t){return e.attr.push({class:function(){var e=function e(t){return(t=s(t)).is("tw-story, tw-sidebar, tw-passage")||["block","flex"].includes(t.css("display"))||t.children().get().some(e)}(this);return Array.from(this.classList).filter(function(t){return!Object.keys(d).some(function(e){return d[e].className===t||d[e].blockClassName===t})}).concat(d[t][e?"blockClassName":"className"]).join(" ")}}),e},[T.apply(void 0,_toConsumableArray(Object.keys(d)))]])))(["border","b4r"],function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return o.create("border",n.map(c.insensitiveName))},function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return e.styles.push({display:function(){var e=s(this).css("display");return n.every(function(e){return"none"===e})||!e.includes("inline")?e:"inline-block"},"border-style":n.join(" "),"border-width":function(){return this.style.borderWidth||"2px"}}),e},[C].concat(_toConsumableArray(Array(3).fill(b(C)))))(["border-size","b4r-size"],function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return o.create("border-size",n)},function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return e.styles.push({"border-width":n.map(function(e){return e+"px"}).join(" ")}),e},[O].concat(_toConsumableArray(Array(3).fill(b(O)))))("corner-radius",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return o.create("corner-radius",n)},function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return e.styles.push({"border-radius":n.map(function(e){return e+"px"}).join(" "),padding:function(){return this.style.padding||n.map(function(e){return e+"px"}).join(" ")}}),e},[O].concat(_toConsumableArray(Array(3).fill(b(O)))))(["border-colour","b4r-colour","border-color","b4r-color"],function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return o.create("border-colour",n.map(function(e){return a.isPrototypeOf(e)?e.toRGBAString(e):e}))},function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return e.styles.push({"border-color":n.join(" ")}),e},[g(String,a)].concat(_toConsumableArray(Array(3).fill(b(g(String,a))))))("opacity",function(e,t){return o.create("opacity",[t])},function(e,t){return e.styles.push({opacity:t})},[t])("font",function(e,t){return o.create("font",[t])},function(e,t){return e.styles.push({"font-family":t}),e},[String])("align",function(e,t){var n=t.indexOf("><");return/^(==+>|<=+|=+><=+|<==+>)$/.test(t)?((n=~n?_objectSpread({"text-align":"center","max-width":"50%"},25===(n=Math.round(n/(t.length-2)*50))?{"margin-left":"auto","margin-right":"auto"}:{"margin-left":n+"%"}):"<"===t[0]&&">"===t.slice(-1)?{"text-align":"justify","max-width":"50%"}:t.includes(">")?{"text-align":"right"}:{"text-align":"left"}).display="block",o.create("align",[n])):u.create("datatype",'The (align:) macro requires an alignment arrow ("==>", "<==", "==><=" etc.) be provided, not "'+t+'"')},function(e,t){e.styles.push(t)},[String])(["text-colour","text-color","color","colour"],function(e,t){return o.create("text-colour",[t])},function(e,t){return a.isPrototypeOf(t)&&(t=t.toRGBAString(t)),e.styles.push({color:t}),e},[g(String,a)])(["text-size","size"],function(e,t){return o.create("text-size",[t])},function(e,t){return e.styles.push({"font-size":24*t+"px","line-height":36*t+"px"}),e},[O])("text-indent",function(e,t){return o.create("text-indent",[t])},function(e,t){return e.styles.push({"text-indent":t+"px",display:"inline-block"}),e},[O])(["text-rotate-z","text-rotate"],function(e,t){return o.create("text-rotate-z",[t])},function(e,t){return e.styles.push({display:"inline-block",transform:function(){var e=s(this).css("transform")||"";return(e="none"===e?"":e)+" rotate("+t+"deg)"}}),e},[Number])("text-rotate-y",function(e,t){return o.create("text-rotate-y",[t])},function(e,t){return e.styles.push({display:"inline-block",transform:function(){var e=s(this).css("transform")||"";return(e="none"===e?"":e)+" perspective(50vw) rotateY("+t+"deg)"}}),e},[Number])("text-rotate-x",function(e,t){return o.create("text-rotate-x",[t])},function(e,t){return e.styles.push({display:"inline-block",transform:function(){var e=s(this).css("transform")||"";return(e="none"===e?"":e)+" perspective(50vw) rotateX("+t+"deg)"}}),e},[Number])(["background","bg"],function(e,t){return o.create("background",[t])},function(e,t){return a.isPrototypeOf(t)?t=t.toRGBAString():r.isPrototypeOf(t)&&(t=t.toLinearGradientString()),t=a.isHexString(t)||a.isCSS3Function(t)?{"background-color":t}:t.startsWith("linear-gradient(")||t.startsWith("repeating-linear-gradient(")?{"background-image":t}:{"background-size":"cover","background-image":"url(".concat(t,")"),"background-attachment":"fixed"},e.styles.push(t,{display:function(){var e=s(this);return!e.children().length||c.childrenProbablyInline(e)?s(this).css("display"):"block"}}),e},[g(String,a,r)]).apply(void 0,_toConsumableArray((y={color:function(){return"transparent"}},p=m(Object.create(null),{none:{},bold:{"font-weight":"bold"},italic:{"font-style":"italic"},underline:{"text-decoration":"underline"},doubleunderline:{"text-decoration":"underline","text-decoration-style":"double"},wavyunderline:{"text-decoration":"underline","text-decoration-style":"wavy"},strike:{"text-decoration":"line-through"},doublestrike:{"text-decoration":"line-through","text-decoration-style":"double"},wavystrike:{"text-decoration":"line-through","text-decoration-style":"wavy"},superscript:{"vertical-align":"super","font-size":".83em"},subscript:{"vertical-align":"sub","font-size":".83em"},blink:{animation:"fade-in-out 1s steps(1,end) infinite alternate"},shudder:{animation:"shudder linear 0.1s 0s infinite"},mark:{"background-color":"hsla(60, 100%, 50%, 0.6)"},condense:{"letter-spacing":"-0.08em"},expand:{"letter-spacing":"0.1em"},outline:[{"text-shadow":function(){var e=s(this).css("color");return"-1px -1px 0 "+e+", 1px -1px 0 "+e+",-1px  1px 0 "+e+", 1px  1px 0 "+e}},{color:function(){return c.parentColours(s(this)).backgroundColour}}],shadow:{"text-shadow":function(){return"0.08em 0.08em 0.08em "+s(this).css("color")}},emboss:{"text-shadow":function(){return"0.04em 0.04em 0em "+s(this).css("color")}},smear:[{"text-shadow":function(){var e=s(this).css("color");return"0em   0em 0.02em "+e+",-0.2em 0em  0.5em "+e+", 0.2em 0em  0.5em "+e}},y],blur:[{"text-shadow":function(){return"0em 0em 0.08em "+s(this).css("color")}},y],blurrier:[{"text-shadow":function(){return"0em 0em 0.2em "+s(this).css("color")},"user-select":"none"},y],mirror:{display:"inline-block",transform:"scaleX(-1)"},upsidedown:{display:"inline-block",transform:"scaleY(-1)"},tall:{display:"inline-block",transform:"scaleY(1.5) translateY(-0.25ex)"},flat:{display:"inline-block",transform:"scaleY(0.5) translateY(0.25ex)"},fadeinout:{animation:"fade-in-out 2s ease-in-out infinite alternate"},rumble:{animation:"rumble linear 0.1s 0s infinite"},sway:{animation:"sway linear 2.5s 0s infinite"},buoy:{animation:"buoy linear 2.5s 0s infinite"},fidget:{animation:function(){return"fidget step-end 60s "+60*-Math.random()+"s infinite"+(Math.random()<.5?" reverse":"")}}}),["text-style",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return o.create("text-style",n.map(c.insensitiveName))},function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];for(var a=0;a<n.length;a+=1)"none"===n[a]?e.styles=[]:e.styles=e.styles.concat(p[n[a]]);return e},[S(T.apply(void 0,_toConsumableArray(Object.keys(p))))]])))("collapse",function(){return o.create("collapse")},function(e){return e.attr.push({collapsing:!0}),e},[])("hover-style",function(e,t){var n=l.create(),r=(t.run(n),n.summary());return r+""=="styles"||r.every(function(e){return"styles"===e||"attr"===e})&&n.attr.every(function(e){return Object.keys(e)+""=="style"})?o.create("hover-style",[t]):u.create("datatype","The changer given to (hover-style:) must only change the hook's style.")},function(e,t){return e.data.hoverChanger=t,e.attr.push({hover:function(e,t){return void 0!==t&&t}}),e},[o])("css",function(e,t){return t.trim().endsWith(";")||(t+=";"),o.create("css",[t])},function(e,t){return e.attr.push({style:function(){return(s(this).attr("style")||"")+t}}),e},[String])("test-true",function(){return o.create("test-true",[])},function(e){return e.enabled=!0},k(w))("test-false",function(){return o.create("test-false",[])},function(e){return e.enabled=!1},k(w)),e.addCommand("animate",s.noop,function(r,e,t,a,o){t.forEach(e,function(e){var t,n;"zoom"===name&&(n=(t=e.offset()).left,t=t.top,n=c.mouseCoords.x-n+"px "+(c.mouseCoords.y-t)+"px"),c.transitionIn(e,a,r.transitionTime||o,r.transitionDelay,r.transitionSkip,0,n)})},[S(n),T.apply(void 0,_toConsumableArray(A.innerType.filter(function(e){return"instant"!==e}))),b(_)]),["box","float-box"].forEach(function(i){return e.addChanger(i,function(e,t,n){var r=-1===t.search(h)||1<t.length&&!t.includes("="),a="float-box"===i&&(-1===n.search(h)||1<n.length&&!n.includes("="));return r||a?u.create("datatype","The ("+i+':) macro requires a sizing line("==X==", "==X", "=XXXX=" etc.) be provided, not "'+(r?t:n)+'".'):o.create(i,[t,n].filter(function(e){return void 0!==e}))},function(e,t,n){var r,t=f(t),a=t.marginLeft,t=t.size,o=("float-box"===i&&(r=(o=f(n)).marginLeft,n=o.size),"box"===i?"%":"vw"),t=_defineProperty(_defineProperty(_defineProperty({display:"block",width:t+o,"max-width":t+o},"box"===i?"margin-left":"left",a+o),"overflow-y","auto"),"padding",function(){var e=s(this).css("padding");return e&&"0px"!==e?e:"1em"});return void 0!==n&&(t.height="box"===i?1.5*n+2+"em":n+"vh"),"float-box"===i&&m(t,{position:"fixed",top:r+"vh","background-color":function(){return c.parentColours(s(this)).backgroundColour}}),e.styles.push(t),e},[String,"box"===i?b(x):String])})}),define("macrolib/values",["macros","state","utils","utils/operationutils","datatypes/colour","datatypes/gradient","datatypes/datatype","datatypes/hookset","datatypes/codehook","internaltypes/twineerror"],function(t,r,e,n,l,c,a,o,i,f){var s=e.realWhitespace,u=e.nth,p=e.anyRealLetter,d=e.plural,h=n.subset,m=n.objectName,g=n.clone,y=n.toSource,e=t.TypeSignature,n=e.rest,b=e.zeroOrMore,v=e.either,w=e.optional,k=e.insensitiveSet,S=e.numberRange,T=e.percent,_=e.nonNegativeInteger,x=e.positiveInteger,e=e.Any,O=Math.max,A=Math.min,C=Math.round,E=Math.floor,N=Math.ceil;function j(t){return function(){var e=t.apply(void 0,arguments);return"number"!=typeof e||isNaN(e)?f.create("macrocall","This mathematical expression doesn't compute!"):e}}t.add(["str","string","text"],"String",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return n.map(function(e){return i.isPrototypeOf(e)?e.source:e}).join("")},[b(t.TypeSignature.either(String,Number,Boolean,Array,i))])("source","String",function(e,t){return"command"!==(null==t?void 0:t.TwineScript_TypeID)||t.TwineScript_ToSource?y(t):f.create("datatype","I can't construct the source code of a command created by a custom macro.")},[e])("substring","String",function(e,t,n,r){return h(t,n,r)},[String,parseInt,parseInt])("lowercase","String",function(e,t){return t.toLowerCase()},[String])("uppercase","String",function(e,t){return t.toUpperCase()},[String])("lowerfirst","String",function(e,t){return t.replace(RegExp(p+"+"),function(e){return(e=Array.from(e))[0].toLowerCase()+e.slice(1).join("").toLowerCase()})},[String])("upperfirst","String",function(e,t){return t.replace(RegExp(p+"+"),function(e){return(e=Array.from(e))[0].toUpperCase()+e.slice(1).join("").toLowerCase()})},[String])("words","Array",function(e,t){return t.split(RegExp(s+"+")).filter(Boolean)},[String])(["str-repeated","string-repeated"],"String",function(e,t,n){return 0===n.length?f.create("macrocall","I can't repeat an empty string."):n.repeat(t)},[_,String])(["str-reversed","string-reversed"],"String",function(e,t){return _toConsumableArray(t).reverse().join("")},[String])("joined","String",function(e,t){for(var n=arguments.length,r=new Array(2<n?n-2:0),a=2;a<n;a++)r[a-2]=arguments[a];return r.join(t)},[n(String)])("plural","String",function(e,t,n,r){return n&&""!==r?d(t,n,r):f.create("macrocall","The (plural:) macro can't be given empty strings.")},[parseInt,String,w(String)])(["str-nth","string-nth"],"String",function(e,t){return u(t)},[parseInt])("digit-format","String",function(e,t,n){if(1e21<=Math.abs(n))return f.create("macrocall","The number given to (digit-format:) is too big.");for(var r=/([^#0])(?=[#0]*$)/g,a=(r.exec(t)||[])[1],o=(/^[#0]*([^#0])/g.exec(t)||[])[1],i=(t=_toConsumableArray(t)).length,s=(a&&(","!==a||o&&","!==o)&&(i=r.lastIndex-1),Math.abs(n).toFixed(16).replace(/(\.\d*?)0+$/,function(e,t){return t}).replace(/^0+/,"")),c=s.includes(".")?s.indexOf("."):s.length,l=0,u="",p=t.length-1;0<=p;--p){var d=t[p];"0"===d||"#"===d?u=(s[c-i+p+l]||("0"===d?"0":""))+u:p<t.length-1&&0<p&&(u=d+u,l+=p===i?0:1)}return(n<0?"-":"")+u},[String,Number])(["num","number"],"Number",function(e,t){return Number.isNaN(+t)?f.create("macrocall","I couldn't convert "+m(t)+" to a number."):+t},[String])("datatype","Datatype",function(e,t){return a.from(t)},[e])("datapattern","Any",function(e,t){return function n(e){var r;return Array.isArray(e)?r=e.map(n):e instanceof Map?(r=new Map,_toConsumableArray(e).forEach(function(e){var e=_slicedToArray(e,2),t=e[0],e=e[1];return r.set(t,n(e))})):r=a.from(e),(e=f.containsError(r))||r}(t)},[e])(["rgb","rgba"],"Colour",function(e){return l.create({r:arguments.length<=1?void 0:arguments[1],g:arguments.length<=2?void 0:arguments[2],b:arguments.length<=3?void 0:arguments[3],a:arguments.length<=4?void 0:arguments[4]})},[S(0,255),S(0,255),S(0,255),w(T)])(["hsl","hsla"],"Colour",function(e,t,n,r,a){return(t=C(t)%360)<0&&(t+=360),l.create({h:t,s:n,l:r,a:a})},[Number,T,T,w(T)])(["lch","lcha"],"Colour",function(e,t,n,r,a){return(r=C(r)%360)<0&&(r+=360),l.create({l:t,c:n,h:r,a:a})},[T,S(0,132),Number,w(T)])("complement","Colour",function(e,t){return t.LCHRotate(180)},[l])("mix","Colour",function(e,t,n,r,a){n=n.toLCHA(),a=a.toLCHA();var o=1,i=(t+r!==1&&(t+r<1&&(o=t+r),t=(i=[t/(t+r),r/(t+r)])[0],r=i[1]),n.c<2||n.l<.01||.99<n.l?n.h=a.h:(a.c<2||a.l<.01||.99<a.l)&&(a.h=n.h),n.l*=n.a,n.c*=n.a,a.l*=a.a,a.c*=a.a,180<a.h-n.h?n.h+=360:a.h-n.h<-180&&(a.h+=360),n.a*t+a.a*r),s=(n.l*t+a.l*r)/i,c=(n.c*t+a.c*r)/i,n=(n.h*t+a.h*r)/i;return l.create({l:s,c:c,h:n,a:i*o})},[T,l,T,l])("palette","Array",function(e,t,n){var r,a=n.toLCHA(),o=a.l,a={l:o<=.75?.75+o/3:.75-3*(1-o),c:80,h:a.h,a:1},i=l.create(a);return a.l+=o<=.75?-.1:.1,a.l<.5&&(a.l*=.5/a.l),r=l.create(a),a.l+=o<=.85?.15:-.15,o=l.create(a),"adjacent"===t?(r=(i=i.LCHRotate(-30)).LCHRotate(30),o=i.LCHRotate(60)):"triad"===t&&(o=i.LCHRotate(180),r=i.LCHRotate(140),i=i.LCHRotate(-140)),[n,i,r,o]},[k("mono","adjacent","triad"),l])("gradient","Gradient",function(e,t){(t=C(t)%360)<0&&(t+=360);for(var n,r,a,o=arguments.length,i=new Array(2<o?o-2:0),s=2;s<o;s++)i[s-2]=arguments[s];return i.length<4?f.create("datatype","(gradient:) must be given at least 2 colour-stop pairs of numbers and colours."):(r=[],a=i.reduce(function(e,t){if(!f.containsError(e))if(void 0===n)n=t;else{if("number"!=typeof n||!l.isPrototypeOf(t))return f.create("datatype","(gradient:) colour-stops should be pairs of numbers and colours, not colours and numbers.");r.push({stop:n,colour:g(t)}),n=void 0}return e},!0),f.containsError(a)?a:void 0!==n?f.create("macrocall","This gradient has a colour-stop percent without a colour."):c.create(t,r))},[Number,n(v(T,l))])("stripes","Gradient",function(e,t,n){(t=C(t)%360)<0&&(t+=360);for(var r=0,a=[],o=arguments.length,i=new Array(3<o?o-3:0),s=3;s<o;s++)i[s-3]=arguments[s];return i.forEach(function(e){a.push({stop:r,colour:g(e)}),r+=n,a.push({stop:r,colour:g(e)})}),c.create(t,a,!0)},[Number,x,l,n(l)])("hooks-named","HookName",function(e,t){return t?o.create({type:"name",data:t}):f.create("datatype","(hooks-named:) can't be given an empty string.")},[String])("cond","Any",function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];for(var a=0;a<n.length;a+=2){var o=n[a];if(a===n.length-1||f.containsError(o))return o;if("boolean"!=typeof o)return f.create("datatype","(cond:)'s "+u(a+1)+" value is "+m(o)+", but should be a boolean.");if(o)return n[a+1]}return f.create("macrocall","An odd number of values must be given to (cond:), not "+n.length,"(cond:) must be given one or more pairs of booleans and values, as well as one final value.")},[Boolean,e,n(e)]);({weekday:[function(){return["Sun","Mon","Tues","Wednes","Thurs","Fri","Satur"][(new Date).getDay()]+"day"},null],monthday:[function(){return(new Date).getDate()},null],currenttime:[function(){var e=new Date,t=e.getHours()<12;return(e.getHours()%12||12)+":"+((e.getMinutes()<10?"0":"")+e.getMinutes())+" "+(t?"A":"P")+"M"},null],currentdate:[function(){return(new Date).toDateString()},null],min:[A,n(Number)],max:[O,n(Number)],abs:[Math.abs,Number],sign:[Math.sign,Number],sin:[Math.sin,Number],cos:[Math.cos,Number],tan:[Math.tan,Number],floor:[E,Number],round:[C,Number],trunc:[function(e){return(0<e?E:N)(e)},Number],ceil:[N,Number],pow:[j(Math.pow),[Number,Number]],exp:[Math.exp,Number],sqrt:[j(Math.sqrt),Number],log:[j(Math.log),Number],log10:[j(Math.log10),Number],log2:[j(Math.log2),Number],random:[function(e,t){var n,t=t?(n=A(e,t),O(e,t)):(n=0,e);return t+=1,~~(r.random()*(t-n))+n},[parseInt,t.TypeSignature.optional(parseInt)]],"":function(){for(var e in this)e&&hasOwnProperty.call(this,e)&&t.add(e,"Number",function(a){return function(e){for(var t=arguments.length,n=new Array(1<t?t-1:0),r=1;r<t;r++)n[r-1]=arguments[r];return a.apply(void 0,n)}}(this[e][0]),this[e][1])}})[""](),t.add("either","Any",function(e){var t=1+~~(r.random()*(arguments.length<=1?0:arguments.length-1));return t<1||arguments.length<=t?void 0:arguments[t]},n(e))("nth","Any",function(e,t){return t<=0?f.create("datatype","(nth:)'s first value should be a positive whole number, not "+t):(t=(t-1)%(arguments.length<=2?0:arguments.length-2)+2)<2||arguments.length<=t?void 0:arguments[t]},[parseInt,n(e)])}),!function(){var a,k={};function o(e){for(var t in e)this[t]=e[t]}function i(e,t){for(var n,r,a=e.innerText,o=null,i=0,s=i,c=a.length,l=null;i<c;){for(var u=a.slice(i),p=(o&&o.length?o[0]:e).innerMode,d=0,f=p.length;d<f;d+=1){var h=k[p[d]];if(!(h.constraint&&!h.constraint(l)||h.cannotFollowText&&("text"===(null==(w=l)?void 0:w.type)||s<i))&&(h.plainCompare?u.startsWith(h.pattern):h.pattern.test(u))){var m=h.fn(h.plainCompare?h.pattern:h.pattern.exec(u)),g=!1,y=0;if(m.matches){for(;o&&y<o.length;y+=1){var b=o[y],v=b.type,b=b.aka;if(v in m.matches){g=!0;break}b&&(v=b),-1<(null==(b=m.cannotCross)?void 0:b.indexOf(v))&&(y=o.length-1)}if((!o||y>=o.length)&&!m.isFront)continue}s<i&&e.addChild({type:"text",text:a.slice(s,i),innerMode:p});var s=i+=(l=e.addChild(m)).text.length,w=!1;g&&(t&&S(e,l,o[y]),o=o.slice(y+1),w=!0),!w&&l.isFront&&(o?o.unshift(l):o=[l]);break}}d===f&&(i+=1,null===l)&&(l={type:"text"})}for(s<i&&e.addChild({type:"text",text:a.slice(s,i),innerMode:(null!=(n=o)&&n.length?o[0]:e).innerMode});0<(null==(r=o)?void 0:r.length);)o.shift().demote();return e}function S(e,t,n){var r=e.children.indexOf(t),a=e.children.indexOf(n);t.children=e.children.splice(a+1,r-(a+1)),t.type=t.matches[n.type],t.innerText="";for(var o,i=0,s=t.children.length;i<s;i++)t.innerText+=t.children[i].text;for(o in t.start=n.start,t.text=n.text+t.innerText+t.text,n)hasOwnProperty.call(n,o)&&!hasOwnProperty.call(t,o)&&(t[o]=n[o]);t.isFront&&(t.isFront=!1),e.children.splice(a,1)}o.prototype={constructor:o,addChild:function(e){var t=this.lastChildEnd(),n=new o(e);return n.start=t,n.end=e.text&&t+e.text.length,n.place=this.place,n.children=[],n.innerText&&i(n),this.children.push(n),n},lastChildEnd:function(){var e=this.children&&this.children[this.children.length-1]||null;return e?e.end:this.start+Math.max(0,this.text.indexOf(this.innerText))},tokenAt:function(e){if(e<this.start||e>=this.end)return null;if(this.children.length)for(var t=0;t<this.children.length;t+=1)if(e>=this.children[t].start&&e<this.children[t].end){var n=this.children[t].tokenAt(e);if(n)return n}return this},pathAt:function(e){if(e<this.start||e>=this.end)return[];var t=[];if(this.children.length)for(var n=0;n<this.children.length;n+=1)if(e>=this.children[n].start&&e<this.children[n].end){var r=this.children[n].pathAt(e);if(r.length){t=t.concat(r);break}}return t.concat(this)},nearestTokenAt:function(n){return n<this.start||n>=this.end?null:this.children?this.children.reduce(function(e,t){return e||(n>=t.start&&n<t.end?t:null)},null):this},everyLeaf:function(n){return this.children&&0!==this.children.length?this.children.reduce(function(e,t){return e&&t.everyLeaf(n)},!0):!!n(this)},demote:function(){this.type="text"},error:function(e){this.type="error",this.message=e},toString:function(){var e=this.type+"("+this.start+"\u2192"+this.end+")";return this.children&&0<this.children.length&&(e+="["+this.children+"]"),e},copy:function(){var e=new o(this);return e.children=e.children.slice(),e},foldChildren:function(){for(var e=[],t=this.children.slice(),n=0;n<t.length;n+=1){var r=t[n],a=!1;if(r.matches)for(var o=0;o<e.length;o+=1)e[o].type in r.matches&&(S(this,r,e[o]),e=e.slice(o+1),a=!0);!a&&r.isFront&&e.unshift(r)}}},a={lex:function(e){var t=1<arguments.length&&void 0!==arguments[1]?arguments[1]:"",n=2<arguments.length&&void 0!==arguments[2]?arguments[2]:"start",r=3<arguments.length&&void 0!==arguments[3]&&arguments[3];return i(new o({type:"root",place:t,start:0,end:e.length,text:e,innerText:e,children:[],innerMode:a.modes[n]}),!r)},rules:k,modes:{}},"object"===("undefined"==typeof module?"undefined":_typeof(module))?module.exports=a:"function"==typeof define&&define.amd?define("lexer",[],function(){return a}):this&&null!=this&&this.loaded?(this.modules||(this.modules={}),this.modules.Lexer=a):this.Lexer=a}.call(eval("this")||("undefined"!=typeof global?global:window)),!function(){Object.assign=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n,r=arguments[t];for(n in r)hasOwnProperty.call(r,n)&&(e[n]=r[n])}return e};var m,g=Object.keys,y=Object.assign;function t(e){function t(n){return n=n||"innerText",function(e){var e=e.reduceRight(function(e,t,n){return e||(n?t:"")},""),t={};return t[n]=e,t}}function n(e,t){var n={};return n[e]=t,function(){return{isFront:!0,matches:n,cannotCross:["verbatimOpener"]}}}var r=Object.bind(0,null);function a(a,e){return Object.keys(e).forEach(function(n){var r=e[n].fn;e[n].fn=function(e){var t=r(e);return t.text||(t.text="string"==typeof e?e:e[0]),t.type||(t.type=n),t.innerMode||(t.innerMode=a),t}}),e}function o(e){switch(e&&e.type){case null:case"br":case"hr":case"bulleted":case"numbered":case"heading":case"align":case"column":case"escapedLine":return!0}return!1}var i=[],s=[],c=[],l=a(i,{hr:{fn:r},bulleted:{fn:function(e){return{depth:e[1].length}}},numbered:{fn:function(e){return{depth:e[1].length/2}}},heading:{fn:function(e){return{depth:e[1].length}}},align:{fn:function(e){var t,e=e[1],n=e.indexOf("><");return~n?25===(t=Math.round(n/(e.length-2)*50))&&(t="center"):"<"===e[0]&&">"===e.slice(-1)?t="justify":-1<e.indexOf(">")?t="right":-1<e.indexOf("<")&&(t="left"),{align:t}}},column:{fn:function(e){var t,e=e[1],n=e.indexOf("|");return n&&n<e.length-1?t="center":"|"===e[0]&&"|"===e.slice(-1)?t="none":n===e.length-1?t="right":n||(t="left"),{column:t,width:/\|+/.exec(e)[0].length,marginLeft:/^=*/.exec(e)[0].length,marginRight:/=*$/.exec(e)[0].length}}}}),u=(g(l).forEach(function(e){l[e].constraint=o,l[e].cannotFollowText=!0}),a(i,{twine1Macro:{fn:function(){return{type:"error",message:"Harlowe macros use a different syntax to Twine 1, SugarCube, and Yarn macros."}}},emBack:{fn:function(){return{matches:{emFront:"em"},cannotCross:["verbatimOpener"]}}},strongBack:{fn:function(){return{matches:{strongFront:"strong"},cannotCross:["verbatimOpener"]}}},strongFront:{fn:function(){return{isFront:!0}}},emFront:{fn:function(){return{isFront:!0}}},boldOpener:{fn:n("boldOpener","bold")},italicOpener:{fn:n("italicOpener","italic")},strikeOpener:{fn:n("strikeOpener","strike")},supOpener:{fn:n("supOpener","sup")},commentFront:{fn:function(){return{isFront:!0}}},commentBack:{fn:function(){return{matches:{commentFront:"comment"}}}},scriptStyleTag:{fn:r},tag:{fn:r},url:{fn:r},hookPrependedFront:{fn:function(e){return{name:e[1],hidden:")"===e[2],isFront:!0,tagPosition:"prepended"}}},hookFront:{fn:function(){return{isFront:!0}}},hookBack:{fn:function(){return{matches:{hookPrependedFront:"hook",hookFront:"hook"},cannotCross:["verbatimOpener"]}}},hookAppendedBack:{fn:function(e){return{name:e[2],hidden:"("===e[1],tagPosition:"appended",matches:{hookFront:"hook"},cannotCross:["verbatimOpener"]}}},unclosedHook:{fn:r},unclosedHookPrepended:{fn:function(e){return{type:"unclosedHook",name:e[1],hidden:")"===e[2]}}},verbatimOpener:{fn:function(e){var e=e[0].length,t={};return{type:(t["verbatim"+e]="verbatim")+e,isFront:!0,matches:t,aka:"verbatimOpener"}}},unclosedCollapsed:{fn:r},collapsedFront:{fn:function(){return{isFront:!0}}},collapsedBack:{fn:function(){return{matches:{collapsedFront:"collapsed"},cannotCross:["verbatimOpener"]}}},escapedLine:{fn:r},legacyLink:{fn:function(e){return{type:"twineLink",innerText:e[1],passage:e[2],innerMode:i}}},br:{fn:r}})),p=y(a(s,{macroFront:{fn:function(e){return{isFront:!0,name:e[1]}}},groupingBack:{fn:function(){return{matches:{groupingFront:"grouping",macroFront:"macro"},cannotCross:["singleStringOpener","doubleStringOpener","hookFront"]}}},passageLink:{fn:function(e){var t=e[1]||"",n=e[2]||"",e=e[3]||"";return{type:"twineLink",innerText:n?e:t,passage:t?e:n,innerMode:i}}},simpleLink:{fn:function(e){return{type:"twineLink",innerText:e[1]||"",passage:e[1]||"",innerMode:i}}},variable:{constraint:function(e){return!e||"macroFront"!==e.type},fn:t("name")},tempVariable:{constraint:function(e){return!e||"macroFront"!==e.type},fn:t("name")}}),{hookFront:u.hookFront,hookBack:u.hookBack}),d=a(s,_objectSpread(_objectSpread({commentBack:{fn:function(){return{matches:{commentFront:"comment"}}}},macroName:{constraint:function(e){return e&&"macroFront"===e.type},fn:t("name")},groupingFront:{fn:function(){return{isFront:!0}}},property:{fn:t("name"),constraint:function(e){if(e)switch(e.type){case"variable":case"hookName":case"property":case"tempVariable":case"colour":case"itsProperty":case"belongingItProperty":case"macro":case"grouping":case"string":case"datatype":case"hook":case"boolean":case"number":return!0}}},possessiveOperator:{fn:r},itsProperty:{cannotFollowText:!0,fn:t("name")},itsOperator:{cannotFollowText:!0,fn:r},belongingItProperty:{cannotFollowText:!0,fn:t("name")},belongingItOperator:{cannotFollowText:!0,fn:r},belongingProperty:{cannotFollowText:!0,fn:t("name")},belongingOperator:{cannotFollowText:!0,fn:r},escapedStringChar:{fn:function(){return{type:"text"}}},singleStringOpener:{fn:function(){return{isFront:!0,matches:{singleStringOpener:"string"},innerMode:c}}},doubleStringOpener:{fn:function(){return{isFront:!0,matches:{doubleStringOpener:"string"},innerMode:c}}},hookName:{fn:t("name")},cssTime:{fn:function(e){return{value:+e[1]*("s"===e[2].toLowerCase()?1e3:1)}}},datatype:{cannotFollowText:!0,fn:function(e){return{name:e[0].toLowerCase()}}},colour:{cannotFollowText:!0,fn:function(e){var e=e[0].toLowerCase(),t={red:"e61919",orange:"e68019",yellow:"e5e619",lime:"80e619",green:"19e619",cyan:"19e5e6",aqua:"19e5e6",blue:"197fe6",navy:"1919e6",purple:"7f19e6",fuchsia:"e619e5",magenta:"e619e5",white:"fff",black:"000",gray:"888",grey:"888"},t=hasOwnProperty.call(t,e)?"#"+t[e]:e;return{colour:t}}},number:{fn:function(e){return{value:parseFloat(e[0])}}},inequality:{fn:function(e){return{operator:e[2],negate:-1<e[1].indexOf("not")}}},augmentedAssign:{fn:function(e){return{operator:e[0][0]}}},identifier:{fn:t("name"),cannotFollowText:!0},whitespace:{fn:r,cannotFollowText:!0},incorrectOperator:{fn:function(e){var t={"=>":">=","=<":"<=",gte:">=",lte:"<=",gt:">",lt:"<",eq:"is",isnot:"is not",neq:"is not",isa:"is a",are:"is",x:"*","or a":"or"}[e[0].toLowerCase().replace(/\s+/g," ")];return{type:"error",message:"Please say "+(t?"'"+t+"'":"something else")+" instead of '"+e[0]+"'.",explanation:"In the interests of readability, I want certain operators to be in a specific form."}},cannotFollowText:!0}},["boolean","is","to","into","where","when","via","making","each","and","or","not","isNot","contains","doesNotContain","isIn","isA","isNotA","isNotIn","matches","doesNotMatch","bind"].reduce(function(e,t){return e[t]={fn:r,cannotFollowText:!0},e},{})),["comma","spread","typeSignature","addition","subtraction","multiplication","division"].reduce(function(e,t){return e[t]={fn:r},e},{}))),f=a(c,{singleStringCloser:d.singleStringOpener,doubleStringCloser:d.doubleStringOpener,escapedStringChar:d.escapedStringChar}),h=(i.push.apply(i,_toConsumableArray(g(l)).concat(_toConsumableArray(g(p)),_toConsumableArray(g(u)))),s.push.apply(s,_toConsumableArray(g(p)).concat(_toConsumableArray(g(d)))),c.push.apply(c,_toConsumableArray(g(f))),_objectSpread(_objectSpread(_objectSpread(_objectSpread(_objectSpread({},l),u),p),d),f)),u=(g(h).forEach(function(e){m.PlainCompare[e]?(h[e].pattern=m.PlainCompare[e],h[e].plainCompare=!0):h[e].pattern=RegExp("^(?:"+m[e]+")","i")}),y(e.rules,h),e.modes);return u.start=u.markup=i,u.macro=s,u.string=c,e}function n(e){return Object.freeze({lex:t(e).lex,Patterns:m})}"object"===("undefined"==typeof module?"undefined":_typeof(module))?(m=require("./patterns"),module.exports=n(require("./lexer"))):"function"==typeof define&&define.amd?define("markup",["lexer","patterns"],function(e,t){return m=t,n(e)}):this&&this.loaded&&this.modules?(m=this.modules.Patterns,this.modules.Markup=n(this.modules.Lexer)):(m=this.Patterns,this.Markup=n(this.Lexer))}.call(eval("this")||("undefined"!=typeof global?global:window)),!function(){var e;function n(t){return t&&"object"===_typeof(t)?(Object.keys(t).forEach(function(e){t[e]=n(t[e])}),t):(t+"").replace(/[-[\]/{}()*+?.\\^$|]/g,"\\$&")}function t(e){return function(){return"("+e+Array.apply(0,arguments).join("|")+")"}}var r=t("?:"),a=t("?!"),o=t("?="),i="[ \\f\\t\\v\\u00a0\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]*",s=i.replace("*","+"),c="\\b",l="[\\w\\-\\u00c0-\\u00de\\u00df-\\u00ff\\u0150\\u0170\\u0151\\u0171\\uD800-\\uDFFF]",u=l.replace("\\-",""),p=r("\\n","$"),d=i+"(\\*+)"+s,f=i+"((?:0\\.)+)"+s,h=i+"-{3,}"+i+p,m=i+"(==+>|<=+|=+><=+|<==+>)"+i+p,p=i+"(=+\\|+|\\|+=+|=+\\|+=+|\\|=+\\|)"+i+p,g={opener:"\\[\\[(?!\\[)",text:"("+function(){return"[^"+Array.apply(0,arguments).map(n).join("")+"]*"}("]")+")",rightSeparator:r("\\->","\\|"),leftSeparator:"<\\-",closer:"\\]\\]",legacySeparator:"\\|",legacyText:"("+r("[^\\|\\]]","\\]"+a("\\]"))+"+)"},y=u+"*"+u.replace("\\w","a-zA-Z")+u+"*",b="\\$("+y+")",v="_("+y+")",w="'s"+s+a("_")+"("+y+")",k="("+y+")"+s+"of"+c+a("it\\b"),S="'s"+s,T=r("it","time","turns?","visits?","exits?","pos")+c,_="its"+s+"("+y+")",x="("+y+")"+s+"of"+s+"it"+c,O="of"+s+"it"+c,A={opener:"\\(",name:"("+r("\\$","_")+"?"+l+"+):"+a("\\/"),closer:"\\)"},C=r("=<","=>","[gl]te?\\b","n?eq\\b","isnot\\b","are\\b","x\\b","isa\\b","or"+s+"a"+c),E="[a-zA-Z][\\w\\-]*",N="(?:\"[^\"]*\"|'[^']*'|[^'\">])*?",j="\\|("+l+"+)(>|\\))",P="(<|\\()("+l+"+)\\|",R="((?:\\b\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+\\-]?\\d+)?)"+a("m?s")+c;g.main=g.opener+r(g.text+g.rightSeparator,g.text.replace("*","*?")+g.leftSeparator)+g.text,e={upperLetter:"[A-Z\\u00c0-\\u00de\\u0150\\u0170]",lowerLetter:"[a-z0-9_\\-\\u00df-\\u00ff\\u0151\\u0171]",anyLetter:l,anyLetterStrict:u,whitespace:s.replace("[","[\\n\\r"),escapedLine:"\\\\\\n\\\\?|\\n\\\\",br:"\\n(?!\\\\)",tag:"<\\/?"+E+N+">",scriptStyleTag:"<("+r("script","style","textarea")+")"+N+">[^]*?<\\/\\1>",scriptStyleTagOpener:"<",url:"("+r("https?","mailto","javascript","ftp","data")+":\\/\\/[^\\s<]+[^<.,:;\"')\\]\\s])",bullet:"\\*",hr:h,heading:"[ \\f\\t\\v\\u00a0\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]*(#{1,6})[ \\f\\t\\v\\u00a0\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]*",align:m,column:p,bulleted:d,numbered:f,verbatimOpener:"`+",hookAppendedFront:"\\["+a("=+"),hookPrependedFront:j+"\\["+a("=+"),hookFront:"\\["+a("=+"),hookBack:"\\]"+a(P),hookAppendedBack:"\\]"+P,unclosedHook:"\\[=+",unclosedHookPrepended:j+"\\[=+",unclosedCollapsed:"\\{=+",passageLink:g.main+g.closer,legacyLink:g.opener+g.legacyText+g.legacySeparator+g.legacyText+g.closer,simpleLink:g.opener+g.legacyText+g.closer,macroFront:A.opener+o(A.name),macroName:A.name,groupingFront:"\\("+a(A.name),twine1Macro:"<<[^>\\s]+\\s*(?:\\\\.|'(?:[^'\\\\]*\\\\.)*[^'\\\\]*'|\"(?:[^\"\\\\]*\\\\.)*[^\"\\\\]*\"|[^'\"\\\\>]|>(?!>))*>>",validPropertyName:y,property:w,belongingProperty:k,possessiveOperator:S,belongingOperator:"of\\b",itsOperator:"its\\b",belongingItOperator:O,variable:b,tempVariable:v,hookName:"\\?("+l+"+)\\b",cssTime:"(\\d+\\.?\\d*|\\d*\\.?\\d+)(m?s)\\b",colour:r(r("Red","Orange","Yellow","Lime","Green","Cyan","Aqua","Blue","Navy","Purple","Fuchsia","Magenta","White","Gray","Grey","Black","Transparent"),"#[\\dA-Fa-f]{3}(?:[\\dA-Fa-f]{3})?"),datatype:r("alnum","alphanumeric","any(?:case)?","array","bool(?:ean)?","changer","codehook","colou?r","const","command","dm","data"+r("map","type","set"),"ds","digit","gradient","empty","even","int"+a("o")+"(?:eger)?","lambda","lowercase","macro","linebreak","newline","num(?:ber)?","odd","str(?:ing)?","uppercase","whitespace")+c,number:R,boolean:r("true","false")+c,identifier:T,itsProperty:_,belongingItProperty:x,escapedStringChar:"\\\\[^\\n]",singleStringOpener:"'",doubleStringOpener:'"',singleStringCloser:"'",doubleStringCloser:'"',is:"is"+a(s+"not"+c,s+"an?"+c,s+"in"+c,s+"<",s+">")+c,isNot:"is"+s+"not"+a(s+r("an?","in")+c)+c,isA:"is"+s+"an?"+c,isNotA:"is"+s+"not"+s+"an?"+c,matches:"matches\\b",doesNotMatch:"does"+s+"not"+s+"match"+c,and:"and\\b",or:"or\\b",not:"not\\b",inequality:"((?:is(?:"+s+"not)?"+i+")*)("+r("<(?!=)","<=",">(?!=)",">=")+")",isIn:"is"+s+"in"+c,contains:"contains\\b",doesNotContain:"does"+s+"not"+s+"contain"+c,isNotIn:"is"+s+"not"+s+"in"+c,addition:n("+")+a("="),subtraction:n("-")+a("=","type"),multiplication:n("*")+a("="),division:r("/","%")+a("="),spread:"\\.\\.\\."+a("\\."),to:r("to\\b","="),into:"into\\b",making:"making\\b",where:"where\\b",when:"when\\b",via:"via\\b",each:"each\\b",augmentedAssign:r("\\+","\\-","\\*","\\/","%")+"=",bind:"2?bind\\b",typeSignature:n("-type")+c,incorrectOperator:C,PlainCompare:{comma:",",commentFront:"\x3c!--",commentBack:"--\x3e",strikeOpener:"~~",italicOpener:"//",boldOpener:"''",supOpener:"^^",strongFront:"**",strongBack:"**",emFront:"*",emBack:"*",collapsedFront:"{",collapsedBack:"}",groupingBack:")"}},"object"===("undefined"==typeof module?"undefined":_typeof(module))?module.exports=e:"function"==typeof define&&define.amd?define("patterns",[],function(){return e}):this&&this.loaded?(this.modules||(this.modules={}),this.modules.Patterns=e):this.Patterns=e}.call(eval("this")||("undefined"!=typeof global?global:window)),define("twinescript/operations",["utils","utils/operationutils","datatypes/typedvar","datatypes/datatype","internaltypes/twineerror"],function(e,t,n,r,m){var a=e.plural,o=t.isObject,i=t.collectionType,s=t.is,c=t.isA,l=t.clone,u=t.unique,p=t.contains,e=t.matches,g=t.objectName,d=t.toSource;function f(r,a,o,i){return o=o||"do this to",function(e,t){var n;return 1===a.length&&(t=e),(n=m.containsError(e,t))||(_typeof(e)!==r||_typeof(t)!==r?m.create("operation","I can only ".concat(o," ").concat(r,"s, not ").concat(g(_typeof(e)!==r?e:t),"."),i):a(e,t))}}function h(a){return function(e,t){var n,r;return(n=m.containsError(e,t))||(_typeof(e)!==_typeof(t)||o(e)&&"TwineScript_TypeName"in e&&o(t)&&"TwineScript_TypeName"in t&&e.TwineScript_TypeName!==t.TwineScript_TypeName||i(e)!==i(t)?(n="".concat(g(e)," isn't the same type of data as ").concat(g(t)),_typeof(e)+_typeof(t)!=="stringnumber"&&_typeof(e)+_typeof(t)!=="numberstring"||(r="You might want to convert one side to a number using (num:), or to a string using (str:)."),m.create("operation",n[0].toUpperCase()+n.slice(1),r)):a(e,t))}}function y(d,f,e){var h=2<arguments.length&&void 0!==e&&e;return function r(a,o){var e;if(e=m.containsError(a,o))return e;var t=_slicedToArray(a.determiner?[a,o]:o.determiner?[o,a]:[],2),i=t[0],t=t[1];if(i){var n=i,s=n.determiner,n=n.determined;if("start"===s||"end"===s){if(f)return m.create("operation","I can't use '".concat(f,"' with the 'start' or 'end' of ").concat(g(n),"."));if(t.determiner){if("start"===t.determiner||"end"===t.determiner)return m.create("operation","I can't compare one value's 'start' or 'end' with another value's 'start' or 'end'.","Please change one of them to use an exact range, such as '1stto4th' or '2ndlasttolast'.");n=[t,i],i=n[0]}for(var c=i.string||i.array,l=0;l<c.length+1;l+=1){var u=l?"end"===s?c.slice(-l):c.slice(0,l):c.constructor(),u=i===a?r(u,o):r(a,u);if(e=m.containsError(u))return e;if(u!==h)return u}return h}var p="all"===s;return i.array.reduce(function(e,t){var n,t=i===a?r(t,o):r(a,t);return(n=m.containsError(e,t))||(p?e&&t:e||t)},p)}return d(a,o)}}function b(n,e){return y(function(e,t){e=n(e,t);return m.containsError(e)?e:!e},e,!0)}t="If one of these values is a number, you may want to write a check that it 'is not 0'. Also, if one is a string, you may want to write a check that it 'is not \"\" '.",t={and:f("boolean",h(function(e,t){return e&&t}),"use 'and' to join",t),or:f("boolean",h(function(e,t){return e||t}),"use 'or' to join",t),not:f("boolean",function(e){return!e},"use 'not' to invert",t),"+":h(function(e,t){var n;return Array.isArray(e)?[].concat(_toConsumableArray(e),_toConsumableArray(t)):e instanceof Map?(n=new Map(e),t.forEach(function(e,t){return n.set(t,e)}),n):e instanceof Set?new Set([].concat(_toConsumableArray(e),_toConsumableArray(t)).filter(u).map(l)):"function"==typeof e["TwineScript_+"]?e["TwineScript_+"](t):"string|number|boolean".includes(_typeof(e))?e+t:m.create("operation","I can't use + on ".concat(g(e),"."))}),"-":h(function(e,n){var r;return Array.isArray(e)?e.filter(function(t){return!n.some(function(e){return s(t,e)})}):e instanceof Set?(r=_toConsumableArray(n),new Set(_toConsumableArray(e).filter(function(t){return!r.some(function(e){return s(t,e)})}))):"string"==typeof e?e.split(n).join(""):"number"==typeof e?e-n:m.create("operation","I can't use - on ".concat(g(e),"."))}),"*":f("number",h(function(e,t){return e*t}),"multiply"),"/":f("number",h(function(e,t){return 0===t?m.create("operation","I can't divide ".concat(g(e)," by zero.")):e/t}),"divide"),"%":f("number",h(function(e,t){return 0===t?m.create("operation","I can't modulo ".concat(g(e)," by zero.")):e%t}),"modulus"),"<":y(f("number",h(function(e,t){return e<t}),"do < to"),"<"),">":y(f("number",h(function(e,t){return t<e}),"do > to"),">"),"<=":y(f("number",h(function(e,t){return e<=t}),"do <= to"),"<="),">=":y(f("number",h(function(e,t){return t<=e}),"do >= to"),">="),is:y(s),isNot:b(s),contains:y(p,"contains"),doesNotContain:b(p,"does not contain"),isIn:y(function(e,t){return p(t,e)},"is in"),isNotIn:b(function(e,t){return p(t,e)},"is not in"),isA:y(c,"is a"),isNotA:b(c,"is not a"),typifies:y(function(e,t){return c(t,e)}),untypifies:b(function(e,t){return c(t,e)}),matches:y(e),doesNotMatch:b(e),makeSpreader:function(e){var t;return m.containsError(e)?e:n.isPrototypeOf(e)||r.isPrototypeOf(e)?(t=l(e),(n.isPrototypeOf(e)?t.datatype:t).rest=!0,t):{value:e,spreader:!0,TwineScript_TypeName:"a spreaded '...' value",TwineScript_ObjectName:a("string"==typeof e||Array.isArray(e)?_toConsumableArray(e).length:1,"spreaded '...' value"),TwineScript_Unstorable:!0,TwineScript_ToSource:function(){return""+_toConsumableArray(e).map(d)}}}};return Object.freeze(t)}),define("twinescript/runner",["macros","state","utils","utils/operationutils","twinescript/operations","datatypes/colour","datatypes/hookset","datatypes/lambda","datatypes/datatype","datatypes/varbind","datatypes/codehook","datatypes/typedvar","datatypes/assignmentrequest","internaltypes/varref","internaltypes/twineerror"],function(Macros,State,Utils,_ref127,Operations,Colour,HookSet,Lambda,Datatype,VarBind,CodeHook,TypedVar,AssignmentRequest,VarRef,TwineError){var toSource=_ref127.toSource,typeName=_ref127.typeName,objectName=_ref127.objectName,insensitiveName=Utils.insensitiveName,impossible=Utils.impossible,hash=Utils.hash;function addFreeVariable(e,t){var n,r=e.freeVariables;"macro"===t.type?"current-time"===(n=insensitiveName(t.name))||"current-date"===n||"monthday"===n||"weekday"===n||"history"===n||"visited"===n||"passage"===n?e.freeVariables=!0:t.blockedValue&&!r.blockedValues?r.blockedValues=e.stackTop.blockedValues.concat():"random"!==n&&"either"!==n&&"shuffled"!==n||r.seed||(r.seed=State.seed,r.seedIter=State.seedIter):"identifier"===t.type?"time"!==(n=insensitiveName(t.text))&&"exits"!==n&&"it"!==n&&"visits"!==n&&"turns"!==n||(e.freeVariables=!0):"property"===t.type||"belongingProperty"===t.type?"random"!==insensitiveName(t.name)||r.seed||(r.seed=State.seed,r.seedIter=State.seedIter):"variable"!==t.type&&"tempVariable"!==t.type||(e.freeVariables=!0)}var precedenceTable=[["error","text"],["comma"],["to","into"],["where","when","via","making","each"],["typeSignature"],["augmentedAssign"],["and","or"],["is","isNot"],["contains","doesNotContain","isIn","isNotIn"],["isA","isNotA","matches","doesNotMatch"],["inequality"],["addition","subtraction"],["multiplication","division"],{rightAssociative:["spread","bind"]},{rightAssociative:["not","positive","negative"]},{rightAssociative:["belongingProperty","belongingItProperty","belongingOperator","belongingItOperator"]},["property","itsProperty","possessiveOperator","itsOperator"],["twineLink","macro","identifier","variable","tempVariable","hookName","number","cssTime","boolean","string","hook","colour","datatype","root"],["grouping"]];function precedentToken(e,t){var n,r,a,o=[];if(e.length)for("most"===t?(n=precedenceTable.length-1,r=a=-1):(n=0,r=precedenceTable.length,a=1);n!==r;n+=a){var i=precedenceTable[n],s=NaN;if(i.rightAssociative){for(var c=0;c<e.length;c+=1)if(i.rightAssociative.includes(e[c].type)){s=c;break}}else for(var l=e.length-1;0<=l;--l)if(i.includes(e[l].type)){s=l;break}if(!Number.isNaN(s)&&-1<s){o=[e[s],s];break}}return o}var comparisonOpTypes=["inequality","is","isNot","isIn","contains","doesNotContain","isNotIn","isA","typifies","isNotA","untypifies","matches","doesNotMatch"],inequalityNegator={">":"<=","<":">=",">=":"<","<=":">"};function compileComparisonOperator(e){return"inequality"===e.type?e.negate?inequalityNegator[e.operator]:e.operator:e.type}var comparisonReverser={">":"<","<":">",">=":"<=","<=":">=",contains:"isIn",doesNotContain:"isNotIn",isIn:"contains",isA:"typifies",typifies:"isA",isNotA:"untypifies",untypifies:"isNotA"};function reverseComparisonOperator(e){e=compileComparisonOperator(e);return comparisonReverser[e]||e}var tokenSides={error:"neither",identifier:"neither",variable:"neither",tempVariable:"neither",hookName:"neither",number:"neither",boolean:"neither",string:"neither",hook:"neither",colour:"neither",datatype:"neither",root:"neither",twineLink:"neither",macro:"neither",grouping:"neither",itsProperty:"neither",belongingItProperty:"neither",to:"both",into:"both",typeSignature:"both",augmentedAssign:"both",and:"both",or:"both",belongingOperator:"both",possessiveOperator:"both",multiplication:"both",division:"both",spread:"after",bind:"after",not:"after",belongingProperty:"after",each:"after",itsOperator:"after",positive:"after",negative:"after",belongingItOperator:"before",property:"before"};function missingSideError(e,t,n){return TwineError.create("syntax","I need usable code to be ".concat(e?"left ":"").concat(e&&t?"and ":"").concat(t?"right ":"","of ").concat(n.text,"."))}function wrongSideError(e,t,n){return TwineError.create("syntax","There can't be a ".concat(e&&t?e.map(function(e){return e.text}).join("")+" or "+t.map(function(e){return e.text}).join(""):(e||t).map(function(e){return e.text}).join("")," to the ").concat(e?"left ":"").concat(e&&t?"or ":"").concat(t?"right ":"","of ").concat(n.text,"."),"There could be a comma missing between them.")}function makeEvalReplayFrame(e,t){var n=t.val,r=t.fromCode,a=t.toCode,o=t.toDesc,i=t.reason,s=t.it,c=t.tokens,t=t.i;if(!(200<=e.length)){var l=c[t],u=c.slice(0,t),t=c.slice(t+1);if(1===c.length&&(u=t=!1,l=c[0]),!e[e.length-1].error){var p,d,c=TwineError.containsError(n),f=e[e.length-1].code,h=e[0].basis,m=(null!=(p=u)&&p.length&&null!=(p=t)&&p.length&&u[0].start>t[0].start&&(u=(p=[t,u])[0],t=p[1]),p=a||"".concat(null!=(p=u)&&p.length&&"whitespace"===u[u.length-1].type?" ":"").concat(c?" \ud83d\udc1e ":(n&&!n.TwineScript_ToSource&&n.TwineScript_Unstorable?objectName:toSource)(n)).concat(null==(p=t)||!p.length||"whitespace"!==t[0].type&&"addition"!==l.type&&"subtraction"!==l.type?"":" "),(u.length?u[0]:l).start-h),g=(t.length?t[t.length-1]:l).end-h,y=_createForOfIteratorHelper(e);try{for(y.s();!(d=y.n()).done;){var b=d.value;b.start<m?(m+=b.diff,g+=b.diff):b.start<g&&(g+=b.diff)}}catch(e){y.e(e)}finally{y.f()}!r&&(r=f.slice(m,g),a)&&a.trim()===r.trim()||(u=p.length-(g-m),e.push({code:f.slice(0,m)+p+f.slice(g),fromCode:r,toCode:!c&&a,toDesc:!c&&!a&&(o||objectName(n)),start:m,end:g,diff:u,reason:i,itIdentifier:void 0!==s&&objectName(s),error:c&&c.render(f.slice(m,g),!0)}))}}}function setIt(e,t){return(VarRef.isPrototypeOf(t)||TypedVar.isPrototypeOf(t))&&(e.Identifiers.it=t.get()),t}return function run(section,tokens){var isVarRef=2<arguments.length&&void 0!==arguments[2]&&arguments[2],isTypedVar=3<arguments.length&&void 0!==arguments[3]&&arguments[3],evalReplay=section.evalReplay,hasEvalReplay=null==evalReplay?void 0:evalReplay.length,evalReplayReason,evalReplaySkip=!1,evalReplayIt,ops=Operations,token,ret,i,before,after,_precedentToken,_precedentToken2,token,i,before,after;if(Array.isArray(tokens)||(tokens=[tokens]),!tokens.length||!tokens[0])return impossible("Runner.run","No tokens to run!"),0;1===tokens.length?token=tokens[0]:(_precedentToken=precedentToken(tokens,"least"),_precedentToken2=_slicedToArray(_precedentToken,2),token=_precedentToken2[0],i=_precedentToken2[1],before=tokens.slice(0,i),after=tokens.slice(i+1),before.length&&(1!==before.length||"whitespace"!==before[0].type)||(before=!1),after.length&&(1!==after.length||"whitespace"!==after[0].type)||(after=!1));var type=token.type;if(!type)return impossible("Runner.run","Token has no type!"),0;var sides=tokenSides[type]||"",VARREF=("both"!==sides||before&&after?"neither"===sides&&(before||after)?ret=wrongSideError(before,after,token):"before"===sides?before?after&&(ret=wrongSideError(null,after,token)):ret=missingSideError(!0,!1,token):"after"===sides&&(after?before&&(ret=wrongSideError(before,null,token)):ret=missingSideError(!1,!0,token)):ret=missingSideError(!before,!after,token),section.freeVariables&&"object"===_typeof(section.freeVariables)&&addFreeVariable(section,token),!0),TYPEDVAR=!0,_ret4,val,evalReplayReason,ret,source,_source4,_value4,msg;if(!ret){if("comma"===type)return impossible("Section.run","a comma token was run() somehow."),0;if("root"===type)ret=run(section,token.children);else if("identifier"===type)ret=isVarRef?VarRef.create(section.Identifiers,token.text.toLowerCase()):section.Identifiers[token.text.toLowerCase()];else if("variable"===type||"tempVariable"===type){ret=VarRef.create("tempVariable"===type?section.stackTop.tempVariables:State.variables,token.name),isTypedVar?(ret=TypedVar.create(Datatype.create("any"),ret),evalReplayReason=hasEvalReplay&&"Variables in 'to' or 'into' expressions with no -type to their left are considered to be 'any-type' variables that can store any storable value."):isVarRef||TwineError.containsError(ret)?evalReplaySkip=!0:(val=ret.get(),evalReplayReason=hasEvalReplay&&((null==(_ret4=ret)?void 0:_ret4.object)!==State.variables||hasOwnProperty.call(ret.object,ret.compiledPropertyChain[0])?"":"This variable didn't exist; for story-wide $ variables, a default value of 0 is used if they don't exist."),ret=val)}else if("hookName"===type)ret=HookSet.create({type:"name",data:token.name}),evalReplaySkip=!0;else if("number"===type||"cssTime"===type)ret=token.value,evalReplayReason=hasEvalReplay&&"cssTime"===type&&(token.text.endsWith("ms")?"The letters 'ms' at the end of numbers are ignored, so you can use them to indicate that a number represents milliseconds.":"The letter 's' at the end of numbers represents 'seconds'. Harlowe converts them to milliseconds (multiplies them by 1000)."),evalReplaySkip=!evalReplayReason;else if("boolean"===type)ret="true"===token.text.toLowerCase(),evalReplaySkip=!0;else if("string"===type){var t=token.text.replace(/(.?)\n/g,function(e,t){return("\\"===t?"\\\\":"\n"===t?"\\n":t)+"\\n"}).replace(/(\\*)\\0/g,function(e,t){return(t?"\\".repeat(2*t.length):"")+"0"});ret=eval(t),evalReplaySkip=!0}else if("hook"===type)ret=CodeHook.create(token.children,token.text),evalReplaySkip=!0;else if("colour"===type)ret=Colour.create(token.colour),evalReplaySkip=!0;else if("datatype"===type)ret=Datatype.create(token.name),evalReplaySkip=!0;else if("spread"===type)ret=ops.makeSpreader(run(section,after,!1,isTypedVar));else if("bind"===type)ret=VarBind.create(run(section,after,VARREF),token.text.startsWith("2")?"two way":""),evalReplaySkip=!0;else if("to"===type||"into"===type){var dest="to"===type?setIt(section,run(section,before,VARREF,TYPEDVAR)):run(section,after,VARREF,TYPEDVAR);if(TwineError.containsError(dest))ret=dest;else{(VarRef.isPrototypeOf(dest)&&dest.propertyChain.length<=1||TypedVar.isPrototypeOf(dest)&&dest.varRef.propertyChain.length<=1)&&(section.freeVariables=Object.create(null));var src="to"===type?run(section,after,VARREF):setIt(section,run(section,before,VARREF));if(TwineError.containsError(src))return src;var freeVariables=section.freeVariables,srcRef;section.freeVariables=null,token.place&&freeVariables&&"object"===_typeof(freeVariables)&&"boolean"!=typeof src&&"number"!=typeof src&&!Utils.options.uncompressedPureValues&&(srcRef=freeVariables,srcRef.at=token.place,srcRef.from=after[0].start,srcRef.to=after[after.length-1].end,srcRef.hash=hash(after.reduce(function(e,t){return e+t.text},"")).toString(16),JSON.stringify(srcRef).length>=toSource(src).length)&&(srcRef=void 0),ret=AssignmentRequest.create(dest,src,type,srcRef),evalReplaySkip=!0,evalReplayIt=section.Identifiers.it}}else if("typeSignature"===type){var datatype=run(section,before),free=section.freeVariables,variable=(section.freeVariables=null,run(section,after,VARREF));section.freeVariables=free,ret=TypedVar.create(datatype,variable),evalReplaySkip=!0}else if("where"===type||"when"===type||"via"===type){after?(source=tokens.map(function(e){return e.text}).join(""),ret=Lambda.create(before?run(section,before,VARREF):void 0,token.type,after,source),evalReplaySkip=!0):ret=missingSideError(!1,!0,token)}else if("making"===type||"each"===type){after?(_source4=[].concat(tokens).map(function(e){return e.text}).join(""),ret="each"===type?Lambda.create(run(section,after,VARREF),"each",null,_source4):Lambda.create(before?run(section,before,VARREF):void 0,token.type,run(section,after,VARREF),_source4),evalReplaySkip=!0):ret=missingSideError(!1,!0,token)}else if("augmentedAssign"===type)ret=ops.makeAssignmentRequest(run(section,before,VARREF),ops[token.operator](run(section,before),run(section,after)),token.operator),evalReplaySkip=!0;else if("and"===type||"or"===type){var isComparisonOp=function e(t){var n=_slicedToArray(precedentToken(t,"least"),2),r=n[0],n=n[1];if(r&&"whitespace"!==r.type)return comparisonOpTypes.includes(r.type)?r:r.type===type?e(t.slice(0,n))||e(t.slice(n+1)):void 0},leftIsComparison=isComparisonOp(before),rightIsComparison=isComparisonOp(after),ambiguityError=TwineError.create("operation",'This use of "is not" and "'.concat(type,'" is grammatically ambiguous.'),'Maybe try rewriting this as "__ is not __ '.concat(type,' __ is not __"')),operator,getElisionOperands=function e(t){var n,r=_slicedToArray(precedentToken(t,"least"),2),a=r[0],r=r[1];return a&&"whitespace"!==a.type?a.type===type?[].concat(_toConsumableArray(e(t.slice(0,r))),_toConsumableArray(e(t.slice(r+1)))):(a=run(section,t),hasEvalReplay&&"boolean"!=typeof a&&(n=operator.replace(/[A-Z]/g,function(e){return" "+e.toLowerCase()}),makeEvalReplayFrame(evalReplay,{toCode:" it ".concat(n," ").concat(toSource(a)," "),reason:"A missing 'it ".concat(n,"' was inferred to correct the '").concat(type,"' operation."),tokens:t,i:r}),makeEvalReplayFrame(evalReplay,{toCode:" ".concat(toSource(section.Identifiers.it)," ").concat(n," ").concat(toSource(a)," "),tokens:t,i:r})),[{val:a,tokens:t,i:r}]):[]},elidedComparisonOperator=function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return t.reduce(function(e,t){var n=t.val,r=t.tokens,t=t.i;return"boolean"==typeof n?n:(e=Operations[token.type](e,Operations[operator](section.Identifiers.it,n)),hasEvalReplay&&makeEvalReplayFrame(evalReplay,{val:e,tokens:r,i:t}),e)},"and"===token.type)},leftSide,evalBefore,operator,rightSide,rightIndex,swappedSides,evalAfter;ret=leftIsComparison&&!rightIsComparison?(leftSide=leftIsComparison,operator=compileComparisonOperator(leftSide),"isNot"===leftSide.type||"isNotA"===leftSide.type||"untypifies"===leftSide.type?ambiguityError:(evalBefore=run(section,before),ops[type](evalBefore,elidedComparisonOperator.apply(void 0,_toConsumableArray(getElisionOperands(after)))))):!leftIsComparison&&rightIsComparison?(rightSide=rightIsComparison,rightIndex=tokens.indexOf(rightSide),operator=reverseComparisonOperator(rightSide),"isNot"===rightSide.type||"isNotA"===rightSide.type||"untypifies"===rightSide.type?ambiguityError:(swappedSides=[].concat(_toConsumableArray(tokens.slice(rightIndex+1)),[Object.assign(Object.create(rightSide),_defineProperty({},"inequality"===rightSide.type?"operator":"type",reverseComparisonOperator(rightSide)))],_toConsumableArray(tokens.slice(i+1,rightIndex))),evalAfter=run(section,swappedSides),ops[type](evalAfter,elidedComparisonOperator.apply(void 0,_toConsumableArray(getElisionOperands(before)))))):ops[type](run(section,before),run(section,after))}else if(comparisonOpTypes.includes(type)){after||missingSideError(!1,!0,token);var leftOp=before?run(section,before):section.Identifiers.it;ret=ops[compileComparisonOperator(token)](leftOp,run(section,after)),section.Identifiers.it=leftOp,evalReplayIt=leftOp,evalReplayReason=hasEvalReplay&&!before&&"A missing 'it' was inferred to complete the operation."}else if("addition"===type||"subtraction"===type){after||missingSideError(!1,!0,token);var convert=!before,_precedentToken7,_precedentToken8,previousPrecedentToken,_i10,_sides,pType,convert;before&&(_precedentToken7=precedentToken(before,"least"),_precedentToken8=_slicedToArray(_precedentToken7,2),previousPrecedentToken=_precedentToken8[0],_i10=_precedentToken8[1],_sides=tokenSides[previousPrecedentToken.type],pType=previousPrecedentToken.type,convert=("both"===_sides||"after"===_sides||"addition"===pType||"subtraction"===pType)&&(_i10===before.length-1||_i10===before.length-2&&"whitespace"===before[before.length-1].type)),convert?(token.type="addition"===type?"positive":"negative",ret=run(section,tokens),token.type=type,evalReplaySkip=!0):ret=ops[token.text](run(section,before),run(section,after))}else if("multiplication"===type||"division"===type)ret=ops[token.text](run(section,before),run(section,after));else if("positive"===type||"negative"===type)ret=ops["*"]("negative"===type?-1:1,run(section,after)),evalReplaySkip=!0;else if("not"===type)ret=ops.not(run(section,after));else if("belongingProperty"===type){var container=run(section,after,isVarRef),isRef=(ret=VarRef.create(container,token.name),isVarRef||TwineError.containsError(ret));ret=isRef?ret:ret.get(),isRef=isVarRef||TwineError.containsError(ret),hasEvalReplay&&!isRef?makeEvalReplayFrame(evalReplay,{toCode:" ".concat(token.name," of ").concat(toSource(VarRef.isPrototypeOf(container)?container.get():container)," "),tokens:tokens,i:i}):isRef||(evalReplayReason="The value to the right of 'of', ".concat(typeName(container),', had a "').concat(token.name,'" data name corresponding to that data value.'))}else if("belongingOperator"===type||"belongingItOperator"===type){var value=run(section,before);"random"===value&&section.freeVariables&&"object"===_typeof(section.freeVariables)&&!section.freeVariables.seed&&(section.freeVariables.seed=State.seed,section.freeVariables.seedIter=State.seedIter),ret=VarRef.create("belongingItOperator"===type?section.Identifiers.it:run(section,after,isVarRef),{computed:!0,value:value}),ret=isVarRef||TwineError.containsError(ret)?ret:ret.get(),"belongingItOperator"===type&&hasEvalReplay&&makeEvalReplayFrame(evalReplay,{toCode:" ".concat(toSource(value)," of ").concat(toSource(section.Identifiers.it)," "),tokens:tokens,i:i})}else if("property"===type){var _container=run(section,before,VARREF),_isRef=(ret=VarRef.create(_container,token.name),isVarRef||TwineError.containsError(ret));ret=_isRef?ret:ret.get(),_isRef=isVarRef||TwineError.containsError(ret),hasEvalReplay&&VarRef.isPrototypeOf(_container)&&!_isRef?makeEvalReplayFrame(evalReplay,{toCode:" ".concat(toSource(_container.get()),"'s ").concat(token.name," "),tokens:tokens,i:i}):_isRef||(evalReplayReason="The value to the left of 's, ".concat(typeName(_container),', had a "').concat(token.name,'" data name corresponding to that data value.'))}else if("itsProperty"===type||"belongingItProperty"===type)ret=VarRef.create(section.Identifiers.it,token.name),ret=isVarRef||TwineError.containsError(ret)?ret:ret.get(),hasEvalReplay&&makeEvalReplayFrame(evalReplay,{toCode:"itsProperty"===type?" ".concat(toSource(section.Identifiers.it),"'s ").concat(token.name," "):" ".concat(token.name," of ").concat(toSource(section.Identifiers.it)," "),tokens:tokens,i:i});else if("possessiveOperator"===type||"itsOperator"===type){!after||!before&&"itsOperator"!==token.type?ret=missingSideError(!before,!after,token):(_value4=run(section,after),"random"===_value4&&section.freeVariables&&"object"===_typeof(section.freeVariables)&&!section.freeVariables.seed&&(section.freeVariables.seed=State.seed,section.freeVariables.seedIter=State.seedIter),ret=VarRef.create("itsOperator"===token.type?section.Identifiers.it:run(section,before,isVarRef),{computed:!0,value:_value4}),ret=isVarRef||TwineError.containsError(ret)?ret:ret.get(),"itsOperator"===type&&hasEvalReplay&&makeEvalReplayFrame(evalReplay,{toCode:" ".concat(toSource(section.Identifiers.it),"'s ").concat(toSource(_value4)," "),tokens:tokens,i:i}))}else if("twineLink"===type)ret=Macros.run("link-goto",section,[token.innerText,token.passage]),evalReplayReason=hasEvalReplay&&"Passage links are the same as (link-goto:) macro calls.";else if("macro"===type)if(token.blockedValue&&!section.blocked){if(ret=section.blockedValue(),void 0===ret)return impossible("Runner.run","section.blockedValue() returned undefined"),0}else{var macroNameToken=token.children[0],variableCall="$"===macroNameToken.text[0]||"_"===macroNameToken.text[0],macroRef;if("macroName"!==macroNameToken.type&&!variableCall)return impossible("Runner.run","macro token had no macroName child token"),0;variableCall?(macroRef=VarRef.create("_"===macroNameToken.text[0]?section.stackTop.tempVariables:State.variables,macroNameToken.text.trim().slice(1,-1)),TwineError.containsError(macroRef)||(macroRef=macroRef.get())):macroRef=token.name,ret=Macros[variableCall?"runCustom":"run"](macroRef,section,token.children.slice(1).reduce(function(e,t){return"comma"===t.type?e.push([]):e[e.length-1].push(t),e},[[]]).filter(function(e){return e.length&&(1<e.length||"whitespace"!==e[0].type)}).map(function(e){return run(section,e,!1,isTypedVar)})),evalReplayReason=hasEvalReplay&&variableCall&&"I called ".concat(objectName(macroRef),".")}else if("grouping"===type)ret=run(section,token.children,isVarRef),evalReplaySkip=!0;else if("error"===type)ret=TwineError.create("syntax",token.message,token.explanation||"");else{if("text"!==type)return impossible("Section.run","unknown syntax token type: ".concat(type,"!!")),0;token.text.trim().match(/^\d+(?:th|nd|st|rd)(?:last)?(?:to\d+(?:nth|nd|st|rd)(?:last)?)?$/g)&&(msg='Position data names like "'.concat(token.text,'" need to be either left of "of" or right of "\'s".')),ret=TwineError.create("syntax",msg||'"'.concat(token.text,"\" isn't valid Harlowe syntax for the inside of a macro call."),"Maybe you misspelled something? Also, as of 3.3.0, Javascript syntax is not allowed inside macro calls.")}}return void 0===ret?(impossible("Section.run","token ".concat(type).concat(token.name?" (".concat(token.name,":)"):""," produced undefined")),0):ret===section?(impossible("Section.run","token ".concat(type).concat(token.name?" (".concat(token.name,":)"):""," produced the section")),0):(hasEvalReplay&&!evalReplaySkip&&makeEvalReplayFrame(evalReplay,{val:ret,reason:evalReplayReason,it:evalReplayIt,tokens:tokens,i:i}),ret)}}),define("utils/jqueryplugins",["jquery"],function(e){e.prototype.extend({popAttr:function(e){var t=this.attr(e);return this.removeAttr(e),t},popData:function(e){var t=this.data(e);return this.removeData(e),t},tag:function(){return this[0]&&this[0].tagName&&this[0].tagName.toLowerCase()},textNodes:function(){var e=0<arguments.length&&void 0!==arguments[0]?arguments[0]:"*";return 1===this.length&&this[0]&&this[0].nodeType===Node.TEXT_NODE?[this[0]]:this.get().concat(this.contents().get(),this.find(e).contents().get()).filter(function(e,t,n){return(null==e?void 0:e.nodeType)===Node.TEXT_NODE&&n.indexOf(e)===t}).sort(function(e,t){return 2&e.compareDocumentPosition(t)?1:-1})},findAndFilter:function(e){var t=this.find(e),e=this.filter(e);return e.length?t.add(e):t}})}),define("utils/naturalsort",[],function(){return function(h){var m=1<arguments.length&&void 0!==arguments[1]?arguments[1]:String;return function(e,t){var n,r,a,o,i=/(^-?[0-9]+(\.?[0-9]*)[df]?e?[0-9]?$|^0x[0-9a-f]+$|[0-9]+)/gi,s=/(^([\w ]+,?[\w ]+)?[\w ]+,?[\w ]+\d+:\d+(:\d+)?[\w ]?|^\d{1,4}[/-]\d{1,4}[/-]\d{1,4}|^\w+, \w+ \d+, \d{4})/,c=/^0x[0-9a-f]+$/i,l=/^0/,e=m(e).trim(),t=m(t).trim(),u=e.replace(i,"\0$1\0").replace(/\0$/,"").replace(/^\0/,"").split("\0"),p=t.replace(i,"\0$1\0").replace(/\0$/,"").replace(/^\0/,"").split("\0"),i=parseInt(e.match(c))||1!==u.length&&e.match(s)&&Date.parse(e),e=parseInt(t.match(c))||i&&t.match(s)&&Date.parse(t)||null;if(h&&window.Intl&&window.Intl.Collator&&(a=window.Intl.Collator(h)),e){if(i<e)return-1;if(e<i)return 1}for(var d=0,f=Math.max(u.length,p.length);d<f;d++){if(n=!(u[d]||"").match(l)&&parseFloat(u[d])||u[d]||0,r=!(p[d]||"").match(l)&&parseFloat(p[d])||p[d]||0,isNaN(n)!==isNaN(r))return isNaN(n)?1:-1;if(_typeof(n)!==_typeof(r))n+="",r+="";else if("string"==typeof n&&a&&0!==(o=a.compare(n,r)))return o;if(n<r)return-1;if(r<n)return 1}return 0}}}),define("utils/operationutils",["utils/naturalsort","utils","internaltypes/twineerror","patterns"],function(f,e,h,t){var m=e.impossible,g=e.nth,u=e.permutations,s=e.plural,y=t.validPropertyName,r="object",n="boolean",b="string",v="number",w="function";function a(e){return!!e&&(_typeof(e)===r||_typeof(e)===w)}var k=Array.isArray;function S(e){return e&&Object.getPrototypeOf(e)===Object.prototype}function i(e){return k(e)?"array":e instanceof Map?"datamap":e instanceof Set?"dataset":_typeof(e)===b?b:e&&_typeof(e)===r?r:""}function c(e){if(a(e)){if(_typeof(e.TwineScript_Clone)===w)return e.TwineScript_Clone();if(k(e))return _toConsumableArray(e);if(e instanceof Map)return new Map(e);if(e instanceof Set)return new Set(e);if(_typeof(e)===w)return Object.assign(e.bind(),e);switch(Object.getPrototypeOf(e)){case Object.prototype:return _objectSpread({},e);case null:return Object.assign(Object.create(null),e)}m("OperationUtils.clone","The value "+e+" cannot be cloned!")}return e}function o(e,t,n,r){for(var a="",o=0;a.length<=t&&o<e.length;){var i=r(e[o]);if(!(i.length+a.length<=t)){a+=(0<o?" and ":"")+s(e.length-o,(0<o?"other ":"")+n);break}a+=(0<o&&o===e.length-1?" and ":"")+i+(o<e.length-1?", ":""),o+=1}return a}function l(e){var t;return a(e)&&"TwineScript_ObjectName"in e?e.TwineScript_ObjectName:k(e)?0===e.length?"an empty array":"an array (with "+o(e,48,"item",l)+")":e instanceof Map?0===e.size?"an empty datamap":"a datamap (with "+o(_toConsumableArray(e.keys()),48,"dataname",_)+")":e instanceof Set?0===e.size?"an empty dataset":"a dataset (with "+o(_toConsumableArray(e.values()),48,"item",l)+")":_typeof(e)===b?0===e.length?"an empty string":48<(t=_toConsumableArray(e)).length?"a ".concat(t.length,"-character string starting with ").concat(JSON.stringify(t.slice(0,48).join(""))):"the string ".concat(JSON.stringify(e)):_typeof(e)===n?"the boolean value '"+e+"'":_typeof(e)===v?"the number "+JSON.stringify(e):void 0===e?"an empty variable":"...whatever this is"}function T(e,t){return[e[0],t[0]].sort(f("en"))[0]===e[0]?-1:1}function _(e,t){var n=h.containsError(e);if(n&&m("toSource","received a TwineError: "+n.message),_typeof(e.TwineScript_ToSource)===w)return e.TwineScript_ToSource();if(S(e)&&"first"in e&&"last"in e)return(e.first<0?(-1!==e.first?g(-e.first):"")+"last":g(e.first+1))+"to"+(e.last<0?(-1!==e.last?g(-e.last):"")+"last":g(e.last+1));if(k(e)){var r,a="",o=_createForOfIteratorHelper(e);try{for(o.s();!(r=o.n()).done;)var i=r.value,a=(a+=a?",":"(a:")+("property"===t?i+(0<i):_(i))}catch(e){o.e(e)}finally{o.f()}return a+(a?")":"(a:)")}if(e instanceof Map){var s,c="",l=_createForOfIteratorHelper(Array.from(e.entries()).sort(T));try{for(l.s();!(s=l.n()).done;){var u=_slicedToArray(s.value,2),p=u[0],d=u[1];c+=(c?",":"(dm:")+_(p)+","+_(d)}}catch(e){l.e(e)}finally{l.f()}return c+(c?")":"(dm:)")}return e instanceof Set?"(ds:"+Array.from(e).sort(f("en")).map(_)+")":_typeof(e)===v&&"property"===t?e<0?-1===e?"last":g(-e)+"last":g(e+1):_typeof(e)===b&&"property"===t?RegExp(y).test(e)?e:"("+JSON.stringify(e)+")":JSON.stringify(e)}function p(t,n){return _typeof(t)!==r&&_typeof(n)!==r?t===n:k(t)&&k(n)?t.length===n.length&&t.every(function(e,t){return p(n[t],e)}):t instanceof Map&&n instanceof Map?p(Array.from(t.entries()).sort(),Array.from(n.entries()).sort()):t instanceof Set&&n instanceof Set?p(_toConsumableArray(t),_toConsumableArray(n)):t&&_typeof(t.TwineScript_is)===w?t.TwineScript_is(n):t&&_typeof(t)===r&&n&&_typeof(n)===r&&S(t)&&S(n)?p(Object.getOwnPropertyNames(t).map(function(e){return[e,t[e]]}),Object.getOwnPropertyNames(n).map(function(e){return[e,n[e]]})):Object.is(t,n)}return Object.freeze({isObject:a,isValidDatamapName:function(e,t){var n;return e instanceof Map||m("isValidDatamapName","called with non-Map"),h.containsError(t)?t:_typeof(t)!==b&&_typeof(t)!==v?h.create("property","Only strings and numbers can be used as data names for "+l(e)+", not "+l(t)+"."):(n=_typeof(t)===b?+t:""+t,!(!Number.isNaN(n)&&e.has(n))||h.create("property","You mustn't use both "+l(t)+" and "+l(n)+" as data names in the same datamap."))},collectionType:i,isSequential:function(e){return _typeof(e)===b||k(e)||_typeof(e.hooks)===w},unstorableValue:function e(t){return(null==t?void 0:t.TwineScript_Unstorable)&&t||k(t)&&t.find(e)||t instanceof Map&&_toConsumableArray(t.values()).find(e)||t instanceof Set&&_toConsumableArray(t).find(e)},isHarloweJSValue:function e(t){return _typeof(t)===b||_typeof(t)===n||_typeof(t)===v&&!Number.isNaN(t)&&Math.abs(t)!==1/0||Array.isArray(t)&&t.every(e)||t instanceof Set&&_toConsumableArray(t).every(e)||t instanceof Map&&_toConsumableArray(t.values()).every(e)&&_toConsumableArray(t.keys()).every(function(e){return _typeof(e)===b})},clone:c,objectName:l,typeName:function e(t){var n,r=S(t);return r&&t.innerType?t.typeName||("insensitive set"===t.pattern?"a case-insensitive string name":"either"===t.pattern?(k(t.innerType)||m("typeName",'"either" pattern had non-array inner type'),t.innerType.map(e).join(" or ")):"optional"===t.pattern?"(optional) "+e(t.innerType):e(t.innerType)):r&&"range"===t.pattern?t.name||(r=t.min,n=t.max,"a"+(0<r?" positive":"")+(t.integer?" whole":"")+" number"+(0===r?" between 0 and "+n:n<1/0?" up to "+n:"")):t===String||t===Number||t===Boolean?"a "+_typeof(t()):t===parseInt?"a whole number":t===Map?"a datamap":t===Set?"a dataset":t===Array?"an array":a(t)&&"TwineScript_TypeName"in t?t.TwineScript_TypeName:l(t)},typeID:function(e){var t=_typeof(e);return[n,b,v].includes(t)?t:k(e)?"array":e instanceof Map?"datamap":e instanceof Set?"dataset":e.TwineScript_TypeID||""},toSource:_,is:p,contains:function(e,t){if(e||""===e){if(_typeof(e)===b)return _typeof(t)!==b?h.create("operation",l(e)+" can only contain strings, not "+l(t)+"."):e.includes(t);if(k(e))return e.some(function(e){return p(e,t)});if(e instanceof Set||e instanceof Map)return Array.from(e.keys()).some(function(e){return p(e,t)})}return h.create("operation",l(e)+" cannot contain any values, let alone "+l(t))},isA:function(e,t){return _typeof(t.TwineScript_IsTypeOf)===w?t.TwineScript_IsTypeOf(e):h.create("operation",'"is a" should only be used to compare type names, not '+l(t)+".")},matches:function t(n,e){var r=!1;if(n&&_typeof(n.TwineScript_IsTypeOf)===w){var a=n.TwineScript_IsTypeOf(e);if(h.containsError(a))return a;r|=a}if(e&&_typeof(e.TwineScript_IsTypeOf)===w){if(a=e.TwineScript_IsTypeOf(n),h.containsError(a))return a;r|=a}if(r)return!0;if(k(n)&&k(e)){for(var o=0,i=0,s=!0;s&&o<n.length&&i<e.length;){var c=n[o],l=e[i];if(c.rest){for(;i<e.length&&t(c,l);)l=e[i+=1];o+=1}else if(l.rest){for(;o<n.length&&t(c,l);)c=n[o+=1];i+=1}else t(c,l)?(o+=1,i+=1):s=!1}return s&&o>=n.length&&i>=e.length}return n instanceof Map&&e instanceof Map?t(Array.from(n.entries()).sort(),Array.from(e.entries()).sort()):n instanceof Set&&e instanceof Set?(n=_toConsumableArray(n),u.apply(void 0,_toConsumableArray(e)).some(function(e){return t(n,e)})):p(n,e)},subset:function e(t,n,r){var a,o;return n&&r?((a=_typeof(t)===b)&&(t=Array.from(t)),n<0&&(n=Math.max(0,t.length+n+1)),(r=r<0?Math.max(0,t.length+r+1):r)<n?e(arguments[0],r,n):(o=t.slice(0<n?n-1:n,r).map(c),a?o.join(""):o)):h.create("macrocall","The sub"+i(t)+" index value must not be "+(n&&r)+".")},range:function e(t,n){if(n<t)return e(n,t);var r=[t];for(n-=t;0<n--;)r.push(++t);return r},printBuiltinValue:function r(e){return h.containsError(e)?e:e&&_typeof(e.TwineScript_Print)===w?e.TwineScript_Print():e instanceof Map?(e=Array.from(e.entries()),h.containsError(e)?e:e.reduce(function(e,t){var n=(t=_slicedToArray(t,2))[0],t=t[1];return e+"<tr><td>`"+r(n)+"`</td><td>`"+r(t)+"`</td></tr>"},"<table class=datamap>")+"</table>"):e instanceof Set?Array.from(e.values()).map(r)+"":k(e)?e.map(r)+"":e&&_typeof(e.jquery)===b?e:a(e)?h.create("unimplemented","I don't know how to print this value yet."):e+""},unique:function(t,e,n){return n.findIndex(function(e){return p(t,e)})===e}})}),define("utils/polyfills",[],function(){var o=Array.prototype;"function"!=typeof o.includes&&(o.includes=function(e){var t=1<arguments.length&&void 0!==arguments[1]?arguments[1]:0;if(!Number.isNaN(e)&&Number.isFinite(t)&&void 0!==e)return-1<o.indexOf.call(this,e,t);var n=Object(this),r=parseInt(n.length);if(!(r<=0))for(var a=0<=t?t:Math.max(0,r+t);a<r;){if(Object.is(e,n[a]))return!0;a+=1}return!1}),window.Symbol||(window.Symbol={iterator:"_es6-shim iterator_"})}),define("utils/renderutils",["jquery","utils","renderer"],function(l,u,p){var n=RegExp(u.realWhitespace+"+"),s=RegExp(u.realWhitespace+"+","g");function d(e,t,n){var r,a=e.textContent.length;if(!(a<=t))return r=[e=0===t?e:e.splitText(t)],n&&(n=n<=0?a-n:n)<a&&r.push(e.splitText(n-t)),r}var t,c=function(){var e;return void 0!==t?t:(e=l("<p>"),t=!!e[0].normalize&&(e.append(document.createTextNode("0-"),document.createTextNode("2"),document.createTextNode(""))[0].normalize(),1===e.contents().length))};var f="tw-collapsed,[collapsing=true]";var o=/^(=*)([^=]+)=*$/;return Object.freeze({dialog:function(){var e,t=(c=0<arguments.length&&void 0!==arguments[0]?arguments[0]:{}).section,n=void 0===(n=c.parent)?u.storyElement:n,r=c.cd,a=void 0===(a=c.message)?"":a,o=c.defaultValue,i=void 0===(c=c.buttons)?[{name:"OK",confirm:!0,callback:Object}]:c,s=("a code hook"===a.TwineScript_TypeName&&(a=a.code),l("<tw-backdrop><tw-dialog>"+(o||""===o?"<input type=text style='display:block;margin:0 auto'></input>\n":"")+"<tw-dialog-links>"+(i.length?i.reduce(function(e,t,n){t=t.name;return e+"<tw-link style='margin:0 "+(n===i.length-1?"0 0 0.5em":0===n?"0.5em 0 0":"0.5em")+"' tabindex=0>"+t+"</tw-link>"},""):"<tw-link tabindex=0>"+i[0].name+"</tw-link>")+"</tw-dialog-links></tw-dialog></tw-backdrop>")),c=s.find("tw-dialog");return n.append(s),t?(t.renderInto(a,c,_objectSpread(_objectSpread({},r),{},{append:"prepend"})),null!=(n=(null==r?void 0:r.transition)&&s.find("tw-dialog > tw-transition-container"))&&n.length&&n.appendTo(s).append(c.prepend(n.contents().detach()))):c.prepend(p.exec(a)),o&&((e=s.find("input").last()).val(o).on("keypress",function(e){13===e.which&&(s.remove(),i.filter(function(e){return e.confirm}).forEach(function(e){return e.callback()}))}),setTimeout(function(){return e.focus()},100)),i.reverse().forEach(function(e,t){l(s.find("tw-link").get(-t-1)).on("click",function(){u.options.debug&&u.options.ignoreClickEvents&&!l(s).is(".eval-replay, .harlowe-crash")||(s.remove(),e.callback())})}),s},realWhitespace:n,textNodeToChars:function(r){var e=_toConsumableArray(r.textContent);return 1===e.length?[r]:e.reduce(function(e,t){return t.match(n)&&e.length&&e[e.length-1].match(n)?e[e.length-1]+=t:e.push(t),e},[]).reduce(function(e,t){var n=r;return t.length<r.textContent.length&&(r=r.splitText(t.length)),e.concat(n)},[])},findTextInNodes:function e(t,n){var r=[],a="",o=[];if(!t.length||!n)return o;for(;0<t.length;){r.push(t[0]),a+=t[0].textContent,t.shift();var i=a.indexOf(n);if(-1<i){for(var s=a.length-(i+n.length);i>=r[0].textContent.length;)i-=r[0].textContent.length,r.shift();if(1===r.length){var c=d(r[0],i,i+n.length);o.push(c[0]),c[1]&&t.unshift(c[1]);break}o.push(d(r[0],i,r[0].length)[0]),o.push.apply(o,_toConsumableArray(r.slice(1,-1))),c=d(r[r.length-1],0,r[r.length-1].textContent.length-s),o.push(c[0]),c[1]&&t.unshift(c[1]),o=o.filter(Boolean);break}}return[o].concat(_toConsumableArray(e(t,n)))},collapse:function(e){function n(e){return 0===l(this||e).parentsUntil(f).filter("tw-verbatim, tw-expression, [collapsing=false]").length}var t=function e(t){var n=t[0],r=t.parent();return!r.length||t.findAndFilter("tw-story").length?null:(t=(t=r.textNodes().filter(function(e){return 4&(e=e.compareDocumentPosition(n))&&!(8&e)}))[t.length-1])||e(r)}(e),r=(l(t).parents(f).length||(t=null),function e(t){var n=t[0],r=t.parent();return!r.length||t.findAndFilter("tw-story").length?null:r.textNodes().filter(function(e){return 2&(e=e.compareDocumentPosition(n))&&!(8&e)})[0]||e(r)}(e)),a=(l(r).parents(f).length||(r=null),"br:not([data-raw]),tw-consecutive-br:not([data-raw])"),o=(e.find(a).filter(n).replaceWith(document.createTextNode(" ")),(e=l(e.get().map(function(e){return l(e).filter(n).is(a)?l(document.createTextNode(" ")).replaceAll(e)[0]:e}))).textNodes()),i=0;o.reduce(function(e,t){return n(t)?(t.textContent=t.textContent.replace(s," ")," "!==t.textContent[0]||e&&e.textContent&&!(-1<e.textContent.search(/\s$/))||(t.textContent=t.textContent.slice(1)),t):document.createTextNode("A")},t),_toConsumableArray(o).reverse().every(function(e){return!(!n(e)||(e.textContent.match(/^\s*$/)?(i+=e.textContent.length,e.textContent=""):(e.textContent=e.textContent.replace(/\s+$/,function(e){return i+=e.length,""}),1)))}),0<i&&r&&(o[o.length-1].textContent+=" "),e[0]&&c()&&e[0].normalize()},geomStringRegExp:o,geomParse:function(e){var t,n,r,a;return!e||(t=e.length,n=(a=_slicedToArray(o.exec(e)||[],3))[0],r=a[1],a=a[2],!n)||a===e&&1<a.length?{marginLeft:0,size:0}:{marginLeft:r.length/t*100,size:a.length/t*100}}})}),define("utils/scripttag",["state","utils/operationutils","internaltypes/varref","internaltypes/twineerror"],function(a,o,i,s){return function(e,r){Function("script","scope","with(scope){var scope=void 0,arguments=void 0;eval([script,script=void 0][0]);}")(e,Object.create(null,Object.keys(a.variables).map(function(e){return!e.startsWith("TwineScript_")&&"$"+e}).concat(Object.keys(r).map(function(e){return!e.startsWith("TwineScript_")&&"_"+e})).reduce(function(e,n){return n&&(e[n]={get:function(){var e=("$"===n[0]?a.variables:r)[n.slice(1)];if(o.isHarloweJSValue(e))return o.clone(e);throw s.create("","The contents of the variable ".concat(n,", ").concat(o.objectName(e),", couldn't be converted to a Javascript value."),"Only booleans, strings, numbers, datamaps, datasets and arrays can be converted to Javascript values.")},set:function(e){var t="$"===n[0]?a.variables:r;if(!o.isHarloweJSValue(e))throw s.create("","The Javascript value, ".concat(e,", couldn't be converted to a Harlowe value and assigned to the variable ").concat(n,"."),"Only booleans, strings, numbers (except NaN and Infinity), Maps, Sets and Arrays can be converted to Harlowe values.");e=o.clone(e);t=i.create(t,n.slice(1)).set(e);if(s.containsError(t))throw t}}),e},{})))}}),!function(){function e(t,n,r){return function(e){return"background-color: hsla(".concat(t,",").concat(n,"%,").concat(r,"%,").concat(e,");")}}var t={boolean:"color:hsla(0,0%,30%,1.0)",array:"color:hsla(0,100%,30%,1.0)",dataset:"color:hsla(30,100%,40%,1.0)",number:"color:hsla(30,100%,30%,1.0)",datamap:"color:hsla(60,100%,30%,1.0)",changer:"color:hsla(90,100%,30%,1.0)",lambda:"color:hsla(120,100%,40%,1.0)",hookName:"color:hsla(160,100%,30%,1.0)",string:"color:hsla(180,100%,30%,1.0)",identifier:"color:hsla(200,80%,40%,1.0)",variable:"color:hsla(200,100%,30%,1.0)",tempVariable:"color:hsla(200,70%,20%,1.0)",datatype:"color:hsla(220,100%,30%,1.0)",colour:"color:hsla(280,100%,30%,1.0)",macro:"color:hsla(320,80%,30%,1.0)",twineLink:"color:hsla(240,100%,20%,1.0)"},o=(t.gradient=t.colour,t.command=t.twineLink,t.instant=t.metadata=t.any=t.customMacro=t.macro,Math.min),n=e(40,100,50),r=e(220,100,50),i=/hsla\((\d+),\s*(\d+)%,\s*(\d+)%,\s*(\d+\.\d+)\)/g,s="cm-harlowe-3-",a=(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(n={root:"box-sizing:border-box;",hook:n(.05),"hook-2":n(.1),"hook-3":n(.15),"hook-4":n(.2),"hook-5":n(.25),"hook-6":n(.3),"hook-7":n(.35),"hook-8":n(.4),"^=hook , ^=hook-":"font-weight:bold;",unclosedHook:n(.05)+"font-weight:bold;"},"error:not([class*='"+s+"string'])","background-color: hsla(17,100%,50%,0.5) !important;"),"^=macroName","font-style:italic;"),"macroName-boolean",t.boolean),"macroName-array",t.array),"macroName-dataset",t.dataset),"macroName-datatype",t.datatype),"macroName-number",t.number),"macroName-datamap",t.datamap),"macroName-changer",t.changer),"macroName-string",t.string),_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(n,"macroName-colour, macroName-gradient",t.colour),"macroName-command, macroName-instant, macroName-metadata",t.command),"macroName-custommacro, macroName-macro, macroName-any",t.macro),"^=macro ","font-weight:bold;"+t.macro),"comma, spread",t.macro),"addition",t.any),"subtraction, multiplication, division",t.number),"is, and, or, not, isNot, contains, doesNotContain, isIn, isA, isNotA, isNotIn, matches, doesNotMatch",t.boolean),"bold, strong","font-weight:bold;"),"italic, em","font-style:italic;"),_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(n,"sup","vertical-align: super;font-size:0.8em;"),"strike","text-decoration: line-through;"),"verbatim","background-color: hsla(0,0%,50%,0.1);font:var(--font-monospaced)"),"^=bold, ^=strong, ^=italic, ^=em, ^=sup, ^=verbatim, ^=strike","font-weight:100; color: hsla(0,0%,0%,0.5)"),"^=collapsed","font-weight:bold; color: hsla(201,100%,30%,1.0);"),"unclosedCollapsed",r(.025)+"font-weight:bold; color: hsla(201,100%,30%,1.0);"),"collapsed",r(.025)),"collapsed.hook",r(.05)),"collapsed.hook-2",r(.1)),"collapsed.hook-3",r(.15)),_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(n,"collapsed.hook-4",r(.2)),"collapsed.hook-5",r(.25)),"collapsed.hook-6",r(.3)),"collapsed.hook-7",r(.35)),"collapsed.hook-8",r(.4)),"twineLink:not(.text)",t.twineLink),"tag, scriptStyleTag, comment","color: hsla(240,34%,25%,1.0);"),"boolean",t.boolean),"string",t.string),"number",t.number),_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(n,"variable",t.variable),"tempVariable",t.tempVariable),"hookName",t.hookName),"datatype",t.datatype),"colour",t.colour),"cssTime",t.number),"passageString",t.variable+";text-decoration:underline 1px;"),"tagString",t.variable+";text-decoration:underline 1px dotted;"),"variableOccurrence, hookOccurrence","background: hsla(159,50%,75%,1.0) !important;"),"^=where, ^=via, ^=with, ^=making, ^=each, ^=when",t.lambda+"; font-style:italic;"),_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(_defineProperty(n,"heading","font-weight:bold;"),"hr","background-image: linear-gradient(0deg, transparent, transparent 45%, hsla(0,0%,75%,1.0) 45%, transparent 55%, transparent);"),"align","color: hsla(14,99%,37%,1.0); background-color: hsla(14,99%,87%,0.1);"),"column","color: hsla(204,99%,37%,1.0); background-color: hsla(204,99%,87%,0.1);"),"escapedLine","font-weight:bold; color: hsla(51,100%,30%,1.0);"),"identifier, property, belongingProperty, itsProperty, belongingItProperty, belongingItOperator, possessiveOperator, belongingOperator",t.identifier),"toString",function(){var a=this;return Object.keys(this).reduce(function(e,n){var r;return"toString"!==n&&(r=n.split(", ").map(function e(t){return-1<t.indexOf(".")?t.split(/\./g).map(e).join(""):0===t.indexOf("^=")?"[class^='"+s+t.slice(2)+"']":"."+s+t}),e+=r.join(", ")+"{"+a[n]+"}",a[n].match(i))&&[".theme-dark","[data-app-theme=dark]"].forEach(function(t){e+=r.map(function(e){return t+" "+e}).join(", ")+"{"+a[n].replace(i,function(e,t,n,r,a){return"hsla("+t+","+o(100,1.5*+n)+"%,"+(100-r)+"%,"+a+")"})+"}"}),e},"")})+"");"object"===("undefined"==typeof module?"undefined":_typeof(module))?module.exports={Colours:t,CSS:a,versionClass:s}:"function"==typeof define&&define.amd&&define("utils/typecolours",[],function(){return{Colours:t,CSS:a,versionClass:s}})}.call(void 0);
;require("harlowe")}());
</script>

</body>
</html>
 
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
        
        // === НОВОЕ: ПРОВЕРКА КАСТОМНОГО СЦЕНАРИЯ ===
        let customBeat = null;
        if (typeof STORY_SCRIPT !== 'undefined' && STORY_SCRIPT[idx]) {
            customBeat = STORY_SCRIPT[idx];
        }
        
        // Выбор типа квеста
        let type;
        if (customBeat && customBeat.forcedType) {
            // Если в сценарии жестко задан тип, используем его
            type = customBeat.forcedType;
        } else {
            // Иначе выбираем случайно (как было раньше)
            const types = ['FETCH', 'HUNT', 'EXPLORE', 'COLLECT', 'BOUNTY', 'SCHOLAR'];
            if (idx > 0) types.push('DIGGER');
            type = types[Math.floor(rng.next() * types.length)];
        }
        
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
            uniqueId: null 
        };

        // 1. Поиск локации (Подземелья)
        if (type !== 'BOUNTY' && type !== 'SCHOLAR') {
            const dungeons = [];
            for (let dy = -40; dy <= 40; dy++) {
                for (let dx = -40; dx <= 40; dx++) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < 5 || dist > 40) continue;
                    
                    const tx = cityData.x + dx;
                    const ty = cityData.y + dy;
                    
                    if (typeof GlobalMapModule !== 'undefined') {
                        const poi = GlobalMapModule.getPOI(tx, ty);
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
                targetData.locationName = "Забытых руинах";
                targetData.targetX = cityData.x + 10;
                targetData.targetY = cityData.y + 10;
            }
        } else {
            targetData.locationName = "любом опасном месте";
        }

        // 2. Заполнение специфичных параметров
        if (type === 'HUNT' || type === 'BOUNTY') {
            const enemies = DataModule.ENEMY_TYPES.filter(e => 
                ["Гоблин", "Крыса", "Волк", "Слизень", "Бандит", "Скелет", "Орк-разведчик"].includes(e.name)
            );
            const enemy = enemies[Math.floor(rng.next() * enemies.length)];
            targetData.enemyName = enemy.name;
            targetData.count = (type === 'BOUNTY') ? rng.int(1, 3) : rng.int(3, 6);
        } 
        
        else if (type === 'FETCH') {
            const hasUniqueItems = DataModule.UNIQUE_ITEM_TEMPLATES && DataModule.UNIQUE_ITEM_TEMPLATES.length > 0;
            const isUniqueRoll = hasUniqueItems && (rng.next() > 0.5);

            if (isUniqueRoll) {
                const uniquePool = DataModule.UNIQUE_ITEM_TEMPLATES;
                const uniqueItem = uniquePool[Math.floor(rng.next() * uniquePool.length)];
                
                targetData.itemName = `${uniqueItem.uniquePrefix} ${uniqueItem.baseName}`;
                targetData.itemType = uniqueItem.baseType;
                targetData.uniqueId = uniqueItem.id;
            } else {
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
            const hasUniqueItems = DataModule.UNIQUE_ITEM_TEMPLATES && DataModule.UNIQUE_ITEM_TEMPLATES.length > 0;
            const isUniqueRoll = hasUniqueItems && (rng.next() > 0.7);

            if (isUniqueRoll) {
                const bookUniques = DataModule.UNIQUE_ITEM_TEMPLATES.filter(u => u.baseType === 'book' || u.baseType === 'scroll_teleport');
                
                if (bookUniques.length > 0) {
                    const uniqueBook = bookUniques[Math.floor(rng.next() * bookUniques.length)];
                    targetData.itemName = `${uniqueBook.uniquePrefix} ${uniqueBook.baseName}`;
                    targetData.itemType = uniqueBook.baseType;
                    targetData.uniqueId = uniqueBook.id;
                } else {
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
        const goldMult = targetData.uniqueId ? 1.5 : 1.0; 
        const finalGold = Math.floor(baseGold * (1 + idx * 0.2) * goldMult);

        // === ФОРМИРОВАНИЕ ТЕКСТА (КАСТОМ ИЛИ ШАБЛОН) ===
        let briefing;
        let turnInText;

        if (customBeat) {
            // Берем тексты из сценария
            briefing = customBeat.customBriefing || "Задание не завершено.";
            turnInText = customBeat.customTurnIn || "Задание выполнено.";
        } else {
            // Фолбэк на стандартные шаблоны
            let templatePool = CHAIN_TEMPLATES[type] || CHAIN_TEMPLATES.FETCH;
            let template = templatePool[Math.floor(rng.next() * templatePool.length)];
            if (cityData.isFinal) {
                template = `Ты прошел долгий путь. Финальное испытание в ${cityData.name}: ${template}`;
            }
            briefing = template;
            
            let turnInPool = cityData.isFinal ? TURN_IN_TEMPLATES.FINAL : (TURN_IN_TEMPLATES[type] || TURN_IN_TEMPLATES.FETCH);
            turnInText = turnInPool[Math.floor(rng.next() * turnInPool.length)];
        }

        // === ЗАМЕНА ПЛЕЙСХОЛДЕРОВ (РАБОТАЕТ ДЛЯ ЛЮБЫХ ТЕКСТОВ) ===
        const finalBriefing = briefing
            .replace(/{city}/g, cityData.name)
            .replace(/{nextCity}/g, nextCity ? nextCity.name : 'дальних земель')
            .replace(/{item}/g, targetData.itemName || 'древний артефакт')
            .replace(/{enemy}/g, targetData.enemyName || 'монстров')
            .replace(/{count}/g, targetData.count || 1)
            .replace(/{location}/g, targetData.locationName || 'забытых руинах')
            .replace(/{depth}/g, targetData.targetDepth || 1)
            .replace(/{gold}/g, finalGold);

        const finalTurnIn = turnInText
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
            briefing: finalBriefing,
            turnInText: finalTurnIn,
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
    'ITEM_BERSERK':          { char: '*',   tile: { file: 'item_sprites', x: 1, y: 4 }, desc: 'Настой берсерка' } // Совпадает с ITEM_DAGGER
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
 
### story_script.js 
 
```js 
 
/**
 * СЮЖЕТНЫЙ СЦЕНАРИЙ МИРА (story_script.js)
 * Позволяет задать уникальные тексты для цепочки квестов.
 * Если для индекса нет записи, используется стандартный шаблон.
 * 
 * Доступные плейсхолдеры для замены:
 * {city}      - Название текущего города
 * {nextCity}  - Название следующего города
 * {item}      - Название предмета (для FETCH/COLLECT)
 * {enemy}     - Название врага (для HUNT/BOUNTY)
 * {count}     - Количество врагов/предметов
 * {location}  - Название подземелья/локации
 * {depth}     - Требуемая глубина
 * {gold}      - Награда в золоте
 */

const STORY_SCRIPT = [
    // === ЭТАП 0: Стартовый город ===
    {
        index: 0,
        forcedType: 'FETCH', // Жестко задаем тип квеста, чтобы текст совпадал с механикой
        customBriefing: "Старейшина {city} тяжело опирается на посох. 'Странник, судьба привела тебя вовремя. В {location} мы утратили реликвию — {item}. Без неё наши земли погрузятся во тьму. Найди её, и путь в {nextCity} будет открыт для тебя.'",
        customTurnIn: "Старейшина бережно принимает {item}. 'Ты спас нас, герой. Но это лишь начало. Иди в {nextCity}, там знают, что делать с этой находкой...'"
    },

    // === ЭТАП 1: Второй город ===
    {
        index: 1,
        forcedType: 'HUNT',
        customBriefing: "Стражник {city} преграждает тебе путь. 'Дальше не пройти, путник. {enemy} из {location} перекрыли тракт. Убей хотя бы {count} из этих тварей, иначе караваны не двинутся с места. Докажи свою силу.'",
        customTurnIn: "Стражник уважительно кивает. 'Твои руки покрыты кровью врагов. Путь в {nextCity} чист. Ступай, там тебя ждут новые испытания.'"
    },

    // === ЭТАП 2: Третий город ===
    {
        index: 2,
        forcedType: 'DIGGER',
        customBriefing: "Торговец из {city} шепчет тебе на ухо: 'Слушай сюда... В {location} на глубине {depth} есть древние залежи. Спустись туда. Если вернешься живым, я укажу тебе тайную тропу к {nextCity}.'",
        customTurnIn: "Торговец ухмыляется, разглядывая твои трофеи. 'Ты не так прост, странник. Держи, вот карта, которая ведет в {nextCity}. Тебе она понадобится.'"
    },

    // === ЭТАП 3: Четвертый город ===
    {
        index: 3,
        forcedType: 'COLLECT',
        customBriefing: "Алхимик {city} в отчаянии. 'Для ритуала защиты от тьмы {nextCity} мне нужно {count} шт. {item}. Ищи их в {location}. От этого зависит жизнь тысяч людей!'",
        customTurnIn: "Алхимик с трепетом берет ингредиенты. 'Ты сделал невозможное. Ритуал состоится. Беги в {nextCity}, пока не стало слишком поздно!'"
    },

    // === ЭТАП 4: Пятый город (Финал или предфинал) ===
    {
        index: 4,
        forcedType: 'EXPLORE',
        customBriefing: "Магистр ордена {city} смотрит тебе в глаза. 'Пророчество гласит: лишь тот, кто спустится в {location} и выживет, сможет остановить конец света. Спустись на глубину {depth}. Твой путь лежит в {nextCity} — к финальной битве.'",
        customTurnIn: "Магистр кладет руку тебе на плечо. 'Твои карты и заметки бесценны. Тайна {nextCity} раскрыта. Иди же, легенда. Судьба миров в твоих руках!'"
    }
    
    // Если цепочка сгенерируется длиннее (например, 6 городов), 
    // для 6-го города (index: 5) автоматически подставится случайный шаблон из quest_chain.js
];
 
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
        'P': { file: 'item_sprites', x: 5,  y: 1 }, // Топор
        ')': { file: 'item_sprites', x: 8,  y: 1 }, // Булава
        '*': { file: 'item_sprites', x: 0,  y: 1 }, // Кинжал
        'Y': { file: 'item_sprites', x: 7,  y: 1 }, // Копье
        '(': { file: 'item_sprites', x: 9,  y: 0 }, // Лук
        '=': { file: 'item_sprites', x: 9,  y: 1 }, // Арбалет
        '|': { file: 'item_sprites', x: 2,  y: 3 }, // Посох
        ']': { file: 'item_sprites', x: 0,  y: 2 }, // Кожа
        '[': { file: 'item_sprites', x: 1,  y: 2 }, // Кольчуга
        '}': { file: 'item_sprites', x: 8, y: 2 }, // Щит
        '"': { file: 'item_sprites', x: 3, y: 2 }, // Наголенники
        '{': { file: 'item_sprites', x: 12, y: 3 }, // Плащ
        'H': { file: 'item_sprites', x: 5, y: 2 }, // Шлем
        'v': { file: 'item_sprites', x: 10, y: 2 }, // Перчатки
        '!': { file: 'item_sprites', x: 1, y: 4 }, // Зелье
        '+': { file: 'item_sprites', x: 16, y: 4 }, // Эликсир
        '%': { file: 'item_sprites', x: 6, y: 3 }, // Еда
        '~': { file: 'item_sprites', x: 7, y: 3 }, // Мясо
        '?': { file: 'item_sprites', x: 3, y: 4 }, // ITEM_BOOK
        '$': { file: 'item_sprites', x: 13, y: 3 },  // Золото
        '&': { file: 'item_sprites', x: 0, y: 4 },
        '8': { file: 'terrain_sprites', x: 18, y: 0 } // Кровать
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
 
