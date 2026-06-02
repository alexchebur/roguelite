// =========================== Модуль рендеринга (отрисовка, UI, лог, миникарта + ЭФФЕКТЫ) ===========================
const RenderModule = (function() {
    let display = null;
    let fov = null;
    const COLS = 60;
    const ROWS = 40;
    const FONT_SIZE = 16; // Изменено под тайлсет 16x16
    
    // === СИСТЕМА ЭФФЕКТОВ ===
    let activeEffects = []; 
    let currentCameraOffset = { x: 0, y: 0 };
    let redrawCallback = null;

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
            bg: "#000",
            forceSquareRatio: true
        });

        const container = document.getElementById("map-container");
        container.innerHTML = "";
        const canvas = display.getContainer();
        container.appendChild(canvas);

        // ✅ КЭШИРУЕМ КОНТЕКСТ ОДИН РАЗ
        const ctx = canvas.getContext('2d');
        RenderModule._ctx = ctx; 

        fov = new ROT.FOV.PreciseShadowcasting((x, y) => !MapModule.isWall(x, y));

        const resizeGame = () => {
            if (!canvas) return;
            const fw = container.clientWidth;
            const fh = container.clientHeight;
            const cw = canvas.width;
            const ch = canvas.height;
            const scale = Math.min(fw / cw, fh / ch);
            canvas.style.transform = `scale(${scale})`;
            canvas.style.transformOrigin = "center center";
        };

        window.addEventListener("resize", resizeGame);
        setTimeout(resizeGame, 50);

        if (typeof TilesetRenderer !== 'undefined') TilesetRenderer.init();
        
        // Запуск цикла очистки старых эффектов (если есть модуль эффектов)
        if (typeof startEffectLoop === 'function') startEffectLoop();
    }

    // === ДОБАВЛЕНИЕ ЭФФЕКТОВ ===
    function addBlinkEffect(x, y, duration = 500, color = null) {
        activeEffects.push({
            type: 'blink',
            x: x, y: y,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            duration: duration,
            color: color || "rgba(255, 0, 0, 0.5)"
        });
    }

    function addProjectileEffect(sx, sy, tx, ty, duration = 300) {
        activeEffects.push({
            type: 'projectile',
            sx: sx, sy: sy,
            tx: tx, ty: ty,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            duration: duration
        });
    }

    // === ОТРИСОВКА ЭФФЕКТОВ (вызывается внутри draw) ===
    function drawEffects(ctx, cam) {
        const now = Date.now();
        const tileW = 16; // TILE_SIZE
        const tileH = 16;

        // Фильтруем и рисуем активные эффекты
        for (let i = activeEffects.length - 1; i >= 0; i--) {
            const effect = activeEffects[i];
            
            // Удаляем истекшие эффекты
            if (now > effect.endTime) {
                activeEffects.splice(i, 1);
                continue;
            }

            if (effect.type === 'blink') {
                // Пульсация прозрачности
                const progress = (effect.endTime - now) / effect.duration;
                const alpha = Math.abs(Math.sin(now * 0.015)) * 0.6; 
                
                // Парсим цвет и меняем альфа-канал
                let baseColor = effect.color;
                if (baseColor.startsWith('rgba')) {
                    baseColor = baseColor.replace(/[\d\.]+\)$/g, `${alpha})`);
                } else {
                    // Если hex, конвертируем в rgba (упрощенно)
                    baseColor = `rgba(255, 0, 0, ${alpha})`; 
                }
                
                ctx.fillStyle = baseColor;
                
                const screenX = (effect.x - cam.x) * tileW;
                const screenY = (effect.y - cam.y) * tileH;
                
                // Рисуем только если в поле зрения канваса
                if (screenX >= -tileW && screenX < COLS * tileW && screenY >= -tileH && screenY < ROWS * tileH) {
                    ctx.fillRect(screenX, screenY, tileW, tileH);
                }
            } 
            else if (effect.type === 'projectile') {
                const totalTime = effect.duration;
                const elapsed = now - effect.startTime;
                const t = Math.min(1, elapsed / totalTime);

                // Интерполяция позиции
                const worldCurX = effect.sx + (effect.tx - effect.sx) * t;
                const worldCurY = effect.sy + (effect.ty - effect.sy) * t;

                const screenCurX = (worldCurX - cam.x) * tileW + tileW / 2;
                const screenCurY = (worldCurY - cam.y) * tileH + tileH / 2;

                ctx.save();
                ctx.fillStyle = "#FFFF00"; 
                ctx.font = `bold 12px Consolas, monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "black";
                ctx.shadowBlur = 4;
                ctx.fillText("*", screenCurX, screenCurY);
                ctx.restore();
            }
        }
    }

    function getCameraOffset(player) {
        const cam = {
            x: player.x - Math.floor(COLS / 2),
            y: player.y - Math.floor(ROWS / 2)
        };
        currentCameraOffset = cam;
        return cam;
    }

    // === ОТРИСОВКА ПОДЗЕМЕЛЬЯ ===
    function draw(player, enemies, items, npcs = []) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        // Очищаем канвас черным цветом
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        const cam = getCameraOffset(player);

        const visible = new Set();
        fov.compute(player.x, player.y, 25, (x, y, r, vis) => {
            if (vis) visible.add(`${x},${y}`);
        });

        // 1. РИСУЕМ ТАЙЛЫ (ПОЛ И СТЕНЫ)
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const wx = sx + cam.x;
                const wy = sy + cam.y;
                
                // Проверка границ карты
                if (wx < 0 || wx >= DataModule.MAP_WIDTH || wy < 0 || wy >= DataModule.MAP_HEIGHT) continue;

                const isVisible = visible.has(`${wx},${wy}`);
                let ch, fg;

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

                // Рисуем спрайт
                if (typeof TilesetRenderer !== 'undefined') {
                    TilesetRenderer.draw(ctx, ch, sx, sy, fg);
                } else {
                    // Fallback на текст, если тайлсет не загружен
                    ctx.fillStyle = fg;
                    ctx.font = '16px Consolas, monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(ch, sx * 16 + 8, sy * 16 + 8);
                }
            }
        }

        // 2. РИСУЕМ ПРЕДМЕТЫ
        if (items) {
            items.forEach(i => {
                const sx = i.x - cam.x, sy = i.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                    if (typeof TilesetRenderer !== 'undefined') {
                        TilesetRenderer.draw(ctx, i.char, sx, sy, i.color);
                    }
                }
            });
        }

        // 3. РИСУЕМ ВРАГОВ
        if (enemies) {
            enemies.forEach(e => {
                if (e.hp > 0) {
                    const sx = e.x - cam.x, sy = e.y - cam.y;
                    if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${e.x},${e.y}`)) {
                        if (typeof TilesetRenderer !== 'undefined') {
                            TilesetRenderer.draw(ctx, e.char, sx, sy, e.color);
                        }
                    }
                }
            });
        }

        // 4. РИСУЕМ NPC
        if (window.currentCityNpcs) {
            window.currentCityNpcs.forEach(npc => {
                const sx = npc.x - cam.x, sy = npc.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${npc.x},${npc.y}`)) {
                    if (typeof TilesetRenderer !== 'undefined') {
                        TilesetRenderer.draw(ctx, npc.char, sx, sy, npc.color);
                    }
                }
            });
        }

        // 5. РИСУЕМ ИГРОКА
        if (player) {
            const px = Math.floor(COLS / 2);
            const py = Math.floor(ROWS / 2);
            if (typeof TilesetRenderer !== 'undefined') {
                TilesetRenderer.draw(ctx, player.char, px, py, player.color);
            }
        }

        // 6. РИСУЕМ ЭФФЕКТЫ ПОВЕРХ ВСЕГО
        drawEffects(ctx, cam);

        return visible;
    }

    // === ОТРИСОВКА ГЛОБАЛЬНОЙ КАРТЫ ===
    function drawGlobalMap(centerX, centerY) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const halfW = Math.floor(COLS / 2);
        const halfH = Math.floor(ROWS / 2);

        const typeMap = {
            'plain':           ['.', '#8c8c8c'],
            'forest':          ['T', '#2e8b57'],
            'mountain':        ['^', '#a0a0a0'],
            'water':           ['≈', '#4682b4'],
            'city':            ['C', '#ffd700'],
            'dungeon_entrance':['D', '#cd5c5c'],
            'road':            ['█', '#b8860b']
        };

        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const gx = centerX + sx - halfW;
                const gy = centerY + sy - halfH;

                let tileType = 'plain';
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getDisplayTileType) {
                    tileType = GlobalMapModule.getDisplayTileType(gx, gy);
                } else if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getTileType) {
                    tileType = GlobalMapModule.getTileType(gx, gy);
                }

                const [ch, fg] = typeMap[tileType] || ['·', '#555'];
                const isPlayer = (gx === centerX && gy === centerY);
                const finalCh = isPlayer ? '@' : ch;
                const finalFg = isPlayer ? '#ffffff' : fg;

                if (typeof TilesetRenderer !== 'undefined') {
                    TilesetRenderer.draw(ctx, finalCh, sx, sy, finalFg);
                } else {
                    ctx.fillStyle = finalFg;
                    ctx.font = '16px Consolas, monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(finalCh, sx * 16 + 8, sy * 16 + 8);
                }
            }
        }
    }
     
    function drawGlobalMinimap(centerX, centerY) {
        const cvs = document.getElementById("minimap");
        if (!cvs) return;
        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cvs.width, cvs.height);
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
                if (gx === centerX && gy === centerY) color = '#0f0';
                ctx.fillStyle = color;
                ctx.fillRect(dx * cellW, dy * cellH, cellW, cellH);
            }
        }
    }

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

        const exitEl = document.getElementById("ui-loc-coords");
        if (exitEl) {
            if (!player || locData?.themeName === "Поверхность" || !MapModule.stairsUp) {
                exitEl.textContent = "Выход: —";
            } else {
                const sx = MapModule.stairsUp.x, sy = MapModule.stairsUp.y;
                const dx = sx - player.x, dy = sy - player.y;
                
                let arrow = (dx === 0 && dy === 0) ? '🏠' : '';
                if (!arrow) {
                    if (dy < 0) arrow += '↑'; 
                    else if (dy > 0) arrow += '↓';
                    if (dx > 0) arrow += '→'; 
                    else if (dx < 0) arrow += '←';
                    
                    if (arrow === '↑←') arrow = '↖';
                    if (arrow === '↑→') arrow = '↗';
                    if (arrow === '↓←') arrow = '↙';
                    if (arrow === '↓→') arrow = '↘';
                }
                exitEl.textContent = `Выход: ${arrow}`;
            }
        }
        
        if (player && player.hp !== undefined) {
            document.getElementById("ui-stats").innerHTML = `
                <div class="stat-row"><span>HP</span> <span class="val-hp">${player.hp}/${player.maxHp}</span></div>
                <div class="stat-row"><span>Атака</span> <span class="val-atk">${player.atk}</span></div>
                <div class="stat-row"><span>Защита</span> <span class="val-def">${player.def}</span></div>
                <div class="stat-row"><span>Уровень</span> <span>${player.level}</span></div>
                <div class="stat-row"><span>Золото</span> <span style="color: #FFD700">$ ${player.gold}</span></div>
            `;
            
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

            const invDiv = document.getElementById("inventory-list");
            if (invDiv) {
                invDiv.innerHTML = "";
                if (player.inventory.length === 0) {
                    invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
                } else {
                    const grouped = {};
                    const order = []; 
                    player.inventory.forEach((item, originalIndex) => {
                        const key = `${item.name}_${item.type}_${item.maxAmmo || 0}`;
                        if (!grouped[key]) {
                            grouped[key] = { item: item, count: 0, indices: [] };
                            order.push(key);
                        }
                        grouped[key].count++;
                        grouped[key].indices.push(originalIndex);
                    });

                    order.forEach(key => {
                        const group = grouped[key];
                        const item = group.item;
                        const div = document.createElement("div");
                        div.className = "inv-item";
                        div.style.color = item.color;
                        let html = `${item.char} ${item.name}`;
                        if (item.val) html += ` (+${item.val})`;
                        if (group.count > 1) {
                            html += ` <span style="opacity:0.7">(${group.count})</span>`;
                        } else if (item.maxAmmo > 0) {
                            html += ` <span style="opacity:0.7">[${item.currentAmmo}]</span>`;
                        }
                        div.innerHTML = html;
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

    function setRedrawCallback(callback) {
        redrawCallback = callback;
    }

    function requestRedraw() {
        if (redrawCallback) {
            redrawCallback();
        }
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
        setRedrawCallback,
        requestRedraw,
        addBlinkEffect,      // Экспорт для использования в combat.js
        addProjectileEffect, // Экспорт для использования в combat.js
        COLS,
        ROWS
    };
})();
" А вот tileset_renderer.js: "// tileset_renderer.js
const TilesetRenderer = (function() {
    const TILE_SIZE = 16;
    const spriteSheets = {};
    let isReady = false;
    let debugMode = false;

    // === МАППИНГ: символ → (файл, колонка, строка) ===
    // Убедитесь, что координаты x,y соответствуют вашему PNG!
    const TILE_MAP = {
        //  Terrain (ПОПРОБУЙТЕ СДВИНУТЬ Y НА 1, ЕСЛИ ПЕРВЫЙ РЯД ПУСТОЙ)
        '#': { file: 'terrain', x: 1, y: 2 }, 
        '.': { file: 'terrain', x: 0, y: 1 },
        '>': { file: 'terrain', x: 3, y: 0 },
        '<': { file: 'terrain', x: 2, y: 0 },
        'T': { file: 'terrain', x: 8, y: 2 },
        '^': { file: 'terrain', x: 5, y: 2 },
        '≈': { file: 'terrain', x: 7, y: 2 },
        'C': { file: 'terrain', x: 9, y: 2 },
        'D': { file: 'terrain', x: 6, y: 0 },
        '█': { file: 'terrain', x: 11, y: 2 },
        //'·': { file: 'terrain', x: 0, y: 1 },
        'o': { file: 'terrain', x: 3, y: 2 },
        'O': { file: 'terrain', x: 4, y: 2 },
        // ... остальные без изменений пока что

        //  Creatures & NPCs
        '@': { file: 'creature', x: 2, y: 0 },
        'r': { file: 'creature', x: 8, y: 9 },
        'g': { file: 'creature', x: 12, y: 3 },
        'w': { file: 'creature', x: 1, y: 9 },
        'j': { file: 'creature', x: 3, y: 15 },
        'b': { file: 'creature', x: 5, y: 0 },
        's': { file: 'creature', x: 6, y: 0 },
        'O': { file: 'creature', x: 7, y: 0 }, 
        'z': { file: 'creature', x: 8, y: 0 },
        'h': { file: 'creature', x: 9, y: 0 },
        'G': { file: 'creature', x: 10, y: 0 },
        'V': { file: 'creature', x: 11, y: 0 },
        'T': { file: 'creature', x: 12, y: 0 },
        'L': { file: 'creature', x: 13, y: 0 },
        'M': { file: 'creature', x: 14, y: 0 },
        'q': { file: 'creature', x: 15, y: 0 },
        '☺': { file: 'creature', x: 8, y: 3 },

        // 🎒 Items
        '/': { file: 'item', x: 0, y: 0 },
        '^': { file: 'item', x: 1, y: 0 },
        ')': { file: 'item', x: 2, y: 0 },
        '*': { file: 'item', x: 3, y: 0 },
        'Y': { file: 'item', x: 4, y: 0 },
        '(': { file: 'item', x: 5, y: 0 },
        '=': { file: 'item', x: 6, y: 0 },
        '|': { file: 'item', x: 7, y: 0 },
        ']': { file: 'item', x: 8, y: 0 },
        '[': { file: 'item', x: 9, y: 0 },
        '}': { file: 'item', x: 10, y: 0 },
        '{': { file: 'item', x: 11, y: 0 },
        'H': { file: 'item', x: 12, y: 0 },
        '!': { file: 'item', x: 14, y: 0 },
        '+': { file: 'item', x: 15, y: 0 },
        '%': { file: 'item', x: 16, y: 0 },
        '~': { file: 'item', x: 17, y: 0 },
        '$': { file: 'item', x: 18, y: 0 }
    };

    async function init() {
        const files = [
            { src: 'terrain_sprites.png', key: 'terrain' },
            { src: 'creature_sprites.png', key: 'creature' },
            { src: 'item_sprites.png', key: 'item' }
        ];
        
        // Исправленный Promise.all с правильными скобками
        await Promise.all(files.map(({src, key}) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                spriteSheets[key] = img;
                console.log(`✅ Загружен тайлсет: ${key} (${img.width}x${img.height})`);
                resolve();
            };
            img.onerror = () => {
                console.error(`❌ Ошибка загрузки: ${src}`);
                reject();
            };
            img.src = src;
        })));
        
        isReady = true;
    }

    function draw(ctx, ch, sx, sy, color) {
        if (!ctx) return;

        const destX = sx * TILE_SIZE;
        const destY = sy * TILE_SIZE;

        const tile = TILE_MAP[ch];
        
        if (!tile) {
            // Fallback: рисуем текст
            ctx.fillStyle = color || '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, destX + TILE_SIZE/2, destY + TILE_SIZE/2);
            return;
        }

        const img = spriteSheets[tile.file];
        
        if (!img || !isReady) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            return;
        }

        const srcX = tile.x * TILE_SIZE;
        const srcY = tile.y * TILE_SIZE;

        // Проверка границ
        if (srcX + TILE_SIZE > img.width || srcY + TILE_SIZE > img.height) {
            ctx.fillStyle = '#ffff00';
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#000';
            ctx.font = '10px Arial';
            ctx.fillText('OOB', destX + 2, destY + 5);
            return;
        }

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        // Рисуем спрайт КАК ЕСТЬ (без окраски)
        ctx.drawImage(img, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE);

        // === ВРЕМЕННО ОТКЛЮЧАЕМ ОКРАСКУ ДЛЯ ПРОВЕРКИ ===
        // Раскомментируйте блок ниже, когда сделаете спрайты белыми
        
        /*
        const fillColor = color || '#ffffff';
        if (fillColor && fillColor !== '#000' && fillColor !== '#000000') {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = fillColor;
            ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        }
        */

        ctx.restore();
    }

    return { 
        init, 
        draw, 
        TILE_SIZE,
        setDebug: (v) => debugMode = v,
        isReady: () => isReady
    };
})();
