# 4x4x4 tic-tac-toe source-time transcript and edit plan

## Time convention

All timestamps in this document are source times shown by the lower-right timer. Edited-timeline
times will change whenever an earlier section is retimed.

## Editorial direction

Recommended master duration: **4 minutes 45 seconds**. Derive a separate **35 to 45 second** hero
cut from the finished master instead of forcing one edit to serve both jobs.

## Implemented master

The current composition is **4 minutes 51.6 seconds** and contains 55 retained source ranges. It
removes 8 minutes 41 seconds of static footage, then retimes the remaining material:

- 151 source seconds of typing at 3x.
- 550.5 source seconds of visible work at 6x.
- 97 source seconds of slow work or deploy waiting at 10x.
- 139.8 source seconds of prompts, reveals, gameplay, and responses at 1x.

The executable source-time manifest is `src/ticTacToeEdit.ts`. Gaps between its ordered ranges are
intentional jump cuts.

The story is simple:

1. Ask Codex to build a shareable 4x4x4 game.
2. Watch it work and ship the production app.
3. Play the finished game together.
4. Codex wins.

The edit should use three pacing modes:

- **Typing: 3x.** Keep the final two source seconds at 1x so the completed prompt is readable.
- **Visible agent work: 6x.** Preserve enough motion to follow tools, file changes, and progress.
- **Installs, builds, and uneventful waiting: 10x to 12x.** Jump-cut stretches when the screen is
  effectively static.
- **Reveals, messages, and moves: 1x.** Let important results and the game itself breathe.

Switch speeds on the cut instead of using long ramps. The speed and source-time overlay already
explains the change.

Keep the lower-right speed and source-time overlay throughout. Add only three brief chapter cards:
`BUILD`, `SHIP`, and `PLAY`. They should appear at the transition, then disappear.

## Implemented opening

| Source time  | Treatment | Reason                           |
| ------------ | --------- | -------------------------------- |
| 00:00-00:52  | 3x        | Prompt typing                    |
| 00:52 onward | 1x        | Finished prompt remains readable |

## Typing map

| Source window | 3x portion  | 1x reading hold | Content                                         |
| ------------- | ----------- | --------------- | ----------------------------------------------- |
| 00:00-00:54   | 00:00-00:52 | 00:52-00:54     | Initial build prompt                            |
| 02:57-03:02   | 02:57-03:00 | 03:00-03:02     | Follow-up prompt                                |
| 05:45-06:18   | 05:45-06:16 | 06:16-06:18     | Follow-up prompt                                |
| 06:26-06:48   | 06:26-06:46 | 06:46-06:48     | Follow-up prompt                                |
| 08:49-09:00   | 08:49-08:58 | 08:58-09:00     | Follow-up prompt                                |
| 09:38-09:48   | 09:38-09:46 | 09:46-09:48     | Follow-up prompt                                |
| 13:49-13:56   | 13:49-13:54 | 13:54-13:56     | Follow-up prompt                                |
| 15:23-15:27   | 15:23-15:25 | 15:25-15:27     | Follow-up prompt                                |
| 15:51-15:58   | 15:51-15:56 | 15:56-15:58     | Follow-up prompt                                |
| 19:02-19:08   | 19:02-19:06 | 19:06-19:08     | "Ok, let's play, your turn"                     |
| 21:18-21:20   | None        | 21:18-21:20     | "I already moved" is short enough to keep at 1x |
| 21:44-21:51   | 21:44-21:49 | 21:49-21:51     | "Keep playing until someone wins, no stopping"  |
| 23:44-23:50   | 23:44-23:48 | 23:48-23:50     | Reaction to Codex winning                       |
| 24:06-24:11   | 24:06-24:09 | 24:09-24:11     | "Good job Mr Codex"                             |

## Event transcript

| Source time | Event                                           | Recommended treatment                        |
| ----------- | ----------------------------------------------- | -------------------------------------------- |
| 18:58       | Refresh production and place the first piece    | 1x from 18:58 through 19:02                  |
| 19:02-19:08 | Type "Ok, let's play, your turn"                | Typing rule above                            |
| 20:13       | Codex's turn becomes visible                    | 1x from 20:12 through 20:18                  |
| 20:17       | Place the next piece                            | 1x from 20:12 through 20:18                  |
| 20:18-21:13 | Wait for Codex's message                        | Prefer a jump cut                            |
| 21:16       | Codex responds                                  | 1x from 21:13 through 21:20                  |
| 21:18-21:20 | Say "I already moved"                           | 1x                                           |
| 21:36       | Codex plays its second move                     | 1x from 21:35 through 21:44                  |
| 21:40       | Play the next move                              | 1x from 21:35 through 21:44                  |
| 21:44-21:51 | Ask to keep playing until someone wins          | Typing rule above                            |
| 22:18       | Codex moves                                     | 1x                                           |
| 22:23       | Human move                                      | 1x                                           |
| 22:29       | Codex move                                      | 1x                                           |
| 22:36       | Human move, then Codex replies almost instantly | 1x                                           |
| 22:39       | Human move, then fast Codex reply               | 1x                                           |
| 22:43       | Human move, then Codex move                     | 1x                                           |
| 22:50       | Human move, then Codex move                     | 1x                                           |
| 22:55       | Human move, then Codex move                     | 1x                                           |
| 23:09       | Human move, then Codex move                     | 1x                                           |
| 23:18       | Human move                                      | 1x                                           |
| 23:22       | Codex move                                      | 1x                                           |
| 23:41       | Human move, then Codex wins                     | 1x, preserve the full win                    |
| 23:44-23:50 | Type reaction to the win                        | Typing rule above                            |
| 24:06-24:11 | Type "Good job Mr Codex"                        | Typing rule above                            |
| 24:11-end   | Codex gives the final response                  | 1x, end immediately after the response lands |

## Motion-informed compression

The recording was sampled at low resolution and reviewed with contact sheets. The implemented edit
uses 6x when visible Codex activity is worth following, 10x for slow work, and jump cuts where the
screen is effectively static.

| Source span | What sits between the known beats                |
| ----------- | ------------------------------------------------ |
| 00:54-02:57 | Agent work after the initial prompt              |
| 03:02-05:45 | Agent work                                       |
| 06:18-06:26 | Short agent interval                             |
| 06:48-08:49 | Agent work                                       |
| 09:00-09:38 | Agent work                                       |
| 09:48-13:49 | Long agent work interval                         |
| 13:56-15:23 | Agent work                                       |
| 15:27-15:51 | Short agent interval                             |
| 15:58-18:58 | Final build, deploy, or production wait          |
| 19:08-20:12 | Wait for the first Codex turn, prefer a jump cut |
| 20:18-21:13 | Long wait for Codex's message, prefer a jump cut |
| 21:20-21:35 | Wait for Codex's second move, prefer a jump cut  |
| 21:51-22:17 | Wait for the next Codex move, prefer a jump cut  |

## Gameplay treatment

From 22:18 through the win at 23:41, keep every move itself at 1x. This is the payoff, and the quick
back-and-forth is more interesting than another montage. If a static pause between moves exceeds
four seconds, remove the middle of the pause with a clean jump cut while retaining about half a
second before and after each move.

Implemented jump cuts protect every listed move. The larger removed source spans are:

- 01:50-02:57
- 03:37-05:45
- 09:00-09:32
- 12:04-13:43
- 16:29-17:31
- 18:06-18:38
- 19:09-19:16.5
- 19:47-20:11.5
- 20:50.5-21:13.5
- 21:52-22:00.5
- 22:03-22:17
- 23:00.5-23:08.5
- 23:13-23:17.5
- 23:50-23:57
- 24:11-24:15

## Implementation order

1. Add all typing ranges with the two-second 1x reading holds. Complete.
2. Add 6x active-agent ranges and review visible progress. Complete.
3. Use 10x for slow work and replace truly static waits with jump cuts. Complete.
4. Preserve the production refresh and gameplay at 1x. Complete.
5. Add the three brief chapter cards. Complete.
