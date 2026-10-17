"""Read original alpha into collision geometry; copies WebP bytes without image editing.

Usage: python tools/trace-colliders.py <source-folder>
Requires Pillow + numpy. Finish metadata and SVG with node tools/finalize-colliders.mjs.
"""
from collections import defaultdict, deque
from pathlib import Path
import hashlib
import json
import math
import re
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ALPHA = 128
TOLERANCE = 1.0


def area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def distance(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy))) if dx or dy else 0
    return math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy)


def simplify_open(points, epsilon):
    if len(points) <= 2:
        return points
    distances = [distance(p, points[0], points[-1]) for p in points[1:-1]]
    maximum = max(distances, default=0)
    if maximum <= epsilon:
        return [points[0], points[-1]]
    pivot = distances.index(maximum) + 1
    return simplify_open(points[:pivot + 1], epsilon)[:-1] + simplify_open(points[pivot:], epsilon)


def simplify_closed(points, epsilon):
    pivot = max(range(len(points)), key=lambda i: math.dist(points[0], points[i]))
    return simplify_open(points[:pivot + 1], epsilon)[:-1] + simplify_open(points[pivot:] + points[:1], epsilon)[:-1]


def crosses(a, b, c, d):
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    def on_segment(p, q, r):
        return orient(p, q, r) == 0 and min(p[0], q[0]) <= r[0] <= max(p[0], q[0]) and min(p[1], q[1]) <= r[1] <= max(p[1], q[1])
    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    return (o1 * o2 < 0 and o3 * o4 < 0) or on_segment(a, b, c) or on_segment(a, b, d) or on_segment(c, d, a) or on_segment(c, d, b)


def simple(points):
    count = len(points)
    for i in range(count):
        for j in range(i + 1, count):
            if j == i + 1 or (i == 0 and j == count - 1):
                continue
            if crosses(points[i], points[(i + 1) % count], points[j], points[(j + 1) % count]):
                return False
    return True


def main_component(mask):
    height, width = mask.shape
    seen = np.zeros_like(mask)
    components = []
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        queue, component = deque([(x, y)]), []
        seen[y, x] = True
        while queue:
            xx, yy = queue.popleft()
            component.append((xx, yy))
            for nx, ny in [(xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1)]:
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((nx, ny))
        components.append(component)
    result = np.zeros_like(mask)
    largest = max(components, key=len)
    for x, y in largest:
        result[y, x] = True
    return result, int(mask.sum()) - len(largest)


def trace(mask):
    height, width = mask.shape
    edges = defaultdict(list)
    for y, x in zip(*np.where(mask)):
        x, y = int(x), int(y)
        if y == 0 or not mask[y - 1, x]: edges[(x, y)].append((x + 1, y))
        if x == width - 1 or not mask[y, x + 1]: edges[(x + 1, y)].append((x + 1, y + 1))
        if y == height - 1 or not mask[y + 1, x]: edges[(x + 1, y + 1)].append((x, y + 1))
        if x == 0 or not mask[y, x - 1]: edges[(x, y + 1)].append((x, y))
    directions = {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}
    loops = []
    while edges:
        start = min(edges)
        current, previous, loop = start, None, []
        while True:
            loop.append(current)
            choices = edges[current]
            if previous is None or len(choices) == 1:
                nxt = choices[0]
            else:
                incoming = directions[(current[0] - previous[0], current[1] - previous[1])]
                priority = {1: 0, 0: 1, 3: 2, 2: 3}
                nxt = min(choices, key=lambda p: priority[(directions[(p[0] - current[0], p[1] - current[1])] - incoming) % 4])
            choices.remove(nxt)
            if not choices: del edges[current]
            previous, current = current, nxt
            if current == start: break
        loops.append(loop)
    return max(loops, key=lambda loop: abs(area(loop)))


def contains(x, y, polygon):
    result = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result


def main():
    source = Path(sys.argv[1]).resolve()
    destination = ROOT / 'public/assets/serpentelas'
    destination.mkdir(parents=True, exist_ok=True)
    definitions = []
    for path in sorted(source.glob('*.webp')):
        match = re.fullmatch(r'權重(\d+)蛇貂(\d+)\.webp', path.name)
        if not match: continue
        weight, number = map(int, match.groups())
        identifier = f'serpentela-w{weight}-{number:02}'
        with Image.open(path) as image:
            alpha = np.array(image.convert('RGBA'))[:, :, 3]
            width, height = image.size
        mask, ignored = main_component(alpha >= ALPHA)
        raw = trace(mask)
        epsilon = TOLERANCE
        outline = simplify_closed(raw, epsilon)
        while not simple(outline) and epsilon >= 0.125:
            epsilon /= 2
            outline = simplify_closed(raw, epsilon)
        if not simple(outline): raise ValueError(f'Non-simple boundary: {path.name}')
        if area(outline) < 0: outline.reverse()
        polygon_mask = np.array([[contains(x + 0.5, y + 0.5, outline) for x in range(width)] for y in range(height)])
        intersection = np.logical_and(mask, polygon_mask).sum()
        union = np.logical_or(mask, polygon_mask).sum()
        iou = float(intersection / union)
        if iou < 0.96: raise ValueError(f'Outline fit too low: {path.name}: {iou}')
        filename = identifier + '.webp'
        shutil.copyfile(path, destination / filename)
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        if hashlib.sha256((destination / filename).read_bytes()).hexdigest() != checksum:
            raise ValueError(f'Copy checksum mismatch: {path.name}')
        definitions.append({
            'id': identifier, 'name': path.stem, 'sourceName': path.name, 'weight': weight,
            'texture': identifier, 'file': filename, 'width': width, 'height': height,
            'sha256': checksum, 'alphaThreshold': ALPHA, 'tolerance': epsilon,
            'ignoredOpaquePixels': ignored, 'maskPixels': int(mask.sum()),
            'fitIoU': round(iou, 6), 'area': area(outline),
            'outline': [{'x': x, 'y': y} for x, y in outline],
        })
    definitions.sort(key=lambda item: (-item['weight'], item['name']))
    work = ROOT / 'work'
    work.mkdir(exist_ok=True)
    (work / 'traced-colliders.json').write_text(json.dumps(definitions, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps([{'file': d['sourceName'], 'vertices': len(d['outline']), 'fitIoU': d['fitIoU'], 'ignoredPixels': d['ignoredOpaquePixels']} for d in definitions], ensure_ascii=False))


if __name__ == '__main__':
    main()
