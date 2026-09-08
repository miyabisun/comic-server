#!/usr/bin/env python3
"""Generate one isolated representative page and measure the Rust helper on Linux."""
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import time

from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) != 3 or sys.argv[1] not in ['mono', 'color']:
    raise SystemExit('Usage: python remaster/verify.py mono|color <new-output-directory>')
name = sys.argv[1]
color = name == 'color'
output_dir = Path(sys.argv[2])
output_dir.mkdir(parents=True)
repo = Path(__file__).resolve().parent.parent
font = subprocess.check_output(['fc-match', '-f', '%{file}', 'sans:lang=ja'], text=True)
image = Image.new('RGB', (800, 1200), 'white')
draw = ImageDraw.Draw(image)
for i, text in enumerate(['リマスター検証', '小さな文字を読む。', '細い線と網点の確認', 'ABC 0123456789']):
    draw.text((30, 30 + i * 40), text, font=ImageFont.truetype(font, 12 + i * 4), fill=(30, 60, 190) if color else 'black')
draw.rectangle((25, 220, 770, 570), outline='black', width=2)
for x in range(40, 750, 8):
    for y in range(235, 555, 8):
        draw.ellipse((x, y, x + 2, y + 2), fill=(30, 110, 190) if color else (80, 80, 80))
for i in range(20):
    draw.line((40, 610 + i * 10, 760, 620 + i * 13), fill=(150, 40, 90) if color else 'black', width=1 + i % 3)
draw.ellipse((260, 920, 530, 1150), fill=(255, 180, 80) if color else (180, 180, 180), outline='black', width=3)
image.save(output_dir / f'{name}-clean.png')
source = output_dir / f'{name}-input.jpg'
result = output_dir / f'{name}-result.png'
image.save(source, quality=65, subsampling=2)
started = time.perf_counter()
process = subprocess.run([str(repo / 'target/release/comic-remaster'), str(repo / 'remaster/models'), str(source), str(result)],
                         env=os.environ, capture_output=True, text=True)
record = {'case': name, 'elapsed_seconds': time.perf_counter() - started,
          'peak_rss_kib': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
          'exit_code': process.returncode, 'stderr': process.stderr,
          'source': 'generated text, fine lines, halftone dots, shapes; 800x1200 JPEG quality65'}
if process.returncode == 0:
    import numpy as np
    import onnxruntime as ort
    actual = np.asarray(Image.open(result).convert('RGB')).astype(np.float32)
    assert actual.shape == (2400, 1600, 3), actual.shape
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    model = 'illustration.onnx' if color else 'manga-1200.onnx'
    session = ort.InferenceSession(str(repo / 'remaster/models' / model), sess_options=options, providers=['CPUExecutionProvider'])
    patch = np.asarray(Image.open(source).convert('RGB').crop((0, 0, 256, 256))).astype(np.float32)
    reference = np.clip(session.run(None, {'input': patch.transpose(2, 0, 1)[None] / 255})[0][0].transpose(1, 2, 0), 0, 1) * 255
    # Exclude the crop's outer boundary; retain our 128px tile seam in the comparison.
    difference = float(np.abs(actual[:448, :448] - reference[:448, :448]).mean())
    assert difference < 1, f'Tiled inference differs from full inference: {difference}'
    record['tile_interior_mean_error_8bit'] = difference
(output_dir / f'{name}-metrics.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
raise SystemExit(process.returncode)
