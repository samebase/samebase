use identity_broker_explainer::{ExplainerVideo, render};
use std::process::ExitCode;

fn main() -> ExitCode {
    render::run(&ExplainerVideo)
}
