/**
 * МОДУЛЬ ГЛОБАЛЬНОЙ КАРТЫ (globalMap.js)
 * Бесконечная карта, разбитая на чанки.
 * Генерация ландшафта, дорог, городов и входов в подземелья.
 */

// Конфигурация
const GLOBAL_CONFIG = {
    CHUNK_SIZE: 50,          // размер чанка в клетках
    WORLD_SEED: 12345,       // общий сид мира (можно менять)
    CITY_DENSITY: 0.02,      // вероятность города на клетку
    DUNGEON_DENSITY: 0.03,   // вероятность входа в подземелье на клетку
    ROAD_CONNECT_RADIUS: 30  // радиус соединения дорогами POI
};

// Кэш чанков: ключ "cx,cy" -> { tiles, pois }
const chunkCache = new Map();

// Текущая позиция игрока (глобальные координаты)
let playerGlobalX = 1;
let playerGlobalY = 1;

// === Вспомогательные функции ===

// Детерминированный генератор случайных чисел для чанка
function getChunkRandom(cx, cy) {
    const seed = GLOBAL_CONFIG.WORLD_SEED + cx * 1000003 + cy * 1000033;
    return new SeededRandom(seed);
}

// Генерация ландшафта (типы клеток) для чанка
function generateTerrain(rand, width, height) {
    const tiles = Array(height).fill().map(() => Array(width).fill('plain'));
    
    // Горы: случайные области
    const mountainCount = rand.int(5, 15);
    for (let i = 0; i < mountainCount; i++) {
        const mx = rand.int(0, width-1);
        const my = rand.int(0, height-1);
        const radius = rand.int(1, 3);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = mx+dx, y = my+dy;
                if (x>=0 && x<width && y>=0 && y<height && Math.abs(dx)+Math.abs(dy) <= radius) {
                    if (tiles[y][x] !== 'city' && tiles[y][x] !== 'dungeon_entrance') {
                        tiles[y][x] = 'mountain';
                    }
                }
            }
        }
    }
    
    // Леса: случайные точки
    const forestCount = rand.int(10, 30);
    for (let i = 0; i < forestCount; i++) {
        const fx = rand.int(0, width-1);
        const fy = rand.int(0, height-1);
        if (tiles[fy][fx] === 'plain') tiles[fy][fx] = 'forest';
    }
    
    // Реки (линии)
    const riverCount = rand.int(1, 3);
    for (let r = 0; r < riverCount; r++) {
        let x = rand.int(0, width-1);
        let y = rand.int(0, height-1);
        for (let step = 0; step < 30; step++) {
            if (x>=0 && x<width && y>=0 && y<height && 
                tiles[y][x] !== 'mountain' && 
                tiles[y][x] !== 'city' && 
                tiles[y][x] !== 'dungeon_entrance') {
                tiles[y][x] = 'water';
            }
            const dir = rand.int(0, 3);
            if (dir === 0) x++;
            else if (dir === 1) x--;
            else if (dir === 2) y++;
            else y--;
        }
    }
    return tiles;
}

// Генерация точек интереса (города, входы в подземелья)
function generatePOIs(rand, cx, cy, tiles) {
    const pois = [];
    const width = GLOBAL_CONFIG.CHUNK_SIZE;
    const height = GLOBAL_CONFIG.CHUNK_SIZE;
    
    // Города
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if ((tiles[y][x] === 'plain' || tiles[y][x] === 'forest') && rand.next() < GLOBAL_CONFIG.CITY_DENSITY) {
                tiles[y][x] = 'city';
                const globalX = cx * width + x;
                const globalY = cy * height + y;
                const cityName = NameGeneratorModule.generateCityName(globalX, globalY);
                pois.push({ x: globalX, y: globalY, type: 'city', name: cityName });
            }
        }
    }
    
    // Входы в подземелья (чаще в горах или рядом)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isMountainArea = tiles[y][x] === 'mountain';
            const isPlainNearby = !isMountainArea && (tiles[y][x] === 'plain' || tiles[y][x] === 'forest');
            if ((isMountainArea || isPlainNearby) && rand.next() < GLOBAL_CONFIG.DUNGEON_DENSITY) {
                if (tiles[y][x] !== 'city') {
                    tiles[y][x] = 'dungeon_entrance';
                    const globalX = cx * width + x;
                    const globalY = cy * height + y;
                    // Выбираем случайный тип подземелья из DUNGEON_TYPES
                    const dungeonTypes = DUNGEON_TYPES.map(t => t.name);
                    const dungeonType = rand.choice(dungeonTypes);
                    const { fullName } = NameGeneratorModule.generateLocationData(globalX, globalY, dungeonType);
                    pois.push({ x: globalX, y: globalY, type: 'dungeon', dungeonType: dungeonType, name: fullName });
                }
            }
        }
    }
    return pois;
}

// Построение дорог между точками интереса
function connectPOIsWithRoads(tiles, poisLocal, rand) {
    if (poisLocal.length < 2) return;
    
    // Соединяем каждую POI с ближайшей
    const edges = [];
    for (let i = 0; i < poisLocal.length; i++) {
        let closest = null;
        let minDist = Infinity;
        for (let j = 0; j < poisLocal.length; j++) {
            if (i === j) continue;
            const dist = Math.abs(poisLocal[i].x - poisLocal[j].x) + Math.abs(poisLocal[i].y - poisLocal[j].y);
            if (dist < minDist) {
                minDist = dist;
                closest = j;
            }
        }
        if (closest !== null) {
            edges.push([i, closest]);
        }
    }
    
    // Уникальные ребра
    const uniqueEdges = [];
    for (const [a,b] of edges) {
        if (!uniqueEdges.some(e => (e[0]===a && e[1]===b) || (e[0]===b && e[1]===a))) {
            uniqueEdges.push([a,b]);
        }
    }
    
    // Прокладываем L-образные дороги
    for (const [i,j] of uniqueEdges) {
        const p1 = poisLocal[i];
        const p2 = poisLocal[j];
        
        // Горизонтальный отрезок
        const stepX = p1.x <= p2.x ? 1 : -1;
        for (let x = p1.x; stepX > 0 ? x <= p2.x : x >= p2.x; x += stepX) {
            if (x >= 0 && x < tiles[0].length && p1.y >= 0 && p1.y < tiles.length) {
                if (tiles[p1.y][x] !== 'mountain' && tiles[p1.y][x] !== 'water') {
                    tiles[p1.y][x] = 'road';
                }
            }
        }
        // Вертикальный отрезок
        const stepY = p1.y <= p2.y ? 1 : -1;
        for (let y = p1.y; stepY > 0 ? y <= p2.y : y >= p2.y; y += stepY) {
            if (y >= 0 && y < tiles.length && p2.x >= 0 && p2.x < tiles[0].length) {
                if (tiles[y][p2.x] !== 'mountain' && tiles[y][p2.x] !== 'water') {
                    tiles[y][p2.x] = 'road';
                }
            }
        }
    }
}

// Генерация целого чанка
function generateChunk(cx, cy) {
    const rand = getChunkRandom(cx, cy);
    const tiles = generateTerrain(rand, GLOBAL_CONFIG.CHUNK_SIZE, GLOBAL_CONFIG.CHUNK_SIZE);
    const pois = generatePOIs(rand, cx, cy, tiles);
    
    // Дороги строим на основе локальных координат POI
    const poisLocal = pois.map(p => ({ 
        x: p.x - cx * GLOBAL_CONFIG.CHUNK_SIZE, 
        y: p.y - cy * GLOBAL_CONFIG.CHUNK_SIZE 
    }));
    connectPOIsWithRoads(tiles, poisLocal, rand);
    
    return { tiles, pois };
}

// Получить чанк по глобальной клетке
function getChunkForCell(globalX, globalY) {
    const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
    const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
    const key = `${cx},${cy}`;
    if (!chunkCache.has(key)) {
        chunkCache.set(key, generateChunk(cx, cy));
    }
    return chunkCache.get(key);
}

// === Публичный API ===

const GlobalMapModule = {
    // Получить тип тайла в глобальных координатах
    getTileType(globalX, globalY) {
        const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
        const chunk = getChunkForCell(globalX, globalY);
        const localX = globalX - cx * GLOBAL_CONFIG.CHUNK_SIZE;
        const localY = globalY - cy * GLOBAL_CONFIG.CHUNK_SIZE;
        if (localY >= 0 && localY < chunk.tiles.length && localX >= 0 && localX < chunk.tiles[0].length) {
            return chunk.tiles[localY][localX];
        }
        return 'plain';
    },
    
    // Проверка проходимости
    isWalkable(globalX, globalY) {
        const type = this.getTileType(globalX, globalY);
        return type !== 'mountain' && type !== 'water';
    },
    
    // Получить точку интереса в клетке (если есть)
    getPOI(globalX, globalY) {
        const cx = Math.floor(globalX / GLOBAL_CONFIG.CHUNK_SIZE);
        const cy = Math.floor(globalY / GLOBAL_CONFIG.CHUNK_SIZE);
        const chunk = getChunkForCell(globalX, globalY);
        return chunk.pois.find(p => p.x === globalX && p.y === globalY);
    },
    
    // Перемещение игрока (возвращает true, если удалось)
    tryMove(dx, dy) {
        const newX = playerGlobalX + dx;
        const newY = playerGlobalY + dy;
        if (this.isWalkable(newX, newY)) {
            playerGlobalX = newX;
            playerGlobalY = newY;
            return true;
        }
        return false;
    },
    
    // Текущая позиция игрока
    getPlayerPosition() {
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    // Установить позицию (при выходе из подземелья)
    setPlayerPosition(x, y) {
        playerGlobalX = x;
        playerGlobalY = y;
    },
    
    // Получить размер чанка (для отрисовки)
    getChunkSize() { 
        return GLOBAL_CONFIG.CHUNK_SIZE; 
    },
    
    // Получить конфигурацию
    getConfig() {
        return GLOBAL_CONFIG;
    }
};
