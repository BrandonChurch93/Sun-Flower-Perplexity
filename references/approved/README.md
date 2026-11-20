# Approved images

Empty until Brandon approves the reference images.

When he does, this folder holds:

- Eight PNG files, one per key, with exactly the paths listed under `keys` in `config/showcase.json`.
- `MANIFEST.sha256`, one line per image: the SHA-256 hash, two spaces, the file name.
- `contact-sheet.jpg`, all eight in film order.

The build does not start until `MANIFEST.sha256` exists and every hash in it matches. Nothing in this folder is ever edited, replaced or regenerated after that.
