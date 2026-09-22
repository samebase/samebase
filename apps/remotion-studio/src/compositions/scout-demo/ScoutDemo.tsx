import { staticFile } from "remotion";

import { RecordedDemo } from "../recorded-demo/RecordedDemo";
import { scoutDemoEdit } from "./scoutDemoEdit";

export const ScoutDemo = () => (
  <RecordedDemo
    captionsSource={staticFile("media/scout-demo.srt")}
    edit={scoutDemoEdit}
    faceCrop="center"
    facePlacement="bottom-left"
    faceRecording={staticFile("media/scout-demo-face.mp4")}
    screenRecording={staticFile("media/scout-demo-screen.mp4")}
    timelapseRecording={staticFile("media/scout-demo-screen-24x.mp4")}
  />
);
