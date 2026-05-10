# Watermark Algorithms

## Frame Format

All algorithms embed the same binary frame:

```text
0..3    magic: BWM2
4       version: 1
5       algorithm: 1 = DCT, 2 = LSB
6..9    payload length, u32 big-endian
10..13  CRC32 of payload bytes
14..    payload envelope bytes
```

The payload envelope is JSON. It stores payload kind, file name/MIME when present, compression/encryption flags, SHA-256 of original bytes, original size, and base64 payload data.

## DCT Mode

DCT is the default mode.

1. Convert each 8x8 block to luma.
2. Run a 2D DCT.
3. Encode each bit by adjusting a pair of mid-frequency coefficients: `(2,3)` and `(3,2)`.
4. Use the key to seed a deterministic shuffled block order.
5. Repeat each bit 1x, 3x, or 5x.
6. Run inverse DCT and apply the luma delta back to RGB.

Extraction runs the same block order, compares coefficient magnitudes, applies majority voting, and validates frame CRC32. Confidence is derived from coefficient separation and vote agreement.

### Strength

Higher strength increases coefficient separation and improves survival under light compression, but may introduce visible changes. The default is `28`.

### Capacity

Approximate DCT payload capacity:

```text
floor(width / 8) * floor(height / 8) / repetition / 8 - 14 bytes
```

Large payloads need larger images, lower repetition, or LSB mode.

## LSB Mode

LSB mode embeds bits into pseudo-random RGB channel least-significant bits. It has much higher capacity and lower visual impact, but it is fragile under JPEG recompression, resizing, filters, and many social platforms.

## Compression, Encryption, Integrity

- Compression uses gzip through `fflate`.
- Encryption uses AES-GCM with PBKDF2-derived keys through WebCrypto.
- Integrity uses SHA-256 over the original payload and CRC32 over the binary frame.

Wrong payload password causes AES-GCM failure. Wrong watermark key usually causes header magic failure or CRC32 failure.

## Robustness Notes

Blind watermarking increases traceability and hidden data survivability, but it is not absolute protection. DCT mode can survive light JPEG compression more often than LSB mode, but crop/resize/re-encode operations may break block alignment and destroy the payload. For stronger production use, add synchronization markers, more advanced ECC, and geometric attack recovery.

## DWT Mode

DWT is documented as an experimental future mode and is not exposed as a production parser in this release.
