/**
 * ГЛАВНЫЙ КОНТРОЛЛЕР ТАКТИЧЕСКОГО БОЯ (tactical_battle.js)
 */
const TacticalBattleModule = (function() {
    'use strict';

    /**
     * Основной цикл обработки хода в тактическом режиме
     * Вызывается из GameModule.processTurn или специального обработчика
     */
    function processBattleTurn(playerDx, playerDy, currentTactic) {
        const state = GameModule.getTacticalState(); // Нужно добавить геттер в GameModule
        if (!state) return;

        const { arena, playerUnit, playerArmy, enemyUnits } = state;

        // 1. Движение/Действие Игрока (Героя)
        handlePlayerHeroAction(playerUnit, playerDx, playerDy, enemyUnits, arena);

        // 2. Действия Армии Игрока (AI союзников)
        const playerActions = TacticalPlayerModule.processPlayerTactic(currentTactic, playerArmy, playerUnit, enemyUnits, arena);
        executeUnitActions(playerArmy, playerActions, enemyUnits);

        // 3. Действия Вражеской Армии (AI врагов)
        const enemyActions = TacticalAIModule.calculateArmyTurn(enemyUnits, playerUnit, playerArmy, arena);
        executeUnitActions(enemyUnits, enemyActions, [playerUnit, ...playerArmy]);

        // 4. Очистка мертвых
        cleanUpDeadUnits(state);

        // 5. Проверка условий победы/поражения
        checkBattleEnd(state);

        // 6. Рендер
        RenderModule.requestRedraw();
    }

    function handlePlayerHeroAction(player, dx, dy, enemies, arena) {
        if (dx === 0 && dy === 0) return; // Пропуск хода

        const nx = player.x + dx;
        const ny = player.y + dy;

        // Проверка границ
        if (nx < 0 || nx >= arena.width || ny < 0 || ny >= arena.height) return;

        // Проверка врага
        const enemy = enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
        if (enemy) {
            // Атака героя
            performAttack(player, enemy);
        } else {
            // Движение героя
            // Простая проверка коллизий с своей армией
            const isBlockedByAlly = GameModule.getPlayerArmy().some(a => a.x === nx && a.y === ny && a.hp > 0);
            if (!isBlockedByAlly) {
                player.x = nx;
                player.y = ny;
            }
        }
    }

    function executeUnitActions(units, actions, targets) {
        actions.forEach(action => {
            const unit = units.find(u => u.id === action.unitId);
            if (!unit || unit.hp <= 0) return;

            if (action.type === 'move') {
                // Простая телепортация на клетку (в будущем можно добавить анимацию)
                // Проверка, не занята ли клетка кем-то из targets (врагов/союзников)
                const isOccupied = targets.some(t => t.x === action.x && t.y === action.y && t.hp > 0);
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
        // Защита от undefined/NaN
        const atk = attacker.atk || 1;
        const def = defender.def || 0;
        
        let dmg = Math.max(1, atk - def);
        
        // Крит (10% шанс)
        if (Math.random() < 0.1) dmg = Math.floor(dmg * 1.5);
        
        defender.hp -= dmg;
        
        // Лог
        const attackerName = attacker.name || 'Неизвестный';
        const defenderName = defender.name || 'Неизвестный';
        
        // Проверяем, кто атакует, чтобы выбрать правильный глагол или цвет лога
        if (attacker.isPlayer || (GameModule.getPlayerArmy().includes(attacker))) {
             RenderModule.log(`${attackerName} бьет ${defenderName} на ${dmg}`, "combat");
        } else {
             RenderModule.log(`${attackerName} атакует вас на ${dmg}`, "combat");
        }
    }

    function cleanUpDeadUnits(state) {
        state.enemyUnits = state.enemyUnits.filter(u => u.hp > 0);
        state.playerArmy = state.playerArmy.filter(u => u.hp > 0);
    }

    function checkBattleEnd(state) {
        // Поражение игрока: умер герой И вся армия
        const isPlayerDead = state.playerUnit.hp <= 0 && state.playerArmy.every(u => u.hp <= 0);
        // Победа игрока: все враги мертвы
        const isVictory = state.enemyUnits.length === 0;

        if (isPlayerDead) {
            GameModule.endTacticalBattle(false); // Поражение
        } else if (isVictory) {
            GameModule.endTacticalBattle(true); // Победа
        }
    }

    return {
        processBattleTurn: processBattleTurn
    };
})();
