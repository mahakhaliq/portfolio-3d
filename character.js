// Maha – stylised 3D character built from smooth primitives, following the concept sheet:
// lilac hijab + draped scarf, cream oversized shirt, wide charcoal cargo trousers, white sneakers.
// Part names (Body, Head, ArmL/R, LegL/R, EyeL/R) are used by the animation code.
import * as THREE from 'three';

export function buildMaha() {
    const root = new THREE.Group();
    root.name = 'Maha';
    const body = new THREE.Group();
    body.name = 'Body';
    root.add(body);

    const std = (color, roughness = 0.75, extra = {}) =>
        new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

    // ---- palette (from the concept sheet) ----
    const skin = std(0xfde6d8, 0.5, { emissive: 0x4a2018, emissiveIntensity: 0.1 });
    const skinDeep = std(0xf6cdb9, 0.5);
    const hijab = std(0x8f5f86, 0.92);
    const hijabDark = std(0x7a4d72, 0.95);
    const shirt = std(0xe3cdc0, 0.9);
    const shirtShade = std(0xd2b9ab, 0.9);
    const button = std(0xf4e7da, 0.5);
    const pants = std(0x4b4048, 0.95);
    const pantsDark = std(0x3c3239, 0.95);
    const sole = std(0xf4f0f4, 0.45);
    const shoe = std(0xe9dfe8, 0.6);
    const lashes = std(0x2a1712, 0.6);
    const white = std(0xfffaf6, 0.25);
    const iris = std(0x6b3a22, 0.35);
    const lipMat = std(0xd4766d, 0.5);
    const strap = std(0x2d2a31, 0.5);
    const blush = new THREE.MeshBasicMaterial({ color: 0xf28f86, transparent: true, opacity: 0.32, depthWrite: false });

    const sph = new THREE.SphereGeometry(1, 48, 32);
    const addMesh = (parent, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
        const m = new THREE.Mesh(geometry, material);
        m.position.set(x, y, z);
        m.scale.set(sx, sy, sz);
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
        return m;
    };

    // ======================= HEAD =======================
    const head = new THREE.Group();
    head.name = 'Head';
    head.position.set(0, 1.5, 0);
    head.scale.setScalar(1.1);
    body.add(head);

    const FACE = { cz: 0.085, rx: 0.188, ry: 0.208, rz: 0.19 };
    const faceZ = (x, y) => {
        const t = 1 - (x / FACE.rx) ** 2 - (y / FACE.ry) ** 2;
        return FACE.cz + FACE.rz * Math.sqrt(Math.max(t, 0));
    };
    addMesh(head, sph, skin, 0, 0, FACE.cz, FACE.rx, FACE.ry, FACE.rz);

    // hijab: hood around the head, rolled frame around the face, back drape and chin wrap
    addMesh(head, sph, hijab, 0, 0.02, -0.02, 0.262, 0.272, 0.262);
    const frame = addMesh(head, new THREE.TorusGeometry(1, 0.17, 16, 72), hijab, 0, -0.002, 0.168, 0.168, 0.205, 0.17);
    frame.rotation.x = -0.06;
    addMesh(head, sph, hijabDark, 0, -0.27, -0.085, 0.235, 0.33, 0.2);
    addMesh(head, sph, hijab, 0, -0.18, 0.025, 0.205, 0.15, 0.2);

    // hair peeking at the forehead
    const hair = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, 0.62),
        std(0x1c1210, 0.6));
    hair.scale.set(FACE.rx * 1.015, FACE.ry * 1.012, FACE.rz * 1.015);
    hair.position.set(0, 0.002, FACE.cz);
    hair.rotation.x = 0.72;
    hair.castShadow = true;
    head.add(hair);

    // eyes
    const makeEye = (side) => {
        const eye = new THREE.Group();
        eye.name = side < 0 ? 'EyeL' : 'EyeR';
        const ex = 0.075 * side, ey = 0.02;
        eye.position.set(ex, ey, faceZ(ex, ey) - 0.012);
        eye.rotation.y = 0.12 * side;
        head.add(eye);
        addMesh(eye, sph, white, 0, 0, 0, 0.043, 0.05, 0.02);
        addMesh(eye, sph, iris, 0, -0.002, 0.011, 0.031, 0.037, 0.016);
        addMesh(eye, sph, lashes, 0, -0.002, 0.019, 0.018, 0.021, 0.008);
        addMesh(eye, sph, white, 0.011, 0.014, 0.025, 0.009, 0.01, 0.006);
        addMesh(eye, sph, white, -0.01, -0.012, 0.024, 0.0045, 0.0045, 0.004);
        const lid = addMesh(eye, new THREE.TorusGeometry(1, 0.095, 8, 28, Math.PI * 0.95), lashes, 0, 0.002, 0.012, 0.046, 0.053, 0.05);
        lid.rotation.z = Math.PI * 0.025;
        // little outer lash flick
        const flick = addMesh(eye, new THREE.CapsuleGeometry(0.0035, 0.018, 4, 8), lashes, 0.049 * side, 0.026, 0.008);
        flick.rotation.z = -side * 0.9;
    };
    makeEye(-1);
    makeEye(1);

    // brows
    for (const side of [-1, 1]) {
        const bx = 0.075 * side, by = 0.094;
        const brow = addMesh(head, new THREE.CapsuleGeometry(0.0125, 0.06, 6, 12), lashes,
            bx, by, faceZ(bx, by) + 0.002, 1, 1, 0.7);
        brow.rotation.z = Math.PI / 2 - side * 0.12;
        brow.rotation.y = 0.2 * side;
    }

    // nose, mouth, cheeks, beauty mark
    addMesh(head, sph, skinDeep, 0, -0.045, faceZ(0, -0.045) + 0.004, 0.022, 0.018, 0.02);
    const smile = addMesh(head, new THREE.TorusGeometry(1, 0.1, 8, 24, Math.PI * 0.62), lipMat,
        0, -0.092, faceZ(0, -0.092) + 0.0025, 0.042, 0.034, 0.035);
    smile.rotation.z = Math.PI * 1.19;
    const talk = addMesh(head, sph, std(0x7a2f35, 0.5), 0, -0.1, faceZ(0, -0.1) + 0.002, 0.022, 0.004, 0.01);
    talk.name = 'MouthOpen';
    talk.castShadow = false;
    for (const side of [-1, 1]) {
        const cx = 0.105 * side, cy = -0.045;
        const cheek = addMesh(head, sph, blush, cx, cy, faceZ(cx, cy) - 0.004, 0.036, 0.024, 0.012);
        cheek.castShadow = false;
        cheek.rotation.y = 0.55 * side;
    }
    addMesh(head, sph, lashes, -0.028, 0.125, faceZ(-0.028, 0.125) + 0.0005, 0.0085, 0.0085, 0.006);
    // ears are hidden by the hijab

    // ======================= TORSO =======================
    const shirtProfile = [
        [0.0, 0.66], [0.205, 0.665], [0.232, 0.71], [0.226, 0.86], [0.192, 1.04], [0.2, 1.17],
        [0.17, 1.28], [0.1, 1.34], [0.0, 1.36],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(shirtProfile, 56), shirt);
    torso.scale.set(1.0, 1, 0.74);
    torso.castShadow = torso.receiveShadow = true;
    body.add(torso);
    for (let i = 0; i < 6; i++) {
        addMesh(body, sph, button, 0, 0.77 + i * 0.09, 0.164 - i * 0.004, 0.0105, 0.0105, 0.006);
    }
    // placket
    addMesh(body, new THREE.BoxGeometry(1, 1, 1), shirtShade, 0, 1.03, 0.1625, 0.022, 0.5, 0.004);
    // shirt hem shadow ring

    // scarf: loop around shoulders + long draped end
    const loop = addMesh(body, new THREE.TorusGeometry(1, 0.34, 20, 60), hijab, 0, 1.275, 0.02, 0.19, 0.16, 0.19);
    loop.rotation.x = Math.PI / 2 - 0.2;
    loop.scale.set(0.205, 0.17, 0.2);
    const drape = addMesh(body, new THREE.TorusGeometry(1, 0.3, 16, 40, Math.PI * 1.1), hijabDark, -0.02, 1.2, 0.075, 0.16, 0.13, 0.13);
    drape.rotation.set(Math.PI / 2 + 0.55, 0, Math.PI * 0.95);
    addMesh(body, sph, hijab, 0.1, 1.225, 0.12, 0.085, 0.07, 0.07);

    const panelGeo = new THREE.PlaneGeometry(0.19, 0.5, 8, 18);
    const p = panelGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const t = (0.25 - y) / 0.5;               // 0 at top, 1 at bottom
        p.setZ(i, Math.sin(x * 38 + t * 3.4) * 0.016 * (0.4 + t) + t * t * 0.03);
        p.setX(i, x * (1 + t * 0.25) + Math.sin(t * 4) * 0.01);
    }
    panelGeo.computeVertexNormals();
    const panelMat = std(0x8f5f86, 0.92, { side: THREE.DoubleSide });
    const panel = addMesh(body, panelGeo, panelMat, 0.115, 1.0, 0.152);
    panel.rotation.z = 0.04;
    panel.rotation.x = -0.04;
    const panel2 = addMesh(body, panelGeo, std(0x835479, 0.92, { side: THREE.DoubleSide }), 0.085, 1.02, 0.165, 0.7, 0.72, 1);
    panel2.rotation.z = -0.06;

    // ======================= ARMS =======================
    const makeArm = (side) => {
        const arm = new THREE.Group();
        arm.name = side < 0 ? 'ArmL' : 'ArmR';
        arm.position.set(0.19 * side, 1.255, 0);
        body.add(arm);
        addMesh(arm, sph, shirt, 0, 0, 0, 0.068, 0.07, 0.068);
        const sleeve = addMesh(arm, new THREE.CylinderGeometry(0.066, 0.06, 0.3, 24), shirt, 0, -0.15, 0);
        const cuff = addMesh(arm, new THREE.TorusGeometry(1, 0.28, 12, 30), shirtShade, 0, -0.31, 0, 0.058, 0.058, 0.07);
        cuff.rotation.x = Math.PI / 2;
        addMesh(arm, new THREE.CylinderGeometry(0.047, 0.036, 0.13, 20), skin, 0, -0.37, 0);
        addMesh(arm, sph, skin, 0, -0.455, 0.004, 0.044, 0.062, 0.025);       // palm
        const thumb = addMesh(arm, new THREE.CapsuleGeometry(0.014, 0.034, 4, 10), skin, -side * 0.032, -0.44, 0.02);
        thumb.rotation.z = side * -0.5;
        // fingers hint
        for (let f = -1; f <= 1; f++) {
            addMesh(arm, new THREE.CapsuleGeometry(0.0095, 0.05, 4, 8), skin, f * 0.017, -0.5, 0.004);
        }
        if (side < 0) {
            const band = addMesh(arm, new THREE.TorusGeometry(1, 0.16, 8, 24), strap, 0, -0.405, 0, 0.044, 0.044, 0.044);
            band.rotation.x = Math.PI / 2;
            addMesh(arm, new THREE.BoxGeometry(0.03, 0.026, 0.012), strap, 0, -0.405, 0.044);
        }
        return arm;
    };
    makeArm(-1);
    makeArm(1);

    // ======================= LEGS =======================
    const makeLeg = (side) => {
        const leg = new THREE.Group();
        leg.name = side < 0 ? 'LegL' : 'LegR';
        leg.position.set(0.1 * side, 0.82, 0);
        body.add(leg);
        addMesh(leg, new THREE.CylinderGeometry(0.112, 0.142, 0.66, 28), pants, 0, -0.35, 0, 1, 1, 0.94);
        addMesh(leg, sph, pants, 0, 0, 0, 0.12, 0.1, 0.12);
        const hem = addMesh(leg, new THREE.TorusGeometry(1, 0.1, 10, 34), pantsDark, 0, -0.665, 0, 0.139, 0.139, 0.13);
        hem.rotation.x = Math.PI / 2;
        // cargo pocket (outer side)
        const pocket = addMesh(leg, new THREE.BoxGeometry(0.045, 0.17, 0.115), pantsDark, 0.128 * side, -0.3, 0.015);
        addMesh(leg, new THREE.BoxGeometry(0.05, 0.05, 0.12), pants, 0.129 * side, -0.2, 0.015);
        pocket.rotation.z = side * 0.04;
        addMesh(leg, sph, button, 0.153 * side, -0.2, 0.015, 0.006, 0.01, 0.01);
        // sneaker
        const shoeGroup = new THREE.Group();
        shoeGroup.position.set(0, -0.72, 0);
        leg.add(shoeGroup);
        addMesh(shoeGroup, sph, shoe, 0, 0.0, 0.05, 0.098, 0.066, 0.155);
        addMesh(shoeGroup, sph, shoe, 0, 0.035, -0.015, 0.082, 0.07, 0.09);
        const sl = addMesh(shoeGroup, new THREE.CapsuleGeometry(0.093, 0.13, 8, 20), sole, 0, -0.04, 0.045, 1, 0.34, 1);
        sl.rotation.x = Math.PI / 2;
        sl.scale.set(1, 1.0, 0.36);
        for (let i = 0; i < 3; i++) {
            addMesh(shoeGroup, new THREE.CapsuleGeometry(0.004, 0.06, 4, 8), button, 0, 0.056 - i * 0.002, 0.085 + i * 0.03).rotation.z = Math.PI / 2;
        }
        return leg;
    };
    makeLeg(-1);
    makeLeg(1);

    root.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    return root;
}
