import { Config } from "@remotion/cli/config";

Config.setChromiumOpenGlRenderer("angle");
Config.setCodec("h264");
Config.setColorSpace("bt709");
Config.setConcurrency(12);
Config.setCrf(16);
Config.setAudioBitrate("384k");
Config.setGopSize(60);
Config.setOverwriteOutput(true);
Config.setPixelFormat("yuv420p");
Config.setScale(1);
Config.setVideoImageFormat("png");
