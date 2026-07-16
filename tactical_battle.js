/**
 * ГЛАВНЫЙ КОНТРОЛЛЕР ТАКТИЧЕСКОГО БОЯ (tactical_battle.js)
 */
let isBattleEnding = false;

const TacticalBattleModule = (function() {
    'use strict';

    function processBattleTurn(playerDx, playerDy, currentTactic) {
        isBattleEnding = false; // Сброс флага окончания боя
        const state = GameModule.getTacticalState();
        if (!state) return;

        const { arena, playerUnit, playerArmy, enemyUnits } = state;

        // 1. Движение/Действие Игрока (Героя) - РУЧНОЕ УПРАВЛЕНИЕ
        handlePlayerHeroAction(playerUnit, playerDx, playerDy, enemyUnits, arena);

        // 2. Действия Армии Игрока (AI союзников) - АВТОМАТИЧЕСКОЕ
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

        // Проверка границ арены
        if (nx < 0 || nx >= arena.width || ny < 0 || ny >= arena.height) return;

        // Проверка коллизий (враги, союзники)
        const enemy = enemies.find(e => e.x === nx && e.y === ny && e.hp > 0);
        const ally = GameModule.getPlayerArmy().find(a => a.x === nx && a.y === ny && a.hp > 0);

        if (enemy) {
            // Атака врага
            performAttack(player, enemy);
        } else if (!ally) {
            // Движение, если клетка свободна
            player.x = nx;
            player.y = ny;
        }
    }

    function executeUnitActions(actions, targets) {
        actions.forEach(action => {
            const unit = action.unit; 
            if (!unit || unit.hp <= 0) return;

            // === ОБРАБОТКА ПОБЕГА (Исчезновение) ===
            if (action.type === 'remove') {
                unit.hp = 0; // Помечаем как мертвого
                RenderModule.log(`${unit.name} сбегает с поля боя!`, "info");
                return;
            }

            if (action.type === 'move') {
                // Проверяем, не занята ли клетка (исключаем самого юнита из проверки)
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

    // === ВОССТАНОВЛЕННАЯ ФУНКЦИЯ АТАКИ ===
    function performAttack(attacker, defender) {
        if (!attacker || !defender) return;
        CombatModule.attack(attacker, defender, (msg) => RenderModule.log(msg, "combat"));
    }

    function cleanUpDeadUnits(state) {
        state.enemyUnits = state.enemyUnits.filter(u => u.hp > 0);
        state.playerArmy = state.playerArmy.filter(u => u.hp > 0);
    }

    function checkBattleEnd(state) {
        if (isBattleEnding) return; 

        // 1. Проверка поражения по HP (смерть или критическое состояние)
        const isDead = state.playerUnit.hp <= 0;
        const isCritical = state.playerUnit.hp <= 10 && state.playerUnit.hp > 0;

        // 2. Проверка победы (все враги мертвы)
        const isVictory = state.enemyUnits.length === 0;

        // 3. Проверка полного бегства (НОВОЕ)
        // Если у игрока нет живой армии И выбрана тактика отступления/побега
        const hasNoArmy = !state.playerArmy || state.playerArmy.length === 0;
        const isRetreating = (window.currentTactic === 'flee' || window.currentTactic === 'retreat');

        if (isDead) {
            isBattleEnding = true;
            RenderModule.log("💀 Вы погибли в бою...", "combat");
            setTimeout(() => GameModule.endTacticalBattle(false), 1000);
        } 
        else if (isCritical) {
            isBattleEnding = true;
            RenderModule.log("💨 Ваши силы на исходе! Вы в панике сбегаете с поля боя!", "combat");
            setTimeout(() => GameModule.endTacticalBattle(false), 800);
        } 
        else if (isVictory) {
            isBattleEnding = true;
            RenderModule.log("🎉 ПОБЕДА! Враг повержен!", "event");
            setTimeout(() => GameModule.endTacticalBattle(true), 1500);
        }
        // === НОВАЯ ЛОГИКА: Если армии нет и мы пытаемся сбежать ===
        else if (hasNoArmy && isRetreating) {
            isBattleEnding = true;
            RenderModule.log("💨 Ваша армия покинула поле боя. Вы следуете за ними!", "info");
            setTimeout(() => GameModule.endTacticalBattle(false), 500);
        }
    }

    return { processBattleTurn: processBattleTurn };
})();

window.TacticalBattleModule = TacticalBattleModule;
