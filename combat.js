// =========================== Модуль боя, лута и использования предметов ===========================
const CombatModule = (function() {

    // === АТАКА БЛИЖНЕГО БОЯ ===
    function attack(attacker, defender, logFn) {
        let dmg = Math.max(1, attacker.atk - defender.def);
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        defender.hp -= dmg;
        
        const attackerName = attacker.name || "Вы";
        const defenderName = defender.name || "враг";
        const verb = attackerName === "Вы" ? "бьете" : "бьет";
        
        logFn(`${attackerName} ${verb} ${defenderName} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (defender.hp <= 0) {
            logFn(`${defenderName} погибает!`, "info");
            return true; // Цель убита
        }
        return false;
    }

    // === ДИСТАНЦИОННАЯ АТАКА ===
    function rangedAttack(player, target, weapon, logFn, updateUiFn) {
        // Проверка: это дальнобойное оружие?
        if (!weapon || weapon.meleeType !== false) return false;

        // Проверка боезапаса
        if (weapon.currentAmmo <= 0) {
            logFn(`Нет боеприпасов для ${weapon.name}!`, "combat");
            return false;
        }

        // Расчет расстояния (Манхэттенское расстояние)
        const dist = Math.abs(player.x - target.x) + Math.abs(player.y - target.y);
        
        if (dist > weapon.range) {
            logFn(`${target.name} слишком далеко для ${weapon.name} (макс. ${weapon.range})!`, "combat");
            return false;
        }

        // Расход боеприпаса
        weapon.currentAmmo--;

        // Расчет урона (база игрока + бонус оружия, если нужно, минус защита цели)
        // Здесь используем только атаку игрока, но можно добавить weapon.val
        let dmg = Math.max(1, player.atk - target.def); 
        
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        target.hp -= dmg;
        logFn(`Вы стреляете в ${target.name} из ${weapon.name} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        // Обновляем UI, чтобы показать изменившийся боезапас
        if (updateUiFn) updateUiFn();

        if (target.hp <= 0) {
            logFn(`${target.name} погибает от выстрела!`, "info");
            return true; // Убит
        }
        return false;
    }

    // === ВЫПАДЕНИЕ ЛУТА ===
    function dropLoot(enemy, depth, itemsArray, logFn) {
        if (!enemy.lootType) return;

        // Шанс выпадения 40%
        if (Math.random() > 0.4) return;

        let droppedItem = null;
        const rng = new Math.seedrandom(`loot_${Date.now()}_${Math.random()}`);

        if (enemy.lootType === 'gold') {
            // Золото: количество растет с глубиной
            const baseGold = 5 + Math.floor(depth * 2.5);
            const amount = Math.floor(baseGold * (0.8 + Math.random() * 0.4)); // разброс ±20%
            
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
            // Еда: выбираем случайный предмет типа food
            const foods = DataModule.ITEM_TYPES.filter(i => i.type === 'food');
            if (foods.length > 0) {
                const template = rng.choice(foods);
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, 1.0);
            }
        } 
        else if (enemy.lootType === 'weapon') {
            // Оружие или броня: сила зависит от глубины
            const equips = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
            if (equips.length > 0) {
                const template = rng.choice(equips);
                // Множитель силы предмета
                const powerMult = 1.0 + (depth * 0.15); 
                droppedItem = EntityModule.createItem(template, enemy.x, enemy.y, powerMult);
            }
        }

        if (droppedItem) {
            itemsArray.push(droppedItem);
            logFn(`${enemy.name} оставил после себя: ${droppedItem.name}`, "loot");
        }
    }

    // === ИСПОЛЬЗОВАНИЕ ПРЕДМЕТОВ ===
    function useItem(player, index, logFn, updateUiFn) {
        const item = player.inventory[index];
        if (!item) return;

        let used = false;

        // 1. Зелья и еда
        if (item.effect === "heal") {
            player.hp = Math.min(player.maxHp, player.hp + item.val);
            logFn(`Вы использовали ${item.name}. HP +${item.val}.`, "loot");
            used = true;
        } 
        else if (item.effect === "buff_atk") {
            player.atk += item.val;
            logFn(`Вы выпили ${item.name}. Сила +${item.val}.`, "loot");
            used = true;
        }
        // 2. Экипировка
        else if (item.type === "weapon") {
            // Снимаем текущее оружие, если есть
            if (player.equipment.weapon) {
                player.atk -= player.equipment.weapon.val;
                player.inventory.push(player.equipment.weapon);
            }
            // Надеваем новое
            player.equipment.weapon = item;
            player.atk += item.val;
            
            // Инициализация боезапаса при надевании (если он еще не задан)
            if (item.maxAmmo > 0 && item.currentAmmo === 0) {
                item.currentAmmo = item.maxAmmo;
            }
            
            logFn(`Вы взяли в руки ${item.name}. Атака +${item.val}.`, "loot");
            used = true;
        } 
        else if (item.type === "armor") {
            if (player.equipment.armor) {
                player.def -= player.equipment.armor.val;
                player.inventory.push(player.equipment.armor);
            }
            player.equipment.armor = item;
            player.def += item.val;
            logFn(`Вы надели ${item.name}. Защита +${item.val}.`, "loot");
            used = true;
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
