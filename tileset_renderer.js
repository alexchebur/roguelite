// tileset_renderer.js
const TilesetRenderer = (function() {
    const TILE_SIZE = 16;
    const spriteSheets = {};
    let isReady = false;
    let debugMode = false; // Включите true, если нужно видеть цветные квадраты вместо спрайтов

    // === МАППИНГ: символ → (файл, колонка, строка) ===
    const TILE_MAP = {
        '#': { file: 'terrain', x: 0, y: 0 }, '.': { file: 'terrain', x: 1, y: 0 },
        '>': { file: 'terrain', x: 2, y: 0 }, '<': { file: 'terrain', x: 3, y: 0 },
        'T': { file: 'terrain', x: 4, y: 0 }, '^': { file: 'terrain', x: 5, y: 0 },
        '≈': { file: 'terrain', x: 6, y: 0 }, 'C': { file: 'terrain', x: 7, y: 0 },
        'D': { file: 'terrain', x: 8, y: 0 }, '█': { file: 'terrain', x: 9, y: 0 },
        '·': { file: 'terrain', x: 10, y: 0 }, 'o': { file: 'terrain', x: 11, y: 0 },
        'O': { file: 'terrain', x: 12, y: 0 },
        
        '@': { file: 'creature', x: 0, y: 0 }, 'r': { file: 'creature', x: 1, y: 0 },
        'g': { file: 'creature', x: 2, y: 0 }, 'w': { file: 'creature', x: 3, y: 0 },
        'j': { file: 'creature', x: 4, y: 0 }, 'b': { file: 'creature', x: 5, y: 0 },
        's': { file: 'creature', x: 6, y: 0 }, 'O': { file: 'creature', x: 7, y: 0 },
        'z': { file: 'creature', x: 8, y: 0 }, 'h': { file: 'creature', x: 9, y: 0 },
        'G': { file: 'creature', x: 10, y: 0 }, 'V': { file: 'creature', x: 11, y: 0 },
        'T': { file: 'creature', x: 12, y: 0 }, 'L': { file: 'creature', x: 13, y: 0 },
        'M': { file: 'creature', x: 14, y: 0 }, 'D': { file: 'creature', x: 15, y: 0 },
        '☺': { file: 'creature', x: 16, y: 0 },

        '/': { file: 'item', x: 0, y: 0 }, '^': { file: 'item', x: 1, y: 0 },
        ')': { file: 'item', x: 2, y: 0 }, '*': { file: 'item', x: 3, y: 0 },
        'Y': { file: 'item', x: 4, y: 0 }, '(': { file: 'item', x: 5, y: 0 },
        '=': { file: 'item', x: 6, y: 0 }, '|': { file: 'item', x: 7, y: 0 },
        ']': { file: 'item', x: 8, y: 0 }, '[': { file: 'item', x: 9, y: 0 },
        '}': { file: 'item', x: 10, y: 0 }, '{': { file: 'item', x: 11, y: 0 },
        'H': { file: 'item', x: 12, y: 0 }, '!': { file: 'item', x: 14, y: 0 },
        '+': { file: 'item', x: 15, y: 0 }, '%': { file: 'item', x: 16, y: 0 },
        '~': { file: 'item', x: 17, y: 0 }, '$': { file: 'item', x: 18, y: 0 }
    };

    async function init() {
        const files = [
            { src: 'terrain_sprites.png', key: 'terrain' },
            { src: 'creature_sprites.png', key: 'creature' },
            { src: 'item_sprites.png', key: 'item' }
        ];
        
        await Promise.all(files.map(({src, key}) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                spriteSheets[key] = img;
                console.log(`✅ Загружен тайлсет: ${key} (${img.width}x${img.height})`);
                resolve();
            };
            img.onerror = () => { console.error(`❌ Ошибка загрузки: ${src}`); reject(); };
            img.src = src;
        }));
        isReady = true;
    }

    // Рисует спрайт с полной изоляцией состояния контекста
    function draw(ctx, ch, sx, sy, color) {
        const destX = sx * TILE_SIZE;
        const destY = sy * TILE_SIZE;

        // 1. Проверяем маппинг
        const tile = TILE_MAP[ch];
        if (!tile) {
            // Fallback: рисуем символ, если нет маппинга
            ctx.fillStyle = color || '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, destX + TILE_SIZE/2, destY + TILE_SIZE/2);
            return;
        }

        const img = spriteSheets[tile.file];
        if (!img || !isReady) {
            // Fallback: цветной квадрат если тайлсет не загружен
            ctx.fillStyle = debugMode ? '#ff00ff' : (color || '#fff');
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tile.x * TILE_SIZE;
        const srcY = tile.y * TILE_SIZE;

        // 2. Сохраняем состояние контекста перед модификациями
        ctx.save();
        
        // Сбрасываем composite operation на случай если предыдущий кадр не восстановил
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        // 3. Рисуем спрайт
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // 4. Красим (только если цвет не чёрный и не пустой)
        const fillColor = color || '#ffffff';
        if (fillColor && fillColor !== '#000' && fillColor !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = fillColor;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }

        // 5. Восстанавливаем состояние
        ctx.restore();
    }

    return { init, draw, TILE_SIZE, setDebug: (v) => debugMode = v };
})();
