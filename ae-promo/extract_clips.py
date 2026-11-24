"""Cut two 1.4s moments from each gameplay recording into ready-to-render frame arrays (1276x622 @30fps)."""
import subprocess, os, numpy as np, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe(); DL = r"C:\Users\Maha\Downloads"; OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clips')
VW, VH, SEG = 1276, 622, 42
CUTS = {  # key: (file, cut1, cut2)
 'signal':  ('WhatsApp Video 2026-11-24 at 6.14.41 PM.mp4', 15.5, 27.0),
 'portal':  ('WhatsApp Video 2026-11-24 at 6.15.12 PM.mp4', 9.0, 21.0),
 'oath':    ('WhatsApp Video 2026-11-24 at 6.17.38 PM.mp4', 8.0, 27.5),
 'escape':  ('WhatsApp Video 2026-11-24 at 6.20.16 PM.mp4', 6.5, 25.5),
 'encanto': ('WhatsApp Video 2026-11-24 at 6.21.30 PM.mp4', 14.0, 31.0),
 'jungle':  ('WhatsApp Video 2026-11-24 at 6.18.04 PM.mp4', 8.0, 29.0),
}
for key, (f, a, b) in CUTS.items():
    frames = []
    for st in (a, b):
        cmd = [FF, '-v', 'error', '-ss', str(st), '-i', os.path.join(DL, f), '-t', '1.5', '-vf',
               'fps=30,scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d' % (VW, VH, VW, VH), '-frames:v', str(SEG), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        raw = subprocess.run(cmd, capture_output=True).stdout
        arr = np.frombuffer(raw, np.uint8).reshape(-1, VH, VW, 3)
        if len(arr) < SEG: arr = np.concatenate([arr, np.repeat(arr[-1:], SEG - len(arr), 0)])
        frames.append(arr[:SEG])
    np.save(os.path.join(OUT, key + '.npy'), np.concatenate(frames)); print(key, 'ok')
