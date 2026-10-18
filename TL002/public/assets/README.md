# TL002 assets

- `serpentela/`: runner artwork and future run/jump/fall animations.
- `obstacles/`: cardboard box, robot vacuum and owner's hand.
- `audio/`: future jump, landing, hit and music assets.

The runner uses five existing 96×96 WebP images, copied byte-for-byte from the
project's shared serpentela artwork. Three running poses and two airborne poses
are aligned into a single 768×128 runtime atlas (384 KiB RGBA). Sources are
released from Phaser's texture manager after the atlas is uploaded. Obstacles,
platforms, coins and skies use cached procedural textures; no remote assets,
fonts or audio are required. Obstacle/audio folders remain reserved for updates.
Load future public assets with `import.meta.env.BASE_URL + 'assets/…'` so the
same build works below `/TailLabs/TL002/` on GitHub Pages.
