import subprocess, numpy as np, sys, os, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
DL = r"C:\Users\Maha\Downloads"
VID = {  # project -> file
 'signal': 'WhatsApp Video 2026-11-24 at 6.14.41 PM.mp4',
 'portal': 'WhatsApp Video 2026-11-24 at 6.15.12 PM.mp4',
 'oath':   'WhatsApp Video 2026-11-24 at 6.17.38 PM.mp4',
 'escape': 'WhatsApp Video 2026-11-24 at 6.20.16 PM.mp4',
 'encanto':'WhatsApp Video 2026-11-24 at 6.21.30 PM.mp4',
 'jungle': 'WhatsApp Video 2026-11-24 at 6.18.04 PM.mp4',
}
def probe_frames(path):
    cmd = [FF, '-v', 'error', '-i', path, '-vf', 'fps=2,scale=96:54', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, 54, 96).astype(np.float32)
res = {}
for k, f in VID.items():
    fr = probe_frames(os.path.join(DL, f)); n = len(fr)
    bright = fr.mean((1, 2)); motion = np.r_[0, np.abs(np.diff(fr, axis=0)).mean((1, 2))]
    contrast = fr.std((1, 2))
    score = np.where((bright > 35) & (contrast > 25), motion + 0.15 * contrast, -1)
    # window of 3 samples (=1.5s): best two non-overlapping windows from different halves
    w = np.convolve(score, np.ones(3), 'valid'); half = len(w) // 2
    a = int(np.argmax(w[:half])); b = half + int(np.argmax(w[half:]))
    res[k] = (a / 2, b / 2, n / 2)
    print(k, 'dur %.1f' % (n / 2), 'cuts at %.1fs and %.1fs' % (a / 2, b / 2))
import json; json.dump(res, open('clips/cuts.json', 'w'))
