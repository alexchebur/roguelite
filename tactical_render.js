/**
 * МОДУЛЬ ОТРИСОВКИ ТАКТИЧЕСКОГО БОЯ (tactical_render.js)
 */
const TacticalRenderModule = (function() {
    'use strict';

    /**
     * Отрисовка всего тактического экрана
     */
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

        // Вспомогательная функция для HP баров (рисуем ВСЕГДА)
        function drawHPBar(gridX, gridY, hp, maxHp) {
            const percent = Math.max(0, Math.min(1, hp / maxHp));
            
            // Координаты бара (над спрайтом)
            const bx = gridX * tileW + 2;
            const by = gridY * tileH - 6; 
            const barWidth = tileW - 4;
            const barHeight = 5; // Чуть толще для видимости

            // Фон бара
            ctx.fillStyle = '#222';
            ctx.fillRect(bx, by, barWidth, barHeight);

            // Заполнение цветом
            if (percent > 0.66) ctx.fillStyle = '#0f0';      // Зеленый
            else if (percent > 0.33) ctx.fillStyle = '#ff0'; // Желтый
            else ctx.fillStyle = '#f00';                     // Красный
            
            ctx.fillRect(bx, by, barWidth * percent, barHeight);
            
            // Тонкая рамка для контраста
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, barWidth, barHeight);
        }

        // 4. Рисуем вражеские юниты
        if (enemyUnits) {
            enemyUnits.forEach(unit => {
                if (unit.hp > 0) {
                    const gridX = baseGridX + unit.x;
                    const gridY = baseGridY + unit.y;
                    
                    // Определение спрайта
                    let spriteChar = '?';
                    if (unit.char) spriteChar = unit.char;
                    else if (unit.type && unit.type.sprite) spriteChar = unit.type.sprite;
                    
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
                    
                    // Определение спрайта с приоритетом
                    let spriteChar = '?';
                    if (unit.char) spriteChar = unit.char;
                    else if (unit.sprite) spriteChar = unit.sprite;
                    else if (unit.type && typeof unit.type === 'object' && unit.type.sprite) spriteChar = unit.type.sprite;
                    
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
