use fframes::cli::clap;
use fframes::{EncoderOptions, RenderOptions, StaticMediaProvider, cli};
use fframes_skia_renderer::{
    SkiaFFramesRenderer, SkiaPipelineConcurrencyPolicy, SkiaPipelineConfig, metal::SkiaMetalCtx,
};
use identity_broker_explainer::{ExplainerMedia, ExplainerVideo, HEIGHT, WIDTH};
use std::process::ExitCode;

#[derive(Debug, clap::Args)]
struct VideoArgs {}

fn main() -> ExitCode {
    let args = cli::parse::<VideoArgs>();
    let media = ExplainerMedia::prepare().expect("media");
    let video = ExplainerVideo;
    let gpu = SkiaMetalCtx::new(WIDTH, HEIGHT).expect("GPU context");

    cli::new(
        &video,
        RenderOptions {
            media: Some(&media),
            video_encoder_options: EncoderOptions {
                preferred_encoder: Some("libx264"),
                // A low CRF keeps flat areas free of noise, so the GIF stays small.
                codec_params: Some(&[("crf", "12"), ("preset", "slow"), ("tune", "animation")]),
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .args(args)
    .backend(
        SkiaFFramesRenderer::new_metal(
            &gpu,
            SkiaPipelineConfig {
                concurrency_policy: SkiaPipelineConcurrencyPolicy::MaxPerformance,
                ..Default::default()
            },
        )
        .expect("skia renderer"),
    )
    .preview(fframes_native_player::cli_preview)
    .run()
}
