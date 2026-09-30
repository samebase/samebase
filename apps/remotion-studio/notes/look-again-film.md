# Look again film delivery

The look again film is the `look` variant of `SamebaseFilmV4`
(`src/compositions/samebase-film-v4/filmV4Timeline.ts`).

- `SamebaseLookAgainRiso`: 1920x1080 at 60 fps, with sound.
- `SamebaseLookAgainRisoVideo`: the same picture without sound.
- `SamebaseLookAgainRisoVertical`: 1080x1920 at 60 fps, with sound, for vertical phone feeds.
- `SamebaseLookAgainRisoVerticalPreview` and `SamebaseLookAgainStyle-*`: small previews at 30 fps.

## Vertical layout

- The camera keeps the world size of one pixel along the short frame side. The object has its
  landscape pixel size across the 1080 pixel width, and the tall frame gains sky above and below it.
- Each band line and star line has authored line breaks for a tall frame (`tall` in `lookBandLines`
  and `lookStarLines`). The lines stack up from above the object and down from below it, and the
  last line above and the first line below overlap its edges as the landscape bands do.
- The lines fit 86 percent of the width, and the lowest baseline is at 79 percent of the height: the
  right edge and the bottom fifth stay clear for the controls and captions of a phone feed.
- The outline labels stop growing at 0.3 frame widths, so the longest label fits the width. The veil
  behind the star lines starts at 52 percent of the height and is full from 80 percent.
- Only `look` has a tall layout. The end lines of A, B, and C have landscape pixel positions.

## Render times

One render tab on an RTX 3070 Ti Laptop GPU (Windows, Chrome for Testing, see
`src/renderSettings.ts` for the Windows GPU setup):

| Render                                 | Time     |
| -------------------------------------- | -------- |
| 1920x1080, 60 fps, without sound       | 66.7 min |
| 1080x1920, 60 fps, with sound          | 71.7 min |
| 480x270, 60 fps, with sound            | 5.9 min  |
| `SamebaseLookAgainRisoVerticalPreview` | 6.1 min  |

The time grows with the pixel count, about 0.75 s per megapixel per frame. That predicts about 2 h
for 2560x1440 and about 4.5 h for 3840x2160. At 3840x2160 a heavy frame gives the GPU four times the
work of 1080p, so Windows can reset it; `sampleGrid: 2` would keep the samples per screen area of
1080p for about the 1080p time.

## Sound

- Remotion writes its AAC track 2048 samples (42.7 ms) late, and the MP4 has no edit list to correct
  it. Move the track back when muxing, with no new encode:

  ```console
  ffmpeg -i out/look-again-riso.mp4 -itsoffset -0.042666667 -i out/look-again-riso.mp4 \
    -map 0:v -map 1:a -c copy -movflags +faststart out/look-again-riso-synced.mp4
  ```

- The rendered mix matches the MP3 files: -12.9 LUFS integrated with a true peak of -0.37 dBTP. The
  music is bass heavy, with most of its energy below 250 Hz and 99.9 percent below 12.4 kHz, so on
  phone speakers and after the 128 kbit/s re-encode of X it sounds dull.
- The delivery mix for social posts cuts below 30 Hz, lowers the bass by 2 dB below 150 Hz, raises
  the treble by 3 dB above 5 kHz (shelves with slope 1), and normalizes to -14 LUFS with a true peak
  of -1.5 dBTP, in 320 kbit/s AAC. The ffmpeg that Remotion bundles has no EQ filters, so the
  vertical master got these filters from a one-off script over the MP3 files. With a full ffmpeg
  build, this command gives the same mix from a render (not yet run):

  ```console
  ffmpeg -i out/look-again-riso.mp4 -map 0:v -map 0:a -c:v copy \
    -af "atrim=start_sample=2048,asetpts=PTS-STARTPTS,highpass=f=30,lowshelf=f=150:g=-2:t=s:w=1,highshelf=f=5000:g=3:t=s:w=1,loudnorm=I=-14:TP=-1.5:LRA=7" \
    -c:a aac -b:a 320k -ar 48000 -movflags +faststart out/look-again-riso-social.mp4
  ```

## Masters

The masters are in the private R2 bucket `samebase-large-files`:

| Key                                               | Picture   | Sound                       | Commit     |
| ------------------------------------------------- | --------- | --------------------------- | ---------- |
| `remotion-studio/look-again-riso-v1.mp4`          | 1920x1080 | the rendered mix, synced    | `9f6daea1` |
| `remotion-studio/look-again-riso-vertical-v1.mp4` | 1080x1920 | the delivery mix for social | `2ac92b7a` |

The objects are larger than the 300 MiB upload limit of Wrangler and the dashboard, so they go up as
S3 multipart uploads with an R2 API token limited to the bucket.
