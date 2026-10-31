//! The Identity Broker explainer: one diagram that changes from the first frame to the loop.
//!
//! Teal lines work and red lines fail. Every time below is a second of the video.
use fframes::{AudioMap, Color, Duration, FFramesContext, Frame, Svgr, Transform, Video};
use fframes::{include_media_dir, svgr};

include_media_dir!(pub struct ExplainerMedia, "media");

pub const WIDTH: usize = 1920;
pub const HEIGHT: usize = 1080;

const PAPER: &str = "#fbfaf6";
const GRID: &str = "#efede5";
const INK: &str = "#1a1a18";
const MUTED: &str = "#6e6b63";
const WHITE: &str = "#ffffff";
const TEAL: &str = "#0f7c70";
const RED: &str = "#c2412d";
const TEAL_RGB: [f32; 3] = [15., 124., 112.];
const RED_RGB: [f32; 3] = [194., 65., 45.];

const SANS: &str = "Inter";
const MONO: &str = "JetBrains Mono";

const CAPTION_X: f32 = 96.;
const CAPTION_Y: f32 = 158.;
const DIAGRAM_CENTER_Y: f32 = 620.;

const CARD_X: f32 = 96.;
const CARD_WIDTH: f32 = 480.;
const CARD_HEIGHT: f32 = 88.;
const CARD_PITCH: f32 = 104.;
const ROW_X: f32 = 270.;
const ROW_SCALE: f32 = 0.56;
const ROW_PITCH: f32 = 53.;
const GROUP_GAP: f32 = 26.;

const BROKER_X: f32 = 830.;
const BROKER_WIDTH: f32 = 340.;
const BROKER_HEIGHT: f32 = 240.;
const BROKER_IN: Point = (BROKER_X, DIAGRAM_CENTER_Y);
const BROKER_OUT: Point = (BROKER_X + BROKER_WIDTH, DIAGRAM_CENTER_Y);

const GOOGLE_X: f32 = 1424.;
const GOOGLE_Y: f32 = 390.;
const GOOGLE_WIDTH: f32 = 400.;
const GOOGLE_HEIGHT: f32 = 460.;
const CLIENT_X: f32 = GOOGLE_X + 28.;
const CLIENT_WIDTH: f32 = GOOGLE_WIDTH - 56.;
const CLIENT_HEIGHT: f32 = 100.;
const CLIENT_FIRST_Y: f32 = 488.;
const CLIENT_SECOND_Y: f32 = 604.;
const WILDCARD_CENTER_Y: f32 = 778.;
const CLIENT_MERGED_HEIGHT: f32 = 148.;
const CLIENT_MERGED_Y: f32 = DIAGRAM_CENTER_Y - CLIENT_MERGED_HEIGHT / 2.;

const CLIENT_ONE_AT: f32 = 0.35;
const CLIENT_TWO_AT: f32 = 2.8;
const REFUSED_AT: f32 = 5.75;
const WILDCARD_AT: f32 = 7.1;
const BROKER_AT: f32 = 10.6;
const REROUTE_AT: f32 = 11.15;
const MERGE_AT: f32 = 11.95;
const UPSTREAM_AT: f32 = 12.45;
const SIGN_IN_LABEL_AT: f32 = 1.0;
const APPS_AT: f32 = 18.6;
const END_AT: f32 = 22.6;
const LOOP_AT: f32 = 26.2;
const LOOP_FADE: f32 = 0.5;

const LINE_SECONDS: f32 = 0.5;
const LEG_SECONDS: f32 = 0.35;

#[derive(Clone, Copy)]
enum Route {
    /// Registered at this Google client, directly.
    Direct(usize),
    /// Refused by Google, which has this URL on no client.
    Refused,
    /// Registered at the broker when it deploys.
    Broker,
}

struct Deployment {
    url: &'static str,
    app: usize,
    appears: f32,
    line: f32,
    route: Route,
}

const fn deployment(
    url: &'static str,
    app: usize,
    appears: f32,
    line: f32,
    route: Route,
) -> Deployment {
    Deployment {
        url,
        app,
        appears,
        line,
        route,
    }
}

const DEPLOYMENTS: [Deployment; 14] = [
    deployment("myapp.com", 0, -1., 0.7, Route::Direct(0)),
    deployment("localhost:5173", 0, 2.5, 3.1, Route::Direct(1)),
    deployment("pr-41.myapp.com", 0, 5.0, 5.25, Route::Refused),
    deployment("pr-42.myapp.com", 0, 5.5, 5.75, Route::Refused),
    deployment("pr-43.myapp.com", 0, 6.0, 6.25, Route::Refused),
    deployment("pr-44.myapp.com", 0, 16.0, 16.3, Route::Broker),
    deployment("pr-45.myapp.com", 0, 16.9, 17.2, Route::Broker),
    deployment("shop.com", 1, 19.6, 19.6, Route::Broker),
    deployment("localhost:3000", 1, 19.7, 19.7, Route::Broker),
    deployment("pr-7.shop.com", 1, 19.8, 19.8, Route::Broker),
    deployment("pr-8.shop.com", 1, 19.9, 19.9, Route::Broker),
    deployment("notes.app", 2, 20.05, 20.05, Route::Broker),
    deployment("pr-3.notes.app", 2, 20.15, 20.15, Route::Broker),
    deployment("pr-4.notes.app", 2, 20.25, 20.25, Route::Broker),
];

/// Every sign-in: which deployment, and when. A check mark means the sign-in came back.
const SIGN_INS: [(usize, f32); 14] = [
    (0, 1.2),
    (1, 3.6),
    (2, 13.3),
    (3, 13.65),
    (4, 14.0),
    (5, 16.7),
    (6, 17.6),
    (7, 20.4),
    (11, 20.52),
    (8, 20.64),
    (12, 20.76),
    (9, 20.88),
    (13, 21.0),
    (10, 21.12),
];

const APP_NAMES: [&str; 3] = ["myapp", "shop", "notes"];

struct Caption {
    start: f32,
    end: f32,
    parts: &'static [(&'static str, &'static str)],
}

const CAPTIONS: [Caption; 9] = [
    Caption {
        start: -1.,
        end: 2.35,
        parts: &[("Your app needs Google sign-in.", INK)],
    },
    Caption {
        start: 2.5,
        end: 4.65,
        parts: &[("Development gets its own client.", INK)],
    },
    Caption {
        start: 4.8,
        end: 6.85,
        parts: &[("Every pull request gets a new URL.", INK)],
    },
    Caption {
        start: 7.0,
        end: 9.15,
        parts: &[("Google only accepts exact URLs. No wildcards.", INK)],
    },
    Caption {
        start: 9.3,
        end: 10.45,
        parts: &[("So sign-in fails on every preview.", RED)],
    },
    Caption {
        start: 10.6,
        end: 12.75,
        parts: &[
            ("Identity Broker", TEAL),
            (" sits in front of Google.", INK),
        ],
    },
    Caption {
        start: 12.9,
        end: 15.65,
        parts: &[("Google sees one client and one URL.", INK)],
    },
    Caption {
        start: 15.8,
        end: 18.4,
        parts: &[("Previews register their exact URL at deploy.", INK)],
    },
    Caption {
        start: 18.55,
        end: END_AT,
        parts: &[("All your apps can share it.", INK)],
    },
];

type Point = (f32, f32);

fn progress(t: f32, start: f32, seconds: f32) -> f32 {
    ((t - start) / seconds).clamp(0., 1.)
}

fn enter(t: f32, start: f32, seconds: f32) -> f32 {
    1. - (1. - progress(t, start, seconds)).powi(3)
}

fn morph(t: f32, start: f32, seconds: f32) -> f32 {
    let x = progress(t, start, seconds);
    if x < 0.5 {
        4. * x.powi(3)
    } else {
        1. - (-2. * x + 2.).powi(3) / 2.
    }
}

fn mix(from: f32, to: f32, amount: f32) -> f32 {
    from + (to - from) * amount
}

fn mix_point(from: Point, to: Point, amount: f32) -> Point {
    (mix(from.0, to.0, amount), mix(from.1, to.1, amount))
}

fn mix_color(from: [f32; 3], to: [f32; 3], amount: f32) -> String {
    let channel = |index: usize| mix(from[index], to[index], amount).round() as u8;
    format!("#{:02x}{:02x}{:02x}", channel(0), channel(1), channel(2))
}

fn place(x: f32, y: f32, scale: f32) -> Transform {
    let mut transform = Transform::translate(x, y);
    transform.scale.x = f64::from(scale);
    transform.scale.y = f64::from(scale);
    transform
}

/// The first `amount` of the curve from `from` to `to`, split with de Casteljau, and its end.
fn curve(from: Point, to: Point, amount: f32) -> (String, Point) {
    let bend = (to.0 - from.0) * 0.55;
    let first = (from.0 + bend, from.1);
    let second = (to.0 - bend, to.1);
    let a = mix_point(from, first, amount);
    let b = mix_point(first, second, amount);
    let c = mix_point(second, to, amount);
    let d = mix_point(a, b, amount);
    let e = mix_point(b, c, amount);
    let end = mix_point(d, e, amount);
    let path = format!(
        "M{} {}C{} {} {} {} {} {}",
        from.0, from.1, a.0, a.1, d.0, d.1, end.0, end.1
    );
    (path, end)
}

fn rerouted(t: f32, index: usize) -> f32 {
    morph(t, REROUTE_AT + index as f32 * 0.06, 0.8)
}

fn merged(t: f32) -> f32 {
    morph(t, MERGE_AT, 0.6)
}

fn client_y(client: usize, t: f32) -> f32 {
    let start = if client == 0 {
        CLIENT_FIRST_Y
    } else {
        CLIENT_SECOND_Y
    };
    mix(start, CLIENT_MERGED_Y, merged(t))
}

fn client_port(client: usize, t: f32) -> Point {
    let height = mix(CLIENT_HEIGHT, CLIENT_MERGED_HEIGHT, merged(t));
    (CLIENT_X, client_y(client, t) + height / 2.)
}

fn refused_port() -> Point {
    (GOOGLE_X, WILDCARD_CENTER_Y)
}

fn to_apps(t: f32) -> f32 {
    morph(t, APPS_AT, 0.9)
}

/// The y of the middle of row `index` once every app is on screen.
fn row_center(index: usize) -> f32 {
    let rows = DEPLOYMENTS.len() as f32;
    let gaps = (APP_NAMES.len() - 1) as f32;
    let top = DIAGRAM_CENTER_Y - (rows * ROW_PITCH + gaps * GROUP_GAP) / 2. + ROW_PITCH / 2.;
    top + index as f32 * ROW_PITCH + DEPLOYMENTS[index].app as f32 * GROUP_GAP
}

/// Where a card is: its top left corner and scale.
fn card_box(index: usize, t: f32) -> (f32, f32, f32) {
    let shown: f32 = DEPLOYMENTS[..7]
        .iter()
        .map(|item| enter(t, item.appears, 0.4))
        .sum();
    let stacked = DIAGRAM_CENTER_Y + (index as f32 - (shown - 1.) / 2.) * CARD_PITCH;
    let (center, x, scale) = if index < 7 {
        let amount = to_apps(t);
        (
            mix(stacked, row_center(index), amount),
            mix(CARD_X, ROW_X, amount),
            mix(1., ROW_SCALE, amount),
        )
    } else {
        (row_center(index), ROW_X, ROW_SCALE)
    };
    (x, center - scale * CARD_HEIGHT / 2., scale)
}

fn card_port(index: usize, t: f32) -> Point {
    let (x, y, scale) = card_box(index, t);
    (x + scale * CARD_WIDTH, y + scale * CARD_HEIGHT / 2.)
}

fn line_end(index: usize, t: f32) -> Point {
    match DEPLOYMENTS[index].route {
        Route::Direct(client) => mix_point(client_port(client, t), BROKER_IN, rerouted(t, index)),
        Route::Refused => mix_point(refused_port(), BROKER_IN, rerouted(t, index)),
        Route::Broker => BROKER_IN,
    }
}

fn line(index: usize, t: f32) -> Svgr<'static> {
    let item = &DEPLOYMENTS[index];
    let drawn = morph(t, item.line, LINE_SECONDS);
    if drawn <= 0. {
        return Svgr::empty();
    }
    let color = match item.route {
        Route::Refused => mix_color(RED_RGB, TEAL_RGB, rerouted(t, index)),
        Route::Direct(_) | Route::Broker => TEAL.to_owned(),
    };
    let (path, _) = curve(card_port(index, t), line_end(index, t), drawn);
    let width = mix(4., 3., to_apps(t));
    svgr!(<path d={path} fill="none" stroke={color} stroke-width={width} stroke-linecap="round" />)
}

fn refused_mark(index: usize, t: f32) -> Svgr<'static> {
    let item = &DEPLOYMENTS[index];
    if !matches!(item.route, Route::Refused) {
        return Svgr::empty();
    }
    let shown = enter(t, item.line + LINE_SECONDS, 0.22) * (1. - progress(t, REROUTE_AT, 0.25));
    if shown <= 0. {
        return Svgr::empty();
    }
    let (x, y) = refused_port();
    svgr!(
        <g transform={place(x, y, mix(1.7, 1., shown))} opacity={shown}>
            <circle r="24" fill={PAPER} />
            <path d="M-13 -13L13 13M13 -13L-13 13" fill="none" stroke={RED} stroke-width="7" stroke-linecap="round" />
        </g>
    )
}

fn check_at(index: usize) -> Option<f32> {
    let (_, start) = SIGN_INS.iter().find(|(signed_in, _)| *signed_in == index)?;
    let legs = if matches!(DEPLOYMENTS[index].route, Route::Direct(_)) {
        2.
    } else {
        4.
    };
    Some(start + LEG_SECONDS * legs)
}

fn card(index: usize, t: f32) -> Svgr<'static> {
    let item = &DEPLOYMENTS[index];
    let shown = enter(t, item.appears, 0.4);
    if shown <= 0. {
        return Svgr::empty();
    }
    let (x, y, scale) = card_box(index, t);
    let checked = check_at(index).map_or(0., |start| enter(t, start, 0.25));
    let check = if checked > 0. {
        let size = mix(1.4, 1., checked);
        svgr!(
            <g transform={place(CARD_WIDTH - 46., CARD_HEIGHT / 2., size)} opacity={checked}>
                <path d="M-15 1L-4 12L16 -12" fill="none" stroke={TEAL} stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            </g>
        )
    } else {
        Svgr::empty()
    };
    svgr!(
        <g transform={place(x - (1. - shown) * 28., y, scale)} opacity={shown}>
            <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={WHITE} stroke={INK} stroke-width="3" />
            <text x="28" y="58" font-family={MONO} font-size="38" font-weight="500" fill={INK}>{item.url}</text>
            {check}
        </g>
    )
}

fn app_label(app: usize, t: f32) -> Svgr<'static> {
    let shown = if app == 0 {
        enter(t, APPS_AT + 0.5, 0.4)
    } else {
        let first = DEPLOYMENTS.iter().find(|item| item.app == app);
        first.map_or(0., |item| enter(t, item.appears, 0.4))
    };
    if shown <= 0. {
        return Svgr::empty();
    }
    let rows: Vec<usize> = (0..DEPLOYMENTS.len())
        .filter(|&i| DEPLOYMENTS[i].app == app)
        .collect();
    let top = row_center(rows[0]);
    let bottom = row_center(rows[rows.len() - 1]);
    let y = (top + bottom) / 2. + 14.;
    svgr!(
        <text x={CARD_X} y={y} opacity={shown} font-family={SANS} font-size="42" font-weight="600" fill={INK}>{APP_NAMES[app]}</text>
    )
}

/// A sign-in: out along `legs` and back the same way.
fn pulse_on(legs: &[(Point, Point)], start: f32, t: f32) -> Svgr<'static> {
    let travelled = (t - start) / LEG_SECONDS;
    let count = legs.len() as f32;
    if travelled <= 0. || travelled >= count * 2. {
        return Svgr::empty();
    }
    let (leg, along) = if travelled < count {
        (travelled as usize, travelled.fract())
    } else {
        (
            (count * 2. - travelled) as usize,
            1. - (travelled - count).fract(),
        )
    };
    let (from, to) = legs[leg.min(legs.len() - 1)];
    let (_, point) = curve(from, to, along);
    svgr!(<circle cx={point.0} cy={point.1} r="13" fill={PAPER} stroke={TEAL} stroke-width="6" />)
}

fn pulse(index: usize, start: f32, t: f32) -> Svgr<'static> {
    let port = card_port(index, t);
    match DEPLOYMENTS[index].route {
        Route::Direct(client) => pulse_on(&[(port, client_port(client, t))], start, t),
        Route::Refused | Route::Broker => pulse_on(
            &[(port, BROKER_IN), (BROKER_OUT, client_port(0, t))],
            start,
            t,
        ),
    }
}

fn broker(t: f32) -> Svgr<'static> {
    let shown = enter(t, BROKER_AT, 0.55);
    if shown <= 0. {
        return Svgr::empty();
    }
    let y = DIAGRAM_CENTER_Y - BROKER_HEIGHT / 2. - (1. - shown) * 90.;
    svgr!(
        <g transform={Transform::translate(BROKER_X, y)} opacity={shown}>
            <rect width={BROKER_WIDTH} height={BROKER_HEIGHT} fill={TEAL} />
            <text x={BROKER_WIDTH / 2.} y="96" text-anchor="middle" font-family={SANS} font-size="60" font-weight="700" fill={WHITE}>"Identity"</text>
            <text x={BROKER_WIDTH / 2.} y="164" text-anchor="middle" font-family={SANS} font-size="60" font-weight="700" fill={WHITE}>"Broker"</text>
        </g>
    )
}

fn upstream_line(t: f32) -> Svgr<'static> {
    let drawn = morph(t, UPSTREAM_AT, 0.4);
    if drawn <= 0. {
        return Svgr::empty();
    }
    let (path, _) = curve(BROKER_OUT, client_port(0, t), drawn);
    svgr!(<path d={path} fill="none" stroke={TEAL} stroke-width="6" stroke-linecap="round" />)
}

fn google_logo() -> Svgr<'static> {
    svgr!(
        <g>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-16.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </g>
    )
}

fn client(index: usize, t: f32) -> Svgr<'static> {
    let shown = enter(
        t,
        if index == 0 {
            CLIENT_ONE_AT
        } else {
            CLIENT_TWO_AT
        },
        0.35,
    );
    let merge = merged(t);
    let opacity = if index == 0 {
        shown
    } else {
        shown * (1. - merge)
    };
    if opacity <= 0. {
        return Svgr::empty();
    }
    let one = index == 0 && merge >= 0.5;
    let label = match (index, one) {
        (_, true) => "one client",
        (0, false) => "production client",
        _ => "development client",
    };
    let color = if one { TEAL } else { INK };
    let height = mix(CLIENT_HEIGHT, CLIENT_MERGED_HEIGHT, merge);
    let text = if one {
        let url = enter(t, MERGE_AT + 0.4, 0.3);
        svgr!(
            <g>
                <text x={CLIENT_WIDTH / 2.} y="62" text-anchor="middle" font-family={SANS} font-size="38" font-weight="600" fill={color}>{label}</text>
                <text x={CLIENT_WIDTH / 2.} y="112" opacity={url} text-anchor="middle" font-family={MONO} font-size="29" font-weight="500" fill={color}>"auth.yourteam.com"</text>
            </g>
        )
    } else {
        svgr!(
            <text x={CLIENT_WIDTH / 2.} y="61" text-anchor="middle" font-family={SANS} font-size="32" font-weight="600" fill={color}>{label}</text>
        )
    };
    svgr!(
        <g transform={Transform::translate(CLIENT_X, client_y(index, t))} opacity={opacity}>
            <rect width={CLIENT_WIDTH} height={height} fill={PAPER} stroke={color} stroke-width="3" />
            {text}
        </g>
    )
}

/// The URL that previews would need: Google does not take a wildcard, on any client.
fn wildcard(t: f32) -> Svgr<'static> {
    let shown = enter(t, WILDCARD_AT, 0.3) * (1. - progress(t, BROKER_AT, 0.25));
    if shown <= 0. {
        return Svgr::empty();
    }
    svgr!(
        <text x={GOOGLE_X + 216.} y={WILDCARD_CENTER_Y + 12.} opacity={shown} text-anchor="middle" font-family={MONO} font-size="35" font-weight="500" fill={RED}>"pr-*.myapp.com"</text>
    )
}

fn google(t: f32) -> Svgr<'static> {
    svgr!(
        <g>
            <rect x={GOOGLE_X} y={GOOGLE_Y} width={GOOGLE_WIDTH} height={GOOGLE_HEIGHT} fill={WHITE} stroke={INK} stroke-width="3" />
            <g transform={place(GOOGLE_X + 28., GOOGLE_Y + 28., 1.2)}>{google_logo()}</g>
            <text x={GOOGLE_X + 104.} y={GOOGLE_Y + 76.} font-family={SANS} font-size="52" font-weight="600" fill={INK}>"Google"</text>
            {wildcard(t)}
            {client(1, t)}
            {client(0, t)}
        </g>
    )
}

fn sign_in_label(t: f32) -> Svgr<'static> {
    let shown = enter(t, SIGN_IN_LABEL_AT, 0.25) * (1. - progress(t, 2.2, 0.2));
    if shown <= 0. {
        return Svgr::empty();
    }
    svgr!(
        <text x="1010" y="540" opacity={shown} text-anchor="middle" font-family={SANS} font-size="36" font-weight="600" fill={TEAL}>"sign-in"</text>
    )
}

fn refusal_label(t: f32) -> Svgr<'static> {
    let shown = enter(t, REFUSED_AT, 0.3) * (1. - progress(t, BROKER_AT, 0.25));
    if shown <= 0. {
        return Svgr::empty();
    }
    svgr!(
        <text x={GOOGLE_X + GOOGLE_WIDTH} y="916" opacity={shown} text-anchor="end" font-family={MONO} font-size="42" font-weight="500" fill={RED}>"redirect_uri_mismatch"</text>
    )
}

fn caption(item: &Caption, t: f32) -> Svgr<'static> {
    let opacity = enter(t, item.start, 0.3) * (1. - progress(t, item.end, 0.15));
    if opacity <= 0. {
        return Svgr::empty();
    }
    let parts: Vec<Svgr<'static>> = item
        .parts
        .iter()
        .map(|(text, color)| svgr!(<tspan fill={*color}>{*text}</tspan>))
        .collect();
    let y = CAPTION_Y + (1. - enter(t, item.start, 0.3)) * 14.;
    svgr!(
        <text x={CAPTION_X} y={y} opacity={opacity} font-family={SANS} font-size="70" font-weight="600" letter-spacing="-1.5">{parts}</text>
    )
}

fn diagram(t: f32) -> Svgr<'static> {
    let captions: Vec<Svgr<'static>> = CAPTIONS.iter().map(|item| caption(item, t)).collect();
    let indexes = 0..DEPLOYMENTS.len();
    let lines: Vec<Svgr<'static>> = indexes.clone().map(|index| line(index, t)).collect();
    let marks: Vec<Svgr<'static>> = indexes
        .clone()
        .map(|index| refused_mark(index, t))
        .collect();
    let cards: Vec<Svgr<'static>> = indexes.map(|index| card(index, t)).collect();
    let labels: Vec<Svgr<'static>> = (0..APP_NAMES.len()).map(|app| app_label(app, t)).collect();
    let pulses: Vec<Svgr<'static>> = SIGN_INS
        .iter()
        .map(|(index, start)| pulse(*index, *start, t))
        .collect();
    svgr!(
        <g>
            {captions}
            {lines}
            {upstream_line(t)}
            {google(t)}
            {marks}
            {refusal_label(t)}
            {sign_in_label(t)}
            {pulses}
            {broker(t)}
            {cards}
            {labels}
        </g>
    )
}

fn end_card(t: f32) -> Svgr<'static> {
    let rise = |start: f32| (1. - enter(t, start, 0.5)) * 24.;
    let fade = |start: f32| enter(t, start, 0.5);
    svgr!(
        <g>
            <text x="120" y={350. + rise(END_AT + 0.2)} opacity={fade(END_AT + 0.2)} font-family={MONO} font-size="118" font-weight="500" letter-spacing="-3" fill={INK}>"identity-broker"</text>
            <text x="116" y={536. + rise(END_AT + 0.35)} opacity={fade(END_AT + 0.35)} font-family={SANS} font-size="132" font-weight="700" letter-spacing="-3.5" fill={INK}>
                <tspan fill={TEAL}>"one"</tspan>" Google OAuth client"
            </text>
            <text x="120" y={646. + rise(END_AT + 0.6)} opacity={fade(END_AT + 0.6)} font-family={SANS} font-size="56" font-weight="500" fill={MUTED}>"for every app and every preview."</text>
            <text x="120" y={724. + rise(END_AT + 0.75)} opacity={fade(END_AT + 0.75)} font-family={SANS} font-size="56" font-weight="500" fill={MUTED}>"A Convex component. GitHub and email work too."</text>
            <text x="120" y={860. + rise(END_AT + 0.9)} opacity={fade(END_AT + 0.9)} font-family={MONO} font-size="44" font-weight="500" fill={INK}>"npm i @samebase/identity-broker"</text>
        </g>
    )
}

#[derive(Debug)]
pub struct ExplainerVideo;

impl Video for ExplainerVideo {
    const FPS: usize = 30;
    const WIDTH: usize = WIDTH;
    const HEIGHT: usize = HEIGHT;
    const BACKGROUND_COLOR: Color = Color::WHITE;

    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(LOOP_AT + LOOP_FADE)
    }

    fn audio(&self) -> AudioMap<'_> {
        AudioMap::none()
    }

    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let t = frame.seconds();
        let looped = t >= LOOP_AT;
        // The video ends on its first frame, so the GIF loop has no cut.
        let diagram_time = if looped { 0. } else { t };
        let diagram_opacity = if looped {
            morph(t, LOOP_AT, LOOP_FADE)
        } else {
            1. - morph(t, END_AT, 0.45)
        };
        let end_opacity = 1. - morph(t, LOOP_AT, LOOP_FADE * 0.7);
        svgr!(
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
                <defs>
                    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                        <path d="M48 0H0V48" fill="none" stroke={GRID} stroke-width="2" />
                    </pattern>
                </defs>
                <rect width="1920" height="1080" fill={PAPER} />
                <rect width="1920" height="1080" fill="url(#grid)" />
                <g opacity={diagram_opacity}>{diagram(diagram_time)}</g>
                <g opacity={end_opacity}>{end_card(t)}</g>
            </svg>
        )
    }
}
