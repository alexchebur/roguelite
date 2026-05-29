// =========================== Модуль рендеринга (отрисовка, UI, лог, миникарта + ЭФФЕКТЫ) ===========================
const RenderModule = (function() {
    let display = null;
    let fov = null;
    const COLS = 60;
    const ROWS = 40;
    const FONT_SIZE = 14;
    
    // === СИСТЕМА ЭФФЕКТОВ ===
    let activeEffects = []; 
    let currentCameraOffset = { x: 0, y: 0 };

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
        container.appendChild(canvas);

        fov = new ROT.FOV.PreciseShadowcasting((x, y) => !MapModule.isWall(x, y));

        const resizeGame = () => {
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
        
        // Запускаем цикл обновления эффектов (для удаления старых)
        startEffectLoop();
    }

    // Цикл только для очистки старых эффектов (не для рисования!)
    function startEffectLoop() {
        setInterval(() => {
            const now = Date.now();
            activeEffects = activeEffects.filter(effect => now < effect.endTime);
        }, 100);
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
    function drawEffects(ctx, cam, options) {
        const now = Date.now();
        const tileW = options.width;
        const tileH = options.height;

        activeEffects.forEach(effect => {
            if (effect.type === 'blink') {
                // Пульсация прозрачности
                const progress = (effect.endTime - now) / effect.duration;
                const alpha = Math.abs(Math.sin(now * 0.015)) * 0.6; 
                
                ctx.fillStyle = effect.color.replace(/[\d\.]+\)$/g, `${alpha})`);
                
                // Рисуем прямоугольник поверх клетки
                // Учитываем смещение камеры
                const screenX = (effect.x - cam.x) * tileW;
                const screenY = (effect.y - cam.y) * tileH;
                
                // Рисуем только если в поле зрения
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

                ctx.fillStyle = "#FFFF00"; 
                ctx.font = `bold ${options.fontSize}px ${options.fontFamily}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                
                // Тень для точки, чтобы её было видно на светлом фоне
                ctx.shadowColor = "black";
                ctx.shadowBlur = 2;
                ctx.fillText(".", screenCurX, screenCurY);
                ctx.shadowBlur = 0;
            }
        });
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
    // === ОТРИСОВКА ПОДЗЕМЕЛЬЯ ===
    function draw(player, enemies, items, npcs = []) {
        display.clear();
        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        const cam = getCameraOffset(player);

        const visible = new Set();
        fov.compute(player.x, player.y, 25, (x, y, r, vis) => {
            if (vis) visible.add(`${x},${y}`);
        });

        // 1. Отрисовка карты
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const wx = sx + cam.x;
                const wy = sy + cam.y;
                if (wx < 0 || wx >= DataModule.MAP_WIDTH || wy < 0 || wy >= DataModule.MAP_HEIGHT) continue;

                const isVisible = visible.has(`${wx},${wy}`);
                let ch, fg, bg;

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

                display.draw(sx, sy, ch, fg, "#000");
            }
        }

        // 2. Предметы
        items.forEach(i => {
            const sx = i.x - cam.x;
            const sy = i.y - cam.y;
            if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                display.draw(sx, sy, i.char, i.color);
            }
        });

        // 3. Враги (с эффектом вспышки)
        const now = Date.now();
        enemies.forEach(e => {
            if (e.hp > 0) {
                const sx = e.x - cam.x;
                const sy = e.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${e.x},${e.y}`)) {
                    
                    let drawChar = e.char;
                    let drawColor = e.color;

                    // === ЭФФЕКТ ВСПЫШКИ ПРИ УРОНЕ ===
                    if (e.flashEndTime && now < e.flashEndTime) {
                        drawChar = e.flashChar || "*"; // Символ вспышки
                        drawColor = "#FFFFFF";         // Белый цвет вспышки
                    }

                    display.draw(sx, sy, drawChar, drawColor);
                }
            }
        });

        // 4. NPC (тоже могут получать урон или просто для единообразия)
        if (window.currentCityNpcs) {
            window.currentCityNpcs.forEach(npc => {
                const sx = npc.x - cam.x;
                const sy = npc.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${npc.x},${npc.y}`)) {
                    
                    let drawChar = npc.char;
                    let drawColor = npc.color;

                    if (npc.flashEndTime && now < npc.flashEndTime) {
                        drawChar = npc.flashChar || "*";
                        drawColor = "#FFFFFF";
                    }

                    display.draw(sx, sy, drawChar, drawColor);
                }
            });
        }

        // 5. Игрок (с эффектом вспышки)
        let playerChar = player.char;
        let playerColor = player.color;
        
        if (player.flashEndTime && now < player.flashEndTime) {
            playerChar = player.flashChar || "*";
            playerColor = "#FF0000"; // Красная вспышка для игрока
        }
        
        display.draw(Math.floor(COLS / 2), Math.floor(ROWS / 2), playerChar, playerColor);

        return visible;
    }
    // === ОСТАЛЬНЫЕ ФУНКЦИИ (Global Map, UI, Log) БЕЗ ИЗМЕНЕНИЙ ===
    function drawGlobalMap(centerX, centerY) {
        display.clear();
        const halfW = Math.floor(COLS / 2);
        const halfH = Math.floor(ROWS / 2);
    
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const gx = centerX + sx - halfW;
                const gy = centerY + sy - halfH;
                let ch, fg;
                let tileType = 'plain';
            
                if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getDisplayTileType) {
                    tileType = GlobalMapModule.getDisplayTileType(gx, gy);
                } else if (typeof GlobalMapModule !== 'undefined' && GlobalMapModule.getTileType) {
                    tileType = GlobalMapModule.getTileType(gx, gy);
                }
            
                switch(tileType) {
                    case 'plain': ch = '.'; fg = '#8c8c8c'; break;
                    case 'forest': ch = 'T'; fg = '#2e8b57'; break;
                    case 'mountain': ch = '^'; fg = '#a0a0a0'; break;
                    case 'water': ch = '≈'; fg = '#4682b4'; break;
                    case 'city': ch = 'C'; fg = '#ffd700'; break;
                    case 'dungeon_entrance': ch = 'D'; fg = '#cd5c5c'; break;
                    case 'road': ch = '▮'; fg = 'a1776d'; break;
                    default: ch = '·'; fg = '#555';
                }
             
                if (gx === centerX && gy === centerY) {
                    ch = '@'; fg = '#fff';
                }
            
                display.draw(sx, sy, ch, fg, '#000');
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
    
    // ... (предыдущий код render.js без изменений) ...

    // Функция для запроса перерисовки извне (например, из системы эффектов)
    let redrawCallback = null;

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
        setRedrawCallback, // <--- ДОБАВИТЬ ЭКСПОРТ
        requestRedraw,     // <--- ДОБАВИТЬ ЭКСПОРТ
        COLS,
        ROWS
    };
})();
