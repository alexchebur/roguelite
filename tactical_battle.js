/**
 * ГЛАВНЫЙ КОНТРОЛЛЕР ТАКТИЧЕСКОГО БОЯ (tactical_battle.js)
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

        // 1. Движение/Действие Игрока (Героя)
        handlePlayerHeroAction(playerUnit, playerDx, playerDy, enemyUnits, arena);

        // 2. Действия Армии Игрока (AI союзников)
        // Получаем сырые действия из модуля тактики
        const rawPlayerActions = TacticalPlayerModule.processPlayerTactic(currentTactic, playerArmy, playerUnit, enemyUnits, arena);
        
        // ВАЖНО: Привязываем объекты юнитов к действиям, так как у них нет ID
        const playerActions = rawPlayerActions.map(action => {
            // Находим юнита по ссылке (если action уже содержит unit, используем его, иначе ищем)
            if (action.unit) return action;
            
            // Если action пришел с unitId (из старого кода), ищем его
            if (action.unitId) {
                const unit = playerArmy.find(u => u.x === action.unitId.x && u.y === action.unitId.y); // Хак: ищем по координатам, если ID нет
                return { ...action, unit: unit };
            }
            return action;
        });

        executeUnitActions(playerActions, [playerUnit, ...enemyUnits]);

        // 3. Действия Вражеской Армии (AI врагов)
        // TacticalAIModule теперь сам возвращает actions с полем .unit
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
            // Движение героя
            const isBlockedByAlly = GameModule.getPlayerArmy().some(a => a.x === nx && a.y === ny && a.hp > 0);
            if (!isBlockedByAlly) {
                player.x = nx;
                player.y = ny;
            }
        }
    }

    function executeUnitActions(actions, targets) {
        actions.forEach(action => {
            // Берем прямую ссылку на юнита из действия
            const unit = action.unit; 
            
            if (!unit || unit.hp <= 0) return;

            if (action.type === 'move') {
                // Проверка: не занята ли клетка целью (игроком или другим юнитом)
                const isOccupied = targets.some(t => t && t.hp > 0 && t.x === action.x && t.y === action.y);
                
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
        
        // Используем стандартную боевую систему
        CombatModule.attack(
            attacker, 
            defender, 
            (msg) => RenderModule.log(msg, "combat")
        );
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
