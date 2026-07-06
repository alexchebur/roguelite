/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js) - С ТАКТИКОЙ И СКОРОСТЬЮ
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
                // Используем игрока как центр внимания, если армия далеко
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
                    // НАСТУПЛЕНИЕ: Все идут к врагу, но melee стараются быть ближе
                    tx = globalTarget.x;
                    ty = globalTarget.y;
                } 
                else if (tacticId === 'retreat') {
                    // ОТСТУПЛЕНИЕ: 
                    // 1. Определяем самую левую точку фронта (минимальный X среди всех своих melee)
                    let frontLineX = arena.width; 
                    playerArmy.forEach(ally => {
                        if (ally.type === 'melee' && ally.hp > 0 && ally.x < frontLineX) {
                            frontLineX = ally.x;
                        }
                    });
                    
                    // Цель отступления: X = 2 (безопасная зона)
                    const retreatX = 2;

                    if (unit.type === 'range') {
                        // Лучники хотят быть ЗА линией фронта (X < frontLineX)
                        // Если фронт далеко, бежим к retreatX. Если фронт близко, держимся за ним.
                        tx = Math.min(retreatX, frontLineX - 2); 
                        ty = unit.y; // Сохраняем Y, чтобы не сбиваться в кучу по вертикали
                    } else {
                        // Melee прикрывают отход, стоят чуть правее лучников
                        tx = Math.max(frontLineX - 1, retreatX + 2);
                        ty = unit.y;
                    }
                }
                else if (tacticId === 'hold') {
                    // ДЕРЖАТЬ ПОЗИЦИИ: Стоим на месте, стреляем/бьем если достаем
                    tx = unit.x;
                    ty = unit.y;
                }
                else if (tacticId === 'ranged') {
                    // ДИСТАНЦИОННАЯ АТАКА:
                    if (unit.type === 'range') {
                        // Лучники ищут позицию на максимальной дистанции
                        const dist = Math.abs(unit.x - globalTarget.x) + Math.abs(unit.y - globalTarget.y);
                        if (dist > unit.range) {
                            tx = globalTarget.x;
                            ty = globalTarget.y;
                        } else {
                            // Уже в радиусе - стоим
                            tx = unit.x;
                            ty = unit.y;
                        }
                    } else {
                        // Melee защищают лучников, стоя между ними и врагом
                        tx = globalTarget.x;
                        ty = globalTarget.y;
                    }
                }
            } else {
                // Нет врагов - стоим или идем к центру
                tx = Math.floor(arena.width / 2);
                ty = Math.floor(arena.height / 2);
            }

            // Генерируем действие движения к тактической точке
            action = getMoveActionWithSpeed(unit, tx, ty, arena, enemyUnits, playerArmy);
            
            // Если движение невозможно или не нужно, проверяем атаку
            if (!action || action.type === 'wait') {
                const nearestEnemy = findNearestEnemy(unit, enemyUnits);
                if (nearestEnemy) {
                    const dist = Math.abs(unit.x - nearestEnemy.x) + Math.abs(unit.y - nearestEnemy.y);
                    if ((unit.type === 'range' && dist <= unit.range) || dist === 1) {
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
