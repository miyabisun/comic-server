pub fn natural_sort(items: &mut [String]) {
    items.sort_by(|a, b| natord::compare(a, b));
}
