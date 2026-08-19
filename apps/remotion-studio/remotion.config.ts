import { Config } from "@remotion/cli/config";

Config.setChromiumOpenGlRenderer("angle");
Config.setColorSpace("bt709");
Config.setConcurrency(12);
Config.setGopSize(60);
Config.setOverwriteOutput(true);
Config.setPixelFormat("yuv420p");
Config.setVideoImageFormat("jpeg");
