import { Composition } from "remotion";

import {
  ContactSheetLabel,
  contactSheetLabelHeight,
  contactSheetLabelWidth,
} from "./compositions/contact-sheet-label/ContactSheetLabel";
import {
  FounderDemo,
  FounderDemoAudio,
  founderDemoHeight,
  founderDemoWidth,
  founderDemoYouTubeHeight,
  founderDemoYouTubeWidth,
} from "./compositions/founder-demo/FounderDemo";
import {
  founderDemoEditDurationInFrames,
  founderDemoFps,
} from "./compositions/founder-demo/founderDemoEdit";
import { LogoHype, logoHypeDurationInFrames, logoHypeFps } from "./compositions/logo-hype/LogoHype";
import {
  OnboardingDemo,
  onboardingDemoHeight,
  onboardingDemoWidth,
} from "./compositions/onboarding-demo/OnboardingDemo";
import {
  onboardingDemoEditDurationInFrames,
  onboardingDemoFps,
} from "./compositions/onboarding-demo/onboardingDemoEdit";
import { SamebaseFilmV4 } from "./compositions/samebase-film-v4/SamebaseFilmV4";
import { filmV4Fps, lookSeconds } from "./compositions/samebase-film-v4/filmV4Timeline";
import { ScoutDemo } from "./compositions/scout-demo/ScoutDemo";
import {
  scoutDemoEdit,
  scoutDemoFps,
  scoutDemoHeight,
  scoutDemoWidth,
} from "./compositions/scout-demo/scoutDemoEdit";
import { TicTacToeRecording } from "./compositions/tic-tac-toe/TicTacToeRecording";
import {
  ticTacToeEditDurationInFrames,
  ticTacToeRecordingFps,
} from "./compositions/tic-tac-toe/ticTacToeEdit";
import { ticTacToeRecordingCrop } from "./compositions/tic-tac-toe/ticTacToeRecordingCrop";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="FounderDemo"
        component={FounderDemo}
        durationInFrames={founderDemoEditDurationInFrames}
        fps={founderDemoFps}
        height={founderDemoHeight}
        width={founderDemoWidth}
      />
      <Composition
        id="FounderDemoYouTube"
        component={FounderDemo}
        durationInFrames={founderDemoEditDurationInFrames}
        fps={founderDemoFps}
        height={founderDemoYouTubeHeight}
        width={founderDemoYouTubeWidth}
      />
      <Composition
        id="FounderDemoAudio"
        component={FounderDemoAudio}
        durationInFrames={founderDemoEditDurationInFrames}
        fps={founderDemoFps}
        height={2}
        width={2}
      />
      <Composition
        id="OnboardingDemo"
        component={OnboardingDemo}
        durationInFrames={onboardingDemoEditDurationInFrames}
        fps={onboardingDemoFps}
        height={onboardingDemoHeight}
        width={onboardingDemoWidth}
      />
      <Composition
        id="ScoutDemo"
        component={ScoutDemo}
        durationInFrames={scoutDemoEdit.durationInFrames}
        fps={scoutDemoFps}
        height={scoutDemoHeight}
        width={scoutDemoWidth}
      />
      <Composition
        id="LogoHype"
        component={LogoHype}
        durationInFrames={logoHypeDurationInFrames}
        fps={logoHypeFps}
        height={1080}
        width={1920}
      />
      <Composition
        id="SamebaseLookAgainRiso"
        component={SamebaseFilmV4}
        // The look again film at full size. `--muted` renders the picture alone.
        durationInFrames={lookSeconds * filmV4Fps}
        fps={filmV4Fps}
        height={1080}
        width={1920}
      />
      <Composition
        id="SamebaseLookAgainRisoVertical"
        component={SamebaseFilmV4}
        // The film for vertical phone feeds.
        durationInFrames={lookSeconds * filmV4Fps}
        fps={filmV4Fps}
        height={1920}
        width={1080}
      />
      <Composition
        id="SamebaseLookAgainRisoPreview"
        component={SamebaseFilmV4}
        // The low resolution preview of the film.
        durationInFrames={lookSeconds * 30}
        fps={30}
        height={270}
        width={480}
      />
      <Composition
        id="SamebaseLookAgainRisoVerticalPreview"
        component={SamebaseFilmV4}
        // The low resolution preview of the vertical film.
        durationInFrames={lookSeconds * 30}
        fps={30}
        height={640}
        width={360}
      />
      <Composition
        id="TicTacToeRecording"
        component={TicTacToeRecording}
        durationInFrames={ticTacToeEditDurationInFrames}
        fps={ticTacToeRecordingFps}
        height={ticTacToeRecordingCrop.height}
        width={ticTacToeRecordingCrop.width}
      />
      <Composition
        id="ContactSheetLabel"
        component={ContactSheetLabel}
        defaultProps={{ text: "" }}
        durationInFrames={1}
        fps={30}
        height={contactSheetLabelHeight}
        width={contactSheetLabelWidth}
      />
    </>
  );
}
