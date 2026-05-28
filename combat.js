// =========================== Модуль боя и использования предметов ===========================
const CombatModule = (function() {
    function attack(attacker, defender, logFn) {
        let dmg = Math.max(1, attacker.atk - defender.def);
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        defender.hp -= dmg;
        logFn(`${attacker.name || "Вы"} бьет ${defender.name || "врага"} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (defender.hp <= 0) {
            logFn(`${defender.name || "Враг"} погибает!`, "info");
            return true;
        }
        return false;
    }

        function rangedAttack(player, target, weapon, logFn, updateUiFn) {
        if (!weapon || weapon.meleeType) return false; // Не подходит для дальнего боя

        if (weapon.currentAmmo <= 0) {
            logFn(`Нет боеприпасов для ${weapon.name}!`, "combat");
            return false;
        }

        const dist = Math.abs(player.x - target.x) + Math.abs(player.y - target.y);
        if (dist > weapon.range) {
            logFn(`${target.name} слишком далеко для ${weapon.name} (макс. ${weapon.range})!`, "combat");
            return false;
        }

        // Расход боеприпаса
        weapon.currentAmmo--;

        // Расчет урона
        let dmg = Math.max(1, player.atk - target.def); 
        // Можно добавить бонус от самого оружия, если нужно: dmg += weapon.val;
        
        let crit = Math.random() < 0.1;
        if (crit) dmg = Math.floor(dmg * 1.5);

        target.hp -= dmg;
        logFn(`Вы стреляете в ${target.name} из ${weapon.name} на ${dmg}${crit ? " (КРИТ)!" : "."}`, "combat");

        if (updateUiFn) updateUiFn(); // Обновить UI, чтобы показать новый боезапас

        if (target.hp <= 0) {
            logFn(`${target.name} погибает!`, "info");
            return true; // Убит
        }
        return false;
    }





    function useItem(player, index, logFn, updateUiFn) {
        const item = player.inventory[index];
        if (!item) return;

        let used = false;

        if (item.effect === "heal") {
            player.hp = Math.min(player.maxHp, player.hp + item.val);
            logFn(`Вы выпили ${item.name}. HP +${item.val}.`, "loot");
            used = true;
        } else if (item.effect === "buff_atk") {
            player.atk += item.val;
            logFn(`Вы выпили ${item.name}. Сила +${item.val}.`, "loot");
            used = true;
        } else if (item.type === "weapon") {
            if (player.equipment.weapon) {
                player.atk -= player.equipment.weapon.val;
                player.inventory.push(player.equipment.weapon);
            }
            player.equipment.weapon = item;
            player.atk += item.val;
            logFn(`Вы взяли ${item.name}. Атака +${item.val}.`, "loot");
            used = true;
        } else if (item.type === "armor") {
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
        useItem,
        rangedAttack // <--- ДОБАВИТЬ ЭКСПОРТ
    };

})();
