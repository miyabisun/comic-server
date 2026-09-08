#!/usr/bin/env python3
"""Build-only: verify official V1 archives and export eight 2x models to ONNX."""
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import urllib.request
import zipfile

import numpy as np
import onnxruntime as ort
import spandrel
import torch

ARCHIVES = {
    'MangaJaNai_V1_ModelsOnly.zip': '5156f4167875bba51a8ed52bd1c794b0d7277f7103f99b397518066e4dda7e55',
    'IllustrationJaNai_V1_ModelsOnly.zip': '6f5496f5ded597474290403de73d7a46c3f8ed328261db2e6ff830a415a6f60b',
}


def main(output):
    output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    torch.manual_seed(0)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    records = []
    with tempfile.TemporaryDirectory() as temporary:
        for archive, checksum in ARCHIVES.items():
            url = f'https://github.com/the-database/MangaJaNai/releases/download/1.0.0/{archive}'
            downloaded = Path(temporary, archive)
            urllib.request.urlretrieve(url, downloaded)
            if hashlib.file_digest(downloaded.open('rb'), 'sha256').hexdigest() != checksum:
                raise ValueError(f'Archive checksum mismatch: {archive}')
            with zipfile.ZipFile(downloaded) as zipped:
                for name in zipped.namelist():
                    manga = re.fullmatch(r'2x_MangaJaNai_(\d+)p_V1_ESRGAN_\d+k.pth', name)
                    if not manga and name != '2x_IllustrationJaNai_V1_ESRGAN_120k.pth':
                        continue
                    weights = Path(temporary, name)
                    weights.write_bytes(zipped.read(name))
                    model = spandrel.ModelLoader().load_from_file(weights).eval().float()
                    if (model.scale, model.input_channels, model.output_channels) != (2, 3, 3):
                        raise ValueError(f'Unexpected architecture: {name}')
                    filename = f'manga-{manga[1]}.onnx' if manga else 'illustration.onnx'
                    target = output / filename
                    example = torch.rand(1, 3, 64, 64)
                    torch.onnx.export(model.model, example, target, input_names=['input'], output_names=['output'],
                                      dynamic_axes={'input': {2: 'height', 3: 'width'}, 'output': {2: 'out_height', 3: 'out_width'}},
                                      opset_version=17, dynamo=False)
                    session = ort.InferenceSession(str(target), sess_options=options, providers=['CPUExecutionProvider'])
                    maximum_error = 0.0
                    for height, width in [(64, 64), (80, 96)]:
                        sample = torch.rand(1, 3, height, width)
                        with torch.inference_mode():
                            reference = model(sample).numpy()
                        converted = np.clip(session.run(None, {'input': sample.numpy()})[0], 0, 1)
                        error = float(np.max(np.abs(reference - converted)))
                        if not np.isfinite(error) or error > 0.0001:
                            raise ValueError(f'Conversion mismatch for {name}: {error}')
                        maximum_error = max(maximum_error, error)
                    records.append({'file': filename, 'source_weights': name, 'source': url,
                                    'archive_sha256': checksum, 'license': 'CC-BY-NC-SA-4.0',
                                    'sha256': hashlib.file_digest(target.open('rb'), 'sha256').hexdigest(),
                                    'conversion_max_error': maximum_error})
                    print(f'{filename}: verified, max error {maximum_error:.8f}', flush=True)
    if len(records) != 8:
        raise ValueError('Expected seven MangaJaNai models and one IllustrationJaNai model')
    (output / 'models.json').write_text(json.dumps(records, indent=2) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: prepare-models.py <output-directory>')
    main(Path(sys.argv[1]))
