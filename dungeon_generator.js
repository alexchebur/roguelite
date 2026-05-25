/**
 * МОДУЛЬ ГЕНЕРАЦИИ ПОДЗЕМЕЛИЙ (dungeon_generator.js)
 * Использует SeededRandom и createSeed из name_generator.js
 */

// Проверка зависимостей
if (typeof SeededRandom === 'undefined' || typeof createSeed === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед dungeon_generator.js");
}

const DUNGEON_TYPES = [
    { name: 'dungeon', weight: 30, emoji: '🟫', floorChar: '.', wallChar: '#', floorColor: '#333', wallColor: '#555' }, 
    { name: 'cave', weight: 25, emoji: '🕸️', floorChar: '.', wallChar: '#', floorColor: '#2a2a2a', wallColor: '#4a3b3b' },
    { name: 'icy', weight: 20, emoji: '❄️', floorChar: '.', wallChar: '#', floorColor: '#aaddff', wallColor: '#ffffff' },
    { name: 'rogue', weight: 10, emoji: '🌫️', floorChar: '.', wallChar: '#', floorColor: '#1a1a1a', wallColor: '#2a2a2a' },
    { name: 'cellular', weight: 10, emoji: '🧿', floorChar: 'o', wallChar: 'O', floorColor: '#4caf50', wallColor: '#2e7d32' },
    { name: 'arena', weight: 3, emoji: '🦴', floorChar: '.', wallChar: '#', floorColor: '#5d4037', wallColor: '#3e2723' },
    { name: 'boss', weight: 2, emoji: '👑', floorChar: '.', wallChar: '#', floorColor: '#b71c1c', wallColor: '#880e4f' }
];

const TOTAL_WEIGHT = DUNGEON_TYPES.reduce((sum, t) => sum + t.weight, 0);

// Выбор типа подземелья на основе веса
function selectDungeonType(rand) {
    // "Прогреваем" генератор
    rand.next(); rand.next(); rand.next();
    
    const r = rand.next();
    let cumulative = 0;
    for (const type of DUNGEON_TYPES) {
        cumulative += type.weight / TOTAL_WEIGHT;
        if (r < cumulative) return type;
    }
    return DUNGEON_TYPES[DUNGEON_TYPES.length - 1];
}

// === АЛГОРИТМЫ ГЕНЕРАЦИИ ===

// 1. Комнаты и коридоры
function generateRoomCorridorMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const rooms = [];
    const roomCount = rand.int(12, 25);

    for (let i = 0; i < roomCount; i++) {
        const w = rand.int(3, 10);
        const h = rand.int(3, 9);
        const x = rand.int(1, width - w - 1);
        const y = rand.int(1, height - h - 1);

        let overlaps = false;
        for (const r of rooms) {
            if (x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y) {
                overlaps = true; break;
            }
        }
        if (overlaps) continue;

        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) grid[y + dy][x + dx] = 0;
        }
        rooms.push({x, y, w, h});
    }

    if (rooms.length > 1) {
        for (let i = 0; i < rooms.length - 1; i++) {
            const r1 = rooms[i], r2 = rooms[i + 1];
            const cx1 = Math.floor(r1.x + r1.w / 2), cy1 = Math.floor(r1.y + r1.h / 2);
            const cx2 = Math.floor(r2.x + r2.w / 2), cy2 = Math.floor(r2.y + r2.h / 2);

            const corridorWidth = rand.int(1, 2);
            const isHorizontalFirst = rand.next() < 0.5;

            // Смещение точки изгиба для зигзагообразных/ломаных коридоров
            let midX = cx1 + rand.int(-4, 4);
            let midY = cy2 + rand.int(-4, 4);
            midX = Math.max(1, Math.min(width - 2, midX));
            midY = Math.max(1, Math.min(height - 2, midY));

            const drawCorridor = (x1, y1, x2, y2, isHoriz) => {
                const stepX = x1 <= x2 ? 1 : -1;
                const stepY = y1 <= y2 ? 1 : -1;
                const halfW = Math.floor((corridorWidth - 1) / 2);
                if (isHoriz) {
                    for (let x = x1; stepX > 0 ? x <= x2 : x >= x2; x += stepX) {
                        for (let w = -halfW; w <= corridorWidth - 1 - halfW; w++) {
                            const ny = y1 + w;
                            if (ny >= 0 && ny < height && x >= 0 && x < width) grid[ny][x] = 0;
                        }
                    }
                } else {
                    for (let y = y1; stepY > 0 ? y <= y2 : y >= y2; y += stepY) {
                        for (let w = -halfW; w <= corridorWidth - 1 - halfW; w++) {
                            const nx = x2 + w;
                            if (nx >= 0 && nx < width && y >= 0 && y < height) grid[y][nx] = 0;
                        }
                    }
                }
            };

            if (isHorizontalFirst) {
                drawCorridor(cx1, cy1, midX, cy1, true);
                drawCorridor(midX, cy1, midX, cy2, false);
                drawCorridor(midX, cy2, cx2, cy2, true);
            } else {
                drawCorridor(cx1, cy1, cx1, midY, false);
                drawCorridor(cx1, midY, midX, midY, true);
                drawCorridor(midX, midY, cx2, cy2, false);
            }
        }
    }

    // Добавляем случайные тупики/ответвления от комнат
    for (let i = 0; i < rooms.length * 2; i++) {
        const r = rooms[rand.int(0, rooms.length - 1)];
        const startX = r.x + rand.int(0, r.w - 1);
        const startY = r.y + rand.int(0, r.h - 1);
        const dir = rand.int(0, 3);
        const len = rand.int(2, 5);
        const dx = [0, 1, 0, -1][dir], dy = [-1, 0, 1, 0][dir];
        for (let l = 1; l <= len; l++) {
            const nx = startX + dx * l, ny = startY + dy * l;
            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) grid[ny][nx] = 0;
            else break;
        }
    }
    return grid;
}

function generateCellularMap(rand, width, height) {
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = rand.next() * 0.2 + 0.35; // Вариативная плотность

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rand.next() < fillChance) grid[y][x] = 0;
        }
    }

    // Динамическое сглаживание с разными порогами на каждом шаге
    const iterations = rand.int(3, 5);
    for (let iter = 0; iter < iterations; iter++) {
        const newGrid = Array(height).fill().map(() => Array(width).fill(1));
        const threshold = rand.int(4, 6); // Меняет "жесткость" правил
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    newGrid[y][x] = 1; continue;
                }
                let wallCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (grid[y + dy][x + dx] === 1) wallCount++;
                    }
                }
                newGrid[y][x] = (wallCount >= threshold) ? 1 : 0;
            }
        }
        grid = newGrid;
    }

    // Прорубаем случайные туннели, чтобы разбить "слипшиеся" пещеры и создать лабиринтоподобность
    const tunnelCount = rand.int(5, 12);
    for (let t = 0; t < tunnelCount; t++) {
        let tx = rand.int(2, width - 3), ty = rand.int(2, height - 3);
        const steps = rand.int(5, 15);
        for (let s = 0; s < steps; s++) {
            grid[ty][tx] = 0;
            const dir = rand.int(0, 3);
            tx = Math.max(1, Math.min(width - 2, tx + [0, 1, 0, -1][dir]));
            ty = Math.max(1, Math.min(height - 2, ty + [-1, 0, 1, 0][dir]));
        }
    }
    return grid;
}

function generateArenaMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));

    // Неровные границы вместо идеального прямоугольника
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const distEdge = Math.min(x, y, width - 1 - x, height - 1 - y);
            if (distEdge < 2) continue;
            if (distEdge < 2 + rand.next() * 2) grid[y][x] = 0;
        }
    }

    // Заполняем внутренность, оставляя случайные "острова" стен
    const margin = 3;
    for (let y = margin; y < height - margin; y++) {
        for (let x = margin; x < width - margin; x++) {
            if (rand.next() > 0.15) grid[y][x] = 0;
        }
    }

    // Генерируем кластеры препятствий (стены, кресты, кольца)
    const clusterCount = rand.int(3, 8);
    for (let c = 0; c < clusterCount; c++) {
        const cx = rand.int(4, width - 5), cy = rand.int(4, height - 5);
        const shape = rand.int(0, 2);

        if (shape === 0) { // Барьер/стена
            const len = rand.int(3, 6), horiz = rand.next() < 0.5;
            for (let i = 0; i < len; i++) {
                const nx = horiz ? cx + i : cx, ny = horiz ? cy : cy + i;
                if (nx > 0 && nx < width && ny > 0 && ny < height) grid[ny][nx] = 1;
            }
        } else if (shape === 1) { // Крест/ромб
            const size = rand.int(1, 2);
            for (let dy = -size; dy <= size; dy++) {
                for (let dx = -size; dx <= size; dx++) {
                    if (Math.abs(dx) + Math.abs(dy) <= size + 1) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx > 0 && nx < width && ny > 0 && ny < height) grid[ny][nx] = 1;
                    }
                }
            }
        } else { // Кольцо
            const s = rand.int(2, 3);
            for (let dy = -s; dy <= s; dy++) {
                for (let dx = -s; dx <= s; dx++) {
                    if (Math.abs(dx) === s || Math.abs(dy) === s) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx > 0 && nx < width && ny > 0 && ny < height) grid[ny][nx] = 1;
                    }
                }
            }
        }
    }

    // Гарантируем свободный центр для спавна
    const cx = Math.floor(width/2), cy = Math.floor(height/2);
    for(let dy=-2; dy<=2; dy++) for(let dx=-2; dx<=2; dx++) grid[cy+dy][cx+dx] = 0;

    return grid;
}

// === ОСНОВНОЙ ЭКСПОРТ ===

const DungeonGeneratorModule = {
    generateLevel: function(x, y, width, height) {
        const seedVal = createSeed(x, y);
        const rand = new SeededRandom(seedVal);
        
        // 1. Выбираем тип
        const dungeonType = selectDungeonType(rand);
        
        // 2. Генерируем геометрию
        let mapGrid;
        if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
            mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }
        
        // 3. Находим точку старта
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };
        
        // Если центр стена, ищем ближайший пол
        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r<Math.max(width,height); r++) {
                for(let dy=-r; dy<=r; dy++) {
                    for(let dx=-r; dx<=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny>=0 && ny<height && nx>=0 && nx<width && mapGrid[ny][nx]===0) {
                            startPos = {x: nx, y: ny};
                            found = true;
                            break;
                        }
                    }
                    if(found) break;
                }
                if(found) break;
            }
        }

        return {
            mapData: mapGrid,
            dungeonType: dungeonType,
            startPos: startPos,
            seed: seedVal
        };
    }
};
