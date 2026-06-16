// =========================== Модуль сущностей (игрок, враги, предметы) ===========================
const EntityModule = (function() {
    function createPlayer(x, y) {
        return {
            x: x, y: y,
            char: "@", color: "#FFF",
            hp: 20, maxHp: 20,
            atk: 2, def: 1,
            bonusAtk: 0, bonusDef: 0,
            level: 1, xp: 0,
            gold: 0,
            inventory: [],
            equipment: { weapon: null, armor: null }
        };
    }

    // В файле entity.js, функция createEnemy

    function createEnemy(template, x, y, difficultyMult) {
        // 1. Расчет базовых средних значений из шаблона
        const baseHp = (template.hp[0] + template.hp[1]) / 2;
        const baseAtk = (template.atk[0] + template.atk[1]) / 2;
        const baseDef = (template.def[0] + template.def[1]) / 2;

        // 2. Применение множителя сложности с разными кривыми роста
        // HP растет пропорционально сложности (линейно)
        const hp = Math.max(1, Math.floor(baseHp * difficultyMult));
        
        // Атака растет медленнее (квадратный корень), чтобы бой длился дольше
        const atk = Math.max(1, Math.floor(baseAtk * Math.sqrt(difficultyMult)));
        
        // Защита растет очень медленно, чтобы игрок всегда мог нанести хотя бы 1 урон
        const def = Math.max(0, Math.floor(baseDef * Math.pow(difficultyMult, 0.3)));

        // 3. Параметры скорости (для системы энергии)
        const speed = template.speed || 10; 
        // Начальная энергия случайна от 0 до speed, чтобы рассинхронизировать толпу врагов
        const startEnergy = Math.floor(Math.random() * speed); 

        return {
            x: x, y: y, name: template.name,
            char: template.char, color: template.color,
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true,
            lootType: template.lootType,
            
            // Новые поля для механики ходов:
            speed: speed,      
            energy: startEnergy 
        };
    }

    // === Вспомогательная функция: выбор формы прилагательного ===
    function getAdjectiveForm(adjObj, gender, plural) {
        if (!adjObj) return "";
        if (plural) return adjObj.plural;
        if (gender === "she") return adjObj.she;
        if (gender === "it") return adjObj.it;
        return adjObj.base; 
    }

    function createItem(template, x, y, itemPowerMult) {
        let name = template.baseName;
        let finalVal = 0;

        // 1. Логика для ЗОЛОТА (отдельная обработка)
        if (template.type === 'gold') {
            const baseAmount = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
            finalVal = Math.max(1, Math.floor(baseAmount * itemPowerMult));
            name = `${finalVal} золотых`;
        } 
        // 2. Логика для ОБЫЧНЫХ ПРЕДМЕТОВ
        else {
            // Расчет финального значения для определения Тира
            const baseVal = Math.floor(template.val[0] + Math.random() * (template.val[1] - template.val[0]));
            finalVal = Math.max(1, Math.floor(baseVal * itemPowerMult));

            // === ОПРЕДЕЛЕНИЕ ТИРА И ВЫБОР СЛОВАРЯ ===
            let tier = 'trash';
            // Получаем пороги из data.js (если их нет, используем дефолтные)
            const thresholds = DataModule.ADJECTIVE_TIERS?.thresholds || { trash: 3, common: 8, rare: 15, epic: 25 };

            if (finalVal > thresholds.epic) tier = 'epic';
            else if (finalVal > thresholds.rare) tier = 'rare';
            else if (finalVal > thresholds.common) tier = 'common';
            
            // Выбираем словарь в зависимости от типа предмета
            let adjList = null;

            // === ИСКЛЮЧЕНИЕ: СВИТКИ, КНИГИ И ОСОБЫЕ ПРЕДМЕТЫ БЕЗ ПРИЛАГАТЕЛЬНЫХ ===
            if (template.type === 'book' || template.type === 'scroll_teleport' || template.type === 'scroll') {
                adjList = null; // Прилагательное не добавляется
            }
            else if (template.type === 'weapon') {
                adjList = DataModule.ADJECTIVE_TIERS?.weapon[tier];
            } 
            else if (template.type === 'armor') {
                adjList = DataModule.ADJECTIVE_TIERS?.armor[tier];
            } 
            else {
                // Для зелий, еды и прочего используем общий список 'consumable' или 'item'
                adjList = DataModule.ADJECTIVE_TIERS?.consumable?.[tier] || DataModule.ADJECTIVE_TIERS?.item?.[tier];
            }

            // Формируем имя только если прилагательное нашлось
            if (adjList && adjList.length > 0) {
                const adjObj = adjList[Math.floor(Math.random() * adjList.length)];
                const adj = getAdjectiveForm(adjObj, template.gender, template.plural);
                name = `${adj} ${template.baseName}`;
            } else {
                // Если списка нет или это книга/свиток
                name = template.baseName;
            }
        }

        // 3. Создание объекта предмета
        return {
            x: x, y: y, 
            name: name,
            char: template.char, 
            color: template.color,
            type: template.type,
            stat: template.stat,
            effect: template.effect,
            val: finalVal,
            isItem: true,
            meleeType: template.meleeType !== undefined ? template.meleeType : true,
            range: template.range || 1,
            maxAmmo: template.maxAmmo || 0,
            currentAmmo: template.maxAmmo || 0
        };
    }

    // === НОВАЯ ФУНКЦИЯ: Фильтрация врагов по уровню ===
    function getAvailableEnemies(depth) {
        if (depth <= 2) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Крыса", "Гоблин", "Волк", "Слизень"].includes(e.name)
            );
        } else if (depth <= 6) {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Бандит", "Скелет", "Орк-разведчик", "Зомби", "Гарпия", "Призрак"].includes(e.name)
            );
        } else {
            return DataModule.ENEMY_TYPES.filter(e => 
                ["Тролль", "Вампир", "Лич", "Голем", "Демон", "Дракон"].includes(e.name)
            );
        }
    }

    // Безопасное размещение врагов
    function spawnEnemies(mapGrid, startPos, enemyTemplates, count, difficultyMult, minDist = 3, depth = 0) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        const availableTemplates = getAvailableEnemies(depth);
        const templatesToUse = availableTemplates.length > 0 ? availableTemplates : enemyTemplates;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= 4) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        // Fisher-Yates shuffle
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedEnemies = [];
        const occupiedCoords = [];

        for (const tile of validTiles) {
            if (placedEnemies.length >= count) break;
            let tooClose = false;
            for (const occ of occupiedCoords) {
                if (Math.abs(tile.x - occ.x) + Math.abs(tile.y - occ.y) < minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                occupiedCoords.push({ x: tile.x, y: tile.y });
                const template = templatesToUse[Math.floor(Math.random() * templatesToUse.length)];
                placedEnemies.push(createEnemy(template, tile.x, tile.y, difficultyMult));
            }
        }
        return placedEnemies;
    }

    // Размещение предметов (оружие, броня, зелья)
    function spawnItems(mapGrid, startPos, itemTemplates, count, itemPowerMult, minDistFromPlayer = 3) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= minDistFromPlayer) {
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const placedItems = [];
        // Исключаем золото из обычного спавна предметов
        const nonGoldTemplates = itemTemplates.filter(t => t.type !== 'gold');
        
        for (let i = 0; i < Math.min(count, validTiles.length); i++) {
            const tile = validTiles[i];
            const template = nonGoldTemplates[Math.floor(Math.random() * nonGoldTemplates.length)];
            placedItems.push(createItem(template, tile.x, tile.y, itemPowerMult));
        }
        return placedItems;
    }

    // === НОВАЯ ФУНКЦИЯ: Случайное разбрасывание золота ===
    // Вызывается отдельно при каждом входе в подземелье для генерации нового распределения
    function spawnGold(mapGrid, startPos, goldTemplate, count, depth, worldGoldMult = 1) {
        const height = mapGrid.length;
        const width = mapGrid[0].length;
        const validTiles = [];

        // Собираем все проходимые клетки, кроме стартовой позиции игрока
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mapGrid[y][x] === 0) {
                    const distToStart = Math.abs(x - startPos.x) + Math.abs(y - startPos.y);
                    if (distToStart >= 3) { // Не спавним золото прямо у ног
                        validTiles.push({ x, y });
                    }
                }
            }
        }

        // Перемешиваем клетки для случайного выбора
        for (let i = validTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
        }

        const goldPiles = [];
        const placed = new Set(); // Чтобы не класть две кучки в одну клетку

        for (let i = 0; i < Math.min(count, validTiles.length); i++) {
            const tile = validTiles[i];
            const key = `${tile.x},${tile.y}`;
            if (placed.has(key)) continue;
            placed.add(key);

            // Расчёт количества золота: база × множитель глубины × множитель мира
            const depthBonus = 1 + (depth * 0.1); // +50% за каждый уровень глубины
            const baseAmount = Math.floor(goldTemplate.val[0] + Math.random() * (goldTemplate.val[1] - goldTemplate.val[0]));
            const finalAmount = Math.max(1, Math.floor(baseAmount * depthBonus * worldGoldMult));

            goldPiles.push({
                x: tile.x,
                y: tile.y,
                name: `${finalAmount} золотых`,
                char: '$',
                color: '#FFD700',
                type: 'gold',
                val: finalAmount,
                isItem: true
            });
        }
        return goldPiles;
    }




    // === НОВАЯ ФУНКЦИЯ: Спавн предметов ВНУТРИ зданий (для городов) ===
    function spawnItemsInCity(interiorCoords, itemTemplates, count, itemPowerMult) {
        if (!interiorCoords || interiorCoords.length === 0) {
            console.warn("Нет внутренних помещений для спавна предметов");
            return [];
        }

        // Перемешиваем доступные внутренние клетки
        const shuffledCoords = [...interiorCoords];
        for (let i = shuffledCoords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledCoords[i], shuffledCoords[j]] = [shuffledCoords[j], shuffledCoords[i]];
        }

        const placedItems = [];
        // Берем столько клеток, сколько нужно предметов (или сколько есть)
        const limit = Math.min(count, shuffledCoords.length);

        for (let i = 0; i < limit; i++) {
            const pos = shuffledCoords[i];
            const template = itemTemplates[Math.floor(Math.random() * itemTemplates.length)];
            // Создаем предмет на этой позиции
            placedItems.push(createItem(template, pos.x, pos.y, itemPowerMult));
        }

        return placedItems;
    }
    // === СОЗДАНИЕ БОССА ===
    function createBoss(x, y, depth, bossData) {
        // Базовые статы босса сильно масштабируются от глубины
        const hp = Math.floor(150 * (1 + depth * 0.4));
        const atk = Math.floor(15 * (1 + depth * 0.3));
        const def = Math.floor(8 * (1 + depth * 0.3));

        return {
            x: x, y: y,
            name: bossData.fullName,
            char: 'B', // Символ-заглушка, рендерер использует isBoss
            color: '#ff0000',
            hp: hp, maxHp: hp,
            atk: atk, def: def,
            isEnemy: true,
            isBoss: true,          // ФЛАГ: это босс
            bossType: bossData.bossType, // Для выбора спрайтов
            lootType: 'boss_loot'
        };
    }

        // === НОВАЯ ФУНКЦИЯ: Создание инвентаря торговца ===
    function createMerchantInventory(depth, goldAmount) {
        const items = [];
        // Используем детерминированный сид на основе глубины и текущего времени (чтобы ассортимент менялся при перезаходе, но был стабилен в рамках сессии)
        // Если хочешь полностью статичный магазин для каждой глубины, убери Date.now()
        const rng = new Math.seedrandom(`merchant_${depth}_${Math.floor(Date.now() / 60000)}`); 
        
        // 1. Оружие и Броня (Экипировка)
        const equipTemplates = DataModule.ITEM_TYPES.filter(i => i.type === 'weapon' || i.type === 'armor');
        // Количество зависит от глубины: минимум 5 предметов
        const equipCount = 5 + Math.floor(depth / 2);
        
        for (let i = 0; i < equipCount; i++) {
            const template = equipTemplates[Math.floor(rng() * equipTemplates.length)];
            // Сила предмета растет с глубиной
            const powerMult = 1.0 + (depth * 0.15);
            const item = EntityModule.createItem(template, 0, 0, powerMult);
            
            // Расчет цены продажи: (Базовая ценность * 10) + (Глубина * 5)
            // Это гарантирует, что крутые вещи стоят дорого
            item.price = Math.floor((item.val * 10) + (depth * 10)); 
            items.push(item);
        }

        // 2. Зелья и Еда (Расходники)
        const consumableTemplates = DataModule.ITEM_TYPES.filter(i => 
            i.type.includes('potion') || i.type === 'food' || i.type === 'scroll_teleport'
        );
        const consumableCount = 8 + Math.floor(depth / 3);
        
        for (let i = 0; i < consumableCount; i++) {
            const template = consumableTemplates[Math.floor(rng() * consumableTemplates.length)];
            const item = EntityModule.createItem(template, 0, 0, 1.0);
            
            // Цена расходников зависит от их лечебной/боевой силы (val)
            item.price = Math.floor(item.val * 3); 
            items.push(item);
        }

        return {
            items: items,
            gold: goldAmount
        };
    }

    return {
        createPlayer,
        createEnemy,
        createItem,
        spawnEnemies,
        spawnItems,
        spawnGold,
        spawnItemsInCity,
        createBoss,
        createMerchantInventory // <--- ДОБАВИТЬ ЭКСПОРТ
    };
})();
