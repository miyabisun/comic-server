use regex::Regex;
use std::sync::LazyLock;

use super::normalize_brackets::KNOWN_TAGS;
use crate::models::ParseResult;

static KNOWN_TAG_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    let alts = KNOWN_TAGS.join("|");
    Regex::new(&format!(r"\[({alts})\]\s*")).unwrap()
});

// (genre) ... [brand] title (original)
static PAT_FULL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\(([^)]+)\).*\[([^\]]+)\](.+)\(([^)]+)\)$").unwrap());

// (genre) ... [brand] title
static PAT_NO_ORIG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\(([^)]+)\).*\[([^\]]+)\](.+)").unwrap());

// [brand] title
static PAT_BRAND_ONLY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\[([^\]]+)\](.+)").unwrap());

fn strip_known_tags(name: &str) -> String {
    let result = KNOWN_TAG_PATTERN.replace_all(name, "");
    // Collapse multiple spaces
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn parse_comic_name(name: &str) -> ParseResult {
    let stripped = strip_known_tags(name);

    if let Some(caps) = PAT_FULL.captures(&stripped) {
        return ParseResult {
            genre: caps[1].trim().to_string(),
            brand: caps[2].trim().to_string(),
            title: caps[3].trim().to_string(),
            original: caps[4].trim().to_string(),
        };
    }

    if let Some(caps) = PAT_NO_ORIG.captures(&stripped) {
        return ParseResult {
            genre: caps[1].trim().to_string(),
            brand: caps[2].trim().to_string(),
            title: caps[3].trim().to_string(),
            original: String::new(),
        };
    }

    if let Some(caps) = PAT_BRAND_ONLY.captures(&stripped) {
        return ParseResult {
            genre: String::new(),
            brand: caps[1].trim().to_string(),
            title: caps[2].trim().to_string(),
            original: String::new(),
        };
    }

    ParseResult {
        title: name.to_string(),
        genre: String::new(),
        brand: String::new(),
        original: String::new(),
    }
}
