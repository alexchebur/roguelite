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
        // === НОВОЕ: ДОБАВИТЬ ЭТО УСЛОВИЕ ===
        else if (quest.type === 'BOSS_HUNT') {
            goalText = `Ликвидировать: ${quest.target.enemyName}`;
        }
        // ======================================
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

                // === ПРОВЕРКА НА МАГАЗИН И ПОСТОЯЛЫЙ ДВОР ===
                let shopDecor = null;
                let innDecor = null;

                if (window.currentShopCoords) {
                    const shopTile = window.currentShopCoords.find(pos => pos.x === wx && pos.y === wy);
                    if (shopTile) {
                        shopDecor = shopTile.decor;
                    }
                }
                
                if (window.currentInnCoords) {
                    const innTile = window.currentInnCoords.find(pos => pos.x === wx && pos.y === wy);
                    if (innTile) {
                        innDecor = innTile.decor;
                    }
                }

                if (MapModule.isWall(wx, wy)) {
                    ch = dtype.wallChar;
                    fg = isVisible ? dtype.wallColor : '#222';
                } else {
                    // 1. Приоритет: Кровать в постоялом дворе
                    if (innDecor) {
                        ch = innDecor; 
                        // Цвет дерева/кровати (коричневый/бежевый)
                        fg = isVisible ? '#D2B48C' : '#3e1f09'; 
                    } 
                    // 2. Декор магазина (оружие, зелья на полу)
                    else if (shopDecor) {
                        ch = shopDecor;
                        fg = isVisible ? '#8B4513' : '#3e1f09'; 
                    } 
                    // 3. Обычный пол
                    else {
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

        // 1. РИСУЕМ ЛАНДШАФТ (С УЧЕТОМ СНЕГА НА СЕВЕРЕ)
        for (let sy = 0; sy < ROWS; sy++) {
            for (let sx = 0; sx < COLS; sx++) {
                const gx = centerX + sx - halfW;
                const gy = centerY + sy - halfH;

                let tileType = 'plain';
                if (typeof GlobalMapModule !== 'undefined') {
                    tileType = GlobalMapModule.getDisplayTileType ? GlobalMapModule.getDisplayTileType(gx, gy) : GlobalMapModule.getTileType(gx, gy);
                }

                let ch, fg;
                
                // Базовый тайл местности
                switch(tileType) {
                    case 'plain': ch = '░'; fg = '#2e8b57'; break;
                    case 'forest': ch = 'T'; fg = '#336649'; break;
                    case 'mountain': ch = '^'; fg = '#a0a0a0'; break;
                    case 'water': ch = '≈'; fg = '#4682b4'; break; 
                    case 'city': ch = 'C'; fg = '#ffd700'; break;
                    case 'dungeon_entrance': ch = 'D'; fg = '#cd5c5c'; break;
                    case 'road': ch = '─'; fg = '#b8860b'; break;
                    case 'global_scroll': 
                        ch = '&';       
                        fg = '#ff00ff'; 
                        break;
                    default: ch = '·'; fg = '#555';
                }

                // === ЛОГИКА СНЕГА ===
                // Проверяем, является ли это равниной и насколько мы далеко на севере
                if (tileType === 'plain' && gy < -150) {
                    let isSnowy = false;
                    
                    // Расчет вероятности снега в зависимости от глубины севера
                    if (gy <= -300) {
                        isSnowy = true; // Всегда снег (глубокий север)
                    } else if (gy <= -200) {
                        // От -200 до -300: плавный переход от 0% до 100%
                        const noise = ((gx * 12345 + gy * 67890) & 0xFFFF) / 0xFFFF; 
                        const progress = Math.abs(gy + 200) / 100; // 0..1
                        if (noise < progress) isSnowy = true;
                    } else {
                        // От -150 до -200: редкие вкрапления (до 30%)
                        const noise = ((gx * 12345 + gy * 67890) & 0xFFFF) / 0xFFFF;
                        const progress = Math.abs(gy + 150) / 50; 
                        if (noise < (progress * 0.3)) isSnowy = true;
                    }

                    if (isSnowy) {
                        const destX = sx * TilesetRenderer.TILE_SIZE;
                        const destY = sy * TilesetRenderer.TILE_SIZE;
                        const tileSize = TilesetRenderer.TILE_SIZE;

                        // 1. Рисуем белый фон (снег)
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(destX, destY, tileSize, tileSize);
                        
                        // 2. Рисуем спрайт вручную, чтобы избежать clearRect из TilesetRenderer.draw
                        // Получаем данные тайла для символа '░'
                        const tileData = TilesetRenderer.TILE_MAP ? TilesetRenderer.TILE_MAP[ch] : null;
                        
                        if (tileData) {
                            const img = TilesetRenderer.spriteSheets ? TilesetRenderer.spriteSheets[tileData.file] : null;
                            if (img) {
                                const srcX = tileData.x * tileSize;
                                const srcY = tileData.y * tileSize;
                                
                                ctx.save();
                                // Рисуем изображение
                                ctx.drawImage(img, srcX, srcY, tileSize, tileSize, destX, destY, tileSize, tileSize);
                                
                                // Накладываем зеленый цвет только на непрозрачные части (символ)
                                if (fg && fg !== '#fff' && fg !== '#000') {
                                    ctx.globalCompositeOperation = 'source-atop';
                                    ctx.fillStyle = fg;
                                    ctx.fillRect(destX, destY, tileSize, tileSize);
                                }
                                ctx.restore();
                            } else {
                                // Фолбэк, если картинка не загрузилась
                                TilesetRenderer.draw(ctx, ch, sx, sy, fg);
                            }
                        } else {
                            // Фолбэк, если нет маппинга
                            TilesetRenderer.draw(ctx, ch, sx, sy, fg);
                        }
                        
                        continue; // Пропускаем стандартную отрисовку
                    }
                }

        // 2. РИСУЕМ АРМИИ (НОВОЕ)
        if (typeof GlobalMapModule !== 'undefined' && typeof GlobalMapModule.getActiveArmies === 'function') {
            const armies = GlobalMapModule.getActiveArmies();
            
            armies.forEach(army => {
                // Вычисляем экранные координаты армии
                const sx = army.x - centerX + halfW;
                const sy = army.y - centerY + halfH;

                // Проверяем, видима ли армия на экране
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS) {

                }   
                    // Рисуем спрайт армии. Используем символ 'A' и красный цвет.
                    // Если у вас есть специальный спрайт в реестре, замените 'A' на нужный ключ или символ.
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS) {
                    console.log(`👁️ Рисуем армию ID:${army.id} на экране в точке (${sx}, ${sy}). Глобальные коорд: (${army.x}, ${army.y})`);    
                    TilesetRenderer.draw(ctx, 'A', sx, sy, '#ff0000'); 
                }
            });
        }

        // 3. РИСУЕМ ИГРОКА (поверх всего)
        // Проходим по сетке еще раз только для клетки игрока, чтобы гарантировать отрисовку поверх армии
        const playerScreenX = halfW;
        const playerScreenY = halfH;
        
        let playerCh = '@';
        let playerFg = '#fff'; 
        
        let hasScale = false;
        let hasSquad = false;

        // Проверяем флаги через GameModule
        if (typeof GameModule !== 'undefined' && typeof GameModule.getGlobalFlag === 'function') {
            hasScale = GameModule.getGlobalFlag('player_global_scale');
            hasSquad = GameModule.getGlobalFlag('player_has_squad');
        }

        // Логика выбора символа-маркера для спрайта
        if (hasSquad) {
            playerCh = 'S'; // Отряд
        } else if (hasScale) {
            playerCh = 'p'; // Маленький игрок
        } else {
            playerCh = '@'; // Стандартный игрок
        }

        TilesetRenderer.draw(ctx, playerCh, playerScreenX, playerScreenY, playerFg);
    }

    
    function drawGlobalMinimap(centerX, centerY) {
        const cvs = document.getElementById("minimap");
        if (!cvs) return;
        
        // Настраиваем размер миникарты
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
    
        // 1. РИСУЕМ ЛАНДШАФТ
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
                    case 'global_scroll': color = '#ff00ff'; break;
                    default: color = '#333';
                }
                
                ctx.fillStyle = color;
                ctx.fillRect(dx * cellW, dy * cellH, cellW + 0.5, cellH + 0.5);
            }
        }

        // 2. РИСУЕМ АРМИИ (НОВОЕ)
        if (typeof GlobalMapModule !== 'undefined' && typeof GlobalMapModule.getActiveArmies === 'function') {
            const armies = GlobalMapModule.getActiveArmies();
            
            armies.forEach(army => {
                // Координаты армии относительно левого верхнего угла миникарты
                const mx = army.x - startX;
                const my = army.y - startY;
                
                // Проверяем, попадает ли армия в область миникарты (50x50)
                if (mx >= 0 && mx < MINIMAP_SIZE && my >= 0 && my < MINIMAP_SIZE) {
                    ctx.fillStyle = '#ff0000'; // Красный цвет для врагов
                    // Рисуем точку чуть меньше клетки, чтобы было аккуратно
                    ctx.fillRect(mx * cellW + 2, my * cellH + 2, cellW - 4, cellH - 4);
                }
            });
        }

        // 3. РИСУЕМ ИГРОКА (поверх армий)
        // Игрок всегда в центре миникарты
        const playerMX = Math.floor(MINIMAP_SIZE / 2);
        const playerMY = Math.floor(MINIMAP_SIZE / 2);
        
        ctx.fillStyle = '#0f0'; // Зеленый цвет для игрока
        ctx.fillRect(playerMX * cellW, playerMY * cellH, cellW + 0.5, cellH + 0.5);
    }
    // === ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (UI) ===
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
            const isDungeon = locData && locData.themeName !== "Поверхность";
            
            if (isDungeon && MapModule.stairsUp) {
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
        
        // === СТАТИСТИКА И ИНВЕНТАРЬ ===
        if (player && player.hp !== undefined) {
            
            let atkText = `${player.atk}`;
            let defText = `${player.def}`;

            if (typeof EffectSystemModule !== 'undefined') {
                const atkDuration = EffectSystemModule.getEffectDuration(player, EffectSystemModule.TYPES.BUFF_ATK);
                const defDuration = EffectSystemModule.getEffectDuration(player, EffectSystemModule.TYPES.BUFF_DEF);

                if (atkDuration > 0) {
                    atkText += ` <span style="font-size:0.8em; color:#ff9800">(${atkDuration})</span>`;
                }
                if (defDuration > 0) {
                    defText += ` <span style="font-size:0.8em; color:#00bcd4">(${defDuration})</span>`;
                }
            }

            const staminaColor = player.stamina < 20 ? 'var(--danger)' : '#4CAF50';

            document.getElementById("ui-stats").innerHTML = `
                 <div class="stat-row"><span>HP</span> <span class="val-hp">${player.hp}/${player.maxHp}</span></div>
                 <div class="stat-row"><span>Выносл.</span> <span style="color:${staminaColor}">${player.stamina}/${player.maxStamina}</span></div>
                 <div class="stat-row"><span>Атака</span> <span class="val-atk">${atkText}</span></div>
                <div class="stat-row"><span>Защита</span> <span class="val-def">${defText}</span></div>
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
                
                // === ПРОВЕРКА ТАКТИЧЕСКОГО РЕЖИМА ===
                // Проверяем глобальную переменную window.gameMode
                if (typeof window.gameMode !== 'undefined' && window.gameMode === 'tactical') {
                    
                    const tactics = Object.values(TacticalDataModule.PLAYER_TACTICS);
                    
                    tactics.forEach(tactic => {
                        const div = document.createElement("div");
                        div.className = "inv-item";
                        
                        // Подсветка выбранной тактики
                        const isSelected = typeof window.currentTactic !== 'undefined' && window.currentTactic === tactic.id;
                        div.style.color = isSelected ? "#ffd700" : "#fff";
                        div.style.fontWeight = isSelected ? "bold" : "normal";
                        div.style.borderLeft = isSelected ? "3px solid #ffd700" : "3px solid transparent";
                        
                        div.textContent = `${tactic.key}. ${tactic.name}`;
                        
                        // При клике меняем тактику
                        div.onclick = () => {
                            // 1. Меняем глобальную переменную
                            window.currentTactic = tactic.id;
                            
                            // 2. Логируем изменение
                            if (typeof RenderModule.log === 'function') {
                                RenderModule.log(`Тактика изменена: ${tactic.name}`, "info");
                            }
                            
                            // 3. Принудительно перерисовываем кадр, чтобы обновить поле боя и меню
                            // Мы знаем, что renderFrame находится в GameModule, но он также назначен как redrawCallback
                            if (typeof RenderModule.requestRedraw === 'function') {
                                RenderModule.requestRedraw();
                            }
                        };
                        
                        invDiv.appendChild(div);
                    });
                } 
                // ... остальной код инвентаря ...
                // === СТАНДАРТНЫЙ ИНВЕНТАРЬ ===
                else {
                    if (player.inventory.length === 0) {
                        invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
                    } else {
                        // ... здесь ваш старый код отрисовки предметов ...
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
                            
                            div.style.color = item.isUnique ? "#d29922" : item.color; 
                            div.style.fontWeight = item.isUnique ? "bold" : "normal";

                            let html = `${item.isUnique ? '🌟 ' : ''}${item.name}`;
                            
                            if (item.val && !item.isUnique) html += ` (+${item.val})`;
                            if (item.isUnique) {
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
        } // <--- ЗАКРЫВАЮЩАЯ СКОБКА ДЛЯ if (player && player.hp !== undefined)
    } // <--- ЗАКРЫВАЮЩАЯ СКОБКА ДЛЯ ФУНКЦИИ updateUI

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





    // === НОВАЯ ФУНКЦИЯ ДЛЯ HTML-ОКНА КВЕСТА ===
    function renderQuestUI(quest, isCompleted) {
        const titleEl = document.getElementById('quest-modal-title');
        const textEl = document.getElementById('quest-modal-text');
        const rewardBlock = document.getElementById('quest-reward-block');
        const rewardGoldEl = document.getElementById('quest-reward-gold');

        if (!titleEl || !textEl) return;

        // 1. Заголовок
        if (isCompleted) {
            titleEl.textContent = "🏆 Квест Выполнен";
            titleEl.style.color = "#3fb950"; // Зеленый
        } else {
            titleEl.textContent = quest.isChainQuest ? "📜 Сюжетный Квест" : "📜 Новый Квест";
            titleEl.style.color = "#d29922"; // Золотой
        }

        // 2. Текст
        let content = "";
        if (isCompleted) {
            content = quest.turnInText || "Награда получена! Спасибо за помощь.";
        } else {
            content = quest.briefing;
        }
        textEl.textContent = content;

        // 3. Награда
        if (isCompleted && quest.rewardGold > 0) {
            rewardBlock.style.display = 'block';
            rewardGoldEl.textContent = quest.rewardGold;
        } else {
            rewardBlock.style.display = 'none';
        }
    }
    


    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ СТАТУСА МАГАЗИНА ===
    function showShopStatus(msg, type = 'error') {
        const statusEl = document.getElementById('shop-status');
        if (!statusEl) return;
        
        statusEl.textContent = msg;
        statusEl.style.color = type === 'error' ? '#f85149' : (type === 'success' ? '#3fb950' : '#8b949e');
        
        // Автоматически очищаем сообщение через 3 секунды
        if (window.shopStatusTimeout) clearTimeout(window.shopStatusTimeout);
        window.shopStatusTimeout = setTimeout(() => {
            if (statusEl) statusEl.textContent = '';
        }, 3000);
    }
    
    // === НОВАЯ ФУНКЦИЯ ДЛЯ HTML-МАГАЗИНА (ЕДИНСТВЕННАЯ ВЕРСИЯ) ===
    function renderShopUI(merchantInv, playerGold) {
        const merchantList = document.getElementById('shop-merchant-list');
        const playerList = document.getElementById('shop-player-list');
        const goldInfo = document.getElementById('shop-gold-info');
        const paginationControls = document.querySelector('.pagination-controls');
        
        if (!merchantList || !playerList) return;

        // Очистка списков
        merchantList.innerHTML = '';
        playerList.innerHTML = '';
        
        // Очистка статуса при открытии/перерисовке
        const statusEl = document.getElementById('shop-status');
        if (statusEl) statusEl.textContent = ''; 

        // Настройки пагинации
        const itemsPerPage = 8;
        const totalMerchantPages = Math.ceil(merchantInv.items.length / itemsPerPage) || 1;
        
        let player = null;
        let totalPlayerPages = 1;
        if (typeof GameModule !== 'undefined') {
            player = GameModule.getPlayer();
            if (player) {
                totalPlayerPages = Math.ceil(player.inventory.length / itemsPerPage) || 1;
            }
        }

        // Инициализация страниц, если их нет
        if (typeof window.shopPageMerchant === 'undefined') window.shopPageMerchant = 0;
        if (typeof window.shopPagePlayer === 'undefined') window.shopPagePlayer = 0;

        // Коррекция границ страниц
        if (window.shopPageMerchant >= totalMerchantPages) window.shopPageMerchant = totalMerchantPages - 1;
        if (window.shopPageMerchant < 0) window.shopPageMerchant = 0;
        if (player && window.shopPagePlayer >= totalPlayerPages) window.shopPagePlayer = totalPlayerPages - 1;
        if (player && window.shopPagePlayer < 0) window.shopPagePlayer = 0;

        // --- Рендер товаров торговца ---
        const startIdxM = window.shopPageMerchant * itemsPerPage;
        const endIdxM = startIdxM + itemsPerPage;
        
        merchantInv.items.slice(startIdxM, endIdxM).forEach((item, i) => {
            const index = startIdxM + i;
            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML = `<span style="color:${item.color}">${item.name}</span> <span style="float:right; color:#ffd700">${item.price}g</span>`;
            div.onclick = () => GameModule.buyItem(index);
            merchantList.appendChild(div);
        });

        // --- Рендер инвентаря игрока ---
        if (player) {
            const startIdxP = window.shopPagePlayer * itemsPerPage;
            const endIdxP = startIdxP + itemsPerPage;
            
            player.inventory.slice(startIdxP, endIdxP).forEach((item, i) => {
                const index = startIdxP + i;
                const div = document.createElement('div');
                div.className = 'shop-item';
                div.innerHTML = `<span style="color:${item.color}">${item.name}</span> <span style="float:right; color:#aaa">продать</span>`;
                div.onclick = () => GameModule.sellItem(index);
                playerList.appendChild(div);
            });
        }

        // --- Обновление золота и пагинации ---
        if (goldInfo) {
            // Левая сторона: Золото игрока
            goldInfo.textContent = `Ваше золото: ${playerGold}`;
            
            // Правая сторона: Золото торговца (ищем второй элемент)
            const merchantGoldInfo = document.getElementById('shop-merchant-gold-info');
            if (merchantGoldInfo) {
                merchantGoldInfo.textContent = `У торговца: ${merchantInv.gold}`;
            }
        }

        if (paginationControls) {
            paginationControls.innerHTML = `
                <button onclick="GameModule.changeShopPage('m', -1)" ${window.shopPageMerchant === 0 ? 'disabled' : ''}>← Товары</button>
                <span style="margin:0 10px; color:#8b949e">${window.shopPageMerchant + 1}/${totalMerchantPages}</span>
                <button onclick="GameModule.changeShopPage('m', 1)" ${window.shopPageMerchant >= totalMerchantPages - 1 ? 'disabled' : ''}>Товары →</button>
                
                <span style="margin-left:20px;"></span>

                <button onclick="GameModule.changeShopPage('p', -1)" ${!player || window.shopPagePlayer === 0 ? 'disabled' : ''}>← Инвентарь</button>
                <span style="margin:0 10px; color:#8b949e">${player ? window.shopPagePlayer + 1 : 0}/${totalPlayerPages}</span>
                <button onclick="GameModule.changeShopPage('p', 1)" ${!player || window.shopPagePlayer >= totalPlayerPages - 1 ? 'disabled' : ''}>Инвентарь →</button>
            `;
        }
    }

    // Вспомогательная функция для смены страниц
    window.changeShopPage = function(type, dir) {
        if (type === 'm') window.shopPageMerchant += dir;
        if (type === 'p') window.shopPagePlayer += dir;
        // Получаем доступ к данным через GameModule, так как currentMerchantInv может быть скрыт
        if (typeof GameModule !== 'undefined') {
             // В game.js нужно будет добавить геттер или сделать переменную доступной
             // Пока используем глобальную переменную, если она есть, или передаем через замыкание
             if (typeof currentMerchantInv !== 'undefined' && typeof player !== 'undefined') {
                 RenderModule.renderShopUI(currentMerchantInv, player.gold);
             }
        }
    };    

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
        renderShopUI,
        renderQuestUI,
        showShopStatus,
        COLS,
        ROWS,
        _ctx: null, 
        TILE_SIZE   
    };
})();
