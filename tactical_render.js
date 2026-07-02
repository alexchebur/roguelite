/**
 * МОДУЛЬ ОТРИСОВКИ ТАКТИЧЕСКОГО БОЯ (tactical_render.js)
 */

const TacticalRenderModule = (function() {
    'use strict';

    /**
     * Вспомогательная функция для отрисовки HP бара
     */
    function drawHPBar(ctx, sx, sy, hp, maxHp, tileW) {
        if (hp >= maxHp) return; 
        
        const percent = hp / maxHp;
        const barWidth = tileW - 4;
        const barHeight = 4;
        
        // Координаты бара (немного выше спрайта)
        const bx = sx * tileW + 2;
        const by = sy * tileW - 6; // Используем tileW для высоты тоже, так как тайлы квадратные

        // Фон бара
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barWidth, barHeight);
        
        // Заполнение
        if (percent > 0.66) ctx.fillStyle = '#0f0';      
        else if (percent > 0.33) ctx.fillStyle = '#ff0'; 
        else ctx.fillStyle = '#f00';                     
        
        ctx.fillRect(bx, by, barWidth * percent, barHeight);
    }

    /**
     * Отрисовка всего тактического экрана
     */
    function drawBattlefield(arena, playerUnit, enemyUnits, playerArmy, currentTactic) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        // ВАЖНО: Используем TILE_SIZE из TilesetRenderer, так как именно он рисует спрайты
        const tileW = TilesetRenderer.TILE_SIZE; 
        const tileH = TilesetRenderer.TILE_SIZE;

        // 1. Очистка и фон
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Центрируем арену на экране (в пикселях)
        const arenaPixelWidth = arena.width * tileW;
        const arenaPixelHeight = arena.height * tileH;
        
        const offsetX = Math.floor((ctx.canvas.width - arenaPixelWidth) / 2);
        const offsetY = Math.floor((ctx.canvas.height - arenaPixelHeight) / 2);

        // Базовые координаты сетки (левый верхний угол арены)
        // Теперь они будут корректными, так как tileW совпадает с тем, что внутри TilesetRenderer
        const baseGridX = Math.floor(offsetX / tileW);
        const baseGridY = Math.floor(offsetY / tileH);

        console.log(`🎨 [Tactical] Отрисовка поля. Canvas: ${ctx.canvas.width}x${ctx.canvas.height}. ArenaPx: ${arenaPixelWidth}x${arenaPixelHeight}. BaseGrid: (${baseGridX}, ${baseGridY})`);

        // 2. Рисуем пол арены
        for (let y = 0; y < arena.height; y++) {
            for (let x = 0; x < arena.width; x++) {
                TilesetRenderer.draw(ctx, arena.floorChar, baseGridX + x, baseGridY + y, arena.floorColor);
            }
        }

        // ... остальной код отрисовки юнитов без изменений ...
        // 3. Рисуем вражеские юниты
        if (enemyUnits) {
            enemyUnits.forEach(unit => {
                if (unit.hp > 0) {
                    const gridX = baseGridX + unit.x;
                    const gridY = baseGridY + unit.y;
                    
                    const color = TacticalArmyModule.getUnitColor(unit);
                    
                    let spriteChar = '?';
                    if (unit.type && unit.type.sprite) {
                        spriteChar = unit.type.sprite;
                    } else if (unit.char) {
                        spriteChar = unit.char;
                    }

                    TilesetRenderer.draw(ctx, spriteChar, gridX, gridY, color);
                    drawHPBar(ctx, gridX, gridY, unit.hp, unit.maxHp, tileW);
                }
            });
        }

        // 4. Рисуем игрока и его армию
        if (playerUnit) {
            const gridX = baseGridX + playerUnit.x;
            const gridY = baseGridY + playerUnit.y;
            
            console.log(`👤 [Tactical] Рисуем игрока в сетке (${gridX}, ${gridY}) со спрайтом '${playerUnit.char}'`);

            TilesetRenderer.draw(ctx, playerUnit.char, gridX, gridY, playerUnit.color || '#fff');
            drawHPBar(ctx, gridX, gridY, playerUnit.hp, playerUnit.maxHp, tileW);
        }

        if (playerArmy && playerArmy.length > 0) {
            playerArmy.forEach(unit => {
                if (unit.hp > 0) {
                    const gridX = baseGridX + unit.x;
                    const gridY = baseGridY + unit.y;
                    
                    const color = TacticalArmyModule.getUnitColor(unit);
                    
                    let spriteChar = '?';
                    if (unit.type && unit.type.sprite) {
                        spriteChar = unit.type.sprite;
                    } else if (unit.char) {
                        spriteChar = unit.char;
                    }

                    TilesetRenderer.draw(ctx, spriteChar, gridX, gridY, color);
                    drawHPBar(ctx, gridX, gridY, unit.hp, unit.maxHp, tileW);
                }
            });
        }
        
        // Нижнее меню больше не рисуем здесь! Оно теперь в инвентаре.
    }

    return {
        drawBattlefield: drawBattlefield
    };
})();
// <--- ДОБАВИТЬ СЮДА ЭТУ СТРОКУ
window.TacticalRenderModule = TacticalRenderModule;
