/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js) - С ПОЛНОЙ ЛОГИКОЙ ОТСТУПЛЕНИЯ
 */
const TacticalPlayerModule = (function() {
    'use strict';

    /**
     * Обработка тактики игрока и генерация действий для его армии
     */
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
                if (unit.hp <= 0) return; // Пропускаем мертвых

                let action = null;
                const nearestEnemy = findNearestEnemy(unit, enemyUnits);
                const distToEnemy = nearestEnemy ? getDistance(unit, nearestEnemy) : Infinity;
                
                // Определяем тип юнита (melee или range)
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
                    // Если враг вплотную — бьемся насмерть
                    if (distToEnemy === 1) {
                        action = { type: 'attack', target: nearestEnemy, unit: unit };
                    } 
                    // Если есть безопасная зона (x > 2), отходим туда
                    else if (unit.x > 2) {
                        action = getRetreatMove(unit, squad, enemyUnits, playerUnit, arena, false);
                        if (!action) action = { type: 'wait', unit: unit };
                    } 
                    // Если прижаты к стене (x <= 2), стоим и ждем
                    else {
                        action = { type: 'wait', unit: unit };
                    }
                }
                // === 3. ОСТАЛЬНЫЕ ТАКТИКИ ===
                else {
                    switch (tacticId) {
                        case 'advance':
                            // Агрессивное наступление на ближайшего врага
                            if (nearestEnemy) {
                                action = getMoveOrAttackAction(unit, nearestEnemy, arena, enemyUnits);
                            }
                            break;

                        case 'ranged':
                            // Приоритет дистанционной атаки
                            if (nearestEnemy) {
                                if (isRanged && distToEnemy <= attackRange) {
                                    // Стреляем, не двигаясь
                                    action = { type: 'attack', target: nearestEnemy, unit: unit };
                                } else {
                                    // Если не можем стрелять (или это милишник), идем к врагу
                                    action = getMoveOrAttackAction(unit, nearestEnemy, arena, enemyUnits);
                                }
                            }
                            break;

                        case 'hold':
                            // Оборона: стреляем/бьем только если враг в досягаемости, иначе стоим
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

                // Пост-обработка действия
                if (action) {
                    // Применяем разделение строя только для движений, чтобы юниты не слипались
                    if (action.type === 'move') {
                        const separatedPos = applySeparation(unit, squad, action.x, action.y, arena, enemyUnits);
                        action.x = separatedPos.x;
                        action.y = separatedPos.y;
                        
                        // Если после разделения координаты не изменились, отменяем движение
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
