"""Original soundtrack + SFX for the Maha Khaliq promo (dark, driving alt-electronic, E minor, 120 BPM).
Everything is synthesised here – no samples, no copyrighted material."""
import numpy as np, wave
from scipy.signal import butter, sosfilt, fftconvolve

sr, DUR = 44100, 45
N = sr * DUR
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(21)

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def tarr(d): return np.arange(int(d * sr)) / sr
def lp(x, fc, o=2): return sosfilt(butter(o, min(fc, sr * 0.45), 'low', fs=sr, output='sos'), x)
def hp(x, fc, o=2): return sosfilt(butter(o, fc, 'high', fs=sr, output='sos'), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, min(hi, sr * 0.45)], 'band', fs=sr, output='sos'), x)
def saw(f, t, ph=0.0): return 2 * ((f * t + ph) % 1.0) - 1
def pulse(f, t, w=0.35): return np.where(((f * t) % 1.0) < w, 1.0, -1.0)
def adsr(n, a, d, s, r):
    e = np.ones(n)
    na, nd, nr = int(a * sr), int(d * sr), int(r * sr)
    e[:na] = np.linspace(0, 1, max(na, 1))[:na]
    e[na:na + nd] = np.linspace(1, s, max(nd, 1))[:max(0, min(nd, n - na))]
    e[na + nd:] = s
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def expdec(n, k): return np.exp(-np.arange(n) / sr * k)

class Bus:
    def __init__(self): self.b = np.zeros((N, 2), np.float32)
    def add(self, t, x, g=1.0, pan=0.0):
        s = int(t * sr)
        if s >= N or s + len(x) <= 0: return
        if s < 0: x = x[-s:]; s = 0
        e = min(N, s + len(x)); x = x[:e - s]
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.b[s:e, 0] += x * g * l; self.b[s:e, 1] += x * g * r

# ------------------------------------------------------------------ instruments
def kick():
    t = tarr(0.42); f = 48 + 130 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / sr
    return (np.sin(ph) * expdec(len(t), 7.5) * 1.0 + np.sin(2 * np.pi * 2200 * t) * expdec(len(t), 300) * 0.25)
def snare():
    t = tarr(0.28); n = bp(rng.standard_normal(len(t)), 1200, 9000) * expdec(len(t), 17)
    return n * 0.7 + np.sin(2 * np.pi * (190 - 60 * t) * t) * expdec(len(t), 22) * 0.5
def clap():
    t = tarr(0.3); n = bp(rng.standard_normal(len(t)), 900, 6500)
    e = sum(expdec(len(t), 60) * (np.arange(len(t)) / sr > d) for d in (0, 0.012, 0.024)) * 0.4 + expdec(len(t), 18) * 0.5
    return n * e * 0.8
def hat(open_=False):
    d = 0.22 if open_ else 0.06; t = tarr(d)
    return hp(rng.standard_normal(len(t)), 7500) * expdec(len(t), 14 if open_ else 55) * 0.35
def tom(f0=150):
    t = tarr(0.35); f = f0 * (1 + 0.8 * np.exp(-t * 18)); ph = 2 * np.pi * np.cumsum(f) / sr
    return np.sin(ph) * expdec(len(t), 9) * 0.8
def supersaw(f, d, det=(-0.14, -0.07, 0.0, 0.07, 0.14)):
    t = tarr(d); return sum(saw(f * 2 ** (c / 12), t, rng.random()) for c in det) / len(det)
def pluck(f, d=0.28, cut=3800):
    t = tarr(d); x = saw(f, t) * 0.6 + pulse(f * 1.003, t, 0.3) * 0.4
    return lp(x, cut) * expdec(len(t), 9)
def lead(f, d=0.3):
    t = tarr(d); x = saw(f, t) * 0.5 + saw(f * 1.006, t) * 0.4 + np.sin(2 * np.pi * f * t) * 0.3
    return lp(x, 4200) * adsr(len(t), 0.008, 0.08, 0.6, 0.12)
def bass(f, d=0.24):
    t = tarr(d); x = saw(f, t) * 0.55 + np.sin(2 * np.pi * f * t) * 0.8
    return lp(x, 520) * adsr(len(t), 0.004, 0.06, 0.7, 0.05)
def whoosh(d=0.8, up=True, g=0.8):
    t = tarr(d); n = rng.standard_normal(len(t))
    out = np.zeros(len(t)); chunks = 24
    edges = np.linspace(0, len(t), chunks + 1).astype(int)
    for i in range(chunks):
        fc = (300 + 7000 * (i / chunks) ** 1.5) if up else (7000 - 6500 * (i / chunks))
        seg = bp(n[edges[i]:edges[i + 1]], max(fc * 0.6, 80), fc * 1.4 + 100, 1)
        out[edges[i]:edges[i + 1]] = seg
    e = np.sin(np.linspace(0, np.pi, len(t))) ** 1.6
    return out * e * g * 1.8
def impact(g=1.0, d=1.6):
    t = tarr(d); f = 38 + 60 * np.exp(-t * 6); ph = 2 * np.pi * np.cumsum(f) / sr
    sub = np.sin(ph) * expdec(len(t), 2.6)
    nz = lp(rng.standard_normal(len(t)), 3500) * expdec(len(t), 9) * 0.6
    crack = hp(rng.standard_normal(len(t)), 2000) * expdec(len(t), 60) * 0.5
    return (sub + nz + crack) * g
def riser(d=1.8, g=0.7):
    t = tarr(d); n = rng.standard_normal(len(t))
    sweep = np.zeros(len(t)); chunks = 40; edges = np.linspace(0, len(t), chunks + 1).astype(int)
    for i in range(chunks):
        fc = 400 + 9000 * (i / chunks) ** 2; sweep[edges[i]:edges[i + 1]] = hp(n[edges[i]:edges[i + 1]], fc, 1)
    f = 220 * 2 ** (3.2 * t / d); tone = np.sin(2 * np.pi * np.cumsum(f) / sr) * 0.3
    return (sweep * 0.9 + tone) * (np.linspace(0, 1, len(t)) ** 2) * g
def blip(f=880, d=0.09, g=0.5):
    t = tarr(d); return pulse(f, t, 0.5) * expdec(len(t), 28) * g
def coin(f=988, g=0.5):
    a = blip(f, 0.07, g); b = blip(f * 1.335, 0.25, g); out = np.zeros(int(0.35 * sr)); out[:len(a)] += a; out[int(0.07 * sr):int(0.07 * sr) + len(b)] += b; return out
def tick(g=0.4):
    t = tarr(0.03); return bp(rng.standard_normal(len(t)), 2500, 6500) * expdec(len(t), 160) * g
def sparkle(base=84, g=0.3):
    out = np.zeros(int(1.0 * sr))
    for i, k in enumerate([0, 4, 7, 12, 16, 19]):
        t = tarr(0.5); x = (np.sin(2 * np.pi * midi(base + k) * t) + 0.3 * np.sin(2 * np.pi * midi(base + k) * 2.76 * t)) * expdec(len(t), 7) * g
        s = int(i * 0.06 * sr); out[s:s + len(x)] += x
    return out
def levelup(g=0.35):
    out = np.zeros(int(1.2 * sr))
    for i, n in enumerate([64, 67, 71, 76, 79, 83]):
        b = blip(midi(n), 0.16, g); s = int(i * 0.06 * sr); out[s:s + len(b)] += b
    sp = sparkle(88, 0.14); out[:len(sp)] += sp[:len(out)]
    return out
def glitch_burst(d=0.7, g=0.8):
    x = np.zeros(int(d * sr))
    for _ in range(11):
        s = int(rng.uniform(0, d * 0.8) * sr); l = int(rng.uniform(0.02, 0.09) * sr)
        seg = np.round(rng.standard_normal(l) * 4) / 4 * 0.5 + np.sign(np.sin(2 * np.pi * rng.uniform(150, 2600) * np.arange(l) / sr)) * 0.35
        x[s:s + l] += seg * np.linspace(1, 0.2, l)
    return x * np.linspace(1, 0.3, len(x)) * g
def stutter(f=660, g=0.4):
    out = np.zeros(int(0.5 * sr)); gap = 0.055
    for i in range(7):
        b = blip(f * (1 + 0.12 * (i % 3)), 0.04, g * (1 - i * 0.1)); s = int(i * gap * sr); out[s:s + len(b)] += b
    return out

# ------------------------------------------------------------------ arrangement
CHORDS = [  # (root, [tones], lead pattern, bass root)
    (40, [52, 55, 59, 64], [83, None, 79, 83, 86, None, 83, 79], 40),   # Em
    (36, [48, 55, 60, 64], [84, None, 81, 84, 88, None, 84, 81], 36),   # C
    (43, [55, 59, 62, 67], [86, None, 83, 86, 91, None, 86, 83], 43),   # G
    (38, [50, 57, 62, 66], [81, None, 78, 81, 86, None, 81, 78], 38),   # D
]
BAR = 4 * BEAT
SC_BOUNDS = [4, 10, 18, 34, 40]

def build():
    drums, music, wet, sfx = Bus(), Bus(), Bus(), Bus()
    kick_times, big_hits = [], []
    # -------- drums & music per bar
    bars = int(DUR / BAR) + 1
    K, S, C, T = kick(), snare(), clap(), tom()
    for b in range(bars):
        t0 = b * BAR
        ch = CHORDS[b % 4]
        sec = t0
        has_drums = 2.0 <= sec < 43.0
        has_snare = sec >= 10.0 and sec < 43.0
        has_arp = sec >= 4.0 and sec < 43.5
        has_lead = (10.0 <= sec < 43.0) or (4.0 <= sec < 10.0 and b % 2 == 1)
        has_pad = sec >= 0 and sec < 44.5
        # kick (four on the floor, with a double hit on beat 4& in the build bars)
        if has_drums:
            for k in range(4):
                drums.add(t0 + k * BEAT, K, 0.95); kick_times.append(t0 + k * BEAT)
            if sec >= 18 and b % 2 == 1: drums.add(t0 + 3.5 * BEAT, K, 0.6); kick_times.append(t0 + 3.5 * BEAT)
            for k in range(8):   # hats
                if k % 2 == 1: drums.add(t0 + k * BEAT / 2, hat(True), 0.55, 0.3)
                else: drums.add(t0 + k * BEAT / 2, hat(False), 0.4, -0.2)
            if sec >= 4:
                for k in range(16):
                    if k % 2: drums.add(t0 + k * BEAT / 4, hat(False), 0.18, 0.4 if k % 4 == 1 else -0.4)
        if has_snare:
            for k in (1, 3): drums.add(t0 + k * BEAT, S, 0.8); drums.add(t0 + k * BEAT, C, 0.5, 0.2)
        if sec >= 18 and sec < 34 and b % 4 == 3:   # tom fill
            for i, f in enumerate([190, 170, 150, 130]): drums.add(t0 + 3 * BEAT + i * BEAT / 4, tom(f), 0.7, -0.4 + i * 0.25)
        # pad
        if has_pad:
            for n in ch[1]:
                d = BAR + 0.6
                x = lp(supersaw(midi(n), d), 1400 + 900 * (sec > 10)) * adsr(int(d * sr), 0.5, 0.3, 0.8, 0.6) * (0.055 if sec > 2 else 0.04)
                music.add(t0, x, 1.0, rng.uniform(-0.6, 0.6)); wet.add(t0, x, 0.5, 0)
        # bass (8ths)
        if sec >= 2.0 and sec < 43.5:
            for k in range(8):
                n = ch[3] + (12 if k % 4 == 3 else 0)
                music.add(t0 + k * BEAT / 2, bass(midi(n)), 0.55 if k % 2 == 0 else 0.4)
        # arp (16ths)
        if has_arp:
            tones = ch[1]
            for k in range(16):
                n = tones[[0, 2, 1, 3][k % 4]] + 12 * (1 + (k // 4) % 2)
                x = pluck(midi(n)) * 0.09; pan = -0.5 if k % 2 else 0.5
                music.add(t0 + k * BEAT / 4, x, 1.0, pan); wet.add(t0 + k * BEAT / 4, x, 0.5, pan)
        # lead hook
        if has_lead:
            for k, n in enumerate(ch[2]):
                if n is None: continue
                n2 = n + (12 if sec >= 34 else 0)
                x = lead(midi(n2), 0.3) * 0.11
                music.add(t0 + k * BEAT / 2, x, 1.0, 0.1); wet.add(t0 + k * BEAT / 2, x, 0.9, 0.1)
                for dl, gg in ((0.375, 0.42), (0.75, 0.22), (1.125, 0.1)):
                    wet.add(t0 + k * BEAT / 2 + dl, x, gg, -0.4 if dl == 0.75 else 0.4)
    # -------- intro (0-2s): drone, heartbeat, typing, riser, then DROP
    t = tarr(2.2); drone = lp(saw(41.2, t) + saw(41.5, t), 220) * adsr(len(t), 1.0, 0.3, 0.9, 0.2) * 0.2
    music.add(0, drone, 1.0); music.add(0, lp(supersaw(midi(52), 2.4), 900) * adsr(int(2.4 * sr), 1.0, 0.2, 0.8, 0.3) * 0.08, 1.0)
    for tt in (1.0, 1.25, 1.5, 1.75): drums.add(tt, K, 0.5)
    for i in range(14): sfx.add(0.05 + i * 0.045, tick(0.5), 1.0, rng.uniform(-0.3, 0.3))
    sfx.add(0.6, coin(1175, 0.45), 1.0)
    for k in range(1, 4): sfx.add(0.6 + k / 3, blip(784, 0.08, 0.28), 1.0)
    sfx.add(0.2, riser(1.8, 0.75), 1.0)
    # drop at 2.0
    sfx.add(2.0, impact(1.0), 1.0); sfx.add(2.0, glitch_burst(0.7), 0.9); sfx.add(2.1, stutter(520, 0.3), 1.0)
    big_hits.append(2.0)
    # -------- scene transitions
    for s in SC_BOUNDS:
        sfx.add(s - 0.35, whoosh(0.55, True, 0.9), 1.0); sfx.add(s - 0.02, impact(0.55, 1.0), 1.0); sfx.add(s - 0.9, riser(0.9, 0.45), 1.0)
        big_hits.append(s - 0.02)
    for lt in (4.25, 10.25, 18.25, 34.25): sfx.add(lt, levelup(), 1.0)
    # -------- scene 2 (4-10)
    sfx.add(4.3, whoosh(0.5, True, 0.7), 1.0); sfx.add(4.9, coin(1319, 0.35), 1.0)
    for tt, f in ((5.0, 740), (5.7, 880), (6.4, 988), (6.7, 1109)): sfx.add(tt, blip(f, 0.1, 0.4), 1.0, 0.3)
    sfx.add(5.2, sparkle(88, 0.18), 1.0)
    # -------- scene 3 (10-18)
    for i in range(8): sfx.add(10.8 + i * 0.1, coin(784 * 2 ** (i / 12), 0.28), 1.0, -0.6 + i * 0.17)
    for i in range(4): sfx.add(14.2 + i * 0.15, blip(988 * 2 ** (i / 6), 0.12, 0.4), 1.0, -0.5 + i * 0.33)
    sfx.add(14.2, sparkle(91, 0.2), 1.0)
    # -------- scene 4 (18-34): card whooshes + hits
    for i in range(6):
        s = 18 + 1.0 + 2.5 * i
        sfx.add(s - 0.38, whoosh(0.5, True, 0.8), 1.0); sfx.add(s - 0.04, impact(0.45, 0.9), 1.0); sfx.add(s + 0.1, tick(0.6), 1.0)
        big_hits.append(s - 0.04)
    # -------- scene 5 (34-40)
    for tt in (34.8, 35.5, 36.2):
        sfx.add(tt, impact(0.6, 1.0), 1.0); sfx.add(tt + 0.2, coin(1175, 0.4), 1.0); sfx.add(tt + 0.1, sparkle(86, 0.17), 1.0)
        for i in range(12): sfx.add(tt + 0.3 + i * 0.1, tick(0.45), 1.0, 0.0)
        sfx.add(tt + 1.55, coin(1568, 0.45), 1.0)
        big_hits.append(tt)
    # -------- scene 6 (40-45)
    sfx.add(40.2, impact(0.8, 1.3), 1.0); sfx.add(40.2, sparkle(79, 0.2), 1.0)
    for tt, f in ((41.7, 880), (42.0, 988), (42.3, 1175)): sfx.add(tt, blip(f, 0.12, 0.45), 1.0, 0.2)
    sfx.add(43.0, impact(0.5, 2.0), 1.0)
    for i, n in enumerate([64, 67, 71, 76, 79]):
        x = lp(supersaw(midi(n), 3.0), 2800) * adsr(int(3 * sr), 0.02, 0.5, 0.4, 1.6) * 0.11; music.add(43.0, x, 1.0, -0.5 + i * 0.25); wet.add(43.0, x, 0.8)
    big_hits += [40.2, 43.0]
    # -------- sidechain (kick pumps music) + ducking under big SFX (-18 dB spec)
    env = np.zeros(N, np.float32)
    for kt in kick_times:
        s = int(kt * sr); L = int(0.3 * sr)
        if s < N: env[s:s + L] = np.maximum(env[s:s + L], np.exp(-np.arange(min(L, N - s)) / sr * 11))
    sc = (1 - 0.6 * env)[:, None]
    duck = np.ones(N, np.float32); t_ax = np.arange(N) / sr
    for h in big_hits:
        w = np.clip(np.minimum((t_ax - (h - 0.2)) / 0.1, ((h + 0.9) - t_ax) / 0.5), 0, 1)
        duck = np.minimum(duck, 1 - (1 - 10 ** (-9 / 20)) * w)
    music.b *= sc * duck[:, None]
    # -------- reverb on the wet send
    ir_t = tarr(2.4); ir = [rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 2.4) for _ in range(2)]
    wl = fftconvolve(wet.b[:, 0], ir[0] * 0.02, mode='full')[:N]; wr = fftconvolve(wet.b[:, 1], ir[1] * 0.02, mode='full')[:N]
    verb = np.stack([wl, wr], 1).astype(np.float32)
    # -------- mix
    mix = music.b * 1.0 + drums.b * 0.9 * duck[:, None] ** 0.5 + sfx.b * 1.0 + verb * 0.9
    fade = np.minimum(1, t_ax / 0.5) * np.minimum(1, (DUR - t_ax) / 2.0)
    mix *= fade[:, None]
    # gentle bus compression / saturation, then loudness target
    mix = np.tanh(mix * 1.25) / np.tanh(1.25)
    mix = mix / np.max(np.abs(mix)) * 0.93
    return mix.astype(np.float32), kick_times

def write(path):
    mix, _ = build()
    w = wave.open(path, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes()); w.close()
    rms = float(np.sqrt((mix ** 2).mean())); return rms

if __name__ == '__main__':
    import os
    print('rms', write(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mix.wav')))
