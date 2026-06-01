// tileset_renderer.js
const TilesetRenderer = (function() {
    const TILE_SIZE = 16;
    const spriteSheets = {};
    let isReady = false;

    // === МАППИНГ: символ → (файл, колонка, строка) ===
    const TILE_MAP = {
        // 🌍 Terrain
        '#': { file: 'terrain', x: 0, y: 0 },   // Стена
        '.': { file: 'terrain', x: 1, y: 0 },   // Пол
        '>': { file: 'terrain', x: 2, y: 0 },   // Лестница вверх
        '<': { file: 'terrain', x: 3, y: 0 },   // Лестница вниз
        'T': { file: 'terrain', x: 4, y: 0 },   // Дерево
        '^': { file: 'terrain', x: 5, y: 0 },   // Гора
        '≈': { file: 'terrain', x: 6, y: 0 },   // Вода
        'C': { file: 'terrain', x: 7, y: 0 },   // Город
        'D': { file: 'terrain', x: 8, y: 0 },   // Подземелье
        '█': { file: 'terrain', x: 9, y: 0 },   // Дорога
        '·': { file: 'terrain', x: 10, y: 0 },  // Пустырь
        'o': { file: 'terrain', x: 11, y: 0 },  // Куст
        'O': { file: 'terrain', x: 12, y: 0 },  // Скала

        // 👤 Creatures & NPCs
        '@': { file: 'creature', x: 0, y: 0 },  // Игрок
        'r': { file: 'creature', x: 1, y: 0 },  // Крыса
        'g': { file: 'creature', x: 2, y: 0 },  // Гоблин
        'w': { file: 'creature', x: 3, y: 0 },  // Волк
        'j': { file: 'creature', x: 4, y: 0 },  // Слизень
        'b': { file: 'creature', x: 5, y: 0 },  // Бандит
        's': { file: 'creature', x: 6, y: 0 },  // Скелет
        'O': { file: 'creature', x: 7, y: 0 },  // Орк
        'z': { file: 'creature', x: 8, y: 0 },  // Зомби
        'h': { file: 'creature', x: 9, y: 0 },  // Гарпия
        'G': { file: 'creature', x: 10, y: 0 }, // Призрак
        'V': { file: 'creature', x: 11, y: 0 }, // Вампир
        'T': { file: 'creature', x: 12, y: 0 }, // Тролль
        'L': { file: 'creature', x: 13, y: 0 }, // Лич
        'M': { file: 'creature', x: 14, y: 0 }, // Голем
        'D': { file: 'creature', x: 15, y: 0 }, // Дракон
        '☺': { file: 'creature', x: 16, y: 0 }, // NPC

        // 🎒 Items
        '/': { file: 'item', x: 0, y: 0 },      // Меч
        '^': { file: 'item', x: 1, y: 0 },      // Топор
        ')': { file: 'item', x: 2, y: 0 },      // Булава
        '*': { file: 'item', x: 3, y: 0 },      // Кинжал
        'Y': { file: 'item', x: 4, y: 0 },      // Копьё
        '(': { file: 'item', x: 5, y: 0 },      // Лук
        '=': { file: 'item', x: 6, y: 0 },      // Арбалет
        '|': { file: 'item', x: 7, y: 0 },      // Посох
        ']': { file: 'item', x: 8, y: 0 },      // Броня
        '[': { file: 'item', x: 9, y: 0 },      // Кольчуга
        '}': { file: 'item', x: 10, y: 0 },     // Щит
        '{': { file: 'item', x: 11, y: 0 },     // Плащ
        'H': { file: 'item', x: 12, y: 0 },     // Шлем
        '!': { file: 'item', x: 14, y: 0 },     // Зелье
        '+': { file: 'item', x: 15, y: 0 },     // Эликсир
        '%': { file: 'item', x: 16, y: 0 },     // Еда
        '~': { file: 'item', x: 17, y: 0 },     // Еда
        '$': { file: 'item', x: 18, y: 0 }      // Золото
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
            img.onerror = () => {
                console.error(`❌ Не удалось загрузить: ${src}`);
                reject();
            };
            img.src = src;
        })));
        
        isReady = true;
    }

    // Рисует спрайт с автоматической окраской
    function draw(ctx, ch, sx, sy, color) {
        if (!isReady) {
            // Fallback: рисуем символ если тайлсеты не загружены
            ctx.fillStyle = color || '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
            return;
        }
        
        const tile = TILE_MAP[ch];
        if (!tile) {
            // Если символ не найден в маппинге, рисуем его текстом
            ctx.fillStyle = color || '#888';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
            return;
        }
        
        const img = spriteSheets[tile.file];
        if (!img) {
            console.warn(`Тайлсет не найден: ${tile.file}`);
            ctx.fillStyle = color || '#f0f';
            ctx.fillRect(sx * TILE_SIZE, sy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            return;
        }

        const destX = sx * TILE_SIZE;
        const destY = sy * TILE_SIZE;
        const srcX = tile.x * TILE_SIZE;
        const srcY = tile.y * TILE_SIZE;

        // 1. Очищаем область (на случай если предыдущий кадр что-то оставил)
        ctx.clearRect(destX, destY, TILE_SIZE, TILE_SIZE);

        // 2. Рисуем белый спрайт
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // 3. Красим спрайт (работает ТОЛЬКО для белых пикселей на прозрачном фоне)
        // Используем цвет, или белый по умолчанию если цвет не задан
        const fillColor = color || '#ffffff';
        
        if (fillColor && fillColor !== '#000' && fillColor !== '#000000') {
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = fillColor;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            ctx.restore();
        }
    }

    return { 
        init, 
        draw, 
        TILE_SIZE,
        isReady: () => isReady
    };
})();
