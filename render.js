// =========================== Модуль рендеринга (отрисовка, UI, лог, миникарта) ===========================
const RenderModule = (function() {
    let display = null;
    let fov = null;
    let _ctx = null; // Контекст canvas для ручной отрисовки
    
    const COLS = 60;
    const ROWS = 40;
    const FONT_SIZE = 14;
    const TILE_SIZE = 16; // Размер тайла в пикселях (должен совпадать с вашим тайлсетом)

    // === ЗАГРУЗКА СПРАЙТОВ ===
    const spriteImages = {};
    const TILESET_FILES = ['terrain', 'creature', 'item']; 
    
    // Загружаем картинки сразу при инициализации скрипта
    TILESET_FILES.forEach(name => {
        const img = new Image();
        // Укажите правильный путь к вашим файлам!
        img.src = `assets/${name}.png`; 
        spriteImages[name] = img;
    });

    function init() {
        if (typeof ROT === 'undefined') {
            alert("Ошибка: Библиотека ROT.js не загрузилась.");
            throw new Error("ROT missing");
        }

        display = new ROT.Display({
            width: COLS,
            height: ROWS,
            fontSize: FONT_SIZE,
            fontFamily: "Consolas, monospace",
            fg: "#ccc",
            bg: "#000"
        });

        const container = document.getElementById("map-container");
        container.innerHTML = "";
        const canvas = display.getContainer();
        
        // Сохраняем контекст для ручной отрисовки спрайтов
        _ctx = canvas.getContext('2d');
        
        container.appendChild(canvas);

        fov = new ROT.FOV.PreciseShadowcasting((x, y) => !MapModule.isWall(x, y));

        const resizeGame = () => {
            const fw = container.clientWidth;
            const fh = container.clientHeight;
            const cw = canvas.width;
            const ch = canvas.height;
            const scale = Math.min(fw / cw, fh / ch);
            canvas.style.transform = `scale(${scale})`;
        };

        window.addEventListener("resize", resizeGame);
        setTimeout(resizeGame, 50);
    }

    function getCameraOffset(player) {
        return {
            x: player.x - Math.floor(COLS / 2),
            y: player.y - Math.floor(ROWS / 2)
        };
    }

    // === ФУНКЦИЯ ОТРИСОВКИ СПРАЙТА ===
    function drawSprite(ctx, id, sx, sy) {
        // Получаем данные тайла из реестра
        const tileData = typeof getTileData === 'function' ? getTileData(id) : null;
        
        // Если данных нет или картинка не загрузилась -> возвращаем false (fallback на ASCII)
        if (!tileData || !spriteImages[tileData.file]) return false;
        
        const img = spriteImages[tileData.file];
        if (!img.complete || img.naturalWidth === 0) return false;

        // Рисуем часть изображения
        ctx.drawImage(
            img,
            tileData.x * TILE_SIZE, tileData.y * TILE_SIZE, // Источник X, Y
            TILE_SIZE, TILE_SIZE,                           // Ширина, Высота источника
            sx * TILE_SIZE, sy * TILE_SIZE,                 // Назначение X, Y
            TILE_SIZE, TILE_SIZE                            // Ширина, Высота назначения
        );
        return true;
    }

    // === ОТРИСОВКА ПОДЗЕМЕЛЬЯ ===
    function draw(player, enemies, items, npcs = []) {
        if (!_ctx) return;
        
        // Очистка фона
        _ctx.fillStyle = '#000';
        _ctx.fillRect(0, 0, _ctx.canvas.width, _ctx.canvas.height);

        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        const cam = getCameraOffset(player);

        const visible = new Set();
        fov.compute(player.x, player.y, 25, (x, y, r, vis) => {
            if (vis) visible.add(`${x},${y}`);
        });

        // 1. РИСУЕМ ТАЙЛЫ (Стены и Пол)
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const wx = sx + cam.x;
                const wy = sy + cam.y;
                
                if (wx < 0 || wx >= DataModule.MAP_WIDTH || wy < 0 || wy >= DataModule.MAP_HEIGHT) continue;

                const isVisible = visible.has(`${wx},${wy}`);
                let ch, fg;

                // Определяем базовый символ и цвет
                if (MapModule.isWall(wx, wy)) {
                    ch = dtype.wallChar;
                    fg = isVisible ? dtype.wallColor : '#222';
                } else {
                    ch = dtype.floorChar;
                    fg = isVisible ? dtype.floorColor : '#111';
                }

                // Лестницы
                if (MapModule.stairsUp && wx === MapModule.stairsUp.x && wy === MapModule.stairsUp.y) {
                    ch = ">"; fg = isVisible ? "#FFF" : "#333";
                }
                if (MapModule.stairsDown && wx === MapModule.stairsDown.x && wy === MapModule.stairsDown.y) {
                    ch = "<"; fg = isVisible ? "#888" : "#222";
                }

                // Попытка нарисовать спрайт тайла
                // Для стен и пола используем ID из реестра, если они есть, иначе fallback
                let drawn = false;
                if (ch === dtype.wallChar) drawn = drawSprite(_ctx, 'WALL_DEFAULT', sx, sy);
                else if (ch === dtype.floorChar) drawn = drawSprite(_ctx, 'FLOOR_DEFAULT', sx, sy);
                
                // Если спрайт не нарисовался, рисуем текст
                if (!drawn) {
                    _ctx.fillStyle = fg;
                    _ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                    _ctx.textAlign = 'center';
                    _ctx.textBaseline = 'middle';
                    _ctx.fillText(ch, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                }
            }
        }

        // 2. РИСУЕМ ПРЕДМЕТЫ
        items.forEach(i => {
            const sx = i.x - cam.x;
            const sy = i.y - cam.y;
            if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                // Пытаемся нарисовать спрайт предмета по его char или ID
                // Здесь проще использовать char, если в реестре ключи совпадают с char, 
                // но у нас ключи вида 'ITEM_SWORD'. 
                // Для простоты пока оставим ASCII или найдем ID по char (сложнее).
                // Давайте попробуем найти ID по char через реестр (нужна обратная функция, но её нет).
                // Пока рисуем ASCII цветом предмета:
                _ctx.fillStyle = i.color;
                _ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                _ctx.textAlign = 'center';
                _ctx.textBaseline = 'middle';
                _ctx.fillText(i.char, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
            }
        });

        // 3. РИСУЕМ ВРАГОВ
        enemies.forEach(e => {
            if (e.hp > 0) {
                const sx = e.x - cam.x;
                const sy = e.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${e.x},${e.y}`)) {
                    // Здесь можно добавить drawSprite по имени врага, если добавить маппинг
                    _ctx.fillStyle = e.color;
                    _ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                    _ctx.textAlign = 'center';
                    _ctx.textBaseline = 'middle';
                    _ctx.fillText(e.char, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                }
            }
        });

        // 4. РИСУЕМ NPC
        if (window.currentCityNpcs) {
            window.currentCityNpcs.forEach(npc => {
                const sx = npc.x - cam.x;
                const sy = npc.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${npc.x},${npc.y}`)) {
                    _ctx.fillStyle = npc.color;
                    _ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                    _ctx.textAlign = 'center';
                    _ctx.textBaseline = 'middle';
                    _ctx.fillText(npc.char, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                }
            });
        }

        // 5. РИСУЕМ ИГРОКА
        const px = Math.floor(COLS / 2);
        const py = Math.floor(ROWS / 2);
        // Спрайт игрока
        if (!drawSprite(_ctx, 'PLAYER', px, py)) {
            _ctx.fillStyle = player.color;
            _ctx.font = `${FONT_SIZE}px Consolas, monospace`;
            _ctx.textAlign = 'center';
            _ctx.textBaseline = 'middle';
            _ctx.fillText(player.char, px * TILE_SIZE + TILE_SIZE/2, py * TILE_SIZE + TILE_SIZE/2);
        }

        return visible;
    }

    // === ОТРИСОВКА ГЛОБАЛЬНОЙ КАРТЫ ===
    function drawGlobalMap(centerX, centerY) {
        if (!_ctx) return;

        // Очистка
        _ctx.fillStyle = '#000';
        _ctx.fillRect(0, 0, _ctx.canvas.width, _ctx.canvas.height);

        const halfW = Math.floor(COLS / 2);
        const halfH = Math.floor(ROWS / 2);

        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const gx = centerX + sx - halfW;
                const gy = centerY + sy - halfH;

                let tileType = 'plain';
                
                // Получаем тип тайла
                if (typeof GlobalMapModule !== 'undefined') {
                    tileType = GlobalMapModule.getDisplayTileType ? 
                               GlobalMapModule.getDisplayTileType(gx, gy) : 
                               GlobalMapModule.getTileType(gx, gy);
                }

                // Маппинг типа тайла -> ID в реестре
                const typeToId = {
                    'plain': 'TILE_PLAIN', 
                    'forest': 'TILE_FOREST', 
                    'mountain': 'TILE_MOUNTAIN',
                    'water': 'TILE_WATER', 
                    'city': 'TILE_CITY', 
                    'dungeon_entrance': 'TILE_DUNGEON_ENTRANCE',
                    'road': 'TILE_ROAD'
                };
                
                const id = typeToId[tileType] || 'TILE_PLAIN';
                
                // Цвета для fallback (если спрайт не загрузился)
                const colors = {
                    'TILE_PLAIN': '#8c8c8c', 'TILE_FOREST': '#2e8b57', 'TILE_MOUNTAIN': '#a0a0a0',
                    'TILE_WATER': '#4682b4', 'TILE_CITY': '#ffd700', 'TILE_DUNGEON_ENTRANCE': '#cd5c5c', 'TILE_ROAD': '#b8860b'
                };

                // 1. Попытка нарисовать спрайт
                const drawn = drawSprite(_ctx, id, sx, sy);

                // 2. Fallback на ASCII
                if (!drawn) {
                    const ch = getChar(id);
                    _ctx.fillStyle = colors[id] || '#555';
                    _ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                    _ctx.textAlign = 'center';
                    _ctx.textBaseline = 'middle';
                    _ctx.fillText(ch, sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                }

                // 3. Игрок поверх всего
                if (gx === centerX && gy === centerY) {
                    const playerDrawn = drawSprite(_ctx, 'PLAYER', sx, sy);
                    if (!playerDrawn) {
                        _ctx.fillStyle = '#fff';
                        _ctx.font = `${FONT_SIZE}px Consolas, monospace`;
                        _ctx.textAlign = 'center';
                        _ctx.textBaseline = 'middle';
                        _ctx.fillText('@', sx * TILE_SIZE + TILE_SIZE/2, sy * TILE_SIZE + TILE_SIZE/2);
                    }
                }
            }
        }
    }
     
    // === МИНИКАРТА ДЛЯ ГЛОБАЛЬНОЙ КАРТЫ ===
    function drawGlobalMinimap(centerX, centerY) {
        const cvs = document.getElementById("minimap");
        if (!cvs) return;

        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cvs.width, cvs.height);

        // Размер миникарты: 20x20 клеток вокруг центра
        const MINIMAP_SIZE = 20;
        const cellW = cvs.width / MINIMAP_SIZE;
        const cellH = cvs.height / MINIMAP_SIZE;

        const startX = centerX - Math.floor(MINIMAP_SIZE / 2);
        const startY = centerY - Math.floor(MINIMAP_SIZE / 2);

        for (let dy = 0; dy < MINIMAP_SIZE; dy++) {
            for (let dx = 0; dx < MINIMAP_SIZE; dx++) {
                const gx = startX + dx;
                const gy = startY + dy;
            
                let displayType = 'plain';
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getDisplayTileType) {
                    displayType = GlobalMapModule.getDisplayTileType(gx, gy);
                } else if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getTileType) {
                    displayType = GlobalMapModule.getTileType(gx, gy);
                }
            
                let color;
                switch(displayType) {
                    case 'plain': color = '#555'; break;
                    case 'forest': color = '#2e8b57'; break;
                    case 'mountain': color = '#888'; break;
                    case 'water': color = '#4682b4'; break;
                    case 'city': color = '#ffd700'; break;
                    case 'dungeon_entrance': color = '#cd5c5c'; break;
                    case 'road': color = '#b8860b'; break;
                    default: color = '#333';
                }
            
                // Игрок
                if (gx === centerX && gy === centerY) {
                    color = '#0f0';
                }
            
                ctx.fillStyle = color;
                ctx.fillRect(dx * cellW, dy * cellH, cellW, cellH);
            }
        }
    }

    // === UI И ЛОГ ===
    function updateUI(player, locData, worldTrend) {
        if (locData) {
            document.getElementById("ui-loc-name").textContent = locData.fullName;
            document.getElementById("ui-loc-desc").textContent = locData.description;
            let typeText = `Тип: ${locData.themeName || locData.type || '?'}`;
            if (worldTrend && worldTrend.name !== "Обычный уровень") {
                typeText += ` | ${worldTrend.name}`;
                document.getElementById("ui-loc-name").style.color = worldTrend.color;
            } else {
                document.getElementById("ui-loc-name").style.color = "var(--accent)";
            }
            document.getElementById("ui-loc-type").textContent = typeText;
        }
        
        // Если есть игрок, показываем его статы
        if (player && player.hp !== undefined) {
            document.getElementById("ui-stats").innerHTML = `
                <div class="stat-row"><span>HP</span> <span class="val-hp">${player.hp}/${player.maxHp}</span></div>
                <div class="stat-row"><span>Атака</span> <span class="val-atk">${player.atk}</span></div>
                <div class="stat-row"><span>Защита</span> <span class="val-def">${player.def}</span></div>
                <div class="stat-row"><span>Уровень</span> <span>${player.level}</span></div>
                <div class="stat-row"><span>Золото</span> <span style="color: #FFD700">$ ${player.gold}</span></div>
            `;
            
            // Отображение экипировки с боезапасом (если есть)
            const w = player.equipment.weapon ? 
                (player.equipment.weapon.maxAmmo > 0 ? 
                    `${player.equipment.weapon.name} (${player.equipment.weapon.currentAmmo})` : 
                    player.equipment.weapon.name) 
                : "—";
                
            const a = player.equipment.armor ? player.equipment.armor.name : "—";
            
            document.getElementById("ui-equip").innerHTML = `
                <div class="equip-slot">Рука: <span class="equip-item">${w}</span></div>
                <div class="equip-slot">Тело: <span class="equip-item">${a}</span></div>
            `;

            // === ОТРИСОВКА ИНВЕНТАРЯ С ГРУППИРОВКОЙ ===
            const invDiv = document.getElementById("inventory-list");
            if (invDiv) {
                invDiv.innerHTML = "";
                
                if (player.inventory.length === 0) {
                    invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
                } else {
                    // 1. Группируем предметы
                    const grouped = {};
                    const order = []; 

                    player.inventory.forEach((item, originalIndex) => {
                        // Ключ группировки: имя + тип + макс. боезапас (чтобы разные луки не смешивались)
                        const key = `${item.name}_${item.type}_${item.maxAmmo || 0}`;
                        
                        if (!grouped[key]) {
                            grouped[key] = { 
                                item: item,
                                count: 0,
                                indices: []
                            };
                            order.push(key);
                        }
                        grouped[key].count++;
                        grouped[key].indices.push(originalIndex);
                    });

                    // 2. Отрисовываем группы
                    order.forEach(key => {
                        const group = grouped[key];
                        const item = group.item;
                        
                        const div = document.createElement("div");
                        div.className = "inv-item";
                        div.style.color = item.color;
                        
                        // Формируем текст отображения
                        let html = `${item.char} ${item.name}`;
                        
                        // Добавляем значение бонуса
                        if (item.val) {
                            html += ` (+${item.val})`;
                        }

                        // Если предметов больше 1, добавляем количество
                        if (group.count > 1) {
                            html += ` <span style="opacity:0.7">(${group.count})</span>`;
                        } 
                        // Если предмет одиночный, но имеет боезапас
                        else if (item.maxAmmo > 0) {
                            html += ` <span style="opacity:0.7">[${item.currentAmmo}]</span>`;
                        }

                        // ВАЖНО: используем innerHTML вместо textContent, чтобы тег <span> сработал
                        div.innerHTML = html;
                        
                        // При клике используем ПЕРВЫЙ предмет из группы
                        div.onclick = () => CombatModule.useItem(player, group.indices[0], log, () => updateUI(player, locData, worldTrend));
                        
                        invDiv.appendChild(div);
                    });
                }
            }
        }
    }

    function log(msg, type = "info") {
        const list = document.getElementById("log-list");
        const div = document.createElement("div");
        div.className = `log-msg log-${type}`;
        div.textContent = `> ${msg}`;
        list.prepend(div);
        if (list.children.length > 50) list.lastChild.remove();
    }

    // === МИНИКАРТА ДЛЯ ПОДЗЕМЕЛЬЯ ===
    function drawMinimap(player, explored) {
        const cvs = document.getElementById("minimap");
        if (!cvs || !player) return;
        
        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#000"; 
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        const cw = cvs.width / DataModule.MAP_WIDTH;
        const ch = cvs.height / DataModule.MAP_HEIGHT;
        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        explored.forEach(k => {
            const [x, y] = k.split(',').map(Number);
            ctx.fillStyle = MapModule.isWall(x, y) ? dtype.wallColor : dtype.floorColor;
            ctx.globalAlpha = 0.5; 
            ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
            ctx.globalAlpha = 1.0;
        });
        ctx.fillStyle = "#0F0";
        ctx.fillRect(player.x * cw, player.y * ch, cw + 1, ch + 1);
    }

    function updateInspector(title, details, type = "neutral") {
        const div = document.getElementById("ui-inspector");
        if (!div) return;

        let color = "var(--text-dim)";
        if (type === "enemy") color = "var(--danger)";
        if (type === "loot") color = "var(--gold)";
        if (type === "npc") color = "var(--accent)";

        div.innerHTML = `
            <div style="color: ${color}; font-weight: bold; margin-bottom: 4px;">${title}</div>
            <div style="white-space: pre-line;">${details}</div>
        `;
    }
    
    return {
        init,
        draw,
        drawGlobalMap,
        drawGlobalMinimap,
        updateUI,
        log,
        drawMinimap,
        getCameraOffset,
        updateInspector, 
        COLS,
        ROWS,
        _ctx // Экспортируем контекст, если понадобится другим модулям
    };
})();
