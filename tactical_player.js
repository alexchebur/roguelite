/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js) - С УЛУЧШЕННЫМ ОТСТУПЛЕНИЕМ
 */
const TacticalPlayerModule = (function() {
    'use strict';

    /**
     * Генерирует приказы для армии игрока
     */
    function processPlayerTactic(tacticId, playerArmy, playerUnit, enemyUnits, arena) {
        const actions = [];
        if (!playerArmy || playerArmy.length === 0) return actions;

        // Находим ближайшего врага для всей армии (общая цель)
        let globalTarget = null;
        let minDistToEnemy = Infinity;
        enemyUnits.forEach(e => {
            if (e.hp > 0) {
                const d = Math.abs(playerUnit.x - e.x) + Math.abs(playerUnit.y - e.y);
                if (d < minDistToEnemy) {
                    minDistToEnemy = d;
                    globalTarget = e;
                }
            }
        });

        playerArmy.forEach(unit => {
            let action = null;
            
            // Определяем "Идеальную Позицию" (Tactical Target) в зависимости от тактики и роли
            let tx = unit.x;
            let ty = unit.y;

            if (globalTarget) {
                if (tacticId === 'advance') {
                    // НАСТУПЛЕНИЕ: Все идут к врагу
                    tx = globalTarget.x;
                    ty = globalTarget.y;
                } 
                else if (tacticId === 'retreat') {
                    // ОТСТУПЛЕНИЕ: 
                    // Цель: левый край карты (x = 2), но с учетом позиции других
                    const retreatX = 2;
                    
                    // Лучники хотят быть ЗА линией фронта (если есть melee союзники)
                    let frontLineX = arena.width; 
                    playerArmy.forEach(ally => {
                        if (ally.type === 'melee' && ally.hp > 0 && ally.x < frontLineX && ally !== unit) {
                            frontLineX = ally.x;
                        }
                    });

                    if (unit.type === 'range') {
                        // Лучники стремятся к x=2, но держатся за спинами melee (frontLineX - 2)
                        tx = Math.min(retreatX, frontLineX - 2); 
                    } else {
                        // Melee прикрывают отход, стоят чуть правее лучников
                        tx = Math.max(frontLineX - 1, retreatX + 2);
                    }
                    ty = unit.y; // Сохраняем Y
                }
                else if (tacticId === 'hold') {
                    // ДЕРЖАТЬ ПОЗИЦИИ: Стоим на месте
                    tx = unit.x;
                    ty = unit.y;
                }
                else if (tacticId === 'ranged') {
                    // ДИСТАНЦИОННАЯ АТАКА:
                    if (unit.type === 'range') {
                        const dist = Math.abs(unit.x - globalTarget.x) + Math.abs(unit.y - globalTarget.y);
                        if (dist > unit.range) {
                            tx = globalTarget.x;
                            ty = globalTarget.y;
                        } else {
                            tx = unit.x;
                            ty = unit.y;
                        }
                    } else {
                        // Melee защищают лучников
                        tx = globalTarget.x;
                        ty = globalTarget.y;
                    }
                }
            } else {
                // Нет врагов - стоим
                tx = unit.x;
                ty = unit.y;
            }

            // Генерируем действие движения к тактической точке
            action = getMoveActionWithSpeed(unit, tx, ty, arena, enemyUnits, playerArmy);
            
            // Если движение невозможно или не нужно, проверяем атаку
            // ВАЖНО: При отступлении мы тоже можем атаковать, если враг блокирует путь или стоит рядом!
            if (!action || action.type === 'wait') {
                const nearestEnemy = findNearestEnemy(unit, enemyUnits);
                if (nearestEnemy) {
                    const dist = Math.abs(unit.x - nearestEnemy.x) + Math.abs(unit.y - nearestEnemy.y);
                    // Атакуем, если:
                    // 1. Это мили и враг вплотную
                    // 2. Это лучник и враг в радиусе
                    if ((unit.type !== 'range' && dist === 1) || (unit.type === 'range' && dist <= unit.range)) {
                        action = { unitId: unit.id, type: 'attack', target: nearestEnemy, unit: unit };
                    }
                }
            }

            if (action) actions.push(action);
        });

        return actions;
    }

    /**
     * Расчет движения с учетом скорости и избегания столкновений
     */
    function getMoveActionWithSpeed(unit, targetX, targetY, arena, enemies, friends) {
        // 1. Проверка: достигли ли цели?
        if (unit.x === targetX && unit.y === targetY) return { unitId: unit.id, type: 'wait', unit: unit };

        // 2. Расчет шага
        const dx = Math.sign(targetX - unit.x);
        const dy = Math.sign(targetY - unit.y);

        // Попытка пойти по диагонали/прямой
        let nx = unit.x + dx;
        let ny = unit.y + dy;

        // Проверка границ
        if (nx < 0 || nx >= arena.width || ny < 0 || ny >= arena.height) {
            return { unitId: unit.id, type: 'wait', unit: unit };
        }

        // 3. Проверка коллизий (враги и друзья)
        const isBlockedByEnemy = enemies.some(e => e.hp > 0 && e.x === nx && e.y === ny);
        const isBlockedByFriend = friends.some(f => f !== unit && f.hp > 0 && f.x === nx && f.y === ny);

        if (!isBlockedByEnemy && !isBlockedByFriend) {
            return { unitId: unit.id, type: 'move', x: nx, y: ny, unit: unit };
        }

        // Если заблокировано, пробуем обойти (простой алгоритм: попробовать только по X или только по Y)
        if (dx !== 0) {
            nx = unit.x + dx; ny = unit.y;
            if (isValidPos(nx, ny, arena, enemies, friends)) {
                 return { unitId: unit.id, type: 'move', x: nx, y: ny, unit: unit };
            }
        }
        if (dy !== 0) {
            nx = unit.x; ny = unit.y + dy;
            if (isValidPos(nx, ny, arena, enemies, friends)) {
                 return { unitId: unit.id, type: 'move', x: nx, y: ny, unit: unit };
            }
        }

        return { unitId: unit.id, type: 'wait', unit: unit };
    }

    function isValidPos(x, y, arena, enemies, friends) {
        if (x < 0 || x >= arena.width || y < 0 || y >= arena.height) return false;
        if (enemies.some(e => e.hp > 0 && e.x === x && e.y === y)) return false;
        if (friends.some(f => f.hp > 0 && f.x === x && f.y === y)) return false;
        return true;
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

    return {
        processPlayerTactic: processPlayerTactic
    };
})();
