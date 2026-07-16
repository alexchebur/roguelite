/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js)
 */
const TacticalPlayerModule = (function() {
    'use strict';

    function processPlayerTactic(tacticId, playerArmy, playerUnit, enemyUnits, arena) {
        const actions = [];
        if (!playerArmy || playerArmy.length === 0) return actions;

        // Группируем юнитов по отрядам для сохранения строя
        const squads = {};
        playerArmy.forEach(u => {
            if (!squads[u.squadId]) squads[u.squadId] = [];
            squads[u.squadId].push(u);
        });

        Object.values(squads).forEach(squad => {
            squad.forEach(unit => {
                if (unit.hp <= 0) return;

                let action = null;
                const nearestEnemy = findNearestEnemy(unit, enemyUnits);
                const distToEnemy = nearestEnemy ? getDistance(unit, nearestEnemy) : Infinity;
                
                // Определяем тип юнита
                const isRanged = (unit.type && (unit.type === 'range' || unit.type.type === 'range'));
                const attackRange = unit.range || (isRanged ? 8 : 1);

                // === 1. ЛОГИКА ПОБЕГА (FLEE) ===
                if (tacticId === 'flee') {
                    // Если достигли левого края (x <= 1), исчезаем
                    if (unit.x <= 1) {
                        action = { type: 'remove', unit: unit };
                    } else {
                        // Иначе бежим влево
                        action = getRetreatMove(unit, squad, enemyUnits, playerUnit, arena, true);
                        if (!action) action = { type: 'wait', unit: unit };
                    }
                } 
                // === 2. ЛОГИКА ОТСТУПЛЕНИЯ (RETREAT) ===
                else if (tacticId === 'retreat') {
                    if (distToEnemy === 1) {
                        action = { type: 'attack', target: nearestEnemy, unit: unit };
                    } else if (unit.x > 2) {
                        action = getRetreatMove(unit, squad, enemyUnits, playerUnit, arena, false);
                        if (!action) action = { type: 'wait', unit: unit };
                    } else {
                        action = { type: 'wait', unit: unit };
                    }
                }
                // === 3. ОСТАЛЬНЫЕ ТАКТИКИ ===
                else {
                    switch (tacticId) {
                        case 'advance':
                            if (nearestEnemy) {
                                action = getMoveOrAttackAction(unit, nearestEnemy, arena, enemyUnits, playerUnit);
                            }
                            break;
                        case 'ranged':
                            if (nearestEnemy) {
                                if (isRanged && distToEnemy <= attackRange) {
                                    action = { type: 'attack', target: nearestEnemy, unit: unit };
                                } else {
                                    action = getMoveOrAttackAction(unit, nearestEnemy, arena, enemyUnits, playerUnit);
                                }
                            }
                            break;
                        case 'hold':
                            if (nearestEnemy) {
                                if (isRanged && distToEnemy <= attackRange) {
                                    action = { type: 'attack', target: nearestEnemy, unit: unit };
                                } else if (!isRanged && distToEnemy === 1) {
                                    action = { type: 'attack', target: nearestEnemy, unit: unit };
                                } else {
                                    action = { type: 'wait', unit: unit };
                                }
                            } else {
                                action = { type: 'wait', unit: unit };
                            }
                            break;
                        default:
                            action = { type: 'wait', unit: unit };
                    }
                }

                if (action) {
                    // Применяем разделение строя только для движений
                    if (action.type === 'move') {
                        const separatedPos = applySeparation(unit, squad, action.x, action.y, arena, enemyUnits, playerUnit);
                        action.x = separatedPos.x;
                        action.y = separatedPos.y;
                        if (action.x === unit.x && action.y === unit.y) action.type = 'wait';
                    }
                    actions.push(action);
                }
            });
        });

        return actions;
    }

    /**
     * Умный поиск клетки для отступления
     */
    function getRetreatMove(unit, squad, enemies, playerUnit, arena, isFleeing) {
        const candidates = [
            { x: unit.x - 1, y: unit.y },
            { x: unit.x - 1, y: unit.y - 1 },
            { x: unit.x - 1, y: unit.y + 1 },
            { x: unit.x, y: unit.y - 1 },
            { x: unit.x, y: unit.y + 1 }
        ];
        for (const pos of candidates) {
            if (pos.x < 0 || pos.x >= arena.width || pos.y < 0 || pos.y >= arena.height) continue;
            // Проверка врагов
            if (enemies.some(e => e.hp > 0 && e.x === pos.x && e.y === pos.y)) continue;
            // Проверка игрока (Героя)
            if (playerUnit && playerUnit.hp > 0 && playerUnit.x === pos.x && playerUnit.y === pos.y) continue;
            // Проверка своих
            if (squad.some(a => a !== unit && a.hp > 0 && a.x === pos.x && a.y === pos.y)) continue;
            return { type: 'move', x: pos.x, y: pos.y, unit: unit };
        }
        return null;
    }

    function applySeparation(me, squad, targetX, targetY, arena, enemies, playerUnit) {
        let bestX = targetX;
        let bestY = targetY;
        let minScore = Infinity;
        const candidates = [
            { x: targetX, y: targetY },
            { x: targetX + 1, y: targetY }, { x: targetX - 1, y: targetY },
            { x: targetX, y: targetY + 1 }, { x: targetX, y: targetY - 1 }
        ];
        for (const pos of candidates) {
            if (pos.x < 0 || pos.x >= arena.width || pos.y < 0 || pos.y >= arena.height) continue;
            if (enemies.some(e => e.hp > 0 && e.x === pos.x && e.y === pos.y)) continue;
            // Не встаем на героя
            if (playerUnit && playerUnit.hp > 0 && playerUnit.x === pos.x && playerUnit.y === pos.y) continue;
            // Не встаем на своих
            if (squad.some(a => a !== me && a.hp > 0 && a.x === pos.x && a.y === pos.y)) continue;
            
            let separationScore = 0;
            squad.forEach(ally => {
                if (ally !== me && ally.hp > 0) {
                    const d = Math.abs(pos.x - ally.x) + Math.abs(pos.y - ally.y);
                    if (d < 2) separationScore += (2 - d) * 10;
                }
            });
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
                if (d < minDist) { minDist = d; nearest = e; }
            }
        });
        return nearest;
    }

    function getDistance(u1, u2) {
        return Math.abs(u1.x - u2.x) + Math.abs(u1.y - u2.y);
    }

    function getMoveOrAttackAction(unit, target, arena, enemies, playerUnit) {
        const dist = getDistance(unit, target);
        if (dist === 1) return { type: 'attack', target: target, unit: unit };
        
        const dx = Math.sign(target.x - unit.x);
        const dy = Math.sign(target.y - unit.y);
        
        // Пробуем пойти по диагонали, потом по осям
        const moves = [
            { x: unit.x + dx, y: unit.y + dy },
            { x: unit.x + dx, y: unit.y },
            { x: unit.x, y: unit.y + dy }
        ];

        for (const move of moves) {
            if (move.x >= 0 && move.x < arena.width && move.y >= 0 && move.y < arena.height) {
                // Проверка на занятость клетки
                const isBlockedByEnemy = enemies.some(e => e.hp > 0 && e.x === move.x && e.y === move.y);
                const isBlockedByHero = playerUnit && playerUnit.hp > 0 && playerUnit.x === move.x && playerUnit.y === move.y;
                
                if (!isBlockedByEnemy && !isBlockedByHero) {
                     return { type: 'move', x: move.x, y: move.y, unit: unit };
                }
            }
        }
        return { type: 'wait', unit: unit };
    }

    return { processPlayerTactic: processPlayerTactic };
})();
window.TacticalPlayerModule = TacticalPlayerModule;
