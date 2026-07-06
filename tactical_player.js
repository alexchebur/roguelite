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

        // Группируем юнитов по отрядам для сохранения формации внутри группы
        const squads = {};
        playerArmy.forEach(u => {
            if (!squads[u.squadId]) squads[u.squadId] = [];
            squads[u.squadId].push(u);
        });

        Object.values(squads).forEach(squad => {
            squad.forEach(unit => {
                let action = null;

                // === ЛОГИКА ПОБЕГА (FLEE) ===
                if (tacticId === 'flee') {
                    // Цель: левый край экрана (x = 0)
                    if (unit.x > 0) {
                        // Пытаемся найти любой свободный шаг влево/вверх/вниз
                        action = getRetreatMove(unit, squad, enemyUnits, playerUnit, arena);
                        if (!action) action = { unitId: unit.id, type: 'wait', unit: unit };
                    } else {
                        // Если достигли левого края (x=0), юнит исчезает
                        action = { unitId: unit.id, type: 'remove', unit: unit };
                    }
                } 
                // === ЛОГИКА ОТСТУПЛЕНИЯ (RETREAT) ===
                else if (tacticId === 'retreat') {
                    // 1. Проверяем наличие врага вплотную для контратаки
                    const nearestEnemy = findNearestEnemy(unit, enemyUnits);
                    const distToEnemy = nearestEnemy ? getDistance(unit, nearestEnemy) : Infinity;

                    if (distToEnemy === 1) {
                        // Враг рядом -> Атакуем!
                        action = { unitId: unit.id, type: 'attack', target: nearestEnemy, unit: unit };
                    } else {
                        // 2. Если врага нет рядом, отступаем влево
                        if (unit.x > 2) {
                            action = getRetreatMove(unit, squad, enemyUnits, playerUnit, arena);
                            if (!action) action = { unitId: unit.id, type: 'wait', unit: unit };
                        } else {
                            // Если уже в безопасной зоне (x <= 2), стоим на месте
                            action = { unitId: unit.id, type: 'wait', unit: unit };
                        }
                    }
                }
                // === ОСТАЛЬНЫЕ ТАКТИКИ (Advance, Ranged, Hold) ===
                else {
                    switch (tacticId) {
                        case 'advance':
                            const targetAdv = findNearestEnemy(unit, enemyUnits);
                            if (targetAdv) action = getMoveOrAttackAction(unit, targetAdv, arena, enemyUnits);
                            break;
                        case 'ranged':
                            if (unit.type === 'range') {
                                const targetRng = findNearestEnemy(unit, enemyUnits);
                                if (targetRng && getDistance(unit, targetRng) <= unit.range) {
                                    action = { unitId: unit.id, type: 'attack', target: targetRng, unit: unit };
                                } else if (targetRng) {
                                    action = getMoveOrAttackAction(unit, targetRng, arena, enemyUnits);
                                }
                            } else {
                                const targetMelee = findNearestEnemy(unit, enemyUnits);
                                if (targetMelee) action = getMoveOrAttackAction(unit, targetMelee, arena, enemyUnits);
                            }
                            break;
                        case 'hold':
                            const targetHold = findNearestEnemy(unit, enemyUnits);
                            if (targetHold) {
                                const dist = getDistance(unit, targetHold);
                                if ((unit.type === 'range' && dist <= unit.range) || dist === 1) {
                                    action = { unitId: unit.id, type: 'attack', target: targetHold, unit: unit };
                                }
                            }
                            break;
                    }
                }

                // 3. Применяем действие
                if (action) {
                    // Для движения применяем коррекцию строя (чтобы не слипались)
                    if (action.type === 'move') {
                        const separatedPos = applySeparation(unit, squad, action.x, action.y, arena, enemyUnits);
                        action.x = separatedPos.x;
                        action.y = separatedPos.y;
                        
                        // Если после коррекции координаты не изменились (заблокировано), меняем тип на wait
                        if (action.x === unit.x && action.y === unit.y) {
                            action.type = 'wait';
                        }
                    }
                    actions.push(action);
                }
            });
        });

        return actions;
    }

    /**
     * Поиск безопасного шага при отступлении (влево, но можно вверх/вниз если занято)
     */
    function getRetreatMove(unit, squad, enemies, playerUnit, arena) {
        // Приоритетные направления: влево, затем вверх-влево, вниз-влево, просто вверх/вниз
        const candidates = [
            { x: unit.x - 1, y: unit.y },     // Влево
            { x: unit.x - 1, y: unit.y - 1 }, // Влево-Вверх
            { x: unit.x - 1, y: unit.y + 1 }, // Влево-Вниз
            { x: unit.x, y: unit.y - 1 },     // Вверх
            { x: unit.x, y: unit.y + 1 }      // Вниз
        ];

        for (const pos of candidates) {
            // Проверка границ
            if (pos.x < 0 || pos.x >= arena.width || pos.y < 0 || pos.y >= arena.height) continue;
            
            // Проверка занятости врагами
            const isEnemyThere = enemies.some(e => e.hp > 0 && e.x === pos.x && e.y === pos.y);
            if (isEnemyThere) continue;

            // Проверка занятости игроком
            if (playerUnit && playerUnit.hp > 0 && playerUnit.x === pos.x && playerUnit.y === pos.y) continue;

            // Проверка занятости своими (из этого же отряда)
            const isAllyThere = squad.some(a => a !== unit && a.hp > 0 && a.x === pos.x && a.y === pos.y);
            if (isAllyThere) continue;

            // Нашли свободное место!
            return { unitId: unit.id, type: 'move', x: pos.x, y: pos.y, unit: unit };
        }

        return null; // Нет доступных ходов
    }

    /**
     * Корректирует целевую позицию, чтобы юнит не подходил слишком близко к своим
     */
    function applySeparation(me, squad, targetX, targetY, arena, enemies) {
        let bestX = targetX;
        let bestY = targetY;
        let minScore = Infinity;

        // Проверяем целевую клетку и её соседей (радиус 1)
        const candidates = [
            { x: targetX, y: targetY },
            { x: targetX + 1, y: targetY }, { x: targetX - 1, y: targetY },
            { x: targetX, y: targetY + 1 }, { x: targetX, y: targetY - 1 }
        ];

        for (const pos of candidates) {
            // Проверка границ
            if (pos.x < 0 || pos.x >= arena.width || pos.y < 0 || pos.y >= arena.height) continue;
            
            // Проверка занятости врагами
            const isEnemyThere = enemies.some(e => e.hp > 0 && e.x === pos.x && e.y === pos.y);
            if (isEnemyThere) continue;
            
            // Проверка занятости своими (кроме меня самого)
            const isAllyThere = squad.some(a => a !== me && a.hp > 0 && a.x === pos.x && a.y === pos.y);
            if (isAllyThere) continue;
            
            // Расчет оценки: чем дальше от других союзников, тем лучше
            let separationScore = 0;
            squad.forEach(ally => {
                if (ally !== me && ally.hp > 0) {
                    const d = Math.abs(pos.x - ally.x) + Math.abs(pos.y - ally.y);
                    if (d < 2) separationScore += (2 - d) * 10; // Сильный штраф за близость
                }
            });
            
            // Штраф за отклонение от оригинальной цели (чтобы не убегали слишком далеко в стороны)
            const deviation = Math.abs(pos.x - targetX) + Math.abs(pos.y - targetY);
            const totalScore = separationScore + deviation;
            
            if (totalScore < minScore) {
                minScore = totalScore;
                bestX = pos.x;
                bestY = pos.y;
            }
        }
        return { x: bestX, y: bestY };
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
            return { unitId: unit.id, type: 'attack', target: target, unit: unit };
        }
        
        // Простое движение к цели
        const dx = Math.sign(target.x - unit.x);
        const dy = Math.sign(target.y - unit.y);
        let nx = unit.x + dx;
        let ny = unit.y + dy;
        
        if (nx >= 0 && nx < arena.width && ny >= 0 && ny < arena.height) {
             return { unitId: unit.id, type: 'move', x: nx, y: ny, unit: unit };
        }
        return { unitId: unit.id, type: 'wait', unit: unit };
    }

    return {
        processPlayerTactic: processPlayerTactic
    };
})();
