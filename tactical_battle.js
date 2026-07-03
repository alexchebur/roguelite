/**
 * ГЛАВНЫЙ КОНТРОЛЛЕР ТАКТИЧЕСКОГО БОЯ (tactical_battle.js)
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
        executeUnitActions(playerArmy, playerActions, enemyUnits);

        // 3. Действия Вражеской Армии (AI врагов)
        const enemyActions = TacticalAIModule.calculateArmyTurn(enemyUnits, playerUnit, playerArmy, arena);
        executeUnitActions(enemyUnits, enemyActions, [playerUnit, ...playerArmy]);

        // 4. Очистка мертвых
        cleanUpDeadUnits(state);

        // === НОВОЕ: СИНХРОНИЗАЦИЯ HP ИГРОКА ===
        // Переносим изменения HP из тактической копии в реального игрока
        const realPlayer = GameModule.getPlayer();
        if (realPlayer && playerUnit) {
            realPlayer.hp = playerUnit.hp;
            // Если игрок умер в бою, блокируем игру глобально
            if (realPlayer.hp <= 0) {
                GameModule.endTacticalBattle(false);
                return;
            }
        }

        // 5. Проверка условий победы/поражения
        checkBattleEnd(state);

        // === НОВОЕ: ОБНОВЛЕНИЕ UI ===
        // Обновляем панель статов, чтобы видеть актуальное HP
        RenderModule.updateUI(realPlayer, null, null);

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

    function executeUnitActions(actions, targets) {
        actions.forEach(action => {
            const unit = action.unit; // <--- БЕРЕМ ПРЯМУЮ ССЫЛКУ ИЗ ДЕЙСТВИЯ
            if (!unit || unit.hp <= 0) return;

            if (action.type === 'move') {
                console.log(`[Move] ${unit.name} идет на (${action.x}, ${action.y})`);
                
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
        // 1. Защита от некорректных данных
        if (!attacker || !defender) return;
        
        // 2. Используем стандартную боевую систему из combat.js для единообразия расчетов
        // CombatModule.attack возвращает true, если цель убита
        const isKilled = CombatModule.attack(
            attacker, 
            defender, 
            (msg) => RenderModule.log(msg, "combat") // Передаем функцию логирования
        );

        // 3. Дополнительное логирование для тактического режима (опционально, для ясности)
        if (!isKilled) {
            const attackerName = attacker.name || (attacker.isPlayer ? 'Герой' : 'Юнит');
            const defenderName = defender.name || 'Враг';
            // CombatModule уже вывел лог вида "X бьет Y на Z", но если нужно что-то специфичное:
            // RenderModule.log(`${attackerName} атакует ${defenderName}`, "info");
        }
    }

    function cleanUpDeadUnits(state) {
        state.enemyUnits = state.enemyUnits.filter(u => u.hp > 0);
        state.playerArmy = state.playerArmy.filter(u => u.hp > 0);
    }

    function checkBattleEnd(state) {
        // 1. Проверка поражения
        // Поражение наступает, если:
        // А) Умер сам герой (HP <= 0)
        // Б) ИЛИ умер герой И вся его армия (даже если у героя осталось 1 HP, но армия мертва - это критическая ситуация, но по ТЗ побегаем при 1 HP, так что тут строго 0)
        const isHeroDead = state.playerUnit.hp <= 0;
        const isArmyDead = state.playerArmy.every(u => u.hp <= 0);
        
        // Если герой мертв - сразу поражение. 
        // Если герой жив, но армия мертва - он может сбежать (если выберет тактику), но автоматически не проигрывает, пока у него есть HP.
        // Однако, для надежности добавим условие: если герой мертв, то всё равно проиграли.
        const isDefeat = isHeroDead || (isHeroDead && isArmyDead);

        // 2. Проверка победы
        // Победа наступает, если не осталось ни одного живого врага
        const isVictory = state.enemyUnits.length === 0;

        // 3. Завершение боя
        if (isDefeat) {
            if (typeof GameModule !== 'undefined' && typeof GameModule.endTacticalBattle === 'function') {
                GameModule.endTacticalBattle(false); // Поражение
            }
        } else if (isVictory) {
            if (typeof GameModule !== 'undefined' && typeof GameModule.endTacticalBattle === 'function') {
                GameModule.endTacticalBattle(true); // Победа
            }
        }
    }

    return {
        processBattleTurn: processBattleTurn
    };
})();
