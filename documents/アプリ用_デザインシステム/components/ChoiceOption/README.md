# ChoiceOption

四肢択一の選択肢1つ。問題文（`question` スタイル）の下に4つ縦に並べ、`space-3` 空ける。

- 消費側が渡すもの：`choiceKey`（ア・イ・ウ・エ）、`children`（選択肢の文）、`state`、`onClick`。
- `state`：`idle` 未選択、`selected` 解答前に選んだもの（`teal` の枠）、`correct` 正解（`correct` の青、「○ 正解」）、`wrong` 選んで外れたもの（`wrong` の橙、「× 不正解」）、`dim` 判定後のそれ以外。
- 正誤は色だけで伝えず、必ず ○×と文字を出す（部品が自動で付ける）。正解と不正解は青と橙で、明度ではなく色相と記号で見分ける。
- 判定後（`correct` / `wrong` / `dim`）は押せなくなる。解説は下に `PartnerBubble` で続ける。

<p></p>
