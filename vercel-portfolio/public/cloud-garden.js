import { createFlowerGame } from './flower-game.js';
import { createPinboardTexture, openAchievementBoard } from './achievements.js';
import { openPortfolioChat } from './portfolio-chat.js';
import { startRobotGarden } from './garden-game.js';
// Maha · Cloud Garden – a playable 3D portfolio.
import * as THREE from 'three';
import { EffectComposer } from './lib/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './lib/three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from './lib/three/addons/geometries/RoundedBoxGeometry.js';
import { buildMaha } from './character.js';
import { GardenAudio } from './audio.js';

const byId = (id) => document.getElementById(id);
const rng = (() => { let a = 20260; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
const rr = (a, b) => a + rng() * (b - a);

// ------------------------------------------------------------------ renderer
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (error) {
    byId('error').hidden = false;
    byId('error').textContent = 'Cloud Garden requires a browser with WebGL enabled.';
    byId('start').disabled = true;
    throw error;
}
const DPR = Math.min(devicePixelRatio, 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG = 0xe9b8c9;
scene.fog = new THREE.FogExp2(FOG, 0.0075);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);

// ------------------------------------------------------------------ sky
const skyUniforms = {
    top: { value: new THREE.Color(0x4a3f93) },
    mid: { value: new THREE.Color(0xd987b8) },
    low: { value: new THREE.Color(0xf4b896) },
    night: { value: 0 },
    sunDir: { value: new THREE.Vector3(-0.28, 0.16, -0.94).normalize() },
};
const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 top, mid, low, sunDir; uniform float night;
    void main(){ vec3 d = normalize(vDir); float h = d.y;
      vec3 c = mix(low, mid, smoothstep(-0.05, 0.16, h));
      c = mix(c, top, smoothstep(0.1, 0.75, h));
      c = mix(c, low * 0.95, smoothstep(-0.05, -0.4, h));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      vec3 sunGlow = vec3(1.0, 0.72, 0.45) * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.3 + pow(s, 6.0) * 0.08);
      vec2 grid = vec2(atan(d.z, d.x), asin(d.y)) * vec2(100.0, 85.0);
      float random = fract(sin(dot(floor(grid), vec2(127.1, 311.7))) * 43758.5453);
      float star = step(0.965, random) * (1.0 - smoothstep(0.04, 0.19, length(fract(grid) - 0.5)));
      float moonDot = dot(d, normalize(vec3(-0.24, 0.32, -0.92)));
      float moon = smoothstep(0.9991, 0.9994, moonDot);
      vec3 nightGlow = vec3(0.76, 0.86, 1.0) * (moon + pow(max(moonDot, 0.0), 120.0) * 0.13 + star * smoothstep(0.03, 0.3, h));
      c += mix(sunGlow, nightGlow, night);
      gl_FragColor = vec4(c, 1.0); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), skyMaterial);
sky.frustumCulled = false;
scene.add(sky);
{   // sky-based image lighting so every PBR surface picks up the sunset palette
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial));
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
    scene.environmentIntensity = 0.45;
}

// ------------------------------------------------------------------ lights
const ambient = new THREE.HemisphereLight(0xffe3f0, 0x9a73a6, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffd9b8, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
const sunOffset = new THREE.Vector3(-10, 17, 9);
scene.add(sun, sun.target);

const gardenThemes = {
    day: {sky:[0x6399dc,0xe8a9d4,0xffcfab], fog:0xeab8d1, sun:0xffdfbb, brightness:2.3, ambient:0.6, environment:0.45},
    night: {sky:[0x070f2d,0x19284e,0x342d59], fog:0x554a76, sun:0xb9c6ff, brightness:1.2, ambient:0.9, environment:0.29},
};
const themePicker = byId('garden-theme');
function applyGardenTheme() {
    const selected = themePicker.querySelector(':checked').value;
    const theme = gardenThemes[selected];
    ['top','mid','low'].forEach((layer,index) => skyUniforms[layer].value.setHex(theme.sky[index]));
    scene.fog.color.setHex(theme.fog);
    sun.color.setHex(theme.sun);
    sun.intensity = theme.brightness;
    ambient.intensity = theme.ambient;
    scene.environmentIntensity = theme.environment;
    const night = selected === 'night';
    skyUniforms.night.value = Number(night);
    nightFill.visible = night;
    nightFireflies.forEach(material => { material.visible = night; });
    for (const cloud of clouds) {
        cloud.material.color.setHex(night ? 0x716990 : cloud.userData.dayColor);
    }
    document.documentElement.dataset.gardenTheme = selected;
}



// ------------------------------------------------------------------ procedural textures
function canvasTexture(w, h, draw, repeat) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
}
const pavingTexture = (repeat) => canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#b79bb0'; g.fillRect(0, 0, w, h);
    const rows = 6;
    for (let r = 0; r < rows; r++) {
        let x = -(r % 2) * 40, y = r * h / rows;
        while (x < w) {
            const cw = 70 + rng() * 70, light = 226 + rng() * 22;
            g.fillStyle = `rgb(${light},${light - 14 + rng() * 8},${light - 14 + rng() * 10})`;
            g.beginPath(); g.roundRect(x + 3, y + 3, cw - 6, h / rows - 6, 7); g.fill();
            for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(120,80,110,${rng() * 0.06})`; g.fillRect(x + rng() * cw, y + rng() * h / rows, 2 + rng() * 5, 2 + rng() * 4); }
            x += cw;
        }
    }
}, repeat);
const grassTexture = (repeat) => canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#6f9a5e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
        const l = 40 + rng() * 22, hue = 92 + rng() * 38;
        g.strokeStyle = `hsla(${hue},45%,${l}%,${0.35 + rng() * 0.4})`;
        g.lineWidth = 1 + rng() * 1.6;
        const x = rng() * w, y = rng() * h;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng() * 5 - 2.5, y - 3 - rng() * 6); g.stroke();
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = ['#ffd9e6', '#fff3b8', '#e7c9ff'][i % 3]; g.beginPath(); g.arc(rng() * w, rng() * h, 1.4 + rng(), 0, 7); g.fill(); }
}, repeat);
const hedgeTexture = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#44714d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
        g.fillStyle = `hsla(${100 + rng() * 40},${35 + rng() * 25}%,${24 + rng() * 26}%,.75)`;
        g.beginPath(); g.ellipse(rng() * w, rng() * h, 3 + rng() * 5, 2 + rng() * 3, rng() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = '#ffd1e3'; g.beginPath(); g.arc(rng() * w, rng() * h, 2, 0, 7); g.fill(); }
}, [3, 1]);
const glowTexture = canvasTexture(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const cloudTexture = canvasTexture(256, 256, (g, w) => {
    for (let i = 0; i < 22; i++) {
        const x = w * (0.2 + rng() * 0.6), y = w * (0.4 + rng() * 0.25), r = w * (0.12 + rng() * 0.16);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
});

// ------------------------------------------------------------------ materials & helpers
const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const stone = std(0xe8d2cf, 0.85), stoneWarm = std(0xe0b8a8, 0.85), lilacStone = std(0xa88bb8, 0.8);
const plum = std(0x4d2b57, 0.7), rosewood = std(0x7a5460, 0.7), brass = std(0xcfa35d, 0.35, 0.85);
const glowWarm = std(0xffd28a, 0.4, 0, { emissive: 0xffb25e, emissiveIntensity: 3.2 });
const leafMat = std(0x5a8a57, 0.85), hedgeMat = std(0xffffff, 0.95, 0, { map: hedgeTexture });
const petalMats = [0xf2a8cb, 0xe58ac0, 0xffd1e2, 0xc49bea].map(c => std(c, 0.75, 0, { emissive: c, emissiveIntensity: 0.06 }));
const box = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(1, 28, 18);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 32), rbox = new RoundedBoxGeometry(1, 1, 1, 4, 0.12);

function add(geometry, material, x, y, z, sx = 1, sy = sx, sz = sx, { cast = true, receive = true, parent = scene } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m);
    return m;
}
const block = (m, x, y, z, a, b, c) => add(box, m, x, y, z, a, b, c);
const soft = (m, x, y, z, a, b, c) => add(rbox, m, x, y, z, a, b, c);
const round = (m, x, y, z, a, b, c) => add(sphere, m, x, y, z, a, b, c);
const post = (m, x, y, z, r, h) => add(cylinder, m, x, y, z, r, h, r);
const lights = [];
function pointLight(x, y, z, color = 0xffc27a, intensity = 14, distance = 13) {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z); scene.add(l); lights.push(l); return l;
}

// ------------------------------------------------------------------ floating islands
function island(cx, cz, rx, rz, depth, { y = 0, grassRepeat = 3.4, tint = 0x7a6290 } = {}) {
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    scene.add(g);
    // grass slab
    const slab = add(cylinder, std(0xffffff, 0.95, 0, { map: grassTexture([rx / grassRepeat, rz / grassRepeat]) }), 0, -0.2, 0, rx, 0.4, rz, { parent: g });
    slab.receiveShadow = true;
    // rocky underside
    const geo = new THREE.CylinderGeometry(0.985, 0.12, 1, 30, 8, true);
    const pos = geo.attributes.position, colors = [], c = new THREE.Color(), top = new THREE.Color(0xa07f8e), low = new THREE.Color(tint);
    for (let i = 0; i < pos.count; i++) {
        const t = 0.5 - pos.getY(i);                         // 0 at top, 1 at bottom
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        const n = 1 + 0.11 * Math.sin(a * 5 + t * 6) + 0.07 * Math.sin(a * 11 - t * 9) + (rng() - 0.5) * 0.05;
        pos.setX(i, pos.getX(i) * n * rx); pos.setZ(i, pos.getZ(i) * n * rz);
        pos.setY(i, -0.4 - t * depth + (rng() - 0.5) * 0.35 * (t > 0.05 && t < 0.95 ? 1 : 0));
        c.copy(top).lerp(low, Math.min(1, t * 1.4)); colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, std(0xffffff, 0.95, 0, { vertexColors: true, flatShading: true }));
    rock.castShadow = true;
    g.add(rock);
    // hanging crystals
    for (let i = 0; i < 6; i++) {
        const a = rng() * 6.28, d = rr(0.2, 0.55);
        const cr = add(new THREE.ConeGeometry(0.28, 1.3, 5), std(0xd8a6f2, 0.3, 0.1, { emissive: 0x9b59d0, emissiveIntensity: 0.5 }),
            Math.cos(a) * rx * d, -depth * (0.35 + d * 0.5), Math.sin(a) * rz * d, rr(0.5, 1.1), rr(0.6, 1.4), rr(0.5, 1.1), { parent: g });
        cr.rotation.x = Math.PI + rr(-0.2, 0.2);
    }
    return g;
}

// ------------------------------------------------------------------ vegetation (instanced)
const bloomData = [[], [], [], []];
const leafData = [];
const flowerData = [];
function blossomTree(x, z, size = 1, palette = [0, 1, 2], { leafy = false } = {}) {
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 0.12 * size, 0.9 * size, z - 0.05 * size),
        new THREE.Vector3(x - 0.1 * size, 1.8 * size, z + 0.06 * size), new THREE.Vector3(x + 0.05 * size, 2.7 * size, z),
    ]);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.13 * size, 10), std(0x6b4a55, 0.9));
    trunk.castShadow = true; scene.add(trunk);
    add(cylinder, std(0x6b4a55, 0.9), x, 0.12, z, 0.24 * size, 0.28, 0.24 * size);
    const count = Math.round(34 * Math.sqrt(size));
    for (let i = 0; i < count; i++) {
        const a = i * 2.39996, t = Math.sqrt((i + 0.5) / count);
        const rad = t * 1.6 * size, h = 3.0 * size + (1 - t) * 1.0 * size + Math.sin(i * 5.1) * 0.22 * size;
        const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        const s = rr(0.5, 0.82) * size;
        if (leafy) leafData.push([px, h - 0.3, pz, s * 1.05]);
        else {
            bloomData[palette[i % palette.length]].push([px, h, pz, s]);
            if (i % 3 === 0) leafData.push([px * 0.9 + x * 0.1, h - 0.5 * size, pz * 0.9 + z * 0.1, s * 0.6]);
        }
    }
}
function flowerBed(x, z, w, d, count, y0 = 0) {
    const mound = add(sphere, leafMat, x, y0 + 0.02, z, w * 0.52, 0.28, d * 0.52);
    for (let i = 0; i < count; i++) {
        const a = rng() * 6.28, r = Math.sqrt(rng());
        flowerData.push([x + Math.cos(a) * r * w * 0.47, y0 + 0.22 + rng() * 0.12, z + Math.sin(a) * r * d * 0.47, rr(0.055, 0.1), Math.floor(rng() * 4)]);
    }
    return mound;
}
function finishVegetation() {
    const jitter = new THREE.IcosahedronGeometry(1, 2);
    const p = jitter.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * Math.sin(p.getX(i) * 7 + p.getY(i) * 5) * Math.cos(p.getZ(i) * 6); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.86, p.getZ(i) * k); }
    jitter.computeVertexNormals();
    const o = new THREE.Object3D();
    bloomData.forEach((list, k) => {
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(jitter, petalMats[k], list.length);
        list.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.scale.set(s, s * 0.9, s); o.rotation.set(0, i * 0.7, 0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);
    });
    const leaves = new THREE.InstancedMesh(jitter, std(0x5c8c58, 0.85), leafData.length);
    leafData.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.scale.set(s, s * 0.8, s); o.rotation.set(0, i, 0); o.updateMatrix(); leaves.setMatrixAt(i, o.matrix); });
    leaves.castShadow = leaves.receiveShadow = true;
    scene.add(leaves);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std(0xffffff, 0.7, 0, { emissive: 0x442233, emissiveIntensity: 0.15 }), flowerData.length);
    const col = new THREE.Color(), palette = [0xf7b4d3, 0xffe3a8, 0xe9c6ff, 0xffffff];
    flowerData.forEach(([x, y, z, s, k], i) => { o.position.set(x, y, z); o.scale.set(s, s * 0.7, s); o.rotation.set(0, 0, 0); o.updateMatrix(); flowers.setMatrixAt(i, o.matrix); flowers.setColorAt(i, col.set(palette[k])); });
    scene.add(flowers);
}

// ------------------------------------------------------------------ props
const obstacles = [];                 // {x,z,r} circles the avatar can't enter
const blockCircle = (x, z, r) => obstacles.push({ x, z, r });

function lantern(x, z, { light = false, height = 1.15 } = {}) {
    block(stoneWarm, x, 0.35, z, 0.34, 0.7, 0.34);
    soft(brass, x, 0.72, z, 0.46, 0.1, 0.46);
    add(rbox, glowWarm, x, 0.98, z, 0.3, 0.4, 0.3, { cast: false });
    soft(brass, x, 1.24, z, 0.46, 0.1, 0.46);
    add(new THREE.ConeGeometry(0.3, 0.2, 4), brass, x, 1.38, z, 1, 1, 1).rotation.y = Math.PI / 4;
    if (light) pointLight(x, 1.1, z, 0xffbf72, 6, 8);
}
function lampPost(x, z, { light = false } = {}) {
    post(brass, x, 0.1, z, 0.2, 0.2);
    post(std(0x3d2b44, 0.5, 0.6), x, 1.7, z, 0.05, 3.2);
    round(glowWarm, x, 3.45, z, 0.2, 0.26, 0.2);
    post(brass, x, 3.72, z, 0.16, 0.06);
    add(new THREE.ConeGeometry(0.24, 0.2, 12), brass, x, 3.84, z, 1, 1, 1);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffc27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false }));
    halo.position.set(x, 3.45, z); halo.scale.setScalar(1.8); scene.add(halo);
    if (light) pointLight(x, 3.3, z, 0xffc27a, 20, 14);
    blockCircle(x, z, 0.25);
}
function planter(x, z, size = 0.82) {
    soft(stoneWarm, x, 0.18, z, size, 0.36, size);
    flowerBed(x, z, size * 0.78, size * 0.78, 14, 0.34);
}
function bench(x, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    add(rbox, rosewood, 0, 0.48, 0, 1.9, 0.09, 0.55, { parent: g });
    add(rbox, rosewood, 0, 0.85, -0.25, 1.9, 0.42, 0.07, { parent: g }).rotation.x = -0.12;
    for (const sx of [-0.8, 0.8]) add(rbox, brass, sx, 0.24, 0, 0.08, 0.5, 0.5, { parent: g });
    blockCircle(x, z, 0.55);
}
function arcade(x, z, width, height) {
    for (const side of [-1, 1]) {
        const px = x + side * width / 2;
        post(std(0xefdbd6, 0.7), px, height / 2, z, 0.17, height);
        soft(brass, px, 0.14, z, 0.55, 0.28, 0.55);
        soft(brass, px, height, z, 0.5, 0.18, 0.5);
        blockCircle(px, z, 0.3);
    }
    const arch = add(new THREE.TorusGeometry(width / 2, 0.12, 12, 40, Math.PI), lilacStone, x, height, z, 1, 0.62, 1);
    // vines + blossoms along the arch
    for (let i = 0; i < 16; i++) {
        const a = Math.PI * (i + 0.5) / 16;
        const px = x + Math.cos(a) * width / 2, py = height + Math.sin(a) * width / 2 * 0.62;
        leafData.push([px, py, z, 0.17]);
        if (i % 2) bloomData[i % 4].push([px, py + 0.05, z + 0.06, 0.1]);
    }
}
function signTexture(title, subtitle) {
    return canvasTexture(768, 288, (g, w, h) => {
        const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#5b3563'); bg.addColorStop(1, '#3d2145');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#d9b06a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
        g.lineWidth = 2; g.strokeRect(28, 28, w - 56, h - 56);
        g.fillStyle = '#fbeedd'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 86px Georgia, serif'; g.fillText(title, w / 2, h * 0.42, w - 100);
        g.fillStyle = '#ffebf7'; g.font = '600 48px system-ui, sans-serif'; g.fillText(subtitle, w / 2, h * 0.73, w - 100);
    });
}
function signBoard(title, subtitle, x, y, z, width = 2.5, rotY = 0) {
    const tex = signTexture(title, subtitle);
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 });
    const sign = add(rbox, m, x, y, z, width, width * 0.375, 0.1);
    sign.rotation.y = rotY;
    return sign;
}

// ======================================================================
//  ARRIVAL TERRACE
// ======================================================================
const roomZ = -70;
island(0, 3.0, 8.2, 10.5, 8);
const terracePaving = add(new THREE.PlaneGeometry(3.2, 12.4), std(0xffffff, 0.8, 0, { map: pavingTexture([1.6, 6.2]) }), 0, 0.012, 4.2, 1, 1, 1, { cast: false });
terracePaving.rotation.x = -Math.PI / 2;
for (const x of [-1.62, 1.62]) soft(stone, x, 0.04, 4.2, 0.12, 0.08, 12.4);
// gate
for (const x of [-2.1, 2.1]) {
    soft(stone, x, 1.5, -1, 0.5, 3.0, 0.62);
    soft(stoneWarm, x, 0.12, -1, 0.78, 0.24, 0.9);
    soft(stoneWarm, x, 3.08, -1, 0.7, 0.16, 0.8);
    blockCircle(x, -1, 0.5);
    flowerBed(x, 1.3, 0.8, 0.8, 16); lantern(x, 3.1, { light: true });
}
const arch = add(new THREE.TorusGeometry(2.1, 0.2, 16, 56, Math.PI), stone, 0, 3.0, -1, 1, 0.66, 1);
add(box, brass, 0, 3.0 + 2.1 * 0.66 + 0.1, -1, 0.34, 0.3, 0.7);
for (let i = 0; i < 26; i++) {
    const a = Math.PI * (i + 0.5) / 26, px = Math.cos(a) * 2.1, py = 3.0 + Math.sin(a) * 2.1 * 0.66;
    leafData.push([px, py, -1 + (i % 2 ? 0.17 : -0.17), 0.2]);
    if (i % 3 === 0) bloomData[(i / 3) % 4].push([px, py, -0.78, 0.13]);
}
{   // glowing portal
    const shape = new THREE.Shape();
    shape.moveTo(-1.9, 0); shape.lineTo(1.9, 0); shape.lineTo(1.9, 3.0);
    shape.absarc(0, 3.0, 1.9, 0, Math.PI, false); shape.lineTo(-1.9, 0);
    const portalMaterial = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { time: { value: 0 } },
        vertexShader: 'varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}',
        fragmentShader: `varying vec2 vUv; varying vec3 vPos; uniform float time;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = vPos.xy * 0.55; float t = time * 0.25;
          float v = n(p * 2.0 + vec2(0.0, -t * 2.0)) * 0.6 + n(p * 4.0 + vec2(t, -t * 3.0)) * 0.4;
          float edge = smoothstep(0.0, 0.55, 1.9 - abs(vPos.x)) * smoothstep(0.0, 0.7, vPos.y + 0.1);
          float arch = 1.0 - smoothstep(2.2, 4.9, length(vec2(vPos.x * 1.0, max(vPos.y - 3.0, 0.0)) * vec2(1.0, 1.0)) + max(vPos.y - 3.0, 0.0) * 0.0);
          vec3 c = mix(vec3(1.0, 0.72, 0.5), vec3(0.95, 0.55, 0.95), v) * (0.35 + v * 0.9);
          float a = edge * (0.14 + 0.26 * v) * (0.5 + 0.5 * smoothstep(3.2, 0.0, vPos.y));
          gl_FragColor = vec4(c * 0.9, a); }`,
    });
    var portal = new THREE.Mesh(new THREE.ShapeGeometry(shape, 40), portalMaterial);
    portal.position.set(0, 0, -1);
    scene.add(portal);
    window.__portalMaterial = portalMaterial;
}
signBoard('Garden Gate', 'Step through to explore', 0, 5.55, -1, 3.0);
add(cylinder, brass, -1.1, 5.0, -1, 0.025, 0.55, 0.025); add(cylinder, brass, 1.1, 5.0, -1, 0.025, 0.55, 0.025);
for (const x of [-6.6, 6.6]) {
    add(cylinder, lilacStone, x, -0.2, -1.2, 1.6, 0.4, 1.6, { cast: false });
    blossomTree(x, -1.2, 1.25, x < 0 ? [0, 1, 2] : [3, 0, 2]);
    blockCircle(x, -1.2, 0.55);
}
for (const [x, z] of [[-2.6, 7.5], [2.6, 7.5]]) { lantern(x, z, { light: false }); blockCircle(x, z, 0.3); }
planter(-3.4, 3.2); planter(3.4, 3.2); planter(-3.4, 9.0, 0.9); planter(3.4, 9.0, 0.9);
bench(-5.0, 5.4, Math.PI / 2 + 0.08); bench(5.0, 5.4, -Math.PI / 2 - 0.08);
add(new THREE.CylinderGeometry(1, 1, 1, 48), brass, 0, 0.02, 6.1, 1.7, 0.01, 1.7, { cast: false });
add(new THREE.CylinderGeometry(1, 1, 1, 48), std(0xc9aad6, 0.7), 0, 0.025, 6.1, 1.55, 0.01, 1.55, { cast: false });

// ======================================================================
//  COURTYARD
// ======================================================================
const HW = 13, HD = 13;
const galleryDepth = 8;
const courtyardBack = roomZ - HD - galleryDepth;                       // courtyard half width / half depth
island(0, roomZ - galleryDepth / 2, 20, 24, 10, { grassRepeat: 4 });
const plaza = add(new THREE.PlaneGeometry(HW * 2 - 0.6, HD * 2 - 0.6 + galleryDepth), std(0xffffff, 0.78, 0, { map: pavingTexture([13, 17]) }), 0, 0.014, roomZ - galleryDepth / 2, 1, 1, 1, { cast: false });
plaza.rotation.x = -Math.PI / 2;
for (const x of [-4.2, 4.2]) block(brass, x, 0.03, roomZ, 0.05, 0.02, HD * 2 - 0.6);
for (const x of [-HW + 0.3, HW - 0.3]) soft(stoneWarm, x, 0.1, roomZ - galleryDepth / 2, 0.35, 0.22, HD * 2 + galleryDepth);
for (const z of [roomZ + HD - 0.3, courtyardBack + 0.3]) soft(stoneWarm, 0, 0.1, z, HW * 2, 0.22, 0.35);
// low hedge walls (open at the entrance) and lamp posts
for (const x of [-HW - 0.3, HW + 0.3]) {
    add(rbox, hedgeMat, x, 0.75, roomZ - galleryDepth / 2, 0.95, 1.5, HD * 2 + 1.2 + galleryDepth);
    for (let i = 0; i < 12; i++) bloomData[i % 4].push([x + rr(-0.2, 0.2), 1.45 + rr(0, 0.1), roomZ + (i - 5.5) * 2.3 + rr(-0.3, 0.3), 0.26]);
}
const frontLen = HW + 0.8 - 3.4;
add(rbox, hedgeMat, -(3.4 + frontLen / 2), 0.75, roomZ + HD + 0.1, frontLen, 1.5, 0.95); add(rbox, hedgeMat, 3.4 + frontLen / 2, 0.75, roomZ + HD + 0.1, frontLen, 1.5, 0.95);
add(rbox, hedgeMat, 0, 0.75, courtyardBack - 0.9, HW * 2 + 1.8, 1.5, 0.95);
for (const [x, dz, l] of [[-11.6, 10.5, true], [11.6, 10.5, true], [-11.6, -10.5, true], [11.6, -10.5, true], [-11.6, 0, false], [11.6, 0, false]]) lampPost(x, roomZ + dz, { light: l });
// trees stand OUTSIDE the hedges so they never hide the signs
for (const x of [-HW - 3, HW + 3]) for (const dz of [-10, -3.5, 3.5, 10]) blossomTree(x, roomZ + dz, 1.15, (dz + x) % 2 ? [0, 1, 2] : [3, 0, 1]);
for (const x of [-9.6, -3.2, 3.2, 9.6]) arcade(x, courtyardBack + 0.1, 6.0, 3.9);
for (const [x, z] of [[-11.4, roomZ + 11.4], [11.4, roomZ + 11.4], [-11.4, roomZ - 10.6], [11.4, roomZ - 10.6]]) flowerBed(x, z, 1.8, 1.8, 26);
for (const [x, z] of [[-4.2, roomZ + 11.5], [4.2, roomZ + 11.5]]) { planter(x - 1.2, z, 0.9); planter(x + 1.2, z, 0.9); }

// fountain (centrepiece)
const fountain = new THREE.Group();
fountain.position.set(0, 0, roomZ + 4);
scene.add(fountain);
const waterGeo = new THREE.CircleGeometry(1.5, 48, 0, Math.PI * 2);
{
    add(cylinder, stoneWarm, 0, 0.3, 0, 1.9, 0.6, 1.9, { parent: fountain });
    add(new THREE.TorusGeometry(1.9, 0.14, 12, 64), stone, 0, 0.62, 0, 1, 1, 1, { parent: fountain }).rotation.x = Math.PI / 2;
    const water = add(waterGeo, std(0x2f9bc4, 0.05, 0.2, { emissive: 0x1d6f9a, emissiveIntensity: 0.35 }), 0, 0.625, 0, 1.2, 1, 1.2, { parent: fountain, cast: false });
    water.rotation.x = -Math.PI / 2;
    add(cylinder, stone, 0, 1.15, 0, 0.2, 1.15, 0.2, { parent: fountain });
    add(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), stone, 0, 1.28, 0, 0.7, 0.28, 0.7, { parent: fountain });
    add(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), stone, 0, 1.98, 0, 0.38, 0.2, 0.38, { parent: fountain });
    add(sphere, brass, 0, 2.28, 0, 0.12, 0.12, 0.12, { parent: fountain });
    blockCircle(0, roomZ + 4, 2.05);
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        add(rbox, brass, Math.cos(a) * 1.9, 0.67, Math.sin(a) * 1.9, 0.12, 0.08, 0.34, { parent: fountain }).rotation.y = -a;
    }
}
pointLight(0, 2.8, roomZ + 4, 0x9ad8ff, 8, 9);
const droplets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd8f6ff }), 90);
fountain.add(droplets);
const dropPhase = Array.from({ length: 90 }, (_, i) => ({ t: rng(), angle: rng() * 6.28, speed: 0.8 + rng() * 0.5, tier: i % 3 }));

// stops
const cinemaZ = roomZ - 5.9;
const stops = [
    { x: -8.5, z: roomZ + 7, title: 'About & Skills', sub: 'Who I am · what I do', copy: '' },
    { x: 8.5, z: roomZ + 7, title: 'Project Gallery', sub: 'Six gameplay videos', copy: '' },
    { x: -8.5, z: roomZ - 4, title: 'Ask Me', sub: 'The portfolio chatbot', copy: 'Ask about my work, skills or current FYP.' },
    { x: 8.5, z: roomZ - 4, title: 'Contact', sub: 'Let’s build something', copy: 'Get in touch by email or connect on LinkedIn.' },
    { x: -9.3, z: courtyardBack + 4.4, title: 'Robot Garden', sub: 'A coding mini-game', copy: 'Program a route with the arrows, then press Run. Avoid the rocks.' },
    { x: 9.3, z: courtyardBack + 4.4, title: 'Build a Tulip', sub: 'Collect blocks around the garden', copy: 'Walk over glowing blocks to collect them, then fill the tulip blueprint.' },
    { x: 0, z: courtyardBack + 4.1, title: 'Achievements', sub: 'Awards, certificates & milestones', copy: 'Choose a pin to see it up close.' },
    { x: 0, z: cinemaZ + 1.5, title: 'Garden Cinema', sub: 'The promotional film', copy: 'Play the promotional film on the garden screen.' },
];
const ringTexture = canvasTexture(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,214,150,0)'); r.addColorStop(0.7, 'rgba(255,214,150,.55)'); r.addColorStop(0.86, 'rgba(255,236,200,.95)'); r.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
});
for (const stop of stops) {
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.0), new THREE.MeshBasicMaterial({ map: ringTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(stop.x, 0.035, stop.z); scene.add(ring);
    stop.ring = ring;
    if (stop.x === 0 || ['Robot Garden','Build a Tulip'].includes(stop.title)) continue;
    // kiosk: plinth + signboard on posts + lantern + planter + arcade backdrop
    add(cylinder, stoneWarm, stop.x, 0.1, stop.z - 1.3, 2.3, 0.2, 1.3);
    for (const sx of [-1.45, 1.45]) post(rosewood, stop.x + sx, 1.6, stop.z - 1.4, 0.08, 3.2);
    signBoard(stop.title, stop.sub, stop.x, 2.75, stop.z - 1.4, 3.2);
    planter(stop.x - 2.1, stop.z - 0.8); lantern(stop.x + 2.1, stop.z - 0.8, { light: false });
    blockCircle(stop.x - 2.1, stop.z - 0.8, 0.5); blockCircle(stop.x + 2.1, stop.z - 0.8, 0.3);
}
const robotStop = stops.find(s => s.title === 'Robot Garden');
const gameSurface = document.createElement('canvas');
gameSurface.width = 900; gameSurface.height = 900;
const gameBrush = gameSurface.getContext('2d');
const gameMap = new THREE.CanvasTexture(gameSurface);
gameMap.colorSpace = THREE.SRGBColorSpace;
const gameScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.15,2.15),
    new THREE.MeshBasicMaterial({map:gameMap, side:THREE.DoubleSide,toneMapped:false}));
gameScreen.name='Robot Garden floating display';
gameScreen.position.set(robotStop.x,2.37,robotStop.z-1.3);
gameScreen.rotation.order='YXZ';
gameScreen.rotation.y=THREE.MathUtils.degToRad(27);
gameScreen.rotation.x=THREE.MathUtils.degToRad(-9);
const screenNormal=new THREE.Vector3(0,0,1).applyQuaternion(gameScreen.quaternion);
scene.add(gameScreen);
const puzzle=document.createElement('div');
startRobotGarden(puzzle);
let focusedGame=false, targets=[];
function drawGame(){
    const g=gameBrush;
    g.fillStyle='#38223e';g.fillRect(0,0,900,900);
    g.strokeStyle='#dfb581';g.lineWidth=7;g.strokeRect(12,12,876,876);
    g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff0db';
    g.font='bold 76px Georgia';g.fillText('Robot Garden',450,86);
    g.font='34px system-ui';g.fillStyle='#f2c5df';
    const message=puzzle.querySelector('p').textContent;
    g.fillText(focusedGame?message:'Guide the robot to the blossom',450,170,825);
    [...puzzle.querySelector('.robot-board').children].forEach((cell,i)=>{
        const x=219+(i%4)*118,y=222+Math.floor(i/4)*112;
        g.fillStyle=(i+Math.floor(i/4))%2?'#755273':'#664661';g.fillRect(x,y,106,101);
        g.fillStyle='#fbe1d5';g.font='54px "Segoe UI Emoji",system-ui';g.fillText(cell.textContent,x+53,y+51);
    });
    targets=[];
    function key(label,x,y,w,action){
        g.fillStyle='#ebcedd';g.fillRect(x,y,w,74);g.fillStyle='#432a46';
        g.font='bold 37px system-ui';g.fillText(label,x+w/2,y+37,w-12);
        targets.push({x,y,w,action});
    }
    if(focusedGame){
        const buttons=[...puzzle.querySelectorAll('button')];
        const w=Math.min(225,Math.floor(812/buttons.length)-10);
        buttons.forEach((b,i)=>key(b.textContent,450-buttons.length*(w+10)/2+i*(w+10),699,w,()=>{b.click();drawGame()}));
        key('Leave',340,792,220,()=>setGameFocus(false));
    }else key('Play',324,728,252,()=>setGameFocus(true));
    gameMap.needsUpdate=true;
}
function setGameFocus(on){
    clearMovement();focusedGame=on;
    document.body.classList.toggle('in-game',on);stick.hidden=on;
    if(on){bubble.hidden=true;near.hidden=true;}
    drawGame();
}
drawGame();

// cinema pavilion

const screenTexture = canvasTexture(1024, 576, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#2c1740'); bg.addColorStop(0.5, '#6b2f6d'); bg.addColorStop(1, '#e8896f');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(255,${200 + rng() * 50 | 0},${220},${rng() * 0.5})`; g.beginPath(); g.arc(rng() * w, rng() * h * 0.7, rng() * 2.2, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(w / 2, h * 0.43, 74, 0, 7); g.fill();
    g.fillStyle = '#fff4e6'; g.beginPath(); g.moveTo(w / 2 - 22, h * 0.43 - 34); g.lineTo(w / 2 + 40, h * 0.43); g.lineTo(w / 2 - 22, h * 0.43 + 34); g.fill();
    g.fillStyle = '#fff4e6'; g.textAlign = 'center'; g.font = 'bold 82px Georgia, serif'; g.fillText('Garden Cinema', w / 2, h * 0.78);
    g.font = '600 44px system-ui, sans-serif'; g.fillStyle = '#ffd3e3'; g.fillText('Play the promotional film', w / 2, h * 0.91, w - 64);
});
const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, color: 0xffffff });
add(rbox, screenMaterial, 0, 1.95, cinemaZ + 0.08, 5.2, 2.92, 0.06, { cast: false });
add(rbox, plum, 0, 1.95, cinemaZ - 0.02, 5.7, 3.4, 0.16);
soft(brass, 0, 3.7, cinemaZ - 0.02, 5.9, 0.12, 0.3);
for (const x of [-2.95, 2.95]) { soft(rosewood, x, 1.8, cinemaZ - 0.05, 0.3, 3.6, 0.4); soft(brass, x, 0.12, cinemaZ - 0.05, 0.55, 0.24, 0.6); blockCircle(x, cinemaZ, 0.35); }
block(stoneWarm, 0, 0.18, cinemaZ + 0.1, 6.4, 0.36, 1.0);
pointLight(0, 2.4, cinemaZ + 1.6, 0xffa6c8, 9, 11);
bench(-4.6, roomZ - 4.4, Math.PI + 0.1); bench(4.6, roomZ - 4.4, Math.PI - 0.1);
{   // string lights over the cinema
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 4 }), 46);
    const o = new THREE.Object3D();
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-4.2, 4.5, cinemaZ + 0.6), new THREE.Vector3(0, 3.55, cinemaZ + 1.2), new THREE.Vector3(4.2, 4.5, cinemaZ + 0.6));
    for (let i = 0; i < 23; i++) { const p = curve.getPoint(i / 22); o.position.copy(p); o.updateMatrix(); bulbs.setMatrixAt(i, o.matrix); }
    const curve2 = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-4.2, 4.5, cinemaZ + 0.6), new THREE.Vector3(0, 3.8, cinemaZ + 2.6), new THREE.Vector3(4.2, 4.5, cinemaZ + 0.6));
    for (let i = 0; i < 23; i++) { const p = curve2.getPoint(i / 22); o.position.copy(p); o.updateMatrix(); bulbs.setMatrixAt(23 + i, o.matrix); }
    scene.add(bulbs);
    for (const x of [-4.2, 4.2]) post(std(0x3d2b44, 0.5, 0.6), x, 2.25, cinemaZ + 0.6, 0.05, 4.5);
}
// Walk around the cinema to reach the exhibition terrace.
const achievementBoard = createPinboardTexture(THREE);
const boardZ = courtyardBack + 1.3;
const boardFrame = std(0x75466d, 0.72);
soft(boardFrame, 0, 3.15, boardZ, 10.6, 5.25, 0.34);
add(new THREE.PlaneGeometry(10.2, 4.98), new THREE.MeshBasicMaterial({
    map: achievementBoard.texture, toneMapped: false,
}), 0, 3.15, boardZ + 0.18, 1, 1, 1, {cast:false, receive:false});
for (const x of [-4.3, 4.3]) {
    post(rosewood, x, 1.55, boardZ, 0.15, 3.1);
    blockCircle(x, boardZ, 0.28);
}
for (const x of [-6.6, 6.6]) {
    lampPost(x, boardZ + 1.55, {light:true});
    planter(x, boardZ + 3.35);
    blockCircle(x, boardZ + 3.35, 0.55);
}

for (const x of [-22, -14, -6, 6, 14, 22]) blossomTree(x, courtyardBack - 5, 1.6, x % 3 ? [0, 1, 2] : [3, 0, 2]);
finishVegetation();

// ------------------------------------------------------------------ distant scenery
for (const [x, y, z, s] of [[-17, -3, -6, 1], [19, -5, -18, 1.3], [-24, -4, -40, 1.5], [26, -6, -58, 1.2], [-28, -5, -86, 1.4], [27, -3, -96, 1.1], [-14, -9, 14, 1.2], [15, -8, 10, 0.9]]) {
    island(x, z, 5 * s, 4.5 * s, 7 * s, { y });
}
{   // second batch of blossom trees on the small islands (separate instanced pass)
    const extra = [[-17, -3, -6], [19, -5, -18], [-24, -4, -40], [26, -6, -58], [-28, -5, -86], [27, -3, -96]];
    const jitter = new THREE.IcosahedronGeometry(1, 2);
    const o = new THREE.Object3D();
    const mesh = new THREE.InstancedMesh(jitter, petalMats[0], extra.length * 16);
    let n = 0;
    extra.forEach(([x, y, z], k) => {
        const trunk = add(cylinder, std(0x6b4a55, 0.9), x, y + 1.2, z, 0.14, 2.4, 0.14);
        for (let i = 0; i < 16; i++) { const a = i * 2.4, r = Math.sqrt(i / 16) * 1.5; o.position.set(x + Math.cos(a) * r, y + 2.6 + (1 - r / 1.5) * 0.8, z + Math.sin(a) * r); o.scale.setScalar(rr(0.5, 0.8)); o.updateMatrix(); mesh.setMatrixAt(n++, o.matrix); }
    });
    scene.add(mesh);
}
// cloud sea
const clouds = [];
for (let i = 0; i < 110; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTexture, color: i % 3 ? 0xf7d9ea : 0xeab9dc, transparent: true, opacity: rr(0.45, 0.85), depthWrite: false, fog: false });
    const sprite = new THREE.Sprite(m);
    const s = rr(26, 56);
    sprite.scale.set(s, s * 0.55, 1);
    sprite.position.set(rr(-90, 90), rr(-15, -8), rr(25, -150));
    sprite.userData = { speed: rr(0.2, 0.6), base: sprite.position.x };
    scene.add(sprite); clouds.push(sprite);
}
for (let i = 0; i < 16; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, color: 0xffd9e8, transparent: true, opacity: rr(0.35, 0.6), depthWrite: false, fog: false }));
    const s = rr(60, 110);
    sprite.scale.set(s, s * 0.4, 1);
    sprite.position.set(rr(-200, 200), rr(14, 45), -rr(120, 260));
    sprite.userData = { speed: rr(0.1, 0.3), base: sprite.position.x };
    scene.add(sprite); clouds.push(sprite);
}

for (const cloud of clouds) cloud.userData.dayColor = cloud.material.color.getHex();

// ------------------------------------------------------------------ fireflies & petals
function particles(count, area, { color = 0xffe6a3, size = 0.25, height = [0.4, 4.5], opacity = 0.9 } = {}) {
    const geo = new THREE.BufferGeometry();
    const base = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        base[i * 3] = area.x + rr(-area.w, area.w); base[i * 3 + 1] = rr(height[0], height[1]); base[i * 3 + 2] = area.z + rr(-area.d, area.d); seed[i] = rng() * 6.28;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) }, size: { value: size * 100 * DPR } },
        vertexShader: `attribute float seed; uniform float time; uniform float size; varying float vA;
        void main(){ vec3 p = position; p.x += sin(time * 0.5 + seed * 3.0) * 0.9; p.y += sin(time * 0.7 + seed * 5.0) * 0.5; p.z += cos(time * 0.4 + seed * 2.0) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = size / -mv.z * (0.7 + 0.3 * sin(time * 2.0 + seed * 9.0)); vA = 0.5 + 0.5 * sin(time * 1.6 + seed * 11.0); }`,
        fragmentShader: `uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(color, a * a * vA * ${opacity.toFixed(2)}); }`,
    });
    const points = new THREE.Points(geo, m);
    points.frustumCulled = false;
    scene.add(points);
    return m;
}
const fireflyMats = [
    particles(220, { x: 0, z: roomZ, w: 16, d: 16 }),
    particles(70, { x: 0, z: 3, w: 6.5, d: 8 }, { height: [0.5, 3.2] }),
    particles(100, { x: 0, z: roomZ, w: 16, d: 16 }, { color: 0xffb8dc, size: 0.32, height: [1.5, 6] }),
];
const nightFireflies = [
    particles(100, {x:0,z:roomZ,w:12,d:12}, {color:0xffd887,size:0.43,height:[0.5,3.1]}),
    particles(44, {x:0,z:3,w:4,d:6}, {color:0xffdb9a,size:0.4,height:[0.6,2.8]}),
];
const nightFill = new THREE.PointLight(0xffe0be, 12, 8);
scene.add(nightFill);
themePicker.addEventListener('change', applyGardenTheme);
applyGardenTheme();


// ======================================================================
//  AVATAR
// ======================================================================
const avatar = buildMaha();
scene.add(avatar);
const part = (name) => avatar.getObjectByName(name);
const body = part('Body'), head = part('Head');
const arms = [part('ArmL'), part('ArmR')], legs = [part('LegL'), part('LegR')];
const eyes = [part('EyeL'), part('EyeR')];
avatar.position.z = 2.6;

// ------------------------------------------------------------------ post-processing
const target = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.setPixelRatio(DPR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ======================================================================
//  AUDIO
// ======================================================================
const audio = new GardenAudio();

const promo = document.createElement('video');
promo.playsInline = true;
promo.preload = 'none';
const promoTexture = new THREE.VideoTexture(promo);
promoTexture.colorSpace = THREE.SRGBColorSpace;
const promoPlane = add(new THREE.PlaneGeometry(5.2, 2.925), new THREE.MeshBasicMaterial({
    map: promoTexture, toneMapped: false,
}), 0, 1.95, cinemaZ + .132, 1,1,1, {cast:false,receive:false});
promoPlane.visible = false;
const cinemaControls = byId('cinema-controls');
const promoPlay = byId('promo-play');
const promoStatus = byId('promo-status');
let watchingCinema = false;
let restoreGardenAudio = false;
async function playPromo() {
    if (!promo.hasAttribute('src')) promo.src = './MahaKhaliq_Promo.mp4?fit=1';
    promoStatus.textContent = 'Loading film…';
    try {
        await promo.play();
    } catch {
        if (!watchingCinema) return;
        promoStatus.textContent = 'Unable to load the film. Tap Play to retry.';
    }
}
function enterCinema() {
    clearMovement();
    watchingCinema = true;
    avatar.visible = false;
    // The portrait camera moves behind the fountain to frame the full screen.
    // Hide the fountain for the viewing state so it cannot cover the film.
    fountain.visible = false;
    stick.hidden = true;
    near.hidden = true;
    bubble.hidden = true;
    cinemaControls.hidden = false;
    document.body.classList.add('watching-cinema');
    promoPlay.focus();
    playPromo();
}
function leaveCinema() {
    watchingCinema = false;
    avatar.visible = true;
    fountain.visible = true;
    promo.pause();
    cinemaControls.hidden = true;
    document.body.classList.remove('watching-cinema');
    stick.hidden = false;
}
promo.addEventListener('playing', () => {
    if (!watchingCinema) { promo.pause(); return; }
    promoPlane.visible = true;
    promoStatus.textContent = '';
    promoPlay.textContent = 'Pause';
    if (audio.enabled) {
        restoreGardenAudio = true;
        audio.setEnabled(false);
    }
});
function finishPromo() {
    promoPlay.textContent = 'Play';
    if (restoreGardenAudio) {
        audio.setEnabled(true);
        restoreGardenAudio = false;
    }
}
promo.addEventListener('pause', finishPromo);
promo.addEventListener('ended', finishPromo);
promoPlay.onclick = () => { if (promo.paused) playPromo(); else promo.pause(); };
byId('promo-leave').onclick = leaveCinema;

const flowerStop = stops.find(stop => stop.title === 'Build a Tulip');
soft(stoneWarm,flowerStop.x,.24,flowerStop.z-1.7,2.5,.48,1.8);
soft(brass,flowerStop.x,.48,flowerStop.z-1.7,2.45,.08,1.76);
blockCircle(flowerStop.x,flowerStop.z-1.7,.67);
signBoard('Build a Tulip','Collect blocks around the garden',flowerStop.x,3.83,flowerStop.z-1.76,2.95);
const flowerGame = createFlowerGame(THREE,scene,flowerStop.x,flowerStop.z-1.7,roomZ,()=>audio.chime('ui'));
async function startAudio() {
    try {
        if (await audio.start()) audio.setEnabled(true);
    } catch (error) {
        console.warn('Audio could not start.', error);
    }
}

// ------------------------------------------------------------------ Maha speaks
const bubble = byId('bubble'), bubbleText = byId('bubble-text');
const mouth = avatar.getObjectByName('MouthOpen');
let talking = false, speechRun = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function say(lines, { hideAfter = true, gap = 400 } = {}) {
    const run = ++speechRun;
    bubble.hidden = false; bubble.style.opacity = 1;
    for (const [text, voice] of lines) {
        if (run !== speechRun) return;
        bubbleText.textContent = text;
        talking = true;
        const seconds = voice ? await audio.playVoice(voice) : 0;
        await sleep(seconds ? seconds * 1000 : Math.max(2200, text.length * 70));
        talking = false;
        await sleep(gap);
    }
    if (run === speechRun && hideAfter) { bubble.style.opacity = 0; setTimeout(() => { if (run === speechRun) bubble.hidden = true; }, 400); }
}

// ------------------------------------------------------------------ input & ui
const keys = new Set();
const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const joystick = new THREE.Vector2();
const stick = byId('stick'), knob = byId('knob'), near = byId('near'), panel = byId('panel');
let pointer = null, playing = false, currentStop = null, inside = false, transitioning = false;
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
const destination = new THREE.Vector3();
let followingTap=false, jumpVelocity=0, takeoff=0, landing=0;
const marker=new THREE.Mesh(new THREE.RingGeometry(.19,.27,32),new THREE.MeshBasicMaterial({color:0xffe2ad,side:THREE.DoubleSide}));
marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker);
function cancelTap(){ followingTap=false;marker.visible=false; }
renderer.domElement.addEventListener('pointerdown',event=>{
    if(!playing || transitioning || watchingCinema || panel.open || event.button!==0)return;
    const box=renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2),camera);
    const hit = inside && ray.intersectObject(gameScreen)[0];
    if(hit){
        if(!focusedGame){setGameFocus(true);return;}
        const x=hit.uv.x*900,y=(1-hit.uv.y)*900;
        targets.find(t=>x>=t.x && x<=t.x+t.w && y>=t.y && y<=t.y+74)?.action();
        return;
    }
    if(focusedGame)return;
    if(!ray.ray.intersectPlane(floorPlane,destination))return;
    destination.x=THREE.MathUtils.clamp(destination.x,inside?-HW+.7:-3.9,inside?HW-.7:3.9);
    destination.z=THREE.MathUtils.clamp(destination.z,inside?courtyardBack+.7:-1.5,inside?roomZ+HD-.4:9.6);
    followingTap=true;marker.position.set(destination.x,.055,destination.z);marker.visible=true;
});
function jump(){
    if (playing && !transitioning && !focusedGame && !watchingCinema && !panel.open &&
        avatar.position.y === 0 && !jumpVelocity && !takeoff && !landing) {
        takeoff = .11;
    }
}
byId('jump').onclick=jump;

function clearMovement() { cancelTap();
    keys.clear();
    const captured = pointer;
    pointer = null;
    if (captured !== null && stick.hasPointerCapture(captured)) stick.releasePointerCapture(captured);
    joystick.set(0, 0);
    knob.style.transform = '';
}
function openCueDeck(host, templateId) {
    host.append(byId(templateId).content.cloneNode(true));
    const deck = host.querySelector('.about-deck');
    const cards = [...deck.querySelectorAll('.about-flash')];
    const back = deck.querySelector('[data-back]');
    const next = deck.querySelector('[data-next]');
    const count = deck.querySelector('[data-count]');
    for (const video of deck.querySelectorAll('video')) {
        video.addEventListener('play', () => {
            if (!panel.open || video.closest('article').hidden) { video.pause(); return; }
            if (audio.enabled) {
                video.dataset.restoreAudio = 'true';
                audio.setEnabled(false);
            }
        });
        const restoreMusic = () => {
            if (video.dataset.restoreAudio) {
                delete video.dataset.restoreAudio;
                audio.setEnabled(true);
            }
        };
        video.addEventListener('pause', restoreMusic);
        video.addEventListener('ended', restoreMusic);
    }
    let index = 0;
    function show(target) {
        const nextIndex = THREE.MathUtils.clamp(target, 0, cards.length - 1);
        if (nextIndex !== index) cards[index].querySelector('video')?.pause();
        index = nextIndex;
        const video = cards[index].querySelector('video');
        if (video && !video.hasAttribute('src')) {
            video.poster = video.dataset.poster;
            video.src = video.dataset.src;
        }
        cards.forEach((card, i) => { card.hidden = i !== index; });
        back.disabled = index === 0;
        next.textContent = index === cards.length - 1 ? 'Start over' : 'Next';
        count.textContent = (index + 1) + ' / ' + cards.length;
    }
    back.onclick = () => show(index - 1);
    next.onclick = () => show((index + 1) % cards.length);
    let touch;
    deck.addEventListener('touchstart', ({changedTouches,target}) => {
        touch = target.closest('video') ? null : changedTouches[0];
    }, {passive:true});
    deck.addEventListener('touchend', ({changedTouches}) => {
        if (!touch) return;
        const dx = changedTouches[0].clientX - touch.clientX;
        const dy = changedTouches[0].clientY - touch.clientY;
        touch = null;
        if (Math.abs(dx) > 55 && Math.abs(dx) > 1.5 * Math.abs(dy)) show(index - Math.sign(dx));
    }, {passive:true});
    deck.addEventListener('touchcancel', () => { touch = null; });
    show(0);
}

function openStop() {
    if (!currentStop || panel.open) return;
    if(currentStop===robotStop){setGameFocus(true);return;}
    if(currentStop.title==='Garden Cinema'){enterCinema();return;}
    clearMovement();
    stick.hidden = true;
    byId('stop-title').textContent = currentStop.title;
    byId('stop-copy').textContent = currentStop.copy;
    byId('stop-copy').hidden = !currentStop.copy;
    panel.classList.toggle('project-gallery', currentStop.title === 'Project Gallery');
    const game = byId('game'); game.replaceChildren();
    if (currentStop === flowerStop) flowerGame.open(game);
    if (currentStop.title === 'Achievements') openAchievementBoard(game);
    if (currentStop.title === 'About & Skills') openCueDeck(game, 'about-cards');
    if (currentStop.title === 'Project Gallery') openCueDeck(game, 'project-cards');
    if (currentStop.title === 'Contact') game.append(byId('contact-links').content.cloneNode(true));
    if(currentStop.title==='Ask Me')openPortfolioChat(game);

    panel.showModal();
    audio.chime('open');
}
async function begin() {
    byId('start').disabled = true;
    await startAudio();
    byId('garden-loading').hidden = true;
    document.body.classList.add('greeting');
    await say([['Hi! I’m Maha. Welcome to my portfolio.', 'vo1']], { hideAfter: false, gap: 180 });
    bubble.hidden = true;
    bubble.style.transform = '';
    document.body.classList.remove('greeting');
    document.body.classList.add('playing');
    playing = true;
    stick.hidden = false;
    const instructions = matchMedia('(any-pointer:coarse)').matches
        ? ['Tap the ground to walk, or drag the joystick. Tap Jump to hop.', null]
        : ['Use WASD or arrows to walk. Space to jump.', 'vo2'];
    say([instructions, ['Walk through the glowing arch to enter my garden.', 'vo3']]);
}
byId('start').addEventListener('click', begin, { once: true });
near.addEventListener('click', openStop);
panel.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'contact-form') return;
    event.preventDefault();
    const status = form.querySelector('[data-contact-status]');
    const submit = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    status.textContent = 'Sending your message…';
    status.dataset.state = 'pending';
    submit.disabled = true;
    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Your message could not be sent. Please try again.');
        form.reset();
        status.textContent = 'Thanks! Your message was sent successfully.';
        status.dataset.state = 'success';
    } catch (error) {
        status.textContent = error.message || 'Your message could not be sent. Please try again.';
        status.dataset.state = 'error';
    } finally {
        submit.disabled = false;
    }
});

panel.addEventListener('close', () => {
    panel.querySelectorAll('video').forEach(video => video.pause());
    stick.hidden = false;
});
window.addEventListener('keydown', (event) => {
    if (!playing || panel.open || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if(watchingCinema){
        if(key==='escape'||key==='e'){event.preventDefault();leaveCinema();}
        return;
    }
    if(focusedGame){
        if(key==='escape'||key==='e'){event.preventDefault();setGameFocus(false);}
        const index=['arrowup','arrowright','arrowdown','arrowleft'].indexOf(key);
        if(index>=0){event.preventDefault();if(!event.repeat && puzzle.querySelectorAll('button').length>1)targets[index]?.action();}
        if(key==='enter'&&!event.repeat){event.preventDefault();const b=puzzle.querySelectorAll('button');b[b.length-1].click();drawGame();}
        return;
    }
    if (key === ' ' && !event.target.closest?.('button')) { event.preventDefault(); if (!event.repeat) jump(); }
    if (movementKeys.has(key)) { event.preventDefault(); keys.add(key); }
    if (key === 'e' && !event.repeat) openStop();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', clearMovement);
function updateStick(event) {
    if (event.pointerId !== pointer) return;
    const bounds = stick.getBoundingClientRect();
    joystick.set((event.clientX - bounds.left - bounds.width / 2) / 34, (event.clientY - bounds.top - bounds.height / 2) / 34).clampLength(0, 1);
    knob.style.transform = 'translate(' + joystick.x * 34 + 'px,' + joystick.y * 34 + 'px)';
}
stick.addEventListener('pointerdown', (event) => { if (pointer !== null) return; pointer = event.pointerId; stick.setPointerCapture(pointer); updateStick(event); });
stick.addEventListener('pointermove', updateStick);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, (event) => { if (event.pointerId === pointer) clearMovement(); });
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
});

function enterGarden() {
    transitioning = true; clearMovement(); jumpVelocity=takeoff=landing=0;avatar.position.y=0;
    const veil = byId('portal');
    veil.classList.add('active');
    audio.chime('portal');
    setTimeout(() => {
        inside = true;
        achievementBoard.load();
        avatar.position.set(0, 0, roomZ + 11.3);
        avatar.rotation.y = Math.PI;
        camera.position.set(0, 6, roomZ + 18.5);
        cameraFocus.set(0, 1, roomZ + 8.5);
        audio.setZone('inside');
        say([['This is my courtyard.', 'vo4'], ['Walk up to a sign and press E to open it.', 'vo5']]);
        veil.classList.remove('active');
        transitioning = false;
    }, 900);
}

// ======================================================================
//  LOOP
// ======================================================================
const direction = new THREE.Vector2();
const targetCamera = new THREE.Vector3();
const cameraFocus = new THREE.Vector3(0, 1.33, 2.72);
const targetFocus = new THREE.Vector3();
const clock = new THREE.Clock();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const dummy = new THREE.Object3D();
let time = 0, gait = 0, stepTimer = 0, stepSide = 0;
camera.position.set(0.15, 1.56, avatar.position.z + 1.9);
const isPaved = (x, z) => inside ? Math.abs(x) < HW - 0.4 && z > courtyardBack + 0.4 && z < roomZ + HD - 0.4 : Math.abs(x) < 1.6;

let firstFrame = true;
renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    const forward = keys.has('w') || keys.has('arrowup'), back = keys.has('s') || keys.has('arrowdown');
    const left = keys.has('a') || keys.has('arrowleft'), right = keys.has('d') || keys.has('arrowright');
    direction.set(Number(right) - Number(left), Number(back) - Number(forward)).add(joystick).clampLength(0, 1);
    const pos = avatar.position;
    if (direction.lengthSq() > .012) cancelTap();
    if (followingTap) {
        direction.set(destination.x-pos.x,destination.z-pos.z);
        if(direction.length()<.12) { cancelTap();direction.set(0,0); }
        else direction.normalize();
    }
    if (takeoff > 0) {
        takeoff = Math.max(0,takeoff-dt);
        if (!takeoff) { jumpVelocity = 5.3; landing = 0; }
    }
    landing = Math.max(0,landing-dt);
    if (jumpVelocity || pos.y>0) {
        jumpVelocity-=14*dt;
        pos.y=Math.max(0,pos.y+jumpVelocity*dt);
        if(pos.y===0){jumpVelocity=0;landing=.19;audio.step(isPaved(pos.x,pos.z)?'stone':'grass');}
    }
    const px = pos.x, pz = pos.z;
    if (playing && !transitioning && !watchingCinema && !panel.open && direction.lengthSq() > 0.012) {
        pos.x = THREE.MathUtils.clamp(pos.x + direction.x * dt * 4, inside ? -(HW - 0.7) : -3.9, inside ? HW - 0.7 : 3.9);
        pos.z = THREE.MathUtils.clamp(pos.z + direction.y * dt * 4, inside ? courtyardBack + 0.7 : -1.5, inside ? roomZ + HD - 0.4 : 9.6);
        for (const o of obstacles) {
            const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = o.r + 0.28;
            if (d < min && d > 0.0001) { pos.x = o.x + dx / d * min; pos.z = o.z + dz / d * min; }
        }
        const heading = Math.atan2(direction.x, direction.y);
        const difference = heading - avatar.rotation.y;
        avatar.rotation.y += Math.atan2(Math.sin(difference), Math.cos(difference)) * (1 - Math.exp(-13 * dt));
    }
    if (!inside && !transitioning && playing && pos.z < -0.7 && Math.abs(pos.x) < 1.8) enterGarden();
    const walking = Math.hypot(pos.x - px, pos.z - pz) > 0.0001;
    if (followingTap && Math.hypot(pos.x-px,pos.z-pz)<dt*.1) cancelTap();
    if (walking && pos.y===0) {
        gait += dt * 10;
        stepTimer -= dt;
        if (stepTimer <= 0) { audio.step(isPaved(pos.x, pos.z) ? 'stone' : 'grass'); stepTimer = 0.31; }
    } else stepTimer = 0;
    if (inside && !panel.open && !watchingCinema) flowerGame.tick(pos,time,!reduceMotion.matches);
    const swing = walking ? Math.sin(gait) * 0.5 : 0;
    const airborne = pos.y > 0;
    const crouch = takeoff > 0 ? 1-takeoff/.11 : landing/.19;
    const tuck = airborne ? THREE.MathUtils.clamp(pos.y/.84,0,1) : 0;
    const ease = 1 - Math.exp(-16 * dt);
    for (let i = 0; i < 2; i++) {
        const factor = i === 0 ? 1 : -1;
        const legPose = airborne ? -(i === 0 ? .43 : .23)*tuck : crouch > 0 ? -.16*crouch : swing*factor;
        legs[i].rotation.x = THREE.MathUtils.lerp(legs[i].rotation.x, legPose, ease);
        legs[i].scale.y = THREE.MathUtils.lerp(legs[i].scale.y, 1-.12*tuck-.18*crouch, ease);
        const armPose = airborne ? -.7-.6*tuck : crouch > 0 ? .4*crouch : -swing*factor*.65;
        arms[i].rotation.x = THREE.MathUtils.lerp(arms[i].rotation.x, armPose, ease);
    }
    const waving = !playing && !reduceMotion.matches;
    arms[0].rotation.z = THREE.MathUtils.lerp(arms[0].rotation.z, waving ? -2.35 + Math.sin(time * 6) * 0.3 : airborne ? -.18 : -.08, ease);
    arms[1].rotation.z = THREE.MathUtils.lerp(arms[1].rotation.z, airborne ? .18 : .08, ease);
    const bob = reduceMotion.matches ? 0 : walking ? Math.abs(Math.sin(gait))*.035 : Math.sin(time*2.2)*.006;
    body.position.y = THREE.MathUtils.lerp(body.position.y, airborne ? .025*tuck : crouch > 0 ? -.14*crouch : bob, ease);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, airborne ? .11*tuck : crouch > 0 ? .18*crouch : walking ? .06 : 0, ease);
    head.rotation.z = waving ? Math.sin(time * 1.8) * 0.07 : Math.sin(time * 1.3) * 0.012;
    head.rotation.x = walking ? -0.03 : Math.sin(time * 0.9) * 0.01;
    const blink = time % 3.9 > 3.78 && !reduceMotion.matches;
    for (const eye of eyes) eye.scale.y = blink ? 0.1 : 1;

    // shadow light follows Maha
    sun.target.position.set(pos.x, 0, pos.z);
    sun.position.copy(sun.target.position).add(sunOffset);

    currentStop = inside ? stops.find(s => Math.hypot(s.x - pos.x, s.z - pos.z) < 2.05) : null;
    near.hidden = focusedGame || watchingCinema || !currentStop || panel.open;
    if (currentStop && near.dataset.stop !== currentStop.title) {
        const caption = document.createElement('span');
        caption.className = 'stop-detail';
        caption.textContent = currentStop.sub;
        near.replaceChildren(currentStop.title === 'Garden Cinema' ? 'Play film' : 'Open ' + currentStop.title, caption);
        near.dataset.stop = currentStop.title;
    }
    for (const s of stops) {
        const active = s === currentStop;
        s.ring.material.opacity = THREE.MathUtils.lerp(s.ring.material.opacity, active ? 1 : 0.4 + Math.sin(time * 2 + s.x) * 0.08, 0.1);
        s.ring.scale.setScalar(1 + (active ? 0.06 : 0) + Math.sin(time * 2 + s.x) * 0.02);
    }

    // ambience
    audio.setFountain(Math.hypot(pos.x, pos.z - (roomZ + 4)));
    if (window.__portalMaterial) window.__portalMaterial.uniforms.time.value = time;
    const particleTime = reduceMotion.matches ? 0 : time;
    for (const m of fireflyMats) m.uniforms.time.value = particleTime;
    if (nightFill.visible) {
        nightFill.position.set(pos.x + 1.4, pos.y + 2.9, pos.z + 1.9);
        for (const m of nightFireflies) m.uniforms.time.value = particleTime;
    }
    for (const c of clouds) { c.position.x = c.userData.base + Math.sin(time * 0.02 * c.userData.speed * 10) * 6; }
    for (let i = 0; i < dropPhase.length; i++) {
        const d = dropPhase[i];
        d.t = (d.t + dt * 0.55 * d.speed) % 1;
        const r = (0.25 + d.tier * 0.35) * d.t * (1.2 - d.t * 0.4), y = (d.tier === 0 ? 2.3 : d.tier === 1 ? 1.6 : 1.3) + Math.sin(d.t * Math.PI) * (0.5 - d.tier * 0.1) - d.t * d.t * (0.9 + d.tier * 0.4);
        dummy.position.set(Math.cos(d.angle) * r, Math.max(y, 0.55), Math.sin(d.angle) * r);
        dummy.updateMatrix(); droplets.setMatrixAt(i, dummy.matrix);
    }
    droplets.instanceMatrix.needsUpdate = true;
    const wp = waterGeo.attributes.position;
    for (let i = 0; i < wp.count; i++) { const x = wp.getX(i), y = wp.getY(i); wp.setZ(i, Math.sin(Math.hypot(x, y) * 7 - time * 2.4) * 0.012); }
    wp.needsUpdate = true;

    if (playing) {
        targetCamera.set(pos.x, 5.3, pos.z + 7.4);
        targetFocus.set(pos.x, 1, pos.z - 2.8);
    } else {
        const portraitDistance = 1.8 * Math.max(1, 0.65 / camera.aspect);
        targetCamera.set(pos.x + 0.15, 1.56, pos.z + portraitDistance);
        targetFocus.set(pos.x, 1.33, pos.z + 0.12);
    }
    const cameraEase = reduceMotion.matches ? 1 : 1 - Math.exp(-5 * dt);
    camera.position.lerp(targetCamera, cameraEase);
    cameraFocus.lerp(targetFocus, cameraEase);
    if (window.__cam) { camera.position.copy(window.__cam.p); camera.lookAt(window.__cam.t); }
    else camera.lookAt(cameraFocus);
    gameScreen.position.y=2.37+(reduceMotion.matches?0:.035*Math.sin(time*1.5));
    if(focusedGame){
        const dist=1.55/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(1,camera.aspect));
        camera.position.copy(gameScreen.position).addScaledVector(screenNormal,dist);
        camera.lookAt(gameScreen.position);
    }
    if (watchingCinema) {
        const visibleHeight = Math.max(4.35, 6.7 / camera.aspect);
        const distance = visibleHeight / (2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
        camera.position.set(0,2.04,cinemaZ+distance);
        camera.lookAt(0,1.95,cinemaZ);
    }
    if (mouth) mouth.scale.y = talking && !reduceMotion.matches ? 0.006 + Math.abs(Math.sin(time * 13)) * 0.02 : 0.004;
    if (!bubble.hidden && playing) {
        const headWorld = new THREE.Vector3(pos.x, pos.y+2.25, pos.z).project(camera);
        const bx = (headWorld.x * 0.5 + 0.5) * innerWidth, by = (-headWorld.y * 0.5 + 0.5) * innerHeight;
        const w = bubble.offsetWidth, h = bubble.offsetHeight;
        bubble.style.transform = `translate(${Math.min(Math.max(bx - w / 2, 8), innerWidth - w - 8)}px, ${Math.max(by - h - 14, 60)}px)`;
    }
    if (firstFrame) {
        try {
            composer.render();
        } catch (error) {
            renderer.setAnimationLoop(null);
            document.dispatchEvent(new Event('garden-load-error'));
            console.error(error);
            return;
        }
        firstFrame = false;
        document.dispatchEvent(new Event('garden-ready'));
    } else composer.render();
});
window.__garden = { scene, camera, avatar, THREE, renderer, audio };



