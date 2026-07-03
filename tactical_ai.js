/**
 * МОДУЛЬ ИСКУССТВЕННОГО ИНТЕЛЛЕКТА ВРАГА (tactical_ai.js)
 */
const TacticalAIModule = (function() {
    'use strict';

    /**
     * Рассчитывает действия всей вражеской армии на ход
     */
    function calculateArmyTurn(enemyUnits, playerUnit, playerArmy, arena) {
        const actions = []; 

        enemyUnits.forEach(unit => {
            if (unit.hp <= 0) return;

            const hpPercent = unit.hp / unit.maxHp;
        
            // 1. ПРОВЕРКА МОРАЛИ (Бегство при низком HP)
            if (hpPercent < 0.33) {
                RenderModule.log(`${unit.name} в панике отступает!`, "combat"); 
                actions.push(getRetreatAction(unit, enemyUnits, arena));
                return;
            }

            // 2. ПОИСК ЦЕЛИ
            let target = findNearestTarget(unit, playerUnit, playerArmy);
            if (!target) return;

            const dist = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);

            // 3. ЛОГИКА ВЫБОРА ДЕЙСТВИЯ
            if (unit.type === 'range') {
                // Лучники держат дистанцию
                if (dist <= unit.range) {
                    actions.push({ unitId: unit.id, type: 'attack', target: target });
                } else {
                    // Передаем все необходимые контекстные данные в getApproachAction
                    actions.push(getApproachAction(unit, target, unit.range, arena, enemyUnits, playerUnit, playerArmy));
                }
            } else {
                // Ближний бой
                if (dist === 1) {
                    actions.push({ unitId: unit.id, type: 'attack', target: target });
                } else {
                    // Передаем все необходимые контекстные данные в getApproachAction
                    actions.push(getApproachAction(unit, target, 1, arena, enemyUnits, playerUnit, playerArmy));
                }
            }
        });

        return actions;
    }

    /**
     * Поиск ближайшей живой цели
     */
    function findNearestTarget(me, playerUnit, playerArmy) {
        let nearest = null;
        let minDist = Infinity;

        // Проверяем самого игрока
        if (playerUnit && playerUnit.hp > 0) {
            const d = Math.abs(me.x - playerUnit.x) + Math.abs(me.y - playerUnit.y);
            if (d < minDist) {
                minDist = d;
                nearest = playerUnit;
            }
        }

        // Проверяем армию игрока
        if (playerArmy) {
            playerArmy.forEach(ally => {
                if (ally.hp > 0) {
                    const d = Math.abs(me.x - ally.x) + Math.abs(me.y - ally.y);
                    if (d < minDist) {
                        minDist = d;
                        nearest = ally;
                    }
                }
            });
        }

        return nearest;
    }

    /**
     * Действие отступления
     */
    function getRetreatAction(unit, friends, arena) {
        // Бежим к правому краю карты (к своему краю спавна)
        const targetX = arena.width - 1;
        const targetY = Math.floor(arena.height / 2);

        const dx = targetX > unit.x ? 1 : -1;
        const dy = targetY > unit.y ? 1 : -1;
        
        // Пробуем шаг по X
        if (isValidMove(unit.x + dx, unit.y, arena, friends)) {
             return { unitId: unit.id, type: 'move', x: unit.x + dx, y: unit.y };
        }
        // Пробуем шаг по Y
        if (isValidMove(unit.x, unit.y + dy, arena, friends)) {
             return { unitId: unit.id, type: 'move', x: unit.x, y: unit.y + dy };
        }
        
        return { unitId: unit.id, type: 'wait' };
    }

    /**
     * Действие сближения (более агрессивное и умное)
     * Исправлено: добавлены параметры friends, pUnit, pArmy для корректной проверки коллизий
     */
    function getApproachAction(unit, target, desiredRange, arena, friends, pUnit, pArmy) {
        // Сначала пробуем простой "жадный" шаг к цели
        const dx = Math.sign(target.x - unit.x);
        const dy = Math.sign(target.y - unit.y);
        
        // Приоритет направлений: диагональ -> основная ось -> второстепенная ось
        const moves = [
            { x: unit.x + dx, y: unit.y + dy }, 
            { x: unit.x + dx, y: unit.y },      
            { x: unit.x, y: unit.y + dy }       
        ];

        for (const move of moves) {
            // Проверяем, свободна ли клетка от союзников
            if (isValidMove(move.x, move.y, arena, friends)) { 
                 // Проверяем, не занята ли клетка врагом (игроком или его армией)
                 // Если занята врагом, мы не можем туда пойти (это должна быть атака, которая обрабатывается выше)
                 const isOccupiedByEnemy = (pUnit && pUnit.hp > 0 && pUnit.x === move.x && pUnit.y === move.y) || 
                                           (pArmy && pArmy.some(p => p.hp > 0 && p.x === move.x && p.y === move.y));
                
                if (!isOccupiedByEnemy) {
                    return { unitId: unit.id, type: 'move', x: move.x, y: move.y };
                }
            }
        }

        // Если простые шаги не сработали (заблокированы), пробуем A* как запасной вариант для обхода
        const astar = new ROT.Path.AStar(target.x, target.y, 
            (x, y) => isValidCell(x, y, arena), { topology: 8 });
        
        let nextStep = null;
        astar.compute(unit.x, unit.y, (x, y) => {
            if (!nextStep && (x !== unit.x || y !== unit.y)) {
                nextStep = { x, y };
            }
        });

        if (nextStep) {
             // Финальная проверка: можно ли вообще ступить на клетку, найденную A*
             if (isValidMove(nextStep.x, nextStep.y, arena, friends)) {
                 const isOccupiedByEnemy = (pUnit && pUnit.hp > 0 && pUnit.x === nextStep.x && pUnit.y === nextStep.y) || 
                                           (pArmy && pArmy.some(p => p.hp > 0 && p.x === nextStep.x && p.y === nextStep.y));
                 
                 if (!isOccupiedByEnemy) {
                     return { unitId: unit.id, type: 'move', x: nextStep.x, y: nextStep.y };
                 }
             }
        }

        return { unitId: unit.id, type: 'wait' };
    }

    function isValidCell(x, y, arena) {
        return x >= 0 && x < arena.width && y >= 0 && y < arena.height;
    }

    function isValidMove(x, y, arena, friends) {
        if (!isValidCell(x, y, arena)) return false;
        // Клетка свободна, если там нет живого союзника
        return !friends.some(f => f.x === x && f.y === y && f.hp > 0);
    }

    return {
        calculateArmyTurn: calculateArmyTurn
    };
})();
