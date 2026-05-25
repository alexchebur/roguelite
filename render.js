// =========================== Модуль рендеринга (отрисовка, UI, лог, миникарта) ===========================
const RenderModule = (function() {
    let display = null;
    let fov = null;
    const COLS = 60;
    const ROWS = 40;
    const FONT_SIZE = 14;

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

    function draw(player, enemies, items) {
        display.clear();
        const dtype = MapModule.currentDungeonType || DUNGEON_TYPES[0];
        const cam = getCameraOffset(player);

        const visible = new Set();
        fov.compute(player.x, player.y, 25, (x, y, r, vis) => {
            if (vis) visible.add(`${x},${y}`);
        });

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
                    bg = "#000";
                } else {
                    ch = dtype.floorChar;
                    fg = isVisible ? dtype.floorColor : '#111';
                    bg = "#000";
                }

                if (MapModule.stairsUp && wx === MapModule.stairsUp.x && wy === MapModule.stairsUp.y) {
                    ch = ">"; fg = isVisible ? "#FFF" : "#333";
                }
                if (MapModule.stairsDown && wx === MapModule.stairsDown.x && wy === MapModule.stairsDown.y) {
                    ch = "<"; fg = isVisible ? "#888" : "#222";
                }

                display.draw(sx, sy, ch, fg, bg);
            }
        }

        items.forEach(i => {
            const sx = i.x - cam.x;
            const sy = i.y - cam.y;
            if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${i.x},${i.y}`)) {
                display.draw(sx, sy, i.char, i.color);
            }
        });

        enemies.forEach(e => {
            if (e.hp > 0) {
                const sx = e.x - cam.x;
                const sy = e.y - cam.y;
                if (sx >= 0 && sx < COLS && sy >= 0 && sy < ROWS && visible.has(`${e.x},${e.y}`)) {
                    display.draw(sx, sy, e.char, e.color);
                }
            }
        });

        display.draw(Math.floor(COLS / 2), Math.floor(ROWS / 2), player.char, player.color);

        return visible;
    }

    function updateUI(player, locData, worldTrend) {
        if (locData) {
            document.getElementById("ui-loc-name").textContent = locData.fullName;
            document.getElementById("ui-loc-desc").textContent = locData.description;
            let typeText = `Тип: ${locData.themeName} (${MapModule.currentDungeonType ? MapModule.currentDungeonType.name : '?'})`;
            if (worldTrend && worldTrend.name !== "Обычный уровень") {
                typeText += ` | ${worldTrend.name}`;
                document.getElementById("ui-loc-name").style.color = worldTrend.color;
            } else {
                document.getElementById("ui-loc-name").style.color = "var(--accent)";
            }
            document.getElementById("ui-loc-type").textContent = typeText;
        }
        document.getElementById("ui-stats").innerHTML = `
            <div class="stat-row"><span>HP</span> <span class="val-hp">${player.hp}/${player.maxHp}</span></div>
            <div class="stat-row"><span>Атака</span> <span class="val-atk">${player.atk}</span></div>
            <div class="stat-row"><span>Защита</span> <span class="val-def">${player.def}</span></div>
            <div class="stat-row"><span>Уровень</span> <span>${player.level}</span></div>
        `;
        const w = player.equipment.weapon ? player.equipment.weapon.name : "—";
        const a = player.equipment.armor ? player.equipment.armor.name : "—";
        document.getElementById("ui-equip").innerHTML = `
            <div class="equip-slot">Рука: <span class="equip-item">${w}</span></div>
            <div class="equip-slot">Тело: <span class="equip-item">${a}</span></div>
        `;
        const invDiv = document.getElementById("inventory-list");
        invDiv.innerHTML = "";
        if (player.inventory.length === 0) invDiv.innerHTML = "<div style='color:#555;font-size:11px'>Пусто</div>";
        player.inventory.forEach((item, idx) => {
            const div = document.createElement("div");
            div.className = "inv-item";
            div.style.color = item.color;
            div.textContent = `${item.char} ${item.name} (+${item.val})`;
            div.onclick = () => CombatModule.useItem(player, idx, log, () => updateUI(player, locData, worldTrend));
            invDiv.appendChild(div);
        });
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
        const rect = cvs.parentElement.getBoundingClientRect();
        cvs.width = rect.width - 20;
        cvs.height = rect.height - 40;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cvs.width, cvs.height);
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

    return {
        init,
        draw,
        updateUI,
        log,
        drawMinimap,
        getCameraOffset,  // <-- ЭТО БЫЛО ОТСУТСТВУЮЩЕЕ ЗВЕНО!
        COLS,
        ROWS
    };
})();
