/**
 * ГЛАВНЫЙ КОНТРОЛЛЕР ТАКТИЧЕСКОГО БОЯ (tactical_battle.js) - С УЧЕТОМ СКОРОСТИ/ЭНЕРГИИ
 */
const TacticalBattleModule = (function() {
    'use strict';

    /**
     * Основной цикл обработки хода в тактическом режиме
     */
    function processBattleTurn(playerDx, playerDy, currentTactic) {
        const state = GameModule.getTacticalState();
        if (!state) return;

        const { arena, playerUnit, playerArmy, enemyUnits } = state;

        // 0. ВОССТАНОВЛЕНИЕ ЭНЕРГИИ ПЕРЕД ХОДОМ
        restoreEnergy(playerUnit);
        playerArmy.forEach(restoreEnergy);
        enemyUnits.forEach(restoreEnergy);

        // 1. Движение/Действие Игрока (Героя)
        handlePlayerHeroAction(playerUnit, playerDx, playerDy, enemyUnits, arena);

        // 2. Действия Армии Игрока (AI союзников)
        const rawPlayerActions = TacticalPlayerModule.processPlayerTactic(currentTactic, playerArmy, playerUnit, enemyUnits, arena);
        
        const playerActions = rawPlayerActions.map(action => {
            if (action.unit) return action;
            if (action.unitId) {
                const unit = playerArmy.find(u => u.x === action.unitId.x && u.y === action.unitId.y);
                return { ...action, unit: unit };
            }
            return action;
        });

        executeUnitActions(playerActions, [playerUnit, ...enemyUnits]);

        // 3. Действия Вражеской Армии (AI врагов)
        const enemyActions = TacticalAIModule.calculateArmyTurn(enemyUnits, playerUnit, playerArmy, arena);
        executeUnitActions(enemyActions, [playerUnit, ...playerArmy]);

        // 4. Очистка мертвых
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

    /**
     * Восстановление энергии юнита до максимума (скорости)
     */
    function restoreEnergy(unit) {
        if (unit && unit.maxEnergy) {
            unit.energy = unit.maxEnergy;
        }
    }

    function handlePlayerHeroAction(player, dx, dy, enemies, arena) {
        if (dx === 0 && dy === 0) return; 

        // Проверка энергии героя
        if (player.energy < 1) {
            RenderModule.log("У вас нет сил для движения!", "info");
            return;
        }

        const nx = player.x + dx;
        const ny = player.y + dy;

        // Проверка границ
        if (nx < 0 || nx >= arena.width || ny < 0 || ny >= arena.height) return;

        // Проверка врага
        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            // Атака тратит энергию
            if (player.energy >= 1) {
                performAttack(player, enemy);
                player.energy -= 1; 
            }
        } else {
            // Движение героя тратит энергию
            const isBlockedByAlly = GameModule.getPlayerArmy().some(a => a.x === nx && a.y === ny && a.hp > 0);
            if (!isBlockedByAlly) {
                player.x = nx;
                player.y = ny;
                player.energy -= 1;
            }
        }
    }

    function executeUnitActions(actions, targets) {
        actions.forEach(action => {
            const unit = action.unit; 
            
            if (!unit || unit.hp <= 0) return;

            // Проверка энергии перед действием
            if (unit.energy < 1) return; // Нет энергии - стоим

            if (action.type === 'move') {
                const isOccupied = targets.some(t => t && t.hp > 0 && t.x === action.x && t.y === action.y);
                
                if (!isOccupied) {
                    unit.x = action.x;
                    unit.y = action.y;
                    unit.energy -= 1; // Тратим 1 энергию на шаг
                    
                    // Если скорость позволяет, можно сделать еще шаг? 
                    // Пока оставим 1 действие за ход для простоты, но энергия копится для будущих апгрейдов
                }
            } else if (action.type === 'attack') {
                if (action.target && action.target.hp > 0) {
                    performAttack(unit, action.target);
                    unit.energy -= 1; // Тратим 1 энергию на атаку
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
        const isPlayerDead = state.playerUnit.hp <= 0;
        const isVictory = state.enemyUnits.length === 0;

        if (isPlayerDead) {
            GameModule.endTacticalBattle(false);
        } else if (isVictory) {
            GameModule.endTacticalBattle(true);
        }
    }

    return {
        processBattleTurn: processBattleTurn
    };
})();
