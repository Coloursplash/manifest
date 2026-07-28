//! Local cover-image cache. Covers are downloaded once into the OS cache dir
//! (not the library — they're derived data) so the library renders offline and
//! doesn't rot when a remote URL dies. The cache key is a hash of the source
//! URL, so re-caching the same cover is a no-op.

use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};

use crate::fetch::client;

fn hash_url(url: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut hasher);
    hasher.finish()
}

/// Best-effort image extension from a URL, defaulting to `jpg`.
fn extension_of(url: &str) -> &str {
    url.split('?')
        .next()
        .unwrap_or(url)
        .rsplit('.')
        .next()
        .filter(|ext| (2..=4).contains(&ext.len()) && ext.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("jpg")
}

/// Download `url` into the cover cache (if not already present) and return the
/// local file path.
pub async fn cache(app: &AppHandle, url: &str) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_cache_dir()
        .context("resolving cache dir")?
        .join("covers");
    std::fs::create_dir_all(&dir).context("creating cover cache dir")?;

    let dest = dir.join(format!("{:016x}.{}", hash_url(url), extension_of(url)));
    if dest.exists() {
        return Ok(dest);
    }

    let bytes = client()
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await
        .context("downloading cover")?;
    std::fs::write(&dest, &bytes).context("writing cover to cache")?;
    Ok(dest)
}
