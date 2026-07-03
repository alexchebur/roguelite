/**
 * МОДУЛЬ ОТРИСОВКИ ТАКТИЧЕСКОГО БОЯ (tactical_render.js)
 */
const TacticalRenderModule = (function() {
    'use strict';

    /**
     * Отрисовка всего тактического экрана
     */
    function drawBattlefield(arena, playerUnit, enemyUnits, playerArmy, currentTactic) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        // Используем размер тайла из спрайтового рендерера (16px)
        const tileW = TilesetRenderer.TILE_SIZE; 
        const tileH = TilesetRenderer.TILE_SIZE;

        // 1. Очистка экрана
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // 2. Расчет центрирования арены
        const arenaPixelWidth = arena.width * tileW;
        const arenaPixelHeight = arena.height * tileH;
        
        // Так как мы исправили размеры арены (28x18), offsetX и offsetY будут положительными
        const offsetX = Math.floor((ctx.canvas.width - arenaPixelWidth) / 2);
        const offsetY = Math.floor((ctx.canvas.height - arenaPixelHeight) / 2);

        // Базовые координаты сетки (в тайлах)
        const baseGridX = Math.floor(offsetX / tileW);
        const baseGridY = Math.floor(offsetY / tileH);

        // 3. Рисуем пол арены
        for (let y = 0; y < arena.height; y++) {
            for (let x = 0; x < arena.width; x++) {
                TilesetRenderer.draw(ctx, arena.floorChar, baseGridX + x, baseGridY + y, arena.floorColor);
            }
        }

        // Вспомогательная функция для HP баров (принимает координаты сетки)
        function drawHPBar(gridX, gridY, hp, maxHp) {
            if (hp >= maxHp) return; 
            const percent = hp / maxHp;
            const bx = gridX * tileW + 2;
            const by = gridY * tileH - 5; // Чуть выше спрайта
            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, tileW - 4, 4);
            ctx.fillStyle = percent > 0.66 ? '#0f0' : (percent > 0.33 ? '#ff0' : '#f00');
            ctx.fillRect(bx, by, (tileW - 4) * percent, 4);
        }

        // 4. Рисуем вражеские юниты
        if (enemyUnits) {
            enemyUnits.forEach(unit => {
                if (unit.hp > 0) {
                    const gridX = baseGridX + unit.x;
                    const gridY = baseGridY + unit.y;
                    const spriteChar = (unit.type && unit.type.sprite) ? unit.type.sprite : '?';
                    const color = TacticalArmyModule.getUnitColor(unit);
                    
                    TilesetRenderer.draw(ctx, spriteChar, gridX, gridY, color);
                    drawHPBar(gridX, gridY, unit.hp, unit.maxHp);
                }
            });
        }

        // 5. Рисуем игрока
        if (playerUnit) {
            const gridX = baseGridX + playerUnit.x;
            const gridY = baseGridY + playerUnit.y;
            
            TilesetRenderer.draw(ctx, playerUnit.char || '@', gridX, gridY, playerUnit.color || '#fff');
            drawHPBar(gridX, gridY, playerUnit.hp, playerUnit.maxHp);
        }

        // 6. Рисуем армию игрока
        if (playerArmy) {
            playerArmy.forEach(unit => {
                if (unit.hp > 0) {
                    const gridX = baseGridX + unit.x;
                    const gridY = baseGridY + unit.y;
                    const spriteChar = unit.char || (unit.type && unit.type.sprite) || '?';
                    const color = TacticalArmyModule.getUnitColor(unit);
                    
                    TilesetRenderer.draw(ctx, spriteChar, gridX, gridY, color);
                    drawHPBar(gridX, gridY, unit.hp, unit.maxHp);
                }
            });
        }
    }

    return {
        drawBattlefield: drawBattlefield
    };
})();

window.TacticalRenderModule = TacticalRenderModule;

    return {
        drawBattlefield: drawBattlefield
    };
})();
// <--- ДОБАВИТЬ СЮДА ЭТУ СТРОКУ
window.TacticalRenderModule = TacticalRenderModule;
