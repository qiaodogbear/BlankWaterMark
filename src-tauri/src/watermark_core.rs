use std::f64::consts::PI;
use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD, Engine};
use crc32fast::Hasher;
use image::{DynamicImage, ImageFormat, RgbaImage};
use thiserror::Error;

const MAGIC: &[u8; 4] = b"BWM2";
const VERSION: u8 = 1;
const HEADER_BYTES: usize = 14;
const BLOCK: usize = 8;
const COEFF_A: usize = 2 * BLOCK + 3;
const COEFF_B: usize = 3 * BLOCK + 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeAlgorithm {
    Dct,
    Lsb,
}

#[derive(Debug)]
pub struct NativeEmbedOutput {
    pub image_base64: String,
    pub algorithm: String,
    pub frame_bytes: usize,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug)]
pub struct NativeExtractOutput {
    pub ok: bool,
    pub algorithm: String,
    pub payload_base64: Option<String>,
    pub confidence: f64,
    pub checksum_valid: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Error)]
pub enum WatermarkError {
    #[error("base64 解码失败: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("图片解码失败: {0}")]
    Image(#[from] image::ImageError),
    #[error("{0}")]
    Message(String),
}

fn algorithm_id(algorithm: NativeAlgorithm) -> u8 {
    match algorithm {
        NativeAlgorithm::Dct => 1,
        NativeAlgorithm::Lsb => 2,
    }
}

fn algorithm_name(algorithm: NativeAlgorithm) -> String {
    match algorithm {
        NativeAlgorithm::Dct => "dct".to_string(),
        NativeAlgorithm::Lsb => "lsb".to_string(),
    }
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(bytes);
    hasher.finalize()
}

fn encode_frame(payload: &[u8], algorithm: NativeAlgorithm) -> Vec<u8> {
    let mut frame = vec![0_u8; HEADER_BYTES + payload.len()];
    frame[0..4].copy_from_slice(MAGIC);
    frame[4] = VERSION;
    frame[5] = algorithm_id(algorithm);
    frame[6..10].copy_from_slice(&(payload.len() as u32).to_be_bytes());
    frame[10..14].copy_from_slice(&crc32(payload).to_be_bytes());
    frame[HEADER_BYTES..].copy_from_slice(payload);
    frame
}

fn parse_header(frame: &[u8]) -> Result<(NativeAlgorithm, usize, u32), String> {
    if frame.len() < HEADER_BYTES {
        return Err("水印帧长度不足".to_string());
    }
    if &frame[0..4] != MAGIC {
        return Err("未检测到 watermark，可能 key 错误或图片被严重压缩".to_string());
    }
    if frame[4] != VERSION {
        return Err(format!("不支持的水印版本: {}", frame[4]));
    }
    let algorithm = match frame[5] {
        1 => NativeAlgorithm::Dct,
        2 => NativeAlgorithm::Lsb,
        value => return Err(format!("不支持的算法标识: {value}")),
    };
    let len = u32::from_be_bytes([frame[6], frame[7], frame[8], frame[9]]) as usize;
    let crc = u32::from_be_bytes([frame[10], frame[11], frame[12], frame[13]]);
    Ok((algorithm, len, crc))
}

fn decode_frame(frame: &[u8]) -> Result<(NativeAlgorithm, Vec<u8>), String> {
    let (algorithm, payload_len, expected_crc) = parse_header(frame)?;
    let total = HEADER_BYTES + payload_len;
    if frame.len() < total {
        return Err(format!("水印数据 length 不完整: 需要 {total} 字节，实际 {} 字节", frame.len()));
    }
    let payload = frame[HEADER_BYTES..total].to_vec();
    let actual_crc = crc32(&payload);
    if actual_crc != expected_crc {
        return Err("水印 checksum 校验失败，可能 key 错误或图片被压缩/裁剪".to_string());
    }
    Ok((algorithm, payload))
}

fn bytes_to_bits(bytes: &[u8]) -> Vec<u8> {
    let mut bits = Vec::with_capacity(bytes.len() * 8);
    for byte in bytes {
        for bit in (0..8).rev() {
            bits.push((byte >> bit) & 1);
        }
    }
    bits
}

fn bits_to_bytes(bits: &[u8]) -> Vec<u8> {
    let mut bytes = vec![0_u8; (bits.len() + 7) / 8];
    for (index, bit) in bits.iter().enumerate() {
        if *bit == 1 {
            bytes[index / 8] |= 1 << (7 - (index % 8));
        }
    }
    bytes
}

fn hash_seed(input: &str) -> u32 {
    let mut hash = 2_166_136_261_u32;
    for byte in input.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(16_777_619);
    }
    if hash == 0 { 0x9e37_79b9 } else { hash }
}

fn shuffled_indices(length: usize, seed: &str) -> Vec<usize> {
    let mut values: Vec<usize> = (0..length).collect();
    let mut state = hash_seed(seed);
    for i in (1..length).rev() {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        let j = (state as usize) % (i + 1);
        values.swap(i, j);
    }
    values
}

fn normalized_key(key: Option<&str>) -> String {
    key.filter(|value| !value.trim().is_empty())
        .unwrap_or("blind-watermark-default-placement-key")
        .to_string()
}

fn load_rgba(image_base64: &str) -> Result<RgbaImage, WatermarkError> {
    let bytes = STANDARD.decode(image_base64)?;
    Ok(image::load_from_memory(&bytes)?.to_rgba8())
}

fn encode_png_base64(image: RgbaImage) -> Result<String, WatermarkError> {
    let mut output = Vec::new();
    DynamicImage::ImageRgba8(image).write_to(&mut Cursor::new(&mut output), ImageFormat::Png)?;
    Ok(STANDARD.encode(output))
}

fn luma(r: u8, g: u8, b: u8) -> f64 {
    0.299 * r as f64 + 0.587 * g as f64 + 0.114 * b as f64
}

fn cos_value(u: usize, x: usize) -> f64 {
    (((2 * x + 1) as f64 * u as f64 * PI) / 16.0).cos()
}

fn alpha(index: usize) -> f64 {
    if index == 0 { 1.0 / 2.0_f64.sqrt() } else { 1.0 }
}

fn dct8(block: &[f64; 64]) -> [f64; 64] {
    let mut out = [0.0_f64; 64];
    for u in 0..BLOCK {
        for v in 0..BLOCK {
            let mut sum = 0.0;
            for x in 0..BLOCK {
                for y in 0..BLOCK {
                    sum += block[x * BLOCK + y] * cos_value(u, x) * cos_value(v, y);
                }
            }
            out[u * BLOCK + v] = 0.25 * alpha(u) * alpha(v) * sum;
        }
    }
    out
}

fn idct8(coeff: &[f64; 64]) -> [f64; 64] {
    let mut out = [0.0_f64; 64];
    for x in 0..BLOCK {
        for y in 0..BLOCK {
            let mut sum = 0.0;
            for u in 0..BLOCK {
                for v in 0..BLOCK {
                    sum += alpha(u) * alpha(v) * coeff[u * BLOCK + v] * cos_value(u, x) * cos_value(v, y);
                }
            }
            out[x * BLOCK + y] = 0.25 * sum;
        }
    }
    out
}

fn read_block(image: &RgbaImage, block_index: usize, blocks_x: usize) -> [f64; 64] {
    let mut block = [0.0_f64; 64];
    let block_x = block_index % blocks_x;
    let block_y = block_index / blocks_x;
    for y in 0..BLOCK {
        for x in 0..BLOCK {
            let px = (block_x * BLOCK + x) as u32;
            let py = (block_y * BLOCK + y) as u32;
            let pixel = image.get_pixel(px, py);
            block[y * BLOCK + x] = luma(pixel[0], pixel[1], pixel[2]);
        }
    }
    block
}

fn write_block(image: &mut RgbaImage, block_index: usize, blocks_x: usize, original: &[f64; 64], changed: &[f64; 64]) {
    let block_x = block_index % blocks_x;
    let block_y = block_index / blocks_x;
    for y in 0..BLOCK {
        for x in 0..BLOCK {
            let px = (block_x * BLOCK + x) as u32;
            let py = (block_y * BLOCK + y) as u32;
            let delta = changed[y * BLOCK + x] - original[y * BLOCK + x];
            let pixel = image.get_pixel_mut(px, py);
            pixel[0] = (pixel[0] as f64 + delta).round().clamp(0.0, 255.0) as u8;
            pixel[1] = (pixel[1] as f64 + delta).round().clamp(0.0, 255.0) as u8;
            pixel[2] = (pixel[2] as f64 + delta).round().clamp(0.0, 255.0) as u8;
        }
    }
}

fn embed_coeff(coeff: &mut [f64; 64], bit: u8, strength: f64) {
    let a = coeff[COEFF_A].abs();
    let b = coeff[COEFF_B].abs();
    let center = strength.max((a + b) / 2.0);
    let high = center + strength / 2.0;
    let low = 1.0_f64.max(center - strength / 2.0);
    let sign_a = if coeff[COEFF_A] < 0.0 { -1.0 } else { 1.0 };
    let sign_b = if coeff[COEFF_B] < 0.0 { -1.0 } else { 1.0 };
    if bit == 1 {
        coeff[COEFF_A] = sign_a * high;
        coeff[COEFF_B] = sign_b * low;
    } else {
        coeff[COEFF_A] = sign_a * low;
        coeff[COEFF_B] = sign_b * high;
    }
}

fn read_coeff(coeff: &[f64; 64], strength: f64) -> (u8, f64) {
    let diff = coeff[COEFF_A].abs() - coeff[COEFF_B].abs();
    let confidence = (diff.abs() / strength.max(1.0)).min(1.0);
    (if diff >= 0.0 { 1 } else { 0 }, confidence)
}

fn embed_dct(mut image: RgbaImage, frame: &[u8], key: Option<&str>, strength: f64, repetition: usize) -> Result<RgbaImage, WatermarkError> {
    let blocks_x = image.width() as usize / BLOCK;
    let blocks_y = image.height() as usize / BLOCK;
    let blocks = blocks_x * blocks_y;
    if blocks == 0 {
        return Err(WatermarkError::Message("图片尺寸过小，无法 DCT 分块".to_string()));
    }
    let bits = bytes_to_bits(frame);
    let needed = bits.len() * repetition;
    if needed > blocks {
        return Err(WatermarkError::Message("图片容量不足，无法嵌入 payload".to_string()));
    }
    let order = shuffled_indices(blocks, &format!("{}|dct|{}x{}", normalized_key(key), image.width(), image.height()));
    let mut slot = 0;
    for bit in bits {
        for _ in 0..repetition {
            let block_index = order[slot];
            let original = read_block(&image, block_index, blocks_x);
            let mut coeff = dct8(&original);
            embed_coeff(&mut coeff, bit, strength);
            let changed = idct8(&coeff);
            write_block(&mut image, block_index, blocks_x, &original, &changed);
            slot += 1;
        }
    }
    Ok(image)
}

fn extract_dct(image: &RgbaImage, key: Option<&str>, strength: f64, repetition: usize) -> NativeExtractOutput {
    let blocks_x = image.width() as usize / BLOCK;
    let blocks = blocks_x * (image.height() as usize / BLOCK);
    let order = shuffled_indices(blocks, &format!("{}|dct|{}x{}", normalized_key(key), image.width(), image.height()));
    let header_bits = HEADER_BYTES * 8;
    let read_bits = |bit_count: usize| -> (Vec<u8>, f64) {
        let mut bits = Vec::with_capacity(bit_count);
        let mut confidence_total = 0.0;
        for i in 0..bit_count {
            let mut ones = 0_usize;
            let mut zeros = 0_usize;
            let mut bit_confidence = 0.0;
            for r in 0..repetition {
                let coeff = dct8(&read_block(image, order[i * repetition + r], blocks_x));
                let (bit, confidence) = read_coeff(&coeff, strength);
                if bit == 1 { ones += 1; } else { zeros += 1; }
                bit_confidence += confidence;
            }
            bits.push(if ones >= zeros { 1 } else { 0 });
            confidence_total += (ones.max(zeros) as f64 / repetition as f64) * (bit_confidence / repetition as f64);
        }
        (bits, confidence_total / bit_count.max(1) as f64)
    };
    if header_bits * repetition > blocks {
        return failure(NativeAlgorithm::Dct, "图片容量不足，无法读取 DCT header", 0.0);
    }
    let (header_bits_value, header_confidence) = read_bits(header_bits);
    let header = bits_to_bytes(&header_bits_value);
    let (_, payload_len, _) = match parse_header(&header) {
        Ok(value) => value,
        Err(reason) => return failure(NativeAlgorithm::Dct, &reason, header_confidence),
    };
    let total_bits = (HEADER_BYTES + payload_len) * 8;
    if total_bits * repetition > blocks {
        return failure(NativeAlgorithm::Dct, "水印长度超过图片容量", header_confidence);
    }
    let (all_bits, confidence) = read_bits(total_bits);
    let frame = bits_to_bytes(&all_bits);
    match decode_frame(&frame) {
        Ok((algorithm, payload)) => success(algorithm, payload, confidence),
        Err(reason) => failure(NativeAlgorithm::Dct, &reason, confidence),
    }
}

fn lsb_offset(slot: usize) -> usize {
    let pixel = slot / 3;
    let channel = slot % 3;
    pixel * 4 + channel
}

fn embed_lsb(mut image: RgbaImage, frame: &[u8], key: Option<&str>, repetition: usize) -> Result<RgbaImage, WatermarkError> {
    let slots = image.width() as usize * image.height() as usize * 3;
    let bits = bytes_to_bits(frame);
    if bits.len() * repetition > slots {
        return Err(WatermarkError::Message("图片容量不足，无法嵌入 LSB payload".to_string()));
    }
    let order = shuffled_indices(slots, &format!("{}|lsb|{}x{}", normalized_key(key), image.width(), image.height()));
    let data = image.as_mut();
    let mut slot_index = 0;
    for bit in bits {
        for _ in 0..repetition {
            let offset = lsb_offset(order[slot_index]);
            data[offset] = (data[offset] & 0xfe) | bit;
            slot_index += 1;
        }
    }
    Ok(image)
}

fn extract_lsb(image: &RgbaImage, key: Option<&str>, repetition: usize) -> NativeExtractOutput {
    let slots = image.width() as usize * image.height() as usize * 3;
    let order = shuffled_indices(slots, &format!("{}|lsb|{}x{}", normalized_key(key), image.width(), image.height()));
    let data = image.as_raw();
    let read_bits = |bit_count: usize| -> (Vec<u8>, f64) {
        let mut bits = Vec::with_capacity(bit_count);
        let mut confidence_total = 0.0;
        for i in 0..bit_count {
            let mut ones = 0_usize;
            let mut zeros = 0_usize;
            for r in 0..repetition {
                let bit = data[lsb_offset(order[i * repetition + r])] & 1;
                if bit == 1 { ones += 1; } else { zeros += 1; }
            }
            bits.push(if ones >= zeros { 1 } else { 0 });
            confidence_total += ones.max(zeros) as f64 / repetition as f64;
        }
        (bits, confidence_total / bit_count.max(1) as f64)
    };
    let header_bits = HEADER_BYTES * 8;
    if header_bits * repetition > slots {
        return failure(NativeAlgorithm::Lsb, "图片容量不足，无法读取 LSB header", 0.0);
    }
    let (header_bits_value, header_confidence) = read_bits(header_bits);
    let header = bits_to_bytes(&header_bits_value);
    let (_, payload_len, _) = match parse_header(&header) {
        Ok(value) => value,
        Err(reason) => return failure(NativeAlgorithm::Lsb, &reason, header_confidence),
    };
    let total_bits = (HEADER_BYTES + payload_len) * 8;
    if total_bits * repetition > slots {
        return failure(NativeAlgorithm::Lsb, "水印长度超过图片容量", header_confidence);
    }
    let (all_bits, confidence) = read_bits(total_bits);
    let frame = bits_to_bytes(&all_bits);
    match decode_frame(&frame) {
        Ok((algorithm, payload)) => success(algorithm, payload, confidence),
        Err(reason) => failure(NativeAlgorithm::Lsb, &reason, confidence),
    }
}

fn success(algorithm: NativeAlgorithm, payload: Vec<u8>, confidence: f64) -> NativeExtractOutput {
    NativeExtractOutput {
        ok: true,
        algorithm: algorithm_name(algorithm),
        payload_base64: Some(STANDARD.encode(payload)),
        confidence,
        checksum_valid: true,
        reason: None,
    }
}

fn failure(algorithm: NativeAlgorithm, reason: &str, confidence: f64) -> NativeExtractOutput {
    NativeExtractOutput {
        ok: false,
        algorithm: algorithm_name(algorithm),
        payload_base64: None,
        confidence,
        checksum_valid: false,
        reason: Some(reason.to_string()),
    }
}

pub fn embed_native_watermark(
    image_base64: &str,
    payload_base64: &str,
    algorithm: NativeAlgorithm,
    key: Option<&str>,
    strength: f64,
    repetition: usize,
) -> Result<NativeEmbedOutput, WatermarkError> {
    let image = load_rgba(image_base64)?;
    let payload = STANDARD.decode(payload_base64)?;
    let frame = encode_frame(&payload, algorithm);
    let width = image.width();
    let height = image.height();
    let repetition = repetition.max(1);
    let output = match algorithm {
        NativeAlgorithm::Dct => embed_dct(image, &frame, key, strength.max(4.0), repetition)?,
        NativeAlgorithm::Lsb => embed_lsb(image, &frame, key, repetition)?,
    };

    Ok(NativeEmbedOutput {
        image_base64: encode_png_base64(output)?,
        algorithm: algorithm_name(algorithm),
        frame_bytes: frame.len(),
        width,
        height,
    })
}

pub fn extract_native_watermark(
    image_base64: &str,
    algorithm: NativeAlgorithm,
    key: Option<&str>,
    strength: f64,
    repetition: usize,
) -> Result<NativeExtractOutput, WatermarkError> {
    let image = load_rgba(image_base64)?;
    let repetition = repetition.max(1);
    Ok(match algorithm {
        NativeAlgorithm::Dct => extract_dct(&image, key, strength.max(4.0), repetition),
        NativeAlgorithm::Lsb => extract_lsb(&image, key, repetition),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_rejects_corruption() {
        let mut frame = encode_frame(b"payload", NativeAlgorithm::Dct);
        frame[HEADER_BYTES] ^= 0xff;
        let error = decode_frame(&frame).unwrap_err();
        assert!(error.contains("checksum"));
    }

    #[test]
    fn frame_round_trips_payload() {
        let frame = encode_frame(b"payload", NativeAlgorithm::Lsb);
        let (algorithm, payload) = decode_frame(&frame).unwrap();
        assert_eq!(algorithm, NativeAlgorithm::Lsb);
        assert_eq!(payload, b"payload");
    }
}
