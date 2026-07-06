/**
 * ГЛАВНЫЙ КОНТРОЛЛЕР ТАКТИЧЕСКОГО БОЯ (tactical_battle.js) - ФИНАЛЬНЫЙ
 */
const TacticalBattleModule = (function() {
    'use strict';

    function processBattleTurn(playerDx, playerDy, currentTactic) {
        const state = GameModule.getTacticalState();
        if (!state) return;

        const { arena, playerUnit, playerArmy, enemyUnits } = state;

        // 1. Движение/Действие Игрока (Героя)
        handlePlayerHeroAction(playerUnit, playerDx, playerDy, enemyUnits, arena);

        // 2. Действия Армии Игрока (AI союзников)
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

        if (nx < 0 || nx >= arena.width || ny < 0 || ny >= arena.height) return;

        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            performAttack(player, enemy);
        } else {
            const isBlockedByAlly = GameModule.getPlayerArmy().some(a => a.x === nx && a.y === ny && a.hp > 0);
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
                unit.hp = 0; // Помечаем как мертвого, чтобы cleanUpDeadUnits удалил его
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

    function performAttack(attacker, defender) {
        if (!attacker || !defender) return;
        CombatModule.attack(attacker, defender, (msg) => RenderModule.log(msg, "combat"));
    }

    function cleanUpDeadUnits(state) {
        state.enemyUnits = state.enemyUnits.filter(u => u.hp > 0);
        state.playerArmy = state.playerArmy.filter(u => u.hp > 0);
    }

    function checkBattleEnd(state) {
        // Победа: все враги мертвы
        if (state.enemyUnits.length === 0) {
            GameModule.endTacticalBattle(true);
            return;
        }
        
        // Поражение: игрок мертв
        if (state.playerUnit.hp <= 0) {
            GameModule.endTacticalBattle(false);
            return;
        }

        // Поражение: вся армия игрока мертва И игрок сбежал (или остался один против толпы)
        // По ТЗ: если игрок выбирает "сбежать", бой заканчивается. Это обрабатывается через тактику flee.
        // Если все союзники мертвы, а игрок жив, он может продолжать бой в одиночку.
    }

    return { processBattleTurn: processBattleTurn };
})();
window.TacticalBattleModule = TacticalBattleModule;
