//! Local cover-image cache. Covers are downloaded once into the OS cache dir
//! (not the library — they're derived data) so the library renders offline and
//! doesn't rot when a remote URL dies. The cache key is a hash of the source
//! URL, so re-caching the same cover is a no-op.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use tauri::{AppHandle, Manager};

use crate::fetch::client;

/// FNV-1a. Hand-rolled because std's `DefaultHasher` may change between Rust
/// releases, which would silently orphan the whole cache.
fn hash_url(url: &str) -> u64 {
    url.bytes().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
    })
}

/// Best-effort image extension from a URL, defaulting to `jpg`.
fn extension_of(url: &str) -> &str {
    url.split('?')
        .next()
        .unwrap_or(url)
        .rsplit('.')
        .next()
        .filter(|ext| {
            (2..=4).contains(&ext.len()) && ext.chars().all(|c| c.is_ascii_alphanumeric())
        })
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

    let resp = client().get(url).send().await?.error_for_status()?;
    // An error page served with 200 would otherwise be cached as a "cover"
    // forever and render as a broken image.
    let is_image = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|t| t.starts_with("image/"));
    if !is_image {
        bail!("{url} is not an image");
    }
    let bytes = resp.bytes().await.context("downloading cover")?;

    // Write beside the target and rename into place, so an interrupted
    // download never leaves a truncated file that `dest.exists()` would trust.
    let tmp = dest.with_extension("part");
    std::fs::write(&tmp, &bytes).context("writing cover to cache")?;
    std::fs::rename(&tmp, &dest).context("moving cover into the cache")?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cache_key_is_stable() {
        // Pinned: if this changes, every cached cover is orphaned.
        assert_eq!(hash_url("https://example.com/a.jpg"), 0xb972_1565_a6b9_d302);
        assert_ne!(hash_url("a"), hash_url("b"));
        assert_eq!(extension_of("https://x/y.png?w=200"), "png");
        assert_eq!(extension_of("https://x/y"), "jpg");
    }
}
