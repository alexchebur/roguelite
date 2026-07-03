/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js)
 */
const TacticalPlayerModule = (function() {
    'use strict';

    /**
     * Генерирует приказы для армии игрока на основе текущей тактики
     */
    function processPlayerTactic(tacticId, playerArmy, playerUnit, enemyUnits, arena) {
        const actions = [];
        if (!playerArmy || playerArmy.length === 0) return actions;

        switch (tacticId) {
            case 'advance': // Наступать
                playerArmy.forEach(unit => {
                    const target = findNearestEnemy(unit, enemyUnits);
                    if (target) {
                        actions.push(getMoveOrAttackAction(unit, target, arena, enemyUnits));
                    }
                });
                break;

            case 'ranged': // Дистанционная атака (Лучники стреляют, остальные ждут/идут медленно)
                playerArmy.forEach(unit => {
                    if (unit.type === 'range') {
                        const target = findNearestEnemy(unit, enemyUnits);
                        if (target && getDistance(unit, target) <= unit.range) {
                            actions.push({ unitId: unit.id, type: 'attack', target: target });
                        } else if (target) {
                            // Подойти поближе
                             actions.push(getMoveOrAttackAction(unit, target, arena, enemyUnits));
                        }
                    } else {
                        // Мили юниты просто идут вперед медленно или держат строй
                        // Пока пусть просто идут к ближайшему врагу
                         const target = findNearestEnemy(unit, enemyUnits);
                         if (target) actions.push(getMoveOrAttackAction(unit, target, arena, enemyUnits));
                    }
                });
                break;

            case 'retreat': // Отступать (к левому краю)
                playerArmy.forEach(unit => {
                    // Цель: x = 0
                    if (unit.x > 1) {
                         actions.push({ unitId: unit.id, type: 'move', x: unit.x - 1, y: unit.y });
                    }
                });
                break;

            case 'hold': // Держать позиции
                playerArmy.forEach(unit => {
                    const target = findNearestEnemy(unit, enemyUnits);
                    // Если враг в радиусе атаки (для лучников) или вплотную (для мили) - атакуем
                    if (unit.type === 'range' && target && getDistance(unit, target) <= unit.range) {
                        actions.push({ unitId: unit.id, type: 'attack', target: target });
                    } else if (target && getDistance(unit, target) === 1) {
                        actions.push({ unitId: unit.id, type: 'attack', target: target });
                    }
                    // Иначе стоим
                });
                break;
            
            case 'flee':
                // Обрабатывается в game.js как конец боя
                break;
        }

        return actions;
    }

    function findNearestEnemy(me, enemies) {
        let nearest = null;
        let minDist = Infinity;
        enemies.forEach(e => {
            if (e.hp > 0) {
                const d = Math.abs(me.x - e.x) + Math.abs(me.y - e.y);
                if (d < minDist) {
                    minDist = d;
                    nearest = e;
                }
            }
        });
        return nearest;
    }

    function getDistance(u1, u2) {
        return Math.abs(u1.x - u2.x) + Math.abs(u1.y - u2.y);
    }

    function getMoveOrAttackAction(unit, target, arena, enemies) {
        const dist = getDistance(unit, target);
        if (dist === 1) {
            return { unitId: unit.id, type: 'attack', target: target };
        }
        
        // Простое движение к цели
        const dx = Math.sign(target.x - unit.x);
        const dy = Math.sign(target.y - unit.y);
        
        // Пробуем пойти по диагонали или прямой
        let nx = unit.x + dx;
        let ny = unit.y + dy;
        
        // Проверка границ и занятости (очень упрощенно)
        if (nx >= 0 && nx < arena.width && ny >= 0 && ny < arena.height) {
             // Тут должна быть проверка коллизий с друзьями, но для прототипа опустим
             return { unitId: unit.id, type: 'move', x: nx, y: ny };
        }
        
        return { unitId: unit.id, type: 'wait' };
    }

    return {
        processPlayerTactic: processPlayerTactic
    };
})();
