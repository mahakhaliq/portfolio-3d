import * as THREE from "three";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(20240607); // fixed seed = same world every time

function hexToRgb(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function shade(hex, amount) {
    const [r, g, b] = hexToRgb(hex);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + amount)));
    return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// Makes a crisp 16x16 pixel texture
function makeTexture(draw, size = 16) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function noisyFill(ctx, size, base, variance) {
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            ctx.fillStyle = shade(base, (rand() - 0.5) * variance);
            ctx.fillRect(x, y, 1, 1);
        }
    }
}

// ---------------------------------------------------------------
// Textures
// ---------------------------------------------------------------
const texGrassTop = makeTexture((c, s) => noisyFill(c, s, 0x5da13a, 34));
const texDirt = makeTexture((c, s) => {
    noisyFill(c, s, 0x8a5a36, 26);
    for (let i = 0; i < 12; i++) {
        c.fillStyle = shade(0x5a3a20, 0);
        c.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
});
const texGrassSide = makeTexture((c, s) => {
    noisyFill(c, s, 0x8a5a36, 26);
    for (let x = 0; x < s; x++) {
        const depth = 3 + (rand() < 0.5 ? 1 : 0);
        for (let y = 0; y < depth; y++) {
            c.fillStyle = shade(0x5da13a, (rand() - 0.5) * 34);
            c.fillRect(x, y, 1, 1);
        }
    }
});
const texSand = makeTexture((c, s) => noisyFill(c, s, 0xe0d29a, 18));
const texStone = makeTexture((c, s) => noisyFill(c, s, 0x8a8a8a, 40));
const texLogSide = makeTexture((c, s) => {
    for (let x = 0; x < s; x++) {
        const stripe = (rand() - 0.5) * 30;
        for (let y = 0; y < s; y++) {
            c.fillStyle = shade(0x6b4a2a, stripe + (rand() - 0.5) * 12);
            c.fillRect(x, y, 1, 1);
        }
    }
});
const texLogTop = makeTexture((c, s) => {
    noisyFill(c, s, 0xa98454, 14);
    c.strokeStyle = shade(0x6b4a2a, 0);
    c.lineWidth = 1;
    c.strokeRect(1.5, 1.5, s - 3, s - 3);
    c.strokeRect(4.5, 4.5, s - 9, s - 9);
});
const texLeaves = makeTexture((c, s) => {
    noisyFill(c, s, 0x2f7d2a, 30);
    for (let i = 0; i < 40; i++) {
        c.fillStyle = shade(0x1a5518, 0);
        c.fillRect((rand() * s) | 0, (rand() * s) | 0, 1, 1);
    }
});

// ---------------------------------------------------------------
// Scene, camera, renderer, lights
// ---------------------------------------------------------------
const SKY = 0x87ceeb;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 35, 75);

const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 200
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.1));
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x6b8f4e, 0.6));

const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
sun.position.set(22, 32, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun);

// ---------------------------------------------------------------
// World data
// Block cell (x,z) occupies [x-0.5, x+0.5]. Ground top surface is y = 0.
// ---------------------------------------------------------------
const HALF = 16; // world spans cells -16..16  (33 x 33)
const key = (x, z) => x + "," + z;

const blocked = new Set(); // cells the player cannot walk into
const waterCells = new Set();
const sandCells = new Set();
const stoneCells = new Set();

// Pond
const POND = { x: -8, z: -7, rx: 3.6, rz: 2.8 };
for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
        const d = ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2;
        if (d <= 1) {
            waterCells.add(key(x, z));
            blocked.add(key(x, z));
        } else if (d <= 1.9) {
            sandCells.add(key(x, z));
        }
    }
}

// Instanced-mesh builder
function buildInstanced(geometry, material, positions, shadows = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => {
        m.makeTranslation(p[0], p[1], p[2]);
        mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    return mesh;
}

const cube = new THREE.BoxGeometry(1, 1, 1);
const lambert = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });

const matGrassSide = lambert(texGrassSide);
const matGrassTop = lambert(texGrassTop);
const matDirt = lambert(texDirt);
const matSand = lambert(texSand);
const matStone = lambert(texStone);
const matLogSide = lambert(texLogSide);
const matLogTop = lambert(texLogTop);
const matLeaves = lambert(texLeaves);

// ---- Ground: grass / sand top layer, two dirt layers below ----
const grassPos = [];
const sandPos = [];
const dirtPos = [];
for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
        const k = key(x, z);
        if (waterCells.has(k)) {
            // water sits in a hollow: nothing on the top layer
        } else if (sandCells.has(k)) {
            sandPos.push([x, -0.5, z]);
        } else {
            grassPos.push([x, -0.5, z]);
        }
        dirtPos.push([x, -1.5, z]);
        dirtPos.push([x, -2.5, z]);
    }
}
buildInstanced(cube, [matGrassSide, matGrassSide, matGrassTop, matDirt, matGrassSide, matGrassSide], grassPos);
buildInstanced(cube, matSand, sandPos);
buildInstanced(cube, matDirt, dirtPos);

// ---- Water ----
const waterGeo = new THREE.BoxGeometry(1, 0.85, 1);
const waterMat = new THREE.MeshLambertMaterial({
    color: 0x2f6fdc, transparent: true, opacity: 0.75,
});
const waterPos = [];
waterCells.forEach((k) => {
    const [x, z] = k.split(",").map(Number);
    waterPos.push([x, -0.575, z]); // top surface at y = -0.15
});
buildInstanced(waterGeo, waterMat, waterPos, false).receiveShadow = true;

// ---- Trees ----
const spawn = { x: 0, z: 4 };
const treeCells = [];
function farFromTrees(x, z, minDist) {
    return treeCells.every(([tx, tz]) => Math.hypot(tx - x, tz - z) >= minDist);
}

let tries = 0;
while (treeCells.length < 16 && tries < 500) {
    tries++;
    const x = Math.floor(rand() * (HALF * 2 - 2)) - (HALF - 2);
    const z = Math.floor(rand() * (HALF * 2 - 2)) - (HALF - 2);
    const k = key(x, z);
    if (waterCells.has(k) || sandCells.has(k)) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 4) continue;
    if (!farFromTrees(x, z, 5)) continue;
    treeCells.push([x, z]);
}

const logPos = [];
const leafSet = new Set();
const leafPos = [];
treeCells.forEach(([tx, tz]) => {
    blocked.add(key(tx, tz));
    for (let h = 0; h < 4; h++) logPos.push([tx, 0.5 + h, tz]);
});
function addLeaf(x, y, z) {
    const k = `${x},${y},${z}`;
    if (leafSet.has(k)) return;
    leafSet.add(k);
    leafPos.push([x, y + 0.5, z]);
}
treeCells.forEach(([tx, tz]) => {
    // two wide layers (5x5 without corners), at y 3 and 4
    for (const y of [3, 4]) {
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
                // the trunk (4 blocks tall) passes through the y = 3 layer only
                if (dx === 0 && dz === 0 && y === 3) continue;
                addLeaf(tx + dx, y, tz + dz);
            }
        }
    }
    // upper layers
    for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) addLeaf(tx + dx, 5, tz + dz);
    addLeaf(tx, 6, tz);
    addLeaf(tx + 1, 6, tz);
    addLeaf(tx - 1, 6, tz);
    addLeaf(tx, 6, tz + 1);
    addLeaf(tx, 6, tz - 1);
});
buildInstanced(cube, [matLogSide, matLogSide, matLogTop, matLogTop, matLogSide, matLogSide], logPos);
buildInstanced(cube, matLeaves, leafPos);

// ---- Rocks ----
let rocks = 0;
tries = 0;
const stonePos = [];
while (rocks < 6 && tries < 300) {
    tries++;
    const x = Math.floor(rand() * (HALF * 2 - 2)) - (HALF - 2);
    const z = Math.floor(rand() * (HALF * 2 - 2)) - (HALF - 2);
    const k = key(x, z);
    if (blocked.has(k) || sandCells.has(k)) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 4) continue;
    if (!farFromTrees(x, z, 2)) continue;
    blocked.add(k);
    stoneCells.add(k);
    stonePos.push([x, 0.5, z]);
    if (rand() < 0.5) {
        // a small second block next to it
        const nk = key(x + 1, z);
        if (!blocked.has(nk) && !sandCells.has(nk) && x + 1 <= HALF) {
            blocked.add(nk);
            stoneCells.add(nk);
            stonePos.push([x + 1, 0.5, z]);
        }
    }
    rocks++;
}
buildInstanced(cube, matStone, stonePos);

// ---- Flowers (decoration, walk-through) ----
const stemGeo = new THREE.BoxGeometry(0.07, 0.4, 0.07);
const stemMat = new THREE.MeshLambertMaterial({ color: 0x2e8b2e });
const headGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const flowerColors = [0xe63946, 0xffd60a, 0xffffff, 0xff70a6, 0x9b5de5];
for (let i = 0; i < 40; i++) {
    const x = Math.floor(rand() * (HALF * 2)) - HALF;
    const z = Math.floor(rand() * (HALF * 2)) - HALF;
    const k = key(x, z);
    if (blocked.has(k) || sandCells.has(k)) continue;
    const ox = (rand() - 0.5) * 0.6;
    const oz = (rand() - 0.5) * 0.6;
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x + ox, 0.2, z + oz);
    const head = new THREE.Mesh(
        headGeo,
        new THREE.MeshLambertMaterial({
            color: flowerColors[(rand() * flowerColors.length) | 0],
        })
    );
    head.position.set(x + ox, 0.48, z + oz);
    head.castShadow = true;
    scene.add(stem, head);
}

// ---- Clouds ----
const clouds = [];
const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.92, fog: false,
});
for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const parts = 3 + ((rand() * 4) | 0);
    for (let p = 0; p < parts; p++) {
        const w = 3 + rand() * 3;
        const d = 2 + rand() * 2.5;
        const part = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), cloudMat);
        part.position.set(p * 2.2 - parts, rand() * 0.4, (rand() - 0.5) * 2);
        cloud.add(part);
    }
    cloud.position.set((rand() - 0.5) * 100, 16 + rand() * 6, (rand() - 0.5) * 90);
    scene.add(cloud);
    clouds.push(cloud);
}

// ---------------------------------------------------------------
// Player (Steve-style, built from boxes)
// ---------------------------------------------------------------
function pixelTexture(w, h, painter) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    painter(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const SKIN = "#c8926a", HAIR = "#4a2f1a";

const faceFront = pixelTexture(8, 8, (c) => {
    c.fillStyle = SKIN; c.fillRect(0, 0, 8, 8);
    c.fillStyle = HAIR; c.fillRect(0, 0, 8, 2);
    c.fillRect(0, 2, 1, 1); c.fillRect(7, 2, 1, 1);
    c.fillStyle = "#ffffff"; c.fillRect(1, 4, 2, 1); c.fillRect(5, 4, 2, 1);
    c.fillStyle = "#3a2a8a"; c.fillRect(2, 4, 1, 1); c.fillRect(5, 4, 1, 1);
    c.fillStyle = "#7a4a30"; c.fillRect(3, 6, 2, 1);
});
const faceSide = pixelTexture(8, 8, (c) => {
    c.fillStyle = SKIN; c.fillRect(0, 0, 8, 8);
    c.fillStyle = HAIR; c.fillRect(0, 0, 8, 2);
});
const faceHair = pixelTexture(8, 8, (c) => {
    c.fillStyle = HAIR; c.fillRect(0, 0, 8, 8);
});
const faceBottom = pixelTexture(8, 8, (c) => {
    c.fillStyle = SKIN; c.fillRect(0, 0, 8, 8);
});
const basic = (map) => new THREE.MeshLambertMaterial({ map });
// BoxGeometry face order: +x, -x, +y, -y, +z (front), -z (back)
const headMats = [
    basic(faceSide), basic(faceSide), basic(faceHair),
    basic(faceBottom), basic(faceFront), basic(faceHair),
];

const player = new THREE.Group();
const shirtMat = new THREE.MeshLambertMaterial({ color: 0x00a8a8 });
const skinMat = new THREE.MeshLambertMaterial({ color: 0xc8926a });
const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3b3b98 });
const shoeMat = new THREE.MeshLambertMaterial({ color: 0x6b6b6b });

function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
}

// Head (top at y = 2.0)
box(0.5, 0.5, 0.5, headMats, 0, 1.75, 0, player);
// Body
box(0.5, 0.75, 0.25, shirtMat, 0, 1.125, 0, player);

// Arms: pivot at the shoulder so they swing
function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.375, 1.5, 0);
    box(0.25, 0.3, 0.25, shirtMat, 0, -0.15, 0, pivot);
    box(0.25, 0.45, 0.25, skinMat, 0, -0.525, 0, pivot);
    player.add(pivot);
    return pivot;
}
// Legs: pivot at the hip
function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.125, 0.75, 0);
    box(0.25, 0.55, 0.25, pantsMat, 0, -0.275, 0, pivot);
    box(0.25, 0.2, 0.25, shoeMat, 0, -0.65, 0, pivot);
    player.add(pivot);
    return pivot;
}
const armL = makeArm(-1), armR = makeArm(1);
const legL = makeLeg(-1), legR = makeLeg(1);

player.position.set(spawn.x, 0, spawn.z);
scene.add(player);

// ---------------------------------------------------------------
// Coins
// ---------------------------------------------------------------
const COIN_TARGET = 12;
const coins = [];
const coinGeo = new THREE.BoxGeometry(0.55, 0.55, 0.12);
const coinTex = pixelTexture(8, 8, (c) => {
    c.fillStyle = "#b8860b"; c.fillRect(0, 0, 8, 8);
    c.fillStyle = "#ffd700"; c.fillRect(1, 1, 6, 6);
    c.fillStyle = "#fff2a8"; c.fillRect(2, 2, 2, 1); c.fillRect(2, 3, 1, 1);
    c.fillStyle = "#daa520"; c.fillRect(3, 3, 2, 3);
});
const coinMat = new THREE.MeshStandardMaterial({
    map: coinTex, metalness: 0.6, roughness: 0.35,
    emissive: 0xaa7700, emissiveIntensity: 0.35,
});

function createCoin(x, z, phase) {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.position.set(x, 1.0, z);
    coin.castShadow = true;
    coin.userData = { baseY: 1.0, phase };
    scene.add(coin);
    coins.push(coin);
}

tries = 0;
const placed = [];
while (placed.length < COIN_TARGET && tries < 2000) {
    tries++;
    const x = Math.floor(rand() * (HALF * 2 - 1)) - (HALF - 1);
    const z = Math.floor(rand() * (HALF * 2 - 1)) - (HALF - 1);
    if (blocked.has(key(x, z))) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 3) continue;
    if (!placed.every(([px, pz]) => Math.hypot(px - x, pz - z) >= 4)) continue;
    placed.push([x, z]);
    createCoin(x, z, rand() * Math.PI * 2);
}
const TOTAL_COINS = coins.length;

// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------
const keys = {};
window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
    }
    if (e.code === "KeyR") location.reload();
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });
// don't keep walking if the tab loses focus while a key is held
window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    dragging = false;
});

// Camera orbit: drag with mouse, scroll to zoom, Q/E to rotate
let camYaw = 0;
let camPitch = 0.55;
let camDist = 9;
let camCurDist = camDist; // actual distance after collision
let dragging = false;
renderer.domElement.addEventListener("mousedown", () => { dragging = true; });
window.addEventListener("mouseup", () => { dragging = false; });
window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    camYaw -= e.movementX * 0.005;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.005, 0.1, 1.3);
});
window.addEventListener("wheel", (e) => {
    camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 4, 18);
}, { passive: true });

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------
// Movement + collision
// ---------------------------------------------------------------
const RADIUS = 0.3;
const SPEED = 5;
const GRAVITY = 25;
const JUMP = 8;
let velY = 0;
let walkTime = 0;
let facing = 0;

function isBlocked(x, z) {
    for (const dx of [-RADIUS, RADIUS]) {
        for (const dz of [-RADIUS, RADIUS]) {
            if (blocked.has(key(Math.round(x + dx), Math.round(z + dz)))) return true;
        }
    }
    return false;
}

function movePlayer(dt) {
    let inX = 0, inZ = 0; // input: x = right, z = forward
    if (keys["KeyW"] || keys["ArrowUp"]) inZ += 1;
    if (keys["KeyS"] || keys["ArrowDown"]) inZ -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) inX += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) inX -= 1;
    if (keys["KeyQ"]) camYaw += 1.8 * dt;
    if (keys["KeyE"]) camYaw -= 1.8 * dt;

    let moving = false;
    if (inX !== 0 || inZ !== 0) {
        const len = Math.hypot(inX, inZ);
        inX /= len; inZ /= len;
        // camera-relative directions
        const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
        const rightX = Math.cos(camYaw), rightZ = -Math.sin(camYaw);
        const dirX = fwdX * inZ + rightX * inX;
        const dirZ = fwdZ * inZ + rightZ * inX;

        const stepX = dirX * SPEED * dt;
        const stepZ = dirZ * SPEED * dt;

        // each axis separately so you slide along walls / trees
        let nx = player.position.x + stepX;
        if (!isBlocked(nx, player.position.z)) player.position.x = nx;
        let nz = player.position.z + stepZ;
        if (!isBlocked(player.position.x, nz)) player.position.z = nz;

        player.position.x = THREE.MathUtils.clamp(player.position.x, -HALF - 0.2, HALF + 0.2);
        player.position.z = THREE.MathUtils.clamp(player.position.z, -HALF - 0.2, HALF + 0.2);

        // smooth turn to face movement direction
        const target = Math.atan2(dirX, dirZ);
        let diff = target - facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        facing += diff * Math.min(1, dt * 14);
        player.rotation.y = facing;
        moving = true;
    }

    // jump / gravity
    const onGround = player.position.y <= 0.0001;
    if (keys["Space"] && onGround) velY = JUMP;
    velY -= GRAVITY * dt;
    player.position.y += velY * dt;
    if (player.position.y <= 0) {
        player.position.y = 0;
        velY = 0;
    }

    // limb animation
    const airborne = player.position.y > 0.01;
    if (moving && !airborne) walkTime += dt * 10;
    const swing = moving ? Math.sin(walkTime) * 0.9 : 0;
    const k = 1 - Math.min(1, dt * 12);
    armL.rotation.x = armL.rotation.x * k + swing * (1 - k);
    armR.rotation.x = armR.rotation.x * k - swing * (1 - k);
    legL.rotation.x = legL.rotation.x * k - swing * (1 - k);
    legR.rotation.x = legR.rotation.x * k + swing * (1 - k);
    if (airborne) {
        armL.rotation.x = armR.rotation.x = -0.6;
    }
}

// ---------------------------------------------------------------
// Coins: collect + animate
// ---------------------------------------------------------------
let score = 0;
const scoreEl = document.getElementById("score");
const messageEl = document.getElementById("message");
scoreEl.innerText = `Coins: 0 / ${TOTAL_COINS}`;

function checkCoins() {
    for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        const dx = player.position.x - coin.position.x;
        const dz = player.position.z - coin.position.z;
        const dy = player.position.y + 1 - coin.position.y;
        if (Math.hypot(dx, dz) < 0.9 && Math.abs(dy) < 1.6) {
            scene.remove(coin);
            coins.splice(i, 1);
            score++;
            scoreEl.innerText = `Coins: ${score} / ${TOTAL_COINS}`;
            if (score === TOTAL_COINS) {
                messageEl.innerText = "YOU COLLECTED ALL COINS!\nPress R to play again";
            }
        }
    }
}

function animateCoins(t) {
    for (const coin of coins) {
        coin.rotation.y += 0.04;
        // per-coin phase so they don't all bob in sync
        coin.position.y = coin.userData.baseY + Math.sin(t * 2.5 + coin.userData.phase) * 0.12;
    }
}

function animateClouds(dt) {
    for (const c of clouds) {
        c.position.x += dt * 0.8;
        if (c.position.x > 60) c.position.x = -60;
    }
}

// Is there a solid block (leaves, trunk, rock, or ground) at this point?
function solidAt(px, py, pz) {
    if (py < 0.15) return true; // ground
    const cx = Math.round(px), cz = Math.round(pz);
    if (leafSet.has(`${cx},${Math.floor(py)},${cz}`)) return true;
    if (py < 4 && treeCells.some(([tx, tz]) => tx === cx && tz === cz)) return true;
    if (py < 1 && stoneCells.has(key(cx, cz))) return true;
    return false;
}

function updateCamera() {
    const target = new THREE.Vector3(
        player.position.x, player.position.y + 1.4, player.position.z
    );
    const dirX = Math.sin(camYaw) * Math.cos(camPitch);
    const dirY = Math.sin(camPitch);
    const dirZ = Math.cos(camYaw) * Math.cos(camPitch);

    // walk the camera arm outward and stop before it enters a block
    let dist = camDist;
    for (let d = 0.5; d <= camDist; d += 0.25) {
        if (solidAt(target.x + dirX * d, target.y + dirY * d, target.z + dirZ * d)) {
            dist = Math.max(1.5, d - 0.5);
            break;
        }
    }

    // snap in when blocked, ease back out when the view clears
    camCurDist = dist < camCurDist ? dist : camCurDist + (dist - camCurDist) * 0.1;

    camera.position.set(
        target.x + dirX * camCurDist,
        target.y + dirY * camCurDist,
        target.z + dirZ * camCurDist
    );
    camera.lookAt(target);
}

// ---------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    movePlayer(dt);
    checkCoins();
    animateCoins(t);
    animateClouds(dt);
    updateCamera();

    renderer.render(scene, camera);
}
animate();
