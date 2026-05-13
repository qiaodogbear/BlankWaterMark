mod watermark_core;

use serde::{Deserialize, Serialize};
use watermark_core::{embed_native_watermark, extract_native_watermark, NativeAlgorithm};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbedWatermarkRequest {
    image_base64: String,
    payload_base64: String,
    algorithm: String,
    key: Option<String>,
    strength: Option<f64>,
    repetition: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbedWatermarkResponse {
    image_base64: String,
    algorithm: String,
    frame_bytes: usize,
    width: u32,
    height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractWatermarkRequest {
    image_base64: String,
    algorithm: String,
    key: Option<String>,
    strength: Option<f64>,
    repetition: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractWatermarkResponse {
    ok: bool,
    algorithm: String,
    payload_base64: Option<String>,
    confidence: f64,
    checksum_valid: bool,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeCapabilities {
    native_watermark: bool,
    algorithms: Vec<&'static str>,
    android_config_present: bool,
}

fn parse_algorithm(value: &str) -> Result<NativeAlgorithm, String> {
    match value.to_ascii_lowercase().as_str() {
        "dct" => Ok(NativeAlgorithm::Dct),
        "lsb" => Ok(NativeAlgorithm::Lsb),
        other => Err(format!("Unsupported algorithm: {other}")),
    }
}

#[tauri::command]
async fn embed_watermark(request: EmbedWatermarkRequest) -> Result<EmbedWatermarkResponse, String> {
    let algorithm = parse_algorithm(&request.algorithm)?;
    let output = embed_native_watermark(
        &request.image_base64,
        &request.payload_base64,
        algorithm,
        request.key.as_deref(),
        request.strength.unwrap_or(28.0),
        request.repetition.unwrap_or(3),
    )
    .map_err(|error| error.to_string())?;

    Ok(EmbedWatermarkResponse {
        image_base64: output.image_base64,
        algorithm: output.algorithm,
        frame_bytes: output.frame_bytes,
        width: output.width,
        height: output.height,
    })
}

#[tauri::command]
async fn extract_watermark(request: ExtractWatermarkRequest) -> Result<ExtractWatermarkResponse, String> {
    let algorithm = parse_algorithm(&request.algorithm)?;
    let result = extract_native_watermark(
        &request.image_base64,
        algorithm,
        request.key.as_deref(),
        request.strength.unwrap_or(28.0),
        request.repetition.unwrap_or(3),
    )
    .map_err(|error| error.to_string())?;

    Ok(ExtractWatermarkResponse {
        ok: result.ok,
        algorithm: result.algorithm,
        payload_base64: result.payload_base64,
        confidence: result.confidence,
        checksum_valid: result.checksum_valid,
        reason: result.reason,
    })
}

#[tauri::command]
async fn get_runtime_capabilities() -> RuntimeCapabilities {
    RuntimeCapabilities {
        native_watermark: true,
        algorithms: vec!["dct", "lsb"],
        android_config_present: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            embed_watermark,
            extract_watermark,
            get_runtime_capabilities
        ])
        .run(tauri::generate_context!())
        .expect("error while running BlindWaterMark");
}
