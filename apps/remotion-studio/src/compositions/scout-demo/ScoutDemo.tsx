import { AbsoluteFill, getRemotionEnvironment, staticFile } from "remotion";

import { RecordedDemo } from "../recorded-demo/RecordedDemo";
import { scoutDemoEdit } from "./scoutDemoEdit";

export const ScoutDemo = () => {
  if (scoutDemoEdit === null) {
    if (getRemotionEnvironment().isRendering) {
      throw new Error("ScoutDemo needs its source duration and edit points in scoutDemoEdit.ts.");
    }

    return (
      <AbsoluteFill
        style={{
          alignItems: "center",
          backgroundColor: "#101719",
          color: "white",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 40,
          justifyContent: "center",
        }}
      >
        <div>Scout demo</div>
        <p style={{ fontSize: 24 }}>Awaiting footage and edit points.</p>
      </AbsoluteFill>
    );
  }

  return (
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
};
