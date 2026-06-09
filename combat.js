// =========================== Модуль боя и использования предметов ===========================
// =========================== Модуль боя и использования предметов ===========================
const CombatModule = (function() {
    
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ПРОВЕРКА ЛИНИИ ВИДИМОСТИ (LOS) ===
    // Проверяет, есть ли прямая видимость между (x1,y1) и (x2,y2) без стен
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

    // === ДИСТАНЦИОННАЯ АТАКА (ОБНОВЛЕННАЯ) ===
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
            // Вызываем обычную атаку с базовыми статами игрока (без бонуса оружия)
            // Для этого временно убираем бонус оружия, если он экипирован
            const savedAtk = player.atk;
            if (player.equipment.weapon === weapon) {
                player.atk -= weapon.val; // Убираем бонус оружия
            }
            
            const killed = attack(player, target, logFn);
            
            // Возвращаем бонус
            if (player.equipment.weapon === weapon) {
                player.atk = savedAtk;
            }
            
            if (updateUiFn) updateUiFn();
            return killed;
        }

        // 5. Проверка максимальной дальности (Требование 2: теперь проверяется против нового range из data.js)
        if (dist > weapon.range) {
            logFn(`${target.name} слишком далеко для ${weapon.name} (макс. ${weapon.range})!`, "combat");
            return false;
        }

        // 6. Проверка препятствий (Требование 3)
        if (!hasLineOfSight(player.x, player.y, target.x, target.y)) {
            logFn(`Препятствие мешает выстрелу в ${target.name}!`, "combat");
            return false;
        }

        // --- ЕСЛИ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: СТРЕЛЬБА ---
        
        weapon.currentAmmo--;
        
        // Расчет урона: База игрока + Сила оружия - Защита врага
        // Важно: здесь мы используем полный ATK игрока, который уже включает weapon.val
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

        // 7. АГРО (Требование 2)
        // При попадании враг "видит" игрока независимо от расстояния.
        // В текущей архитектуре moveEnemies проверяет dist < 8. 
        // Чтобы враг побежал за игроком после выстрела с 15 клеток, нам нужно 
        // либо увеличить глобальный радиус агро, либо пометить врага как "разбуженного".
        // Самый простой способ без переписывания AI - временно увеличить его радиус восприятия
        // или просто надеяться, что игрок подойдет ближе, пока враг идет.
        // Но чтобы выполнить требование "начинает двигаться", добавим флаг или просто увеличим радиус в game.js.
        // Пока оставим логику здесь, но учтем, что в game.js радиус жестко задан.
        // *Хак*: Можно добавить свойство target.aggroRange = 20, и проверить его в moveEnemies.
        target.aggroOverride = 20; // Помечаем врага, что он разозлен

        if (target.hp <= 0) {
            logFn(`${target.name} погибает от выстрела!`, "info");
            return true;
        }
        return false;
    }

    // ... (остальной код dropLoot и useItem остается без изменений) ...

    // ... (остальной код combat.js без изменений) ...

    // === ВЫПАДЕНИЕ ЛУТА ===
    // Исправленная сигнатура: (enemy, player, depth, itemsArray, logFn)
    // === ВЫПАДЕНИЕ ЛУТА ===
    // Сигнатура: (enemy, depth, itemsArray, logFn)
    function dropLoot(enemy, depth, itemsArray, logFn) {
        if (!enemy.lootType) return;

        // Шанс выпадения 40%
        if (Math.random() > 0.4) return;

        let droppedItem = null;
        
        // Инициализируем генератор
        const rng = new Math.seedrandom(`loot_${enemy.x}_${enemy.y}_${Date.now()}`);
        
        // ✅ ИСПРАВЛЕНИЕ: создаем свою функцию выбора из массива, 
        // так как seedrandom не имеет встроенного .choice()
        const choice = (array) => array[Math.floor(rng() * array.length)];

        if (enemy.lootType === 'gold') {
            // Золото: количество растет с глубиной
            const baseGold = 5 + Math.floor(depth * 2.5);
            // Используем rng() вместо Math.random() для консистентности
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
            // Еда
            const foods = DataModule.ITEM_TYPES.filter(i => i.type === 'food');
            if (foods.length > 0) {
                const template = choice(foods); // ✅ Теперь работает корректно
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, 1.0);
            }
        } 
        else if (enemy.lootType === 'weapon') {
            // Оружие/Броня
            const equips = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
            if (equips.length > 0) {
                const template = choice(equips); // ✅ Теперь работает корректно
                // Множитель силы зависит от глубины
                const powerMult = 1.0 + (depth * 0.15); 
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, powerMult);
            }
        }

        if (droppedItem) {
            itemsArray.push(droppedItem);
            logFn(`${enemy.name} оставил после себя: ${droppedItem.name}`, "loot");
        }
    }

    function useItem(player, index, logFn, updateUiFn) {
        const item = player.inventory[index];
        if (!item) return;

        let used = false;

        if (item.effect === "heal") {
            player.hp = Math.min(player.maxHp, player.hp + item.val);
            logFn(`Вы использовали ${item.name}. HP +${item.val}.`, "loot");
            used = true;
        } 
        else if (item.effect === "buff_atk") {
            // Зелья дают временный бонус, который накапливается в текущем значении
            player.atk += item.val;
            logFn(`Вы выпили ${item.name}. Сила +${item.val}.`, "loot");
            used = true;
        }
        else if (item.type === "weapon") {
            // 1. Снимаем старое оружие, если оно есть
            if (player.equipment.weapon) {
                // Важно: вычитаем именно то значение, которое было прибавлено
                player.atk -= player.equipment.weapon.val;
                // Возвращаем старое оружие в инвентарь
                player.inventory.push(player.equipment.weapon);
            }
            
            // 2. Надеваем новое оружие
            player.equipment.weapon = item;
            player.atk += item.val;
            
            // Логика боеприпасов
            if (item.maxAmmo > 0 && item.currentAmmo === 0) {
                item.currentAmmo = item.maxAmmo;
            }
            
            logFn(`Вы взяли в руки ${item.name}. Атака +${item.val}.`, "loot");
            used = true;
        } 
        else if (item.type === "armor") {
            // 1. Снимаем старую броню
            if (player.equipment.armor) {
                player.def -= player.equipment.armor.val;
                player.inventory.push(player.equipment.armor);
            }
            
            // 2. Надеваем новую броню
            player.equipment.armor = item;
            player.def += item.val;
            
            logFn(`Вы надели ${item.name}. Защита +${item.val}.`, "loot");
            used = true;
        }

        if (used) {
            // Удаляем использованный/экипированный предмет из инвентаря
            player.inventory.splice(index, 1);
            
            // === ЗАЩИТА ОТ ОТРИЦАТЕЛЬНЫХ СТАТОВ ===
            // Минимальная атака и защита не могут быть меньше 0 (или 1 для атаки)
            if (player.atk < 1) player.atk = 1;
            if (player.def < 0) player.def = 0;
            
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
