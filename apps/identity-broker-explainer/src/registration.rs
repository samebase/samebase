//! How an app that the hub has never seen gets a sign-in client: two proofs, no account.
//!
//! Three requests come to the hub: the preview of a pull request, which passes both checks; another
//! repository that asks for the same URL, which the domain check refuses; and a token that GitHub
//! did not sign, which the first check refuses. The timeline is in beats at 100 BPM, as in the
//! first explainer, so music of that tempo lands each caption on a downbeat.
use fframes::svgr;
use fframes::{AudioMap, Color, Duration, FFramesContext, Frame, Svgr, Transform, Video};

use crate::{
    BEAT, GRID, INK, MONO, MUTED, PAPER, RED, RED_RGB, SANS, TEAL, TEAL_RGB, WHITE, beat, enter,
    github_logo, mix, mix_color, morph, place, progress,
};

type Point = (f32, f32);

const INK_RGB: [f32; 3] = [26., 26., 24.];

const CAPTION_X: f32 = 96.;
const CAPTION_Y: f32 = 158.;
const CAPTION_FADE: f32 = 0.15;

const RUN_X: f32 = 80.;
const RUN_Y: f32 = 300.;
const RUN_WIDTH: f32 = 440.;
const RUN_HEIGHT: f32 = 180.;

const CARD_X: f32 = 620.;
const CARD_Y: f32 = 300.;
const CARD_WIDTH: f32 = 600.;
const CARD_SHORT: f32 = 124.;
const CARD_TALL: f32 = 404.;
/// The column of the claim values, and of the line that compares the two ids.
const VALUE_X: f32 = CARD_X + 220.;

const HUB_X: f32 = 1320.;
const HUB_Y: f32 = 300.;
const HUB_WIDTH: f32 = 520.;
const HUB_HEADER: f32 = 120.;
const HUB_BODY: f32 = 200.;
const ROW_Y: [f32; 2] = [HUB_Y + HUB_HEADER + 60., HUB_Y + HUB_HEADER + 140.];

const SITE_X: f32 = CARD_X;
const SITE_Y: f32 = 780.;
const SITE_WIDTH: f32 = CARD_WIDTH;
const SITE_SHORT: f32 = 124.;
const SITE_TALL: f32 = 212.;

const CLIENT_Y: f32 = 700.;
const CLIENT_HEIGHT: f32 = 170.;

const HOST: &str = "calm-fox-41.convex.site";
const OUR_ID: &str = "892043157";

const HUB_AT: f32 = beat(2.5);
const SITE_AT: f32 = beat(1.5);
const DEPLOYS_AT: f32 = beat(1.);
const ROWS_AT: f32 = beat(8.5);
const CLIENT_AT: f32 = beat(32.5);
const END_AT: f32 = beat(52.);
const DURATION: f32 = beat(62.);

/// One request to `POST /hub-clients`, and what the hub answers. Times are seconds of the video.
struct Request {
    start: f32,
    run_title: &'static str,
    run_repository: &'static str,
    run_detail: &'static str,
    from_github: bool,
    token_title: &'static str,
    repository: &'static str,
    repository_id: &'static str,
    git_ref: &'static str,
    signed: bool,
    /// The header and the redirect URI of the request.
    card_at: f32,
    /// The token's title; each claim follows `claim_step` later.
    token_at: f32,
    claim_step: f32,
    seal_at: f32,
    sent_at: f32,
    repository_mark_at: f32,
    /// The hub fetches the file, shows it, compares the ids, and marks the domain row.
    domain: Option<Domain>,
    refusal: Option<(&'static str, f32)>,
}

struct Domain {
    fetch_at: f32,
    file_at: f32,
    compare_at: f32,
    mark_at: f32,
}

const REQUESTS: [Request; 3] = [
    Request {
        start: -1.,
        run_title: "GitHub Actions",
        run_repository: "octo-org/weather-app",
        run_detail: "pull request #12",
        from_github: true,
        token_title: "GitHub's token for the run",
        repository: "octo-org/weather-app",
        repository_id: OUR_ID,
        git_ref: "refs/pull/12/merge",
        signed: true,
        card_at: beat(4.5),
        token_at: beat(12.5),
        claim_step: BEAT / 2.,
        seal_at: beat(15.5),
        sent_at: beat(20.),
        repository_mark_at: beat(22.),
        domain: Some(Domain {
            fetch_at: beat(24.5),
            file_at: beat(25.5),
            compare_at: beat(27.),
            mark_at: beat(28.),
        }),
        refusal: None,
    },
    Request {
        start: beat(36.),
        run_title: "GitHub Actions",
        run_repository: "mallory/app",
        run_detail: "pull request #3",
        from_github: true,
        token_title: "GitHub's token for the run",
        repository: "mallory/app",
        repository_id: "553201876",
        git_ref: "refs/pull/3/merge",
        signed: true,
        card_at: beat(36.5),
        token_at: beat(37.),
        claim_step: BEAT / 4.,
        seal_at: beat(38.),
        sent_at: beat(38.5),
        repository_mark_at: beat(39.),
        domain: Some(Domain {
            fetch_at: beat(39.5),
            file_at: beat(40.),
            compare_at: beat(40.5),
            mark_at: beat(41.),
        }),
        refusal: Some(("repository_mismatch", beat(41.5))),
    },
    Request {
        start: beat(44.),
        run_title: "Any computer",
        run_repository: "curl -X POST",
        run_detail: "with a token it made itself",
        from_github: false,
        token_title: "A token in GitHub's format",
        repository: "octo-org/weather-app",
        repository_id: OUR_ID,
        git_ref: "refs/pull/12/merge",
        signed: false,
        card_at: beat(44.5),
        token_at: beat(45.),
        claim_step: BEAT / 4.,
        seal_at: beat(46.),
        sent_at: beat(46.5),
        repository_mark_at: beat(48.),
        domain: None,
        refusal: Some(("invalid_token", beat(48.5))),
    },
];

struct Caption {
    start: f32,
    parts: &'static [(&'static str, &'static str)],
}

/// Each caption lasts until the next one starts; the last one until the end card.
const CAPTIONS: [Caption; 13] = [
    Caption {
        start: -1.,
        parts: &[("A pull request opens a new preview.", INK)],
    },
    Caption {
        start: beat(4.),
        parts: &[("It asks the hub for a sign-in client.", INK)],
    },
    Caption {
        start: beat(8.),
        parts: &[("No account. No secret. ", INK), ("Two proofs.", TEAL)],
    },
    Caption {
        start: beat(12.),
        parts: &[("1. ", TEAL), ("GitHub signs a token for the run.", INK)],
    },
    Caption {
        start: beat(16.),
        parts: &[("It names the repo. Only this hub accepts it.", INK)],
    },
    Caption {
        start: beat(20.),
        parts: &[("The hub checks GitHub's signature.", INK)],
    },
    Caption {
        start: beat(24.),
        parts: &[("2. ", TEAL), ("The site must name the same repo.", INK)],
    },
    Caption {
        start: beat(28.),
        parts: &[("The file proves the repo controls the site.", INK)],
    },
    Caption {
        start: beat(32.),
        parts: &[("The hub makes a client for that exact URL.", INK)],
    },
    Caption {
        start: beat(36.),
        parts: &[("Another repo asks for the same URL?", INK)],
    },
    Caption {
        start: beat(40.),
        parts: &[("The site names another repo. ", INK), ("Refused.", RED)],
    },
    Caption {
        start: beat(44.),
        parts: &[("A token that GitHub did not sign?", INK)],
    },
    Caption {
        start: beat(48.),
        parts: &[("Refused at the first check.", RED)],
    },
];

/// How much of request `index` is on screen: it fades out as the next one starts.
fn presence(index: usize, t: f32) -> f32 {
    match REQUESTS.get(index + 1) {
        Some(next) => 1. - progress(t, next.start, 0.3),
        None => 1.,
    }
}

/// The request on screen, the newest one that has started.
fn current(t: f32) -> usize {
    REQUESTS
        .iter()
        .rposition(|request| request.start <= t)
        .unwrap_or(0)
}

fn caption(index: usize, t: f32) -> Svgr<'static> {
    let item = &CAPTIONS[index];
    let end = CAPTIONS
        .get(index + 1)
        .map_or(END_AT, |next| next.start - CAPTION_FADE);
    let opacity = enter(t, item.start, 0.2) * (1. - progress(t, end, CAPTION_FADE));
    if opacity <= 0. {
        return Svgr::empty();
    }
    let parts: Vec<Svgr<'static>> = item
        .parts
        .iter()
        .map(|(text, color)| svgr!(<tspan fill={*color}>{*text}</tspan>))
        .collect();
    let y = CAPTION_Y + (1. - enter(t, item.start, 0.2)) * 14.;
    svgr!(
        <text x={CAPTION_X} y={y} opacity={opacity} font-family={SANS} font-size="64" font-weight="600" letter-spacing="-1.5">{parts}</text>
    )
}

/// The first `amount` of the polyline through `points`, with an arrowhead at its moving end.
fn arrow(points: &[Point], amount: f32, color: &str, dashed: bool) -> Svgr<'static> {
    if amount <= 0. {
        return Svgr::empty();
    }
    let lengths: Vec<f32> = points
        .windows(2)
        .map(|pair| ((pair[1].0 - pair[0].0).powi(2) + (pair[1].1 - pair[0].1).powi(2)).sqrt())
        .collect();
    let mut left = lengths.iter().sum::<f32>() * amount;
    let mut path = format!("M{} {}", points[0].0, points[0].1);
    let mut end = points[0];
    let mut direction = (1., 0.);
    for (pair, length) in points.windows(2).zip(&lengths) {
        let step = left.min(*length);
        direction = (
            (pair[1].0 - pair[0].0) / length,
            (pair[1].1 - pair[0].1) / length,
        );
        end = (
            pair[0].0 + direction.0 * step,
            pair[0].1 + direction.1 * step,
        );
        path.push_str(&format!("L{} {}", end.0, end.1));
        left -= step;
        if left <= 0. {
            break;
        }
    }
    let size = 16.;
    let back = (end.0 - direction.0 * size, end.1 - direction.1 * size);
    let side = (-direction.1 * size * 0.6, direction.0 * size * 0.6);
    let head = format!(
        "M{} {}L{} {}L{} {}Z",
        end.0,
        end.1,
        back.0 + side.0,
        back.1 + side.1,
        back.0 - side.0,
        back.1 - side.1
    );
    let dash = if dashed { "10 10" } else { "none" };
    // The line stops at the base of the head, so its round cap does not show past the tip.
    svgr!(
        <g>
            <path d={path} fill="none" stroke={color.to_owned()} stroke-width="4" stroke-dasharray={dash} />
            <path d={head} fill={color.to_owned()} />
        </g>
    )
}

fn run_card(index: usize, t: f32) -> Svgr<'static> {
    let request = &REQUESTS[index];
    let appears = if index == 0 {
        beat(0.25)
    } else {
        request.start + BEAT / 2.
    };
    let shown = enter(t, appears, 0.4) * presence(index, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let x = RUN_X - (1. - enter(t, appears, 0.4)) * 28.;
    let (dash, logo, title_x) = if request.from_github {
        (
            "none",
            svgr!(<g transform={place(24., 26., 1.)}>{github_logo()}</g>),
            88.,
        )
    } else {
        ("12 9", Svgr::empty(), 24.)
    };
    svgr!(
        <g transform={Transform::translate(x, RUN_Y)} opacity={shown}>
            <rect width={RUN_WIDTH} height={RUN_HEIGHT} fill={WHITE} stroke={INK} stroke-width="3" stroke-dasharray={dash} />
            {logo}
            <text x={title_x} y="62" font-family={SANS} font-size="34" font-weight="600" fill={INK}>{request.run_title}</text>
            <text x="24" y="116" font-family={MONO} font-size="30" font-weight="500" fill={INK}>{request.run_repository}</text>
            <text x="24" y="156" font-family={SANS} font-size="27" font-weight="500" fill={MUTED}>{request.run_detail}</text>
        </g>
    )
}

/// The color of the repository id: teal once both ids are seen equal, red when they differ.
fn id_color(index: usize, t: f32) -> String {
    let request = &REQUESTS[index];
    match &request.domain {
        Some(domain) => {
            let target = if request.repository_id == OUR_ID {
                TEAL_RGB
            } else {
                RED_RGB
            };
            mix_color(INK_RGB, target, enter(t, domain.compare_at, 0.3))
        }
        None => INK.to_owned(),
    }
}

fn claim(
    index: usize,
    row: usize,
    key: &'static str,
    value: &'static str,
    color: String,
    t: f32,
) -> Svgr<'static> {
    let request = &REQUESTS[index];
    let at = request.token_at + request.claim_step * (row as f32 + 1.);
    let shown = enter(t, at, 0.25);
    if shown <= 0. {
        return Svgr::empty();
    }
    let y = 212. + row as f32 * 38.;
    let slide = (1. - shown) * 16.;
    svgr!(
        <g opacity={shown} transform={Transform::translate(slide, 0.)}>
            <text x="24" y={y} font-family={MONO} font-size="21" font-weight="500" fill={MUTED}>{key}</text>
            <text x={VALUE_X - CARD_X} y={y} font-family={MONO} font-size="24" font-weight="500" fill={color}>{value}</text>
        </g>
    )
}

fn seal(index: usize, t: f32) -> Svgr<'static> {
    let request = &REQUESTS[index];
    let shown = enter(t, request.seal_at, 0.25);
    if shown <= 0. {
        return Svgr::empty();
    }
    let size = mix(1.5, 1., shown);
    let (mark, text, color) = if request.signed {
        (
            svgr!(<g transform={place(-12., -12., 0.5)}>{github_logo()}</g>),
            "signed by GitHub",
            TEAL,
        )
    } else {
        (
            svgr!(<path d="M-10 -10L10 10M10 -10L-10 10" fill="none" stroke={RED} stroke-width="5" stroke-linecap="round" />),
            "not signed by GitHub",
            RED,
        )
    };
    svgr!(
        <g transform={place(40., 370., size)} opacity={shown}>
            {mark}
            <text x="28" y="9" font-family={SANS} font-size="26" font-weight="600" fill={color}>{text}</text>
        </g>
    )
}

/// The request: its header and redirect URI first, then GitHub's token grows under them.
fn request_card(index: usize, t: f32) -> Svgr<'static> {
    let request = &REQUESTS[index];
    let shown = enter(t, request.card_at, 0.4) * presence(index, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let grown = morph(t, request.token_at, 0.4);
    let height = mix(CARD_SHORT, CARD_TALL, grown);
    let token_title = enter(t, request.token_at + 0.2, 0.25);
    // The first request lights up the claims that the next caption names.
    let repository_color = if index == 0 {
        mix_color(INK_RGB, TEAL_RGB, enter(t, beat(16.5), 0.3))
    } else {
        INK.to_owned()
    };
    let audience_color = if index == 0 {
        mix_color(INK_RGB, TEAL_RGB, enter(t, beat(18.), 0.3))
    } else {
        INK.to_owned()
    };
    let y = CARD_Y + (1. - enter(t, request.card_at, 0.4)) * 20.;
    svgr!(
        <g transform={Transform::translate(CARD_X, y)} opacity={shown}>
            <rect width={CARD_WIDTH} height={height} fill={WHITE} stroke={INK} stroke-width="3" />
            <text x="24" y="48" font-family={MONO} font-size="28" font-weight="500" fill={INK}>"POST /hub-clients"</text>
            <text x="24" y="94" font-family={MONO} font-size="21" font-weight="500" fill={MUTED}>"redirect URI"</text>
            <text x={VALUE_X - CARD_X} y="94" font-family={MONO} font-size="24" font-weight="500" fill={INK}>{HOST}"/…"</text>
            <g opacity={token_title}>
                <path d={format!("M0 124H{CARD_WIDTH}")} stroke={INK} stroke-width="2" />
                <text x="24" y="168" font-family={SANS} font-size="28" font-weight="600" fill={INK}>{request.token_title}</text>
            </g>
            {claim(index, 0, "aud", "https://id.samebase.com", audience_color, t)}
            {claim(index, 1, "repository", request.repository, repository_color, t)}
            {claim(index, 2, "repository_id", request.repository_id, id_color(index, t), t)}
            {claim(index, 3, "ref", request.git_ref, INK.to_owned(), t)}
            {seal(index, t)}
        </g>
    )
}

fn hub_row_label(row: usize, text: &'static str, t: f32) -> Svgr<'static> {
    let shown = enter(t, ROWS_AT + 0.3 + row as f32 * BEAT, 0.3);
    svgr!(
        <g opacity={shown}>
            <circle cx={HUB_X + 48.} cy={ROW_Y[row]} r="22" fill={WHITE} stroke={INK} stroke-width="3" />
            <text x={HUB_X + 92.} y={ROW_Y[row] + 12.} font-family={SANS} font-size="34" font-weight="600" fill={INK}>{text}</text>
        </g>
    )
}

fn hub(t: f32) -> Svgr<'static> {
    let shown = enter(t, HUB_AT, BEAT / 2.);
    if shown <= 0. {
        return Svgr::empty();
    }
    let body = HUB_BODY * morph(t, ROWS_AT, 0.4);
    let y = HUB_Y - (1. - shown) * 60.;
    svgr!(
        <g opacity={shown}>
            <g transform={Transform::translate(0., y - HUB_Y)}>
                <rect x={HUB_X} y={HUB_Y + HUB_HEADER - 2.} width={HUB_WIDTH} height={body + 2.} fill={WHITE} stroke={INK} stroke-width="3" />
                <rect x={HUB_X} y={HUB_Y} width={HUB_WIDTH} height={HUB_HEADER} fill={TEAL} />
                <text x={HUB_X + 32.} y={HUB_Y + 62.} font-family={SANS} font-size="48" font-weight="700" fill={WHITE}>"Identity Hub"</text>
                <text x={HUB_X + 32.} y={HUB_Y + 100.} font-family={MONO} font-size="26" font-weight="500" fill={WHITE}>"id.samebase.com"</text>
                {hub_row_label(0, "the repository", t)}
                {hub_row_label(1, "the domain", t)}
            </g>
        </g>
    )
}

/// A check or a cross stamped over the empty circle of a row.
fn mark(row: usize, passed: bool, at: f32, t: f32) -> Svgr<'static> {
    let shown = enter(t, at, 0.25);
    if shown <= 0. {
        return Svgr::empty();
    }
    let (color, glyph) = if passed {
        (TEAL, "M-11 1L-3 9L12 -9")
    } else {
        (RED, "M-9 -9L9 9M9 -9L-9 9")
    };
    svgr!(
        <g transform={place(HUB_X + 48., ROW_Y[row], mix(1.6, 1., shown))} opacity={shown}>
            <circle r="24" fill={color} />
            <path d={glyph} fill="none" stroke={WHITE} stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        </g>
    )
}

fn marks(index: usize, t: f32) -> Svgr<'static> {
    let request = &REQUESTS[index];
    let shown = presence(index, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let domain = match &request.domain {
        Some(domain) => mark(1, request.repository_id == OUR_ID, domain.mark_at, t),
        None => Svgr::empty(),
    };
    svgr!(
        <g opacity={shown}>
            {mark(0, request.signed, request.repository_mark_at, t)}
            {domain}
        </g>
    )
}

fn arrows(index: usize, t: f32) -> Svgr<'static> {
    let request = &REQUESTS[index];
    let shown = presence(index, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let middle = CARD_Y + 62.;
    let asked = arrow(
        &[(RUN_X + RUN_WIDTH, middle), (CARD_X, middle)],
        morph(t, request.card_at - 0.1, 0.35),
        INK,
        false,
    );
    let sent = arrow(
        &[(CARD_X + CARD_WIDTH, middle), (HUB_X, middle)],
        morph(t, request.sent_at, 0.35),
        INK,
        false,
    );
    let fetched = match &request.domain {
        Some(domain) => {
            let site_middle = SITE_Y + 62.;
            arrow(
                &[
                    (HUB_X, ROW_Y[1]),
                    (HUB_X - 50., ROW_Y[1]),
                    (HUB_X - 50., site_middle),
                    (SITE_X + SITE_WIDTH, site_middle),
                ],
                morph(t, domain.fetch_at, 0.5),
                INK,
                true,
            )
        }
        None => Svgr::empty(),
    };
    svgr!(<g opacity={shown}>{asked}{sent}{fetched}</g>)
}

/// The run deploys the preview: only the first request's repository does.
fn deploys(t: f32) -> Svgr<'static> {
    let shown = presence(0, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let x = RUN_X + 64.;
    let line = arrow(
        &[
            (x, RUN_Y + RUN_HEIGHT),
            (x, SITE_Y + 62.),
            (SITE_X, SITE_Y + 62.),
        ],
        morph(t, DEPLOYS_AT, 0.6),
        MUTED,
        false,
    );
    let label = enter(t, DEPLOYS_AT + 0.4, 0.3);
    svgr!(
        <g opacity={shown}>
            {line}
            <text x={x + 20.} y={SITE_Y - 60.} opacity={label} font-family={SANS} font-size="28" font-weight="600" fill={MUTED}>"deploys"</text>
        </g>
    )
}

/// How much of the verification file is open, and in which request.
fn file_open(t: f32) -> (usize, f32) {
    let index = current(t);
    let open = match &REQUESTS[index].domain {
        Some(domain) => morph(t, domain.file_at, 0.35),
        None => 0.,
    };
    // The previous request's file closes while its request fades.
    if open <= 0. && index > 0 {
        let previous = index - 1;
        let closing = match &REQUESTS[previous].domain {
            Some(_) => presence(previous, t),
            None => 0.,
        };
        return (previous, closing);
    }
    (index, open)
}

fn site(t: f32) -> Svgr<'static> {
    let shown = enter(t, SITE_AT, 0.4);
    if shown <= 0. {
        return Svgr::empty();
    }
    let (index, open) = file_open(t);
    let height = mix(SITE_SHORT, SITE_TALL, open);
    let id_fill = id_color(index, t);
    svgr!(
        <g transform={Transform::translate(SITE_X, SITE_Y + (1. - shown) * 20.)} opacity={shown}>
            <rect width={SITE_WIDTH} height={height} fill={WHITE} stroke={INK} stroke-width="3" />
            <text x="24" y="54" font-family={MONO} font-size="30" font-weight="500" fill={INK}>{HOST}</text>
            <text x="24" y="98" font-family={SANS} font-size="27" font-weight="500" fill={MUTED}>"the preview of octo-org/weather-app"</text>
            <g opacity={progress(open, 0.5, 0.5)}>
                <path d={format!("M0 124H{SITE_WIDTH}")} stroke={INK} stroke-width="2" />
                <text x="24" y="160" font-family={MONO} font-size="22" font-weight="500" fill={MUTED}>"/samebase-verification.json"</text>
                <text x="24" y="196" font-family={MONO} font-size="28" font-weight="500" fill={INK}>"{\"repository\": \""<tspan fill={id_fill}>{OUR_ID}</tspan>"\"}"</text>
            </g>
        </g>
    )
}

/// The line between the id in the token and the id in the file, with = or ≠ on it.
fn comparison(index: usize, t: f32) -> Svgr<'static> {
    let request = &REQUESTS[index];
    let Some(domain) = &request.domain else {
        return Svgr::empty();
    };
    let shown = enter(t, domain.compare_at, 0.3) * presence(index, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let same = request.repository_id == OUR_ID;
    let color = if same { TEAL } else { RED };
    // Where the id of the token and the id of the file overlap.
    let x = VALUE_X + 100.;
    let top = CARD_Y + CARD_TALL;
    let bottom = SITE_Y;
    let middle = (top + bottom) / 2.;
    let glyph = if same {
        "M-9 -5H9M-9 5H9"
    } else {
        "M-9 -5H9M-9 5H9M5 -12L-5 12"
    };
    svgr!(
        <g opacity={shown}>
            <path d={format!("M{x} {top}V{bottom}")} stroke={color} stroke-width="4" />
            <g transform={place(x, middle, mix(1.5, 1., shown))}>
                <circle r="22" fill={color} />
                <path d={glyph} fill="none" stroke={WHITE} stroke-width="4" stroke-linecap="round" />
            </g>
        </g>
    )
}

/// The client that the first request gets: one exact redirect URI.
fn client(t: f32) -> Svgr<'static> {
    let shown = enter(t, CLIENT_AT, 0.4) * presence(0, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let x = HUB_X + HUB_WIDTH / 2.;
    let line = arrow(
        &[(x, HUB_Y + HUB_HEADER + HUB_BODY), (x, CLIENT_Y)],
        morph(t, CLIENT_AT - 0.2, 0.3),
        TEAL,
        false,
    );
    let y = CLIENT_Y + (1. - enter(t, CLIENT_AT, 0.4)) * 20.;
    svgr!(
        <g opacity={shown}>
            {line}
            <g transform={Transform::translate(HUB_X, y)}>
                <rect width={HUB_WIDTH} height={CLIENT_HEIGHT} fill={PAPER} stroke={TEAL} stroke-width="3" />
                <text x="28" y="54" font-family={SANS} font-size="32" font-weight="600" fill={TEAL}>"a preview client for"</text>
                <text x="28" y="100" font-family={MONO} font-size="26" font-weight="500" fill={INK}>{HOST}</text>
                <text x="28" y="140" font-family={MONO} font-size="26" font-weight="500" fill={MUTED}>"/auth/hub/callback"</text>
            </g>
        </g>
    )
}

fn refusal(index: usize, t: f32) -> Svgr<'static> {
    let Some((code, at)) = REQUESTS[index].refusal else {
        return Svgr::empty();
    };
    let shown = enter(t, at, 0.3) * presence(index, t);
    if shown <= 0. {
        return Svgr::empty();
    }
    let y = CLIENT_Y + 60. + (1. - enter(t, at, 0.3)) * 14.;
    svgr!(
        <text x={HUB_X + HUB_WIDTH} y={y} opacity={shown} text-anchor="end" font-family={MONO} font-size="38" font-weight="500" fill={RED}>{code}</text>
    )
}

fn diagram(t: f32) -> Svgr<'static> {
    let captions: Vec<Svgr<'static>> = (0..CAPTIONS.len()).map(|index| caption(index, t)).collect();
    let mut layers: Vec<Svgr<'static>> = Vec::new();
    for index in 0..REQUESTS.len() {
        layers.push(arrows(index, t));
        layers.push(run_card(index, t));
        layers.push(request_card(index, t));
        layers.push(comparison(index, t));
        layers.push(marks(index, t));
        layers.push(refusal(index, t));
    }
    svgr!(
        <g>
            {captions}
            {deploys(t)}
            {site(t)}
            {hub(t)}
            {client(t)}
            {layers}
        </g>
    )
}

fn end_card(t: f32) -> Svgr<'static> {
    let rise = |start: f32| (1. - enter(t, start, 0.25)) * 24.;
    let fade = |start: f32| enter(t, start, 0.25);
    svgr!(
        <g>
            <text x="116" y={300. + rise(beat(52.5))} opacity={fade(beat(52.5))} font-family={SANS} font-size="150" font-weight="700" letter-spacing="-4" fill={INK}>"Two proofs."</text>
            <text x="116" y={460. + rise(beat(53.))} opacity={fade(beat(53.))} font-family={SANS} font-size="150" font-weight="700" letter-spacing="-4" fill={TEAL}>"No account."</text>
            <text x="120" y={590. + rise(beat(54.))} opacity={fade(beat(54.))} font-family={SANS} font-size="54" font-weight="500" fill={MUTED}>"The repository: a token that GitHub signs."</text>
            <text x="120" y={668. + rise(beat(54.5))} opacity={fade(beat(54.5))} font-family={SANS} font-size="54" font-weight="500" fill={MUTED}>"The domain: a file that the site serves."</text>
            <text x="120" y={830. + rise(beat(56.))} opacity={fade(beat(56.))} font-family={MONO} font-size="46" font-weight="500" fill={INK}>"github.com/samebase/identity-hub"</text>
        </g>
    )
}

#[derive(Debug)]
pub struct RegistrationVideo;

impl Video for RegistrationVideo {
    const FPS: usize = 60;
    const WIDTH: usize = crate::WIDTH;
    const HEIGHT: usize = crate::HEIGHT;
    const BACKGROUND_COLOR: Color = Color::WHITE;

    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(DURATION)
    }

    fn audio(&self) -> AudioMap<'_> {
        AudioMap::none()
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let diagram_opacity = 1. - morph(t, END_AT, 0.45);
        svgr!(
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
                <defs>
                    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                        <path d="M48 0H0V48" fill="none" stroke={GRID} stroke-width="2" />
                    </pattern>
                </defs>
                <rect width="1920" height="1080" fill={PAPER} />
                <rect width="1920" height="1080" fill="url(#grid)" />
                <g opacity={diagram_opacity}>{diagram(t)}</g>
                {end_card(t)}
            </svg>
        )
    }
}
