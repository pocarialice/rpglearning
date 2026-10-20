/* @ds-bundle: {"format":4,"namespace":"Guild","components":[{"name":"Button"},{"name":"ExpBar"},{"name":"QuestCard"},{"name":"ChoiceOption"},{"name":"PartnerBubble"},{"name":"ScoreMeter"},{"name":"ReviewStage"},{"name":"RankingRow"},{"name":"GuildBadge"}]} */
(function () {
  var React = window.React, h = React.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }
  function pct(v, max) { if (!max) return 0; return Math.max(0, Math.min(100, (v / max) * 100)); }
  function omit(o, keys) { var r = {}; for (var k in o) if (keys.indexOf(k) < 0) r[k] = o[k]; return r; }

  function Button(p) {
    var variant = p.variant || "secondary";
    var rest = omit(p, ["variant", "size", "block", "className", "children"]);
    return h("button", Object.assign({ type: "button" }, rest, {
      className: cx("gd-btn", "gd-btn-" + variant, p.size === "sm" && "gd-btn-sm", p.block && "gd-btn-block", p.className)
    }), p.children);
  }

  function ExpBar(p) {
    var exp = p.exp || 0, next = p.next || 1;
    return h("div", { className: "gd-exp", role: "group", "aria-label": "レベル" + p.level + "、EXP " + exp + " / " + next },
      h("div", { className: "gd-crest" }, h("small", null, "Lv"), h("b", null, p.level)),
      h("div", { className: "gd-exp-main" },
        h("div", { className: "gd-exp-head" },
          h("span", null, "EXP " + exp + " / " + next),
          p.gain ? h("span", { className: "gd-exp-gain" }, "+" + p.gain + " EXP") : (p.title ? h("span", null, p.title) : null)),
        h("div", { className: "gd-track" }, h("div", { className: "gd-fill", style: { width: pct(exp, next) + "%" } }))));
  }

  function QuestCard(p) {
    var cur = p.current || 0, tgt = p.target || 1, done = p.done || cur >= tgt;
    return h("div", { className: cx("gd-card", "gd-quest", done && "gd-quest-done") },
      h("div", { className: "gd-quest-body" },
        h("p", { className: "gd-quest-title" }, p.title),
        h("div", { className: "gd-quest-meta" },
          h("span", { className: "gd-quest-reward" }, "報酬 " + p.reward + " EXP"),
          h("span", null, done ? "達成済み" : cur + " / " + tgt)),
        done ? null : h("div", { className: "gd-track" }, h("div", { className: "gd-fill", style: { width: pct(cur, tgt) + "%" } }))),
      done ? h("span", { className: "gd-stamp" }, "達成") : null);
  }

  var MARK = { correct: "○ 正解", wrong: "× 不正解" };
  function ChoiceOption(p) {
    var state = p.state || "idle";
    var rest = omit(p, ["choiceKey", "state", "className", "children"]);
    var locked = state === "correct" || state === "wrong" || state === "dim";
    return h("button", Object.assign({ type: "button", "aria-pressed": state === "selected", disabled: locked || undefined }, rest, {
      className: cx("gd-choice", state !== "idle" && "gd-choice-" + state, p.className)
    }),
      h("span", { className: "gd-choice-key" }, p.choiceKey),
      h("span", { className: "gd-choice-text" }, p.children),
      MARK[state] ? h("span", { className: "gd-choice-mark" }, MARK[state]) : null);
  }

  var PERSONA = { encourage: "励まし型", logic: "論理型", rival: "ライバル型" };
  function PartnerBubble(p) {
    var persona = p.persona || "encourage";
    return h("div", { className: "gd-partner" },
      h("div", { className: cx("gd-sigil", "gd-sigil-" + persona), "aria-hidden": "true" }, p.sigil || (p.name || "?").charAt(0)),
      h("div", { className: "gd-bubble", "aria-live": "polite" },
        h("div", { className: "gd-bubble-name" }, p.name, h("span", null, PERSONA[persona])),
        p.thinking
          ? h("div", { className: "gd-dots", role: "status", "aria-label": "採点中" }, h("i"), h("i"), h("i"))
          : h("div", null, p.children)));
  }

  function ScoreMeter(p) {
    var s = Math.max(0, Math.min(100, p.score || 0)), pass = p.pass == null ? 60 : p.pass, ok = s >= pass;
    return h("div", { className: "gd-score" },
      h("div", { className: "gd-score-head" },
        h("span", { className: "gd-score-num" }, s, h("small", null, "点")),
        h("span", { className: cx("gd-verdict", ok ? "gd-verdict-pass" : "gd-verdict-near") }, ok ? "○ 合格" : "あと" + (pass - s) + "点")),
      h("div", { className: "gd-track", role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": s },
        h("div", { className: cx("gd-fill", ok ? "gd-score-fill-pass" : "gd-score-fill-near"), style: { width: s + "%" } }),
        h("span", { className: "gd-tick", style: { left: "calc(" + pass + "% - 1px)" } }),
        h("span", { className: "gd-tick-label", style: { left: pass + "%" } }, "合格 " + pass)),
      p.children ? h("div", { className: "gd-score-foot" }, p.children) : null);
  }

  var STEPS = ["1日", "3日", "7日", "14日", "30日"];
  function ReviewStage(p) {
    var st = p.stage || 0;
    var label = st === 0 ? "未学習" : st >= 6 ? "" : "段階" + st;
    return h("div", { className: "gd-review" },
      h("span", { className: "gd-review-kind" }, p.kind || "択一"),
      h("div", { className: "gd-pips", "aria-label": st >= 6 ? "習得済み" : label },
        STEPS.map(function (t, i) {
          var n = i + 1;
          return h("span", { key: t, className: cx("gd-pip", (st >= 6 || n < st) && "gd-pip-on", n === st && st < 6 && "gd-pip-now") }, t);
        })),
      st >= 6 ? h("span", { className: "gd-mastered" }, "習得") : h("span", { className: "gd-review-state" }, label));
  }

  function RankingRow(p) {
    var r = p.rank;
    return h("div", { className: cx("gd-rank", p.isMe && "gd-rank-me"), "aria-current": p.isMe ? "true" : undefined },
      h("span", { className: cx("gd-rank-pos", r <= 3 && "gd-rank-" + r) }, r),
      h("span", { className: "gd-rank-name" }, p.name, p.isMe ? h("small", null, "あなた") : (p.level ? h("small", null, "Lv." + p.level) : null)),
      h("span", { className: "gd-rank-exp" }, p.exp, h("small", null, "EXP")));
  }

  var GLYPH = { mastery: "習", coverage: "網", explain: "説", streak: "継", review: "復" };
  function GuildBadge(p) {
    var tier = p.locked ? "locked" : (p.tier || "bronze");
    return h("div", { className: "gd-badge" },
      h("div", { className: cx("gd-emblem", "gd-emblem-" + tier), "aria-hidden": "true" }, GLYPH[p.category] || "?"),
      h("div", { className: "gd-badge-name" }, p.title),
      h("div", { className: "gd-badge-date" }, p.locked ? "未獲得" : (p.date || "")));
  }

  window.Guild = Object.assign(window.Guild || {}, {
    Button: Button, ExpBar: ExpBar, QuestCard: QuestCard, ChoiceOption: ChoiceOption, PartnerBubble: PartnerBubble,
    ScoreMeter: ScoreMeter, ReviewStage: ReviewStage, RankingRow: RankingRow, GuildBadge: GuildBadge
  });
})();
