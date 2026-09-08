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
        .unwrap();
    format!("manga-{height}.onnx")
}

fn is_color(image: &RgbImage) -> bool {
    // Conservative: even a small colored detail goes to IllustrationJaNai.
    image
        .pixels()
        .any(|p| p.0.iter().max().unwrap() - p.0.iter().min().unwrap() > 3)
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
    let mut decoded = DynamicImage::from_decoder(decoder)?;
    decoded.apply_orientation(orientation);
    let (width, height) = (decoded.width(), decoded.height());
    if decoded.color().has_alpha() && decoded.to_rgba8().pixels().any(|p| p[3] != 255) {
        return Err(
            "transparent pages are unsupported; flatten explicitly before remastering".into(),
        );
    }
    let image = decoded.into_rgb8();
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
            let w = tile_w.next_multiple_of(2) as usize;
            let h = tile_h.next_multiple_of(2) as usize;
            let mut data = vec![0_f32; 3 * w * h];
            for ty in 0..h {
                for tx in 0..w {
                    let p = image.get_pixel(
                        left + (tx as u32).min(tile_w - 1),
                        top + (ty as u32).min(tile_h - 1),
                    );
                    for c in 0..3 {
                        data[c * w * h + ty * w + tx] = f32::from(p[c]) / 255.;
                    }
                }
            }
            let tensor = Tensor::from_array(([1, 3, h, w], data.into_boxed_slice()))?;
            let outputs = session.run(ort::inputs![tensor])?;
            let (shape, pixels) = outputs[0].try_extract_tensor::<f32>()?;
            if shape.as_ref() != [1, 3, (h * 2) as i64, (w * 2) as i64] {
                return Err("model must produce a 2x RGB image".into());
            }
            for dy in 0..(height - y).min(128) * 2 {
                for dx in 0..(width - x).min(128) * 2 {
                    let offset =
                        ((y - top) * 2 + dy) as usize * w * 2 + ((x - left) * 2 + dx) as usize;
                    let mut pixel = [0; 3];
                    for c in 0..3 {
                        let value = pixels[c * w * h * 4 + offset];
                        if !value.is_finite() {
                            return Err("model returned non-finite pixels".into());
                        }
                        pixel[c] = (value.clamp(0., 1.) * 255.).round() as u8;
                    }
                    result.put_pixel(x * 2 + dx, y * 2 + dy, image::Rgb(pixel));
                }
            }
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
}
