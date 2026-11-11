use identity_broker_explainer::registration::RegistrationVideo;
use identity_broker_explainer::render;
use std::process::ExitCode;

fn main() -> ExitCode {
    render::run(&RegistrationVideo)
}
