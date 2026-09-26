import { Composition } from "remotion";

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
import { MengerDiveSpike } from "./compositions/menger-dive-spike/MengerDiveSpike";
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
        id="TicTacToeRecording"
        component={TicTacToeRecording}
        durationInFrames={ticTacToeEditDurationInFrames}
        fps={ticTacToeRecordingFps}
        height={ticTacToeRecordingCrop.height}
        width={ticTacToeRecordingCrop.width}
      />
    </>
  );
}
