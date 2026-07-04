/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js) - С РАЗДЕЛЕНИЕМ СТРОЯ
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
                
                // 1. Определяем базовое действие по тактике
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

                    case 'retreat':
                        if (unit.x > 2) action = { unitId: unit.id, type: 'move', x: unit.x - 1, y: unit.y, unit: unit };
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

                // 2. Если действие найдено, применяем коррекцию строя
                if (action) {
                    if (action.type === 'move') {
                        // Применяем разделение, чтобы юниты не слипались
                        const separatedPos = applySeparation(unit, squad, action.x, action.y, arena, enemyUnits);
                        action.x = separatedPos.x;
                        action.y = separatedPos.y;
                    }
                    actions.push(action);
                }
            });
        });

        return actions;
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

            // Штраф за отклонение от оригинальной цели (чтобы не убегали слишком далеко)
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
