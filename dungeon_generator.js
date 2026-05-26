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
    const grid = Array(height).fill().map(() => Array(width).fill(1)); // 1 = стена
    const rooms = [];
    const roomCount = rand.int(10, 20);
    
    for (let i = 0; i < roomCount; i++) {
        const w = rand.int(4, 8);
        const h = rand.int(4, 8);
        const x = rand.int(1, width - w - 1);
        const y = rand.int(1, height - h - 1);
        
        let overlaps = false;
        for (const r of rooms) {
            if (x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) continue;
        
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                grid[y + dy][x + dx] = 0; // 0 = пол
            }
        }
        rooms.push({x, y, w, h});
    }
    
    // Соединение комнат коридорами
    if (rooms.length > 1) {
        for (let i = 0; i < rooms.length - 1; i++) {
            const r1 = rooms[i];
            const r2 = rooms[i + 1];
            const cx1 = Math.floor(r1.x + r1.w / 2);
            const cy1 = Math.floor(r1.y + r1.h / 2);
            const cx2 = Math.floor(r2.x + r2.w / 2);
            const cy2 = Math.floor(r2.y + r2.h / 2);
            
            // Горизонтальный туннель
            const stepX = cx1 <= cx2 ? 1 : -1;
            for (let x = cx1; stepX > 0 ? x <= cx2 : x >= cx2; x += stepX) {
                if (cy1 >= 0 && cy1 < height && x >= 0 && x < width) grid[cy1][x] = 0;
            }
            // Вертикальный туннель
            const stepY = cy1 <= cy2 ? 1 : -1;
            for (let y = cy1; stepY > 0 ? y <= cy2 : y >= cy2; y += stepY) {
                if (y >= 0 && y < height && cx2 >= 0 && cx2 < width) grid[y][cx2] = 0;
            }
        }
    }
    return grid;
}

// 2. Клеточный автомат (пещеры)
function generateCellularMap(rand, width, height) {
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = 0.45;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rand.next() < fillChance) grid[y][x] = 0;
        }
    }
    
    // Сглаживание
    for (let iter = 0; iter < 4; iter++) {
        const newGrid = Array(height).fill().map(() => Array(width).fill(1));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                    newGrid[y][x] = 1;
                    continue;
                }
                let wallCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        if (grid[y + dy][x + dx] === 1) wallCount++;
                    }
                }
                newGrid[y][x] = (wallCount >= 5) ? 1 : 0;
            }
        }
        grid = newGrid;
    }
    return grid;
}

// 3. Арена
function generateArenaMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const margin = 2;
    
    for (let y = margin; y < height - margin; y++) {
        for (let x = margin; x < width - margin; x++) {
            grid[y][x] = 0;
        }
    }
    
    // Добавляем случайные колонны/препятствия
    const colCount = rand.int(5, 15);
    for (let i = 0; i < colCount; i++) {
        const cx = rand.int(margin + 2, width - margin - 3);
        const cy = rand.int(margin + 2, height - margin - 3);
        // Не ставим в самом центре (спавн игрока)
        if (Math.abs(cx - width/2) < 3 && Math.abs(cy - height/2) < 3) continue;
        grid[cy][cx] = 1;
        // Иногда делаем препятствие 2x2
        if (rand.next() > 0.5) {
             if(cx+1 < width-margin) grid[cy][cx+1] = 1;
             if(cy+1 < height-margin) grid[cy+1][cx] = 1;
             if(cx+1 < width-margin && cy+1 < height-margin) grid[cy+1][cx+1] = 1;
        }
    }
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
    // Добавьте эту функцию в DungeonGeneratorModule (после generateLevel)

    generateLevelWithType: function(x, y, width, height, forcedType) {
        const seedVal = createSeed(x, y);
        const rand = new SeededRandom(seedVal);
    
        // Найти объект типа по имени
        let dungeonType = DUNGEON_TYPES.find(t => t.name === forcedType);
        if (!dungeonType) {
            // fallback на случайный тип, если имя не найдено
            dungeonType = selectDungeonType(rand);
        }
    
        // Генерация геометрии в зависимости от типа
        let mapGrid;
        if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
            mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }
    
        // Поиск стартовой позиции (как в generateLevel)
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };
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
