const pins = [
    ['./achievements/gamecon-2025.jpg', 'The Game Con 2025 · Runner-up'],
    ['./achievements/gamecon-award.jpg', 'The Game Con · Runner-up award'],
    ['./achievements/ned-exhibition.jpg', 'NED Game Development Exhibition · Third place'],
    ['./achievements/cega-unreal.jpg', 'CEGA · Unreal training'],
    ['./achievements/cega-preproduction.jpg', 'CEGA · Pre-production training'],
    ['./achievements/hackfest.jpg', 'Hackfest Datathon · Game Development'],
    ['./achievements/aromaverse.jpg', 'Aromaverse · Internship completion'],
    ['./achievements/gamestorm.jpg', 'The Game Storm Studios'],
    ['./achievements/event-team.jpg', 'Games event · Team moments'],
    ['./achievements/media-marketing.jpg', 'Media & Marketing'],
];

export function createPinboardTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const grain = document.createElement('canvas');
    grain.width = grain.height = 88;
    const pattern = grain.getContext('2d');
    pattern.fillStyle = '#aa788e';
    pattern.fillRect(0, 0, 88, 88);
    for (let i = 0; i < 500; i++) {
        pattern.fillStyle = i % 2 ? '#ba879d' : '#956981';
        pattern.fillRect((i * 61 % 173) / 2, (i * 53 % 167) / 2, 2, 2);
    }
    const felt = ctx.createPattern(grain, 'repeat');
    const images = [];
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const angles = [-.055,.045,-.035,.055,-.04,.035,-.055,.04,-.045,.04];

    function paint() {
        ctx.fillStyle = felt;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#f1c8cb';
        ctx.lineWidth = 4;
        ctx.strokeRect(15, 15, canvas.width-30, canvas.height-30);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff1e0';
        ctx.font = 'bold 64px Georgia';
        ctx.fillText('Achievements', 768, 94);
        ctx.font = '28px system-ui';
        ctx.fillText('Awards, certificates & milestones', 768, 136);
        pins.forEach((_, i) => {
            const x = 163 + i % 5 * 302;
            const y = 302 + Math.floor(i / 5) * 283;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angles[i]);
            ctx.shadowColor = '#482a40aa';
            ctx.shadowBlur = 13;
            ctx.shadowOffsetY = 7;
            ctx.fillStyle = '#fff4de';
            ctx.fillRect(-132, -107, 264, 214);
            ctx.shadowColor = 'transparent';
            const image = images[i];
            if (image) {
                const scale = Math.min(244 / image.naturalWidth, 190 / image.naturalHeight);
                const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
                ctx.drawImage(image, -width / 2, -height / 2 - 3, width, height);
            }
            ctx.fillStyle = i % 2 ? '#9d517f' : '#a67139';
            ctx.beginPath();
            ctx.arc(0, -102, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff1d8';
            ctx.beginPath();
            ctx.arc(-2, -104, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        texture.needsUpdate = true;
    }
    paint();
    let started = false;
    return {
        texture,
        load() {
            if (started) return;
            started = true;
            let scheduled = false;
            pins.forEach(([src], index) => {
                const image = new Image();
                image.onload = () => {
                    images[index] = image;
                    if (scheduled) return;
                    scheduled = true;
                    requestAnimationFrame(() => { scheduled = false; paint(); });
                };
                image.src = src;
            });
        },
    };
}

export function openAchievementBoard(host) {
    const grid = document.createElement('div');
    grid.className = 'achievement-grid';
    const viewer = document.createElement('figure');
    viewer.className = 'achievement-viewer';
    viewer.hidden = true;
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Back to pinboard';
    const fullImage = document.createElement('img');
    const caption = document.createElement('figcaption');
    viewer.append(back, fullImage, caption);
    let active;
    back.onclick = () => {
        viewer.hidden = true;
        grid.hidden = false;
        active.focus();
    };
    for (const [src, title] of pins) {
        const pin = document.createElement('button');
        pin.type = 'button';
        const image = document.createElement('img');
        image.src = src;
        image.alt = '';
        image.loading = 'lazy';
        const label = document.createElement('span');
        label.textContent = title;
        pin.append(image, label);
        pin.onclick = () => {
            active = pin;
            fullImage.src = src;
            fullImage.alt = title;
            caption.textContent = title;
            grid.hidden = true;
            viewer.hidden = false;
            back.focus();
        };
        grid.append(pin);
    }
    host.replaceChildren(grid, viewer);
}

