// tileset_renderer.js
const TilesetRenderer = (function() {
    const TILE_SIZE = 16;
    const spriteSheets = {};
    let isReady = false;

    // === МАППИНГ: символ → (файл, колонка, строка) ===
    // ВАЖНО: Ключи должны быть УНИКАЛЬНЫМИ. 
    // Приоритет: Существа > Предметы > Тайлы.
    const TILE_MAP = {
        // --- ТАЙЛЫ (Terrain) ---
        '.': { file: 'terrain_sprites', x: 0, y: 1 }, // Пол / Равнина
        '#': { file: 'terrain_sprites', x: 1, y: 2 }, // Стена
        '>': { file: 'terrain_sprites', x: 3, y: 0 }, // Лестница вверх
        '<': { file: 'terrain_sprites', x: 2, y: 0 }, // Лестница вниз
        '≈': { file: 'terrain_sprites', x: 7, y: 2 }, // Вода
        '█': { file: 'terrain_sprites', x: 11, y: 2 }, // Дорога / Стена города
        'o': { file: 'terrain_sprites', x: 3, y: 2 }, // Органический пол
        'O': { file: 'terrain_sprites', x: 4, y: 2 }, // Органическая стена
        
        // Глобальная карта (уникальные символы)
        'T': { file: 'terrain_sprites', x: 8, y: 2 }, // Лес
        '^': { file: 'terrain_sprites', x: 5, y: 2 }, // Горы
        'C': { file: 'terrain_sprites', x: 9, y: 2 }, // Город
        'D': { file: 'terrain_sprites', x: 6, y: 0 }, // Вход в подземелье

        // --- СУЩЕСТВА (Creatures) ---
        '@': { file: 'creature_sprites', x: 2, y: 0 }, // Игрок
        'r': { file: 'creature_sprites', x: 8, y: 9 }, // Крыса
        'g': { file: 'creature_sprites', x: 12, y: 3 }, // Гоблин
        'w': { file: 'creature_sprites', x: 1, y: 9 }, // Волк
        'j': { file: 'creature_sprites', x: 3, y: 15 }, // Слизень
        'b': { file: 'creature_sprites', x: 5, y: 0 }, // Бандит
        's': { file: 'creature_sprites', x: 6, y: 0 }, // Скелет
        
        'k': { file: 'creature_sprites', x: 7, y: 0 }, // Орк (был O, стал k)
        'z': { file: 'creature_sprites', x: 8, y: 0 }, // Зомби
        'h': { file: 'creature_sprites', x: 9, y: 0 }, // Гарпия
        'G': { file: 'creature_sprites', x: 10, y: 0 }, // Призрак
        'V': { file: 'creature_sprites', x: 11, y: 0 }, // Вампир
        't': { file: 'creature_sprites', x: 12, y: 0 }, // Тролль (был T, стал t)
        'L': { file: 'creature_sprites', x: 13, y: 0 }, // Лич
        'M': { file: 'creature_sprites', x: 14, y: 0 }, // Голем
        'q': { file: 'creature_sprites', x: 15, y: 0 }, // Дракон
        '☺': { file: 'creature_sprites', x: 8, y: 3 }, // NPC

        // --- ПРЕДМЕТЫ (Items) ---
        '/': { file: 'item_sprites', x: 0, y: 0 }, // Меч
        'P': { file: 'item_sprites', x: 1, y: 0 }, // Топор (был ^, стал P)
        ')': { file: 'item_sprites', x: 2, y: 0 }, // Булава
        '*': { file: 'item_sprites', x: 3, y: 0 }, // Кинжал
        'Y': { file: 'item_sprites', x: 4, y: 0 }, // Копье
        '(': { file: 'item_sprites', x: 5, y: 0 }, // Лук
        '=': { file: 'item_sprites', x: 6, y: 0 }, // Арбалет
        '|': { file: 'item_sprites', x: 7, y: 0 }, // Посох
        ']': { file: 'item_sprites', x: 8, y: 0 }, // Кожа
        '[': { file: 'item_sprites', x: 9, y: 0 }, // Кольчуга
        '}': { file: 'item_sprites', x: 10, y: 0 }, // Щит
        '"': { file: 'item_sprites', x: 11, y: 0 }, // Наголенники (был o, стал ")
        '{': { file: 'item_sprites', x: 12, y: 0 }, // Плащ
        'H': { file: 'item_sprites', x: 13, y: 0 }, // Шлем
        'v': { file: 'item_sprites', x: 14, y: 0 }, // Перчатки (исправлено с ''' на 'v')
        '!': { file: 'item_sprites', x: 14, y: 0 }, // Зелье (координаты те же, что у перчаток? Проверьте PNG)
        '+': { file: 'item_sprites', x: 15, y: 0 }, // Эликсир
        '%': { file: 'item_sprites', x: 16, y: 0 }, // Еда
        '~': { file: 'item_sprites', x: 17, y: 0 }, // Мясо
        '$': { file: 'item_sprites', x: 18, y: 0 }  // Золото
    };

    async function init() {
        const files = [
            { src: 'terrain_sprites.png', key: 'terrain_sprites' },
            { src: 'creature_sprites.png', key: 'creature_sprites' },
            { src: 'item_sprites.png', key: 'item_sprites' }
        ];
        
        await Promise.all(files.map(({src, key}) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                spriteSheets[key] = img;
                resolve();
            };
            img.onerror = () => reject();
            img.src = src;
        })));
        
        isReady = true;
    }

    function draw(ctx, ch, sx, sy, color) {
        if (!ctx) return;
        const destX = sx * TILE_SIZE;
        const destY = sy * TILE_SIZE;
        const tile = TILE_MAP[ch];
        
        // 1. Если символ не найден в маппинге
        if (!tile) {
            // Это нормально для некоторых символов, просто рисуем текст
            ctx.fillStyle = color || '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, destX + TILE_SIZE/2, destY + TILE_SIZE/2);
            return;
        }

        const img = spriteSheets[tile.file];
        
        // 2. Если картинка не загрузилась
        if (!img || !isReady) {
            console.warn(`⚠️ Спрайт не готов: ${tile.file} для символа '${ch}'`);
            ctx.fillStyle = '#ff0000'; // Красный
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.fillText('NO IMG', destX + 2, destY + 10);
            return;
        }

        const srcX = tile.x * TILE_SIZE;
        const srcY = tile.y * TILE_SIZE;

        // 3. Если координаты выходят за границы
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            console.error(`❌ OOB Error: Символ '${ch}' (${tile.file}) координаты ${tile.x},${tile.y} вне границ изображения ${img.width}x${img.height}`);
            ctx.fillStyle = '#ffff00'; // Желтый
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#000';
            ctx.font = '10px Arial';
            ctx.fillText('OOB', destX + 2, destY + 5);
            return;
        }

        // 4. Попытка отрисовки
        try {
            ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);
            
            // Окраска
            const fillColor = color || '#ffffff';
            if (fillColor && fillColor !== '#000') {
                ctx.save();
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = fillColor;
                ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
                ctx.restore();
            }
        } catch (e) {
            console.error(`💥 Ошибка отрисовки спрайта '${ch}':`, e);
            ctx.fillStyle = '#purple';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }
    }

    return { init, draw, TILE_SIZE, isReady: () => isReady };
})();
