/**
 * ГЛАВНЫЙ КОНТРОЛЛЕР ТАКТИЧЕСКОГО БОЯ (tactical_battle.js)
 */
let isBattleEnding = false;

const TacticalBattleModule = (function() {
    'use strict';

    function processBattleTurn(playerDx, playerDy, currentTactic) {
        isBattleEnding = false;
        const state = GameModule.getTacticalState();
        if (!state) return;

        const { arena, playerUnit, playerArmy, enemyUnits } = state;

        // 1. Движение/Действие Игрока (Героя) - РУЧНОЕ УПРАВЛЕНИЕ
        handlePlayerHeroAction(playerUnit, playerDx, playerDy, enemyUnits, arena);

        // 2. Действия Армии Игрока (AI союзников) - АВТОМАТИЧЕСКОЕ
        // Передаем playerUnit, чтобы армия знала, где герой
        const playerActions = TacticalPlayerModule.processPlayerTactic(currentTactic, playerArmy, playerUnit, enemyUnits, arena);
        executeUnitActions(playerActions, [playerUnit, ...enemyUnits]);

        // 3. Действия Вражеской Армии (AI врагов)
        const enemyActions = TacticalAIModule.calculateArmyTurn(enemyUnits, playerUnit, playerArmy, arena);
        executeUnitActions(enemyActions, [playerUnit, ...playerArmy]);

        // 4. Очистка мертвых и сбежавших
        cleanUpDeadUnits(state);

        // 5. Проверка условий победы/поражения
        checkBattleEnd(state);

        // 6. Синхронизация HP игрока с реальным объектом (для UI)
        const realPlayer = GameModule.getPlayer();
        if (realPlayer && playerUnit) {
            realPlayer.hp = playerUnit.hp;
            RenderModule.updateUI(realPlayer, null, null);
        }

        // 7. Рендер
        RenderModule.requestRedraw();
    }

    function handlePlayerHeroAction(player, dx, dy, enemies, arena) {
        if (dx === 0 && dy === 0) return; 
        
        const nx = player.x + dx;
        const ny = player.y + dy;

        // Проверка границ
        if (nx < 0 || nx >= arena.width || ny < 0 || ny >= arena.height) return;

        // Проверка врага
        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            performAttack(player, enemy);
        } else {
            // Проверка своих юнитов (чтобы не наступать на них)
            const state = GameModule.getTacticalState();
            const isBlockedByAlly = state.playerArmy.some(a => a.x === nx && a.y === ny && a.hp > 0);
            
            if (!isBlockedByAlly) {
                player.x = nx;
                player.y = ny;
            }
        }
    }

    function executeUnitActions(actions, targets) {
        actions.forEach(action => {
            const unit = action.unit; 
            if (!unit || unit.hp <= 0) return;

            // === ОБРАБОТКА ПОБЕГА (Исчезновение) ===
            if (action.type === 'remove') {
                unit.hp = 0; // Помечаем как мертвого
                RenderModule.log(`${unit.name} покидает поле боя!`, "info");
                return;
            }

            if (action.type === 'move') {
                const isOccupied = targets.some(t => t !== unit && t && t.hp > 0 && t.x === action.x && t.y === action.y);
                if (!isOccupied) {
                    unit.x = action.x;
                    unit.y = action.y;
                }
            } else if (action.type === 'attack') {
                if (action.target && action.target.hp > 0) {
                    performAttack(unit, action.target);
                }
            }
        });
    }

    function cleanUpDeadUnits(state) {
        // Удаляем всех, у кого HP <= 0 (включая тех, кто сбежал через action.remove)
        state.enemyUnits = state.enemyUnits.filter(u => u.hp > 0);
        state.playerArmy = state.playerArmy.filter(u => u.hp > 0);
        
        // ВАЖНО: Если герой тоже получил action.remove (например, он один и нажал Flee),
        // мы должны обнулить его HP здесь, если это еще не сделано.
        // Но обычно герой управляется отдельно. Проверим состояние героя ниже.
    }

    function checkBattleEnd(state) {
        if (isBattleEnding) return; 

        // 1. Проверяем, жив ли герой физически
        const heroAlive = state.playerUnit && state.playerUnit.hp > 0;
        
        // 2. Проверяем, есть ли живые союзники
        const armyAlive = state.playerArmy && state.playerArmy.length > 0;

        // 3. Проверяем, живы ли враги
        const enemiesAlive = state.enemyUnits && state.enemyUnits.length > 0;

        // === УСЛОВИЯ ЗАВЕРШЕНИЯ ===

        // А. Герой мертв (HP <= 0)
        if (!heroAlive) {
            isBattleEnding = true;
            RenderModule.log("💀 Вы погибли в бою...", "combat");
            setTimeout(() => GameModule.endTacticalBattle(false), 1000);
            return;
        }

        // Б. Герой жив, но вся его армия уничтожена или сбежала, И враги еще живы.
        // Это означает, что герой остался один против превосходящих сил или просто потерял отряд.
        // По ТЗ: если армий нет, возвращаем сразу. Если армии были и сбежали - ждем пока сбегут все.
        // Так как cleanUpDeadUnits уже удалил сбежавших, length === 0 означает, что все ушли.
        if (!armyAlive && enemiesAlive) {
             // Проверяем, была ли активна тактика побега или отступления
             if (window.currentTactic === 'flee' || window.currentTactic === 'retreat') {
                 isBattleEnding = true;
                 RenderModule.log("💨 Ваш отряд полностью покинул поле боя. Вы следуете за ними!", "info");
                 setTimeout(() => GameModule.endTacticalBattle(false), 800);
                 return;
             }
             
             // Если тактика НЕ была бегством, а армия просто погибла - это поражение
             if (!heroAlive) { // Уже проверено выше, но для надежности
                 isBattleEnding = true;
                 setTimeout(() => GameModule.endTacticalBattle(false), 1000);
                 return;
             }
        }

        // В. Победа: Все враги мертвы
        if (!enemiesAlive) {
            isBattleEnding = true;
            RenderModule.log("🎉 ПОБЕДА! Враг повержен!", "event");
            setTimeout(() => GameModule.endTacticalBattle(true), 1500);
            return;
        }
        
        // Г. Особый случай: Игрок нажал Flee, у него нет армии, и он сам "исчез" (если мы реализуем исчезновение героя)
        // В текущей реализации герой не исчезает сам по себе при Flee, если у него нет армии.
        // Поэтому добавим проверку: если тактика Flee и у игрока нет армии, считаем это успешным бегством самого игрока.
        if (window.currentTactic === 'flee' && !armyAlive && heroAlive) {
             // Если игрок один и выбрал Flee, он должен сбежать немедленно или после короткой задержки
             isBattleEnding = true;
             RenderModule.log("💨 Вы воспользовались моментом и сбежали с поля боя!", "info");
             setTimeout(() => GameModule.endTacticalBattle(false), 500);
             return;
        }
    }

    return { processBattleTurn: processBattleTurn };
})();
window.TacticalBattleModule = TacticalBattleModule;
