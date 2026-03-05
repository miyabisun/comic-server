pub const KNOWN_TAGS: &[&str] = &[
    "DL版",
    "中文翻訳",
    "中国翻訳",
    "無修正",
    "進行中",
    "完結",
    "FANZA特別版",
    "デジタル版",
    "単行本版",
    "修正版",
];

pub fn normalize_brackets(filename: &str) -> String {
    let mut normalized = String::from(filename);

    // Fix known tag patterns without closing bracket:
    // [DL版 (オリジナル) -> [DL版] (オリジナル)
    for tag in KNOWN_TAGS {
        let open_pattern = format!("[{tag}");
        let closed_pattern = format!("[{tag}]");
        // Only fix if the tag appears without a closing bracket
        // i.e., "[DL版" exists but "[DL版]" does not at that position
        loop {
            let Some(pos) = normalized.find(&open_pattern) else {
                break;
            };
            let after_tag = pos + open_pattern.len();
            // Check if the character right after the tag is already ']'
            if normalized[after_tag..].starts_with(']') {
                // Already properly closed — skip this occurrence
                // To avoid infinite loop, we need to move past this match
                break;
            }
            // Check if followed by whitespace + bracket
            let after = normalized[after_tag..].trim_start();
            if after.starts_with('(') || after.starts_with('[') || after.starts_with('{') {
                normalized = format!(
                    "{}{}{}",
                    &normalized[..pos],
                    closed_pattern,
                    &normalized[after_tag..]
                );
            } else {
                break;
            }
        }
    }

    // Count remaining bracket imbalances
    let brackets: &[(&str, &str)] = &[
        ("(", ")"),
        ("[", "]"),
        ("{", "}"),
        ("（", "）"),
        ("［", "］"),
        ("｛", "｝"),
    ];

    for &(open, close) in brackets {
        let open_count = normalized.matches(open).count();
        let close_count = normalized.matches(close).count();
        if open_count > close_count {
            for _ in 0..(open_count - close_count) {
                normalized.push_str(close);
            }
        }
    }

    normalized
}
