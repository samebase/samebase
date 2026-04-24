package md.noter.demos.panes;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.OverScroller;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import androidx.slidingpanelayout.widget.SlidingPaneLayout;
import androidx.viewpager2.widget.ViewPager2;

public final class MainActivity extends Activity {
    private static final int COLOR_INK = Color.rgb(30, 34, 38);
    private static final int COLOR_MUTED = Color.rgb(91, 98, 105);
    private static final int COLOR_SURFACE = Color.rgb(246, 245, 242);
    private static final int COLOR_LINE = Color.rgb(207, 209, 211);
    private static final int COLOR_ACCENT = Color.rgb(34, 112, 147);
    private static final int COLOR_PANEL = Color.WHITE;
    private static final int INVALID_POINTER = -1;

    private final Button[] tabButtons = new Button[Demo.values().length];
    private FrameLayout contentHost;
    private Demo selectedDemo = Demo.SLIDING_PANE;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(COLOR_SURFACE);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setPadding(dp(8), dp(8), dp(8), dp(6));
        root.addView(tabs, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        for (Demo demo : Demo.values()) {
            Button button = new Button(this);
            button.setAllCaps(false);
            button.setText(demo.title);
            button.setTextSize(13);
            button.setMinHeight(dp(44));
            button.setOnClickListener(view -> showDemo(demo));
            tabButtons[demo.ordinal()] = button;
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f);
            tabs.addView(button, params);
        }

        contentHost = new FrameLayout(this);
        root.addView(contentHost, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f));

        setContentView(root);
        showDemo(selectedDemo);
    }

    private void showDemo(Demo demo) {
        selectedDemo = demo;
        for (Demo item : Demo.values()) {
            Button button = tabButtons[item.ordinal()];
            button.setTextColor(item == demo ? Color.WHITE : COLOR_INK);
            button.setBackground(makeRect(item == demo ? COLOR_ACCENT : COLOR_PANEL, COLOR_LINE));
        }

        contentHost.removeAllViews();
        View demoView;
        switch (demo) {
            case SLIDING_PANE:
                demoView = buildSlidingPaneDemo();
                break;
            case VIEW_PAGER:
                demoView = buildViewPagerDemo();
                break;
            case PAGED_VIEW:
                demoView = buildPagedViewDemo();
                break;
            default:
                throw new IllegalStateException("Unhandled demo " + demo);
        }
        contentHost.addView(demoView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private View buildSlidingPaneDemo() {
        SlidingPaneLayout pane = new SlidingPaneLayout(this);
        pane.setLockMode(SlidingPaneLayout.LOCK_MODE_UNLOCKED);
        pane.setBackgroundColor(COLOR_SURFACE);

        LinearLayout master = new LinearLayout(this);
        master.setOrientation(LinearLayout.VERTICAL);
        master.setBackgroundColor(COLOR_PANEL);
        master.setPadding(dp(14), dp(14), dp(14), dp(14));

        TextView masterTitle = title("SlidingPaneLayout");
        TextView masterBody = body("Tap a row, then drag the detail pane edge to move between panes.");
        master.addView(masterTitle);
        master.addView(masterBody);

        ScrollView listScroller = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        listScroller.addView(list);
        master.addView(listScroller, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f));

        LinearLayout detail = new LinearLayout(this);
        detail.setOrientation(LinearLayout.VERTICAL);
        detail.setBackgroundColor(Color.rgb(233, 241, 239));
        detail.setPadding(dp(18), dp(18), dp(18), dp(18));

        TextView detailTitle = title("Issue 01");
        TextView detailBody = body("This pane is the slideable detail surface. On narrow screens, AndroidX decides when the panes overlap and the user can swipe between them.");
        TextView slideState = caption("Slide state: idle");
        Button closeButton = actionButton("Close detail pane");
        closeButton.setOnClickListener(view -> pane.closePane());

        detail.addView(detailTitle);
        detail.addView(detailBody);
        detail.addView(closeButton, blockButtonParams());
        detail.addView(slideState);

        for (int i = 1; i <= 12; i++) {
            final int issueNumber = i;
            Button row = actionButton("Issue " + padded(issueNumber) + "  -  drag target");
            row.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            row.setOnClickListener(view -> {
                detailTitle.setText("Issue " + padded(issueNumber));
                detailBody.setText("Selected row " + issueNumber
                        + ". The call to openPane() mirrors the list-detail pattern, while direct touch still owns the drag and release gesture.");
                slideState.setText("Slide state: opening detail from row " + issueNumber);
                pane.openPane();
            });
            list.addView(row, blockButtonParams());
        }

        pane.addPanelSlideListener(new SlidingPaneLayout.PanelSlideListener() {
            @Override
            public void onPanelSlide(@NonNull View panel, float slideOffset) {
                slideState.setText("Slide offset: " + Math.round(slideOffset * 100f) + "%");
            }

            @Override
            public void onPanelOpened(@NonNull View panel) {
                slideState.setText("Slide state: open");
            }

            @Override
            public void onPanelClosed(@NonNull View panel) {
                slideState.setText("Slide state: closed");
            }
        });

        pane.addView(master, new SlidingPaneLayout.LayoutParams(
                dp(312),
                ViewGroup.LayoutParams.MATCH_PARENT));
        pane.addView(detail, new SlidingPaneLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        return pane;
    }

    private View buildViewPagerDemo() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(COLOR_SURFACE);

        TextView status = caption("ViewPager2: page 1 of 5");
        status.setPadding(dp(14), dp(10), dp(14), dp(6));
        root.addView(status);

        ViewPager2 pager = new ViewPager2(this);
        pager.setAdapter(new ColorPagerAdapter());
        pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {
            @Override
            public void onPageSelected(int position) {
                status.setText("ViewPager2: page " + (position + 1) + " of 5");
            }
        });
        root.addView(pager, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f));

        LinearLayout controls = controlBar();
        Button previous = actionButton("Previous");
        Button next = actionButton("Next");
        Button orientation = actionButton("Vertical");
        Button input = actionButton("Disable input");

        previous.setOnClickListener(view -> pager.setCurrentItem(
                Math.max(0, pager.getCurrentItem() - 1),
                true));
        next.setOnClickListener(view -> pager.setCurrentItem(
                Math.min(4, pager.getCurrentItem() + 1),
                true));
        orientation.setOnClickListener(view -> {
            boolean nextVertical = pager.getOrientation() == ViewPager2.ORIENTATION_HORIZONTAL;
            pager.setOrientation(nextVertical
                    ? ViewPager2.ORIENTATION_VERTICAL
                    : ViewPager2.ORIENTATION_HORIZONTAL);
            orientation.setText(nextVertical ? "Horizontal" : "Vertical");
        });
        input.setOnClickListener(view -> {
            boolean enabled = !pager.isUserInputEnabled();
            pager.setUserInputEnabled(enabled);
            input.setText(enabled ? "Disable input" : "Enable input");
        });

        controls.addView(previous, evenControlParams());
        controls.addView(next, evenControlParams());
        controls.addView(orientation, evenControlParams());
        controls.addView(input, evenControlParams());
        root.addView(controls);

        return root;
    }

    private View buildPagedViewDemo() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(COLOR_SURFACE);

        TextView status = caption("PagedView: page 1 of 5");
        status.setPadding(dp(14), dp(10), dp(14), dp(6));
        root.addView(status);

        PagedDeckView deck = new PagedDeckView(this);
        deck.setOnPageChangeListener(page ->
                status.setText("PagedView: page " + (page + 1) + " of 5"));
        for (int i = 0; i < 5; i++) {
            deck.addView(pageCard(
                    "Custom page " + (i + 1),
                    "This local ViewGroup mirrors the Launcher3 pattern: intercept after touch slop, track velocity, then snap.",
                    ColorPagerAdapter.COLORS[i]));
        }
        root.addView(deck, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f));

        LinearLayout controls = controlBar();
        Button previous = actionButton("Previous");
        Button next = actionButton("Next");
        Button reset = actionButton("Reset");
        previous.setOnClickListener(view -> deck.setCurrentPage(deck.getCurrentPage() - 1, true));
        next.setOnClickListener(view -> deck.setCurrentPage(deck.getCurrentPage() + 1, true));
        reset.setOnClickListener(view -> deck.setCurrentPage(0, true));
        controls.addView(previous, evenControlParams());
        controls.addView(next, evenControlParams());
        controls.addView(reset, evenControlParams());
        root.addView(controls);

        return root;
    }

    private View pageCard(String heading, String description, int color) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(dp(28), dp(28), dp(28), dp(28));
        card.setBackgroundColor(color);

        TextView title = title(heading);
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        TextView body = body(description);
        body.setGravity(Gravity.CENTER);
        body.setTextSize(16);
        body.setMaxWidth(dp(360));

        card.addView(title);
        card.addView(body);
        return card;
    }

    private LinearLayout controlBar() {
        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setPadding(dp(8), dp(8), dp(8), dp(8));
        controls.setBackgroundColor(COLOR_PANEL);
        return controls;
    }

    private Button actionButton(String text) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(text);
        button.setTextColor(COLOR_INK);
        button.setTextSize(13);
        button.setMinHeight(dp(44));
        button.setBackground(makeRect(COLOR_PANEL, COLOR_LINE));
        return button;
    }

    private TextView title(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(COLOR_INK);
        view.setTextSize(22);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setPadding(0, 0, 0, dp(8));
        return view;
    }

    private TextView body(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(COLOR_MUTED);
        view.setTextSize(15);
        view.setLineSpacing(0f, 1.12f);
        view.setPadding(0, 0, 0, dp(14));
        return view;
    }

    private TextView caption(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(COLOR_MUTED);
        view.setTextSize(13);
        return view;
    }

    private LinearLayout.LayoutParams blockButtonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(6), 0, dp(6));
        return params;
    }

    private LinearLayout.LayoutParams evenControlParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f);
        params.setMargins(dp(4), 0, dp(4), 0);
        return params;
    }

    private GradientDrawable makeRect(int fill, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setColor(fill);
        drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private String padded(int value) {
        return value < 10 ? "0" + value : String.valueOf(value);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private enum Demo {
        SLIDING_PANE("SlidingPane"),
        VIEW_PAGER("ViewPager2"),
        PAGED_VIEW("PagedView");

        final String title;

        Demo(String title) {
            this.title = title;
        }
    }

    private static final class ColorPagerAdapter extends RecyclerView.Adapter<ColorPageHolder> {
        static final int[] COLORS = {
                Color.rgb(228, 238, 234),
                Color.rgb(236, 230, 217),
                Color.rgb(222, 234, 246),
                Color.rgb(241, 224, 222),
                Color.rgb(226, 229, 238)
        };

        @NonNull
        @Override
        public ColorPageHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            LinearLayout page = new LinearLayout(parent.getContext());
            page.setOrientation(LinearLayout.VERTICAL);
            page.setGravity(Gravity.CENTER);
            page.setPadding(36, 36, 36, 36);
            page.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

            TextView title = new TextView(parent.getContext());
            title.setTextColor(COLOR_INK);
            title.setTextSize(30);
            title.setTypeface(Typeface.DEFAULT_BOLD);
            title.setGravity(Gravity.CENTER);
            title.setPadding(0, 0, 0, 18);

            TextView body = new TextView(parent.getContext());
            body.setTextColor(COLOR_MUTED);
            body.setTextSize(16);
            body.setGravity(Gravity.CENTER);
            body.setMaxWidth(720);

            page.addView(title);
            page.addView(body);
            return new ColorPageHolder(page, title, body);
        }

        @Override
        public void onBindViewHolder(@NonNull ColorPageHolder holder, int position) {
            holder.itemView.setBackgroundColor(COLORS[position]);
            holder.title.setText("ViewPager2 page " + (position + 1));
            holder.body.setText("Swipe, fling, or use the buttons. ViewPager2 delegates touch input to RecyclerView and snaps each page into place.");
        }

        @Override
        public int getItemCount() {
            return COLORS.length;
        }
    }

    private static final class ColorPageHolder extends RecyclerView.ViewHolder {
        final TextView title;
        final TextView body;

        ColorPageHolder(@NonNull View itemView, TextView title, TextView body) {
            super(itemView);
            this.title = title;
            this.body = body;
        }
    }

    /**
     * Minimal Launcher3-style pager: own the drag only after horizontal touch slop, then settle
     * from either fling velocity or distance moved so child views keep normal taps.
     */
    private static final class PagedDeckView extends ViewGroup {
        private final OverScroller scroller;
        private final int touchSlop;
        private final int minFlingVelocity;
        private final int maxFlingVelocity;
        private VelocityTracker velocityTracker;
        private boolean isBeingDragged;
        private int activePointerId = INVALID_POINTER;
        private float downX;
        private float downY;
        private float lastMotionX;
        private int currentPage;
        private OnPageChangeListener pageChangeListener;

        PagedDeckView(Activity activity) {
            super(activity);
            ViewConfiguration config = ViewConfiguration.get(activity);
            scroller = new OverScroller(activity);
            touchSlop = config.getScaledPagingTouchSlop();
            minFlingVelocity = config.getScaledMinimumFlingVelocity();
            maxFlingVelocity = config.getScaledMaximumFlingVelocity();
            setFocusable(true);
        }

        int getCurrentPage() {
            return currentPage;
        }

        void setOnPageChangeListener(OnPageChangeListener listener) {
            pageChangeListener = listener;
        }

        void setCurrentPage(int page, boolean animate) {
            int target = clampPage(page);
            if (animate) {
                smoothScrollToPage(target);
            } else {
                updateCurrentPage(target);
                scrollTo(target * getWidth(), 0);
            }
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int width = MeasureSpec.getSize(widthMeasureSpec);
            int height = MeasureSpec.getSize(heightMeasureSpec);
            setMeasuredDimension(width, height);
            int childWidthSpec = MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY);
            int childHeightSpec = MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY);
            for (int i = 0; i < getChildCount(); i++) {
                getChildAt(i).measure(childWidthSpec, childHeightSpec);
            }
        }

        @Override
        protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
            int childLeft = 0;
            int childWidth = getWidth();
            for (int i = 0; i < getChildCount(); i++) {
                View child = getChildAt(i);
                child.layout(childLeft, 0, childLeft + childWidth, getHeight());
                childLeft += childWidth;
            }
            if (changed) {
                scrollTo(currentPage * childWidth, 0);
            }
        }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent ev) {
            int action = ev.getActionMasked();
            if (action == MotionEvent.ACTION_CANCEL || action == MotionEvent.ACTION_UP) {
                endDrag();
                return false;
            }
            if (action != MotionEvent.ACTION_DOWN && isBeingDragged) {
                return true;
            }

            switch (action) {
                case MotionEvent.ACTION_DOWN:
                    beginGesture(ev);
                    isBeingDragged = !scroller.isFinished();
                    if (isBeingDragged) {
                        scroller.abortAnimation();
                    }
                    break;
                case MotionEvent.ACTION_MOVE:
                    if (activePointerId == INVALID_POINTER) {
                        break;
                    }
                    int pointerIndex = ev.findPointerIndex(activePointerId);
                    if (pointerIndex == -1) {
                        break;
                    }
                    float x = ev.getX(pointerIndex);
                    float y = ev.getY(pointerIndex);
                    float dx = x - downX;
                    float dy = y - downY;
                    if (Math.abs(dx) > touchSlop && Math.abs(dx) > Math.abs(dy)) {
                        isBeingDragged = true;
                        lastMotionX = x;
                        getParent().requestDisallowInterceptTouchEvent(true);
                    }
                    break;
                case MotionEvent.ACTION_POINTER_UP:
                    onSecondaryPointerUp(ev);
                    break;
                default:
                    break;
            }
            return isBeingDragged;
        }

        @SuppressLint("ClickableViewAccessibility")
        @Override
        public boolean onTouchEvent(MotionEvent ev) {
            if (getChildCount() == 0) {
                return false;
            }
            initVelocityTracker();
            velocityTracker.addMovement(ev);

            switch (ev.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (!scroller.isFinished()) {
                        scroller.abortAnimation();
                    }
                    beginGesture(ev);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    if (activePointerId == INVALID_POINTER) {
                        return true;
                    }
                    int pointerIndex = ev.findPointerIndex(activePointerId);
                    if (pointerIndex == -1) {
                        return true;
                    }
                    float x = ev.getX(pointerIndex);
                    if (!isBeingDragged) {
                        float dx = x - downX;
                        float dy = ev.getY(pointerIndex) - downY;
                        if (Math.abs(dx) > touchSlop && Math.abs(dx) > Math.abs(dy)) {
                            isBeingDragged = true;
                            lastMotionX = x;
                            getParent().requestDisallowInterceptTouchEvent(true);
                        }
                    }
                    if (isBeingDragged) {
                        float delta = lastMotionX - x;
                        lastMotionX = x;
                        scrollTo(clampScroll(Math.round(getScrollX() + delta)), 0);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                    if (isBeingDragged) {
                        settleFromTouch(ev);
                    }
                    endDrag();
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    if (isBeingDragged) {
                        smoothScrollToPage(nearestPage());
                    }
                    endDrag();
                    return true;
                case MotionEvent.ACTION_POINTER_UP:
                    onSecondaryPointerUp(ev);
                    return true;
                default:
                    return true;
            }
        }

        @Override
        public void computeScroll() {
            if (scroller.computeScrollOffset()) {
                scrollTo(scroller.getCurrX(), scroller.getCurrY());
                postInvalidateOnAnimation();
            } else if (!isBeingDragged) {
                updateCurrentPage(nearestPage());
            }
        }

        @Override
        public boolean canScrollHorizontally(int direction) {
            if (direction < 0) {
                return getScrollX() > 0;
            }
            if (direction > 0) {
                return getScrollX() < maxScroll();
            }
            return false;
        }

        private void beginGesture(MotionEvent ev) {
            downX = ev.getX();
            downY = ev.getY();
            lastMotionX = downX;
            activePointerId = ev.getPointerId(0);
            initVelocityTracker();
            velocityTracker.addMovement(ev);
        }

        private void settleFromTouch(MotionEvent ev) {
            int pointerIndex = ev.findPointerIndex(activePointerId);
            if (pointerIndex == -1) {
                smoothScrollToPage(nearestPage());
                return;
            }
            velocityTracker.computeCurrentVelocity(1000, maxFlingVelocity);
            float xVelocity = velocityTracker.getXVelocity(activePointerId);
            float yVelocity = velocityTracker.getYVelocity(activePointerId);
            float deltaX = ev.getX(pointerIndex) - downX;
            int target = currentPage;
            boolean fling = Math.abs(xVelocity) > minFlingVelocity
                    && Math.abs(xVelocity) > Math.abs(yVelocity);
            if (fling) {
                target += xVelocity < 0 ? 1 : -1;
            } else if (Math.abs(deltaX) > getWidth() * 0.4f) {
                target += deltaX < 0 ? 1 : -1;
            } else {
                target = nearestPage();
            }
            smoothScrollToPage(target);
        }

        private void smoothScrollToPage(int page) {
            int target = clampPage(page);
            int startX = getScrollX();
            int dx = target * getWidth() - startX;
            int duration = Math.min(520, 180 + Math.abs(dx) / Math.max(1, getWidth()) * 240);
            updateCurrentPage(target);
            scroller.startScroll(startX, 0, dx, 0, duration);
            postInvalidateOnAnimation();
        }

        private int nearestPage() {
            int width = Math.max(1, getWidth());
            return clampPage((getScrollX() + width / 2) / width);
        }

        private int clampPage(int page) {
            return Math.max(0, Math.min(page, Math.max(0, getChildCount() - 1)));
        }

        private int clampScroll(int scrollX) {
            return Math.max(0, Math.min(scrollX, maxScroll()));
        }

        private int maxScroll() {
            return Math.max(0, (getChildCount() - 1) * getWidth());
        }

        private void updateCurrentPage(int page) {
            int target = clampPage(page);
            if (target == currentPage) {
                return;
            }
            currentPage = target;
            if (pageChangeListener != null) {
                pageChangeListener.onPageChanged(target);
            }
        }

        private void initVelocityTracker() {
            if (velocityTracker == null) {
                velocityTracker = VelocityTracker.obtain();
            }
        }

        private void endDrag() {
            isBeingDragged = false;
            activePointerId = INVALID_POINTER;
            if (velocityTracker != null) {
                velocityTracker.recycle();
                velocityTracker = null;
            }
        }

        private void onSecondaryPointerUp(MotionEvent ev) {
            int pointerIndex = ev.getActionIndex();
            int pointerId = ev.getPointerId(pointerIndex);
            if (pointerId != activePointerId) {
                return;
            }
            int newPointerIndex = pointerIndex == 0 ? 1 : 0;
            if (newPointerIndex >= ev.getPointerCount()) {
                activePointerId = INVALID_POINTER;
                return;
            }
            lastMotionX = ev.getX(newPointerIndex);
            downX = lastMotionX;
            downY = ev.getY(newPointerIndex);
            activePointerId = ev.getPointerId(newPointerIndex);
            if (velocityTracker != null) {
                velocityTracker.clear();
            }
        }
    }

    private interface OnPageChangeListener {
        void onPageChanged(int page);
    }
}
