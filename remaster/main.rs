use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageReader, RgbImage};
use ort::{session::Session, value::Tensor};
use std::{
    env,
    error::Error,
    fs::OpenOptions,
    io::{BufWriter, Read, Write},
    path::Path,
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;

fn model_name(height: u32, color: bool) -> String {
    if color {
        return "illustration.onnx".into();
    }
    let height = [1200_u32, 1300, 1400, 1500, 1600, 1920, 2048]
        .into_iter()
        .min_by_key(|h| h.abs_diff(height))
        .expect("the candidate height list is non-empty");
    format!("manga-{height}.onnx")
}

fn is_color(image: &RgbImage) -> bool {
    // Conservative: even a small colored detail goes to IllustrationJaNai.
    image
        .pixels()
        .any(|&image::Rgb([r, g, b])| r.max(g).max(b) - r.min(g).min(b) > 3)
}

/// Crops `size` pixels at `origin` from planar RGB floats of `width`x`height`.
fn crop_rgb(
    planes: &[f32],
    width: u32,
    height: u32,
    origin: (u32, u32),
    size: (u32, u32),
) -> Result<RgbImage> {
    let mut crop = Vec::with_capacity(3 * (size.0 * size.1) as usize);
    for y in origin.1..origin.1 + size.1 {
        for x in origin.0..origin.0 + size.0 {
            for c in 0..3 {
                let value = planes[((c * height + y) * width + x) as usize];
                if !value.is_finite() {
                    return Err("model returned non-finite pixels".into());
                }
                crop.push(value);
            }
        }
    }
    let crop = image::Rgb32FImage::from_raw(size.0, size.1, crop)
        .expect("the buffer holds three samples per cropped pixel");
    // image clamps to 0..=1 and rounds, so no float-to-byte cast is needed here.
    Ok(DynamicImage::ImageRgb32F(crop).into_rgb8())
}

fn remaster(models: &Path, input: &Path, output: &Path) -> Result<()> {
    if output.exists() {
        return Err("output already exists".into());
    }
    let mut reader = ImageReader::open(input)?.with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let (width, height) = image::image_dimensions(input)?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 16_000_000 {
        return Err("page must contain between 1 and 16 million pixels".into());
    }
    let mut decoder = reader.into_decoder()?;
    let orientation = decoder.orientation()?;
    let mut page = DynamicImage::from_decoder(decoder)?;
    page.apply_orientation(orientation);
    let (width, height) = (page.width(), page.height());
    if page.color().has_alpha() && page.to_rgba8().pixels().any(|p| p[3] != 255) {
        return Err(
            "transparent pages are unsupported; flatten explicitly before remastering".into(),
        );
    }
    let image = page.into_rgb8();
    let model = model_name(height, is_color(&image));
    let mut session = Session::builder()?
        .with_intra_threads(2)?
        .with_inter_threads(1)?
        .commit_from_file(models.join(&model))?;
    let mut result = RgbImage::new(width * 2, height * 2);
    // ponytail: one CPU page, 128px tiles + 32px context; tune only after seam/memory measurements.
    for y in (0..height).step_by(128) {
        for x in (0..width).step_by(128) {
            let left = x.saturating_sub(32);
            let top = y.saturating_sub(32);
            let tile_w = (x + 160).min(width) - left;
            let tile_h = (y + 160).min(height) - top;
            // 2x ESRGAN uses pixel-unshuffle; repeat the last pixel for odd dimensions.
            let w = tile_w.next_multiple_of(2);
            let h = tile_h.next_multiple_of(2);
            let mut data = vec![0_f32; 3 * (w * h) as usize];
            for ty in 0..h {
                for tx in 0..w {
                    let p = image.get_pixel(left + tx.min(tile_w - 1), top + ty.min(tile_h - 1));
                    for c in 0..3 {
                        data[((c * h + ty) * w + tx) as usize] = f32::from(p[c as usize]) / 255.;
                    }
                }
            }
            let tensor =
                Tensor::from_array(([1, 3, h as usize, w as usize], data.into_boxed_slice()))?;
            let outputs = session.run(ort::inputs![tensor])?;
            let (shape, pixels) = outputs[0].try_extract_tensor::<f32>()?;
            if shape.as_ref() != [1, 3, i64::from(h * 2), i64::from(w * 2)] {
                return Err("model must produce a 2x RGB image".into());
            }
            let tile = crop_rgb(
                pixels,
                w * 2,
                h * 2,
                ((x - left) * 2, (y - top) * 2),
                ((width - x).min(128) * 2, (height - y).min(128) * 2),
            )?;
            image::imageops::replace(&mut result, &tile, i64::from(x * 2), i64::from(y * 2));
        }
    }
    // Output is always PNG, and an existing file is never overwritten.
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)?;
    let mut writer = BufWriter::new(file);
    image::codecs::png::PngEncoder::new(&mut writer).write_image(
        result.as_raw(),
        result.width(),
        result.height(),
        image::ExtendedColorType::Rgb8,
    )?;
    writer.flush()?;
    writer.get_ref().sync_all()?;
    eprintln!("{model}: {width}x{height} -> {}x{}", width * 2, height * 2);
    Ok(())
}

fn main() {
    if env::var_os("COMIC_REMASTER_CHILD").is_some() {
        // The server owns stdin's pipe. EOF also stops inference after a server SIGKILL.
        std::thread::spawn(|| {
            let _ = std::io::stdin().read(&mut [0_u8]);
            std::process::exit(1);
        });
    }
    let args: Vec<_> = env::args_os().skip(1).collect();
    if args.len() != 3 {
        eprintln!("Usage: comic-remaster <model-dir> <input.png|jpg> <new-output.png>");
        std::process::exit(2);
    }
    if let Err(error) = remaster(
        Path::new(&args[0]),
        Path::new(&args[1]),
        Path::new(&args[2]),
    ) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_model_by_full_page_height_and_preserves_color() {
        assert_eq!(model_name(1210, false), "manga-1200.onnx");
        assert_eq!(model_name(1900, false), "manga-1920.onnx");
        assert_eq!(model_name(2100, false), "manga-2048.onnx");
        assert_eq!(model_name(1600, true), "illustration.onnx");
        assert!(!is_color(&image::RgbImage::from_pixel(
            2,
            2,
            image::Rgb([120, 120, 120])
        )));
        let mut page = image::RgbImage::from_pixel(100, 100, image::Rgb([255, 255, 255]));
        page.put_pixel(0, 0, image::Rgb([240, 220, 220]));
        assert!(is_color(&page));
    }

    #[test]
    fn crops_planar_output_and_rounds_into_bytes() {
        // 2x1 planes: R = [-0.5, 0.5], G = [1.5, 0.25], B = [0.0, 1.0]; crop the right pixel.
        let planes = [-0.5, 0.5, 1.5, 0.25, 0.0, 1.0];
        let tile = crop_rgb(&planes, 2, 1, (1, 0), (1, 1)).unwrap();
        assert_eq!(tile.dimensions(), (1, 1));
        assert_eq!(tile.get_pixel(0, 0).0, [128, 64, 255]);
        let full = crop_rgb(&planes, 2, 1, (0, 0), (2, 1)).unwrap();
        assert_eq!(full.get_pixel(0, 0).0, [0, 255, 0]);
        assert!(crop_rgb(&[f32::NAN, 0., 0.], 1, 1, (0, 0), (1, 1)).is_err());
    }
}
