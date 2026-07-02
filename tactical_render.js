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
        
        // Центрируем арену на экране (в пикселях)
        const arenaPixelWidth = arena.width * tileW;
        const arenaPixelHeight = arena.height * tileH;
        
        const offsetX = Math.floor((ctx.canvas.width - arenaPixelWidth) / 2);
        const offsetY = Math.floor((ctx.canvas.height - arenaPixelHeight) / 2);

        // 2. Рисуем пол арены
        for (let y = 0; y < arena.height; y++) {
            for (let x = 0; x < arena.width; x++) {
                // Вычисляем экранные координаты тайла
                const screenX = offsetX + (x * tileW);
                const screenY = offsetY + (y * tileH);
                
                // Рисуем тайл пола. 
                // Важно: передаем координаты сетки (offsetX + x), а не пиксели, так как TilesetRenderer сам умножит на TILE_SIZE
                TilesetRenderer.draw(ctx, arena.floorChar, offsetX / tileW + x, offsetY / tileH + y, arena.floorColor);
            }
        }

        // Вспомогательная функция для отрисовки HP бара
        function drawHPBar(sx, sy, hp, maxHp) {
            if (hp >= maxHp) return; // Не рисуем, если здоровье полное
            
            const barWidth = tileW - 4;
            const barHeight = 4;
            const percent = hp / maxHp;
            
            // Координаты бара (немного выше спрайта)
            const bx = sx * tileW + 2;
            const by = sy * tileH - 6;

            // Фон бара
            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, barWidth, barHeight);
            
            // Заполнение (цвет зависит от %)
            if (percent > 0.66) ctx.fillStyle = '#0f0';      // Зеленый
            else if (percent > 0.33) ctx.fillStyle = '#ff0'; // Желтый
            else ctx.fillStyle = '#f00';                     // Красный
            
            ctx.fillRect(bx, by, barWidth * percent, barHeight);
        }

        // 3. Рисуем вражеские юниты
        if (enemyUnits) {
            enemyUnits.forEach(unit => {
                if (unit.hp > 0) {
                    // Координаты в сетке относительно начала арены
                    const gridX = (offsetX / tileW) + unit.x;
                    const gridY = (offsetY / tileH) + unit.y;
                    
                    // Получаем цвет морали/HP
                    const color = TacticalArmyModule.getUnitColor(unit);
                    
                    // Определяем символ спрайта
                    let spriteChar = '?';
                    if (unit.type && unit.type.sprite) {
                        spriteChar = unit.type.sprite;
                    } else if (unit.char) {
                        spriteChar = unit.char;
                    }

                    // Рисуем спрайт юнита
                    TilesetRenderer.draw(ctx, spriteChar, gridX, gridY, color);
                    
                    // Рисуем HP бар
                    drawHPBar(gridX, gridY, unit.hp, unit.maxHp);
                }
            });
        }

        // 4. Рисуем игрока и его армию
        if (playerUnit) {
            const gridX = (offsetX / tileW) + playerUnit.x;
            const gridY = (offsetY / tileH) + playerUnit.y;
            
            // Игрок всегда белый или свой цвет
            TilesetRenderer.draw(ctx, playerUnit.char, gridX, gridY, playerUnit.color || '#fff');
            
            // HP бар игрока (опционально, но полезно)
            drawHPBar(gridX, gridY, playerUnit.hp, playerUnit.maxHp);
        }

        if (playerArmy) {
            playerArmy.forEach(unit => {
                if (unit.hp > 0) {
                    const gridX = (offsetX / tileW) + unit.x;
                    const gridY = (offsetY / tileH) + unit.y;
                    
                    const color = TacticalArmyModule.getUnitColor(unit);
                    
                    let spriteChar = '?';
                    if (unit.type && unit.type.sprite) {
                        spriteChar = unit.type.sprite;
                    } else if (unit.char) {
                        spriteChar = unit.char;
                    }

                    TilesetRenderer.draw(ctx, spriteChar, gridX, gridY, color);
                    drawHPBar(gridX, gridY, unit.hp, unit.maxHp);
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

    // В tactical_render.js, внутри drawTacticalUI

    function drawTacticalUI(ctx, currentTactic) {
        const h = ctx.canvas.height;
        const w = ctx.canvas.width;
    
        // Панель меню
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, h - 60, w, 60);
        ctx.strokeStyle = '#58a6ff';
        ctx.strokeRect(0, h - 60, w, 60);

        // Уменьшаем шрифт
        ctx.font = '10px Consolas, monospace'; 
        ctx.textBaseline = 'middle';
    
        let yPos = h - 45;
        let xPos = 10; // Начинаем чуть левее

        // Выводим доступные тактики
        const tactics = Object.values(TacticalDataModule.PLAYER_TACTICS);
        tactics.forEach(tactic => {
            const isSelected = currentTactic === tactic.id;
            ctx.fillStyle = isSelected ? '#ffd700' : '#fff';
        
            // Сокращаем текст для экономии места
            let shortName = tactic.name;
            if (shortName.length > 15) {
                shortName = shortName.substring(0, 12) + '...';
            }
        
            ctx.fillText(`${tactic.key}. ${shortName}`, xPos, yPos);
            xPos += 120; // Уменьшаем отступ между кнопками
        });
    }

    return {
        drawBattlefield: drawBattlefield
    };
})();
