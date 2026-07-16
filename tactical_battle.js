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

            if (action.type === 'remove') {
                unit.hp = 0; 
                RenderModule.log(`${unit.name} сбегает с поля боя!`, "info");
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

        const heroAlive = state.playerUnit && state.playerUnit.hp > 0;
        const armyAlive = state.playerArmy && state.playerArmy.some(u => u.hp > 0);
        const enemiesAlive = state.enemyUnits.length > 0;

        // Поражение: Герой мертв ИЛИ (Герой сбежал/мертв И армия уничтожена)
        // Для простоты: если герой мертв - конец. Если герой жив, но армия мертва - продолжаем (хардкор).
        // Но по ТЗ: если все свои исчезли - конец.
        
        if (!heroAlive && !armyAlive) {
             if (window.currentTactic === 'flee') {
                 RenderModule.log("💨 Ваш отряд успешно покинул поле боя!", "info");
             } else {
                 RenderModule.log("💀 Ваш отряд разбит! Вы погибли.", "combat");
             }
             setTimeout(() => GameModule.endTacticalBattle(false), 1000);
             isBattleEnding = true;
        } 
        else if (!enemiesAlive) {
            RenderModule.log("🎉 ПОБЕДА! Враг повержен!", "event");
            setTimeout(() => GameModule.endTacticalBattle(true), 1500);
            isBattleEnding = true;
        }
    }

    return { processBattleTurn: processBattleTurn };
})();
window.TacticalBattleModule = TacticalBattleModule;
