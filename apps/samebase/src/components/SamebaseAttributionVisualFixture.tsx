import { SamebaseAttribution } from "../../../../templates/base/src/components/SamebaseAttribution";

export function SamebaseAttributionVisualFixture() {
  return (
    <div data-testid="samebase-attribution-visual-fixture" className="w-80">
      <div className="bg-white p-4 text-[#394447]">
        <SamebaseAttribution />
      </div>
      <div className="bg-black p-4 text-white">
        <SamebaseAttribution />
      </div>
      <div className="bg-[#e3e7e3] p-4 text-[#6b766f]">
        <SamebaseAttribution />
      </div>
    </div>
  );
}
