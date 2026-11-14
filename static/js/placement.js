// Tag placement on the photo (UI-17, UI-18, UI-19). Pure and deterministic: the same frame and items always give
// the same placements. All values are CSS px in the frame's coordinates.

const INSET = 8;              // tags stay this far inside the frame
const TAG_GAP = 8;            // and at least this far from each other
const MIN_LEADER = 12;        // a shorter gap gets no leader
const CORNER_SHARE = 0.25;    // the inside corner is allowed when the tag covers at most this share of its box
const COVER_LIMIT = 0.2;      // a tag may cover at most this share of another box
const BADGE_ONLY_FROM = 4;    // findings 5 and later are always badges
const FORMS = ["full", "short", "badge"];

// items: [{id, box: {x, y, w, h}, sizes: {full, short, badge}: {w, h}}] in card order.
// Returns [{id, form, x, y, side, leader: {points: [[x, y], …]} | null}].
export function placeTags(frame, items, opts = {}) {
  const leaderLength = opts.leader ?? (frame.w < 600 ? 16 : 24);
  const placed = [];
  return items.map((item, index) => {
    const others = items.filter((other) => other !== item).map((other) => other.box);
    const forms = index >= BADGE_ONLY_FROM ? ["badge"] : FORMS;
    let choice = null;
    for (const form of forms) {
      choice = bestCandidate(frame, item.box, item.sizes[form], others, placed, leaderLength);
      if (choice) {
        choice.form = form;
        break;
      }
    }
    choice ??= insideFallback(frame, item.box, item.sizes.badge);
    placed.push(choice);
    return { id: item.id, form: choice.form, x: choice.rect.x, y: choice.rect.y, side: choice.side,
      leader: choice.leader };
  });
}

function bestCandidate(frame, box, size, others, placed, leaderLength) {
  let best = null;
  for (const { side, x, y } of candidates(frame, box, size, leaderLength)) {
    const rect = { x, y, w: size.w, h: size.h };
    if (!insideInset(rect, frame)) continue;
    if (side !== "inside" && overlap(rect, box) > 0) continue;
    if (placed.some((p) => separation(rect, p.rect) < TAG_GAP)) continue;
    if (others.some((other) => overlap(rect, other) > COVER_LIMIT * area(other))) continue;
    const leader = leaderFor(side, box, rect);
    if (leader && placed.some((p) => crosses(leader.points, p.rect))) continue;
    if (placed.some((p) => p.leader && crosses(p.leader.points, rect))) continue;
    const cost = others.reduce((sum, other) => sum + overlap(rect, other), 0);
    if (!best || cost < best.cost) best = { side, rect, leader, cost };   // ties keep the earlier candidate
  }
  return best;
}

// Right, left, above, below: a leader length out, aligned to the box edge and slid along it to stay inside the
// frame. Then the inside top-left corner, when the tag covers little of the box.
function candidates(frame, box, size, leaderLength) {
  const alongX = clamp(box.x, INSET, frame.w - INSET - size.w);
  const alongY = clamp(box.y, INSET, frame.h - INSET - size.h);
  const out = [
    { side: "right", x: box.x + box.w + leaderLength, y: alongY },
    { side: "left", x: box.x - leaderLength - size.w, y: alongY },
    { side: "above", x: alongX, y: box.y - leaderLength - size.h },
    { side: "below", x: alongX, y: box.y + box.h + leaderLength },
  ];
  if (size.w * size.h <= CORNER_SHARE * area(box)) out.push({ side: "inside", x: box.x + INSET, y: box.y + INSET });
  return out;
}

// Nothing fitted: the badge sits inside the box's top-left corner, kept within the frame (R18).
function insideFallback(frame, box, badge) {
  const rect = {
    x: clamp(box.x + INSET, INSET, frame.w - INSET - badge.w),
    y: clamp(box.y + INSET, INSET, frame.h - INSET - badge.h),
    w: badge.w,
    h: badge.h,
  };
  return { form: "badge", side: "inside", rect, leader: null };
}

// From a point on the box border to the nearest tag edge: horizontal for right and left, vertical for above and
// below. A tag slid clear of the box's span gets one 90° bend, leaving from the box corner nearest it.
function leaderFor(side, box, tag) {
  if (side === "inside") return null;
  const horizontal = side === "right" || side === "left";
  const [a, b] = horizontal ? ["x", "y"] : ["y", "x"];
  const [aSize, bSize] = horizontal ? ["w", "h"] : ["h", "w"];
  const after = side === "right" || side === "below";
  const boxEdge = after ? box[a] + box[aSize] : box[a];
  const tagEdge = after ? tag[a] : tag[a] + tag[aSize];
  if (Math.abs(tagEdge - boxEdge) < MIN_LEADER) return null;
  const point = (along, across) => (horizontal ? [along, across] : [across, along]);

  const lo = Math.max(box[b], tag[b]);
  const hi = Math.min(box[b] + box[bSize], tag[b] + tag[bSize]);
  if (lo <= hi) {
    const mid = (lo + hi) / 2;
    return { points: [point(boxEdge, mid), point(tagEdge, mid)] };
  }
  const tagFurther = tag[b] > box[b] + box[bSize];
  const start = tagFurther ? box[b] + box[bSize] : box[b];
  const turn = tag[a] + tag[aSize] / 2;
  const tagEdgeAcross = tagFurther ? tag[b] : tag[b] + tag[bSize];
  return { points: [point(boxEdge, start), point(turn, start), point(turn, tagEdgeAcross)] };
}

function crosses(points, rect) {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const seg = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    const insideX = seg.x < rect.x + rect.w && seg.x + seg.w > rect.x;
    const insideY = seg.y < rect.y + rect.h && seg.y + seg.h > rect.y;
    const edgeX = seg.w === 0 ? seg.x > rect.x && seg.x < rect.x + rect.w : insideX;
    const edgeY = seg.h === 0 ? seg.y > rect.y && seg.y < rect.y + rect.h : insideY;
    if (edgeX && edgeY) return true;
  }
  return false;
}

function insideInset(rect, frame) {
  return rect.x >= INSET && rect.y >= INSET && rect.x + rect.w <= frame.w - INSET && rect.y + rect.h <= frame.h - INSET;
}

function separation(a, b) {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(dx, dy);
}

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const area = (r) => r.w * r.h;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
