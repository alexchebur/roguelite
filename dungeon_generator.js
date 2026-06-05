/**
 * МОДУЛЬ ГЕНЕРАЦИИ ПОДЗЕМЕЛИЙ (dungeon_generator.js)
 */

// Проверка зависимостей
if (typeof SeededRandom === 'undefined' || typeof createSeed === 'undefined') {
    console.error("Ошибка: name_generator.js должен быть загружен перед dungeon_generator.js");
}

const DUNGEON_TYPES = [
    { name: 'dungeon', weight: 30, emoji: '🟫', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#333', wallColor: '#555' }, 
    // Cave теперь будет использовать специальный алгоритм
    { name: 'cave', weight: 25, emoji: '🕸️', floorChar: getChar('FLOOR_ORGANIC'), wallChar: getChar('WALL_ORGANIC'), floorColor: '#2a2a2a', wallColor: '#4a3b3b' },
    { name: 'icy', weight: 20, emoji: '❄️', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#aaddff', wallColor: '#ffffff' },
    { name: 'rogue', weight: 10, emoji: '🌫️', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#781a6f', wallColor: '#995792' },
    { name: 'cellular', weight: 10, emoji: '🧿', floorChar: getChar('FLOOR_ORGANIC'), wallChar: getChar('WALL_ORGANIC'), floorColor: '#2e7d32', wallColor: '#4caf50' },
    { name: 'arena', weight: 3, emoji: '🦴', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#962e1b', wallColor: '#cf2f13' },
    { name: 'boss', weight: 2, emoji: '👑', floorChar: getChar('FLOOR_DEFAULT'), wallChar: getChar('WALL_DEFAULT'), floorColor: '#b71c1c', wallColor: '#880e4f' }
];

const TOTAL_WEIGHT = DUNGEON_TYPES.reduce((sum, t) => sum + t.weight, 0);

function selectDungeonType(rand) {
    rand.next(); rand.next(); rand.next();
    const r = rand.next();
    let cumulative = 0;
    for (const type of DUNGEON_TYPES) {
        cumulative += type.weight / TOTAL_WEIGHT;
        if (r < cumulative) return type;
    }
    return DUNGEON_TYPES[DUNGEON_TYPES.length - 1];
}

// --- СТАРЫЕ ФУНКЦИИ (Room/Corridor, Arena) оставляем без изменений ---

function generateRoomCorridorMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
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
                grid[y + dy][x + dx] = 0;
            }
        }
        rooms.push({x, y, w, h});
    }
    if (rooms.length > 1) {
        for (let i = 0; i < rooms.length - 1; i++) {
            const r1 = rooms[i];
            const r2 = rooms[i + 1];
            const cx1 = Math.floor(r1.x + r1.w / 2);
            const cy1 = Math.floor(r1.y + r1.h / 2);
            const cx2 = Math.floor(r2.x + r2.w / 2);
            const cy2 = Math.floor(r2.y + r2.h / 2);
            const stepX = cx1 <= cx2 ? 1 : -1;
            for (let x = cx1; stepX > 0 ? x <= cx2 : x >= cx2; x += stepX) {
                if (cy1 >= 0 && cy1 < height && x >= 0 && x < width) grid[cy1][x] = 0;
            }
            const stepY = cy1 <= cy2 ? 1 : -1;
            for (let y = cy1; stepY > 0 ? y <= cy2 : y >= cy2; y += stepY) {
                if (y >= 0 && y < height && cx2 >= 0 && cx2 < width) grid[y][cx2] = 0;
            }
        }
    }
    return grid;
}

function generateArenaMap(rand, width, height) {
    const grid = Array(height).fill().map(() => Array(width).fill(1));
    const margin = 2;
    for (let y = margin; y < height - margin; y++) {
        for (let x = margin; x < width - margin; x++) {
            grid[y][x] = 0;
        }
    }
    const colCount = rand.int(5, 15);
    for (let i = 0; i < colCount; i++) {
        const cx = rand.int(margin + 2, width - margin - 3);
        const cy = rand.int(margin + 2, height - margin - 3);
        if (Math.abs(cx - width/2) < 3 && Math.abs(cy - height/2) < 3) continue;
        grid[cy][cx] = 1;
        if (rand.next() > 0.5) {
            if(cx+1 < width-margin) grid[cy][cx+1] = 1;
            if(cy+1 < height-margin) grid[cy+1][cx] = 1;
            if(cx+1 < width-margin && cy+1 < height-margin) grid[cy+1][cx+1] = 1;
        }
    }
    return grid;
}

// --- НОВЫЙ АЛГОРИТМ ДЛЯ ПЕЩЕР (CAVE) ---

function generateCaveMap(rand, width, height) {
    // 1. Инициализация шумом (Cellular Automata Start)
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = 0.45; // Шанс стать стеной
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Края всегда стены
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                grid[y][x] = 1;
            } else {
                grid[y][x] = rand.next() < fillChance ? 1 : 0;
            }
        }
    }

    // 2. Сглаживание (4-5 итераций)
    for (let i = 0; i < 5; i++) {
        grid = smoothMap(grid, width, height);
    }

    // 3. Поиск основных пещер (Connected Components)
    const regions = findRegions(grid, width, height);
    
    // Сортируем по размеру (убывание)
    regions.sort((a, b) => b.cells.length - a.cells.length);

    // Если пещер мало или они маленькие, пробуем перегенерировать (простая защита от пустых карт)
    if (regions.length < 2 || regions[0].cells.length < (width * height * 0.15)) {
        return generateCaveMap(rand, width, height); // Рекурсивный重试
    }

    // 4. Соединение пещер туннелями
    // Берем самую большую пещеру как "Главную" и соединяем с ней остальные крупные
    const mainRegion = regions[0];
    const connectedRegions = [mainRegion];
    
    // Пробуем соединить топ-5 пещер
    const targets = regions.slice(1, 6); 
    
    for (const target of targets) {
        connectRegions(grid, mainRegion, target, width, height, rand);
        connectedRegions.push(target);
    }

    // 5. Дополнительное сглаживание границ туннелей (опционально, чтобы туннели не выглядели слишком прямыми)
    // Можно пропустить для производительности, туннели будут "природными трещинами"

    return grid;
}

// Вспомогательная: Сглаживание карты по правилам клеточного автомата
function smoothMap(grid, width, height) {
    const newGrid = Array(height).fill().map(() => Array(width).fill(1));
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let wallCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (grid[y + dy][x + dx] === 1) wallCount++;
                }
            }
            // Правило: если вокруг 5+ стен -> становись стеной. Если < 4 -> пол.
            if (wallCount > 4) newGrid[y][x] = 1;
            else if (wallCount < 4) newGrid[y][x] = 0;
            else newGrid[y][x] = grid[y][x]; // Сохраняем состояние при равенстве
        }
    }
    return newGrid;
}

// Вспомогательная: Поиск связанных областей (Flood Fill)
function findRegions(grid, width, height) {
    const visited = Array(height).fill().map(() => Array(width).fill(false));
    const regions = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x] === 0 && !visited[y][x]) {
                const region = { id: regions.length, cells: [] };
                const stack = [{x, y}];
                visited[y][x] = true;
                
                while (stack.length > 0) {
                    const curr = stack.pop();
                    region.cells.push(curr);
                    
                    const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                    for (const [dx, dy] of dirs) {
                        const nx = curr.x + dx;
                        const ny = curr.y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (grid[ny][nx] === 0 && !visited[ny][nx]) {
                                visited[ny][nx] = true;
                                stack.push({x: nx, y: ny});
                            }
                        }
                    }
                }
                if (region.cells.length > 10) { // Игнорируем микро-дырки
                    regions.push(region);
                }
            }
        }
    }
    return regions;
}

// Вспомогательная: Прорытие туннеля между двумя регионами
function connectRegions(grid, regA, regB, width, height, rand) {
    // Выбираем случайные точки из каждого региона
    const start = regA.cells[Math.floor(rand.next() * regA.cells.length)];
    const end = regB.cells[Math.floor(rand.next() * regB.cells.length)];

    // Копаем туннель (Drunkard's Walk или L-shape с шумом)
    let currX = start.x;
    let currY = start.y;
    
    // Делаем туннель широким (2-3 клетки) и немного кривым
    const steps = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    
    for (let i = 0; i < steps * 1.5; i++) { // *1.5 чтобы сделать путь более извилистым
        // Рисуем "пятно" пола вокруг текущей точки
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const ty = currY + dy;
                const tx = currX + dx;
                if (ty > 0 && ty < height - 1 && tx > 0 && tx < width - 1) {
                    grid[ty][tx] = 0;
                }
            }
        }

        // Двигаемся к цели с небольшим рандомом
        const dx = end.x - currX;
        const dy = end.y - currY;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            currX += Math.sign(dx);
            if (rand.next() < 0.2) currY += (rand.next() < 0.5 ? 1 : -1); // Шум по Y
        } else {
            currY += Math.sign(dy);
            if (rand.next() < 0.2) currX += (rand.next() < 0.5 ? 1 : -1); // Шум по X
        }
        
        // Защита от выхода за границы
        currX = Math.max(1, Math.min(width - 2, currX));
        currY = Math.max(1, Math.min(height - 2, currY));

        // Если дошли близко к цели, выходим
        if (Math.abs(currX - end.x) < 2 && Math.abs(currY - end.y) < 2) break;
    }
}


// --- ОБНОВЛЕННАЯ ЛОГИКА ВЫБОРА ГЕНЕРАТОРА ---

const DungeonGeneratorModule = {
    generateLevel: function(x, y, depth, width, height) {
        const seedVal = createSeed(x, y, depth);
        const rand = new SeededRandom(seedVal);
        const dungeonType = selectDungeonType(rand);
        
        let mapGrid;
        // Явное разделение алгоритмов
        if (dungeonType.name === 'cave') {
            mapGrid = generateCaveMap(rand, width, height);
        } else if (dungeonType.name === 'cellular') {
            // Старый cellular для других типов (например, organic)
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
             mapGrid = generateArenaMap(rand, width, height);
        } else {
            // Dungeon, Rogue, Icy используют комнаты
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }

        // Поиск стартовой позиции (безопасный спавн)
        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };
        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r < Math.max(width,height); r++) {
                for(let dy=-r; dy <=r; dy++) {
                    for(let dx=-r; dx <=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny >=0 && ny <height && nx >=0 && nx <width && mapGrid[ny][nx]===0) {
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
    },

    generateLevelWithType: function(x, y, depth, width, height, forcedType) {
        const seedVal = createSeed(x, y, depth);
        const rand = new SeededRandom(seedVal);
        let dungeonType = DUNGEON_TYPES.find(t => t.name === forcedType);
        if (!dungeonType) {
            dungeonType = selectDungeonType(rand);
        }
        
        let mapGrid;
        if (dungeonType.name === 'cave') {
            mapGrid = generateCaveMap(rand, width, height);
        } else if (dungeonType.name === 'cellular') {
            mapGrid = generateCellularMap(rand, width, height);
        } else if (dungeonType.name === 'arena' || dungeonType.name === 'boss') {
            mapGrid = generateArenaMap(rand, width, height);
        } else {
            mapGrid = generateRoomCorridorMap(rand, width, height);
        }

        let startPos = { x: Math.floor(width/2), y: Math.floor(height/2) };
        if (mapGrid[startPos.y][startPos.x] === 1) {
            let found = false;
            for(let r=1; r < Math.max(width,height); r++) {
                for(let dy=-r; dy <=r; dy++) {
                    for(let dx=-r; dx <=r; dx++) {
                        const ny = startPos.y + dy;
                        const nx = startPos.x + dx;
                        if(ny >=0 && ny <height && nx >=0 && nx <width && mapGrid[ny][nx]===0) {
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

// Старая функция cellular (оставляем для совместимости, если нужна для типа 'cellular')
function generateCellularMap(rand, width, height) {
    let grid = Array(height).fill().map(() => Array(width).fill(1));
    const fillChance = 0.45;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rand.next() < fillChance) grid[y][x] = 1;
        }
    }
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
