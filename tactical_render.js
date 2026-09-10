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
// tactical_render.js

function drawBattlefield(arena, playerUnit, enemyUnits, playerArmy, currentTactic) {
    const ctx = RenderModule._ctx;
    if (!ctx) return;

    // Используем размер тайла из спрайтового рендерера
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

    // 3. Рисуем пол арены
    for (let y = 0; y < arena.height; y++) {
        for (let x = 0; x < arena.width; x++) {
            // Рисуем тайл пола по пиксельным координатам
            const pixelX = offsetX + x * tileW;
            const pixelY = offsetY + y * tileH;
            
            // TilesetRenderer.draw ожидает координаты клетки (screenX, screenY).
            // Нам нужно перевести пиксели обратно в клетки для вызова draw, 
            // но проще использовать прямой вызов drawImage или адаптировать логику.
            // Так как TilesetRenderer.draw принимает screenX/screenY как индексы клеток:
            // Мы можем вычислить "виртуальные" индексы клеток относительно левого верхнего угла канваса
            const gridX = Math.floor(pixelX / tileW);
            const gridY = Math.floor(pixelY / tileH);
            
            TilesetRenderer.draw(ctx, arena.floorChar, gridX, gridY, arena.floorColor);
        }
    }

    // Вспомогательная функция для HP баров
    function drawHPBar(unitX, unitY, hp, maxHp) {
        const percent = Math.max(0, Math.min(1, hp / maxHp));
        
        // Пиксельные координаты юнита
        const px = offsetX + unitX * tileW;
        const py = offsetY + unitY * tileH;

        // Координаты бара (над спрайтом)
        const bx = px + 2;
        const by = py - 6; 
        const barWidth = tileW - 4;
        const barHeight = 2; 

        // Фон бара
        ctx.fillStyle = '#222';
        ctx.fillRect(bx, by, barWidth, barHeight);

        // Заполнение цветом
        if (percent > 0.66) ctx.fillStyle = '#0f0';      
        else if (percent > 0.33) ctx.fillStyle = '#ff0'; 
        else ctx.fillStyle = '#f00';                     
        
        ctx.fillRect(bx, by, barWidth * percent, barHeight);
        
        // Тонкая рамка
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barWidth, barHeight);
    }

    // Функция отрисовки юнита
    function drawUnit(unit, charOverride) {
        if (unit.hp <= 0) return;

        let spriteChar = charOverride || '?';
        if (!charOverride) {
            if (unit.char) spriteChar = unit.char;
            else if (unit.sprite) spriteChar = unit.sprite;
            else if (unit.type && typeof unit.type === 'object') {
                if (unit.type.sprite) spriteChar = unit.type.sprite;
                else if (unit.type.id === 'archer') spriteChar = 's';
                else if (unit.type.id === 'cavalry') spriteChar = 'w';
                else if (unit.type.id === 'spearman') spriteChar = 'g';
            } else if (typeof unit.type === 'string') {
                 if (unit.type === 'archer') spriteChar = 's';
                 else if (unit.type === 'cavalry') spriteChar = 'w';
                 else if (unit.type === 'spearman') spriteChar = 'g';
            }
        }

        const color = TacticalArmyModule.getUnitColor(unit);
        
        // Вычисляем позицию на сетке канваса на основе смещения
        const gridX = Math.floor((offsetX + unit.x * tileW) / tileW);
        const gridY = Math.floor((offsetY + unit.y * tileH) / tileH);

        TilesetRenderer.draw(ctx, spriteChar, gridX, gridY, color);
        drawHPBar(unit.x, unit.y, unit.hp, unit.maxHp);
    }

    // 4. Рисуем вражеские юниты
    if (enemyUnits) {
        enemyUnits.forEach(unit => drawUnit(unit));
    }

    // 5. Рисуем игрока
    if (playerUnit) {
        drawUnit(playerUnit, playerUnit.char || '@');
    }

    // 6. Рисуем армию игрока
    if (playerArmy) {
        playerArmy.forEach(unit => drawUnit(unit));
    }

    // 7. Отрисовка снарядов
    if (typeof RenderModule !== 'undefined' && RenderModule.drawTacticalEffects) {
        RenderModule.drawTacticalEffects(ctx, arena);
    }
}

    return {
        drawBattlefield: drawBattlefield
    };
})();

window.TacticalRenderModule = TacticalRenderModule;
