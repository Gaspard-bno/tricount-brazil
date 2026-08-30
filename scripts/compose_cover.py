#!/usr/bin/env python3
"""Build the OG version of a Higgsfield-style app cover from full-bleed art."""
import argparse
from PIL import Image, ImageDraw, ImageFilter
import numpy as np


def hex_rgb(s):
    c = s.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def sample_frame_color(im):
    w, h = im.size
    pts = [(int(w * 0.01), int(h * 0.5)), (int(w * 0.99), int(h * 0.5)),
           (int(w * 0.5), int(h * 0.015)), (int(w * 0.5), int(h * 0.985))]
    px = np.array([im.getpixel(p) for p in pts])
    return tuple(int(v) for v in np.median(px, axis=0))


def detect_capsule(im, frame_rgb, tol=60, frac=0.12):
    a = np.asarray(im.convert("RGB"), dtype=np.int16)
    diff = np.abs(a - np.array(frame_rgb, dtype=np.int16)).sum(axis=2)
    m = diff > tol
    cols, rows = m.mean(axis=0), m.mean(axis=1)
    xs, ys = np.where(cols > frac)[0], np.where(rows > frac)[0]
    if len(xs) == 0 or len(ys) == 0:
        raise SystemExit("could not detect capsule — check the art or use default mode")
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


def stadium_mask(size, box, ss=4):
    width, height = size
    big = Image.new("L", (width * ss, height * ss), 0)
    radius = (box[3] - box[1]) // 2
    ImageDraw.Draw(big).rounded_rectangle([v * ss for v in box], radius=radius * ss, fill=255)
    return big.resize((width, height), Image.LANCZOS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--art", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--frame-color", default="#D9FF2E")
    parser.add_argument("--dot-color", default="#1A1A1A")
    parser.add_argument("--detect", action="store_true")
    parser.add_argument("--margin-x", type=float, default=0.045)
    parser.add_argument("--margin-y", type=float, default=0.055)
    parser.add_argument("--inset", type=float, default=0.006)
    parser.add_argument("--no-dots", action="store_true")
    parser.add_argument("--shrink", type=float, default=1.0)
    parser.add_argument("--offset-x", type=int, default=0)
    parser.add_argument("--offset-y", type=int, default=0)
    args = parser.parse_args()

    image = Image.open(args.art).convert("RGB")
    width, height = image.size

    if args.shrink != 1.0 or args.offset_x or args.offset_y:
        base = image.resize((int(width * 1.1), int(height * 1.1)), Image.LANCZOS) \
            .filter(ImageFilter.GaussianBlur(40)) \
            .crop((int(width * 0.05), int(height * 0.05), int(width * 1.05), int(height * 1.05)))
        art = image if args.shrink == 1.0 else image.resize(
            (int(width * args.shrink), int(height * args.shrink)), Image.LANCZOS)
        base.paste(art, ((width - art.width) // 2 + args.offset_x,
                         (height - art.height) // 2 + args.offset_y))
        image = base

    if args.detect:
        frame_rgb = sample_frame_color(image)
        frame_color = "#%02X%02X%02X" % frame_rgb
        x0, y0, x1, y1 = detect_capsule(image, frame_rgb)
        inset = int(width * args.inset)
        box = (x0 + inset, y0 + inset, x1 - inset, y1 - inset)
    else:
        frame_color = args.frame_color
        margin_x, margin_y = int(width * args.margin_x), int(height * args.margin_y)
        box = (margin_x, margin_y, width - margin_x, height - margin_y)

    mask = stadium_mask((width, height), box)
    output = Image.composite(image, Image.new("RGB", (width, height), frame_color), mask)

    if not args.no_dots:
        dot_radius = int(width * 0.008)
        offset_x, offset_y = int(width * 0.028), int(height * 0.045)
        draw = ImageDraw.Draw(output)
        for center_x in (offset_x, width - offset_x):
            for center_y in (offset_y, height - offset_y):
                draw.ellipse((center_x - dot_radius, center_y - dot_radius,
                              center_x + dot_radius, center_y + dot_radius), fill=args.dot_color)

    output.save(args.out)
    print(f"saved {args.out} {width}x{height} frame={frame_color} capsule={box}")


if __name__ == "__main__":
    main()
