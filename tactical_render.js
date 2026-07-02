/**
 * МОДУЛЬ ОТРИСОВКИ ТАКТИЧЕСКОГО БОЯ (tactical_render.js)
 * Отвечает за визуализацию поля боя, юнитов и UI тактики.
 */

const TacticalRenderModule = (function() {
    'use strict';

    /**
     * Вспомогательная функция для отрисовки HP бара
     */
    function drawHPBar(ctx, sx, sy, hp, maxHp, tileW) {
        if (hp >= maxHp) return; // Не рисуем, если здоровье полное
        
        const percent = hp / maxHp;
        const barWidth = tileW - 4;
        const barHeight = 4;
        
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

    /**
     * Отрисовка всего тактического экрана
     */
    function drawBattlefield(arena, playerUnit, enemyUnits, playerArmy, currentTactic) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        const tileW = RenderModule.TILE_SIZE;
        const tileH = RenderModule.TILE_SIZE;

        // 1. Очистка и фон
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Центрируем арену на экране (в пикселях)
        const arenaPixelWidth = arena.width * tileW;
        const arenaPixelHeight = arena.height * tileH;
        
        const offsetX = Math.floor((ctx.canvas.width - arenaPixelWidth) / 2);
        const offsetY = Math.floor((ctx.canvas.height - arenaPixelHeight) / 2);

        // Базовые координаты сетки (левый верхний угол арены)
        const baseGridX = Math.floor(offsetX / tileW);
        const baseGridY = Math.floor(offsetY / tileH);

        // 2. Рисуем пол арены
        for (let y = 0; y < arena.height; y++) {
            for (let x = 0; x < arena.width; x++) {
                TilesetRenderer.draw(ctx, arena.floorChar, baseGridX + x, baseGridY + y, arena.floorColor);
            }
        }

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
            
            TilesetRenderer.draw(ctx, playerUnit.char, gridX, gridY, playerUnit.color || '#fff');
            drawHPBar(ctx, gridX, gridY, playerUnit.hp, playerUnit.maxHp, tileW);
        }

        if (playerArmy) {
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

        // 5. Рисуем тактическое меню (внизу экрана)
        drawTacticalUI(ctx, currentTactic);
    }

    return {
        drawBattlefield: drawBattlefield
    };
})();
