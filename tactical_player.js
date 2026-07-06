/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js) - С ПОЛНОЙ ЛОГИКОЙ ОТСТУПЛЕНИЯ
 */
const TacticalPlayerModule = (function() {
    'use strict';

    function processPlayerTactic(tacticId, playerArmy, playerUnit, enemyUnits, arena) {
        const actions = [];
        if (!playerArmy || playerArmy.length === 0) return actions;

        // Группируем юнитов по отрядам
        const squads = {};
        playerArmy.forEach(u => {
            if (!squads[u.squadId]) squads[u.squadId] = [];
            squads[u.squadId].push(u);
        });

        Object.values(squads).forEach(squad => {
            squad.forEach(unit => {
                let action = null;

                // === 1. ЛОГИКА ПОБЕГА (FLEE) ===
                if (tacticId === 'flee') {
                    if (unit.x > 0) {
                        // Пытаемся отступить влево
                        action = getRetreatMove(unit, squad, enemyUnits, playerUnit, arena, true);
                        if (!action) action = { type: 'wait', unit: unit };
                    } else {
                        // Достигли левого края (x=0) -> Исчезаем
                        action = { type: 'remove', unit: unit };
                    }
                } 
                // === 2. ЛОГИКА ОТСТУПЛЕНИЯ (RETREAT) ===
                else if (tacticId === 'retreat') {
                    // Проверяем врага вплотную для контратаки
                    const nearestEnemy = findNearestEnemy(unit, enemyUnits);
                    const distToEnemy = nearestEnemy ? getDistance(unit, nearestEnemy) : Infinity;

                    if (distToEnemy === 1) {
                        action = { type: 'attack', target: nearestEnemy, unit: unit };
                    } else if (unit.x > 2) {
                        // Отходим к безопасной зоне (x=2)
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
                            const targetAdv = findNearestEnemy(unit, enemyUnits);
                            if (targetAdv) action = getMoveOrAttackAction(unit, targetAdv, arena, enemyUnits);
                            break;
                        case 'ranged':
                            if (unit.type === 'range' || unit.type.type === 'range') {
                                const targetRng = findNearestEnemy(unit, enemyUnits);
                                if (targetRng && getDistance(unit, targetRng) <= unit.range) {
                                    action = { type: 'attack', target: targetRng, unit: unit };
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
                                const range = unit.range || 1;
                                if ((unit.type === 'range' || unit.type.type === 'range') && dist <= range) {
                                    action = { type: 'attack', target: targetHold, unit: unit };
                                } else if (dist === 1) {
                                    action = { type: 'attack', target: targetHold, unit: unit };
                                }
                            }
                            break;
                    }
                }

                if (action) {
                    // Применяем разделение строя для движений
                    if (action.type === 'move') {
                        const separatedPos = applySeparation(unit, squad, action.x, action.y, arena, enemyUnits);
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
     * Умный поиск клетки для отступления (влево, но с обходом препятствий)
     */
    function getRetreatMove(unit, squad, enemies, playerUnit, arena, isFleeing) {
        // Приоритет: Влево, Влево-Вверх, Влево-Вниз, Вверх, Вниз
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
            // Проверка игрока
            if (playerUnit && playerUnit.hp > 0 && playerUnit.x === pos.x && playerUnit.y === pos.y) continue;
            // Проверка своих
            if (squad.some(a => a !== unit && a.hp > 0 && a.x === pos.x && a.y === pos.y)) continue;

            return { type: 'move', x: pos.x, y: pos.y, unit: unit };
        }
        return null;
    }

    function applySeparation(me, squad, targetX, targetY, arena, enemies) {
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

    function getMoveOrAttackAction(unit, target, arena, enemies) {
        const dist = getDistance(unit, target);
        if (dist === 1) return { type: 'attack', target: target, unit: unit };
        
        const dx = Math.sign(target.x - unit.x);
        const dy = Math.sign(target.y - unit.y);
        let nx = unit.x + dx;
        let ny = unit.y + dy;
        
        if (nx >= 0 && nx < arena.width && ny >= 0 && ny < arena.height) {
             return { type: 'move', x: nx, y: ny, unit: unit };
        }
        return { type: 'wait', unit: unit };
    }

    return { processPlayerTactic: processPlayerTactic };
})();
window.TacticalPlayerModule = TacticalPlayerModule;
