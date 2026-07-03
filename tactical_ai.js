
/**
 * МОДУЛЬ ИСКУССТВЕННОГО ИНТЕЛЛЕКТА ВРАГА (tactical_ai.js)
 */
const TacticalAIModule = (function() {
    'use strict';

    /**
     * Рассчитывает действия всей вражеской армии на ход
     */
    function calculateArmyTurn(enemyUnits, playerUnit, playerArmy, arena) {
        const actions = []; // Массив действий: { unitId, type: 'move'|'attack', targetX, targetY, targetUnit }

    // В tactical_ai.js, внутри calculateArmyTurn

    enemyUnits.forEach(unit => {
        if (unit.hp <= 0) return;

        const hpPercent = unit.hp / unit.maxHp;
    
        // 1. ПРОВЕРКА МОРАЛИ
        if (hpPercent < 0.33) {
            RenderModule.log(`${unit.name} в панике отступает!`, "combat"); // <--- ЛОГ
            actions.push(getRetreatAction(unit, enemyUnits, arena));
            return;
        }

        // 2. ПОИСК ЦЕЛИ
        let target = findNearestTarget(unit, playerUnit, playerArmy);
        if (!target) return;

        const dist = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);

        // 3. ЛОГИКА
        if (unit.type === 'range') {
            if (dist <= unit.range) {
                actions.push({ unitId: unit.id, type: 'attack', target: target });
            } else {
                // Лучник подходит, но осторожно
                actions.push(getApproachAction(unit, target, unit.range, arena));
            }
        } else {
            // Мили
            if (dist === 1) {
                actions.push({ unitId: unit.id, type: 'attack', target: target });
            } else {
                actions.push(getApproachAction(unit, target, 1, arena));
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
        // Ищем самого дальнего друга или просто бежим в противоположную сторону от центра боя
        // Для простоты: бежим вправо (к своему краю), если там свободно
        let bestMove = { x: unit.x, y: unit.y };
        let maxDist = -1;

        // Простая эвристика: бежать к правому краю карты (x = arena.width - 1)
        const targetX = arena.width - 1;
        const targetY = Math.floor(arena.height / 2);

        // Используем A* для поиска пути к безопасной зоне
        // Но для производительности сделаем простой greedy step в сторону края
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
     * Действие сближения (с учетом желаемой дистанции)
     */
    function getApproachAction(unit, target, desiredRange, arena) {
        // Используем A* из ROT.js
        // Цель: клетка, которая находится на расстоянии desiredRange от target
        // Но для простоты пока будем идти прямо к target, а остановимся, когда dist <= desiredRange
        
        const astar = new ROT.Path.AStar(target.x, target.y, 
            (x, y) => isValidCell(x, y, arena), { topology: 8 });
        
        let nextStep = null;
        astar.compute(unit.x, unit.y, (x, y) => {
            if (!nextStep && (x !== unit.x || y !== unit.y)) {
                nextStep = { x, y };
            }
        });

        if (nextStep) {
            // Проверка, не занято ли место другим другом (простая проверка коллизий)
            // В идеале тут нужна более сложная логика расталкивания, но пока пропустим
            return { unitId: unit.id, type: 'move', x: nextStep.x, y: nextStep.y };
        }

        return { unitId: unit.id, type: 'wait' };
    }

    function isValidCell(x, y, arena) {
        return x >= 0 && x < arena.width && y >= 0 && y < arena.height;
    }

    function isValidMove(x, y, arena, friends) {
        if (!isValidCell(x, y, arena)) return false;
        // Проверка на друзей
        return !friends.some(f => f.x === x && f.y === y && f.hp > 0);
    }

    return {
        calculateArmyTurn: calculateArmyTurn
    };
})();
