// Generative sound design for the garden – no audio files needed.
// A sparse felt-key melody, wind, birdsong, a fountain,
// and soft UI / footstep effects, all synthesised live with the Web Audio API.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
// Felt-key melody with open voicings and rests between phrases.
const PHRASES = [
    [[62, 69], [66], [73], [69]],
    [[59, 67], [71], [69], [66]],
    [[59, 66], [62], [69], [66]],
    [[61, 69], [64], [71], [69]],
];
const ONSETS = [0, 2.3, 4.1, 7.25];

export class GardenAudio {
    #stepNoise = null;

    constructor() {
        this.ctx = null;
        this.enabled = false;
        this.zone = 'outside';
        this.nextBeatTime = 0;
        this.beatIndex = 0;
        this.nextBird = 0;
    }

    // Pre-recorded voice-over (young girl) – returns its duration in seconds
    async playVoice(name) {
        if (!this.ready || !this.enabled) return 0;
        try {
            if (!this.voiceCache[name]) {
                const data = await (await fetch(`./voice/${name}.wav`)).arrayBuffer();
                this.voiceCache[name] = await this.ctx.decodeAudioData(data);
            }
            const buffer = this.voiceCache[name], ctx = this.ctx, t = ctx.currentTime + 0.05;
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.value = 1.6;
            const send = ctx.createGain();
            send.gain.value = 0.18;
            src.connect(gain);
            gain.connect(this.master);
            gain.connect(send).connect(this.reverbSend);
            // duck the music while she talks
            const bus = this.musicBus.gain, base = this.zone === 'outside' ? 1.0 : 1.1;
            bus.cancelScheduledValues(t);
            bus.setTargetAtTime(base * 0.35, t, 0.25);
            bus.setTargetAtTime(base, t + buffer.duration, 0.8);
            src.start(t);
            return buffer.duration;
        } catch (e) { console.warn('voice failed', e); return 0; }
    }

    // current output loudness 0..1 (RMS) – handy for debugging
    level() {
        if (!this.analyser) return 0;
        const d = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(d);
        return Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length);
    }

    get ready() { return !!this.ctx && this.ctx.state === 'running'; }

    async start() {
        if (!this.ctx) this.#build();
        await this.ctx.resume();
        this.nextBeatTime = this.ctx.currentTime + 0.2;
        return this.ctx.state === 'running';
    }

    setEnabled(on) {
        this.enabled = on;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(on ? 1.0 : 0, t, on ? 0.3 : 0.12);
    }

    setZone(zone) {
        if (!this.ctx || this.zone === zone) return;
        this.zone = zone;
        const t = this.ctx.currentTime;
        this.windGain.gain.setTargetAtTime(zone === 'outside' ? 0.045 : 0.02, t, 1.4);
        this.musicBus.gain.setTargetAtTime(zone === 'outside' ? 1.0 : 1.1, t, 1.4);
    }

    // 0..1 loudness of the fountain depending on distance
    setFountain(distance) {
        if (!this.ctx) return;
        const level = this.zone === 'inside' ? Math.max(0, 1 - distance / 11) : 0;
        this.waterGain.gain.setTargetAtTime(level * 0.09, this.ctx.currentTime, 0.4);
    }

    // ---------- graph ----------
    #build() {
        const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.3;
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.master.connect(comp);
        comp.connect(this.analyser);
        comp.connect(ctx.destination);

        // reverb
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = this.#impulse(3.4, 2.6);
        const wet = ctx.createGain();
        wet.gain.value = 0.55;
        this.reverb.connect(wet).connect(this.master);
        this.reverbSend = ctx.createGain();
        this.reverbSend.gain.value = 1;
        this.reverbSend.connect(this.reverb);

        // music bus (dry + room reverb)
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 1.0;
        this.musicBus.connect(this.master);
        this.musicBus.connect(this.reverbSend);
        this.voiceCache = {};

        // sfx bus
        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);
        const sfxVerb = ctx.createGain();
        sfxVerb.gain.value = 0.35;
        this.sfx.connect(sfxVerb).connect(this.reverbSend);

        this.#buildAmbience();
        this.timer = setInterval(() => this.#schedule(), 100);
    }

    #impulse(seconds, decay) {
        const ctx = this.ctx, length = Math.floor(ctx.sampleRate * seconds);
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const data = buffer.getChannelData(c);
            for (let i = 0; i < length; i++) {
                const t = i / length;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (t < 0.01 ? t * 100 : 1);
            }
        }
        return buffer;
    }

    #noise(seconds = 4, type = 'pink') {
        const ctx = this.ctx, length = ctx.sampleRate * seconds;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, last = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            if (type === 'brown') { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; }
            else { b0 = 0.99765 * b0 + white * 0.099046; b1 = 0.963 * b1 + white * 0.2965164; b2 = 0.57 * b2 + white * 1.0526913; data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2; }
        }
        return buffer;
    }

    #buildAmbience() {
        const ctx = this.ctx;
        // wind
        const wind = ctx.createBufferSource();
        wind.buffer = this.#noise(6, 'brown');
        wind.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass'; band.frequency.value = 420; band.Q.value = 0.5;
        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0.045;
        wind.connect(band).connect(this.windGain).connect(this.master);
        wind.start();

        // fountain: bright filtered noise with fast shimmer
        const water = ctx.createBufferSource();
        water.buffer = this.#noise(5, 'pink');
        water.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 1500;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 7500;
        this.waterGain = ctx.createGain();
        this.waterGain.gain.value = 0;
        water.connect(hp).connect(lp).connect(this.waterGain).connect(this.master);
        water.start();
    }

    // ---------- scheduling ----------
    #schedule() {
        if (!this.ready) return;
        const ctx = this.ctx;
        if (this.nextBeatTime < ctx.currentTime) this.nextBeatTime = ctx.currentTime + 0.02;
        if (this.enabled && this.nextBeatTime < ctx.currentTime + 0.35) {
            const step = this.beatIndex % ONSETS.length;
            const phrase = PHRASES[Math.floor(this.beatIndex / ONSETS.length) % PHRASES.length];
            for (const note of phrase[step]) this.#feltKey(this.nextBeatTime, note);
            this.nextBeatTime += (ONSETS[step + 1] ?? 11.5) - ONSETS[step];
            this.beatIndex++;
        }
        if (this.enabled && ctx.currentTime > this.nextBird) {
            this.#bird(ctx.currentTime + 0.05);
            this.nextBird = ctx.currentTime + rand(this.zone === 'outside' ? 2.5 : 5, this.zone === 'outside' ? 7 : 12);
        }
    }

    #env(gain, time, attack, peak, release) {
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(peak, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
    }

    #feltKey(time, note) {
        for (const [harmonic, peak, decay] of [[1, 0.075, 3.8], [2, 0.014, 1.5], [3, 0.004, 0.65]]) {
            const oscillator = this.ctx.createOscillator();
            oscillator.frequency.value = midi(note) * harmonic;
            const gain = this.ctx.createGain();
            this.#env(gain, time, 0.035, peak, decay);
            oscillator.connect(gain).connect(this.musicBus);
            oscillator.start(time);
            oscillator.stop(time + decay + 0.05);
        }
    }

    #bird(time) {
        const ctx = this.ctx;
        const base = rand(2400, 4200), notes = Math.floor(rand(2, 5));
        const pan = ctx.createStereoPanner();
        pan.pan.value = rand(-0.9, 0.9);
        pan.connect(this.master);
        pan.connect(this.reverbSend);
        for (let i = 0; i < notes; i++) {
            const t = time + i * rand(0.08, 0.13);
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(base * rand(0.9, 1.1), t);
            osc.frequency.exponentialRampToValueAtTime(base * rand(1.15, 1.5), t + 0.06);
            osc.frequency.exponentialRampToValueAtTime(base * rand(0.8, 1), t + 0.1);
            const gain = ctx.createGain();
            this.#env(gain, t, 0.01, this.zone === 'outside' ? 0.07 : 0.035, 0.09);
            osc.connect(gain).connect(pan);
            osc.start(t); osc.stop(t + 0.14);
        }
    }

    // ---------- public effects ----------
    step(surface = 'stone') {
        if (!this.ready || !this.enabled) return;
        const ctx = this.ctx, t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this.#stepNoise ||= this.#noise(1, 'pink');
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        filter.type = 'bandpass';
        filter.frequency.value = (surface === 'stone' ? rand(900, 1500) : rand(350, 650));
        filter.Q.value = 0.8;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(surface === 'stone' ? 1.0 : 0.8, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (surface === 'stone' ? 0.09 : 0.14));
        const pan = ctx.createStereoPanner();
        pan.pan.value = rand(-0.15, 0.15);
        src.connect(filter).connect(gain).connect(pan).connect(this.sfx);
        src.start(t, Math.random() * 0.5, 0.2);
        // soft body thump
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.frequency.setValueAtTime(rand(110, 140), t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.1);
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        osc.connect(og).connect(this.sfx);
        osc.start(t); osc.stop(t + 0.12);
    }

    chime(kind = 'ui') {
        if (!this.ready || !this.enabled) return;
        const sets = {
            ui: [[79, 0], [83, 0.07]],
            open: [[74, 0], [81, 0.09], [86, 0.18]],
            start: [[62, 0], [69, 0.12], [74, 0.24], [78, 0.36], [81, 0.5]],
            portal: [[62, 0], [66, 0.13], [69, 0.26], [74, 0.39], [78, 0.52], [81, 0.65], [86, 0.8]],
        };
        const t0 = this.ctx.currentTime;
        for (const [note, delay] of sets[kind] || sets.ui) {
            for (const [ratio, level, decay] of [[1, 1, 1.6], [2.76, 0.28, 0.8], [4.1, 0.1, 0.4]]) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = midi(note) * ratio;
                const gain = this.ctx.createGain();
                this.#env(gain, t0 + delay, 0.006, 0.32 * level, decay);
                osc.connect(gain).connect(this.sfx);
                osc.start(t0 + delay); osc.stop(t0 + delay + decay + 0.1);
            }
        }
        if (kind === 'portal') this.#whoosh(t0, 1.6);
    }

    #whoosh(t, length) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.#noise(3, 'pink');
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass'; filter.Q.value = 1.4;
        filter.frequency.setValueAtTime(300, t);
        filter.frequency.exponentialRampToValueAtTime(4200, t + length * 0.7);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + length * 0.55);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
        src.connect(filter).connect(gain).connect(this.sfx);
        src.start(t, 0, length + 0.1);
    }
}
