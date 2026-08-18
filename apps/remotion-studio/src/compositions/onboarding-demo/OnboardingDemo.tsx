import { staticFile } from "remotion";

import { RecordedDemo } from "../recorded-demo/RecordedDemo";
import { onboardingDemoEdit } from "./onboardingDemoEdit";

const faceRecording = staticFile("media/onboarding-demo-face.mp4");
const screenRecording = staticFile("media/onboarding-demo-screen.mp4");
const timelapseRecording = staticFile("media/onboarding-demo-screen-24x.mp4");
const subtitles = staticFile("media/onboarding-demo.srt");

export const onboardingDemoHeight = 2_480;
export const onboardingDemoWidth = 3_840;

export const OnboardingDemo: React.FC = () => (
  <RecordedDemo
    captionsSource={subtitles}
    edit={onboardingDemoEdit}
    faceCrop="lower"
    facePlacement="bottom-left"
    faceRecording={faceRecording}
    screenRecording={screenRecording}
    timelapseRecording={timelapseRecording}
  />
);
