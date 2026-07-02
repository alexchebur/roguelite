/**
 * МОДУЛЬ ОТРИСОВКИ ТАКТИЧЕСКОГО БОЯ (tactical_render.js)
 * Отвечает за визуализацию поля боя, юнитов и UI тактики.
 */

const TacticalRenderModule = (function() {
    'use strict';

    /**
     * Отрисовка всего тактического экрана
     */
    function drawBattlefield(arena, playerUnit, enemyUnits, playerArmy, currentTactic) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        // 1. Очистка и фон
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const tileW = RenderModule.TILE_SIZE;
        const tileH = RenderModule.TILE_SIZE;
        
        // Центрируем арену на экране
        const offsetX = Math.floor((RenderModule.COLS - arena.width) / 2);
        const offsetY = Math.floor((RenderModule.ROWS - arena.height) / 2);

        // 2. Рисуем пол арены
        for (let y = 0; y < arena.height; y++) {
            for (let x = 0; x < arena.width; x++) {
                const screenX = (offsetX + x) * tileW;
                const screenY = (offsetY + y) * tileH;
                
                // Рисуем тайл пола
                TilesetRenderer.draw(ctx, arena.floorChar, offsetX + x, offsetY + y, arena.floorColor);
            }
        }

        // 3. Рисуем вражеские юниты
        if (enemyUnits) {
            enemyUnits.forEach(unit => {
                if (unit.hp > 0) {
                    const sx = offsetX + unit.x;
                    const sy = offsetY + unit.y;
                    
                    // Получаем цвет морали
                    const color = TacticalArmyModule.getUnitColor(unit);
                    
                    // Рисуем спрайт юнита
                    TilesetRenderer.draw(ctx, unit.type.sprite, sx, sy, color);
                    
                    // Можно добавить HP бар поверх спрайта (опционально)
                    drawHPBar(ctx, sx, sy, unit.hp, unit.maxHp, tileW);
                }
            });
        }

        // 4. Рисуем игрока и его армию
        if (playerUnit) {
            const sx = offsetX + playerUnit.x;
            const sy = offsetY + playerUnit.y;
            TilesetRenderer.draw(ctx, playerUnit.char, sx, sy, playerUnit.color);
        }

        if (playerArmy) {
            playerArmy.forEach(unit => {
                if (unit.hp > 0) {
                    const sx = offsetX + unit.x;
                    const sy = offsetY + unit.y;
                    const color = TacticalArmyModule.getUnitColor(unit);
                    TilesetRenderer.draw(ctx, unit.type.sprite, sx, sy, color);
                    drawHPBar(ctx, sx, sy, unit.hp, unit.maxHp, tileW);
                }
            });
        }

        // 5. Рисуем тактическое меню (внизу экрана)
        drawTacticalUI(ctx, currentTactic);
    }

    /**
     * Отрисовка полоски HP над юнитом
     */
    function drawHPBar(ctx, sx, sy, hp, maxHp, size) {
        const percent = hp / maxHp;
        const barW = size;
        const barH = 4;
        const y = sy * size - 6; // Чуть выше спрайта
        
        // Фон
        ctx.fillStyle = '#333';
        ctx.fillRect(sx * size, y, barW, barH);
        
        // Заполнение
        ctx.fillStyle = percent > 0.5 ? '#0f0' : (percent > 0.2 ? '#ff0' : '#f00');
        ctx.fillRect(sx * size, y, barW * percent, barH);
    }

    /**
     * Отрисовка меню выбора тактики
     */
    function drawTacticalUI(ctx, currentTactic) {
        const h = ctx.canvas.height;
        const w = ctx.canvas.width;
        
        // Панель меню
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, h - 60, w, 60);
        ctx.strokeStyle = '#58a6ff';
        ctx.strokeRect(0, h - 60, w, 60);

        ctx.font = '12px Consolas, monospace';
        ctx.textBaseline = 'middle';
        
        let yPos = h - 45;
        let xPos = 20;

        // Выводим доступные тактики
        const tactics = Object.values(TacticalDataModule.PLAYER_TACTICS);
        tactics.forEach(tactic => {
            const isSelected = currentTactic === tactic.id;
            ctx.fillStyle = isSelected ? '#ffd700' : '#fff';
            ctx.fillText(`${tactic.key}. ${tactic.name}`, xPos, yPos);
            xPos += 150; // Отступ между кнопками
        });
    }

    return {
        drawBattlefield: drawBattlefield
    };
})();
