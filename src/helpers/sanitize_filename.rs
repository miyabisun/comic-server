use super::normalize_brackets::normalize_brackets;

pub fn sanitize_filename(filename: &str) -> String {
    let replaced = filename
        .replace('#', "＃")
        .replace('?', "？")
        .replace('<', "＜")
        .replace('>', "＞")
        .replace(':', "：")
        .replace('"', "\u{201D}")
        .replace('|', "｜")
        .replace('*', "＊")
        .replace('\\', "＼");

    normalize_brackets(&replaced)
}
