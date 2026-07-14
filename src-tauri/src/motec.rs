//! MoTeC .ld parsing → session summary.
//!
//! Uses the `motec-i2` crate. API confirmed against the crate source:
//!   LDReader<'a, S: Read + Seek>::new(&'a mut S)
//!   read_header() -> Header      (also cached internally)
//!   read_channels() -> Vec<ChannelMetadata>   (seeks absolutely; no ordering needed)
//!   channel_data(&ChannelMetadata) -> Vec<Sample>
//!
//! Safety: the crate's channel_data panics on F16/Invalid datatypes and
//! Sample::decode_f64 asserts offset == 0. Panics would be fatal, so we guard the
//! datatype up front and decode samples ourselves (matching the crate's scale/mul/
//! dec_places math, ignoring the unsupported offset) to avoid any panic path.
//!
//! Extraction was validated against a real 78-channel MoTeC log: lap timing comes
//! from `Lap Number` + `Running Lap Time` (raw `Beacon` is unreliably packed), fuel
//! is read robustly to dodge sensor spikes, and top speed uses a high percentile.
//! Channel names vary by logger, so every field is fuzzy-matched and overridable.

use base64::{engine::general_purpose::STANDARD, Engine};
use motec_i2::{ChannelMetadata, Datatype, LDReader, Sample};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Cursor, Read, Seek};

#[derive(Serialize)]
pub struct ChannelInfo {
    pub name: String,
    pub unit: String,
    pub freq: u16,
    pub count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub driver: String,
    pub track: String,
    pub session: String,
    pub vehicle_id: String,
    pub date_raw: String,
    pub time_raw: String,
    pub best_lap: String,
    pub laps: String,
    pub fuel_used: String,
    pub fuel_per_lap: String,
    pub max_speed: String,
    pub ambient_temp: String,
    pub track_temp: String,
    pub mapping: HashMap<String, String>,
    pub fuel_is_estimate: bool,
    pub channels: Vec<ChannelInfo>,
}

/// Decode one raw sample to f64 using the channel's scaling.
/// Mirrors motec-i2's math but never asserts/panics (offset is ignored, as the
/// crate itself does not support it, and scale==0 is treated as 1).
fn decode_sample(sample: &Sample, ch: &ChannelMetadata) -> f64 {
    let v = match sample {
        Sample::I16(x) => *x as f64,
        Sample::I32(x) => *x as f64,
        Sample::F32(x) => *x as f64,
    };
    let scale = if ch.scale == 0 { 1.0 } else { ch.scale as f64 };
    (v / scale) * 10f64.powi(-(ch.dec_places as i32)) * ch.mul as f64
}

/// Decode a whole channel into f64 values, skipping anything that could panic.
fn decode_channel<S: Read + Seek>(reader: &mut LDReader<'_, S>, ch: &ChannelMetadata) -> Vec<f64> {
    if ch.data_count == 0 || matches!(ch.datatype, Datatype::F16 | Datatype::Invalid) {
        return Vec::new();
    }
    match reader.channel_data(ch) {
        Ok(samples) => samples.iter().map(|s| decode_sample(s, ch)).collect(),
        Err(_) => Vec::new(),
    }
}

fn mean(v: &[f64]) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    Some(v.iter().sum::<f64>() / v.len() as f64)
}

/// Robust "max" via a high percentile, rejecting single-sample spikes.
fn percentile(v: &[f64], p: f64) -> Option<f64> {
    let mut s: Vec<f64> = v.iter().copied().filter(|x| x.is_finite()).collect();
    if s.is_empty() {
        return None;
    }
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let idx = ((p / 100.0) * (s.len() as f64 - 1.0)).round() as usize;
    Some(s[idx.min(s.len() - 1)])
}

/// Median of the first / last `n` samples — reads fuel level without spikes.
fn edge_median(v: &[f64], n: usize, from_start: bool) -> Option<f64> {
    let mut slice: Vec<f64> = if from_start {
        v.iter().take(n).copied().collect()
    } else {
        v.iter().rev().take(n).copied().collect()
    };
    slice.retain(|x| x.is_finite());
    if slice.is_empty() {
        return None;
    }
    slice.sort_by(|a, b| a.partial_cmp(b).unwrap());
    Some(slice[slice.len() / 2])
}

fn fmt_lap(secs: f64) -> String {
    if !secs.is_finite() || secs <= 0.0 {
        return String::new();
    }
    let m = (secs / 60.0).floor() as i64;
    let s = secs - (m as f64) * 60.0;
    if m > 0 {
        format!("{}:{:06.3}", m, s)
    } else {
        format!("{:.3}", s)
    }
}

/// Case-insensitive keyword match against channel names.
fn find_channel<'c>(channels: &'c [ChannelMetadata], keywords: &[&str]) -> Option<&'c ChannelMetadata> {
    for kw in keywords {
        let kw = kw.to_lowercase();
        if let Some(c) = channels.iter().find(|c| c.name.to_lowercase().contains(&kw)) {
            return Some(c);
        }
    }
    None
}

pub fn parse_ld_bytes(
    data_b64: &str,
    overrides: Option<HashMap<String, String>>,
) -> Result<Summary, String> {
    let bytes = STANDARD
        .decode(data_b64.trim())
        .map_err(|e| format!("Could not decode file data: {e}"))?;
    let mut cursor = Cursor::new(bytes);
    let mut reader = LDReader::new(&mut cursor);

    let header = reader
        .read_header()
        .map_err(|e| format!("This does not look like a valid MoTeC .ld file ({e:?})"))?;

    let channels = reader
        .read_channels()
        .map_err(|e| format!("Failed to read channels ({e:?})"))?;

    let overrides = overrides.unwrap_or_default();
    let mut mapping: HashMap<String, String> = HashMap::new();

    // resolve a field to a channel, honouring a manual override; records the choice
    let mut resolve = |field: &str, keywords: &[&str]| -> Option<ChannelMetadata> {
        if let Some(name) = overrides.get(field) {
            if let Some(c) = channels.iter().find(|c| &c.name == name) {
                mapping.insert(field.into(), c.name.clone());
                return Some(c.clone());
            }
        }
        if let Some(c) = find_channel(&channels, keywords) {
            mapping.insert(field.into(), c.name.clone());
            return Some(c.clone());
        }
        None
    };

    let amb_ch = resolve("ambientTemp", &["air temp", "ambient", "amb air", "inlet air"]);
    let trk_ch = resolve("trackTemp", &["track temp", "surface temp", "tarmac"]);
    let spd_ch = resolve("maxSpeed", &["ground speed", "speed over ground", "gps speed", "speed"]);
    let lapno_ch = resolve("laps", &["lap number", "lap no", "lap count"]);
    let rlt_ch = resolve("runningLap", &["running lap time", "lap time running"]);
    let fuel_used_ch = resolve("fuelUsed", &["fuel used", "fuel consumed"]);
    let fuel_lvl_ch = resolve("fuelLevel", &["fuel level", "fuel remaining", "fuel"]);
    drop(resolve); // release the borrow of `mapping` before we move it later

    let ambient_temp = amb_ch
        .as_ref()
        .and_then(|c| mean(&decode_channel(&mut reader, c)))
        .map(|v| format!("{:.0}", v))
        .unwrap_or_default();
    let track_temp = trk_ch
        .as_ref()
        .and_then(|c| mean(&decode_channel(&mut reader, c)))
        .map(|v| format!("{:.0}", v))
        .unwrap_or_default();
    let max_speed = spd_ch
        .as_ref()
        .and_then(|c| percentile(&decode_channel(&mut reader, c), 99.5))
        .map(|v| format!("{:.0}", v))
        .unwrap_or_default();

    // laps + best lap: peak running-lap-time within each Lap Number segment
    let mut laps = String::new();
    let mut best_lap = String::new();
    if let (Some(lc), Some(rc)) = (&lapno_ch, &rlt_ch) {
        let lapno = decode_channel(&mut reader, lc);
        let rlt = decode_channel(&mut reader, rc);
        let n = lapno.len().min(rlt.len());
        if n > 0 {
            let mut peak: HashMap<i64, f64> = HashMap::new();
            for i in 0..n {
                let ln = lapno[i].round() as i64;
                let e = peak.entry(ln).or_insert(0.0);
                if rlt[i] > *e {
                    *e = rlt[i];
                }
            }
            let mut keys: Vec<i64> = peak.keys().copied().collect();
            keys.sort();
            if let Some(max_lap) = keys.last() {
                laps = format!("{}", (*max_lap).max(0));
            }
            if let Some(first) = keys.first().copied() {
                let best = keys
                    .iter()
                    .filter(|&&k| k > first)
                    .filter_map(|k| peak.get(k))
                    .copied()
                    .filter(|&t| t > 20.0 && t < 1200.0)
                    .fold(f64::INFINITY, f64::min);
                if best.is_finite() {
                    best_lap = fmt_lap(best);
                }
            }
        }
    } else if let Some(lc) = &lapno_ch {
        let lapno = decode_channel(&mut reader, lc);
        let m = lapno.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        if m.is_finite() {
            laps = format!("{}", m.round() as i64);
        }
    }

    // fuel: prefer a dedicated "fuel used" channel; else derive from level
    let mut fuel_used = String::new();
    let mut fuel_is_estimate = false;
    if let Some(fc) = &fuel_used_ch {
        let d = decode_channel(&mut reader, fc);
        if let (Some(a), Some(b)) = (d.first(), d.last()) {
            let used = (b - a).abs();
            if used > 0.0 {
                fuel_used = format!("{:.1}", used);
            }
        }
    }
    if fuel_used.is_empty() {
        if let Some(fc) = &fuel_lvl_ch {
            let d = decode_channel(&mut reader, fc);
            if let (Some(start), Some(end)) = (edge_median(&d, 15, true), edge_median(&d, 15, false)) {
                let used = start - end;
                if used > 0.0 && used < 500.0 {
                    fuel_used = format!("{:.1}", used);
                    fuel_is_estimate = true;
                }
            }
        }
    }

    let fuel_per_lap = match (fuel_used.parse::<f64>(), laps.parse::<f64>()) {
        (Ok(f), Ok(l)) if l > 0.0 => format!("{:.2}", f / l),
        _ => String::new(),
    };

    let channel_info: Vec<ChannelInfo> = channels
        .iter()
        .map(|c| ChannelInfo {
            name: c.name.clone(),
            unit: c.unit.clone(),
            freq: c.sample_rate,
            count: c.data_count,
        })
        .collect();

    Ok(Summary {
        driver: header.driver.clone(),
        track: header.venue.clone(),
        session: header.session.clone(),
        vehicle_id: header.vehicleid.clone(),
        date_raw: header.date_string.clone(),
        time_raw: header.time_string.clone(),
        best_lap,
        laps,
        fuel_used,
        fuel_per_lap,
        max_speed,
        ambient_temp,
        track_temp,
        mapping,
        fuel_is_estimate,
        channels: channel_info,
    })
}
