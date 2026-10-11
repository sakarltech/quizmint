"""Build the inline design review from the app's current scoped styles."""
from pathlib import Path
import base64
import re

project = Path(__file__).resolve().parents[1]
styles = []
for name in ['globals.css', 'colour-refresh.css', 'mint-accessibility.css', 'internal-design.css']:
    css = (project / 'app' / name).read_text()
    styles.append(re.sub(r'@import[^;]+;', '', css).replace(':root', '&'))
logo = 'data:image/png;base64,' + base64.b64encode((project / 'public/quizmint-emblem-apple.png').read_bytes()).decode()
fragment = (project / 'design-preview/review.fragment.html').read_text().replace('__LOGO_DATA__', logo)
css = "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;600;700;800&display=swap');\n#quizmint-internal-review {\n" + '\n'.join(styles) + '\n}\n' + (project / 'design-preview/review.css').read_text()
fragment = fragment.replace('<div id="quizmint-internal-review">', '<div id="quizmint-internal-review">\n<style>' + css + '</style>', 1)
dashboard = re.search(r'<template id="qm-screen-dashboard">(.*?)</template>', fragment, re.S).group(1)
fragment = fragment.replace('<main class="dashboard qm-preview-main" id="qm-review-content"></main>', '<main class="dashboard qm-preview-main" id="qm-review-content">' + dashboard + '</main>')
assert len(fragment.encode()) < 1_000_000
Path('/workspace/quizmint-internal-review.html').write_text(fragment)
print('Created seven-screen design review:', len(fragment.encode()), 'bytes')
