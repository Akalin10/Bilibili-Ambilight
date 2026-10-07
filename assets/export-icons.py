from pathlib import Path
from PIL import Image

directory = Path(__file__).resolve().parent
with Image.open(directory / 'icon-master.png') as source:
    source = source.convert('RGBA')
    for size in (16, 32, 48, 128, 256):
        source.resize((size, size), Image.Resampling.LANCZOS).save(directory / f'icon-{size}.png')
    source.resize((256, 256), Image.Resampling.LANCZOS).save(
        directory / 'icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (128, 128), (256, 256)]
    )
