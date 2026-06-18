// =========================== Модуль рендеринга (отрисовка, UI, лог, миникарта + ЭФФЕКТЫ) ===========================
const RenderModule = (function() {
    let display = null;
    let fov = null;
    const COLS = 30;
    const ROWS = 20;
    const FONT_SIZE = 16; 
    const TILE_SIZE = 32; 

    // === СИСТЕМА ЭФФЕКТОВ ===
    let activeEffects = []; 
    let currentCameraOffset = { x: 0, y: 0 };
    let redrawCallback = null;

    // === АСИНХРОННАЯ ИНИЦИАЛИЗАЦИЯ ===
    async function init() {
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

        // ✅ СОХРАНЯЕМ КОНТЕКСТ ДЛЯ РУЧНОЙ ОТРИСОВКИ
        RenderModule._ctx = canvas.getContext('2d'); 

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

        console.log("🔄 Загрузка тайлсетов...");
        
        // 1. Ждем загрузки TilesetRenderer (подземелье)
        if (typeof TilesetRenderer !== 'undefined') {
            await TilesetRenderer.init();
            console.log("✅ TilesetRenderer готов!");
        } else {
            console.warn("TilesetRenderer не найден.");
        }

        // Запуск цикла очистки старых эффектов (если есть модуль эффектов)
        if (typeof startEffectLoop === 'function') startEffectLoop();
        
        console.log("🚀 RenderModule полностью инициализирован.");
    }
    // === ОБНОВЛЕНИЕ ТЕКУЩЕГО КВЕСТА В ФУТЕРЕ ===
    // === ОБНОВЛЕНИЕ ТЕКУЩЕГО КВЕСТА В ФУТЕРЕ ===
    function updateQuestBriefing(quest) {
        const el = document.getElementById("ui-quest-briefing");
        if (!el) return;

        if (!quest) {
            el.textContent = " ";
            return;
        }

        let statusIcon = "📜 ";
        if (quest.isCompleted && !quest.isTurnedIn) statusIcon = "🏆 ";
        
        // Формируем краткое описание цели
        let goalText = " ";
        
        if (quest.type === 'FETCH') {
            goalText = `Найти: ${quest.target.itemName}`;
        } 
        else if (quest.type === 'HUNT' || quest.type === 'BOUNTY') {
            // Для BOUNTY и HUNT показываем счетчик убитых
            goalText = `Убить: ${quest.target.enemyName} (${quest.progress}/${quest.maxProgress})`;
        }
        else if (quest.type === 'COLLECT') {
            goalText = `Собрать: ${quest.target.itemName} (${quest.progress}/${quest.maxProgress})`;
        }
        else if (quest.type === 'SCHOLAR') {
            goalText = `Прочитать книг: (${quest.progress}/${quest.maxProgress})`;
        }
        else if (quest.type === 'EXPLORE') {
            goalText = `Исследовать: ${quest.target.locationName}`;
        }
        else if (quest.type === 'DIGGER') {
            goalText = `Глубина: ${quest.target.targetDepth} в ${quest.target.locationName}`;
        }

        el.innerHTML = `<span style="color:${statusIcon === '🏆' ? '#00ff00' : 'var(--gold)'}">${statusIcon} ${goalText}</span>`;
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
        const tileW = TILE_SIZE; 
        const tileH = TILE_SIZE;

        for (let i = activeEffects.length - 1; i >= 0; i--) {
            const effect = activeEffects[i];
            
            if (now > effect.endTime) {
                activeEffects.splice(i, 1);
                continue;
            }

            if (effect.type === 'blink') {
                const progress = (effect.endTime - now) / effect.duration;
                const alpha = Math.abs(Math.sin(now * 0.015)) * 0.6; 
                
                let baseColor = effect.color;
                if (baseColor.startsWith('rgba')) {
                    baseColor = baseColor.replace(/[\d\.]+\)$/g, `${alpha})`);
                } else {
                    baseColor = `rgba(255, 0, 0, ${alpha})`; 
                }
                
                ctx.fillStyle = baseColor;
                
                const screenX = (effect.x - cam.x) * tileW;
                const screenY = (effect.y - cam.y) * tileH;
                
                if (screenX >= -tileW && screenX < COLS * tileW && screenY >= -tileH && screenY < ROWS * tileH) {
                    ctx.fillRect(screenX, screenY, tileW, tileH);
                }
            } 
            else if (effect.type === 'projectile') {
                const totalTime = effect.duration;
                const elapsed = now - effect.startTime;
                const t = Math.min(1, elapsed / totalTime);

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
    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ОТРИСОВКА БОССА 2x2 ===
    function drawBoss(ctx, bossType, sx, sy, color) {
        let prefix = 'BOSS_DRAGON'; 
        if (bossType.includes('Голем')) prefix = 'BOSS_GOLEM';
        else if (bossType.includes('Лич')) prefix = 'BOSS_LICH';
        else if (bossType.includes('Паук')) prefix = 'BOSS_DRAGON'; // Заглушка, добавьте свои ключи

        const parts = [
            { key: `${prefix}_TL`, dx: 0, dy: 0 },
            { key: `${prefix}_TR`, dx: 1, dy: 0 },
            { key: `${prefix}_BL`, dx: 0, dy: 1 },
            { key: `${prefix}_BR`, dx: 1, dy: 1 }
        ];

        parts.forEach(part => {
            const drawX = sx + part.dx;
            const drawY = sy + part.dy;
            if (drawX >= 0 && drawX < COLS && drawY >= 0 && drawY < ROWS) {
                // Вызываем новый метод, который мы добавили в TilesetRenderer
                if (typeof TilesetRenderer.drawByKey === 'function') {
                    TilesetRenderer.drawByKey(ctx, part.key, drawX, drawY, color);
                }
            }
        });
    }
    // === ОТРИСОВКА ПОДЗЕМЕЛЬЯ (Использует TilesetRenderer) ===
    function draw(player, enemies, items, npcs = []) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Проверка готовности рендерера
        if (typeof TilesetRenderer === 'undefined' || !TilesetRenderer.isReady()) {
            ctx.fillStyle = '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Loading...", ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        const cam = getCameraOffset(player);

        const visible = new Set();
        fov.compute(player.x, player.y, 25, (x, y, r, vis) => {
            if (vis) visible.add(`${x},${y}`);
        });

        // 1. РИСУЕМ ТАЙЛЫ
        // 1. РИСУЕМ ТАЙЛЫ
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const wx = sx + cam.x;
                const wy = sy + cam.y;
                
                if (wx < 0 || wx >= DataModule.MAP_WIDTH || wy < 0 || wy >= DataModule.MAP_HEIGHT) continue;

                const isVisible = visible.has(`${wx},${wy}`);
                let ch, fg;

                // === ПРОВЕРКА НА МАГАЗИН ===
                let shopDecor = null;
                if (window.currentShopCoords) {
                    const shopTile = window.currentShopCoords.find(pos => pos.x === wx && pos.y === wy);
                    if (shopTile) {
                        shopDecor = shopTile.decor;
                    }
                }

                if (MapModule.isWall(wx, wy)) {
                    ch = dtype.wallChar;
                    fg = isVisible ? dtype.wallColor : '#222';
                } else {
                    // Если это пол магазина
                    if (shopDecor) {
                        // Рисуем декоративный спрайт вместо обычного пола
                        ch = shopDecor;
                        // Делаем его чуть тусклее, чтобы он выглядел как часть пола/узора
                        fg = isVisible ? '#8B4513' : '#3e1f09'; 
                    } else {
                        ch = dtype.floorChar;
                        fg = isVisible ? dtype.floorColor : '#111';
                    }
                }

                if (MapModule.stairsUp && wx === MapModule.stairsUp.x && wy === MapModule.stairsUp.y) {
                    ch = ">"; fg = isVisible ? "#FFF" : "#333";
                }
                if (MapModule.stairsDown && wx === MapModule.stairsDown.x && wy === MapModule.stairsDown.y) {
                    ch = "<"; fg = isVisible ? "#888" : "#222";
                }

                // Используем TilesetRenderer для подземелья
                TilesetRenderer.draw(ctx, ch, sx, sy, fg);
            }
        }
        // 2. ПРЕДМЕТЫ
        if (items) {
            items.forEach(i => {
                const sx = i.x - cam.x, sy = i.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                    TilesetRenderer.draw(ctx, i.char, sx, sy, i.color);
                }
            });
        }

        // 3. ВРАГИ (включая боссов 2x2)
        if (enemies) {
            enemies.forEach(e => {
                if (e.hp > 0) {
                    const sx = e.x - cam.x, sy = e.y - cam.y;
                    
                    // Проверяем видимость хотя бы одной части босса
                    const isVisible = visible.has(`${e.x},${e.y}`);
                    
                    if (sx >= -2 && sx < COLS && sy >= -2 && sy < ROWS && isVisible) {
                        if (e.isBoss) {
                            // === ОТРИСОВКА БОССА 2x2 ИЗ 4 ЧАСТЕЙ ===
                            // Определяем префикс ключей в зависимости от типа босса
                            let prefix = 'BOSS_DRAGON'; 
                            if (e.bossType.includes('Голем')) prefix = 'BOSS_GOLEM';
                            else if (e.bossType.includes('Лич')) prefix = 'BOSS_LICH';
                            
                            // Рисуем 4 тайла: TL (Top-Left), TR, BL, BR
                            TilesetRenderer.drawByKey(ctx, `${prefix}_TL`, sx, sy, e.color);       // Верх-Лево
                            TilesetRenderer.drawByKey(ctx, `${prefix}_TR`, sx + 1, sy, e.color);   // Верх-Право
                            TilesetRenderer.drawByKey(ctx, `${prefix}_BL`, sx, sy + 1, e.color);   // Низ-Лево
                            TilesetRenderer.drawByKey(ctx, `${prefix}_BR`, sx + 1, sy + 1, e.color); // Низ-Право
                        } else {
                            // Обычный враг
                            TilesetRenderer.draw(ctx, e.char, sx, sy, e.color);
                        }
                    }
                }
            });
        }
        // 4. NPC
        if (window.currentCityNpcs) {
            window.currentCityNpcs.forEach(npc => {
                const sx = npc.x - cam.x, sy = npc.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${npc.x},${npc.y}`)) {
                    TilesetRenderer.draw(ctx, npc.char, sx, sy, npc.color);
                }
            });
        }

        // 5. ИГРОК
        if (player) {
            const px = Math.floor(COLS / 2);
            const py = Math.floor(ROWS / 2);
            TilesetRenderer.draw(ctx, player.char, px, py, player.color);
        }

        // 6. ЭФФЕКТЫ
        drawEffects(ctx, cam);

        return visible;
    }

    // === ОТРИСОВКА ГЛОБАЛЬНОЙ КАРТЫ (Использует TilesetRenderer) ===
    function drawGlobalMap(centerX, centerY) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Проверка готовности
        if (typeof TilesetRenderer === 'undefined' || !TilesetRenderer.isReady()) {
            ctx.fillStyle = '#fff';
            ctx.font = '16px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Loading World...", ctx.canvas.width/2, ctx.canvas.height/2);
            return;
        }

        const halfW = Math.floor(COLS / 2);
        const halfH = Math.floor(ROWS / 2);

        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const gx = centerX + sx - halfW;
                const gy = centerY + sy - halfH;

                let tileType = 'plain';
                if (typeof GlobalMapModule !== 'undefined') {
                    tileType = GlobalMapModule.getDisplayTileType ? GlobalMapModule.getDisplayTileType(gx, gy) : GlobalMapModule.getTileType(gx, gy);
                }

                let ch, fg;
                switch(tileType) {
                    case 'plain': ch = '░'; fg = '#2e8b57'; break;
                    case 'forest': ch = 'T'; fg = '#336649'; break;
                    case 'mountain': ch = '^'; fg = '#a0a0a0'; break;
                    case 'water': ch = '≈'; fg = '#4682b4'; break;
                    case 'city': ch = 'C'; fg = '#ffd700'; break;
                    case 'dungeon_entrance': ch = 'D'; fg = '#cd5c5c'; break;
                    case 'road': ch = '─'; fg = '#b8860b'; break;
                    default: ch = '·'; fg = '#555';
                }

                // Игрок
                if (gx === centerX && gy === centerY) {
                    ch = '@'; fg = '#fff';
                }

                // Используем TilesetRenderer для глобальной карты
                TilesetRenderer.draw(ctx, ch, sx, sy, fg);
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
        
        const MINIMAP_SIZE = 50; 
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
                
                if (gx === centerX && gy === centerY) color = '#0f0'; // Игрок
                
                ctx.fillStyle = color;
                ctx.fillRect(dx * cellW, dy * cellH, cellW + 0.5, cellH + 0.5);
            }
        }
    }

    // === ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (UI) ===
    function updateUI(player, locData, worldTrend) {
        if (locData) {
            document.getElementById("ui-loc-name").textContent = locData.fullName;
            
            if (worldTrend && worldTrend.name !== "Обычный уровень") {
                document.getElementById("ui-loc-name").style.color = worldTrend.color;
            } else {
                document.getElementById("ui-loc-name").style.color = "var(--accent)";
            }
        }

        // === ЛОГИКА КОМПАСА / ВЫХОДА ===
        const exitEl = document.getElementById("ui-loc-coords");
        if (exitEl) {
            // Проверяем, находимся ли мы в подземелье (не на поверхности)
            const isDungeon = locData && locData.themeName !== "Поверхность";
            
            if (isDungeon && MapModule.stairsUp) {
                // МЫ В ПОДЗЕМЕЛЬЕ: Показываем стрелку к выходу (стандартная логика)
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
            // ЕСЛИ МЫ НА ПОВЕРХНОСТИ (ГЛОБАЛЬНАЯ КАРТА):
            // Мы НИЧЕГО не пишем сюда. 
            // Элемент остается как есть, а GameModule.updateQuestCompass() заполнит его стрелкой квеста или координатами.
        }
        
        // === СТАТИСТИКА И ИНВЕНТАРЬ ===
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

// В render.js, внутри updateUI, в цикле отрисовки инвентаря:

                    order.forEach(key => {
                        const group = grouped[key];
                        const item = group.item;
                        const div = document.createElement("div");
                        div.className = "inv-item";
                        
                        // Уникальные предметы выделяем фиолетовым или золотым, игнорируя их базовый цвет
                        div.style.color = item.isUnique ? "#d29922" : item.color; 
                        div.style.fontWeight = item.isUnique ? "bold" : "normal";

                        let html = `${item.char} ${item.isUnique ? '🌟 ' : ''}${item.name}`;
                        
                        if (item.val && !item.isUnique) html += ` (+${item.val})`;
                        if (item.isUnique) {
                            // Показываем реальные статы уникального предмета в инвентаре
                            const stats = [];
                            if (item.uniqueAtk) stats.push(`Атк:${item.uniqueAtk}`);
                            if (item.uniqueDef) stats.push(`Защ:${item.uniqueDef}`);
                            if (stats.length > 0) html += ` <span style="opacity:0.8;font-size:10px">[${stats.join(', ')}]</span>`;
                        }

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
        if (!list) return;

        const div = document.createElement("div");
        div.className = `log-msg log-${type}`;
        div.textContent = `> ${msg}`;
        
        // 1. Добавляем новое сообщение в КОНЕЦ списка (стандартный поток)
        list.appendChild(div);
        
        // 2. Ограничиваем историю (удаляем самые СТАРЫЕ сообщения сверху)
        if (list.children.length > 50) {
            list.removeChild(list.firstChild);
        }

        // 3. Железобетонная прокрутка вниз для мобильных браузеров
        // setTimeout дает браузеру 10 мс на то, чтобы физически отрисовать новый div 
        // и корректно пересчитать list.scrollHeight
        setTimeout(() => {
            list.scrollTop = list.scrollHeight;
        }, 10);
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
    // === ОТРИСОВКА ОКНА МАГАЗИНА ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    // === ОТРИСОВКА ОКНА МАГАЗИНА (С ПАГИНАЦИЕЙ И ИСПРАВЛЕНИЯМИ) ===
    function drawShopWindow(merchantInv, playerGold) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;
        // === НАСТРОЙКИ ДЛЯ ЧЕТКОГО ТЕКСТА ===
        // Отключаем сглаживание шрифтов (делает края жесткими)
        ctx.fontKerning = 'none'; 
        ctx.textRendering = 'geometricPrecision'; // Помогает сохранить геометрию букв
        window.shopClickAreas = []; 

        // === ИНИЦИАЛИЗАЦИЯ ПЕРЕМЕННЫХ СТРАНИЦ ===
        if (typeof window.shopPageMerchant === 'undefined') window.shopPageMerchant = 0;
        if (typeof window.shopPagePlayer === 'undefined') window.shopPagePlayer = 0;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const winW = ctx.canvas.width * 0.95;
        const winH = ctx.canvas.height * 0.9;
        const winX = (ctx.canvas.width - winW) / 2;
        const winY = (ctx.canvas.height - winH) / 2;
        const midX = ctx.canvas.width / 2;
        
        ctx.fillStyle = '#161b22';
        ctx.strokeStyle = '#d29922';
        ctx.lineWidth = 2;
        ctx.fillRect(winX, winY, winW, winH);
        ctx.strokeRect(winX, winY, winW, winH);

        // Заголовок и кнопка выхода
        ctx.font = 'bold 16px Consolas, monospace';
        ctx.textBaseline = 'middle';
        const titleText = "🏪 ЛАВКА ТОРГОВЦА";
        const titleWidth = ctx.measureText(titleText).width;
        ctx.fillStyle = '#d29922';
        ctx.textAlign = 'center';
        ctx.fillText(titleText, ctx.canvas.width / 2, winY + 25);

        const btnText = "❌ ВЫЙТИ";
        ctx.font = 'bold 12px Consolas, monospace';
        const btnWidth = ctx.measureText(btnText).width + 16;
        const btnHeight = 24;
        const btnX = (ctx.canvas.width / 2) + (titleWidth / 2) + 20;
        const btnY = winY + 13;

        ctx.fillStyle = '#da3633';
        ctx.fillRect(btnX, btnY - btnHeight/2, btnWidth, btnHeight);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(btnText, btnX + btnWidth / 2, btnY);
        window.shopExitButton = { x: btnX, y: btnY - btnHeight/2, w: btnWidth, h: btnHeight };

        ctx.beginPath();
        ctx.moveTo(midX, winY + 45);
        ctx.lineTo(midX, winY + winH - 40);
        ctx.strokeStyle = '#30363d';
        ctx.stroke();

        ctx.font = 'bold 12px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.fillText("ТОВАРЫ", winX + 15, winY + 60);
        ctx.textAlign = 'right';
        ctx.fillText("ВАШ ИНВЕНТАРЬ", ctx.canvas.width - winX - 15, winY + 60);

        // === НАСТРОЙКИ СПИСКА ===
        ctx.font = '11px Consolas, monospace';
        ctx.textBaseline = 'alphabetic';
        let y = winY + 85;
        const itemHeight = 16; 
        const maxItemsPerCol = 10; 

        // === РАСЧЕТ СТРАНИЦ (ПЕРЕНЕСЕНО СЮДА ДЛЯ ДОСТУПНОСТИ) ===
        const totalMerchantPages = Math.ceil(merchantInv.items.length / maxItemsPerCol) || 1;
        
        // Получаем игрока заранее, чтобы рассчитать страницы
        let player = null;
        let totalPlayerPages = 1;
        if (typeof GameModule !== 'undefined') {
            player = GameModule.getPlayer();
            if (player) {
                totalPlayerPages = Math.ceil(player.inventory.length / maxItemsPerCol) || 1;
            }
        }

        // === ЛЕВАЯ КОЛОНКА (Торговец) ===
        const startIdxM = window.shopPageMerchant * maxItemsPerCol;
        const endIdxM = startIdxM + maxItemsPerCol;

        ctx.textAlign = 'left';
        merchantInv.items.slice(startIdxM, endIdxM).forEach((item, i) => {
            const index = startIdxM + i;
            if (y > winY + winH - 50) return;
            
            ctx.fillStyle = item.color;
            ctx.fillText(`${index + 1}. ${item.name}`, winX + 15, y);
            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'right';
            ctx.fillText(`${item.price}$`, midX - 15, y);
            ctx.textAlign = 'left';
            
            window.shopClickAreas.push({
                x: winX, y: y - 12, w: midX - winX, h: itemHeight,
                action: 'buy', index: index
            });
            y += itemHeight;
        });

        // === ПРАВАЯ КОЛОНКА (Игрок) ===
        if (player) {
            const startIdxP = window.shopPagePlayer * maxItemsPerCol;
            const endIdxP = startIdxP + maxItemsPerCol;

            ctx.textAlign = 'right';
            y = winY + 85;
            
            player.inventory.slice(startIdxP, endIdxP).forEach((item, i) => {
                const index = startIdxP + i;
                if (y > winY + winH - 50) return;                    
                ctx.fillStyle = item.color;
                ctx.fillText(`${index + 1}. ${item.name}`, ctx.canvas.width - winX - 15, y);


                
                const sellPrice = Math.floor(item.price ? item.price * 0.5 : item.val * 2);
                ctx.fillStyle = '#ffd700';
                ctx.textAlign = 'left';
                ctx.fillText(`${sellPrice}$`, midX + 15, y);
                ctx.textAlign = 'right';
                
                window.shopClickAreas.push({
                    x: midX, y: y - 12, w: ctx.canvas.width - winX - midX, h: itemHeight,
                    action: 'sell', index: index
                });
                y += itemHeight;
            });
        }

        // === НИЖНЯЯ ПАНЕЛЬ: ЗОЛОТО И НАВИГАЦИЯ ===
        const bottomY = winY + winH - 15; 

        // 1. Золото торговца (слева)
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`💰 Торговец: ${merchantInv.gold}`, winX + 15, bottomY);

        // 2. Золото игрока (справа)
        ctx.textAlign = 'right';
        ctx.fillText(`💰 Вы: ${playerGold}`, ctx.canvas.width - winX - 15, bottomY);

        // 3. Навигация торговца
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Стр. ${window.shopPageMerchant + 1}/${totalMerchantPages}`, (winX + midX)/2, bottomY - 15);
        
        if (window.shopPageMerchant > 0) {
            ctx.fillStyle = '#58a6ff';
            ctx.fillText("<", winX + 30, bottomY - 15);
            window.shopClickAreas.push({ x: winX + 10, y: bottomY - 25, w: 40, h: 20, action: 'prev_m' });
        }
        if (window.shopPageMerchant < totalMerchantPages - 1) {
            ctx.fillStyle = '#58a6ff';
            ctx.fillText(">", midX - 30, bottomY - 15);
            window.shopClickAreas.push({ x: midX - 50, y: bottomY - 25, w: 40, h: 20, action: 'next_m' });
        }

        // 4. Навигация игрока (теперь totalPlayerPages точно определена)
        if (player) {
            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'center';
            ctx.fillText(`Стр. ${window.shopPagePlayer + 1}/${totalPlayerPages}`, (midX + ctx.canvas.width - winX)/2, bottomY - 15);

            if (window.shopPagePlayer > 0) {
                ctx.fillStyle = '#58a6ff';
                ctx.fillText("<", midX + 30, bottomY - 15);
                window.shopClickAreas.push({ x: midX + 10, y: bottomY - 25, w: 40, h: 20, action: 'prev_p' });
            }
            if (window.shopPagePlayer < totalPlayerPages - 1) {
                ctx.fillStyle = '#58a6ff';
                ctx.fillText(">", ctx.canvas.width - winX - 30, bottomY - 15);
                window.shopClickAreas.push({ x: ctx.canvas.width - winX - 50, y: bottomY - 25, w: 40, h: 20, action: 'next_p' });
            }
        }
    }
    // === ОТРИСОВКА ОКНА КВЕСТА (СЮЖЕТНОГО) ===
    function drawQuestWindow(quest, isCompleted) {
        const ctx = RenderModule._ctx;
        if (!ctx) return;

        // Очищаем экран и рисуем затемнение
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Параметры окна
        const winW = ctx.canvas.width * 0.8;
        const winH = ctx.canvas.height * 0.6;
        const winX = (ctx.canvas.width - winW) / 2;
        const winY = (ctx.canvas.height - winH) / 2;
        
        // Фон и рамка
        ctx.fillStyle = '#161b22';
        ctx.strokeStyle = quest.isChainQuest ? '#d29922' : '#58a6ff'; // Золото для сюжета, синий для обычного
        ctx.lineWidth = 2;
        ctx.fillRect(winX, winY, winW, winH);
        ctx.strokeRect(winX, winY, winW, winH);

        // Заголовок
        ctx.font = 'bold 16px Consolas, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = quest.isChainQuest ? '#d29922' : '#fff';
        
        const titleText = isCompleted ? "🏆 КВЕСТ ВЫПОЛНЕН" : "📜 НОВЫЙ КВЕСТ";
        ctx.fillText(titleText, ctx.canvas.width / 2, winY + 30);

        // Текст описания (с переносом строк)
        ctx.font = '14px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#c9d1d9';

        const text = isCompleted ? (quest.turnInText || "Награда получена!") : quest.briefing;
        const maxWidth = winW - 40;
        const lineHeight = 20;
        let y = winY + 60;

        // Простой алгоритм переноса слов
        const words = text.split(' ');
        let line = '';
        
        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, winX + 20, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, winX + 20, y);

        // Награда (если есть)
        if (quest.rewardGold) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 14px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`💰 Награда: ${quest.rewardGold} золотых`, ctx.canvas.width / 2, winY + winH - 60);
        }

        // Кнопка "ЗАКРЫТЬ"
        const btnText = "❌ ЗАКРЫТЬ";
        ctx.font = 'bold 14px Consolas, monospace';
        const btnWidth = 120;
        const btnHeight = 30;
        const btnX = (ctx.canvas.width - btnWidth) / 2;
        const btnY = winY + winH - 40;

        ctx.fillStyle = '#da3633';
        ctx.fillRect(btnX, btnY, btnWidth, btnHeight);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btnText, ctx.canvas.width / 2, btnY + btnHeight / 2);

        // Сохраняем зону клика для кнопки
        window.questCloseButton = { x: btnX, y: btnY, w: btnWidth, h: btnHeight };
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
        addBlinkEffect,
        addProjectileEffect,
        updateQuestBriefing,
        drawShopWindow,
        drawQuestWindow,// <--- ДОБАВИТЬ ЭТУ СТРОКУ
        COLS,
        ROWS,
        _ctx: null, 
        TILE_SIZE   
    };
})();
