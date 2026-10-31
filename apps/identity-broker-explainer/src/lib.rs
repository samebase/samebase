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
const CARD_WIDTH: f32 = 560.;
const CARD_HEIGHT: f32 = 88.;
const CARD_PITCH: f32 = 104.;
const ROW_X: f32 = 270.;
const ROW_SCALE: f32 = 0.56;
const ROW_PITCH: f32 = 53.;
const GROUP_GAP: f32 = 26.;

const BROKER_X: f32 = 880.;
const BROKER_WIDTH: f32 = 320.;
const BROKER_HEIGHT: f32 = 240.;
const BROKER_IN: Point = (BROKER_X, DIAGRAM_CENTER_Y);
const BROKER_OUT: Point = (BROKER_X + BROKER_WIDTH, DIAGRAM_CENTER_Y);

const TILE_X: f32 = 1424.;
const TILE_WIDTH: f32 = 400.;
const TILE_HEIGHT: f32 = 292.;
const TILE_GAP: f32 = 28.;
const TILE_COMPACT_HEIGHT: f32 = 196.;
const TILE_COMPACT_GAP: f32 = 16.;
const CLIENT_X: f32 = TILE_X + 28.;
const CLIENT_WIDTH: f32 = TILE_WIDTH - 56.;
const CLIENT_HEIGHT: f32 = 88.;
const CLIENT_MERGED_HEIGHT: f32 = 96.;
const CLIENT_TOP: f32 = 88.;
const CLIENT_SPACING: f32 = 100.;

const CLIENT_ONE_AT: f32 = 0.35;
const CLIENT_TWO_AT: f32 = 2.8;
const REFUSED_AT: f32 = 5.75;
const BROKER_AT: f32 = 10.6;
const REROUTE_AT: f32 = 11.15;
const MERGE_AT: f32 = 11.95;
const UPSTREAM_AT: f32 = 12.45;
const SIGN_IN_LABEL_AT: f32 = 1.0;
const APPS_AT: f32 = 18.6;
const ANY_PROVIDER_AT: f32 = 22.2;
const END_AT: f32 = 24.6;
const LOOP_AT: f32 = 27.8;
const LOOP_FADE: f32 = 0.5;

const LINE_SECONDS: f32 = 0.5;
const LEG_SECONDS: f32 = 0.35;
/// The second line of a deployment starts this late, one provider after the other.
const PROVIDER_STAGGER: f32 = 0.12;

#[derive(Clone, Copy)]
enum Route {
    /// Registered at this client of each provider, directly.
    Direct(usize),
    /// Refused by each provider, which does not know this URL.
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

// Previews are real Convex hosts: no wildcard on an app's own domain can match them.
const DEPLOYMENTS: [Deployment; 14] = [
    deployment("myapp.com", 0, -1., 0.7, Route::Direct(0)),
    deployment("localhost:5173", 0, 2.5, 3.1, Route::Direct(1)),
    deployment("calm-fox-41.convex.site", 0, 5.0, 5.25, Route::Refused),
    deployment("bold-owl-42.convex.site", 0, 5.5, 5.75, Route::Refused),
    deployment("keen-elk-43.convex.site", 0, 6.0, 6.25, Route::Refused),
    deployment("warm-yak-44.convex.site", 0, 16.0, 16.3, Route::Broker),
    deployment("deft-ram-45.convex.site", 0, 16.9, 17.2, Route::Broker),
    deployment("shop.com", 1, 19.6, 19.6, Route::Broker),
    deployment("localhost:3000", 1, 19.7, 19.7, Route::Broker),
    deployment("blue-ant-7.convex.site", 1, 19.8, 19.8, Route::Broker),
    deployment("wise-cod-8.convex.site", 1, 19.9, 19.9, Route::Broker),
    deployment("notes.app", 2, 20.05, 20.05, Route::Broker),
    deployment("mild-bee-3.convex.site", 2, 20.15, 20.15, Route::Broker),
    deployment("glad-emu-4.convex.site", 2, 20.25, 20.25, Route::Broker),
];

/// Every sign-in: which deployment, through which provider, and when. A check mark means the first
/// sign-in of that deployment came back.
const SIGN_INS: [(usize, usize, f32); 16] = [
    (0, 0, 1.2),
    (1, 1, 3.6),
    (2, 0, 13.3),
    (3, 1, 13.65),
    (4, 0, 14.0),
    (5, 1, 16.7),
    (6, 0, 17.6),
    (7, 0, 20.3),
    (11, 1, 20.38),
    (8, 1, 20.46),
    (12, 0, 20.54),
    (9, 0, 20.62),
    (13, 1, 20.7),
    (10, 1, 20.78),
    (3, 2, 22.9),
    (9, 2, 23.2),
];

const APP_NAMES: [&str; 3] = ["myapp", "shop", "notes"];

struct Caption {
    start: f32,
    end: f32,
    parts: &'static [(&'static str, &'static str)],
}

const CAPTIONS: [Caption; 10] = [
    Caption {
        start: -1.,
        end: 2.35,
        parts: &[("Your app signs in with Google and GitHub.", INK)],
    },
    Caption {
        start: 2.5,
        end: 4.65,
        parts: &[("Development gets its own clients.", INK)],
    },
    Caption {
        start: 4.8,
        end: 6.85,
        parts: &[("Every pull request gets a new URL.", INK)],
    },
    Caption {
        start: 7.0,
        end: 9.15,
        parts: &[("Google and GitHub refuse URLs they don't know.", INK)],
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
            (" sits in front of your providers.", INK),
        ],
    },
    Caption {
        start: 12.9,
        end: 15.65,
        parts: &[("Each provider sees one client and one URL.", INK)],
    },
    Caption {
        start: 15.8,
        end: 18.4,
        parts: &[("Previews register their exact URL at deploy.", INK)],
    },
    Caption {
        start: 18.55,
        end: 21.95,
        parts: &[("All your apps can share it.", INK)],
    },
    Caption {
        start: 22.1,
        end: END_AT,
        parts: &[("Any other provider connects the same way.", INK)],
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

/// The top of a provider card and its height.
fn tile_box(provider: usize, t: f32) -> (f32, f32) {
    let stacked =
        DIAGRAM_CENTER_Y - TILE_HEIGHT - TILE_GAP / 2. + provider as f32 * (TILE_HEIGHT + TILE_GAP);
    let shown = 2. + enter(t, ANY_PROVIDER_AT, 0.5);
    let compact = DIAGRAM_CENTER_Y
        + (provider as f32 - (shown - 1.) / 2.) * (TILE_COMPACT_HEIGHT + TILE_COMPACT_GAP)
        - TILE_COMPACT_HEIGHT / 2.;
    let amount = merged(t);
    (
        mix(stacked, compact, amount),
        mix(TILE_HEIGHT, TILE_COMPACT_HEIGHT, amount),
    )
}

fn client_y(provider: usize, client: usize, t: f32) -> f32 {
    let row = CLIENT_TOP + client as f32 * CLIENT_SPACING;
    tile_box(provider, t).0 + mix(row, CLIENT_TOP, merged(t))
}

fn client_height(t: f32) -> f32 {
    mix(CLIENT_HEIGHT, CLIENT_MERGED_HEIGHT, merged(t))
}

fn client_port(provider: usize, client: usize, t: f32) -> Point {
    (
        CLIENT_X,
        client_y(provider, client, t) + client_height(t) / 2.,
    )
}

/// Beside the provider's name, clear of the teal lines that reach its clients.
fn refused_port(provider: usize, t: f32) -> Point {
    (TILE_X, tile_box(provider, t).0 + 46.)
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

fn line_end(index: usize, provider: usize, t: f32) -> Point {
    match DEPLOYMENTS[index].route {
        Route::Direct(client) => mix_point(
            client_port(provider, client, t),
            BROKER_IN,
            rerouted(t, index),
        ),
        Route::Refused => mix_point(refused_port(provider, t), BROKER_IN, rerouted(t, index)),
        Route::Broker => BROKER_IN,
    }
}

fn line(index: usize, provider: usize, t: f32) -> Svgr<'static> {
    let item = &DEPLOYMENTS[index];
    let drawn = morph(
        t,
        item.line + provider as f32 * PROVIDER_STAGGER,
        LINE_SECONDS,
    );
    if drawn <= 0. {
        return Svgr::empty();
    }
    let color = match item.route {
        Route::Refused => mix_color(RED_RGB, TEAL_RGB, rerouted(t, index)),
        Route::Direct(_) | Route::Broker => TEAL.to_owned(),
    };
    let (path, _) = curve(card_port(index, t), line_end(index, provider, t), drawn);
    let width = mix(4., 3., to_apps(t));
    svgr!(<path d={path} fill="none" stroke={color} stroke-width={width} stroke-linecap="round" />)
}

fn refused_mark(index: usize, provider: usize, t: f32) -> Svgr<'static> {
    let item = &DEPLOYMENTS[index];
    if !matches!(item.route, Route::Refused) {
        return Svgr::empty();
    }
    let reached = item.line + provider as f32 * PROVIDER_STAGGER + LINE_SECONDS;
    let shown = enter(t, reached, 0.22) * (1. - progress(t, REROUTE_AT, 0.25));
    if shown <= 0. {
        return Svgr::empty();
    }
    let (x, y) = refused_port(provider, t);
    svgr!(
        <g transform={place(x, y, mix(1.7, 1., shown))} opacity={shown}>
            <circle r="24" fill={PAPER} />
            <path d="M-13 -13L13 13M13 -13L-13 13" fill="none" stroke={RED} stroke-width="7" stroke-linecap="round" />
        </g>
    )
}

fn check_at(index: usize) -> Option<f32> {
    let (_, _, start) = SIGN_INS
        .iter()
        .find(|(signed_in, _, _)| *signed_in == index)?;
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
            <g transform={place(CARD_WIDTH - 36., CARD_HEIGHT / 2., size)} opacity={checked}>
                <path d="M-15 1L-4 12L16 -12" fill="none" stroke={TEAL} stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            </g>
        )
    } else {
        Svgr::empty()
    };
    svgr!(
        <g transform={place(x - (1. - shown) * 28., y, scale)} opacity={shown}>
            <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={WHITE} stroke={INK} stroke-width="3" />
            <text x="24" y="56" font-family={MONO} font-size="34" font-weight="500" fill={INK}>{item.url}</text>
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

fn pulse(index: usize, provider: usize, start: f32, t: f32) -> Svgr<'static> {
    let port = card_port(index, t);
    match DEPLOYMENTS[index].route {
        Route::Direct(client) if start < BROKER_AT => {
            pulse_on(&[(port, client_port(provider, client, t))], start, t)
        }
        Route::Direct(_) | Route::Refused | Route::Broker => pulse_on(
            &[(port, BROKER_IN), (BROKER_OUT, client_port(provider, 0, t))],
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
            <text x={BROKER_WIDTH / 2.} y="108" text-anchor="middle" font-family={SANS} font-size="60" font-weight="700" fill={WHITE}>"Identity"</text>
            <text x={BROKER_WIDTH / 2.} y="176" text-anchor="middle" font-family={SANS} font-size="60" font-weight="700" fill={WHITE}>"Broker"</text>
        </g>
    )
}

fn upstream_line(provider: usize, t: f32) -> Svgr<'static> {
    let start = if provider == 2 {
        ANY_PROVIDER_AT + 0.3
    } else {
        UPSTREAM_AT + provider as f32 * PROVIDER_STAGGER
    };
    let drawn = morph(t, start, 0.4);
    if drawn <= 0. {
        return Svgr::empty();
    }
    let (path, _) = curve(BROKER_OUT, client_port(provider, 0, t), drawn);
    svgr!(<path d={path} fill="none" stroke={TEAL} stroke-width="5" stroke-linecap="round" />)
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

fn github_logo() -> Svgr<'static> {
    svgr!(
        <g transform={place(0., 0., 3.)}>
            <path fill={INK} fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </g>
    )
}

fn any_provider_mark() -> Svgr<'static> {
    svgr!(<path d="M24 6V42M6 24H42" fill="none" stroke={INK} stroke-width="7" stroke-linecap="round" />)
}

fn client(provider: usize, index: usize, t: f32) -> Svgr<'static> {
    let delay = provider as f32 * 0.15;
    let shown = match (provider, index) {
        (2, _) => 1.,
        (_, 0) => enter(t, CLIENT_ONE_AT + delay, 0.35),
        _ => enter(t, CLIENT_TWO_AT + delay, 0.35),
    };
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
    let color = if one { TEAL } else { INK };
    let text = if one {
        let url = enter(t, MERGE_AT + 0.4, 0.3);
        svgr!(
            <g>
                <text x={CLIENT_WIDTH / 2.} y="42" text-anchor="middle" font-family={SANS} font-size="32" font-weight="600" fill={color}>"one client"</text>
                <text x={CLIENT_WIDTH / 2.} y="78" opacity={url} text-anchor="middle" font-family={MONO} font-size="27" font-weight="500" fill={color}>"auth.yourteam.com"</text>
            </g>
        )
    } else {
        let label = if index == 0 {
            "production client"
        } else {
            "development client"
        };
        svgr!(
            <text x={CLIENT_WIDTH / 2.} y="55" text-anchor="middle" font-family={SANS} font-size="31" font-weight="600" fill={color}>{label}</text>
        )
    };
    svgr!(
        <g transform={Transform::translate(CLIENT_X, client_y(provider, index, t))} opacity={opacity}>
            <rect width={CLIENT_WIDTH} height={client_height(t)} fill={PAPER} stroke={color} stroke-width="3" />
            {text}
        </g>
    )
}

fn tile(provider: usize, t: f32) -> Svgr<'static> {
    let opacity = if provider == 2 {
        enter(t, ANY_PROVIDER_AT, 0.5)
    } else {
        1.
    };
    if opacity <= 0. {
        return Svgr::empty();
    }
    let (y, height) = tile_box(provider, t);
    let (logo, name) = match provider {
        0 => (google_logo(), "Google"),
        1 => (github_logo(), "GitHub"),
        _ => (any_provider_mark(), "Any provider"),
    };
    let dash = if provider == 2 { "12 9" } else { "none" };
    let name_size = if provider == 2 { "40" } else { "46" };
    svgr!(
        <g opacity={opacity}>
            <rect x={TILE_X} y={y} width={TILE_WIDTH} height={height} fill={WHITE} stroke={INK} stroke-width="3" stroke-dasharray={dash} />
            <g transform={place(TILE_X + 28., y + 22., 1.)}>{logo}</g>
            <text x={TILE_X + 92.} y={y + 63.} font-family={SANS} font-size={name_size} font-weight="600" fill={INK}>{name}</text>
            {client(provider, 1, t)}
            {client(provider, 0, t)}
        </g>
    )
}

fn sign_in_label(t: f32) -> Svgr<'static> {
    let shown = enter(t, SIGN_IN_LABEL_AT, 0.25) * (1. - progress(t, 2.2, 0.2));
    if shown <= 0. {
        return Svgr::empty();
    }
    svgr!(
        <text x="930" y="522" opacity={shown} text-anchor="middle" font-family={SANS} font-size="36" font-weight="600" fill={TEAL}>"sign-in"</text>
    )
}

fn refusal_label(t: f32) -> Svgr<'static> {
    let shown = enter(t, REFUSED_AT, 0.3) * (1. - progress(t, BROKER_AT, 0.25));
    if shown <= 0. {
        return Svgr::empty();
    }
    svgr!(
        <text x={TILE_X + TILE_WIDTH} y="992" opacity={shown} text-anchor="end" font-family={MONO} font-size="42" font-weight="500" fill={RED}>"redirect_uri_mismatch"</text>
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
    let mut lines: Vec<Svgr<'static>> = Vec::new();
    let mut marks: Vec<Svgr<'static>> = Vec::new();
    for index in 0..DEPLOYMENTS.len() {
        lines.push(line(index, 0, t));
        // The lines of a deployment become one line when they reach the broker.
        if !matches!(DEPLOYMENTS[index].route, Route::Broker) {
            lines.push(line(index, 1, t));
        }
        marks.push(refused_mark(index, 0, t));
        marks.push(refused_mark(index, 1, t));
    }
    let cards: Vec<Svgr<'static>> = (0..DEPLOYMENTS.len()).map(|index| card(index, t)).collect();
    let labels: Vec<Svgr<'static>> = (0..APP_NAMES.len()).map(|app| app_label(app, t)).collect();
    let upstream: Vec<Svgr<'static>> = (0..3).map(|provider| upstream_line(provider, t)).collect();
    let tiles: Vec<Svgr<'static>> = (0..3).map(|provider| tile(provider, t)).collect();
    let pulses: Vec<Svgr<'static>> = SIGN_INS
        .iter()
        .map(|(index, provider, start)| pulse(*index, *provider, *start, t))
        .collect();
    svgr!(
        <g>
            {captions}
            {tiles}
            {lines}
            {upstream}
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
            <text x="120" y={316. + rise(END_AT + 0.2)} opacity={fade(END_AT + 0.2)} font-family={MONO} font-size="118" font-weight="500" letter-spacing="-3" fill={INK}>"identity-broker"</text>
            <text x="116" y={498. + rise(END_AT + 0.35)} opacity={fade(END_AT + 0.35)} font-family={SANS} font-size="156" font-weight="700" letter-spacing="-4" fill={INK}>
                "set up sign-in "<tspan fill={TEAL}>"once"</tspan>
            </text>
            <text x="120" y={610. + rise(END_AT + 0.6)} opacity={fade(END_AT + 0.6)} font-family={SANS} font-size="56" font-weight="500" fill={MUTED}>"for every app and every preview."</text>
            <text x="120" y={688. + rise(END_AT + 0.7)} opacity={fade(END_AT + 0.7)} font-family={SANS} font-size="56" font-weight="500" fill={MUTED}>"Google, GitHub, or any OIDC provider."</text>
            <text x="120" y={766. + rise(END_AT + 0.8)} opacity={fade(END_AT + 0.8)} font-family={SANS} font-size="56" font-weight="500" fill={MUTED}>"A Convex component."</text>
            <text x="120" y={884. + rise(END_AT + 0.95)} opacity={fade(END_AT + 0.95)} font-family={MONO} font-size="44" font-weight="500" fill={INK}>"npm i @samebase/identity-broker"</text>
        </g>
    )
}

#[derive(Debug)]
pub struct ExplainerVideo;

impl Video for ExplainerVideo {
    // 60 divides evenly into the 20 fps of the GIF, so the GIF drops no uneven frames.
    const FPS: usize = 60;
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
