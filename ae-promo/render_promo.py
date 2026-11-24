"""Maha Khaliq – 45s "PRESS START" promo, rendered frame-by-frame (1920x1080, 30fps).
Usage:  python render_promo.py --test 1.0 3.0 7.0      -> saves still PNGs in ./stills
        python render_promo.py                        -> renders MahaKhaliq_Promo.mp4
"""
import os, sys, math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS, DUR = 1920, 1080, 30, 45
BG, BG2 = (0x1A, 0x0F, 0x0D), (0x2B, 0x18, 0x10)
PINK, SOFT, CREAM, GOLD = (0xE8, 0x50, 0x8A), (0xF7, 0xC6, 0xD9), (0xFF, 0xF1, 0xF5), (0xC9, 0xA2, 0x7E)
STARTS = [0, 4, 10, 18, 34, 40, 45]
TRANS = 0.3

# ------------------------------------------------------------------ helpers
def clamp(x, a=0.0, b=1.0): return a if x < a else b if x > b else x
def prog(t, t0, d): return clamp((t - t0) / d)
def ease_out(p): return 1 - (1 - p) ** 3
def ease_io(p): return 3 * p * p - 2 * p ** 3
def ease_back(p):
    s = 1.70158; p -= 1
    return p * p * ((s + 1) * p + s) + 1
def pop(t, t0, d=0.5): return 0.0 if t < t0 else ease_back(prog(t, t0, d))

_fonts = {}
def font(kind, size):
    key = (kind, size)
    if key not in _fonts:
        f = {'t': 'Bebas.ttf', 'b': 'Poppins-Regular.ttf', 'bs': 'Poppins-SemiBold.ttf', 'bb': 'Poppins-Bold.ttf'}[kind]
        _fonts[key] = ImageFont.truetype(os.path.join(HERE, 'fonts', f), size)
    return _fonts[key]

class Sp:
    """RGBA sprite with a lazily-built glow."""
    def __init__(self, img): self.img = img; self._glow = {}
    @property
    def size(self): return self.img.size
    def glow(self, radius, color=None):
        key = (radius, color)
        if key not in self._glow:
            pad = radius * 3
            a = self.img.split()[3]
            big = Image.new('L', (self.img.width + 2 * pad, self.img.height + 2 * pad), 0)
            big.paste(a, (pad, pad))
            big = big.filter(ImageFilter.GaussianBlur(radius))
            col = color or PINK
            g = Image.new('RGBA', big.size, tuple(col) + (0,))
            g.putalpha(big)
            self._glow[key] = Sp(g)
        return self._glow[key]

_text_cache = {}
def text(s, kind, size, color, spacing=0, align='center', gap=1.12):
    key = (s, kind, size, color, spacing, align, gap)
    if key in _text_cache: return _text_cache[key]
    f = font(kind, size)
    lines = s.split('\n')
    def width(line): return sum(f.getlength(c) + spacing for c in line) - spacing if spacing else f.getlength(line)
    lh = int(size * gap)
    w = int(max(width(l) for l in lines)) + 40
    h = lh * len(lines) + 40
    im = Image.new('RGBA', (w, h), color + (0,))
    d = ImageDraw.Draw(im)
    for i, line in enumerate(lines):
        lw = width(line)
        x = 20 if align == 'left' else (w - lw) / 2 if align == 'center' else w - 20 - lw
        y = 20 + i * lh
        if spacing:
            for c in line:
                d.text((x, y), c, font=f, fill=color + (255,)); x += f.getlength(c) + spacing
        else:
            d.text((x, y), line, font=f, fill=color + (255,))
    sp = Sp(im); _text_cache[key] = sp
    return sp

_shape_cache = {}
def rrect(w, h, r, fill=None, outline=None, ow=4, fill_a=255, ss=3):
    key = (w, h, r, fill, outline, ow, fill_a)
    if key in _shape_cache: return _shape_cache[key]
    pad = 8
    im = Image.new('RGBA', ((w + 2 * pad) * ss, (h + 2 * pad) * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box = [pad * ss, pad * ss, (pad + w) * ss - 1, (pad + h) * ss - 1]
    d.rounded_rectangle(box, r * ss, fill=(fill + (fill_a,)) if fill else None, outline=(outline + (255,)) if outline else None, width=ow * ss if outline else 0)
    sp = Sp(im.resize((w + 2 * pad, h + 2 * pad), Image.LANCZOS)); _shape_cache[key] = sp
    return sp

def disc(r, color, soft=0.5):
    key = ('disc', r, color, soft)
    if key in _shape_cache: return _shape_cache[key]
    n = r * 2 + 2
    yy, xx = np.mgrid[0:n, 0:n]
    d = np.hypot(xx - n / 2, yy - n / 2) / r
    a = np.clip((1 - d) / max(soft, 1e-3), 0, 1)
    im = np.zeros((n, n, 4), np.uint8); im[..., :3] = color; im[..., 3] = (a * 255).astype(np.uint8)
    sp = Sp(Image.fromarray(im, 'RGBA')); _shape_cache[key] = sp
    return sp

def wipe(sp, p, feather=0.22):
    """left-to-right mask wipe reveal"""
    if p >= 1: return sp
    a = np.asarray(sp.img).copy()
    w = a.shape[1]
    x = np.linspace(0, 1, w)[None, :]
    ramp = np.clip((p * (1 + feather) - x) / feather, 0, 1)
    a[..., 3] = (a[..., 3] * ramp).astype(np.uint8)
    return Sp(Image.fromarray(a, 'RGBA'))

class Cv:
    def __init__(self, base): self.a = base.copy()
    def _place(self, sp, x, y, s, rot, anchor):
        im = sp.img
        if s != 1:
            if s <= 0.01: return None
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BICUBIC)
        if rot: im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
        w, h = im.size
        if anchor == 'c': x0, y0 = int(x - w / 2), int(y - h / 2)
        elif anchor == 'l': x0, y0 = int(x - 20 * s), int(y - h / 2)
        elif anchor == 'r': x0, y0 = int(x - w + 20 * s), int(y - h / 2)
        else: x0, y0 = int(x), int(y)
        return im, x0, y0
    def _region(self, im, x0, y0):
        w, h = im.size
        X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
        if X0 >= X1 or Y0 >= Y1: return None
        src = np.asarray(im, dtype=np.float32)[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
        return X0, Y0, X1, Y1, src
    def over(self, sp, x, y, op=1.0, s=1.0, rot=0, anchor='c', glow=None):
        if op <= 0: return
        if glow: self.add(sp.glow(glow[0], glow[2] if len(glow) > 2 else None), x, y, op * glow[1], s, rot, anchor, _g=True)
        r = self._place(sp, x, y, s, rot, anchor)
        if r is None: return
        reg = self._region(*r)
        if reg is None: return
        X0, Y0, X1, Y1, src = reg
        al = src[..., 3:4] / 255.0 * op
        dst = self.a[Y0:Y1, X0:X1]
        dst[:] = dst * (1 - al) + src[..., :3] * al
    def add(self, sp, x, y, op=1.0, s=1.0, rot=0, anchor='c', _g=False):
        if op <= 0: return
        if _g and anchor in ('l', 'r'):
            pad = (sp.img.width - 0)
        r = self._place(sp, x, y, s, rot, anchor)
        if r is None: return
        reg = self._region(*r)
        if reg is None: return
        X0, Y0, X1, Y1, src = reg
        dst = self.a[Y0:Y1, X0:X1]
        dst += src[..., :3] * (src[..., 3:4] / 255.0) * op
        np.clip(dst, 0, 255, out=dst)
    def rect(self, x, y, w, h, color, op=1.0):
        X0, Y0, X1, Y1 = max(0, int(x)), max(0, int(y)), min(W, int(x + w)), min(H, int(y + h))
        if X0 >= X1 or Y0 >= Y1 or op <= 0: return
        self.a[Y0:Y1, X0:X1] = self.a[Y0:Y1, X0:X1] * (1 - op) + np.array(color, np.float32) * op
    def flash(self, op, color=(255, 255, 255)):
        if op > 0: self.a[:] = self.a * (1 - op) + np.array(color, np.float32) * op

# ------------------------------------------------------------------ static backdrop / overlay
def make_bg():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.hypot((xx - W / 2) / (W * 0.55), (yy - H / 2) / (H * 0.62))
    glow = np.clip(1 - d, 0, 1) ** 1.6
    bg = np.zeros((H, W, 3), np.float32) + np.array(BG, np.float32)
    bg += glow[..., None] * (np.array(BG2, np.float32) - np.array(BG, np.float32)) * 1.25
    vig = 1 - np.clip(d - 0.55, 0, 1) ** 1.5 * 0.55
    return (bg * vig[..., None]).astype(np.float32)
BGARR = make_bg()
SCAN = np.ones((H, 1, 1), np.float32); SCAN[::4] = 0.90; SCAN[1::4] = 0.90
rng_static = np.random.default_rng(11)
BOK = [dict(x=rng_static.uniform(0, W), y=rng_static.uniform(0, H), r=int(rng_static.uniform(8, 38)), sp=rng_static.uniform(12, 38),
            ph=rng_static.uniform(0, 6.28), fr=rng_static.uniform(0.3, 0.9), a=rng_static.uniform(0.10, 0.32)) for _ in range(26)]
SPARK = [dict(x=rng_static.uniform(0, W), y=rng_static.uniform(0, H), sp=rng_static.uniform(25, 80), ph=rng_static.uniform(0, 6.28), r=int(rng_static.uniform(2, 5))) for _ in range(70)]

def particles(cv, t, op=1.0, bokeh=True, sparks=True):
    if bokeh:
        for b in BOK:
            x = b['x'] + math.sin(t * b['fr'] + b['ph']) * 40
            y = (b['y'] - t * b['sp']) % (H + 200) - 100
            cv.add(disc(b['r'], SOFT, 0.9), x, y, b['a'] * op)
    if sparks:
        for s in SPARK:
            x = s['x'] + math.sin(t * 0.8 + s['ph']) * 25
            y = (s['y'] - t * s['sp']) % (H + 100) - 50
            tw = 0.5 + 0.5 * math.sin(t * 3 + s['ph'] * 5)
            cv.add(disc(s['r'], PINK, 0.8), x, y, 0.8 * tw * op)

def hud_corners(cv, op):
    for (x, y, fx, fy) in [(80, 80, 1, 1), (W - 80, 80, -1, 1), (80, H - 80, 1, -1), (W - 80, H - 80, -1, -1)]:
        cv.rect(x if fx > 0 else x - 120, y - 3, 120, 6, PINK, op)
        cv.rect(x - 3, y if fy > 0 else y - 120, 6, 120, PINK, op)

def glitch(a, rng, k):
    """in-place slice shift + RGB split on float frame"""
    for _ in range(int(10 * k) + 1):
        y = int(rng.integers(60, H - 120)); h = int(rng.integers(6, 70)); dx = int(rng.integers(-160, 160) * k)
        a[y:y + h] = np.roll(a[y:y + h], dx, axis=1)
    sh = int(11 * k)
    if sh:
        a[..., 0] = np.roll(a[..., 0], sh, axis=1); a[..., 2] = np.roll(a[..., 2], -sh, axis=1)

# ------------------------------------------------------------------ icon / logo drawing (supersampled)
def icon_canvas(size, ss=4):
    im = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0)); return im, ImageDraw.Draw(im), ss
def icon_finish(im, size): return Sp(im.resize((size, size), Image.LANCZOS))

def ic_vr(size, c):
    im, d, s = icon_canvas(size); u = size * s / 100
    d.rounded_rectangle([14 * u, 30 * u, 86 * u, 70 * u], 12 * u, outline=c + (255,), width=int(5 * u))
    for cx in (34, 66): d.ellipse([(cx - 11) * u, 39 * u, (cx + 11) * u, 61 * u], outline=c + (255,), width=int(4 * u))
    d.line([20 * u, 36 * u, 8 * u, 28 * u], fill=c + (255,), width=int(4 * u)); d.line([80 * u, 36 * u, 92 * u, 28 * u], fill=c + (255,), width=int(4 * u))
    d.line([46 * u, 66 * u, 54 * u, 66 * u], fill=c + (255,), width=int(4 * u))
    return icon_finish(im, size)
def ic_ar(size, c):
    im, d, s = icon_canvas(size); u = size * s / 100; w = int(5 * u)
    pts = [(50, 12), (84, 31), (84, 69), (50, 88), (16, 69), (16, 31)]
    d.line([(x * u, y * u) for x, y in pts + [pts[0]]], fill=c + (255,), width=w, joint='curve')
    d.line([50 * u, 50 * u, 50 * u, 88 * u], fill=c + (255,), width=w); d.line([50 * u, 50 * u, 84 * u, 31 * u], fill=c + (255,), width=w); d.line([50 * u, 50 * u, 16 * u, 31 * u], fill=c + (255,), width=w)
    return icon_finish(im, size)
def ic_ai(size, c):
    im, d, s = icon_canvas(size); u = size * s / 100; w = int(4 * u)
    nodes = [(50, 18), (22, 38), (78, 38), (30, 70), (70, 70), (50, 50)]
    for a, b in [(0, 1), (0, 2), (1, 5), (2, 5), (1, 3), (2, 4), (3, 5), (4, 5), (3, 4), (0, 5)]:
        d.line([nodes[a][0] * u, nodes[a][1] * u, nodes[b][0] * u, nodes[b][1] * u], fill=c + (255,), width=w)
    for x, y in nodes: d.ellipse([(x - 7) * u, (y - 7) * u, (x + 7) * u, (y + 7) * u], fill=c + (255,))
    return icon_finish(im, size)
def ic_pad(size, c):
    im, d, s = icon_canvas(size); u = size * s / 100; w = int(5 * u)
    d.rounded_rectangle([10 * u, 30 * u, 90 * u, 72 * u], 20 * u, outline=c + (255,), width=w)
    d.line([30 * u, 42 * u, 30 * u, 60 * u], fill=c + (255,), width=w); d.line([21 * u, 51 * u, 39 * u, 51 * u], fill=c + (255,), width=w)
    for cx, cy in ((66, 56), (77, 46)): d.ellipse([(cx - 5) * u, (cy - 5) * u, (cx + 5) * u, (cy + 5) * u], fill=c + (255,))
    return icon_finish(im, size)
def ic_trophy(size, c):
    im, d, s = icon_canvas(size); u = size * s / 100; w = int(5 * u)
    d.polygon([(28 * u, 14 * u), (72 * u, 14 * u), (66 * u, 50 * u), (50 * u, 60 * u), (34 * u, 50 * u)], outline=c + (255,), width=w)
    d.arc([6 * u, 18 * u, 32 * u, 44 * u], 90, 270, fill=c + (255,), width=w); d.arc([68 * u, 18 * u, 94 * u, 44 * u], 270, 90, fill=c + (255,), width=w)
    d.line([50 * u, 60 * u, 50 * u, 78 * u], fill=c + (255,), width=w)
    d.rounded_rectangle([32 * u, 78 * u, 68 * u, 90 * u], 4 * u, fill=c + (255,))
    d.ellipse([44 * u, 26 * u, 56 * u, 38 * u], fill=c + (255,))
    return icon_finish(im, size)

def logo_badge(label, color, size=120):
    ss = 3; im = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([4 * ss, 4 * ss, (size - 4) * ss, (size - 4) * ss], 26 * ss, fill=color + (255,))
    f = font('t', int(size * (0.62 if len(label) <= 2 else 0.5 if len(label) == 3 else 0.4)) * ss // ss)
    tb = d.textbbox((0, 0), label, font=ImageFont.truetype(os.path.join(HERE, 'fonts', 'Bebas.ttf'), int(size * ss * (0.62 if len(label) <= 2 else 0.5 if len(label) == 3 else 0.4))))
    f2 = ImageFont.truetype(os.path.join(HERE, 'fonts', 'Bebas.ttf'), int(size * ss * (0.62 if len(label) <= 2 else 0.5 if len(label) == 3 else 0.4)))
    d.text(((size * ss - (tb[2] - tb[0])) / 2 - tb[0], (size * ss - (tb[3] - tb[1])) / 2 - tb[1]), label, font=f2, fill=BG + (255,))
    return Sp(im.resize((size, size), Image.LANCZOS))

# ------------------------------------------------------------------ assets
PHOTO = Image.open(os.path.join(HERE, 'assets', 'photo', 'maha.png')).convert('RGB')
def photo_card(w, h, r):
    sc = max(w / PHOTO.width, h / PHOTO.height)
    im = PHOTO.resize((int(PHOTO.width * sc) + 1, int(PHOTO.height * sc) + 1), Image.LANCZOS)
    l, tp = (im.width - w) // 2, 0
    im = im.crop((l, tp, l + w, tp + h)).convert('RGBA')
    m = Image.new('L', (w * 3, h * 3), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w * 3 - 1, h * 3 - 1], r * 3, fill=255)
    im.putalpha(m.resize((w, h), Image.LANCZOS))
    return Sp(im)
PHOTO_SP = photo_card(640, 800, 44)
LOGOS = [('Unity', 'U', PINK), ('Unreal Engine', 'UE', SOFT), ('C#', 'C#', GOLD), ('C++', 'C++', PINK),
         ('Python', 'PY', SOFT), ('MySQL', 'SQL', GOLD), ('PHP', 'PHP', PINK), ('VS Code', 'VS', SOFT)]
LOGO_SP = [logo_badge(l[1], l[2]) for l in LOGOS]
ICONS = [('VR Locomotion', ic_vr), ('AR Foundation', ic_ar), ('AI Behavior', ic_ai), ('Gameplay Programming', ic_pad)]
PROJECTS = [   # (title, tag, clip key)
    ('SIGNAL SHUTDOWN', 'Horror FPP · Game Con 2025 Runner-Up', 'signal'),
    ('PORTAL BREACH', 'NED Expo · 3rd Place', 'portal'),
    ('THE UNBROKEN OATH', 'Featured Game Project', 'oath'),
    ('VR ESCAPE ROOM', 'Virtual Reality · Escape Room', 'escape'),
    ('ENCANTO INSPIRED VR', 'Virtual Reality · Encanto-Inspired World', 'encanto'),
    ('THE LIVING JUNGLE', 'Unreal Engine · Environment', 'jungle'),
]
EMAIL, LINKEDIN, PORTFOLIO = 'mahakhaliq151@gmail.com', 'linkedin.com/in/maha-khaliq49a192202', 'your-portfolio-url.com'

# ------------------------------------------------------------------ motion-graphics helpers
BEAT = 0.5
def beat_pulse(T): return math.exp(-((T % BEAT) / BEAT) * 5.0)

class Fx:
    """half-res vector overlay (rings, arcs, lines) upscaled + added onto the frame"""
    def __init__(self): self.im = Image.new('RGBA', (W // 2, H // 2), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im); self.used = False
    def ring(self, x, y, r, col, w=3, a=255):
        if r > 1 and a > 1: self.d.ellipse([(x - r) / 2, (y - r) / 2, (x + r) / 2, (y + r) / 2], outline=col + (int(a),), width=max(1, int(w / 2))); self.used = True
    def arc(self, x, y, r, a0, a1, col, w=4, a=255):
        if a > 1: self.d.arc([(x - r) / 2, (y - r) / 2, (x + r) / 2, (y + r) / 2], a0, a1, fill=col + (int(a),), width=max(1, int(w / 2))); self.used = True
    def line(self, x0, y0, x1, y1, col, w=2, a=255):
        if a > 1: self.d.line([x0 / 2, y0 / 2, x1 / 2, y1 / 2], fill=col + (int(a),), width=max(1, int(w / 2))); self.used = True
    def poly(self, pts, col, a):
        if a > 1: self.d.polygon([(x / 2, y / 2) for x, y in pts], fill=col + (int(a),)); self.used = True
    def apply(self, cv, op=1.0):
        if self.used: cv.add(Sp(self.im.resize((W, H), Image.BILINEAR)), W / 2, H / 2, op)

def kinetic(cv, s, kind, size, color, cx, y, t, t0, spacing=0, stagger=0.045, glow=None, anchor='c', rise=70):
    f = font(kind, size)
    ws = [f.getlength(c) + spacing for c in s]; total = sum(ws) - spacing
    x = cx - total / 2 if anchor == 'c' else cx
    for idx, (ch, w) in enumerate(zip(s, ws)):
        x_c = x + (w - spacing) / 2
        q = prog(t, t0 + idx * stagger, 0.32)
        if ch != ' ' and q > 0:
            cv.over(text(ch, kind, size, color), x_c, y + (1 - ease_out(q)) * rise, ease_out(q), s=0.55 + 0.45 * ease_back(q), glow=glow)
        x += w

_marq = {}
def marquee(cv, s, y, t, speed=140, op=0.55, color=SOFT, size=28, band=True):
    if s not in _marq: _marq[s] = text(s, 'bs', size, color, 5)
    sp = _marq[s]; w = sp.size[0]
    if band: cv.rect(0, y - 30, W, 60, BG, 0.55 * op / 0.55)
    x0 = -((t * speed) % w)
    while x0 < W:
        cv.over(sp, x0, y - sp.size[1] / 2, op, anchor='tl'); x0 += w

def grid_floor(fx, T, col=PINK, a=60, horizon=0.64):
    hz = H * horizon
    for i in range(-14, 15):
        fx.line(W / 2 + i * 38, hz, W / 2 + i * 520, H, col, 2, a)
    for k in range(9):
        q = (k + (T * 0.9) % 1) / 9; y = hz + (H - hz) * q ** 2.2
        fx.line(0, y, W, y, col, 2, a * (0.3 + q))

_hex = ['0x%04X  %s' % (rng_static.integers(0, 65535), ''.join('01'[int(v)] for v in rng_static.integers(0, 2, 8))) for _ in range(40)]
def hex_column(cv, x, T, op=0.35, anchor='l'):
    for i in range(14):
        y = 250 + i * 44 - (T * 60) % 44
        cv.over(text(_hex[(i + int(T * 60 / 44)) % 40], 'b', 22, GOLD, 2, 'left' if anchor == 'l' else 'right'), x, y, op * (1 - abs(i - 7) / 8), anchor=anchor)

def stripes(fx, T, col=PINK, a=22, gap=170, sp=60):
    off = (T * sp) % gap
    for i in range(-3, 16):
        x = i * gap + off
        fx.poly([(x, 0), (x + 70, 0), (x + 70 - 540, H), (x - 540, H)], col, a)

def burst(fx, x, y, t, t0, col=GOLD, n=16, r0=40, r1=260, dur=0.6):
    q = prog(t, t0, dur)
    if q <= 0 or q >= 1: return
    e = ease_out(q); a = 255 * (1 - q)
    fx.ring(x, y, r0 + e * (r1 - r0), col, 5, a)
    for k in range(n):
        ang = k * 2 * math.pi / n + 0.2
        fx.line(x + math.cos(ang) * (r0 + e * r1 * 0.55), y + math.sin(ang) * (r0 + e * r1 * 0.55),
                x + math.cos(ang) * (r0 + e * r1 * 0.95), y + math.sin(ang) * (r0 + e * r1 * 0.95), col, 4, a)

def new_cv(T, boost=0.18):
    cv = Cv(BGARR)
    if T >= TG: cv.a *= (1 + boost * beat_pulse(T))
    return cv

TG = 2.0
# ------------------------------------------------------------------ SCENE 1: HOOK
def scene1(t, rng):
    T = t; cv = new_cv(T)
    fx = Fx(); grid_floor(fx, T, PINK, 70 * prog(T, 0.3, 0.6)); fx.apply(cv, 0.8)
    hud_corners(cv, ease_out(prog(t, 0, 0.5)) * (0.7 + 0.3 * beat_pulse(T)))
    marquee(cv, 'MK_ENGINE  //  PLAYER ONE  //  LOADING ASSETS  //  SHOWREEL 2025  //  ', 36, t, 120, 0.5, SOFT, 22)
    cv.over(text('PLAYER 1', 'bs', 30, SOFT, 4), 130, 118, 0.9 * prog(t, 0.1, 0.4), anchor='l')
    cv.over(text('HI-SCORE %06d' % int(45000 * prog(t, 0, 4.3)), 'bs', 30, SOFT, 4), W - 130, 118, 0.9 * prog(t, 0.1, 0.4), anchor='r')
    hex_column(cv, 130, T, 0.35 * prog(T, 0.8, 0.5)); hex_column(cv, W - 130, T, 0.35 * prog(T, 0.8, 0.5), 'r')
    full = '> BOOTING MK_ENGINE v1.0\n> LOADING PLAYER_ONE ...... OK\n> READY.'; n = int(prog(t, 0.0, 0.7) * len(full))
    if n > 0 and t < 1.3:
        cv.over(text(full[:n] + ('_' if int(t * 4) % 2 == 0 else ' '), 'b', 30, GOLD, 1, 'left'), 130, 930, 1 - prog(t, 1.0, 0.3), anchor='l')
    glitching = TG - 0.15 <= t < TG + 0.7
    if t < TG:
        on = t >= 0.6 and int((t - 0.6) * 3) % 2 == 0
        if on or t > TG - 0.15:
            jit = rng.integers(-30, 30) if t > TG - 0.15 else 0
            cv.over(text('PRESS START', 't', 190, PINK, 6), W / 2 + jit, 480, 1, s=1 + 0.02 * beat_pulse(T), glow=(60, 1.1))
            cv.over(text('PRESS ANY KEY TO CONTINUE', 'bs', 36, SOFT, 6), W / 2 + jit, 640, 0.65 + 0.35 * math.sin(t * 8))
    else:
        u = t - TG; g = max(0.0, 1 - u / 0.7)
        fx2 = Fx()
        for k, (r, col) in enumerate(((330, PINK), (410, GOLD), (500, SOFT))):
            for j in range(3): fx2.arc(W / 2, 470, r, (u * (90 + 40 * k) * (1 if k % 2 == 0 else -1)) + j * 120, (u * (90 + 40 * k) * (1 if k % 2 == 0 else -1)) + j * 120 + 55, col, 6, 200 * prog(u, 0.2, 0.5))
        sw = prog(u, 0, 0.8); fx2.ring(W / 2, 470, 60 + ease_out(sw) * 1500, CREAM, 8, 255 * (1 - sw))
        fx2.apply(cv, 0.9)
        jit = int(rng.integers(-60, 60) * g)
        cv.over(text('MAHA KHALIQ', 't', 300, CREAM, 8), W / 2 + jit, 470, 1, s=1 + 0.012 * math.sin(t * 3) + 0.02 * beat_pulse(T), glow=(50, 0.9 + 0.5 * beat_pulse(T), PINK))
        a = prog(u, 1.0, 0.5)
        cv.rect(W / 2 - 330 * ease_out(a), 640, 660 * ease_out(a), 5, GOLD, 1)
        kinetic(cv, 'GAME DEVELOPER  ·  CS (GAMING & ANIMATION)', 'bs', 42, GOLD, W / 2, 715, u, 1.0, 5, 0.025)
        cv.over(text('> PLAYER ONE READY' + ('_' if int(t * 3) % 2 == 0 else ' '), 'b', 30, SOFT, 2, 'left'), 130, 930, prog(u, 1.3, 0.3), anchor='l')
        if g > 0:
            for k in range(7):
                cv.rect(int(rng.integers(0, W - 400)), int(rng.integers(120, 960)), int(rng.integers(200, 900)), int(rng.integers(6, 24)), PINK if k % 2 else CREAM, 0.85 * g)
    if glitching:
        k = 1.0 if t < TG + 0.1 else max(0.0, 1 - (t - TG - 0.1) / 0.6)
        glitch(cv.a, rng, k * 0.9 + 0.1)
        if t >= TG - 0.02: cv.flash(0.5 * max(0, 1 - (t - TG + 0.02) / 0.25))
    return cv.a

# ------------------------------------------------------------------ SCENE 2: INTRO
def scene2(t, rng):
    T = t + 4; cv = new_cv(T, 0.12)
    fx = Fx(); stripes(fx, T, PINK, 18); fx.apply(cv)
    particles(cv, T, 1.0)
    cx, cy = 520, 540
    s = pop(t, 0.3, 0.65); bob = math.sin(t * 1.3) * 6
    fx = Fx()
    for k, (r, sp_) in enumerate(((500, 60), (560, -40))):
        for j in range(4): fx.arc(cx, cy + bob, r, t * sp_ + j * 90, t * sp_ + j * 90 + 40, PINK if k == 0 else GOLD, 5, 200 * prog(t, 0.7, 0.5))
    ang = t * 1.4
    for k in range(3): fx.ring(cx + math.cos(ang + k * 2.1) * 500, cy + bob + math.sin(ang + k * 2.1) * 500, 14, SOFT, 6, 230 * prog(t, 0.8, 0.5))
    sw = prog(t, 0.3, 0.9); fx.ring(cx, cy, 300 + ease_out(sw) * 900, PINK, 8, 255 * (1 - sw))
    fx.apply(cv)
    outline = rrect(640, 800, 44, None, PINK, 8)
    cv.over(outline, cx, cy + bob, 1, s=s, glow=(36, 1.0 + 0.6 * beat_pulse(T), PINK))
    cv.over(PHOTO_SP, cx, cy + bob, prog(t, 0.3, 0.15), s=s)
    cv.over(outline, cx, cy + bob, prog(t, 0.3, 0.15), s=s)
    cv.over(rrect(300, 64, 32, PINK), cx, cy + bob + 400 * s, prog(t, 1.0, 0.3), s=s)
    cv.over(text('PLAYER 01', 't', 44, BG, 5), cx, cy + bob + 400 * s, prog(t, 1.0, 0.3), s=s)
    tx = 960
    kinetic(cv, 'GAME DEVELOPER', 't', 150, PINK, tx, 360, t, 1.0, 4, 0.05, glow=(40, 0.8), anchor='l')
    ln = ease_out(prog(t, 1.5, 0.6)); cv.rect(tx, 452, 200 * ln + 40 * beat_pulse(T), 5, GOLD, 1)
    for sp_, y, t0 in ((text('Unity  ·  Unreal Engine  ·  AR/VR', 'bb', 52, CREAM, 0, 'left'), 540, 1.7),
                       (text('BSc CS (Gaming & Animation),', 'b', 40, SOFT, 0, 'left'), 650, 2.4),
                       (text('NED University | Karachi', 'b', 40, SOFT, 0, 'left'), 710, 2.7)):
        p = ease_out(prog(t, t0, 0.7))
        if p > 0: cv.over(wipe(sp_, p), tx + (1 - p) * -40, y, 1, anchor='l')
    marquee(cv, 'UNITY  •  UNREAL ENGINE  •  AR / VR  •  GAMEPLAY PROGRAMMING  •  C#  •  C++  •  PYTHON  •  ', 1040, t, 150, 0.6, SOFT, 26)
    return cv.a

# ------------------------------------------------------------------ SCENE 3: SKILLS
def scene3(t, rng):
    T = t + 10; cv = new_cv(T, 0.12)
    fx = Fx(); grid_floor(fx, T, PINK, 34, 0.55); fx.apply(cv, 0.7)
    particles(cv, T, 0.6, sparks=False)
    kinetic(cv, 'I BUILD WORLDS WITH', 't', 130, CREAM, W / 2, 130, t, 0.15, 6, 0.04, glow=(30, 0.4, PINK))
    p = ease_out(prog(t, 0.5, 0.8)); cv.rect(W / 2 - 220 * p, 205, 440 * p, 5, PINK, 1)
    tile = rrect(300, 220, 30, BG2, PINK, 3)
    fx = Fx()
    for i, (name, mono, col) in enumerate(LOGOS):
        c, r = i % 4, i // 4
        x, y = W / 2 + (c - 1.5) * 360, 350 + r * 262
        t0 = 0.8 + i * 0.1
        burst(fx, x, y, t, t0 + 0.1, [PINK, GOLD, SOFT][i % 3], 10, 60, 240, 0.5)
        s = pop(t, t0, 0.5)
        if s <= 0: continue
        fy = math.sin(t * 1.6 + i) * 7; fx_ = math.sin(t * 1.1 + i * 2) * 4
        cv.over(tile, x + fx_, y + fy, 1, s=s, glow=(20, 0.35 + 0.5 * beat_pulse(T), PINK))
        cv.over(LOGO_SP[i], x + fx_, y + fy - 22, 1, s=s)
        cv.over(text(name, 'bs', 30, CREAM), x + fx_, y + fy + 76, 1, s=s)
    cv.rect(W / 2 - 700, 770, 1400 * ease_out(prog(t, 3.8, 0.5)), 2, GOLD, 0.6)
    for i, (label, fn) in enumerate(ICONS):
        x, y = W / 2 + (i - 1.5) * 400, 880
        t0 = 4.2 + i * 0.15
        burst(fx, x, y, t, t0 + 0.1, GOLD, 12, 50, 200, 0.5)
        s = pop(t, t0, 0.5)
        if s <= 0: continue
        fy = math.sin(t * 1.5 + i * 1.3) * 6
        cv.over(rrect(150, 150, 75, BG2, PINK, 3), x, y + fy, 1, s=s, glow=(24, 0.5 + 0.5 * beat_pulse(T), PINK))
        cv.over(fn(84, CREAM), x, y + fy, 1, s=s)
        cv.over(text(label, 'bs', 28, SOFT), x, y + fy + 112, prog(t, t0 + 0.1, 0.3), s=s)
    fx.apply(cv)
    return cv.a

# ------------------------------------------------------------------ SCENE 4: PROJECTS
CARD_W, CARD_H, VID_W, VID_H = 1300, 740, 1276, 622
_vid_mask = None
def vid_mask():
    global _vid_mask
    if _vid_mask is None:
        m = Image.new('L', (VID_W * 2, VID_H * 2), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, VID_W * 2 - 1, VID_H * 2 - 1], 20, fill=255)
        _vid_mask = np.asarray(m.resize((VID_W, VID_H), Image.LANCZOS), dtype=np.float32)[..., None] / 255
    return _vid_mask
_gy, _gx = np.mgrid[0:VID_H, 0:VID_W].astype(np.float32)
_clips = {}
def get_clip(i):
    k = PROJECTS[i][2]
    if k not in _clips: _clips[k] = np.load(os.path.join(HERE, 'clips', k + '.npy'), mmap_mode='r')
    return _clips[k]
_yy, _xx = np.mgrid[0:VID_H, 0:VID_W].astype(np.float32)
VIGN = (1 - 0.5 * np.clip(((_xx - VID_W / 2) / (VID_W / 2)) ** 2 + ((_yy - VID_H / 2) / (VID_H / 2)) ** 2 - 0.35, 0, 1))[..., None]
SCANV = np.ones((VID_H, 1, 1), np.float32); SCANV[::3] = 0.86
def clip_hud(i, u):
    im = Image.new('RGBA', (VID_W, VID_H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    m, L = 26, 70
    for (x, y, fx, fy) in ((m, m, 1, 1), (VID_W - m, m, -1, 1), (m, VID_H - m, 1, -1), (VID_W - m, VID_H - m, -1, -1)):
        d.line([x, y, x + fx * L, y], fill=PINK + (230,), width=5); d.line([x, y, x, y + fy * L], fill=PINK + (230,), width=5)
    d.text((52, 44), 'STAGE %02d' % (i + 1), font=font('bs', 24), fill=SOFT + (235,))
    if int(u * 2.5) % 2 == 0: d.ellipse([VID_W - 150, 50, VID_W - 134, 66], fill=(255, 60, 90, 255))
    d.text((VID_W - 124, 44), 'REC', font=font('bs', 24), fill=SOFT + (235,))
    d.text((VID_W - 250, VID_H - 74), '60 FPS', font=font('bs', 22), fill=GOLD + (230,))
    hp = 0.62 + 0.3 * math.sin(u * 2.2 + i)
    d.text((52, VID_H - 76), 'HP', font=font('bs', 22), fill=SOFT + (235,))
    d.rounded_rectangle([96, VID_H - 66, 96 + 260, VID_H - 48], 8, outline=PINK + (255,), width=3)
    d.rounded_rectangle([100, VID_H - 62, 100 + int(252 * hp), VID_H - 52], 5, fill=PINK + (255,))
    return np.asarray(im, np.float32)
def project_art(i, u):
    fr = get_clip(i); idx = int(clamp(u * 30, 0, len(fr) - 1))
    a = np.asarray(fr[idx], np.float32) * np.array([1.05, 0.98, 1.05], np.float32)
    a = a * VIGN * SCANV
    if u < 0.3:   # pixel-dissolve on entry
        bs = int(2 + (1 - u / 0.3) * 40)
        a = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((VID_W // bs + 1, VID_H // bs + 1), Image.NEAREST).resize((VID_W, VID_H), Image.NEAREST), np.float32)
    c = u * 30 - 42   # cut between the two moments: flash + RGB split
    if 0 <= c < 5:
        k = 1 - c / 5; a = a * (1 - 0.55 * k) + 255 * 0.55 * k
        a[..., 0] = np.roll(a[..., 0], int(18 * k), axis=1); a[..., 2] = np.roll(a[..., 2], -int(18 * k), axis=1)
    ov = clip_hud(i, u); al = ov[..., 3:4] / 255
    a = a * (1 - al) + ov[..., :3] * al
    return np.concatenate([np.clip(a, 0, 255), np.ones((VID_H, VID_W, 1), np.float32) * 255], axis=2)

def scene4(t, rng):
    T = t + 18; cv = new_cv(T, 0.12)
    fx = Fx(); stripes(fx, T, GOLD, 14, 200, 90); fx.apply(cv)
    particles(cv, T, 0.5, sparks=False)
    kinetic(cv, 'SELECTED PROJECTS', 't', 74, PINK, 130, 118, t, 0.0, 6, 0.035, anchor='l')
    idx = min(5, max(0, int((t - 1.0) // 2.5)))
    cv.over(text('%02d / 06' % (idx + 1), 'bs', 34, SOFT, 4, 'right'), W - 130, 118, 1, anchor='r')
    if int(t * 2) % 2 == 0: cv.over(disc(9, PINK, 0.9), W - 400, 118)
    cv.over(text('REC', 'bs', 24, SOFT, 4, 'right'), W - 415, 118, 0.9, anchor='r')
    frame = rrect(CARD_W, CARD_H, 26, BG2, PINK, 6); bar = rrect(1276, 84, 16, PINK)
    for i in range(6):
        s_i = 1.0 + 2.5 * i; t_in, t_out = s_i - 0.3, s_i + 2.5
        if t < t_in or t > t_out + 0.001: continue
        x = 960; vel = 0
        if t < s_i: x += (1 - ease_io(prog(t, t_in, 0.3))) * W; vel = abs(ease_io(prog(t + 0.017, t_in, 0.3)) - ease_io(prog(t - 0.017, t_in, 0.3))) * W
        elif i < 5 and t > t_out - 0.3: x -= ease_io(prog(t, t_out - 0.3, 0.3)) * W; vel = abs(ease_io(prog(t + 0.017, t_out - 0.3, 0.3)) - ease_io(prog(t - 0.017, t_out - 0.3, 0.3))) * W
        lay = np.zeros((CARD_H + 140, CARD_W + 60, 4), np.float32)
        def put(sp, ox, oy, op=1.0):
            im = sp.img; w, h = im.size; x0, y0 = int(ox - w / 2), int(oy - h / 2)
            src = np.asarray(im, np.float32); X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(lay.shape[1], x0 + w), min(lay.shape[0], y0 + h)
            s_ = src[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]; al = s_[..., 3:4] / 255 * op
            dst = lay[Y0:Y1, X0:X1]; da = dst[..., 3:4] / 255; outa = al + da * (1 - al)
            dst[..., :3] = np.where(outa > 0, (s_[..., :3] * al + dst[..., :3] * da * (1 - al)) / np.maximum(outa, 1e-6), 0); dst[..., 3:4] = outa * 255
        ccx, ccy = (CARD_W + 60) // 2, (CARD_H + 140) // 2 - 30
        put(frame, ccx, ccy); put(bar, ccx, ccy - 316)
        art = project_art(i, t - s_i + 0.3); m = vid_mask(); y0 = ccy - 264; x0 = ccx - VID_W // 2
        reg = lay[y0:y0 + VID_H, x0:x0 + VID_W]; reg[..., :3] = art[..., :3]; reg[..., 3:4] = m * 255
        tsp = text(PROJECTS[i][0], 't', 58, BG, 3, 'left'); put(tsp, ccx - 600 + tsp.size[0] / 2 - 20, ccy - 316)
        lab = text('PROJECT %02d' % (i + 1), 'bs', 26, BG, 3, 'right'); put(lab, ccx + 596 - lab.size[0] / 2 + 20, ccy - 316)
        tag = PROJECTS[i][1]; tw = int(font('bs', 32).getlength(tag)) + 80
        put(rrect(tw, 64, 32, PINK), ccx, ccy + 392); put(text(tag, 'bs', 32, BG), ccx, ccy + 392)
        card = Image.fromarray(lay.astype(np.uint8), 'RGBA')
        if vel > 4:
            n = int(min(14, 3 + vel / 40)); acc = np.zeros(lay.shape, np.float32)
            for k in range(n): acc += np.roll(lay, int((k / (n - 1) - 0.5) * vel * 0.9), axis=1)
            card = Image.fromarray((acc / n).astype(np.uint8), 'RGBA')
        sp = Sp(card)
        cv.add(sp.glow(34, PINK), x, 560, 0.25 + 0.35 * beat_pulse(T))
        cv.over(sp, x, 560)
    # segmented progress bar
    for i in range(6):
        fill = clamp((t - (1.0 + 2.5 * i)) / 2.5)
        cv.rect(300 + i * 215, 1022, 195, 8, SOFT, 0.18); cv.rect(300 + i * 215, 1022, 195 * fill, 8, PINK, 1)
    return cv.a

# ------------------------------------------------------------------ SCENE 5: ACHIEVEMENTS
def sweep(cv, sp, x, y, t, t0, s=1.0, period=2.2, op=0.9):
    ph = ((t - t0) % period) / period
    if t < t0 or ph > 0.55: return
    a = np.asarray(sp.img, np.float32); h, w = a.shape[:2]
    xs = np.arange(w, dtype=np.float32)[None, :]; cx = -100 + (w + 200) * (ph / 0.55)
    band = np.exp(-(((xs - cx) - (np.arange(h, dtype=np.float32)[:, None] - h / 2) * 0.5) ** 2) / (2 * 38 ** 2))
    out = np.zeros((h, w, 4), np.uint8); out[..., :3] = 255; out[..., 3] = (a[..., 3] * band).astype(np.uint8)
    cv.add(Sp(Image.fromarray(out, 'RGBA')), x, y, op, s)

def scene5(t, rng):
    T = t + 34; cv = new_cv(T, 0.14)
    fx = Fx(); stripes(fx, T, PINK, 16, 190, -70); fx.apply(cv)
    particles(cv, T, 0.7)
    kinetic(cv, 'ACHIEVEMENTS', 't', 110, CREAM, W / 2, 130, t, 0.1, 8, 0.045, glow=(30, 0.4, PINK))
    p = ease_out(prog(t, 0.6, 0.7)); cv.rect(W / 2 - 170 * p, 205, 340 * p, 5, GOLD, 1)
    tile = rrect(440, 560, 36, BG2, GOLD, 3)
    fx = Fx()
    for (x, kind, t0) in [(480, 'x2', 0.8), (960, 'rd', 1.5), (1440, 'in', 2.2)]:
        burst(fx, x, 590, t, t0 + 0.05, GOLD, 20, 120, 700, 0.8)
        s = pop(t, t0, 0.55)
        if s <= 0: continue
        y = 590 + math.sin(t * 1.4 + x) * 5
        cv.over(tile, x, y, 1, s=s, glow=(26, 0.35 + 0.5 * beat_pulse(T), GOLD))
        ic = ic_trophy(130, GOLD) if kind != 'in' else ic_pad(130, GOLD)
        ti = pop(t, t0 + 0.25, 0.5)
        cv.over(ic, x, y - 180, 1, s=ti, glow=(18, 0.8, GOLD) if ti > 0 else None)
        d = 1.2; q = prog(t, t0 + 0.3, d)
        if kind == 'x2': big, lab = ('%dx' % round(2 * q)), 'GAME CON\nRUNNER-UP'
        elif kind == 'rd': big = ('%d' % round(3 * q)) if q < 1 else '3RD'; lab = 'NED GAME\nEXHIBITION 2025'
        else: big = '%d' % round(3 * q); lab = 'INDUSTRY\nINTERNSHIPS'
        bs = text(big, 't', 230, PINK, 4)
        cv.over(bs, x, y - 10, 1, s=s * (1 + 0.04 * (1 - q) * math.sin(t * 40)), glow=(34, 0.7, PINK))
        if q >= 1: sweep(cv, bs, x, y - 10, t, t0 + 0.3 + d + 0.1, s)
        cv.over(text(lab, 'bs', 36, CREAM, 3, gap=1.25), x, y + 150, prog(t, t0 + 0.35, 0.4), s=s)
    fx.apply(cv)
    return cv.a

# ------------------------------------------------------------------ SCENE 6: OUTRO (QR)
def _qr_card():
    im = Image.open(os.path.join(HERE, 'assets', 'qr.png')).convert('L'); a = np.asarray(im) < 128
    ys, xs = np.where(a); q = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((500, 500), Image.LANCZOS)
    card = Image.new('RGBA', (600, 600), (0, 0, 0, 0)); m = Image.new('L', (1800, 1800), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 1799, 1799], 90, fill=255)
    base = Image.new('RGBA', (600, 600), (255, 255, 255, 255)); base.putalpha(m.resize((600, 600), Image.LANCZOS))
    base.paste(q.convert('RGBA'), (50, 50)); return Sp(base)
QR_SP = _qr_card()

def scene6(t, rng):
    T = t + 40; cv = new_cv(T, 0.16)
    qx, qy = 1440, 500
    fx = Fx(); grid_floor(fx, T, PINK, 40, 0.7)
    for k in range(6):
        q = ((T / BEAT) / 2 - k * 0.5) % 3 / 3
        fx.ring(qx, qy, 200 + q * 1100, PINK if k % 2 else GOLD, 4, 200 * (1 - q) * prog(t, 0.8, 0.5))
    burst(fx, qx, qy, t, 1.25, GOLD, 24, 300, 760, 0.9)
    fx.apply(cv)
    particles(cv, T, 0.8)
    cv.add(disc(520, PINK, 1.0), 560, 470, (0.10 + 0.08 * beat_pulse(T)) * ease_out(prog(t, 0, 0.8)))
    ti = text("LET'S BUILD\nSOMETHING\nUNFORGETTABLE", 't', 158, CREAM, 6, gap=0.98)
    cv.over(wipe(ti, ease_out(prog(t, 0.2, 0.9))), 560, 450, 1, s=1 + 0.012 * beat_pulse(T), glow=(46, 0.7 + 0.6 * beat_pulse(T), PINK))
    ln = ease_out(prog(t, 1.2, 0.6)); cv.rect(560 - 300 * ln, 720, 600 * ln, 5, GOLD, 1)
    s = pop(t, 1.1, 0.7)
    if s > 0:
        bob = math.sin(t * 1.6) * 5
        cv.over(QR_SP, qx, qy + bob, 1, s=s, glow=(40, 0.5 + 0.7 * beat_pulse(T), PINK))
        # game-style scan frame + sweeping scan line
        if s > 0.9:
            L = 70; x0, x1, y0, y1 = qx - 330, qx + 330, qy + bob - 330, qy + bob + 330
            for (x, y, fx_, fy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
                cv.rect(x if fx_ > 0 else x - L, y - 3, L, 6, PINK, 1); cv.rect(x - 3, y if fy > 0 else y - L, 6, L, PINK, 1)
            ph = (t * 0.8) % 1; sy = qy + bob - 295 + ph * 590
            cv.rect(qx - 295, sy - 3, 590, 6, PINK, 0.85); cv.rect(qx - 295, sy - 40, 590, 37, PINK, 0.18 * (1 - ph))
    kinetic(cv, 'SCAN TO CONNECT', 'bs', 40, SOFT, qx, 900, t, 2.0, 8, 0.04)
    marquee(cv, "LET'S BUILD SOMETHING UNFORGETTABLE  •  GAME DEVELOPER  •  MAHA KHALIQ  •  ", 1030, t, 160, 0.5, SOFT, 26)
    cv.flash(prog(t, 5.0 - 1.2, 1.2), BG)
    return cv.a

SCENES = [scene1, scene2, scene3, scene4, scene5, scene6]
HITS = [TG] + STARTS[1:6] + [19.0 + 2.5 * i - 0.0 for i in range(6)] + [34.8, 35.5, 36.2, 43.0]

# ------------------------------------------------------------------ gaming HUD / effects (master level)
LEVELUPS = [4.25, 10.25, 18.25, 34.25]
POPUPS = []
for _i in range(8): POPUPS.append((10.8 + _i * 0.1 + 0.25, W / 2 + (_i % 4 - 1.5) * 360 + 110, 350 + (_i // 4) * 262 - 70, '+50 XP'))
for _i in range(6): POPUPS.append((19.0 + 2.5 * _i + 0.25, 1530, 150, '+100 XP'))
for _x, _t0 in ((480, 0.8), (960, 1.5), (1440, 2.2)): POPUPS.append((34 + _t0 + 0.6, _x, 330, '+500 XP'))
TOASTS = [(34 + 0.8 + 0.7, 'Game Con Runner-Up  ×2'), (34 + 1.5 + 0.7, '3rd Place · NED Game Exhibition 2025'), (34 + 2.2 + 0.7, '3 Industry Internships')]
_toast_cache = {}
def toast_sprite(label):
    if label not in _toast_cache:
        im = Image.new('RGBA', (760, 84), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([2, 2, 757, 81], 20, fill=BG2 + (240,), outline=GOLD + (255,), width=3)
        im.paste(ic_trophy(52, GOLD).img, (24, 16), ic_trophy(52, GOLD).img)
        d.text((100, 12), 'ACHIEVEMENT UNLOCKED', font=font('bs', 18), fill=GOLD + (255,))
        d.text((100, 36), label, font=font('bb', 28), fill=CREAM + (255,))
        _toast_cache[label] = Sp(im)
    return _toast_cache[label]

def game_overlay(a, T):
    if T < 2.6: return a
    cv = Cv(a); fade = prog(T, 2.6, 0.5)
    segs = [2.6] + LEVELUPS + [45.0]
    lv = 1 + sum(1 for l in LEVELUPS if T >= l)
    s0, s1 = segs[lv - 1], segs[lv]; fill = clamp((T - s0) / (s1 - s0))
    flashk = max([math.exp(-(T - l) * 6) for l in LEVELUPS if T >= l] or [0])
    cv.over(text('LV %02d' % lv, 'bs', 26, GOLD, 4, 'left'), 130, 38, fade, anchor='l')
    cv.rect(228, 28, 300, 20, SOFT, 0.20 * fade); cv.rect(231, 31, 294 * fill, 14, GOLD if flashk < 0.3 else CREAM, fade)
    cv.rect(228, 26, 300, 3, PINK, 0.8 * fade); cv.rect(228, 47, 300, 3, PINK, 0.8 * fade)
    score = int(max(0, T - 2.0) * 1000) + 500 * sum(1 for p in POPUPS if T >= p[0])
    cv.over(text('SCORE %06d' % score, 'bs', 26, SOFT, 4, 'right'), W - 130, 38, fade, anchor='r')
    fx = Fx()
    for l in LEVELUPS:
        u = T - l
        if 0 <= u < 1.4:
            sc = ease_back(prog(u, 0, 0.35)); op = 1.0 if u < 1.1 else 1 - (u - 1.1) / 0.3
            cv.over(rrect(430, 74, 37, BG2, GOLD, 4), W / 2, 62, op, s=sc, glow=(26, 0.9, GOLD))
            cv.over(text('LEVEL UP!', 't', 58, GOLD, 5), W / 2, 62, op, s=sc, glow=(18, 0.8, GOLD))
            burst(fx, W / 2, 62, T, l, GOLD, 14, 40, 340, 0.7)
    for (t0, x, y, label) in POPUPS:
        u = T - t0
        if 0 <= u < 1.0: cv.over(text(label, 't', 52, GOLD, 3), x, y - 70 * ease_out(u), 1 - u * u, s=0.8 + 0.3 * ease_back(prog(u, 0, 0.25)), glow=(14, 0.8, GOLD))
    for k, (t0, label) in enumerate(TOASTS):
        u = T - t0
        if 0 <= u < 2.9:
            sl = ease_out(prog(u, 0, 0.35)) if u < 2.5 else 1 - ease_io(prog(u, 2.5, 0.4))
            cv.over(toast_sprite(label), W - 130 - 380 + (1 - sl) * 800, 960 - k * 96, 1)
    fx.apply(cv)
    return cv.a

def draw_bars(a, c, b, T):
    n = 9; hh = H / n; cols = [PINK, GOLD, SOFT, CREAM]
    for i in range(n):
        f = clamp(c * 1.7 - 0.7 * i / (n - 1))
        if f <= 0: continue
        ww = int(f * W); y0 = int(i * hh); y1 = int((i + 1) * hh) + 1
        from_left = (i % 2 == 0) == (T < b)
        col = np.array(cols[i % 4], np.float32)
        if from_left: a[y0:y1, :ww] = col; a[y0:y1, max(0, ww - 8):ww] = 255
        else: a[y0:y1, W - ww:] = col; a[y0:y1, W - ww:W - ww + 8] = 255

def cover(T):
    for b in STARTS[1:6]:
        if b - 0.2 <= T < b: return ease_io(prog(T, b - 0.2, 0.2)), b
        if b <= T < b + 0.25: return 1 - ease_io(prog(T, b, 0.25)), b
    return 0.0, None

def master_frame(i):
    T = i / FPS
    rng = np.random.default_rng(i + 1000)
    k = min(5, max(j for j in range(6) if STARTS[j] <= T + 1e-9))
    a = SCENES[k](T - STARTS[k], rng)
    if T > 0.5: a[H - 5:, :int(W * T / DUR)] = np.array(PINK, np.float32)   # timeline bar
    # impact shake + chromatic punch, beat punch-zoom
    amp = 0.0
    for h in HITS:
        if T >= h: amp = max(amp, 16 * math.exp(-(T - h) * 13))
    if amp > 1.5:
        a = np.roll(a, (int(rng.integers(-1, 2) * amp), int(rng.integers(-1, 2) * amp)), axis=(1, 0))
        if amp > 9: a[..., 0] = np.roll(a[..., 0], int(amp * 0.35), axis=1); a[..., 2] = np.roll(a[..., 2], -int(amp * 0.35), axis=1)
    z = 1.0
    if T >= TG: z += 0.006 * beat_pulse(T)
    for h in HITS:
        if T >= h: z += 0.03 * math.exp(-(T - h) * 12)
    if z > 1.003:
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((int(W * z), int(H * z)), Image.BILINEAR)
        l, tp = (im.width - W) // 2, (im.height - H) // 2; a = np.asarray(im.crop((l, tp, l + W, tp + H)), np.float32)
    a = game_overlay(a, T)
    c, b = cover(T)
    if c > 0: draw_bars(a, c, b, T)
    a = a * SCAN
    return np.clip(a, 0, 255).astype(np.uint8)

# ------------------------------------------------------------------ main
def _work(i): return i, master_frame(i).tobytes()

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        os.makedirs(os.path.join(HERE, 'stills'), exist_ok=True)
        for tv in sys.argv[2:]:
            T = float(tv); Image.fromarray(master_frame(int(round(T * FPS)))).save(os.path.join(HERE, 'stills', 't%05.2f.png' % T)); print('saved', T)
        sys.exit()
    import multiprocessing as mp, imageio_ffmpeg, audio_gen
    audio = os.path.join(HERE, 'mix.wav'); print('audio rms', audio_gen.write(audio))
    out = os.path.join(os.path.dirname(HERE), 'MahaKhaliq_Promo.mp4')
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
           '-i', audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = DUR * FPS
    with mp.Pool(10) as pool:
        for n, (i, b) in enumerate(pool.imap(_work, range(total), chunksize=4)):
            pr.stdin.write(b)
            if n % 60 == 0: print('frame', n, '/', total, flush=True)
    pr.stdin.close(); pr.wait(); print('done', out)
