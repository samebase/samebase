import { SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH } from "@/components/socialLogoAssets";

export function SocialCardVisualFixture() {
  return (
    <div
      data-testid="social-card-visual-fixture"
      className="grid min-h-screen place-items-center bg-stone-100 p-8 text-stone-950"
    >
      <img
        data-testid="social-card-generated-png"
        src="/samebase-social-card.png"
        alt=""
        className="bg-white"
        height={SOCIAL_CARD_HEIGHT}
        width={SOCIAL_CARD_WIDTH}
      />
    </div>
  );
}
