/**
 * МОДУЛЬ ГЛОБАЛЬНОЙ КАРТЫ (globalMap.js)
 * Бесконечная карта, разбитая на чанки.
 * Генерация ландшафта, дорог, городов и входов в подземелья.
 */

// Конфигурация
const GLOBAL_CONFIG = {
    CHUNK_SIZE: 50,          // размер чанка в клетках
    WORLD_SEED: 193460752,       // общий сид мира (можно менять)
    CITY_DENSITY: 0.010,      // вероятность города на клетку
    DUNGEON_DENSITY: 0.01,   // вероятность входа в подземелье на клетку
    ROAD_CONNECT_RADIUS: 40  // радиус соединения дорогами POI
};

// Кэш чанков: ключ "cx,cy" -> { tiles, pois }
const chunkCache = new Map();

// Текущая позиция игрока (глобальные координаты)
let playerGlobalX = 0;
let playerGlobalY = 0;

// === Вспомогательные функции ===

// Детерминированный генератор случайных чисел для чанка
function getChunkRandom(cx, cy) {
    const seed = GLOBAL_CONFIG.WORLD_SEED + cx * 1000003 + cy * 1000033;
    return new SeededRandom(seed);
}

// Генерация ландшафта (типы клеток) для чанка
// В файле globalMap.js замените функцию generateTerrain на эту:

function generateTerrain(rand, width, height) {
    const tiles = Array(height).fill().map(() => Array(width).fill('plain'));
    
    // 1. Горы: случайные области (оставляем как было)
    const mountainCount = rand.int(5, 15);
    for (let i = 0; i < mountainCount; i++) {
        const mx = rand.int(0, width-1);
        const my = rand.int(0, height-1);
        const radius = rand.int(1, 3);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = mx+dx, y = my+dy;
                if (x >= 0 && x < width && y >= 0 && y < height && Math.abs(dx)+Math.abs(dy) <= radius) {
                    if (tiles[y][x] !== 'city' && tiles[y][x] !== 'dungeon_entrance') {
                        tiles[y][x] = 'mountain';
                    }
                }
            }
        }
    }
    
    // === ИЗМЕНЕНИЕ: Леса теперь генерируются скоплениями (кластерами) ===
    // Увеличиваем количество центров лесов и их радиус
    const forestClusterCount = rand.int(20, 40); 
    
    for (let i = 0; i < forestClusterCount; i++) {
        const fx = rand.int(0, width-1);
        const fy = rand.int(0, height-1);
        // Радиус скопления от 1 до 3 клеток
        const radius = rand.int(1, 3); 

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = fx + dx;
                const y = fy + dy;
                
                // Проверяем границы карты и форму круга (для более естественных пятен)
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    // Если клетка еще не занята городом, входом или горой
                    if (tiles[y][x] !== 'city' && 
                        tiles[y][x] !== 'dungeon_entrance' && 
                        tiles[y][x] !== 'mountain') {
                        
                        // Добавляем немного шума: не каждое место в круге станет лесом (80% шанс)
                        if (rand.next() < 0.8) {
                            tiles[y][x] = 'forest';
                        }
                    }
                }
            }
        }
    }
     
    // 2. Реки (линии) - оставляем без изменений
    const riverCount = rand.int(1, 3);
    for (let r = 0; r < riverCount; r++) {
        let x = rand.int(0, width-1);
        let y = rand.int(0, height-1);
        for (let step = 0; step < 30; step++) {
            if (x >= 0 && x < width && y >= 0 && y < height && 
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
// В файле globalMap.js, функция generatePOIs

// Генерация точек интереса (города, входы в подземелья)
function generatePOIs(rand, cx, cy, tiles) {
    const pois = [];
    const width = GLOBAL_CONFIG.CHUNK_SIZE;
    const height = GLOBAL_CONFIG.CHUNK_SIZE;
    
    // 🛠️ НОВОЕ: Минимальное расстояние между любыми POI (в клетках)
    const MIN_POI_DISTANCE = 7; 

    // Вспомогательная функция: проверяет, не слишком ли близко к уже созданным POI
    const isTooClose = (localX, localY) => {
        const globalX = cx * width + localX;
        const globalY = cy * height + localY;
        for (const p of pois) {
            const dist = Math.abs(p.x - globalX) + Math.abs(p.y - globalY);
            if (dist < MIN_POI_DISTANCE) return true;
        }
        return false;
    };
    
    // 1. Города
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // 🛠️ ИСПРАВЛЕНИЕ: Разрешаем города ТОЛЬКО на равнинах и в лесах
            // Исключаем горы ('mountain'), воду ('water') и дороги ('road')
            const isValidCityTerrain = tiles[y][x] === 'plain' || tiles[y][x] === 'forest';

            if (isValidCityTerrain && rand.next() < GLOBAL_CONFIG.CITY_DENSITY) {
                
                // 🛠️ ПРОВЕРКА РАССТОЯНИЯ
                if (isTooClose(x, y)) continue;

                tiles[y][x] = 'city';
                const globalX = cx * width + x;
                const globalY = cy * height + y;
                const cityName = NameGeneratorModule.generateCityName(globalX, globalY);
                pois.push({ x: globalX, y: globalY, type: 'city', name: cityName });
            }
        }
    }
    
    // 2. Входы в подземелья
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // 🛠️ ИСПРАВЛЕНИЕ: Запрещаем спавн в горах и воде. Только равнина, лес или дорога.
            const isValidTerrain = tiles[y][x] === 'plain' || tiles[y][x] === 'forest' || tiles[y][x] === 'road';
            
            if (isValidTerrain && rand.next() < GLOBAL_CONFIG.DUNGEON_DENSITY) {
                if (tiles[y][x] !== 'city') {
                    
                    // 🛠️ ПРОВЕРКА РАССТОЯНИЯ
                    if (isTooClose(x, y)) continue;

                    tiles[y][x] = 'dungeon_entrance';
                    const globalX = cx * width + x;
                    const globalY = cy * height + y;
                    
                    const dungeonType = DungeonGeneratorModule.getRandomDungeonType(rand).name;
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
    
    const uniqueEdges = [];
    for (const [a,b] of edges) {
        if (!uniqueEdges.some(e => (e[0]===a && e[1]===b) || (e[0]===b && e[1]===a))) {
            uniqueEdges.push([a,b]);
        }
    }
    
    for (const [i,j] of uniqueEdges) {
        const p1 = poisLocal[i];
        const p2 = poisLocal[j];
        
        const stepX = p1.x <= p2.x ? 1 : -1;
        for (let x = p1.x; stepX > 0 ? x <= p2.x : x >= p2.x; x += stepX) {
            if (x >= 0 && x < tiles[0].length && p1.y >= 0 && p1.y < tiles.length) {
                if (tiles[p1.y][x] !== 'mountain' && tiles[p1.y][x] !== 'water') {
                    tiles[p1.y][x] = 'road';
                }
            }
        }
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

// === НОВАЯ ФУНКЦИЯ: поиск безопасной стартовой позиции ===
function findSafeStartPosition(startX, startY, radius = 3) {
    // Пробуем найти проходимую клетку в радиусе radius
    for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const testX = startX + dx;
                const testY = startY + dy;
                
                // Проверяем, что клетка существует и проходима
                if (GlobalMapModule.isWalkable(testX, testY)) {
                    // Дополнительно проверяем, что вокруг не слишком много гор
                    let obstacleCount = 0;
                    for (let ny = -1; ny <= 1; ny++) {
                        for (let nx = -1; nx <= 1; nx++) {
                            if (!GlobalMapModule.isWalkable(testX + nx, testY + ny)) {
                                obstacleCount++;
                            }
                        }
                    }
                    // Если в радиусе 1 не более 3 препятствий - подходит
                    if (obstacleCount <= 4) {
                        return { x: testX, y: testY };
                    }
                }
            }
        }
    }
    // Если ничего не нашли, возвращаем исходную позицию
    return { x: startX, y: startY };
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

    // Получить тип тайла для отображения (учитывая POI)
    getDisplayTileType(globalX, globalY) {
        // Сначала проверяем, есть ли POI в этой точке
        const poi = this.getPOI(globalX, globalY);
        if (poi) {
            return poi.type === 'city' ? 'city' : 'dungeon_entrance';
        }
    
        // Если POI нет, возвращаем обычный тип ландшафта
        return this.getTileType(globalX, globalY);
    },
    
    // Проверка проходимости
    isWalkable(globalX, globalY) {
        const type = this.getTileType(globalX, globalY);
        return type !== 'mountain' && type !== 'water';
    },
    


    // Получить точку интереса в клетке (если есть)
    getPOI(globalX, globalY) {
        const chunk = getChunkForCell(globalX, globalY);
        if (!chunk || !chunk.pois) return null;
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
    
    // НОВЫЙ МЕТОД: инициализация с поиском безопасной позиции
    initSafeStart(startX, startY, radius = 3) {
        const safePos = findSafeStartPosition(startX, startY, radius);
        playerGlobalX = safePos.x;
        playerGlobalY = safePos.y;
        return { x: playerGlobalX, y: playerGlobalY };
    },
    
    // Получить размер чанка
    getChunkSize() { 
        return GLOBAL_CONFIG.CHUNK_SIZE; 
    },
    
    // Получить конфигурацию
    getConfig() {
        return GLOBAL_CONFIG;
    }
};
