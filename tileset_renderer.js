/**
 * МОДУЛЬ ОТРИСОВКИ СПРАЙТОВ (TilesetRenderer)
 * Отвечает за загрузку PNG-тайлсетов и их отрисовку с программной окраской.
 */
const TilesetRenderer = (function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const TILE_SIZE = 16;
    const SPRITE_FILES = [
        { src: 'terrain_sprites.png', key: 'terrain_sprites' },
        { src: 'creature_sprites.png', key: 'creature_sprites' },
        { src: 'item_sprites.png',   key: 'item_sprites' }
    ];

    // === СОСТОЯНИЕ ===
    const spriteSheets = {};
    let isReady = false;

    // === МАППИНГ СИМВОЛОВ
    // Формат: 'символ': { file: 'ключ_картинки', x: колонка, y: ряд }
    const TILE_MAP = {
        // === ПОДЗЕМЕЛЬЕ (стандартные, без изменений) ===
        '.':  { file: 'terrain_sprites', x: 0, y: 0 },  // FLOOR_DEFAULT
        '#':  { file: 'terrain_sprites', x: 12, y: 2 },  // WALL_DEFAULT
        'o':  { file: 'terrain_sprites', x: 3, y: 2 },  // FLOOR_ORGANIC
        'O':  { file: 'terrain_sprites', x: 4, y: 2 },  // WALL_ORGANIC
        '·':  { file: 'terrain_sprites', x: 0, y: 0 },  // FLOOR_CITY
        '█':  { file: 'terrain_sprites', x: 11, y: 2 }, // WALL_CITY
        '>': { file: 'terrain_sprites', x: 3, y: 0 },  // STAIRS_UP
        '<': { file: 'terrain_sprites', x: 2, y: 0 },  // STAIRS_DOWN

        // === ГЛОБАЛЬНАЯ КАРТА (новые уникальные символы) ===
        '░':  { file: 'terrain_sprites', x: 10, y: 2 }, // TILE_PLAIN
        '─':  { file: 'terrain_sprites', x: 1, y: 2 }, // TILE_ROAD
        'T':  { file: 'terrain_sprites', x: 8, y: 2 },  // TILE_FOREST
        '^':  { file: 'terrain_sprites', x: 5, y: 2 },  // TILE_MOUNTAIN
        '≈':  { file: 'terrain_sprites', x: 7, y: 2 },  // TILE_WATER
        'C':  { file: 'terrain_sprites', x: 9, y: 2 },  // TILE_CITY
        'D':  { file: 'terrain_sprites', x: 6, y: 0 },  // TILE_DUNGEON_ENTRANCE


        // --- СУЩЕСТВА ---
        '@': { file: 'creature_sprites', x: 2,  y: 0 },  // Игрок
        'r': { file: 'creature_sprites', x: 8,  y: 9 },  // Крыса
        'g': { file: 'creature_sprites', x: 12, y: 3 },  // Гоблин
        'w': { file: 'creature_sprites', x: 1,  y: 9 },  // Волк
        'j': { file: 'creature_sprites', x: 3,  y: 15 }, // Слизень
        'b': { file: 'creature_sprites', x: 5,  y: 0 },  // Бандит
        's': { file: 'creature_sprites', x: 6,  y: 0 },  // Скелет
        'k': { file: 'creature_sprites', x: 7,  y: 0 },  // Орк
        'z': { file: 'creature_sprites', x: 8,  y: 0 },  // Зомби
        'h': { file: 'creature_sprites', x: 9,  y: 0 },  // Гарпия
        'G': { file: 'creature_sprites', x: 10, y: 0 },  // Призрак
        'V': { file: 'creature_sprites', x: 11, y: 0 },  // Вампир
        't': { file: 'creature_sprites', x: 12, y: 0 },  // Тролль
        'L': { file: 'creature_sprites', x: 13, y: 0 },  // Лич
        'M': { file: 'creature_sprites', x: 14, y: 0 },  // Голем
        'q': { file: 'creature_sprites', x: 15, y: 0 },  // Дракон
        '☺': { file: 'creature_sprites', x: 8,  y: 3 },  // NPC
        
        // === БОССЫ (2x2) ===
        // Добавляем символ 'B', который используется в entity.js для всех боссов
        'B': { file: 'creature_sprites', x: 0,  y: 18 }, // Босс (верхний левый угол 32x32)
        
        // --- ПРЕДМЕТЫ ---
        '/': { file: 'item_sprites', x: 0,  y: 0 }, // Меч
        'P': { file: 'item_sprites', x: 1,  y: 0 }, // Топор
        ')': { file: 'item_sprites', x: 2,  y: 0 }, // Булава
        '*': { file: 'item_sprites', x: 3,  y: 0 }, // Кинжал
        'Y': { file: 'item_sprites', x: 4,  y: 0 }, // Копье
        '(': { file: 'item_sprites', x: 5,  y: 0 }, // Лук
        '=': { file: 'item_sprites', x: 6,  y: 0 }, // Арбалет
        '|': { file: 'item_sprites', x: 7,  y: 0 }, // Посох
        ']': { file: 'item_sprites', x: 8,  y: 0 }, // Кожа
        '[': { file: 'item_sprites', x: 9,  y: 0 }, // Кольчуга
        '}': { file: 'item_sprites', x: 10, y: 0 }, // Щит
        '"': { file: 'item_sprites', x: 11, y: 0 }, // Наголенники
        '{': { file: 'item_sprites', x: 12, y: 0 }, // Плащ
        'H': { file: 'item_sprites', x: 13, y: 0 }, // Шлем
        'v': { file: 'item_sprites', x: 14, y: 0 }, // Перчатки
        '!': { file: 'item_sprites', x: 15, y: 0 }, // Зелье
        '+': { file: 'item_sprites', x: 16, y: 0 }, // Эликсир
        '%': { file: 'item_sprites', x: 17, y: 0 }, // Еда
        '~': { file: 'item_sprites', x: 18, y: 0 }, // Мясо
        '?': { file: 'item_sprites', x: 3, y: 4 }, // ITEM_BOOK
        '$': { file: 'item_sprites', x: 13, y: 3 }  // Золото
    };

    // === ИНИЦИАЛИЗАЦИЯ (Загрузка изображений) ===
    async function init() {
        try {
            await Promise.all(SPRITE_FILES.map(({ src, key }) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        spriteSheets[key] = img;
                        resolve();
                    };
                    img.onerror = () => {
                        console.error(`❌ Не удалось загрузить тайлсет: ${src}`);
                        reject(new Error(`Failed to load ${src}`));
                    };
                    img.src = src;
                });
            }));
            isReady = true;
            console.log("✅ TilesetRenderer: Все спрайты загружены.");
        } catch (error) {
            console.error("❌ Критическая ошибка загрузки спрайтов:", error);
        }
    }

    // === ОТРИСОВКА ПО СИМВОЛУ (стандартная) ===
    function draw(ctx, char, screenX, screenY, color) {
        if (!ctx) return;

        const destX = screenX * TILE_SIZE;
        const destY = screenY * TILE_SIZE;
        const tileData = TILE_MAP[char];

        // 1. Fallback: Если символ не найден в маппинге -> рисуем текст
        if (!tileData) {
            ctx.fillStyle = color || '#fff';
            ctx.font = `${TILE_SIZE}px Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, destX + TILE_SIZE / 2, destY + TILE_SIZE / 2);
            return;
        }

        const img = spriteSheets[tileData.file];

        // 2. Ошибка: Картинка не загружена
        if (!img || !isReady) {
            ctx.fillStyle = '#ff0000'; // Красный квадрат
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tileData.x * TILE_SIZE;
        const srcY = tileData.y * TILE_SIZE;

        // 3. Ошибка: Координаты вне границ картинки
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00'; // Желтый квадрат
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            console.warn(`⚠️ OOB: Спрайт '${char}' (${tileData.file}) за пределами изображения`);
            return;
        }

        // 4. Отрисовка спрайта
        ctx.save();
        
        // Очищаем ячейку (на случай, если там был мусор)
        ctx.clearRect(destX, destY, TILE_SIZE, TILE_SIZE);
        
        // Рисуем сам спрайт
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // 5. Программная окраска (если цвет не белый/черный)
        if (color && color !== '#fff' && color !== '#ffffff' && color !== '#000' && color !== '#000000') {
            // source-atop: рисует новый цвет ТОЛЬКО там, где уже есть непрозрачные пиксели (спрайт)
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }

        ctx.restore();
    }

    // === НОВАЯ ФУНКЦИЯ: ОТРИСОВКА ПО КЛЮЧУ РЕЕСТРА (для боссов 2x2) ===
    function drawByKey(ctx, key, screenX, screenY, color) {
        if (!ctx) return;

        const destX = screenX * TILE_SIZE;
        const destY = screenY * TILE_SIZE;
        
        // Получаем данные тайла напрямую из реестра спрайтов
        const tileData = getTileData(key); 

        // Если ключа нет в реестре, рисуем красный квадрат ошибки
        if (!tileData) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            console.warn(`⚠️ Не найден ключ спрайта: ${key}`);
            return;
        }

        const img = spriteSheets[tileData.file];

        if (!img || !isReady) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tileData.x * TILE_SIZE;
        const srcY = tileData.y * TILE_SIZE;

        // Проверка границ
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        ctx.save();
        ctx.clearRect(destX, destY, TILE_SIZE, TILE_SIZE);
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // Окраска
        if (color && color !== '#fff' && color !== '#ffffff' && color !== '#000' && color !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }
        ctx.restore();
    }


        // === НОВАЯ ФУНКЦИЯ: ОТРИСОВКА БОЛЬШИХ СПРАЙТОВ (2x2) ===
    function drawBig(ctx, char, screenX, screenY, color) {
        if (!ctx) return;

        const tileData = TILE_MAP[char];
        if (!tileData) return;

        const img = spriteSheets[tileData.file];
        if (!img || !isReady) return;

        const srcX = tileData.x * TILE_SIZE;
        const srcY = tileData.y * TILE_SIZE;

        // Размеры назначения: 2 тайла в ширину и высоту
        const destW = TILE_SIZE * 2;
        const destH = TILE_SIZE * 2;
        const destX = screenX * TILE_SIZE;
        const destY = screenY * TILE_SIZE;

        ctx.save();
        ctx.clearRect(destX, destY, destW, destH);
        
        // Рисуем изображение, растягивая его на 2x2 клетки
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, destW, destH);

        // Окраска (если нужна)
        if (color && color !== '#fff' && color !== '#ffffff' && color !== '#000' && color !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = color;
            ctx.fillRect(destX, destY, destW, destH);
        }
        ctx.restore();
    }

    // === ПУБЛИЧНЫЙ ИНТЕРФЕЙС ===
    return {
        init,
        draw,
        drawBig, // <--- ДОБАВИТЬ ЭТО
        drawByKey, // Если вы добавляли её ранее
        TILE_SIZE,
        isReady: () => isReady
    };
})();

