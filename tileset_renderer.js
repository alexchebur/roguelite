// tileset_renderer.js
const TilesetRenderer = (function() {
    const TILE_SIZE = 16;
    const spriteSheets = {};
    let isReady = false;
    let debugMode = false;

    // === МАППИНГ: символ → (файл, колонка, строка) ===
    // Убедитесь, что координаты x,y соответствуют вашему PNG!
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

        //  Creatures & NPCs
        '@': { file: 'creature', x: 0, y: 0 },
        'r': { file: 'creature', x: 1, y: 0 },
        'g': { file: 'creature', x: 2, y: 0 },
        'w': { file: 'creature', x: 3, y: 0 },
        'j': { file: 'creature', x: 4, y: 0 },
        'b': { file: 'creature', x: 5, y: 0 },
        's': { file: 'creature', x: 6, y: 0 },
        'O': { file: 'creature', x: 7, y: 0 }, 
        'z': { file: 'creature', x: 8, y: 0 },
        'h': { file: 'creature', x: 9, y: 0 },
        'G': { file: 'creature', x: 10, y: 0 },
        'V': { file: 'creature', x: 11, y: 0 },
        'T': { file: 'creature', x: 12, y: 0 },
        'L': { file: 'creature', x: 13, y: 0 },
        'M': { file: 'creature', x: 14, y: 0 },
        'D': { file: 'creature', x: 15, y: 0 },
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
        const files = [
            { src: 'terrain_sprites.png', key: 'terrain' },
            { src: 'creature_sprites.png', key: 'creature' },
            { src: 'item_sprites.png', key: 'item' }
        ];
        
        // Исправленный Promise.all с правильными скобками
        await Promise.all(files.map(({src, key}) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                spriteSheets[key] = img;
                console.log(`✅ Загружен тайлсет: ${key} (${img.width}x${img.height})`);
                resolve();
            };
            img.onerror = () => {
                console.error(`❌ Ошибка загрузки: ${src}`);
                reject();
            };
            img.src = src;
        })));
        
        isReady = true;
    }

    function draw(ctx, ch, sx, sy, color) {
        if (!ctx) return;

        const destX = sx * TILE_SIZE;
        const destY = sy * TILE_SIZE;

        // 1. Проверяем маппинг
        const tile = TILE_MAP[ch];
        
        // Если нет маппинга, рисуем текст (как было)
        if (!tile) {
            ctx.fillStyle = color || '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, destX + TILE_SIZE/2, destY + TILE_SIZE/2);
            return;
        }

        const img = spriteSheets[tile.file];
        
        // Если тайлсет не загружен, рисуем красный квадрат с ошибкой
        if (!img || !isReady) {
            ctx.fillStyle = '#ff0000'; // КРАСНЫЙ = не загружено
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.fillText('ERR', destX + 2, destY + 10);
            return;
        }

        const srcX = tile.x * TILE_SIZE;
        const srcY = tile.y * TILE_SIZE;

        // === ДИАГНОСТИКА: Рисуем рамку, чтобы видеть границы клетки ===
        ctx.save();
        ctx.strokeStyle = '#00ff00'; // ЗЕЛЕНАЯ РАМКА = клетка отрисована
        ctx.lineWidth = 1;
        ctx.strokeRect(destX, destY, TILE_SIZE, TILE_SIZE);
        ctx.restore();

        // Сохраняем состояние
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        // 2. Рисуем спрайт
        // ВАЖНО: Убедимся, что координаты не выходят за пределы изображения
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00'; // ЖЕЛТЫЙ = координаты вне картинки
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            ctx.restore();
            return;
        }

        try {
            ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);
        } catch (e) {
            console.error("Ошибка drawImage:", e);
        }

        // 3. Красим спрайт
        const fillColor = color || '#ffffff';
        if (fillColor && fillColor !== '#000' && fillColor !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = fillColor;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }

        ctx.restore();
    }

    return { 
        init, 
        draw, 
        TILE_SIZE,
        setDebug: (v) => debugMode = v,
        isReady: () => isReady
    };
})();
