import { staticFile } from "remotion";

import { RecordedDemo, RecordedDemoAudio } from "../recorded-demo/RecordedDemo";
import { founderDemoEdit } from "./founderDemoEdit";

const faceRecording = staticFile("media/founder-demo-face.mp4");
const screenRecording = staticFile("media/founder-demo-screen.mp4");
const timelapseRecording = staticFile("media/founder-demo-screen-24x.mp4");
const captionsSource = staticFile("media/founder-demo.srt");

export const founderDemoHeight = 1_240;
export const founderDemoWidth = 1_920;
export const founderDemoYouTubeHeight = 2_480;
export const founderDemoYouTubeWidth = 3_840;

export const FounderDemoAudio = () => (
  <RecordedDemoAudio edit={founderDemoEdit} screenRecording={screenRecording} />
);

export const FounderDemo = () => (
  <RecordedDemo
    captionsSource={captionsSource}
    edit={founderDemoEdit}
    faceCrop="center"
    facePlacement="top-right"
    faceRecording={faceRecording}
    screenRecording={screenRecording}
    timelapseRecording={timelapseRecording}
  />
);
