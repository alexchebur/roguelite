// tileset_renderer.js
const TilesetRenderer = (function() {
    const TILE_SIZE = 16;
    const spriteSheets = {};
    let isReady = false;

    // === МАППИНГ: символ → (файл, колонка, строка) ===
    // Координаты считаются в клетках тайлсета (0..31, 0..15)
    const TILE_MAP = {
        // 🌍 Terrain
        '#': { file: 'terrain', x: 0, y: 0 },
        '.': { file: 'terrain', x: 1, y: 0 },
        '>': { file: 'terrain', x: 2, y: 0 },
        '<': { file: 'terrain', x: 3, y: 0 },
        'T': { file: 'terrain', x: 4, y: 0 },
        '^': { file: 'terrain', x: 5, y: 0 },
        '≈': { file: 'terrain', x: 6, y: 0 },
        'C': { file: 'terrain', x: 7, y: 0 },
        'D': { file: 'terrain', x: 8, y: 0 },
        '█': { file: 'terrain', x: 9, y: 0 },
        '·': { file: 'terrain', x: 10, y: 0 },
        'o': { file: 'terrain', x: 11, y: 0 },
        'O': { file: 'terrain', x: 12, y: 0 },

        // 👤 Creatures & NPCs
        '@': { file: 'creature', x: 0, y: 0 },
        'r': { file: 'creature', x: 1, y: 0 },
        'g': { file: 'creature', x: 2, y: 0 },
        'w': { file: 'creature', x: 3, y: 0 },
        'j': { file: 'creature', x: 4, y: 0 },
        'b': { file: 'creature', x: 5, y: 0 },
        's': { file: 'creature', x: 6, y: 0 },
        'O': { file: 'creature', x: 7, y: 0 }, // Орк (если x,y конфликтуют с terrain, исправьте)
        'z': { file: 'creature', x: 8, y: 0 },
        'h': { file: 'creature', x: 9, y: 0 },
        'G': { file: 'creature', x: 10, y: 0 },
        'V': { file: 'creature', x: 11, y: 0 },
        'T': { file: 'creature', x: 12, y: 0 }, // Тролль
        'L': { file: 'creature', x: 13, y: 0 },
        'M': { file: 'creature', x: 14, y: 0 },
        'D': { file: 'creature', x: 15, y: 0 }, // Дракон
        '☺': { file: 'creature', x: 16, y: 0 },

        // 🎒 Items
        '/': { file: 'item', x: 0, y: 0 },
        '^': { file: 'item', x: 1, y: 0 },
        ')': { file: 'item', x: 2, y: 0 },
        '*': { file: 'item', x: 3, y: 0 },
        'Y': { file: 'item', x: 4, y: 0 },
        '(': { file: 'item', x: 5, y: 0 },
        '=': { file: 'item', x: 6, y: 0 },
        '|': { file: 'item', x: 7, y: 0 },
        ']': { file: 'item', x: 8, y: 0 },
        '[': { file: 'item', x: 9, y: 0 },
        '}': { file: 'item', x: 10, y: 0 },
        '{': { file: 'item', x: 11, y: 0 },
        'H': { file: 'item', x: 12, y: 0 },
        '!': { file: 'item', x: 14, y: 0 },
        '+': { file: 'item', x: 15, y: 0 },
        '%': { file: 'item', x: 16, y: 0 },
        '~': { file: 'item', x: 17, y: 0 },
        '$': { file: 'item', x: 18, y: 0 }
    };

    async function init() {
        const files = ['terrain_sprites.png', 'creature_sprites.png', 'item_sprites.png'];
        await Promise.all(files.map(src => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const key = src.replace('_sprites.png', '');
                spriteSheets[key] = img;
                resolve();
            };
            img.onerror = reject;
            img.src = src;
        })));
        isReady = true;
        console.log('✅ Тайлсеты загружены');
    }

    // Рисует спрайт с автоматической окраской
    function draw(ctx, ch, sx, sy, color) {
        if (!isReady) return;
        
        const tile = TILE_MAP[ch];
        const img = tile ? spriteSheets[tile.file] : null;
        const destX = sx * TILE_SIZE;
        const destY = sy * TILE_SIZE;

        if (!img) {
            // Fallback: если спрайт не найден, рисуем символ
            ctx.fillStyle = color || '#888';
            ctx.font = `${TILE_SIZE}px Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, destX + TILE_SIZE/2, destY + TILE_SIZE/2);
            return;
        }

        const srcX = tile.x * TILE_SIZE;
        const srcY = tile.y * TILE_SIZE;

        // 1. Рисуем белый спрайт
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // 2. Красим (работает ТОЛЬКО для белых пикселей на прозрачном фоне)
        if (color && color !== '#000' && color !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    return { init, draw, TILE_SIZE };
})();
