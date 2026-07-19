import { Composition } from "remotion";

import { LogoHype, logoHypeDurationInFrames, logoHypeFps } from "./compositions/logo-hype/LogoHype";
import { RemotionTour } from "./compositions/remotion-tour/RemotionTour";
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
        id="LogoHype"
        component={LogoHype}
        durationInFrames={logoHypeDurationInFrames}
        fps={logoHypeFps}
        height={1080}
        width={1920}
      />
      <Composition
        id="RemotionTour"
        component={RemotionTour}
        durationInFrames={360}
        fps={30}
        height={720}
        width={1280}
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
