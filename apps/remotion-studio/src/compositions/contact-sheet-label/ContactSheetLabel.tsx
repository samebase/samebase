import { AbsoluteFill } from "remotion";

export const contactSheetLabelWidth = 200;
export const contactSheetLabelHeight = 32;

export type ContactSheetLabelProps = {
  text: string;
};

/** The contact sheet script renders one label per cell and lays it over the cell with ffmpeg. */
export function ContactSheetLabel({ text }: ContactSheetLabelProps) {
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: "#394447",
        color: "#ffffff",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 18,
        justifyContent: "center",
      }}
    >
      {text}
    </AbsoluteFill>
  );
}
