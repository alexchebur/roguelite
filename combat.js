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

    // === ИСПОЛЬЗОВАНИЕ ПРЕДМЕТА (ОБНОВЛЕННОЕ С УЧЕТОМ БОНУСОВ И ТЕЛЕПОРТАЦИЕЙ) ===
    function useItem(player, index, logFn, updateUiFn) {
        const item = player.inventory[index];
        if (!item) return;

        let used = false;

        // 1. Лечение
        if (item.effect === "heal") {
            player.hp = Math.min(player.maxHp, player.hp + item.val);
            logFn(`Вы использовали ${item.name}. HP +${item.val}.`, "loot");
            used = true;
        } 
        // 2. Зелья силы (теперь добавляют в bonusAtk)
        else if (item.effect === "buff_atk") {
            player.bonusAtk += item.val;
            
            // Пересчитываем итоговую атаку
            const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
            player.atk = baseAtk + player.bonusAtk;
            
            logFn(`Вы выпили ${item.name}. Сила +${item.val}.`, "loot");
            used = true;
        }
// В combat.js, внутри функции useItem, в блоках экипировки:

        // 3. Экипировка Оружия
        else if (item.type === "weapon") {
            if (player.equipment.weapon) {
                player.bonusAtk -= player.equipment.weapon.isUnique ? player.equipment.weapon.uniqueAtk : player.equipment.weapon.val;
                player.inventory.push(player.equipment.weapon); 
            }
            
            player.equipment.weapon = item;
            // ИСПРАВЛЕНИЕ: используем уникальный стат, если он есть
            const atkBonus = item.isUnique ? item.uniqueAtk : item.val;
            player.bonusAtk += atkBonus;
            
            if (item.maxAmmo > 0 && item.currentAmmo === 0) {
                item.currentAmmo = item.maxAmmo;
            }
            
            const baseAtk = WorldCurveModule.getPlayerBaseAtk(player.level);
            player.atk = baseAtk + player.bonusAtk;
            if (player.atk < 1) player.atk = 1;
            
            logFn(`Вы взяли в руки ${item.name}. Атака +${atkBonus}.`, "loot");
            used = true;
        } 
        // 4. Экипировка Брони
        else if (item.type === "armor") {
            if (player.equipment.armor) {
                player.bonusDef -= player.equipment.armor.isUnique ? player.equipment.armor.uniqueDef : player.equipment.armor.val;
                player.inventory.push(player.equipment.armor);
            }
            
            player.equipment.armor = item;
            // ИСПРАВЛЕНИЕ: используем уникальный стат, если он есть
            const defBonus = item.isUnique ? item.uniqueDef : item.val;
            player.bonusDef += defBonus;
            
            const baseDef = WorldCurveModule.getPlayerBaseDef(player.level);
            player.def = baseDef + player.bonusDef;
            if (player.def < 0) player.def = 0;
             
            logFn(`Вы надели ${item.name}. Защита +${defBonus}.`, "loot");
            used = true;
        }
        // 5. === НОВОЕ: Свиток телепортации ===
        else if (item.effect === "teleport_exit") {
            // Проверяем, доступен ли модуль игры и функция выхода
            if (typeof GameModule !== 'undefined' && typeof GameModule.exitToGlobal === 'function') {
                logFn(`Вы разломали ${item.name} и вспышка света перенесла вас на поверхность!`, "event");
                used = true;
                
                // Вызываем выход из подземелья
                GameModule.exitToGlobal();
            } else {
                logFn(`Здесь нельзя использовать свиток телепортации.`, "info");
            }
        }

        if (used) {
            // Удаляем использованный/экипированный предмет из инвентаря
            player.inventory.splice(index, 1);
            
            // Обновляем UI
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
