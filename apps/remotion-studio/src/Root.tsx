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
import { MarkIllusionTest } from "./compositions/mark-illusion-test/MarkIllusionTest";
import {
  markIllusionDurationInFrames,
  markIllusionFps,
} from "./compositions/mark-illusion-test/markIllusionTimeline";
import { MengerDiveSpike } from "./compositions/menger-dive-spike/MengerDiveSpike";
import { MengerScaleStill } from "./compositions/menger-scale-still/MengerScaleStill";
import {
  mengerScaleStillDurationInFrames,
  mengerScaleStillFps,
} from "./compositions/menger-scale-still/mengerScaleShots";
import {
  mengerDiveDurationInFrames,
  mengerDiveFps,
} from "./compositions/menger-dive-spike/mengerDiveCamera";
import {
  OnboardingDemo,
  onboardingDemoHeight,
  onboardingDemoWidth,
} from "./compositions/onboarding-demo/OnboardingDemo";
import {
  onboardingDemoEditDurationInFrames,
  onboardingDemoFps,
} from "./compositions/onboarding-demo/onboardingDemoEdit";
import { SamebaseFilmV3 } from "./compositions/samebase-film-v3/SamebaseFilmV3";
import {
  beatClipDurationInSeconds,
  filmV3DurationInSeconds,
  filmV3Fps,
} from "./compositions/samebase-film-v3/filmV3Timeline";
import { SamebaseRisoFilm } from "./compositions/samebase-riso-film/SamebaseRisoFilm";
import { SamebaseRisoLoop } from "./compositions/samebase-riso-film/SamebaseRisoLoop";
import { filmDurationInFrames, filmFps } from "./compositions/samebase-riso-film/filmMotion";
import { loopDurationInSeconds } from "./compositions/samebase-riso-film/filmTimeline";
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
        id="MengerDiveSpike"
        component={MengerDiveSpike}
        defaultProps={{ antialiasingGridSize: 4, timeOffsetInFrames: 0 }}
        durationInFrames={mengerDiveDurationInFrames}
        fps={mengerDiveFps}
        height={1080}
        width={1920}
      />
      <Composition
        id="MarkIllusionTest"
        component={MarkIllusionTest}
        defaultProps={{ forceWarp: false }}
        durationInFrames={markIllusionDurationInFrames}
        fps={markIllusionFps}
        height={1080}
        width={1920}
      />
      <Composition
        id="SamebaseRisoFilm"
        component={SamebaseRisoFilm}
        defaultProps={{ format: "landscape" }}
        durationInFrames={filmDurationInFrames}
        fps={filmFps}
        height={1080}
        width={1920}
      />
      <Composition
        id="SamebaseRisoFilmPortrait"
        component={SamebaseRisoFilm}
        defaultProps={{ format: "portrait" }}
        durationInFrames={filmDurationInFrames}
        fps={filmFps}
        height={1350}
        width={1080}
      />
      <Composition
        id="SamebaseRisoLoop"
        component={SamebaseRisoLoop}
        durationInFrames={loopDurationInSeconds * filmFps}
        fps={filmFps}
        height={1080}
        width={1920}
      />
      <Composition
        id="SamebaseFilmV3"
        component={SamebaseFilmV3}
        defaultProps={{ cut: "film", format: "landscape", fourthDirection: "fan", sampleGrid: 4 }}
        durationInFrames={filmV3DurationInSeconds * filmV3Fps}
        fps={filmV3Fps}
        height={1080}
        width={1920}
      />
      <Composition
        id="SamebaseFilmV3Portrait"
        component={SamebaseFilmV3}
        defaultProps={{ cut: "film", format: "portrait", fourthDirection: "fan", sampleGrid: 4 }}
        durationInFrames={filmV3DurationInSeconds * filmV3Fps}
        fps={filmV3Fps}
        height={1350}
        width={1080}
      />
      {(["fan", "tesseract"] as const).map((fourthDirection) => (
        <Composition
          id={`FilmV3Beat-${fourthDirection}`}
          key={fourthDirection}
          component={SamebaseFilmV3}
          defaultProps={{ cut: "beat", format: "landscape", fourthDirection, sampleGrid: 4 }}
          durationInFrames={beatClipDurationInSeconds * filmV3Fps}
          fps={filmV3Fps}
          height={1080}
          width={1920}
        />
      ))}
      {([1, 2, 3] as const).map((shot) => (
        <Composition
          id={`MengerScaleStill-${shot}`}
          component={MengerScaleStill}
          defaultProps={{ shot }}
          durationInFrames={mengerScaleStillDurationInFrames}
          fps={mengerScaleStillFps}
          height={1080}
          key={shot}
          width={1920}
        />
      ))}
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
