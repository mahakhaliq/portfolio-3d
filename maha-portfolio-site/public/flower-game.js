const materials = {
    stem: { label: 'Stem', color: 0x6eab66 },
    leaf: { label: 'Leaf', color: 0xa5c751 },
    petal: { label: 'Petal', color: 0xe76f98 },
    gold: { label: 'Gold', color: 0xffc873 },
};

// A slender stem, two curved leaves, and a closed tulip bud.
const blueprint = [
    [2,0,'stem'],[2,1,'stem'],[2,2,'stem'],[2,3,'stem'],[3,4,'stem'],[4,5,'stem'],
    [1,2,'leaf'],[0,3,'leaf'],[3,2,'leaf'],[4,3,'leaf'],
    [4,6,'petal'],[5,6,'petal'],[3,7,'petal'],[4,7,'petal'],[5,7,'petal'],[6,7,'gold'],
    [4,8,'petal'],[5,8,'gold'],
];

const pickupPositions = [
    [-2.1,10],[3.4,9],[-7.1,9.5],[7.4,9.5],[-10.1,4.8],[10.9,4.8],
    [-4.2,4],[4.2,4],[-7.8,1],[7.7,1],[-10.6,-1],[10.5,-1],
    [-5.5,-6],[5.6,-6],[-10.8,-9],[10.9,-9],[-3.2,-13],[3.2,-13],
];

export function createFlowerGame(THREE, scene, x, z, roomZ, onCollect) {
    const inventory = {stem:0,leaf:0,petal:0,gold:0};
    const placed = new Set();
    const size = .29;
    const geometry = new THREE.BoxGeometry(1,1,1);
    const palette = Object.fromEntries(Object.entries(materials).map(([key, value]) => [
        key, new THREE.MeshStandardMaterial({color:value.color, emissive:value.color, emissiveIntensity:.25, roughness:.58})
    ]));
    const outline = new THREE.EdgesGeometry(geometry);
    const guide = new THREE.LineBasicMaterial({color:0xffd5ed, transparent:true, opacity:.52});
    const model = new THREE.Group();
    model.position.set(x,.52,z);
    model.name = 'Tulip block build';
    scene.add(model);
    const slots = blueprint.map(([column,row,type]) => {
        const hint = new THREE.LineSegments(outline,guide);
        const cube = new THREE.Mesh(geometry,palette[type]);
        for (const object of [hint,cube]) {
            object.position.set((column-3)*size,(row+.5)*size,0);
            object.scale.setScalar(size*.94);
            model.add(object);
        }
        cube.visible = false;
        return {hint,cube};
    });
    const pickups = pickupPositions.map(([px,pz],i) => {
        const type = blueprint[i][2];
        const cube = new THREE.Mesh(geometry,palette[type]);
        cube.scale.setScalar(.23);
        cube.position.set(px,.64,roomZ+pz);
        scene.add(cube);
        return {type,cube};
    });
    const hud = document.getElementById('flower-count');
    function updateCount() {
        const collected = pickups.filter(p=>!p.cube.visible).length;
        hud.textContent = 'Flower blocks ' + collected + '/' + pickups.length;
    }
    updateCount();

    function tick(position,time,motion) {
        hud.hidden = false;
        pickups.forEach(({type,cube},i) => {
            if (!cube.visible) return;
            if (motion) {
                cube.rotation.y = time + i;
                cube.rotation.x = .35;
                cube.position.y = .64 + .12*Math.sin(time*2+i);
            }
            if (Math.hypot(cube.position.x-position.x,cube.position.z-position.z)<.72 && position.y<1.15) {
                cube.visible = false;
                inventory[type]++;
                updateCount();
                onCollect();
            }
        });
    }

    function open(host) {
        const wallet = document.createElement('p');
        const grid = document.createElement('div');
        grid.className = 'flower-blueprint';
        grid.setAttribute('aria-label','Tulip blueprint');
        const status = document.createElement('p');
        status.className = 'flower-status';
        status.setAttribute('role','status');
        host.replaceChildren(wallet,grid,status);
        blueprint.forEach(([column,row,type],i) => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.style.gridColumn = String(column+1);
            cell.style.gridRow = String(9-row);
            cell.style.setProperty('--block', '#'+materials[type].color.toString(16).padStart(6,'0'));
            cell.setAttribute('aria-label', materials[type].label+' block, row '+(row+1)+', column '+(column+1));
            cell.setAttribute('aria-pressed', String(placed.has(i)));
            cell.onclick = () => {
                if (placed.has(i)) {
                    placed.delete(i);
                    inventory[type]++;
                    status.textContent = 'Block returned to your pouch.';
                } else if (inventory[type] > 0) {
                    placed.add(i);
                    inventory[type]--;
                    status.textContent = placed.size === blueprint.length ? 'Tulip complete! Your sculpture is ready in the garden.' : 'Block placed.';
                    onCollect();
                } else {
                    status.textContent = 'Find another '+materials[type].label.toLowerCase()+' block in the garden.';
                    return;
                }
                slots[i].cube.visible = placed.has(i);
                slots[i].hint.visible = !placed.has(i);
                cell.setAttribute('aria-pressed', String(placed.has(i)));
                updateWallet();
            };
            grid.append(cell);
        });
        function updateWallet() {
            wallet.textContent = Object.entries(inventory).map(([key,count])=>materials[key].label+' '+count).join(' · ');
        }
        updateWallet();
        status.textContent = placed.size === blueprint.length ? 'Tulip complete!' : 'Tap an outlined tile to place its matching block.';
    }
    return {tick,open};
}

