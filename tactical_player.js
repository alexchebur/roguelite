/**
 * МОДУЛЬ УПРАВЛЕНИЯ АРМИЕЙ ИГРОКА (tactical_player.js) - С ФОРМАЦИЕЙ
 */
const TacticalPlayerModule = (function() {
    'use strict';

    /**
     * Генерирует приказы для армии игрока
     */
    function processPlayerTactic(tacticId, playerArmy, playerUnit, enemyUnits, arena) {
        const actions = [];
        if (!playerArmy || playerArmy.length === 0) return actions;

        // Группируем юнитов по отрядам (squadId)
        const squads = {};
        playerArmy.forEach(u => {
            if (!squads[u.squadId]) squads[u.squadId] = [];
            squads[u.squadId].push(u);
        });

        Object.values(squads).forEach(squad => {
            // Находим лидера отряда (юнит с минимальным Y, чтобы строй был вертикальным)
            // Или можно брать первого в массиве
            const leader = squad.reduce((prev, curr) => (prev.y < curr.y ? prev : curr));
            
            squad.forEach(unit => {
                let action = null;

                // Если это сам лидер — он ведет отряд к цели
                if (unit === leader) {
                    action = getLeaderAction(unit, tacticId, enemyUnits, arena);
                } 
                // Если это рядовой — он держит позицию относительно лидера
                else {
                    action = getFollowerAction(unit, leader, tacticId, arena, playerArmy);
                }

                if (action) actions.push(action);
            });
        });

        return actions;
    }

    function getLeaderAction(leader, tacticId, enemies, arena) {
        const target = findNearestEnemy(leader, enemies);
        if (!target) return { unitId: leader.id, type: 'wait', unit: leader };

        switch (tacticId) {
            case 'advance':
                return getMoveOrAttackAction(leader, target, arena, enemies);
            case 'retreat':
                // Лидер бежит влево
                if (leader.x > 2) return { unitId: leader.id, type: 'move', x: leader.x - 1, y: leader.y, unit: leader };
                break;
            case 'hold':
                const dist = Math.abs(leader.x - target.x) + Math.abs(leader.y - target.y);
                if (dist <= 1) return { unitId: leader.id, type: 'attack', target: target, unit: leader };
                if (leader.type === 'range' && dist <= leader.range) return { unitId: leader.id, type: 'attack', target: target, unit: leader };
                break;
        }
        return { unitId: leader.id, type: 'wait', unit: leader };
    }

    function getFollowerAction(follower, leader, tacticId, arena, allAllies) {
        // Целевая позиция: рядом с лидером, сохраняя исходное смещение
        // Для простоты: строим вертикальную шеренгу позади или рядом с лидером
        
        // Вычисляем "идеальную" позицию в строю
        // Допустим, мы хотим стоять вплотную друг к другу по вертикали
        // Нам нужно знать индекс юнита в его отряде, но пока сделаем проще:
        // Просто идем к клетке рядом с лидером, которая свободна
        
        const targets = [
            { x: leader.x, y: leader.y - 1 }, // Над лидером
            { x: leader.x, y: leader.y + 1 }, // Под лидером
            { x: leader.x - 1, y: leader.y }, // Слева от лидера (если отступаем)
            { x: leader.x + 1, y: leader.y }  // Справа от лидера (если атакуем)
        ];

        // Выбираем лучшую свободную клетку
        for (let pos of targets) {
            if (isValidPos(pos.x, pos.y, arena, allAllies)) {
                 // Проверяем, не занято ли место врагом
                 // (упрощенно считаем, что если клетка свободна от союзников, то ок)
                 return { unitId: follower.id, type: 'move', x: pos.x, y: pos.y, unit: follower };
            }
        }

        // Если все места вокруг лидера заняты, просто стоим
        return { unitId: follower.id, type: 'wait', unit: follower };
    }

    function isValidPos(x, y, arena, allies) {
        if (x < 0 || x >= arena.width || y < 0 || y >= arena.height) return false;
        // Не можем встать на другого союзника
        return !allies.some(a => a.x === x && a.y === y && a.hp > 0);
    }

    // ... остальные вспомогательные функции (findNearestEnemy и т.д.) остаются без изменений ...
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
