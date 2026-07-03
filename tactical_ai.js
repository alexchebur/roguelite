/**
 * МОДУЛЬ ИСКУССТВЕННОГО ИНТЕЛЛЕКТА ВРАГА (tactical_ai.js) - ИСПРАВЛЕННЫЙ
 */
const TacticalAIModule = (function() {
    'use strict';

    function calculateArmyTurn(enemyUnits, playerUnit, playerArmy, arena) {
        const actions = []; 
        // Создаем набор занятых клеток на начало хода
        const occupiedCells = new Set();
        
        // Добавляем игрока и его армию как препятствия
        if (playerUnit && playerUnit.hp > 0) occupiedCells.add(`${playerUnit.x},${playerUnit.y}`);
        if (playerArmy) {
            playerArmy.forEach(p => {
                if (p.hp > 0) occupiedCells.add(`${p.x},${p.y}`);
            });
        }
        // Добавляем всех врагов как препятствия
        enemyUnits.forEach(u => {
            if (u.hp > 0) occupiedCells.add(`${u.x},${u.y}`);
        });

        enemyUnits.forEach(unit => {
            if (unit.hp <= 0) return;

            // Удаляем текущего юнита из занятых, чтобы он мог "подумать" о своем месте, 
            // но потом мы проверим, не занято ли оно кем-то ДРУГИМ, кто уже походил
            occupiedCells.delete(`${unit.x},${unit.y}`);

            const hpPercent = unit.hp / unit.maxHp;
            
            // 1. ПРОВЕРКА МОРАЛИ
            if (hpPercent < 0.33) {
                const action = getRetreatAction(unit, enemyUnits, arena, occupiedCells);
                actions.push(action);
                if (action.type === 'move') occupiedCells.add(`${action.x},${action.y}`);
                else occupiedCells.add(`${unit.x},${unit.y}`); // Если ждет, место остается занятым
                return;
            }

            // 2. ПОИСК ЦЕЛИ
            let target = findNearestTarget(unit, playerUnit, playerArmy);
            if (!target) {
                occupiedCells.add(`${unit.x},${unit.y}`);
                return;
            }

            const dist = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);
            let action = null;

            // 3. ЛОГИКА
            if (unit.type === 'range') {
                if (dist <= unit.range) {
                    action = { unitId: unit.id, type: 'attack', target: target };
                } else {
                    action = getApproachAction(unit, target, unit.range, arena, occupiedCells);
                }
            } else {
                if (dist === 1) {
                    action = { unitId: unit.id, type: 'attack', target: target };
                } else {
                    action = getApproachAction(unit, target, 1, arena, occupiedCells);
                }
            }

            if (action) {
                actions.push(action);
                if (action.type === 'move') {
                    console.log(`👾 [AI] Юнит ${unit.name} идет на (${action.x}, ${action.y})`);
                    occupiedCells.add(`${action.x},${action.y}`);
                } else {
                    occupiedCells.add(`${unit.x},${unit.y}`);
                }
            }
        });

        return actions;
    }

    function findNearestTarget(me, playerUnit, playerArmy) {
        let nearest = null;
        let minDist = Infinity;
        if (playerUnit && playerUnit.hp > 0) {
            const d = Math.abs(me.x - playerUnit.x) + Math.abs(me.y - playerUnit.y);
            if (d < minDist) { minDist = d; nearest = playerUnit; }
        }
        if (playerArmy) {
            playerArmy.forEach(ally => {
                if (ally.hp > 0) {
                    const d = Math.abs(me.x - ally.x) + Math.abs(me.y - ally.y);
                    if (d < minDist) { minDist = d; nearest = ally; }
                }
            });
        }
        return nearest;
    }

    function getRetreatAction(unit, friends, arena, occupiedCells) {
        const targetX = arena.width - 1;
        const targetY = Math.floor(arena.height / 2);
        const dx = targetX > unit.x ? 1 : -1;
        const dy = targetY > unit.y ? 1 : -1;
        
        if (isValidMove(unit.x + dx, unit.y, arena, occupiedCells)) return { unitId: unit.id, type: 'move', x: unit.x + dx, y: unit.y };
        if (isValidMove(unit.x, unit.y + dy, arena, occupiedCells)) return { unitId: unit.id, type: 'move', x: unit.x, y: unit.y + dy };
        return { unitId: unit.id, type: 'wait' };
    }

    function getApproachAction(unit, target, desiredRange, arena, occupiedCells) {
        const dx = Math.sign(target.x - unit.x);
        const dy = Math.sign(target.y - unit.y);
        
        // Проверяем только соседние клетки (максимум 1 шаг)
        const moves = [
            { x: unit.x + dx, y: unit.y + dy }, 
            { x: unit.x + dx, y: unit.y },      
            { x: unit.x, y: unit.y + dy }       
        ];

        for (const move of moves) {
            if (isValidMove(move.x, move.y, arena, occupiedCells)) {
                return { unitId: unit.id, type: 'move', x: move.x, y: move.y };
            }
        }
        return { unitId: unit.id, type: 'wait' };
    }

    function isValidMove(x, y, arena, occupiedCells) {
        if (x < 0 || x >= arena.width || y < 0 || y >= arena.height) return false;
        return !occupiedCells.has(`${x},${y}`);
    }

    return { calculateArmyTurn: calculateArmyTurn };
})();
